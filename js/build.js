/* Cursor build engine. Implements sections 6, 7 and 8 of DESIGN-TOKENS.md. No libraries. */
(function () {
  'use strict';
  const root = document.documentElement;
  const active = root.classList.contains('building');
  const phone = window.innerWidth <= 620;
  const ABORT = { abort: true };

  const COLORS = ['#56e0ff', '#ffd24a', '#ff6bb0', '#9b7bff', '#ffffff'];
  const LABELS = ['Crawl', 'Schema', 'Intent', 'Links', 'Data'];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const emit = (el, name, detail) => el.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));

  const Build = window.Build = {
    active,
    scope() {}, kill() {}, skip() {}, signature() {}, setInspect() {},
    done: !active,
  };

  /* A failed script must never leave content hidden. */
  function reveal() {
    root.classList.remove('building');
    root.classList.add('nobuild');
    document.querySelectorAll('[data-b]').forEach((el) => {
      el.classList.add('b-done');
      el.style.clipPath = '';
      el.getAnimations && el.getAnimations().forEach((a) => a.cancel());
    });
  }
  if (!active) return;
  window.addEventListener('error', (e) => { if (!/ResizeObserver/.test(e.message || '')) { failed = true; reveal(); } });

  let failed = false;
  window.__buildStarted = true;

  const canvas = document.getElementById('cursorCanvas');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    wake();
  }

  const S = {
    now: 0, last: 0, running: false,
    cursors: [], visuals: [], waits: [], jobs: [], rides: [], ridePending: [],
    rideNext: 0, started: false, skipped: false, rulers: 0, rulersOut: false,
    heroBlocks: [], heroDone: false, dockTools: {}, dockOut: phone, inspect: null,
    pickedRole: false,
  };

  /* ---------- Cursor ---------- */
  function makeCursor(i) {
    return {
      i, x: -40, y: -40, vx: 0, vy: 0, color: COLORS[i], label: LABELS[i], rot: 0,
      visible: false, busy: false, target: null, pin: null, working: false,
      tool: 'arrow', toolFrom: 'arrow', toolT: 1, icon: null, maxSpeed: 2100, idleAt: 0, exiting: false,
    };
  }
  function setTool(c, tool) {
    if (c.tool === tool) return;
    c.toolFrom = c.tool; c.tool = tool; c.toolT = 0;
  }
  function enterFor(c, x, y) {
    if (c.visible) return;
    const d = [x, W - x, y, H - y];
    const m = d.indexOf(Math.min.apply(null, d));
    c.x = m === 0 ? -30 : m === 1 ? W + 30 : x;
    c.y = m === 2 ? -30 : m === 3 ? H + 30 : y;
    c.vx = c.vy = 0; c.visible = true; c.exiting = false;
  }

  /* ---------- Waiting primitives, all driven by the single frame loop ---------- */
  function until(job, cond) {
    return new Promise((res, rej) => { S.waits.push({ job, cond, res, rej }); wake(); });
  }
  const sleep = (job, ms) => { const t = S.now + ms; return until(job, () => S.now >= t); };
  function tween(job, ms, fn) {
    const t0 = S.now;
    return until(job, () => {
      const p = ms <= 0 ? 1 : clamp((S.now - t0) / ms, 0, 1);
      fn(p);
      return p >= 1;
    });
  }
  function fly(c, job, pointFn, maxSpeed, timeout) {
    c.pin = null; c.target = pointFn; c.maxSpeed = maxSpeed || 2100;
    const p0 = pointFn(); enterFor(c, p0.x, p0.y);
    const t0 = S.now, limit = timeout || 800;
    return until(job, () => {
      const p = pointFn();
      return Math.hypot(p.x - c.x, p.y - c.y) < 7 || S.now - t0 > limit;
    });
  }
  function later(ms, fn) { const t = S.now + ms; S.waits.push({ job: null, cond: () => S.now >= t, res: fn, rej: fn }); wake(); }

  /* ---------- Visuals ---------- */
  function addVisual(v) {
    v.alpha = 1; v.p = v.p || 0; v.fadeAt = null; v.fadeDur = 0; S.visuals.push(v); wake(); return v;
  }
  function fadeVisual(v, delay, dur) { v.fadeAt = S.now + delay; v.fadeDur = dur; }
  const elRect = (el) => () => el.getBoundingClientRect();
  function tightRect(el) {
    const r = document.createRange();
    r.selectNodeContents(el);
    return () => {
      const b = r.getBoundingClientRect();
      return b.width ? b : el.getBoundingClientRect();
    };
  }

  /* ---------- Text splitting ---------- */
  function split(el) {
    const spans = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((n) => {
      const frag = document.createDocumentFragment();
      const t = n.nodeValue.replace(/\s+/g, ' ');
      for (const chr of t) {
        if (chr === ' ') { frag.appendChild(document.createTextNode(' ')); continue; }
        const s = document.createElement('span');
        s.className = 'ch'; s.textContent = chr; frag.appendChild(s); spans.push(s);
      }
      n.parentNode.replaceChild(frag, n);
    });
    return spans;
  }

  /* ---------- Block state ---------- */
  function on(b) {
    if (b.isOn) return;
    b.isOn = true;
    b.el.classList.add('b-on');
    if (b.el.dataset.event !== undefined) emit(b.el, 'b:on', { instant: false });
  }
  function finish(b, instant) {
    if (b.state === 'done') return;
    b.state = 'done';
    (b.anims || []).forEach((a) => { try { a.cancel(); } catch (_) {} });
    b.anims = [];
    if (b.orig !== undefined) {
      b.el.innerHTML = b.orig; b.orig = undefined;
      if (b.ariaAdded) b.el.removeAttribute('aria-label');
    }
    b.el.querySelectorAll('.hl').forEach((h) => h.classList.add('on'));
    if (b.el.classList.contains('hl')) b.el.classList.add('on');
    b.el.style.clipPath = '';
    b.el.classList.add('b-done');
    if (b.el.dataset.event !== undefined && !b.isOn) emit(b.el, 'b:on', { instant: true });
    b.isOn = true;
    b.el.classList.add('b-on');
    if (b.job && b.job.hero) heroCheck(b);
    wake();
  }
  function appear(b) {
    /* Nothing ever waits: an unclaimed block comes in by itself. */
    if (b.state === 'done') return;
    finish(b, false);
    b.el.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  function animate(b, kf, opts) {
    const a = b.el.animate(kf, Object.assign({ fill: 'both' }, opts));
    (b.anims = b.anims || []).push(a);
    return a;
  }
  function heroCheck(b) {
    const i = S.heroBlocks.indexOf(b);
    if (i < 0) return;
    const done = S.heroBlocks.filter((x) => x.state === 'done').length;
    const pill = document.getElementById('buildPillText');
    if (pill) pill.textContent = 'Building page ' + clamp(Math.max(1, Math.ceil(done / S.heroBlocks.length * 9)), 1, 9) + ' of 9';
    if (done === S.heroBlocks.length && !S.heroDone) onHeroDone();
  }
  function onHeroDone() {
    S.heroDone = true;
    S.rulersOut = true;
    document.getElementById('buildPill').hidden = true;
    later(450, dockAway);
    emit(document.documentElement, 'hero:done', {});
  }
  function dockAway() {
    S.dockOut = true;
    const d = document.getElementById('dock');
    if (d && !d.hidden) { d.classList.add('away'); later(500, () => { d.hidden = true; }); }
  }

  /* ---------- Block runners ---------- */
  async function runText(c, b, sp, job) {
    const el = b.el;
    const large = b.kind === 'head';
    const rectFn = tightRect(el);
    const r0 = rectFn();
    job.started = true;
    await fly(c, job, () => { const r = rectFn(); return { x: r.left - 6, y: r.top - 3 }; });
    setTool(c, 'ibeam');
    const area = Math.sqrt(r0.width * r0.height) * 1.4;
    const dur = clamp(area, 170, 300) / sp;
    const v = addVisual({ job, type: 'box', rect: rectFn, pad: [6, 3], tag: true, handles: true, fill: false });
    c.target = null;
    await tween(job, dur, (p) => {
      v.p = p;
      const r = rectFn();
      c.pin = { x: r.left - 6 + (r.width + 12) * p, y: r.top - 3 + (r.height + 6) * p };
    });
    c.pin = null;
    v.tag = false;
    addVisual({ type: 'ripple', x: c.x, y: c.y, t0: S.now, life: 360, color: '#2f9bff' });

    if (large && !el.getAttribute('aria-label')) {
      el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
      b.ariaAdded = true;
    }
    b.orig = el.innerHTML;
    const spans = split(el);
    const n = spans.length || 1;
    const total = (large ? clamp(n * 40, 260, 560) : clamp(n * 13, 155, 450)) / sp;
    const per = total / n;
    spans.forEach((s, i) => {
      const d = (i * per).toFixed(1);
      s.style.animation = 'chtype 1ms linear ' + d + 'ms both, typecaret ' + Math.max(per * 2, 60).toFixed(0) + 'ms linear ' + d + 'ms';
    });
    on(b);
    later(total + 40, () => {
      if (b.state !== 'done' && !b.hlPending) finish(b);
    });
    fadeVisual(v, total + 160, 240);

    const hl = el.querySelector('.hl');
    if (hl) {
      b.hlPending = true;
      await sleep(job, total);
      const hlRange = document.createRange();
      hlRange.selectNodeContents(hl);
      const rects = () => Array.from(hlRange.getClientRects()).filter((r) => r.width > 2);
      const first = rects()[0];
      if (first) {
        setTool(c, 'ibeam');
        await fly(c, job, () => { const r = rects()[0] || first; return { x: r.left, y: r.top + r.height / 2 }; }, 2100, 400);
        const sel = addVisual({ job, type: 'select', rects, p: 0 });
        await tween(job, 170 / sp, (p) => {
          sel.p = p;
          const rs = rects(); const last = rs[rs.length - 1] || first;
          c.pin = { x: (rs[0] || first).left + (last.right - (rs[0] || first).left) * p, y: last.top + last.height / 2 };
        });
        c.pin = null;
        fadeVisual(sel, 80, 200);
      }
      b.hlPending = false;
      finish(b);
    } else {
      await sleep(job, 130 / sp);
    }
    setTool(c, 'arrow');
  }

  async function runBtn(c, b, sp, job) {
    const el = b.el;
    job.started = true;
    const r = elRect(el);
    await fly(c, job, () => { const q = r(); return { x: q.left, y: q.bottom + 3 }; });
    setTool(c, 'tape');
    await sleep(job, 60);
    const w = r().width;
    const dur = clamp(w * 1.9, 240, 480) / sp;
    on(b);
    el.style.clipPath = 'inset(-14px 100% -14px -2px)';
    const v = addVisual({ job, type: 'tape', rect: r, p: 0 });
    await tween(job, dur, (p) => {
      v.p = p;
      el.style.clipPath = 'inset(-14px ' + (100 - p * 100) + '% -14px -2px)';
      const q = r();
      c.pin = { x: q.left + q.width * p, y: q.bottom + 3 };
    });
    c.pin = null;
    fadeVisual(v, 0, 220);
    finish(b);
    await sleep(job, 90 / sp);
    setTool(c, 'arrow');
  }

  const WIPES = {
    diag: [{ clipPath: 'polygon(0 0, 0% 0, 0 0%)' }, { clipPath: 'polygon(0 0, 200% 0, 0 200%)' }],
    down: [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }],
    lr: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
    circle: [{ clipPath: 'circle(0% at 100% 100%)' }, { clipPath: 'circle(150% at 100% 100%)' }],
    up: [{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)' }],
  };

  async function runBox(c, b, sp, job) {
    const el = b.el;
    const r = elRect(el);
    const q0 = r();
    const area = q0.width * q0.height;
    job.started = true;
    const wipe = el.dataset.wipe;
    if (area >= 70000 || wipe === 'circle' || b.kind === 'word') {
      await fly(c, job, () => { const q = r(); return { x: q.left, y: q.top }; });
      const v = addVisual({ job, type: 'box', rect: r, tag: true, handles: true, fill: true, guides: el.dataset.guides !== undefined });
      await tween(job, 300 / sp, (p) => {
        v.p = p; const q = r();
        c.pin = { x: q.left + q.width * p, y: q.top + q.height * p };
      });
      c.pin = null;
      v.tag = false;
      fadeVisual(v, 150, 240);
      on(b);
      const dur = (b.kind === 'word' ? 460 : 450) / sp;
      const kf = b.kind === 'word' ? WIPES.up : (WIPES[wipe] || WIPES.down);
      animate(b, kf, { duration: dur, easing: 'cubic-bezier(.2,.9,.25,1)' });
      if (b.kind !== 'word') animate(b, [{ transform: 'scale(.985)' }, { transform: 'none' }], { duration: 450 / sp, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'none' });
      if (wipe === 'lr') {
        const e = addVisual({ job, type: 'edge', rect: r, p: 0 });
        tween(job, dur, (p) => { e.p = p; }).then(() => fadeVisual(e, 0, 140)).catch(() => fadeVisual(e, 0, 80));
      }
      await sleep(job, dur);
    } else if (area >= 6000) {
      await fly(c, job, () => { const q = r(); return { x: q.left, y: q.top }; });
      const v = addVisual({ job, type: 'trace', rect: r, p: 0 });
      await tween(job, 260 / sp, (p) => {
        v.p = p; c.pin = perimeterPoint(r(), p);
      });
      c.pin = null;
      fadeVisual(v, 40, 200);
      on(b);
      animate(b, [{ opacity: 0 }, { opacity: 1 }], { duration: 240 / sp });
      await sleep(job, 240 / sp);
    } else {
      await runSmall(c, b, sp, job);
      return;
    }
    finish(b);
  }

  async function runSmall(c, b, sp, job) {
    const r = elRect(b.el);
    job.started = true;
    await fly(c, job, () => { const q = r(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
    addVisual({ type: 'ripple', x: c.x, y: c.y, t0: S.now, life: 380, color: c.color });
    on(b);
    animate(b, [{ transform: 'scale(.6)' }, { transform: 'scale(1.08)', offset: .7 }, { transform: 'scale(1)' }], { duration: 280 / sp, easing: 'cubic-bezier(.2,.8,.2,1)' });
    await sleep(job, 280 / sp);
    finish(b);
  }

  async function runGroup(c, b, sp, job) {
    const r = elRect(b.el);
    job.started = true;
    await fly(c, job, () => { const q = r(); return { x: q.left, y: q.top }; });
    const v = addVisual({ job, type: 'trace', rect: r, p: 0, faint: true });
    await tween(job, 130 / sp, (p) => { v.p = p; c.pin = perimeterPoint(r(), p); });
    c.pin = null;
    fadeVisual(v, 30, 160);
    on(b);
    const isStats = b.el.dataset.event !== undefined;
    if (isStats) await sleep(job, 1000 / sp);
    finish(b);
  }

  function runItems(b, sp) {
    on(b);
    const kids = Array.from(b.el.children);
    const anim = b.el.dataset.anim || 'pop';
    const defs = {
      pop: { kf: [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.08)', offset: .7 }, { opacity: 1, transform: 'scale(1)' }], d: 420 },
      clip: { kf: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], d: 380 },
      drop: { kf: [{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }], d: 380 },
    };
    const def = defs[anim];
    const targets = anim === 'clip' ? [b.el] : kids;
    let longest = 0;
    targets.forEach((k, i) => {
      const delay = i * 55 / sp;
      const a = k.animate(def.kf, { duration: def.d / sp, delay, fill: 'backwards', easing: 'cubic-bezier(.2,.8,.2,1)' });
      (b.anims = b.anims || []).push(a);
      longest = Math.max(longest, delay + def.d / sp);
    });
    later(longest + 20, () => { b.anims = []; finish(b); });
  }

  function perimeterPoint(q, p) {
    const per = 2 * (q.width + q.height);
    let d = p * per;
    if (d < q.width) return { x: q.left + d, y: q.top };
    d -= q.width;
    if (d < q.height) return { x: q.right, y: q.top + d };
    d -= q.height;
    if (d < q.width) return { x: q.right - d, y: q.bottom };
    d -= q.width;
    return { x: q.left, y: q.bottom - d };
  }

  async function runBlock(c, b, job) {
    const sp = job.speed;
    if (b.state === 'done') return;
    b.state = 'run';
    if (b.kind === 'text' || b.kind === 'head') {
      if (b.el.id === 'heroRole') S.pickedRole = true;
      await runText(c, b, sp, job);
    } else if (b.kind === 'btn') await runBtn(c, b, sp, job);
    else if (b.kind === 'box' || b.kind === 'word') await runBox(c, b, sp, job);
    else if (b.kind === 'small') await runSmall(c, b, sp, job);
    else if (b.kind === 'group') await runGroup(c, b, sp, job);
    else if (b.kind === 'items') { job.started = true; runItems(b, sp); await sleep(job, 55 / sp); }
    else { on(b); finish(b); }
  }

  async function pickUp(c, job) {
    const tool = S.dockTools[job.tool];
    if (!tool || S.dockOut) return;
    const pt = () => { const r = tool.el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    await fly(c, job, pt, 2700, 560);
    tool.el.classList.add('on');
    later(260, () => tool.el.classList.remove('on'));
    c.icon = tool.path;
  }

  async function runJob(job, c) {
    job.state = 'run'; job.claimedAt = S.now; job.started = false; job.cursor = c;
    c.busy = true; c.working = true; c.exiting = false;
    try {
      if (job.tool) await pickUp(c, job);
      for (const b of job.blocks) {
        if (job.dead) throw ABORT;
        await runBlock(c, b, job);
        await sleep(job, 55 / job.speed);
      }
    } catch (e) {
      if (e !== ABORT) console.error(e);
    }
    const dead = job.dead;
    /* Normal completion leaves typing blocks to finish on their own timers. */
    job.blocks.forEach((b) => { if (dead || b.state === 'waiting') finish(b, true); });
    job.state = 'done';
    c.busy = false; c.working = false; c.pin = null; c.target = null; c.icon = null;
    setTool(c, 'arrow');
    c.idleAt = S.now;
    wake();
  }

  /* ---------- Rides: rows animate at once, a cursor draws alongside ---------- */
  function startRide(b) {
    b.state = 'run';
    on(b);
    const el = b.el;
    const type = el.dataset.ride;
    el.classList.add('ride-on');
    const easing = 'cubic-bezier(.16,1,.3,1)';
    if (type === 'tl') {
      animate(b, [{ transform: 'translateX(70px)', opacity: 1 }, { transform: 'none', opacity: 1 }], { duration: 800, easing, fill: 'none' });
      const y = el.querySelector('.tl-y');
      if (y) y.animate([{ transform: 'translateX(60px) scale(1.25)' }, { transform: 'none' }], { duration: 800, easing });
    } else {
      animate(b, [{ opacity: 0, transform: 'translateY(34px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 950, easing, fill: 'none' });
    }
    later(980, () => { el.classList.remove('ride-on'); finish(b); });
    S.ridePending.push({ b, until: S.now + 500 });
  }
  function assignRides() {
    for (let i = S.ridePending.length - 1; i >= 0; i--) {
      const r = S.ridePending[i];
      if (S.now > r.until) { S.ridePending.splice(i, 1); continue; }
      const c = S.cursors.find((x) => !x.busy);
      if (!c) continue;
      S.ridePending.splice(i, 1);
      runRideCursor(c, r.b);
    }
  }
  async function runRideCursor(c, b) {
    const job = { dead: false, rideOf: b };
    c.busy = true; c.working = true; c.exiting = false;
    const r = elRect(b.el);
    try {
      await fly(c, job, () => { const q = r(); return { x: q.left, y: q.top }; }, 2100, 500);
      const v = addVisual({ job, type: 'trace', rect: r, p: 0, faint: true });
      await tween(job, 650, (p) => { v.p = p; c.pin = perimeterPoint(r(), p); });
      fadeVisual(v, 40, 200);
    } catch (e) { if (e !== ABORT) console.error(e); }
    c.pin = null; c.busy = false; c.working = false; c.idleAt = S.now; wake();
  }

  /* ---------- Collecting blocks into jobs ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const j = en.target.__job;
      if (j) { j.visible = en.isIntersecting; if (!en.isIntersecting && j.state === 'run' && !j.hero) j.dead = true; }
      const rb = en.target.__ride;
      if (rb && en.isIntersecting && rb.state === 'waiting') {
        const at = Math.max(S.now, S.rideNext);
        S.rideNext = at + 130;
        rb.state = 'queued';
        const gap = at - S.now;
        later(gap, () => { if (rb.state === 'queued') startRide(rb); });
        io.unobserve(en.target);
      }
    });
    wake();
  }, { rootMargin: '-5% 0px -8% 0px' });

  function collect(scopeEl, speed, front) {
    const map = new Map();
    const jobs = [];
    scopeEl.querySelectorAll('[data-b]').forEach((el) => {
      if (el.__blocked) return;
      el.__blocked = true;
      const kind = el.dataset.b;
      const b = { el, kind, state: 'waiting', isOn: false };
      if (kind === 'ride') { el.__ride = b; S.rides.push(b); io.observe(el); return; }
      const holder = el.closest('[data-job]');
      let job = holder && scopeEl.contains(holder) ? map.get(holder) : null;
      if (!job) {
        const owner = holder && scopeEl.contains(holder) ? holder : el;
        const hero = owner.dataset.hero !== undefined;
        job = {
          el: owner, blocks: [], state: 'waiting', visible: false, dead: false, speed,
          hero, order: hero ? +owner.dataset.hero : 0, tool: phone ? null : owner.dataset.tool || null,
          firstSeen: 0,
        };
        if (holder && scopeEl.contains(holder)) map.set(holder, job);
        jobs.push(job);
        owner.__job = job;
        io.observe(owner);
      }
      b.job = job;
      job.blocks.push(b);
      if (job.hero) S.heroBlocks.push(b);
    });
    if (front) S.jobs = jobs.concat(S.jobs); else S.jobs.push.apply(S.jobs, jobs);
    return jobs;
  }

  function schedule() {
    if (!S.started || S.skipped) return;
    for (const job of S.jobs) {
      if (job.state === 'run') {
        if (!job.started && S.now - job.claimedAt > 1300) job.dead = true;
        continue;
      }
      if (job.state !== 'waiting' || !job.visible) continue;
      if (S.scope && !S.scope.contains(job.el)) continue;
      if (job.hero) {
        /* The stats wait until the role line is picked up. */
        if (job.order === 5 && !S.pickedRole) continue;
      }
      if (!job.firstSeen) job.firstSeen = S.now;
      if (S.now - job.firstSeen > 1800) { job.state = 'done'; job.blocks.forEach(appear); continue; }
      const free = S.cursors.filter((c) => !c.busy);
      if (!free.length) continue;
      const q = job.el.getBoundingClientRect();
      free.sort((a, b) => dist(a, q) - dist(b, q));
      runJob(job, free[0]);
    }
    /* Remove finished jobs so scheduling stays cheap. */
    if (S.jobs.length && S.jobs.every((j) => j.state === 'done') && S.waits.length === 0) S.jobs = [];
  }
  const dist = (c, q) => (c.visible ? Math.hypot(c.x - q.left, c.y - q.top) : 1e4);

  /* ---------- Frame ---------- */
  function wake() {
    if (!S.running) { S.running = true; S.last = performance.now(); requestAnimationFrame(frame); }
  }
  function needsFrame() {
    if (S.waits.length || S.visuals.length || S.inspect) return true;
    if (S.cursors.some((c) => c.visible)) return true;
    if (S.rulers > 0.001 || (!S.rulersOut && S.started)) return true;
    if (S.ridePending.length) return true;
    return S.jobs.some((j) => j.state === 'run' || (j.state === 'waiting' && j.visible));
  }
  function frame(t) {
    if (failed) return;
    const dt = Math.min(0.05, (t - S.last) / 1000);
    S.last = t; S.now = t;

    /* resolve waits */
    for (let i = S.waits.length - 1; i >= 0; i--) {
      const w = S.waits[i];
      if (w.job && w.job.dead) { S.waits.splice(i, 1); w.rej(ABORT); continue; }
      let done = false;
      try { done = w.cond(); } catch (e) { console.error(e); done = true; }
      if (done) { S.waits.splice(i, 1); w.res(); }
    }
    schedule();
    assignRides();
    moveCursors(dt);
    draw();

    if (needsFrame()) requestAnimationFrame(frame);
    else { S.running = false; ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }

  function moveCursors(dt) {
    S.cursors.forEach((c) => {
      if (!c.visible) return;
      if (c.toolT < 1) c.toolT = Math.min(1, c.toolT + dt * 1000 / 110);
      if (!c.busy && S.now - c.idleAt > 260) {
        if (!c.exiting) {
          c.exiting = true;
          const d = [c.x, W - c.x, c.y, H - c.y];
          const m = d.indexOf(Math.min.apply(null, d));
          const ex = { x: m === 0 ? -50 : m === 1 ? W + 50 : c.x, y: m === 2 ? -50 : m === 3 ? H + 50 : c.y };
          c.target = () => ex; c.maxSpeed = 2100;
        }
        if (c.x < -30 || c.x > W + 30 || c.y < -30 || c.y > H + 30) { c.visible = false; c.exiting = false; c.target = null; return; }
      }
      if (c.pin) {
        c.vx = (c.pin.x - c.x) / Math.max(dt, .001) * .4; c.vy = (c.pin.y - c.y) / Math.max(dt, .001) * .4;
        c.x = c.pin.x; c.y = c.pin.y;
      } else if (c.target) {
        const p = c.target();
        let dx = (p.x - c.x) * 8, dy = (p.y - c.y) * 8;
        const sp = Math.hypot(dx, dy), max = c.maxSpeed;
        if (sp > max) { dx *= max / sp; dy *= max / sp; }
        const k = Math.min(1, dt * 14);
        c.vx += (dx - c.vx) * k; c.vy += (dy - c.vy) * k;
        c.x += c.vx * dt; c.y += c.vy * dt;
      } else { c.vx *= .8; c.vy *= .8; }
      const speed = Math.hypot(c.vx, c.vy);
      const wanted = speed > 80 ? Math.atan2(c.vy, c.vx) + Math.PI * .75 : 0;
      let d = wanted - c.rot;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      c.rot += d * Math.min(1, dt * 12);
    });
  }

  /* ---------- Drawing ---------- */
  const BLUE = '#2f9bff';
  function handle(x, y) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = BLUE; ctx.lineWidth = 1;
    ctx.fillRect(x - 3, y - 3, 6, 6); ctx.strokeRect(x - 3, y - 3, 6, 6);
  }
  function sizeTag(x, y, text) {
    ctx.font = '700 10px "Inter Tight",sans-serif';
    const w = ctx.measureText(text).width + 10;
    const px = clamp(x - w, 2, W - w - 2), py = clamp(y + 5, 2, H - 18);
    ctx.fillStyle = '#1a86e8';
    roundRect(px, py, w, 16, 3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, px + 5, py + 8.5);
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawVisual(v) {
    /* Work that was dropped must not leave its box or size tag behind. */
    if (v.fadeAt === null && v.job && (v.job.dead || v.job.state === 'done')) { v.tag = false; fadeVisual(v, 0, 120); }
    if (v.fadeAt !== null && S.now >= v.fadeAt) v.alpha = 1 - clamp((S.now - v.fadeAt) / (v.fadeDur || 1), 0, 1);
    ctx.globalAlpha = v.alpha;
    if (v.type === 'box') {
      const r = v.rect(); const pad = v.pad || [0, 0];
      const x = r.left - pad[0], y = r.top - pad[1];
      const w = (r.width + pad[0] * 2) * v.p, h = (r.height + pad[1] * 2) * v.p;
      if (v.fill) { ctx.fillStyle = 'rgba(47,155,255,.09)'; ctx.fillRect(x, y, w, h); }
      if (v.guides) {
        ctx.strokeStyle = 'rgba(47,155,255,.35)'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); ctx.moveTo(0, y + h + .5); ctx.lineTo(W, y + h + .5);
        ctx.stroke();
      }
      ctx.strokeStyle = BLUE; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w, h);
      handle(x, y); handle(x + w, y); handle(x, y + h); handle(x + w, y + h);
      if (v.tag) sizeTag(x + w, y + h, Math.round(w) + ' × ' + Math.round(h));
    } else if (v.type === 'trace') {
      const q = v.rect();
      ctx.strokeStyle = v.faint ? 'rgba(47,155,255,.45)' : BLUE; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(q.left, q.top);
      const per = 2 * (q.width + q.height); let left = v.p * per;
      const pts = [[q.right, q.top, q.width], [q.right, q.bottom, q.height], [q.left, q.bottom, q.width], [q.left, q.top, q.height]];
      let px = q.left, py = q.top;
      for (const pt of pts) {
        if (left <= 0) break;
        const f = Math.min(1, left / pt[2]);
        ctx.lineTo(px + (pt[0] - px) * f, py + (pt[1] - py) * f);
        left -= pt[2]; px = pt[0]; py = pt[1];
      }
      ctx.stroke();
    } else if (v.type === 'ripple') {
      const p = clamp((S.now - v.t0) / v.life, 0, 1);
      ctx.globalAlpha = (1 - p) * .8; ctx.strokeStyle = v.color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(v.x, v.y, 3 + p * 20, 0, 6.3); ctx.stroke();
      if (p >= 1) v.alpha = 0;
    } else if (v.type === 'select') {
      const rs = v.rects();
      const total = rs.reduce((a, r) => a + r.width, 0); let left = total * v.p;
      ctx.fillStyle = 'rgba(47,155,255,.42)';
      rs.forEach((r) => {
        if (left <= 0) return;
        const w = Math.min(left, r.width);
        ctx.fillRect(r.left, r.top, w, r.height); left -= w;
      });
    } else if (v.type === 'tape') {
      const q = v.rect(); const w = q.width * v.p; const y = q.bottom + 1;
      ctx.fillStyle = '#ffd24a'; ctx.fillRect(q.left, y, w, 9);
      ctx.strokeStyle = '#16120a'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i <= w; i += 5) {
        const l = i % 25 === 0 ? 6 : 3;
        ctx.moveTo(q.left + i + .5, y); ctx.lineTo(q.left + i + .5, y + l);
      }
      ctx.stroke();
      if (w > 4) sizeTag(q.left + w + 44, y + 8, Math.round(w) + ' px');
    } else if (v.type === 'edge') {
      const q = v.rect(); const x = q.left + q.width * v.p;
      const g = ctx.createLinearGradient(x - 60, 0, x, 0);
      g.addColorStop(0, 'rgba(229,35,59,0)'); g.addColorStop(1, 'rgba(229,35,59,.35)');
      ctx.fillStyle = g; ctx.fillRect(x - 60, q.top, 60, q.height);
      ctx.fillStyle = '#e5233b'; ctx.fillRect(x - 3, q.top, 3, q.height);
    }
    ctx.globalAlpha = 1;
  }

  const ARROW = new Path2D('M0 0L0 14.2L3.9 10.8L6.5 15.8L9 14.6L6.4 9.7L11.3 9.3Z');
  function drawArrow(c, s) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.scale(s, s);
    ctx.fillStyle = c.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.1;
    ctx.fill(ARROW); ctx.stroke(ARROW); ctx.restore();
  }
  function drawIbeam(c, s) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(s, s);
    const shape = () => { ctx.beginPath(); ctx.moveTo(-4, -9); ctx.lineTo(4, -9); ctx.moveTo(0, -9); ctx.lineTo(0, 9); ctx.moveTo(-4, 9); ctx.lineTo(4, 9); ctx.stroke(); };
    ctx.lineCap = 'round'; ctx.strokeStyle = '#0a0b0e'; ctx.lineWidth = 3.4; shape();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; shape();
    ctx.restore();
  }
  function drawTape(c, s) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(s, s);
    ctx.fillStyle = '#ffd24a'; ctx.strokeStyle = '#16120a'; ctx.lineWidth = 1.2;
    roundRect(-7, -15, 16, 15, 3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(1, -7.5, 3, 0, 6.3); ctx.stroke();
    ctx.restore();
  }
  const TOOLS = { arrow: drawArrow, ibeam: drawIbeam, tape: drawTape };

  function drawCursor(c) {
    if (!c.visible) return;
    if (c.toolT < 1) {
      const p = c.toolT;
      if (p < .5) TOOLS[c.toolFrom](c, 1 - p * 2); else TOOLS[c.tool](c, (p - .5) * 2);
    } else TOOLS[c.tool](c, 1);
    if (c.icon) {
      ctx.save(); ctx.translate(c.x + 12, c.y - 22);
      ctx.fillStyle = '#1a86e8'; roundRect(0, 0, 18, 18, 4); ctx.fill();
      ctx.translate(2, 2); ctx.scale(.7, .7); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.stroke(c.icon); ctx.restore();
    }
    if (c.working) {
      ctx.font = '700 10px "Inter Tight",sans-serif';
      const w = ctx.measureText(c.label).width + 12;
      const x = c.x + 11, y = c.y + 15;
      ctx.fillStyle = c.color; roundRect(x, y, w, 16, 8); ctx.fill();
      ctx.fillStyle = '#0a0b0e'; ctx.textBaseline = 'middle'; ctx.fillText(c.label, x + 6, y + 8.5);
    }
  }
  function drawRulers(dt) {
    if (S.rulersOut) S.rulers = Math.max(0, S.rulers - .03); else if (S.started) S.rulers = Math.min(1, S.rulers + .08);
    if (S.rulers <= 0) return;
    ctx.globalAlpha = S.rulers;
    ctx.fillStyle = 'rgba(13,15,21,.92)'; ctx.fillRect(0, 0, W, 12); ctx.fillRect(0, 0, 12, H);
    ctx.strokeStyle = '#6d7280'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 50; x < W; x += 50) { ctx.moveTo(x + .5, 5); ctx.lineTo(x + .5, 12); }
    for (let y = 50; y < H; y += 50) { ctx.moveTo(5, y + .5); ctx.lineTo(12, y + .5); }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function drawInspect() {
    if (!S.inspect || !S.inspect.isConnected) return;
    const r = S.inspect.getBoundingClientRect();
    ctx.strokeStyle = 'rgba(229,35,59,.4)'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(0, r.top); ctx.lineTo(W, r.top); ctx.moveTo(0, r.bottom); ctx.lineTo(W, r.bottom);
    ctx.moveTo(r.left, 0); ctx.lineTo(r.left, H); ctx.moveTo(r.right, 0); ctx.lineTo(r.right, H); ctx.stroke();
    ctx.strokeStyle = '#e5233b'; ctx.lineWidth = 2; ctx.strokeRect(r.left, r.top, r.width, r.height);
    const text = Math.round(r.width) + ' × ' + Math.round(r.height);
    ctx.font = '700 10px "Inter Tight",sans-serif';
    const w = ctx.measureText(text).width + 10;
    const x = clamp(r.left, 2, W - w - 2), y = clamp(r.top - 20, 2, H - 18);
    ctx.fillStyle = '#e5233b'; roundRect(x, y, w, 16, 3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 5, y + 8.5);
  }
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawRulers();
    for (let i = S.visuals.length - 1; i >= 0; i--) {
      drawVisual(S.visuals[i]);
      if (S.visuals[i].alpha <= 0) S.visuals.splice(i, 1);
    }
    drawInspect();
    S.cursors.forEach(drawCursor);
  }

  /* ---------- Dock ---------- */
  const ICONS = {
    Move: 'M4 3l12 5-5 1.6L9 15z',
    Frame: 'M3 3h14v14H3z',
    Text: 'M4 5V3h12v2M10 3v14M7 17h6',
    Image: 'M3 4h14v12H3zM3 13l4-4 3 3 3-2 4 4',
    Shape: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z',
    Pen: 'M3 17l3-1L16 6l-2-2L4 14zM12 6l2 2',
    Ruler: 'M2 7h16v6H2zM6 7v3M10 7v3M14 7v3',
    Comment: 'M3 4h14v10H9l-4 3v-3H3z',
  };
  function buildDock() {
    const d = document.getElementById('dock');
    if (phone || !d || window.innerHeight < 720) { S.dockOut = true; return; }
    Object.keys(ICONS).forEach((name) => {
      const div = document.createElement('div');
      div.innerHTML = '<svg viewBox="0 0 20 20"><path d="' + ICONS[name] + '"/></svg>' + name;
      d.appendChild(div);
      S.dockTools[name] = { el: div, path: new Path2D(ICONS[name]) };
    });
    d.hidden = false;
  }

  /* ---------- Page start ---------- */
  function skip() {
    S.skipped = true;
    S.rulersOut = true;
    dockAway();
    document.getElementById('buildPill').hidden = true;
    document.getElementById('monogram').classList.remove('on');
    S.jobs.forEach((j) => { j.dead = true; j.state = j.state === 'run' ? 'run' : 'done'; j.blocks.forEach((b) => finish(b, true)); });
    S.rides.forEach((b) => { if (b.state !== 'done') finish(b, true); });
    S.skipped = false;
    S.started = true;
    if (!S.heroDone) { S.heroDone = true; emit(root, 'hero:done', { instant: true }); }
    wake();
  }

  async function start() {
    resize();
    window.addEventListener('resize', resize);
    const count = phone ? 3 : 5;
    for (let i = 0; i < count; i++) S.cursors.push(makeCursor(i));
    buildDock();
    collect(document.body, 1.7);
    S.jobs.forEach((j) => { if (j.hero) j.speed = 1.25; });
    S.jobs.sort((a, b) => (b.hero - a.hero) || (a.order - b.order));

    const pill = document.getElementById('buildPill');
    pill.hidden = false;
    document.getElementById('buildSkip').addEventListener('click', skip);

    /* Scan: cursors orbit the monogram. */
    const mono = document.getElementById('monogram');
    mono.classList.add('on');
    const scan = phone ? 220 : 330;
    const scanJob = { dead: false };
    const cx = W / 2, cy = H / 2;
    const t0 = performance.now();
    S.now = t0;
    S.cursors.forEach((c, i) => {
      const a = (i / count) * Math.PI * 2;
      c.visible = true; c.x = cx + Math.cos(a) * 140; c.y = cy + Math.sin(a) * 140; c.busy = true;
      c.pin = { x: c.x, y: c.y };
    });
    S.rulersOut = false; S.started = false;
    await tween(scanJob, scan, (p) => {
      S.cursors.forEach((c, i) => {
        const a = (i / count) * Math.PI * 2 + p * 2.4;
        c.pin = { x: cx + Math.cos(a) * 70, y: cy + Math.sin(a) * 70 };
      });
    });
    mono.classList.remove('on');
    S.cursors.forEach((c) => { c.pin = null; c.busy = false; c.idleAt = S.now; });
    S.started = true;
    wake();

    /* Backstop: the hero must be finished within a reasonable time. */
    setTimeout(() => { if (!S.heroDone) S.heroBlocks.forEach((b) => appear(b)); }, 9000);
  }

  /* ---------- Public API ---------- */
  Build.skip = skip;
  Build.scope = function (el) {
    /* The modal takes over: page work behind it finishes at once. */
    S.scope = el;
    S.jobs.forEach((j) => { if (j.state === 'run' && !el.contains(j.el)) j.dead = true; });
    collect(el, 1.7, true);
    wake();
  };
  Build.kill = function (el) {
    S.jobs.forEach((j) => { if (el.contains(j.el)) { j.dead = true; if (j.state !== 'run') j.state = 'done'; } });
    if (S.scope === el) S.scope = null;
    wake();
  };
  Build.setInspect = function (el) { S.inspect = el; wake(); };
  /* Footer signature: written left to right, with a cursor when one is free. */
  Build.signature = function (el, ms) {
    const c = S.cursors.find((x) => !x.busy);
    const job = { dead: false };
    const q = el.getBoundingClientRect();
    if (c) { c.busy = true; c.working = true; enterFor(c, q.left, q.top); }
    el.style.clipPath = 'inset(-20% 100% -20% 0)';
    tween(job, ms, (p) => {
      el.style.clipPath = 'inset(-20% ' + (100 - p * 100) + '% -20% 0)';
      if (c) {
        const r = el.getBoundingClientRect();
        c.pin = { x: r.left + r.width * p, y: r.top + r.height * (.55 + Math.sin(p * 34) * .2) };
      }
    }).then(() => {
      el.style.clipPath = '';
      if (c) { c.pin = null; c.busy = false; c.working = false; c.idleAt = S.now; wake(); }
    });
  };
  Build.isHeroDone = () => S.heroDone;

  const ready = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))]) : Promise.resolve();
  ready.then(start).catch((e) => { console.error(e); reveal(); });
})();
