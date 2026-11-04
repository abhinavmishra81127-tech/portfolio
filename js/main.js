/* Interactions from sections 9 and 10 of DESIGN-TOKENS.md. */
(function () {
  'use strict';
  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const root = document.documentElement;
  const still = root.classList.contains('nobuild') && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(hover:hover) and (pointer:fine)').matches && window.innerWidth > 900;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const Build = window.Build;
  const EMAIL = 'abhinavmishra0284@gmail.com';

  /* ---------- Hero layers ---------- */
  const layers = { word: $('#layerWord'), portrait: $('#layerPortrait'), text: $('#layerText'), stats: $('#layerStats') };
  const hero = $('#hero');
  const P = { x: 0, y: 0, tx: 0, ty: 0 };
  function paintHero() {
    const sy = Math.max(0, window.scrollY);
    const s = clamp(sy / window.innerHeight, 0, 1);
    if (s >= 1 && P.painted) return;
    P.painted = s >= 1;
    const wide = window.innerWidth > 900;
    if (still) return;
    layers.word.style.transform = 'translate3d(' + (P.x * -18) + 'px,' + (P.y * -9 + s * 150) + 'px,0)';
    layers.portrait.style.transform = 'translate3d(' + (P.x * 14) + 'px,' + (P.y * 7 + s * 46) + 'px,0)';
    if (wide) {
      layers.text.style.transform = 'translate3d(' + (P.x * -7) + 'px,' + (-s * 90) + 'px,0)';
      layers.text.style.opacity = 1 - s * 1.3;
      layers.stats.style.transform = 'translate3d(0,' + (-s * 130) + 'px,0)';
      layers.stats.style.opacity = 1 - s * 1.3;
    }
  }
  if (fine && !still) {
    let raf = 0;
    const tick = () => {
      P.x += (P.tx - P.x) * .09; P.y += (P.ty - P.y) * .09;
      paintHero();
      raf = Math.abs(P.tx - P.x) + Math.abs(P.ty - P.y) > .001 ? requestAnimationFrame(tick) : 0;
    };
    hero.addEventListener('pointermove', (e) => {
      P.tx = e.clientX / window.innerWidth - .5; P.ty = e.clientY / window.innerHeight - .5;
      P.painted = false;
      if (!raf) raf = requestAnimationFrame(tick);
    });
  }
  root.addEventListener('hero:done', (e) => {
    if (e.detail && e.detail.instant) return;
    const g = $('#heroGlow'); g.classList.add('flash');
    setTimeout(() => g.classList.remove('flash'), 1600);
  });

  /* ---------- Hero stats ---------- */
  const statBtns = $$('.stat');
  const statDetails = $$('.stat-detail');
  const statBar = $('#statBar');
  $$('.notches i').forEach((n, i) => n.style.setProperty('--n', i));
  let statI = -1, statCycle = 0, statTouched = false;
  function pickStat(i) {
    if (statI === i) return;
    statI = i;
    statBtns.forEach((b, k) => b.setAttribute('aria-selected', k === i ? 'true' : 'false'));
    statDetails.forEach((d, k) => d.classList.toggle('on', k === i));
    const b = statBtns[i], row = b.parentNode.getBoundingClientRect(), q = b.getBoundingClientRect();
    statBar.style.width = q.width + 'px';
    statBar.style.transform = 'translateX(' + (q.left - row.left) + 'px)';
  }
  statBtns.forEach((b, i) => {
    const touch = () => { statTouched = true; clearInterval(statCycle); pickStat(i); };
    b.addEventListener('pointerenter', touch); b.addEventListener('focus', touch); b.addEventListener('click', touch);
  });
  const fmt = (n) => n.toLocaleString('en-US');
  function countStats() {
    statBtns.forEach((b, i) => {
      const num = $('.stat-num', b), to = +b.dataset.to, suf = b.dataset.suffix;
      const t0 = performance.now() + i * 80;
      const go = (t) => {
        const p = clamp((t - t0) / 650, 0, 1);
        const e = 1 - Math.pow(1 - p, 3);
        num.textContent = fmt(Math.round(to * e)) + suf;
        if (p < 1) requestAnimationFrame(go);
      };
      num.textContent = '0' + suf;
      requestAnimationFrame(go);
      b.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: i * 80, fill: 'backwards', easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
    $('.stat-rule').animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 400, easing: 'cubic-bezier(.65,0,.35,1)' });
  }
  function startStatCycle() {
    if (statTouched || still) return;
    clearInterval(statCycle);
    statCycle = setInterval(() => {
      if (!statTouched && !document.hidden && window.scrollY < window.innerHeight * .7) pickStat((statI + 1) % statBtns.length);
    }, 3600);
  }
  const statsEl = $('#stats');
  statsEl.addEventListener('b:on', (e) => {
    if (e.detail && e.detail.instant) { pickStat(0); startStatCycle(); return; }
    countStats();
    setTimeout(() => { if (!statTouched) pickStat(0); }, 600);
    startStatCycle();
  });
  if (!Build.active) { pickStat(0); startStatCycle(); }

  /* ---------- Work cards ---------- */
  const DIAGRAMS = {
    qubitron: { i: ['Service offerings', 'Business queries', 'Technical audits'], c: 'Intent-led themes', o: ['Service pages', 'Internal links', 'Dev specs'], cap: 'From offering and query research to pages developers can build.' },
    igaming: { i: ['URL inventory', 'Crawl findings', 'GSC coverage'], c: 'Systemic causes', o: ['Tickets', 'Validated fixes', 'Monitoring'], cap: 'From segmented URLs to fixes validated in crawls and GSC.' },
    qubitpilot: { i: ['Advocate intent', 'CA intent', 'User questions'], c: 'Keyword map', o: ['Landing pages', 'Answer outlines', 'Link pathways'], cap: 'Two professional audiences, one searchable product story.' },
    sequrity: { i: ['Audience', 'Terminology', 'Technical intent'], c: 'Query map', o: ['Landing pages', 'Explainers', 'Expert review'], cap: 'Positioning plan, reviewed by subject-matter experts.' },
    rise: { i: ['Site crawl', 'Product intent', 'Markets'], c: 'Audit priorities', o: ['Metadata', 'Indexation fixes', 'Internal links'], cap: 'From crawl analysis to prioritized product and category work.' },
    techno: { i: ['Commercial intent', 'US SERPs', 'Technical barriers'], c: 'Aligned pages', o: ['Content + schema', 'Supporting pages', 'Monitoring'], cap: 'Service pages aligned with the searcher\'s task.' },
  };
  function diagramSvg(d, accent) {
    const ys = [28, 78, 128];
    let s = '<svg viewBox="0 0 360 156" preserveAspectRatio="xMidYMid meet" aria-hidden="true">';
    const lines = [];
    ys.forEach((y) => lines.push('M104 ' + y + 'C136 ' + y + ' 136 78 150 78'));
    ys.forEach((y) => lines.push('M210 78C224 78 224 ' + y + ' 256 ' + y));
    lines.forEach((p) => { s += '<path d="' + p + '" fill="none" stroke="#343946"/>'; });
    lines.forEach((p, i) => {
      s += '<circle r="2.6" fill="' + accent + '"><animateMotion dur="2.2s" begin="-' + (i * .24 + .1).toFixed(2) + 's" repeatCount="indefinite" path="' + p + '"/></circle>';
    });
    ys.forEach((y, i) => {
      s += '<rect x="4" y="' + (y - 14) + '" width="100" height="28" rx="5" fill="#13161e" stroke="#20242e"/><text x="54" y="' + (y + 4) + '" text-anchor="middle">' + d.i[i] + '</text>';
      s += '<rect x="256" y="' + (y - 14) + '" width="100" height="28" rx="5" fill="#13161e" stroke="#20242e"/><text x="306" y="' + (y + 4) + '" text-anchor="middle">' + d.o[i] + '</text>';
    });
    const words = d.c.split(' ');
    s += '<rect x="150" y="52" width="60" height="52" rx="7" fill="#12151c" stroke="' + accent + '"/>';
    words.forEach((w, i) => { s += '<text class="d-centre" x="180" y="' + (81 + (i - (words.length - 1) / 2) * 13) + '" text-anchor="middle" style="font-size:9.5px">' + w + '</text>'; });
    return s + '</svg>';
  }
  $$('.card').forEach((card) => {
    const d = DIAGRAMS[card.dataset.card];
    const accent = card.style.getPropertyValue('--accent');
    const screen = $('.screen', card);
    let dg = null;
    const show = (v) => {
      if (v && !dg) {
        dg = document.createElement('div');
        dg.className = 'diagram';
        dg.innerHTML = diagramSvg(d, accent) + '<p class="diagram-cap">' + d.cap + '</p>';
        screen.appendChild(dg);
        dg.getBoundingClientRect();
      }
      if (!dg) return;
      dg.classList.toggle('on', v);
      const svg = $('svg', dg);
      if (svg.pauseAnimations) { if (v) svg.unpauseAnimations(); else setTimeout(() => { if (!dg.classList.contains('on')) svg.pauseAnimations(); }, 400); }
    };
    const sys = $('.sys', card);
    sys.addEventListener('click', () => {
      const v = sys.getAttribute('aria-pressed') !== 'true';
      sys.setAttribute('aria-pressed', v ? 'true' : 'false');
      show(v);
    });
    if (fine && !still) {
      screen.addEventListener('pointerenter', () => { if (sys.getAttribute('aria-pressed') !== 'true') show(true); });
      screen.addEventListener('pointerleave', () => { if (sys.getAttribute('aria-pressed') !== 'true') show(false); });
      const glow = $('.card-glow', card);
      let rect = null;
      card.addEventListener('pointerenter', () => { rect = card.getBoundingClientRect(); });
      card.addEventListener('pointermove', (e) => {
        if (!rect) rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        glow.style.background = 'radial-gradient(320px circle at ' + x + 'px ' + y + 'px,' + accent + ',transparent 70%)';
        const rx = (y / rect.height - .5) * -5, ry = (x / rect.width - .5) * 6;
        card.style.transform = 'perspective(1100px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) translateY(-5px)';
      });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; rect = null; });
    }
  });

  /* ---------- Timeline ---------- */
  const tlYear = $('#tlYear'), tlCurrent = $('#tlCurrent'), rows = $$('.tl-row');
  const rail = $('.tl-rail'), railFill = $('#railFill'), railDot = $('#railDot');
  let cols = [];
  function initYear(y) {
    tlYear.innerHTML = '';
    cols = String(y).split('').map((digit, i) => {
      const col = document.createElement('span'); col.className = 'tl-col';
      const inner = document.createElement('span');
      inner.style.transitionDelay = (i * 50) + 'ms';
      for (let n = 0; n < 10; n++) { const b = document.createElement('b'); b.textContent = n; inner.appendChild(b); }
      inner.style.transform = 'translateY(' + (-digit * 10) + '%)';
      col.appendChild(inner); tlYear.appendChild(col);
      return inner;
    });
  }
  initYear(2026);
  let activeRow = -1;
  function setRow(i) {
    if (i === activeRow) return;
    activeRow = i;
    rows.forEach((r, k) => r.classList.toggle('active', k === i));
    const r = rows[i];
    String(r.dataset.year).split('').forEach((d, k) => { cols[k].style.transform = 'translateY(' + (-d * 10) + '%)'; });
    tlCurrent.textContent = r.dataset.org;
  }
  setRow(0);
  function paintTimeline() {
    const mid = window.innerHeight / 2;
    const rr = rail.getBoundingClientRect();
    const p = clamp((mid - rr.top) / rr.height, 0, 1);
    railFill.style.transform = 'scaleY(' + p + ')';
    railDot.style.transform = 'translateY(' + (p * rr.height - 6) + 'px)';
    let best = 0;
    rows.forEach((r, i) => { if (r.getBoundingClientRect().top < mid) best = i; });
    setRow(best);
  }

  /* ---------- Findings bench ---------- */
  const cellsEl = $('#cells');
  if (cellsEl) {
    let h = '';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 18; c++) {
      const v = (c * 7 + r * 13) % 11;
      h += '<i class="' + (v < 2 ? 'a' : v < 6 ? 'b' : '') + '" style="--d:' + ((c + r) * 22) + '"></i>';
    }
    cellsEl.innerHTML = h;
  }
  const fItems = $$('.f-item'), panes = $$('.pane');
  let fI = -1, fTimer = 0, decodeRaf = 0;
  const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  function decode(el, text) {
    cancelAnimationFrame(decodeRaf);
    if (still) { el.textContent = text; return; }
    const t0 = performance.now();
    const go = (t) => {
      const p = clamp((t - t0) / 850, 0, 1), fixed = Math.floor(p * text.length);
      let s = text.slice(0, fixed);
      for (let i = fixed; i < text.length; i++) s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      el.textContent = p >= 1 ? text : s;
      if (p < 1) decodeRaf = requestAnimationFrame(go);
    };
    decodeRaf = requestAnimationFrame(go);
  }
  function pickFinding(i) {
    if (fI === i) return;
    if (fI >= 0) $('.f-mark', fItems[fI]).textContent = fItems[fI].dataset.mark;
    fI = i;
    fItems.forEach((b, k) => b.setAttribute('aria-selected', k === i ? 'true' : 'false'));
    panes.forEach((p, k) => {
      p.classList.toggle('on', k === i);
      p.classList.remove('play');
      if (k === i) { p.getBoundingClientRect(); p.classList.add('play'); }
    });
    decode($('.f-mark', fItems[i]), fItems[i].dataset.mark);
  }
  fItems.forEach((b, i) => {
    b.addEventListener('pointerenter', () => pickFinding(i));
    b.addEventListener('focus', () => pickFinding(i));
    b.addEventListener('click', () => pickFinding(i));
  });
  pickFinding(0);
  const bench = $('.bench');
  let benchSeen = false, benchHover = false;
  bench.addEventListener('pointerenter', () => { benchHover = true; });
  bench.addEventListener('pointerleave', () => { benchHover = false; });
  new IntersectionObserver((en) => {
    benchSeen = en[0].isIntersecting;
    clearInterval(fTimer);
    if (benchSeen && !still) {
      const p = panes[fI]; p.classList.remove('play'); p.getBoundingClientRect(); p.classList.add('play');
      fTimer = setInterval(() => { if (!benchHover && !document.hidden) pickFinding((fI + 1) % fItems.length); }, 6500);
    }
  }, { threshold: .25 }).observe(bench);

  /* ---------- Accordion ---------- */
  const accRows = $$('.acc-row');
  accRows.forEach((r) => $$('.chips span', r).forEach((c, i) => c.style.setProperty('--c', i)));
  function openAcc(row) {
    accRows.forEach((r) => {
      const o = r === row;
      r.classList.toggle('open', o);
      $('.acc-btn', r).setAttribute('aria-expanded', o ? 'true' : 'false');
    });
  }
  accRows.forEach((r) => {
    if (fine) r.addEventListener('pointerenter', () => openAcc(r));
    $('.acc-btn', r).addEventListener('click', () => openAcc(r));
    $('.acc-btn', r).addEventListener('focus', () => openAcc(r));
  });
  openAcc(accRows[0]);

  /* ---------- Magnetic round button ---------- */
  const round = $('#round');
  if (fine && !still) {
    const wrap = $('#roundWrap');
    document.addEventListener('pointermove', (e) => {
      const q = wrap.getBoundingClientRect();
      if (q.bottom < 0 || q.top > window.innerHeight) return;
      const dx = e.clientX - (q.left + q.width / 2), dy = e.clientY - (q.top + q.height / 2);
      const near = Math.hypot(dx, dy) < q.width * 1.1;
      const over = Math.hypot(dx, dy) < q.width / 2;
      wrap.style.transform = near ? 'translate(' + dx * .28 + 'px,' + dy * .28 + 'px)' + (over ? ' scale(1.06) rotate(-4deg)' : '') : '';
    }, { passive: true });
    wrap.style.transition = 'transform .3s cubic-bezier(.2,.8,.2,1)';
  }

  /* ---------- Footer ---------- */
  const footer = $('#footer'), page = $('#page'), footerIn = $('#footerIn');
  const marquee = $('#marquee'), signature = $('#signature');
  const PHRASE = 'Technical SEO ✦ AI Search ✦ AEO + GEO ✦ International SEO ✦ Digital Growth ✦ ';
  marquee.textContent = PHRASE.repeat(4);
  let mx = 0, mv = 0, mWidth = 0, footerVisible = false, footerEntered = false, lastSY = window.scrollY, mLast = 0;
  function marqueeTick(t) {
    if (!footerVisible || still) { mLast = 0; return; }
    const dt = mLast ? Math.min(.05, (t - mLast) / 1000) : 0;
    mLast = t;
    if (!mWidth) mWidth = marquee.scrollWidth / 4;
    mv *= .92;
    mx -= (70 + mv) * dt;
    if (mx <= -mWidth) mx += mWidth;
    if (mx > 0) mx -= mWidth;
    marquee.style.transform = 'translate3d(' + mx + 'px,0,0)';
    requestAnimationFrame(marqueeTick);
  }
  new IntersectionObserver((en) => {
    footerVisible = en[0].isIntersecting;
    if (footerVisible) { requestAnimationFrame(marqueeTick); tickClock(); }
  }).observe(footer);

  const clockEl = $('#clock');
  const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  function tickClock() { clockEl.textContent = clockFmt.format(new Date()); }
  tickClock();
  setInterval(() => { if (footerVisible) tickClock(); }, 1000);

  $$('.pill').forEach((p) => {
    const dot = $('i', p);
    p.addEventListener('pointerenter', (e) => {
      const q = p.getBoundingClientRect();
      dot.style.left = (e.clientX - q.left) + 'px'; dot.style.top = (e.clientY - q.top) + 'px';
    });
    p.addEventListener('pointerleave', (e) => {
      const q = p.getBoundingClientRect();
      dot.style.left = (e.clientX - q.left) + 'px'; dot.style.top = (e.clientY - q.top) + 'px';
    });
  });
  if (fine && !still) {
    const pills = $$('.pill');
    footer.addEventListener('pointermove', (e) => {
      pills.forEach((p) => {
        const q = p.getBoundingClientRect();
        const cx = q.left + q.width / 2 - (parseFloat(p.dataset.lx) || 0), cy = q.top + q.height / 2 - (parseFloat(p.dataset.ly) || 0);
        const dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy) - q.width / 2;
        const lx = d < 90 ? dx * .06 : 0, ly = d < 90 ? dy * .1 : 0;
        p.dataset.lx = lx; p.dataset.ly = ly;
        p.style.transform = 'translate(' + lx.toFixed(1) + 'px,' + ly.toFixed(1) + 'px)';
      });
    });
    footer.addEventListener('pointerleave', () => pills.forEach((p) => { p.style.transform = ''; p.dataset.lx = 0; p.dataset.ly = 0; }));
  }

  function footerEntrance() {
    if (footerEntered) return;
    footerEntered = true;
    if (!Build.active) return;
    Build.signature(signature, 1500);
    const items = $$('.pill').concat($$('#footBottom > *'));
    items.forEach((el, i) => {
      el.animate([{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 700 + i * 50, fill: 'backwards', easing: 'cubic-bezier(.2,1.2,.3,1)' });
    });
  }

  /* ---------- Global scroll ---------- */
  const progress = $('#progress'), nav = $('#nav'), tools = $('#tools'), topRing = $('#topRing');
  const navLinks = $$('[data-nav]');
  const navSecs = navLinks.map((a) => $('#' + a.dataset.nav));
  let scheduled = false;
  function onFrame() {
    scheduled = false;
    const sy = window.scrollY, max = root.scrollHeight - window.innerHeight;
    const p = max > 0 ? clamp(sy / max, 0, 1) : 0;
    progress.style.transform = 'scaleX(' + p + ')';
    topRing.style.strokeDashoffset = 1 - p;
    nav.classList.toggle('solid', sy > 40);
    if (sy < window.innerHeight * 1.1) { P.painted = false; paintHero(); }
    const mid = window.innerHeight / 2;
    let cur = -1;
    navSecs.forEach((s, i) => { const q = s.getBoundingClientRect(); if (q.top <= mid && q.bottom >= mid) cur = i; });
    navLinks.forEach((a, i) => a.classList.toggle('on', i === cur));
    const tq = $('#timeline').getBoundingClientRect();
    if (tq.bottom > 0 && tq.top < window.innerHeight) paintTimeline();
    mv = clamp(mv + Math.abs(sy - lastSY) * .8, 0, 900);
    lastSY = sy;

    /* Footer curtain */
    const fh = footer.offsetHeight;
    const pageBottom = page.getBoundingClientRect().bottom;
    const revealed = clamp((window.innerHeight - pageBottom) / fh, 0, 1);
    if (revealed > 0 && getComputedStyle(footer).position === 'sticky' && !still) {
      footerIn.style.transform = 'translateY(' + (-90 * (1 - revealed)) + 'px)';
    } else footerIn.style.transform = '';
    const fVisible = getComputedStyle(footer).position === 'sticky' ? revealed : clamp((window.innerHeight - footer.getBoundingClientRect().top) / fh, 0, 1);
    if (fVisible >= .18) footerEntrance();
    tools.classList.toggle('away', fVisible >= .45);
    if (sy > 40 && Build.active && !window.__dockGone) { window.__dockGone = true; const d = $('#dock'); if (d && !d.hidden) d.classList.add('away'); }
  }
  const req = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(onFrame); } };
  window.addEventListener('scroll', req, { passive: true });
  window.addEventListener('resize', req);
  onFrame();

  /* ---------- Modal ---------- */
  const modal = $('#modal'), win = $('#modalWin'), body = $('#modalBody');
  let lastFocus = null;
  function openModal(html, wide, title) {
    const opening = modal.hidden;
    if (opening) lastFocus = document.activeElement;
    Build.kill(body);
    body.innerHTML = html;
    win.classList.toggle('wide', !!wide);
    modal.hidden = false;
    if (opening) {
      page.inert = true; footer.inert = true; nav.inert = true; tools.inert = true;
      document.body.style.overflow = 'hidden';
    }
    if (Build.active) Build.scope(body);
    win.focus({ preventScroll: true });
    win.scrollTop = 0;
  }
  function closeModal() {
    Build.kill(body);
    win.classList.remove('proof');
    modal.hidden = true;
    body.innerHTML = '';
    page.inert = false; footer.inert = false; nav.inert = false; tools.inert = false;
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalScrim').addEventListener('click', closeModal);
  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = $$('a[href],button,input,textarea', win).filter((x) => !x.disabled && x.offsetParent !== null && getComputedStyle(x).visibility !== 'hidden');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === win)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  function contactOptions() {
    openModal(
      '<h2 class="m-title" id="modalTitle" data-b="head">Let\'s <span class="hl">talk.</span></h2>' +
      '<p class="m-sub" data-b="text">Technically challenging SEO roles, AI-search optimization, multi-site growth and search-led digital marketing work.</p>' +
      '<div class="tiles">' +
      '<button class="tile primary" type="button" id="toForm" data-b="box" data-wipe="lr">Send a message<small>Write it here, send it from your email app</small></button>' +
      '<a class="tile" href="mailto:' + EMAIL + '" data-b="box"><small>Email</small>' + EMAIL + '</a>' +
      '<a class="tile" href="tel:+919335864465" data-b="box"><small>Phone</small>+91 93358 64465</a>' +
      '<a class="tile" href="https://linkedin.com/in/abhinavmishra000" target="_blank" rel="noopener" data-b="box"><small>LinkedIn</small>abhinavmishra000</a>' +
      '<a class="tile" href="https://github.com/abhinavmishraaa" target="_blank" rel="noopener" data-b="box"><small>GitHub</small>abhinavmishraaa</a>' +
      '</div>'
    );
  }
  function contactForm() {
    openModal(
      '<h2 class="m-title" id="modalTitle" data-b="head">Send a <span class="hl">message.</span></h2>' +
      '<form class="form" id="contactForm" novalidate data-b="group">' +
      '<label class="field">Your name<input name="name" autocomplete="name" required></label>' +
      '<label class="field">Your email<input name="email" type="email" autocomplete="email" required></label>' +
      '<label class="field">Message<textarea name="message" required></textarea></label>' +
      '<p class="err" id="formErr" role="alert"></p>' +
      '<div class="form-actions"><button class="btn" type="submit">Send</button><button class="btn btn-ghost" type="button" id="toOptions">Back</button></div>' +
      '</form>'
    );
  }
  function contactStatus(url) {
    openModal(
      '<h2 class="m-title" id="modalTitle" data-b="head">Almost <span class="hl">there.</span></h2>' +
      '<div class="checks" aria-live="polite">' +
      '<div class="check" id="c1"><span class="check-i spin"></span><div>Checking your message</div></div>' +
      '<div class="check" id="c2"><span class="check-i spin"></span><div>Writing the email</div></div>' +
      '<div class="check" id="c3"><span class="check-i spin"></span><div>Opening your email app</div></div>' +
      '</div>' +
      '<div class="form-actions"><a class="btn" href="' + url.replace(/"/g, '&quot;') + '">Open email again</a><button class="btn btn-ghost" type="button" id="copyEmail">Copy address</button></div>'
    );
    const set = (id, cls, sym, note) => {
      const c = $('#' + id, body); if (!c) return;
      const i = $('.check-i', c); i.className = 'check-i ' + cls; i.textContent = sym;
      if (note) { const s = document.createElement('small'); s.textContent = note; $('div', c).appendChild(s); }
    };
    setTimeout(() => set('c1', 'ok', '✓'), 450);
    setTimeout(() => set('c2', 'ok', '✓'), 800);
    setTimeout(() => {
      window.location.href = url;
      set('c3', 'warn', '!', 'This page cannot confirm the email was sent. Please press send in your email app.');
    }, 1150);
  }
  function caseModal(id) {
    const c = $('#case-' + id);
    openModal('<article class="case" id="modalTitleWrap">' + c.innerHTML + '</article>', true);
    const h = $('h3', body); if (h) h.id = 'modalTitle';
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open-contact],[data-case],[data-proof],#toForm,#toOptions,#copyEmail');
    if (!t) return;
    if (t.matches('[data-open-contact]')) contactOptions();
    else if (t.matches('[data-case]')) caseModal(t.dataset.case);
    else if (t.matches('[data-proof]')) {
      const fig = t.closest('figure'), im = $('img', fig);
      openModal('<h2 class="m-proof-title" id="modalTitle"></h2><p class="m-proof-sub"></p><div class="m-proof-wrap"><img class="m-proof-img" alt=""></div>', true);
      win.classList.add('proof');
      $('.m-proof-title', body).textContent = $('figcaption b', fig).textContent;
      $('.m-proof-sub', body).textContent = $('figcaption span', fig).textContent;
      const big = $('.m-proof-img', body);
      big.alt = im.alt; big.width = im.getAttribute('width'); big.height = im.getAttribute('height'); big.src = im.getAttribute('src');
    }
    else if (t.id === 'toForm') contactForm();
    else if (t.id === 'toOptions') contactOptions();
    else if (t.id === 'copyEmail') {
      const done = () => { t.textContent = 'Copied'; };
      if (navigator.clipboard) navigator.clipboard.writeText(EMAIL).then(done, () => { t.textContent = EMAIL; });
      else t.textContent = EMAIL;
    }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'contactForm') return;
    e.preventDefault();
    const f = e.target, err = $('#formErr', f);
    const name = f.elements.name.value.trim(), email = f.elements.email.value.trim(), msg = f.elements.message.value.trim();
    if (!name) { err.textContent = 'Please add your name.'; f.elements.name.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Please add a valid email address.'; f.elements.email.focus(); return; }
    if (!msg) { err.textContent = 'Please write a message.'; f.elements.message.focus(); return; }
    const subject = 'Portfolio enquiry from ' + name;
    const text = msg + '\n\n' + name + '\n' + email;
    contactStatus('mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text));
  });

  /* ---------- Page tools ---------- */
  const inspectBtn = $('#toolInspect');
  let inspecting = false;
  const inspectMove = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && el !== document.body && el !== root) Build.setInspect(el);
  };
  function toggleInspect() {
    if (!Build.active || !fine) return;
    inspecting = !inspecting;
    inspectBtn.setAttribute('aria-pressed', inspecting ? 'true' : 'false');
    if (inspecting) document.addEventListener('pointermove', inspectMove, { passive: true });
    else { document.removeEventListener('pointermove', inspectMove); Build.setInspect(null); }
  }
  function replay() {
    try { history.scrollRestoration = 'manual'; } catch (_) {}
    window.scrollTo(0, 0);
    window.location.reload();
  }
  inspectBtn.addEventListener('click', toggleInspect);
  $('#toolReplay').addEventListener('click', replay);
  if (!Build.active) inspectBtn.hidden = true;
  document.addEventListener('keydown', (e) => {
    const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (e.key === 'Escape') {
      if (!modal.hidden) closeModal(); else if (Build.active && !Build.isHeroDone()) Build.skip();
    } else if (!typing && modal.hidden && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'r' || e.key === 'R') replay();
      else if (e.key === 'i' || e.key === 'I') toggleInspect();
    }
  });
})();
