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

// ---------- v36: one-tap fit ----------
// Bright points in the photo: local maxima well above the local background (on a half-size copy).
export function findSpots(data, w, h, max = 90) {
  const s = 2, W = Math.floor(w / s), H = Math.floor(h / s);
  const L = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0; for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) { const i = ((y * s + dy) * w + x * s + dx) * 4; v += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; }
    L[y * W + x] = v / (s * s);
  }
  // local background: mean over a 31x31 box (integral image)
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += L[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  const R = 15, box = (x, y) => { const x0 = Math.max(0, x - R), y0 = Math.max(0, y - R), x1 = Math.min(W, x + R + 1), y1 = Math.min(H, y + R + 1); return (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0)); };
  const out = [];
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const v = L[y * W + x]; const bg = box(x, y); const c = v - bg;
    if (c < 18) continue;
    let peak = true;
    for (let dy = -2; dy <= 2 && peak; dy++) for (let dx = -2; dx <= 2; dx++) { if ((dx || dy) && L[(y + dy) * W + x + dx] > v) { peak = false; break; } }
    if (!peak) continue;
    let sx = 0, sy = 0, sw = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = Math.max(0, L[(y + dy) * W + x + dx] - bg); sx += q * (x + dx); sy += q * (y + dy); sw += q; }
    out.push({ x: (sx / sw + 0.5) * s, y: (sy / sw + 0.5) * s, c });
  }
  out.sort((a, b) => b.c - a.c);
  // drop duplicates of the same blob
  const keep = [];
  for (const p of out) { if (keep.some(k => Math.hypot(k.x - p.x, k.y - p.y) < 6 * s)) continue; keep.push(p); if (keep.length >= max) break; }
  return keep;
}
// Pointing from one known point: the camera ray of the anchor must equal its true direction; the remaining
// roll about that ray (and a little focal-length play) is searched so that catalogue stars land on bright points.
// anchor: photo px relative to centre; w0: its true direction; cat: [{w, name, mag}]; spots: px relative to centre.
export function fitOne(anchor, w0, cat, spots, f0, iw, ih) {
  const diag = Math.hypot(iw, ih), tol = 0.011 * diag;
  const perp = (v) => { const r = Math.abs(v[2]) < 0.95 ? [0, 0, 1] : [1, 0, 0]; return norm(cross(v, r)); };
  const e1 = norm(w0), p = perp(e1), q = cross(e1, p);
  let best = null;
  for (let fk = 0.88; fk <= 1.121; fk += 0.02) {
    const f = f0 * fk;
    const c1 = norm([anchor[0], anchor[1], f]), c2 = perp(c1), c3 = cross(c1, c2), Acam = [c1, c2, c3];
    for (let deg = 0; deg < 360; deg += 0.75) {
      const th = deg * D2R, ct = Math.cos(th), st = Math.sin(th);
      const e2 = [ct * p[0] + st * q[0], ct * p[1] + st * q[1], ct * p[2] + st * q[2]], e3 = cross(e1, e2), Wd = [e1, e2, e3];
      const M = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M.push(Wd[0][i] * Acam[0][j] + Wd[1][i] * Acam[1][j] + Wd[2][i] * Acam[2][j]);
      const fit = { f, M };
      let n = 0, sum = 0; const hit = [];
      for (const c of cat) {
        const pp = project(fit, c.w); if (!pp || Math.abs(pp[0]) > iw / 2 || Math.abs(pp[1]) > ih / 2) continue;
        let bd = tol, bs = null; for (const sp of spots) { const dd = Math.hypot(sp.x - pp[0], sp.y - pp[1]); if (dd < bd) { bd = dd; bs = sp; } }
        if (bs) { n++; sum += bd; hit.push({ c, sp: bs, d: bd }); }
      }
      if (n && (!best || n > best.n || (n === best.n && sum < best.sum))) best = { n, sum, fit, hit };
    }
  }
  if (!best || best.n < 3) return null;
  // finish exactly with the two-point solver on the anchor and the farthest matched star, then re-check
  const far = best.hit.reduce((a, b) => (Math.hypot(b.sp.x - anchor[0], b.sp.y - anchor[1]) > Math.hypot(a.sp.x - anchor[0], a.sp.y - anchor[1]) ? b : a));
  const fin = fitTwo(anchor, [far.sp.x, far.sp.y], w0, far.c.w, diag, best.fit.f) || best.fit;
  const hit = [];
  for (const c of cat) {
    const pp = project(fin, c.w); if (!pp || Math.abs(pp[0]) > iw / 2 || Math.abs(pp[1]) > ih / 2) continue;
    let bd = tol * 0.6, bs = null; for (const sp of spots) { const dd = Math.hypot(sp.x - pp[0], sp.y - pp[1]); if (dd < bd) { bd = dd; bs = sp; } }
    if (bs) hit.push({ c, d: bd });
  }
  if (hit.length < 3) return null;
  hit.sort((a, b) => a.c.mag - b.c.mag);
  return { fit: fin, names: hit.map(h => h.c.name), n: hit.length };
}

export function createPhoto(deps) {
  const { $, st, DATA, S, A, t, esc, hm, md, dir, starLabel, planetName, conName, openObj, closeObj, root, onOpen, onClose } = deps;
  const view = $('ar-ph'), cv = $('ph-cv'), ctx = cv.getContext('2d'), file = $('ph-file');
  const MAXPX = 2048; // the photo is scaled down once on load (memory on phones)
  let img = null, iw = 0, ih = 0, when = null, exif = {}, timeOk = false;
  let W = 0, H = 0, DPR = 1, sc = 1, ox = 0, oy = 0, fitScale = 1; // screen = o + sc * photo
  let step = 'p1', pts = [], fit = null, cands = [], candI = 0, wantList = false, spots = null, autoNames = null;

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
      img = document.createElement('canvas'); img.width = iw; img.height = ih; img.getContext('2d').drawImage(im, 0, 0, iw, ih); spots = null;
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
  function reset() { autoNames = null; pts = []; fit = null; cands = []; candI = 0; wantList = false; step = 'p1'; $('ph-done').hidden = true; panel(); draw(); }
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
    } else if (step === 'confirm') { // v36: one-tap result
      k.textContent = ''; h.textContent = t('phAutoH', autoNames.join(t('listSep'))); p.textContent = t('phAutoP');
      b1.textContent = t('phAutoNo'); b1.onclick = () => { fit = null; autoNames = null; pts = [pts[0]]; step = 'p2'; panel(); draw(); };
      b2.textContent = t('phAutoYes'); b2.onclick = () => { step = 'done'; panel(); const dn = $('ph-done'); dn.hidden = false; dn.querySelector('span').textContent = t('phFittedAuto', autoNames.join(t('listSep'))); draw(); note(t('phTapHint'), 3500); };
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
    if (pts.length === 1) { if (!tryAuto()) { step = 'p2'; panel(); draw(); } } else solve();
  }
  // v36: one tap is enough when the photo's focal length is known and at least 3 more stars line up;
  // otherwise the usual second tap is asked for (nothing is forced onto the photo)
  function lum(d, i) { return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; }
  function tryAuto() {
    if (!(exif.f35 > 5 && exif.f35 < 400) || !pts[0] || !pts[0].o) return false;
    const D = diag(), data = img.getContext('2d').getImageData(0, 0, iw, ih).data;
    if (!spots) spots = findSpots(data, iw, ih, 50);
    let a = pts[0].img.slice();
    const isMoon = pts[0].o.kind === 'moon';
    if (isMoon) { // the Moon's centre: centroid of the brightest pixels near the tap
      const r = Math.round(0.035 * D); let mx = 0;
      for (let y = Math.max(0, a[1] - r | 0); y < Math.min(ih, a[1] + r); y++) for (let x = Math.max(0, a[0] - r | 0); x < Math.min(iw, a[0] + r); x++) mx = Math.max(mx, lum(data, (y * iw + x) * 4));
      let sx = 0, sy = 0, n = 0;
      for (let y = Math.max(0, a[1] - r | 0); y < Math.min(ih, a[1] + r); y++) for (let x = Math.max(0, a[0] - r | 0); x < Math.min(iw, a[0] + r); x++) if (lum(data, (y * iw + x) * 4) > 0.85 * mx) { sx += x; sy += y; n++; }
      if (n) a = [sx / n, sy / n];
    } else { // snap to the bright point under the finger
      let bd = 0.02 * D, bs = null; for (const sp of spots) { const dd = Math.hypot(sp.x - a[0], sp.y - a[1]); if (dd < bd) { bd = dd; bs = sp; } }
      if (bs) a = [bs.x, bs.y];
    }
    const away = isMoon ? 0.06 * D : 0.015 * D;
    const sp = spots.filter(p => Math.hypot(p.x - a[0], p.y - a[1]) > away).map(p => ({ x: p.x - iw / 2, y: p.y - ih / 2 }));
    const map = S.horizonMapper(when, obs()), cat = [];
    for (let i = 0; i < DATA.stars.length; i++) {
      const s0 = DATA.stars[i]; if (s0[2] > 2.8) break;
      if (pts[0].o.kind === 'star' && pts[0].o.i === i) continue;
      const h = map(s0[0], s0[1]); if (h.alt < 5) continue;
      cat.push({ w: enu(h.alt, h.az), name: starLabel(i) || null, mag: s0[2] });
    }
    for (const pl of S.PLANETS) { const mg = A.Illumination(pl.body, when).mag; if (mg > 2.5) continue; const h = S.bodyAltAz(pl.body, when, obs()); if (h.alt > 5 && !(pts[0].o.kind === 'planet' && pts[0].o.body === pl.body)) cat.push({ w: enu(h.alt, h.az), name: planetName(pl), mag: mg }); }
    const r = fitOne(rel(a), dirOf(pts[0].o, when), cat, sp, exif.f35 * D / 43.27, iw, ih);
    if (!r) return false;
    pts[0].img = a; fit = r.fit;
    autoNames = [nameOf(pts[0].o), ...r.names.filter(Boolean)].slice(0, 3);
    step = 'confirm'; panel(); draw();
    return true;
  }
  const rel = (q) => [q[0] - iw / 2, q[1] - ih / 2];
  const diag = () => Math.hypot(iw, ih);
  function tapPhoto(q) {
    if (step === 'done') return tapObject(q);
    if (step === 'confirm') return;
    if (step === 'p1') { pts = [{ img: q, o: moonObj() }]; if (!tryAuto()) { step = 'p2'; panel(); draw(); } return; }
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
  // v36: the photo with the lines and names as one image, made on the device (no location, no EXIF: drawn from a canvas)
  async function shareImage() {
    if (!img || !fit) return;
    const out = document.createElement('canvas'); out.width = iw; out.height = ih;
    const g = out.getContext('2d'); g.drawImage(img, 0, 0);
    const k = 1 / fitScale; // the same look as on screen at the fitted view
    const P = (d) => { const p = project(fit, d); return p && [p[0] + iw / 2, p[1] + ih / 2]; };
    overlay(g, P, (s) => s && s[0] >= 0 && s[0] <= iw && s[1] >= 0 && s[1] <= ih, k, null);
    const ds = `${when.getFullYear()}/${when.getMonth() + 1}/${when.getDate()} ${hm(when)}`;
    g.font = `${11 * k}px "Zen Kaku Gothic New", sans-serif`; g.textAlign = 'right';
    const txt = t('phShareMark', ds), pad = 12 * k;
    g.fillStyle = 'rgba(0,0,0,.45)'; const tw = g.measureText(txt).width; g.fillRect(iw - tw - pad * 1.8, ih - 26 * k - pad * 0.4, tw + pad * 1.8, 26 * k + pad * 0.4);
    g.fillStyle = 'rgba(236,232,222,.85)'; g.fillText(txt, iw - pad, ih - pad);
    const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', 0.92));
    if (!blob) { note(t('phShareFail')); return; }
    const fileOut = new File([blob], 'zenith-photo.jpg', { type: 'image/jpeg' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [fileOut] })) { await navigator.share({ files: [fileOut] }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'zenith-photo.jpg'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  $('ph-share').addEventListener('click', shareImage);
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
    if (step !== 'done' && step !== 'confirm') for (const p of pts) {
      const s = toScreen(p.img);
      ctx.strokeStyle = '#f2c46d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s[0], s[1], 20, 0, Math.PI * 2); ctx.stroke();
      if (p.o) { ctx.font = '500 12px "Zen Kaku Gothic New", sans-serif'; ctx.fillStyle = '#f2c46d'; ctx.textAlign = 'center'; ctx.fillText(nameOf(p.o) + (step === 'done' ? '' : ' ✓'), s[0], s[1] - 28); ctx.textAlign = 'left'; }
    }
    if (!fit || (step !== 'done' && step !== 'confirm')) return;
    const inPhoto = (s) => s && s[0] > ox - 2 && s[0] < ox + iw * sc + 2 && s[1] > oy - 2 && s[1] < oy + ih * sc + 2;
    overlay(ctx, projS, inPhoto, 1, hits);
  }
  // constellation lines, names, bright star and planet names — on screen (k=1) or onto the saved image (k = scale)
  function overlay(g, P, inside, k, hitsOut) {
    const d = when, map = S.horizonMapper(d, obs());
    g.lineWidth = 1 * k; g.strokeStyle = 'rgba(200,215,240,.38)'; g.beginPath();
    for (const c of DATA.cons) for (const seg of c.lines) { let prev = null; for (const [ra, dec] of seg) { const h = map(ra, dec); const s = h.alt > -2 ? P(enu(h.alt, h.az)) : null; if (s && prev && inside(s) && inside(prev)) { g.moveTo(prev[0], prev[1]); g.lineTo(s[0], s[1]); } prev = s; } }
    g.stroke();
    g.font = `${13 * k}px "Shippori Mincho", serif`; g.fillStyle = 'rgba(246,222,170,.55)'; g.textAlign = 'center';
    for (const c of DATA.cons) { const h = map(c.lab[0], c.lab[1]); if (h.alt < 0) continue; const s = P(enu(h.alt, h.az)); if (s && inside(s)) g.fillText(conName(c), s[0], s[1]); }
    g.textAlign = 'left';
    g.font = `${11.5 * k}px "Zen Kaku Gothic New", sans-serif`; g.fillStyle = 'rgba(232,230,222,.72)';
    for (let i = 0; i < DATA.stars.length; i++) {
      const s0 = DATA.stars[i]; if (s0[2] > 4) break;
      if (!DATA.info[i]) continue;
      const h = map(s0[0], s0[1]); if (h.alt < 0) continue;
      const s = P(enu(h.alt, h.az)); if (!s || !inside(s)) continue;
      if (hitsOut) hitsOut.push({ x: s[0], y: s[1], o: { kind: 'star', i } });
      if (s0[2] <= 2.2) { const lb = starLabel(i); if (lb) g.fillText(lb, s[0] + 7 * k, s[1] - 6 * k); }
    }
    g.fillStyle = 'rgba(255,226,170,.8)';
    for (const pl of S.PLANETS) {
      const h = S.bodyAltAz(pl.body, d, obs()); if (h.alt < 0) continue;
      const s = P(enu(h.alt, h.az)); if (!s || !inside(s)) continue;
      if (hitsOut) hitsOut.push({ x: s[0], y: s[1], o: { kind: 'planet', body: pl.body, ja: pl.ja, en: pl.en } });
      g.fillText(planetName(pl), s[0] + 8 * k, s[1] - 7 * k);
    }
    const mh = S.bodyAltAz(A.Body.Moon, d, obs());
    if (hitsOut && mh.alt > -1) { const s = P(enu(mh.alt, mh.az)); if (s && inside(s)) hitsOut.push({ x: s[0], y: s[1], o: { kind: 'moon', body: A.Body.Moon, ja: '月' } }); }
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
    _share: shareImage, _spots: () => spots, _step: () => step, _names: () => autoNames,
    _proj: (o) => { if (!fit) return null; const p = project(fit, dirOf(o, when)); return p && [p[0] + iw / 2, p[1] + ih / 2]; }, _f: () => fit && fit.f };
}
