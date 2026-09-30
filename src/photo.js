// "写真に重ねる": pick a night-sky photo taken with the phone's own camera app (night mode can expose for
// seconds; a web page cannot), tap the Moon and one bright star, and the sky is fitted onto the photo:
// names and constellation lines are drawn faintly, and tapping a star opens the usual card.
// Everything stays on the device: the photo is decoded in the page, never uploaded or stored.
// Fitting: a pinhole camera with unknown pointing (3 angles) and focal length (1) is fixed exactly by two
// known stars (2 points = 4 numbers). The focal length comes from the angle between the two stars, the
// pointing from the pair of directions (TRIAD). The photo's time is read from its EXIF data; its location
// is NOT read (the current observing place is used).

const D2R = Math.PI / 180;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const enu = (alt, az) => { const ca = Math.cos(alt * D2R); return [ca * Math.sin(az * D2R), ca * Math.cos(az * D2R), Math.sin(alt * D2R)]; };
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b)))));

// ---------- EXIF (JPEG / TIFF) : date taken, its UTC offset, 35 mm-equivalent focal length ----------
export function readExif(buf) {
  const v = new DataView(buf);
  const out = {};
  try {
    let tiff = -1;
    if (v.getUint16(0) === 0xffd8) { // JPEG: walk the segments to APP1 "Exif\0\0"
      let p = 2;
      while (p + 4 < v.byteLength) {
        const mk = v.getUint16(p), len = v.getUint16(p + 2);
        if (mk === 0xffe1 && v.getUint32(p + 4) === 0x45786966) { tiff = p + 10; break; }
        if ((mk & 0xff00) !== 0xff00) break;
        p += 2 + len;
      }
    } else if (v.getUint16(0) === 0x4949 || v.getUint16(0) === 0x4d4d) tiff = 0;
    if (tiff < 0) return out;
    const le = v.getUint16(tiff) === 0x4949;
    const u16 = (o) => v.getUint16(tiff + o, le), u32 = (o) => v.getUint32(tiff + o, le);
    const str = (o, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = v.getUint8(tiff + o + i); if (!c) break; s += String.fromCharCode(c); } return s; };
    const ifd = (o, cb) => { const n = u16(o); for (let i = 0; i < n; i++) { const e = o + 2 + i * 12; cb(u16(e), u16(e + 2), u32(e + 4), e + 8); } };
    let exifOff = 0;
    ifd(u32(4), (tag, type, cnt, vo) => { if (tag === 0x8769) exifOff = u32(vo - 0); if (tag === 0x0132 && !out.dt) out.dt = str(u32(vo), 19); });
    if (exifOff) ifd(exifOff, (tag, type, cnt, vo) => {
      if (tag === 0x9003) out.dt = str(u32(vo), 19);
      else if (tag === 0x9011) out.off = cnt <= 4 ? str(vo, cnt) : str(u32(vo), cnt);
      else if (tag === 0xa405) out.f35 = u16(vo);
    });
  } catch (e) { }
  return out;
}
export function exifDate(x) {
  const m = x && x.dt && /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(x.dt);
  if (!m) return null;
  if (x.off && /^[+-]\d\d:\d\d$/.test(x.off)) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${x.off}`);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]); // no offset recorded: the phone's own time zone
}

// ---------- two-star fit ----------
// p1,p2: photo pixels relative to the image centre (x right, y down). w1,w2: true directions (ENU unit vectors).
export function fitTwo(p1, p2, w1, w2, diag, fGuess) {
  // The angle between the two rays is not monotonic in f (it tends to the on-screen angle for a tiny f and to 0
  // for a huge one), so there can be two solutions: find every crossing and keep the one nearest the lens
  // focal length from EXIF (or a phone's usual one).
  const sep = ang(w1, w2);
  const g = (f) => ang([p1[0], p1[1], f], [p2[0], p2[1], f]) - sep;
  const roots = [], N = 400, f0 = diag * 0.05, f1 = diag * 20;
  let pf = f0, pg = g(f0);
  for (let k = 1; k <= N; k++) {
    const f = f0 * Math.pow(f1 / f0, k / N), gv = g(f);
    if ((pg <= 0) !== (gv <= 0)) { let lo = pf, hi = f, glo = pg; for (let it = 0; it < 60; it++) { const mid = Math.sqrt(lo * hi), gm = g(mid); if ((gm <= 0) === (glo <= 0)) { lo = mid; glo = gm; } else hi = mid; } roots.push(Math.sqrt(lo * hi)); }
    pf = f; pg = gv;
  }
  if (!roots.length) return null;
  const want = fGuess || diag * 26 / 43.27;
  const f = roots.reduce((a, b) => (Math.abs(Math.log(b / want)) < Math.abs(Math.log(a / want)) ? b : a));
  const a1 = norm([p1[0], p1[1], f]), a2 = norm([p2[0], p2[1], f]);
  const tri = (x, y) => { const e1 = x, e2 = norm(cross(x, y)), e3 = cross(e1, e2); return [e1, e2, e3]; };
  const A = tri(a1, a2), W = tri(norm(w1), norm(w2));
  // M = W * A^T  (camera -> world)
  const M = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M.push(W[0][i] * A[0][j] + W[1][i] * A[1][j] + W[2][i] * A[2][j]);
  return { f, M };
}
// world direction -> photo pixel (relative to centre), or null when behind the camera
export function project(fit, d) {
  const M = fit.M;
  const a = [M[0] * d[0] + M[3] * d[1] + M[6] * d[2], M[1] * d[0] + M[4] * d[1] + M[7] * d[2], M[2] * d[0] + M[5] * d[1] + M[8] * d[2]];
  if (a[2] < 0.05) return null;
  return [fit.f * a[0] / a[2], fit.f * a[1] / a[2]];
}

export function createPhoto(deps) {
  const { $, st, DATA, S, A, t, esc, hm, md, dir, starLabel, planetName, conName, openObj, closeObj, root, onOpen, onClose } = deps;
  const view = $('ar-ph'), cv = $('ph-cv'), ctx = cv.getContext('2d'), file = $('ph-file');
  const MAXPX = 2048; // the photo is scaled down once on load (memory on phones)
  let img = null, iw = 0, ih = 0, when = null, exif = {}, timeOk = false;
  let W = 0, H = 0, DPR = 1, sc = 1, ox = 0, oy = 0, fitScale = 1; // screen = o + sc * photo
  let step = 'p1', pts = [], fit = null, cands = [], candI = 0, wantList = false;

  // ---------- sky at the photo's time ----------
  const obs = () => st.place;
  function dirOf(o, d) {
    if (o.kind === 'star') { const s = DATA.stars[o.i]; const h = S.horizonMapper(d, obs())(s[0], s[1]); return enu(h.alt, h.az); }
    const h = S.bodyAltAz(o.body, d, obs()); return enu(h.alt, h.az);
  }
  function altAzOf(o, d) { const v = dirOf(o, d); return { alt: Math.asin(v[2]) / D2R, az: (Math.atan2(v[0], v[1]) / D2R + 360) % 360 }; }
  const nameOf = (o) => (o.kind === 'star' ? starLabel(o.i) : o.kind === 'moon' ? t('moon') : planetName(o.pl));
  const moonObj = () => ({ kind: 'moon', body: A.Body.Moon });
  // bright things one can pick as the second (or first) point
  function brightList(d) {
    const out = [], map = S.horizonMapper(d, obs());
    const m = S.bodyAltAz(A.Body.Moon, d, obs()); if (m.alt > 0) out.push({ o: moonObj(), mag: -12, alt: m.alt, az: m.az });
    for (const pl of S.PLANETS) { const mg = A.Illumination(pl.body, d).mag; if (mg > 3) continue; const h = S.bodyAltAz(pl.body, d, obs()); if (h.alt > 0) out.push({ o: { kind: 'planet', body: pl.body, pl }, mag: mg, alt: h.alt, az: h.az }); }
    for (let i = 0; i < DATA.stars.length; i++) {
      const s = DATA.stars[i]; if (s[2] > 2.6) break;
      if (!starLabel(i)) continue;
      const h = map(s[0], s[1]); if (h.alt > 3) out.push({ o: { kind: 'star', i }, mag: s[2], alt: h.alt, az: h.az });
    }
    return out;
  }
  const same = (a, b) => a && b && a.kind === b.kind && (a.kind === 'star' ? a.i === b.i : a.body === b.body);

  // ---------- open / load ----------
  function pick() { file.value = ''; file.click(); }
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0]; if (!f) return;
    let buf = null; try { buf = await f.slice(0, 256 * 1024).arrayBuffer(); } catch (e) { }
    exif = buf ? readExif(buf) : {};
    when = exifDate(exif); timeOk = !!when && !isNaN(when);
    if (!timeOk) when = new Date(st.t);
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, MAXPX / Math.max(im.naturalWidth, im.naturalHeight));
      iw = Math.round(im.naturalWidth * k); ih = Math.round(im.naturalHeight * k);
      img = document.createElement('canvas'); img.width = iw; img.height = ih; img.getContext('2d').drawImage(im, 0, 0, iw, ih);
      URL.revokeObjectURL(url);
      show();
    };
    im.onerror = () => { URL.revokeObjectURL(url); note(t('phBad')); };
    im.src = url;
  });
  function show() {
    view.hidden = false; root.classList.add('photo'); onOpen && onOpen();
    resize(); reset(); renderTime();
  }
  function hide() { view.hidden = true; root.classList.remove('photo'); img = null; fit = null; pts = []; onClose && onClose(); }
  function reset() { pts = []; fit = null; cands = []; candI = 0; wantList = false; step = 'p1'; $('ph-done').hidden = true; panel(); draw(); }
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    if (img) { fitScale = Math.min(W / iw, H / ih); sc = fitScale; ox = (W - iw * sc) / 2; oy = (H - ih * sc) / 2; }
  }
  addEventListener('resize', () => { if (!view.hidden) { resize(); draw(); } });
  function renderTime() {
    const d = when;
    $('ph-time').querySelector('span').textContent = timeOk ? t('phTaken', md(d), hm(d)) : t('phNoTime', md(d), hm(d));
    const dt = $('ph-dt');
    const p2 = (n) => String(n).padStart(2, '0');
    dt.value = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  $('ph-time').addEventListener('click', () => { const dt = $('ph-dt'); dt.hidden = !dt.hidden; if (!dt.hidden) dt.focus(); });
  $('ph-dt').addEventListener('change', (e) => {
    const d = new Date(e.target.value); if (isNaN(d)) return;
    when = d; timeOk = true; renderTime(); $('ph-dt').hidden = true;
    if (pts.length === 2 && pts[0].o && pts[1].o) solve(); else { panel(); draw(); }
  });

  // ---------- steps ----------
  function panel() {
    const k = $('ph-k'), h = $('ph-h'), p = $('ph-p'), b1 = $('ph-b1'), b2 = $('ph-b2'), list = $('ph-list'), bub = $('ph-bubble');
    const pnl = $('ph-panel');
    pnl.hidden = step === 'done'; bub.hidden = true; list.hidden = true; list.innerHTML = '';
    b1.hidden = b2.hidden = false;
    const moon = S.bodyAltAz(A.Body.Moon, when, obs());
    if (step === 'p1') {
      k.textContent = '1 / 2';
      if (moon.alt > 0) {
        h.textContent = t('phH1Moon'); p.textContent = t('phP1Moon', dir(moon.az), Math.round(moon.alt));
        b1.textContent = t('phNoMoon'); b1.onclick = () => { step = 'p1s'; panel(); };
      } else { step = 'p1s'; return panel(); }
      b2.textContent = t('phOther'); b2.onclick = pick;
    } else if (step === 'p1s') {
      k.textContent = '1 / 2'; h.textContent = t('phH1Star'); p.textContent = t('phP1Star');
      b1.hidden = true; b2.textContent = t('phOther'); b2.onclick = pick;
    } else if (step === 'p2') {
      k.textContent = '2 / 2'; h.textContent = t('phH2'); p.textContent = t('phP2', nameOf(pts[0].o));
      b1.textContent = t('phRedo'); b1.onclick = reset; b2.hidden = true;
    } else if (step === 'which') { // name the tapped point
      const last = pts[pts.length - 1];
      if (!wantList && cands.length && candI < cands.length) {
        pnl.hidden = true; bub.hidden = false;
        $('ph-bq').innerHTML = t('phIsIt', `<b>${esc(nameOf(cands[candI].o))}</b>`);
        const sp = toScreen(last.img), bw = bub.offsetWidth || 244, bh = bub.offsetHeight || 120;
        bub.style.left = Math.max(8, Math.min(W - bw - 8, sp[0] - bw / 2)) + 'px';
        bub.style.top = (sp[1] + 30 + bh < H - 10 ? sp[1] + 30 : Math.max(70, sp[1] - 30 - bh)) + 'px';
      } else {
        k.textContent = pts.length + ' / 2'; h.textContent = t('phWhich'); p.textContent = t('phWhichP');
        b1.textContent = t('phRedo'); b1.onclick = reset; b2.hidden = true;
        list.hidden = false;
        const used = pts.slice(0, -1).map(q => q.o);
        const all = brightList(when).filter(c => !used.some(u => same(u, c.o))).sort((a, b) => a.mag - b.mag);
        for (const c of all) {
          const bt = document.createElement('button'); bt.type = 'button';
          bt.innerHTML = `<span>${esc(nameOf(c.o))}</span><small>${esc(dir(c.az))} ${Math.round(c.alt)}°</small>`;
          bt.onclick = () => choose(c.o); list.appendChild(bt);
        }
      }
    }
  }
  $('ph-yes').addEventListener('click', () => choose(cands[candI].o));
  $('ph-no').addEventListener('click', () => { candI++; panel(); });
  $('ph-listbtn').addEventListener('click', () => { wantList = true; panel(); });
  function choose(o) {
    pts[pts.length - 1].o = o; wantList = false; cands = []; candI = 0;
    if (pts.length === 1) { step = 'p2'; panel(); draw(); } else solve();
  }
  const rel = (q) => [q[0] - iw / 2, q[1] - ih / 2];
  const diag = () => Math.hypot(iw, ih);
  function tapPhoto(q) {
    if (step === 'done') return tapObject(q);
    if (step === 'p1') { pts = [{ img: q, o: moonObj() }]; step = 'p2'; panel(); draw(); return; }
    if (step === 'p1s') { pts = [{ img: q, o: null }]; step = 'which'; cands = []; wantList = true; panel(); draw(); return; }
    if (step === 'p2' || (step === 'which' && pts.length === 2)) {
      pts = [pts[0], { img: q, o: null }];
      // guess which star: the angle between the two taps, using the lens focal length from EXIF (or a phone's
      // usual 26 mm), matched against the true angle from the first object to each bright object
      const f35 = exif.f35 > 5 && exif.f35 < 400 ? exif.f35 : 26;
      const f = f35 * diag() / 43.27;
      const th = ang([...rel(pts[0].img), f], [...rel(q), f]);
      const w0 = dirOf(pts[0].o, when);
      const tol = exif.f35 ? 0.15 : 0.35;
      cands = brightList(when).filter(c => !same(c.o, pts[0].o)).map(c => ({ ...c, e: Math.abs(ang(w0, enu(c.alt, c.az)) - th) / th }))
        .filter(c => c.e < tol).sort((a, b) => (a.e + 0.02 * a.mag) - (b.e + 0.02 * b.mag)).slice(0, 5);
      candI = 0; wantList = !cands.length; step = 'which'; panel(); draw();
    }
  }
  function solve() {
    const w1 = dirOf(pts[0].o, when), w2 = dirOf(pts[1].o, when);
    const f35 = exif.f35 > 5 && exif.f35 < 400 ? exif.f35 : 26;
    const r = fitTwo(rel(pts[0].img), rel(pts[1].img), w1, w2, diag(), f35 * diag() / 43.27);
    const longFov = r ? 2 * Math.atan(Math.max(iw, ih) / 2 / r.f) / D2R : 0;
    if (!r || longFov < 8 || longFov > 130) { fit = null; step = 'p2'; pts = [pts[0]]; panel(); note(t('phFail')); draw(); return; }
    fit = r; step = 'done'; panel();
    const dn = $('ph-done'); dn.hidden = false;
    dn.querySelector('span').textContent = t('phFitted', nameOf(pts[0].o), nameOf(pts[1].o));
    draw();
    note(t('phTapHint'), 3500);
  }
  $('ph-redo').addEventListener('click', reset);
  $('ph-back').addEventListener('click', hide);

  // ---------- drawing ----------
  const toScreen = (q) => [ox + sc * q[0], oy + sc * q[1]];
  const toPhoto = (x, y) => [(x - ox) / sc, (y - oy) / sc];
  function projS(d) { if (!fit) return null; const p = project(fit, d); if (!p) return null; const q = [p[0] + iw / 2, p[1] + ih / 2]; return toScreen(q); }
  let hits = [];
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (!img) return;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, ox, oy, iw * sc, ih * sc);
    hits = [];
    // the taps so far (while fitting only; afterwards the names speak for themselves)
    if (step !== 'done') for (const p of pts) {
      const s = toScreen(p.img);
      ctx.strokeStyle = '#f2c46d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s[0], s[1], 20, 0, Math.PI * 2); ctx.stroke();
      if (p.o) { ctx.font = '500 12px "Zen Kaku Gothic New", sans-serif'; ctx.fillStyle = '#f2c46d'; ctx.textAlign = 'center'; ctx.fillText(nameOf(p.o) + (step === 'done' ? '' : ' ✓'), s[0], s[1] - 28); ctx.textAlign = 'left'; }
    }
    if (!fit || step !== 'done') return;
    const d = when, map = S.horizonMapper(d, obs());
    const inPhoto = (s) => s && s[0] > ox - 2 && s[0] < ox + iw * sc + 2 && s[1] > oy - 2 && s[1] < oy + ih * sc + 2;
    // constellation lines, faint
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(200,215,240,.38)'; ctx.beginPath();
    for (const c of DATA.cons) for (const seg of c.lines) { let prev = null; for (const [ra, dec] of seg) { const h = map(ra, dec); const s = h.alt > -2 ? projS(enu(h.alt, h.az)) : null; if (s && prev && inPhoto(s) && inPhoto(prev)) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(s[0], s[1]); } prev = s; } }
    ctx.stroke();
    // constellation names
    ctx.font = '13px "Shippori Mincho", serif'; ctx.fillStyle = 'rgba(246,222,170,.55)'; ctx.textAlign = 'center';
    for (const c of DATA.cons) { const h = map(c.lab[0], c.lab[1]); if (h.alt < 0) continue; const s = projS(enu(h.alt, h.az)); if (s && inPhoto(s)) ctx.fillText(conName(c), s[0], s[1]); }
    ctx.textAlign = 'left';
    // star names (brighter ones) and tap targets (named stars down to 4th magnitude)
    ctx.font = '11.5px "Zen Kaku Gothic New", sans-serif'; ctx.fillStyle = 'rgba(232,230,222,.72)';
    for (let i = 0; i < DATA.stars.length; i++) {
      const s0 = DATA.stars[i]; if (s0[2] > 4) break;
      if (!DATA.info[i]) continue;
      const h = map(s0[0], s0[1]); if (h.alt < 0) continue;
      const s = projS(enu(h.alt, h.az)); if (!s || !inPhoto(s)) continue;
      hits.push({ x: s[0], y: s[1], o: { kind: 'star', i } });
      if (s0[2] <= 2.2) { const lb = starLabel(i); if (lb) ctx.fillText(lb, s[0] + 7, s[1] - 6); }
    }
    ctx.fillStyle = 'rgba(255,226,170,.8)';
    for (const pl of S.PLANETS) {
      const h = S.bodyAltAz(pl.body, d, obs()); if (h.alt < 0) continue;
      const s = projS(enu(h.alt, h.az)); if (!s || !inPhoto(s)) continue;
      hits.push({ x: s[0], y: s[1], o: { kind: 'planet', body: pl.body, ja: pl.ja, en: pl.en } });
      ctx.fillText(planetName(pl), s[0] + 8, s[1] - 7);
    }
    const mh = S.bodyAltAz(A.Body.Moon, d, obs());
    if (mh.alt > -1) { const s = projS(enu(mh.alt, mh.az)); if (s && inPhoto(s)) hits.push({ x: s[0], y: s[1], o: { kind: 'moon', body: A.Body.Moon, ja: '月' } }); }
  }
  function tapObject(q) {
    const s = toScreen(q); let best = null, bd = 30;
    for (const h of hits) { const dd = Math.hypot(h.x - s[0], h.y - s[1]); if (dd < bd) { bd = dd; best = h; } }
    if (best) openObj(best.o); else closeObj();
  }
  function note(txt, ms = 3000) { const n = $('ph-note'); n.textContent = txt; n.hidden = false; clearTimeout(note.t); note.t = setTimeout(() => { n.hidden = true; }, ms); }

  // ---------- touch: pan, pinch-zoom, tap ----------
  const ptr = new Map(); let gest = null;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); start(); });
  cv.addEventListener('pointermove', e => { if (!ptr.has(e.pointerId)) return; ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); move(); });
  const up = e => {
    if (!ptr.has(e.pointerId)) return;
    const g = gest; ptr.delete(e.pointerId);
    if (g && ptr.size === 0 && !g.pinched && g.moved < 8) tapPhoto(toPhoto(e.clientX, e.clientY));
    start();
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, sc * (1 - e.deltaY * 0.0015)); }, { passive: false });
  function start() {
    const ps = [...ptr.values()];
    if (!ps.length) { gest = null; return; }
    const c = ps.length > 1 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : ps[0];
    gest = { c, d: ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0, sc, ox, oy, moved: gest ? gest.moved : 0, pinched: (gest && gest.pinched) || ps.length > 1 };
  }
  function move() {
    const ps = [...ptr.values()]; if (!gest) return;
    const c = ps.length > 1 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : ps[0];
    gest.moved = Math.max(gest.moved, Math.hypot(c.x - gest.c.x, c.y - gest.c.y));
    let s2 = gest.sc;
    if (ps.length > 1 && gest.d > 0) s2 = gest.sc * Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) / gest.d;
    s2 = Math.max(fitScale, Math.min(fitScale * 10, s2));
    // keep the photo point under the gesture centre fixed
    const px = (gest.c.x - gest.ox) / gest.sc, py = (gest.c.y - gest.oy) / gest.sc;
    sc = s2; ox = c.x - px * sc; oy = c.y - py * sc; clamp(); draw();
  }
  function zoomAt(x, y, s2) { s2 = Math.max(fitScale, Math.min(fitScale * 10, s2)); const px = (x - ox) / sc, py = (y - oy) / sc; sc = s2; ox = x - px * sc; oy = y - py * sc; clamp(); draw(); }
  function clamp() {
    const w = iw * sc, h = ih * sc;
    ox = w <= W ? (W - w) / 2 : Math.min(0, Math.max(W - w, ox));
    oy = h <= H ? (H - h) / 2 : Math.min(0, Math.max(H - h, oy));
  }

  return { pick, isOpen: () => !view.hidden, close: () => { if (!view.hidden) hide(); },
    _proj: (o) => { if (!fit) return null; const p = project(fit, dirOf(o, when)); return p && [p[0] + iw / 2, p[1] + ih / 2]; }, _f: () => fit && fit.f };
}
