// "かざすモード": point the phone at the sky. Orientation sensors -> camera basis in
// local East-North-Up coordinates -> gnomonic (pinhole) projection of the live sky.
// Without sensors (PC, Claude viewer) the view is dragged by hand.
import { orbitOf, describeSat } from './satinfo.js';
import { t, JA, kmText } from './i18n.js';
import { conName, starLabel, planetName, showerName } from './names.js';
const D2R = Math.PI / 180;

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const enu = (alt, az) => { const ca = Math.cos(alt * D2R); return [ca * Math.sin(az * D2R), ca * Math.cos(az * D2R), Math.sin(alt * D2R)]; };
const altaz = (d) => ({ alt: Math.asin(Math.max(-1, Math.min(1, d[2]))) / D2R, az: (Math.atan2(d[0], d[1]) / D2R + 360) % 360 });

// Rough magnetic declination for Japan (deg, east positive). West ~7.6° in Tokyo, ~9.3° in Sapporo, ~5° in Naha.
export function declinationJapan(lat, lon) {
  if (lat < 20 || lat > 46 || lon < 122 || lon > 150) return 0;
  return -(7.6 + 0.23 * (lat - 35.7));
}

// W3C DeviceOrientation (alpha, beta, gamma) -> device axes in ENU (columns of Rz(a)Rx(b)Ry(g)).
function basisFromEuler(a, b, g) {
  const cA = Math.cos(a * D2R), sA = Math.sin(a * D2R), cB = Math.cos(b * D2R), sB = Math.sin(b * D2R), cG = Math.cos(g * D2R), sG = Math.sin(g * D2R);
  const x = [cA * cG - sA * sB * sG, cG * sA + cA * sB * sG, -cB * sG];
  const y = [-cB * sA, cA * cB, sB];
  const z = [cG * sA * sB + cA * sG, sA * sG - cA * cG * sB, cB * cG];
  return { x, y, z };
}

export function createAR(deps) {
  const { $, st, DATA, STAR_RGB, S, A, rgb, skyState, horToEq, conAt, focusCon, dir, dir8, mag, esc, hm, md, SKIES, OI, TR, TP } = deps;
  const magL = (m) => (JA ? `${mag(m)}等` : `mag ${mag(m)}`);
  const fShort = (f) => (JA ? f.short : f.shortEn || f.short);
  let sel = null, satSel = null, aimObj = null, aimTarget = null, satPts = [], starPts = [], plPtsLast = [], lastCard = 0, arTarget = null;
  const root = $('ar'), cv = $('arc'), ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1, on = false, raf = 0;
  let fov = 62; // vertical field of view, degrees (camera off: free zoom; camera on: saved camera view / zoom)
  let cam0 = null; // camera MediaStream when the camera background is on
  // v27: the camera's true field of view is measured once (with the Moon) and saved as the focal length
  // relative to the video's long side, so it holds for either orientation and any screen crop.
  // Pinch then zooms the video and the sky together (the overlay can no longer drift from the scenery).
  const LEGACY_FOV = 'zenith.camfov', CAL_KEY = 'zenith.camcal';
  const legacyFov = () => { try { return +localStorage.getItem(LEGACY_FOV) || 66; } catch (e) { return 66; } };
  const loadCal = () => { try { const o = JSON.parse(localStorage.getItem(CAL_KEY) || 'null'); return o && o.fn > 0.2 && o.fn < 3 ? o : null; } catch (e) { return null; } };
  let cal = loadCal();
  function saveCal(o) { cal = o; try { if (o) localStorage.setItem(CAL_KEY, JSON.stringify(o)); else localStorage.removeItem(CAL_KEY); } catch (e) { } }
  // v28: display level — 'all' (every figure, as before), 'aim' (only the aimed figure), 'gaze' (just the sky)
  let view = (() => { try { const v = localStorage.getItem('zenith.arview'); return v === 'aim' ? 'aim' : 'all'; } catch (e) { return 'all'; } })();
  let peekT = 0;
  let zoomK = 1; // camera zoom factor (video and sky together)
  let calib = null, hand = null; // Moon measurement / manual adjustment in progress
  const recent = []; // last raw orientations (for a steady reading when a button is pressed)
  function vidDims() { const v = $('ar-video'); return v && v.videoWidth > 0 ? [v.videoWidth, v.videoHeight] : null; }
  const fOf = (vfov) => (H / 2) / Math.tan(vfov * D2R / 2); // focal length on screen, px
  const vfovOf = (f) => 2 * Math.atan((H / 2) / f) / D2R;
  const cover = (d) => Math.max(W / d[0], H / d[1]); // object-fit: cover scale
  function camBaseFov() {
    if (hand) return hand.fov;
    const d = vidDims();
    if (cal && d) return vfovOf(cal.fn * Math.max(d[0], d[1]) * cover(d));
    return legacyFov();
  }
  const camFovNow = () => 2 * Math.atan(Math.tan(camBaseFov() * D2R / 2) / zoomK) / D2R;
  function toFn(f) { const d = vidDims(); return d ? f / cover(d) / Math.max(d[0], d[1]) : null; }
  let sensor = false, headingOffset = null, lastEvt = 0, compassAcc = null;
  let cam = { v: enu(35, 180), u: [0, 0, 1], r: [1, 0, 0] };
  let target = null; // smoothed toward
  let look = { alt: 35, az: 180 }; // manual mode
  let wake = null;
  // manual compass nudge: small (±20°), for this session only. Before v20 it was saved and unbounded,
  // so an accidental sideways swipe could turn the whole sky by a large angle for good.
  let userOffset = 0;
  try { localStorage.removeItem('zenith.azfix'); } catch (e) { }
  function calNeeded(on) { const el = $('ar-cal'); if (el) el.hidden = !on; }

  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  }

  // ---------- sensors ----------
  function onOrient(e, absolute) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    let alpha = e.alpha;
    if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
      // iOS: alpha has an arbitrary (but fixed) zero, so one constant offset ties it to north.
      // webkitCompassHeading is only trustworthy while the phone is tilted like when reading it
      // (top edge and camera point the same way). Once the phone leans back past vertical to look
      // at the sky, iOS switches its reference and the value can jump by 180°, so we freeze the
      // offset outside that pose instead of chasing it.
      compassAcc = e.webkitCompassAccuracy;
      const good = e.beta > 10 && e.beta < 80 && Math.abs(e.gamma) < 25 && !(compassAcc > 30 || compassAcc < 0);
      const off = ((360 - e.webkitCompassHeading) - alpha + 720) % 360;
      if (headingOffset == null) { if (!good) { calNeeded(true); return; } headingOffset = off; calNeeded(false); }
      else if (good && !calib) { const d = ((off - headingOffset + 540) % 360) - 180; if (Math.abs(d) < 45) headingOffset = (headingOffset + d * 0.1 + 360) % 360; }
      alpha = alpha + headingOffset;
    } else if (!absolute) {
      return; // relative-only alpha without a compass cannot be tied to north
    }
    alpha = alpha + userOffset; // manual fine-tune (horizontal drag follows the finger)
    // magnetic -> true north
    alpha = alpha - declinationJapan(st.place.lat, st.place.lon);
    const b = basisFromEuler(alpha, e.beta, e.gamma);
    // screen rotation
    const th = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * D2R;
    const right = norm(b.x.map((v, i) => Math.cos(th) * v - Math.sin(th) * b.y[i]));
    const up = norm(b.x.map((v, i) => Math.sin(th) * v + Math.cos(th) * b.y[i]));
    const fwd = b.z.map(v => -v); // back camera looks along -z
    target = { v: fwd, u: up, r: right };
    sensor = true; lastEvt = performance.now();
    recent.push({ t: lastEvt, b: target }); while (recent.length && lastEvt - recent[0].t > 300) recent.shift();
  }
  const onRel = (e) => onOrient(e, !!e.absolute);
  const onAbs = (e) => onOrient(e, true);

  async function enableSensors() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { hint(t('arDenied')); return; }
      }
      addEventListener('deviceorientationabsolute', onAbs);
      addEventListener('deviceorientation', onRel);
      hint(t('arHold'));
      setTimeout(() => { if (!sensor) hint(t('arNoSensor')); }, 2500);
    } catch (e) { hint(t('arSensorFail')); }
    $('ar-perm').hidden = true;
  }

  // ---------- manual look ----------
  let drag = null, pinch = null;
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, alt: look.alt, az: look.az, moved: 0 }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    if (!drag || pinch) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    const k = fov / H;
    if (sensor) { // sensors drive the view; a horizontal drag nudges the compass by hand
      if (Math.abs(dx) > 16 && Math.abs(dx) > 2 * Math.abs(dy)) { userOffset = Math.max(-20, Math.min(20, (drag.fix ?? (drag.fix = userOffset)) + (dx - Math.sign(dx) * 16) * k)); showFix(); }
      return;
    }
    look.az = (drag.az - dx * k + 360) % 360;
    look.alt = Math.max(-10, Math.min(90, drag.alt + dy * k));
  });
  cv.addEventListener('pointerup', e => {
    if (drag && drag.moved < 6) tap(e.clientX, e.clientY);
    drag = null;
  });
  const setZoom = (z) => { zoomK = Math.max(1, Math.min(8, z)); applyZoom(); };
  cv.addEventListener('wheel', e => { e.preventDefault(); if (cam0) { if (!hand) setZoom(zoomK * (1 - e.deltaY * 0.001)); } else fov = Math.max(20, Math.min(100, fov * (1 + e.deltaY * 0.001))); }, { passive: false });
  cv.addEventListener('touchstart', e => { if (e.touches.length === 2) pinch = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), fov, z: zoomK }; }, { passive: true });
  cv.addEventListener('touchmove', e => { if (pinch && e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (cam0) { if (!hand) setZoom(pinch.z * d / pinch.d); } else fov = Math.max(20, Math.min(100, pinch.fov * pinch.d / d)); } }, { passive: true });
  cv.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; });

  function screenDir(x, y) {
    const f = (H / 2) / Math.tan(fov * D2R / 2);
    return norm(cam.v.map((v, i) => v + (x - W / 2) / f * cam.r[i] - (y - H / 2) / f * cam.u[i]));
  }
  // A deliberate tap on something (satellite, planet, Moon, named star) opens its card.
  // Tapping empty sky does nothing (closes an open card); constellations open from the reticle label.
  function tap(x, y) {
    if (hand) return;
    if (view === 'gaze') { peek(); return; }
    let best = null, bd = Infinity;
    const consider = (list, rad, get) => { for (const q of list) { const dd = Math.hypot(q.x - x, q.y - y); if (dd < rad && dd < bd) { bd = dd; best = get(q); } } };
    consider(satPts, 34, q => q.train ? { kind: 'train', g: q.train } : { kind: 'sat', sat: q.sat });
    consider(plPtsLast, 34, q => q.o);
    if (!best) consider(starPts, 24, q => ({ kind: 'star', i: q.i }));
    if (best) { openObj(best); return; }
    if (sel) closeObj();
  }

  // ---------- drawing ----------
  function updateCamera() {
    if (sensor && performance.now() - lastEvt > 3000) sensor = false;
    if (sensor && target) {
      const k = 0.22;
      const v = norm(cam.v.map((c, i) => c + (target.v[i] - c) * k));
      let u = cam.u.map((c, i) => c + (target.u[i] - c) * k);
      u = norm(u.map((c, i) => c - dot(u, v) * v[i]));
      cam = { v, u, r: cross(v, u) };
      const h = altaz(v); look = { alt: h.alt, az: h.az };
    } else {
      const v = enu(look.alt, look.az);
      let r = cross(v, [0, 0, 1]); if (Math.hypot(...r) < 1e-6) r = [Math.sin((look.az + 90) * D2R), Math.cos((look.az + 90) * D2R), 0];
      r = norm(r);
      cam = { v, r, u: cross(r, v) };
    }
  }

  function draw() {
    updateCamera();
    if (cam0) fov = camFovNow();
    if (calib) { drawCalib(); return; }
    const d = new Date(st.t), obs = st.place;
    const map = S.horizonMapper(d, obs);
    const sun = S.bodyAltAz(A.Body.Sun, d, obs);
    const sky = skyState(sun.alt);
    const f = (H / 2) / Math.tan(fov * D2R / 2);
    const cx = W / 2, cy = H / 2;
    const P = (vec) => { const z = dot(vec, cam.v); if (z <= 0.02) return null; return [cx + f * dot(vec, cam.r) / z, cy - f * dot(vec, cam.u) / z, z]; };
    const PA = (alt, az) => P(enu(alt, az));
    const cosLim = Math.cos(Math.min(89, Math.hypot(fov, fov * W / H) / 2 + 4) * D2R);
    const inView = (vec) => dot(vec, cam.v) > cosLim;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // sky background (brightens toward the horizon at twilight)
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const topC = sky.top, botC = sky.bottom;
    const hTop = altaz(screenDir(cx, 0)).alt, hBot = altaz(screenDir(cx, H)).alt;
    const k = (a) => Math.max(0, Math.min(1, 1 - a / 60));
    g.addColorStop(0, rgb(topC.map((c, i) => c + (botC[i] - c) * k(hTop) * 0.8)));
    g.addColorStop(1, rgb(topC.map((c, i) => c + (botC[i] - c) * k(hBot) * 0.8)));
    if (cam0) { ctx.clearRect(0, 0, W, H); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0, W, H); }
    else { ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    const nightK = Math.max(0, Math.min(1, (sky.lm - 1) / 4));

    // Milky Way (faint)
    if (nightK > 0.1 && !cam0) {
      DATA.mw.forEach((polys, li) => {
        ctx.fillStyle = `rgba(190,200,230,${(0.03 + li * 0.006) * nightK * Math.max(0, SKIES[st.sky].lm - 3.5) / 3})`;
        ctx.beginPath();
        for (const ring of polys) {
          let first = true;
          for (const [ra, dec] of ring) { const h = map(ra < 0 ? ra + 360 : ra, dec); const p = PA(h.alt, h.az); if (!p) { first = true; continue; } if (first) { ctx.moveTo(p[0], p[1]); first = false; } else ctx.lineTo(p[0], p[1]); }
          ctx.closePath();
        }
        ctx.fill('evenodd');
      });
    }

    // what is under the reticle
    const cEq = horToEq(d, obs, look.alt, look.az);
    const aimCon = conAt(cEq.ra, cEq.dec);
    const active = st.focusCon || aimCon;

    // constellation figures
    const stroke = (c) => { for (const seg of c.lines) { let prev = null; for (const [ra, dec] of seg) { const h = map(ra, dec); const p = PA(h.alt, h.az); if (p && prev) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); } prev = p; } } };
    const gaze = view === 'gaze';
    if (view === 'all') {
      ctx.lineWidth = 1; ctx.strokeStyle = `rgba(150,170,210,${0.12 + 0.1 * nightK})`;
      ctx.beginPath(); for (const c of DATA.cons) if (c.id !== active) stroke(c); ctx.stroke();
    }
    if (active && !gaze) {
      ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(246,232,200,.9)';
      ctx.beginPath(); for (const c of DATA.cons) if (c.id === active) stroke(c); ctx.stroke();
      ctx.setLineDash([2, 5]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(242,196,109,.4)';
      ctx.beginPath();
      for (const c of DATA.cons) if (c.id === active) for (const ring of c.bounds) { let prev = null; for (const [ra, dec] of ring.concat([ring[0]])) { const h = map(ra, dec); const p = PA(h.alt, h.az); if (p && prev) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); } prev = p; } }
      ctx.stroke(); ctx.setLineDash([]);
    }

    // stars (brighter than the phone's small screen needs: scale radius with fov)
    const zoom = Math.max(0.8, Math.min(2.2, 62 / fov));
    const lm = sky.lm;
    const labels = [];
    starPts = [];
    for (let i = 0; i < DATA.stars.length; i++) {
      const s = DATA.stars[i]; if (s[2] > lm) break;
      const h = map(s[0], s[1]); if (h.alt < -1) continue;
      const vec = enu(h.alt, h.az); if (!inView(vec)) continue;
      const p = P(vec); if (!p) continue;
      const air = 1 / Math.max(Math.sin((Math.max(h.alt, 0) + 244 / (165 + 47 * Math.pow(Math.max(h.alt, 0.01), 1.1))) * D2R), 0.02);
      const m = s[2] + 0.25 * (air - 1); if (m > lm) continue;
      const kk = Math.pow(10, -0.4 * (m - lm));
      const rad = Math.min(0.6 + Math.sqrt(kk) * 0.6, 5) * zoom;
      const a = Math.min(1, 0.3 + kk * 0.12);
      const c = STAR_RGB[i];
      if (rad > 2) { const gg = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad * 3); gg.addColorStop(0, rgb(c, a * 0.45)); gg.addColorStop(1, rgb(c, 0)); ctx.fillStyle = gg; ctx.fillRect(p[0] - rad * 3, p[1] - rad * 3, rad * 6, rad * 6); }
      ctx.fillStyle = rgb(c, a); ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, Math.PI * 2); ctx.fill();
      const inf = DATA.info[i];
      if (inf) starPts.push({ x: p[0], y: p[1], i });
      if (inf && !gaze && ((DATA.cons[s[4]] && DATA.cons[s[4]].id === active && s[2] < 3.6) || s[2] < 1.5)) labels.push([p[0], p[1], starLabel(i)]);
    }
    ctx.font = '12px "Zen Kaku Gothic New", sans-serif'; ctx.fillStyle = 'rgba(232,230,222,.85)'; ctx.textAlign = 'left';
    for (const [x, y, t] of labels) ctx.fillText(t, x + 8, y - 6);

    // constellation name at its label point
    if (active && active !== aimCon && !gaze) {
      const c0 = DATA.cons.find(c => c.id === active);
      const h = map(c0.lab[0], c0.lab[1]); const p = PA(h.alt, h.az);
      if (p) { ctx.font = '700 20px "Shippori Mincho", serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(246,212,140,.95)'; ctx.fillText(conName(c0), p[0], p[1] + 26); ctx.textAlign = 'left'; }
    }

    // meteor radiants
    for (const sh of S.SHOWERS) {
      if (gaze || !S.showerActive(sh, d)) continue;
      const h = map(sh.ra, sh.dec); const p = PA(h.alt, h.az); if (!p || h.alt < 0) continue;
      ctx.strokeStyle = 'rgba(242,196,109,.8)'; ctx.lineWidth = 1.2;
      for (let q = 0; q < 8; q++) { const an = q * Math.PI / 4; ctx.beginPath(); ctx.moveTo(p[0] + Math.cos(an) * 9, p[1] + Math.sin(an) * 9); ctx.lineTo(p[0] + Math.cos(an) * 20, p[1] + Math.sin(an) * 20); ctx.stroke(); }
      ctx.fillStyle = 'rgba(242,196,109,.95)'; ctx.font = '12px "Zen Kaku Gothic New", sans-serif'; ctx.fillText(t('arRadiant', showerName(sh)), p[0] + 24, p[1] + 4);
    }

    // planets, Moon, Sun
    const plPts = [];
    ctx.font = '500 13px "Zen Kaku Gothic New", sans-serif';
    for (const pl of S.PLANETS) {
      const h = S.bodyAltAz(pl.body, d, obs); if (h.alt < -1) continue; const p = PA(h.alt, h.az); if (!p) continue;
      const m = A.Illumination(pl.body, d).mag; const rad = Math.max(2, Math.min(6, 3 - m * 0.6)) * zoom;
      ctx.fillStyle = 'rgba(255,236,200,.95)'; ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, Math.PI * 2); ctx.fill();
      if (!gaze) { ctx.fillStyle = 'rgba(255,226,170,.95)'; ctx.fillText(`${planetName(pl)} ${magL(m)}`, p[0] + 10, p[1] + 4); }
      plPts.push({ name: planetName(pl), body: pl.body, m, x: p[0], y: p[1], o: { kind: 'planet', body: pl.body, ja: pl.ja, en: pl.en } });
    }
    const mh = S.bodyAltAz(A.Body.Moon, d, obs);
    const mp = PA(mh.alt, mh.az);
    if (mp && mh.alt > -1) {
      const ill = A.Illumination(A.Body.Moon, d).phase_fraction;
      const rr = Math.max(6, f * Math.tan(0.26 * D2R));
      const gg = ctx.createRadialGradient(mp[0], mp[1], rr, mp[0], mp[1], rr * 6); gg.addColorStop(0, `rgba(230,235,245,${0.22 * ill})`); gg.addColorStop(1, 'rgba(230,235,245,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(mp[0], mp[1], rr * 6, 0, Math.PI * 2); ctx.fill();
      // lit side toward the Sun, drawn in screen space
      const sp = P(enu(sun.alt, sun.az)); let ang;
      if (sp) ang = Math.atan2(sp[1] - mp[1], sp[0] - mp[0]);
      else { const sv = enu(sun.alt, sun.az); ang = Math.atan2(-dot(sv, cam.u), dot(sv, cam.r)); }
      ctx.save(); ctx.translate(mp[0], mp[1]); ctx.rotate(ang);
      ctx.fillStyle = 'rgba(40,44,56,.95)'; ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill();
      const kx = 2 * ill - 1; ctx.fillStyle = '#eef0f4'; ctx.beginPath(); ctx.arc(0, 0, rr, -Math.PI / 2, Math.PI / 2, false); ctx.ellipse(0, 0, Math.abs(kx) * rr, rr, 0, Math.PI / 2, -Math.PI / 2, kx > 0); ctx.fill();
      ctx.restore();
      if (!gaze) { ctx.fillStyle = 'rgba(230,234,242,.9)'; ctx.fillText(t('arMoonLabel', Math.round(ill * 100)), mp[0] + rr + 8, mp[1] + 4); }
      plPts.push({ name: t('moon'), body: A.Body.Moon, m: A.Illumination(A.Body.Moon, d).mag, x: mp[0], y: mp[1], o: { kind: 'moon', body: A.Body.Moon, ja: '月' } });
    }
    if (sun.alt > -1) { const p = PA(sun.alt, sun.az); if (p) { const gg = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 60); gg.addColorStop(0, 'rgba(255,245,220,1)'); gg.addColorStop(1, 'rgba(255,220,160,0)'); ctx.fillStyle = gg; ctx.fillRect(p[0] - 60, p[1] - 60, 120, 120); ctx.fillStyle = '#ffd9a0'; ctx.fillText(t('arSunLabel'), p[0] + 20, p[1] + 4); } }

    // satellites now: sunlit ones against a dark sky are drawn as stars; the stations always;
    // everything else above the horizon appears as a faint ring only near the centre, so it can be aimed at
    satPts = [];
    const nearC = Math.cos(Math.min(18, fov * 0.3) * D2R);
    for (const sat of st.sats) {
      const lk = S.satLook(sat, d, obs); if (!lk || lk.alt < 0) continue;
      const vis = lk.sunlit && sun.alt < -6 && lk.mag < lm + 0.5;
      const feat = S.FEATURED[sat.id], sel = satSel && satSel.id === sat.id;
      const vec = enu(lk.alt, lk.az);
      if (gaze ? !vis : (!vis && !feat && !sel && dot(vec, cam.v) < nearC)) continue;
      const p = P(vec); if (!p) continue;
      if (vis) { ctx.fillStyle = '#f4f8ff'; ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(2, 3 - lk.mag * 0.6) * zoom, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.strokeStyle = feat || sel ? 'rgba(200,215,240,.7)' : 'rgba(180,200,235,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p[0], p[1], feat || sel ? 5 : 3.5, 0, Math.PI * 2); ctx.stroke(); }
      if (feat && !gaze) { ctx.fillStyle = '#f2c46d'; ctx.fillText(fShort(feat) + (vis ? ` ${magL(lk.mag)}` : t('arInShadowL')), p[0] + 10, p[1] - 8); }
      satPts.push({ sat, lk, vis, x: p[0], y: p[1] });
    }
    // Starlink trains (bunched members only, sunlit against a dark sky)
    if (TR) for (const c of TR.active(d)) {
      let head = null;
      for (const sat of c.members) {
        const lk = S.satLook(sat, d, obs); if (!lk || lk.alt < 0 || !lk.sunlit || sun.alt > -6) continue;
        const p = PA(lk.alt, lk.az); if (!p) continue;
        ctx.fillStyle = 'rgba(236,244,255,.95)'; ctx.beginPath(); ctx.arc(p[0], p[1], 2 * zoom, 0, Math.PI * 2); ctx.fill();
        if (!head) head = p;
      }
      if (head && !gaze) { ctx.fillStyle = 'rgba(236,244,255,.85)'; ctx.fillText(t('trainShort'), head[0] + 10, head[1] - 8); satPts.push({ train: c.g.id, x: head[0], y: head[1] }); }
    }
    // the selected satellite: its path for the next few minutes, with a marker on "now"
    if (satSel && !gaze) {
      ctx.strokeStyle = 'rgba(242,196,109,.8)'; ctx.lineWidth = 1.6; ctx.setLineDash([4, 5]); ctx.beginPath();
      let prev = null, tip = null;
      for (let s2 = -120; s2 <= 360; s2 += 15) {
        const lk2 = S.satLook(satSel, new Date(d.getTime() + s2 * 1000), obs);
        const q = lk2 && lk2.alt > -2 ? P(enu(lk2.alt, lk2.az)) : null;
        if (q && prev) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); }
        if (s2 === 60) tip = q;
        prev = q;
      }
      ctx.stroke(); ctx.setLineDash([]);
      const me = satPts.find(q => q.sat && q.sat.id === satSel.id);
      if (me) {
        ctx.strokeStyle = '#f2c46d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(me.x, me.y, 14, 0, Math.PI * 2); ctx.stroke();
        if (tip) { const an = Math.atan2(tip[1] - me.y, tip[0] - me.x); ctx.save(); ctx.translate(me.x + Math.cos(an) * 22, me.y + Math.sin(an) * 22); ctx.rotate(an); ctx.fillStyle = '#f2c46d'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill(); ctx.restore(); }
      }
    }

    plPtsLast = plPts;
    if (sel && performance.now() - lastCard > (sel.kind === 'sat' ? 500 : 1500)) { renderCard(d); lastCard = performance.now(); }
    // search target: a ring when in view, otherwise an arrow at the edge pointing the way
    if (arTarget && !gaze) drawTarget(d, P, cx, cy);

    // horizon line, ground shade, compass ticks
    ctx.lineWidth = gaze ? 1 : 1.2; ctx.strokeStyle = gaze ? 'rgba(190,205,235,.22)' : 'rgba(190,205,235,.55)';
    ctx.beginPath(); let prevH = null;
    for (let az = 0; az <= 360; az += 2) { const p = PA(0, az); if (p && prevH) { ctx.moveTo(prevH[0], prevH[1]); ctx.lineTo(p[0], p[1]); } prevH = p; }
    ctx.stroke();
    ctx.textAlign = 'center';
    for (let az = 0; az < 360; az += 15) {
      const p = PA(0, az); if (!p) continue;
      const card = az % 90 === 0, mid = az % 45 === 0;
      if (gaze) { if (mid) { ctx.font = card ? '14px "Zen Kaku Gothic New", sans-serif' : '11px "Zen Kaku Gothic New", sans-serif'; ctx.fillStyle = card ? 'rgba(210,218,236,.42)' : 'rgba(190,200,222,.3)'; ctx.fillText(dir8(az), p[0], p[1] + 22); } continue; }
      ctx.strokeStyle = 'rgba(190,205,235,.5)'; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] + (card ? 12 : 6)); ctx.stroke();
      if (mid) { ctx.font = card ? '700 16px "Zen Kaku Gothic New", sans-serif' : '12px "Zen Kaku Gothic New", sans-serif'; ctx.fillStyle = card ? 'rgba(236,240,248,.95)' : 'rgba(180,192,215,.8)'; ctx.fillText(dir8(az), p[0], p[1] + (card ? 30 : 24)); }
    }
    ctx.textAlign = 'left';
    const below = altaz(screenDir(cx, H)).alt;
    if (below < 0 && !cam0) { // darken the ground
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); let first = true;
      for (let x = 0; x <= W; x += W / 24) { let y = H; for (let yy = 0; yy <= H; yy += 8) { if (altaz(screenDir(x, yy)).alt < 0) { y = yy; break; } } if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); }
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    }

    // guide to the next space-station pass
    if (gaze) $('ar-guide').hidden = true; else guide(d, P, f, cx, cy);

    // reticle readout
    const where = t('arWhere', dir(look.az), Math.round(look.az), Math.round(look.alt));
    $('ar-where').textContent = where;
    const lab = $('ar-aim');
    // nearest satellite or planet to the reticle, else the constellation
    const rad = 40;
    aimObj = null;
    for (const q of satPts) { if (q.train) continue; const dd = Math.hypot(q.x - cx, q.y - cy); if (dd < rad && (!aimObj || dd < aimObj.d)) aimObj = { d: dd, sat: q.sat, lk: q.lk, vis: q.vis }; }
    if (!aimObj) for (const q of plPts) { const dd = Math.hypot(q.x - cx, q.y - cy); if (dd < rad && (!aimObj || dd < aimObj.d)) aimObj = { d: dd, pl: q }; }
    aimTarget = null;
    if (aimObj && aimObj.sat) {
      const feat = S.FEATURED[aimObj.sat.id], info = describeSat(aimObj.sat, feat);
      const nm = feat ? fShort(feat) : (info.ja || aimObj.sat.name);
      const state = aimObj.vis ? t('arSatSeen', mag(aimObj.lk.mag)) : !aimObj.lk.sunlit ? t('arSatShadow') : t('arSatBright');
      lab.innerHTML = `<b>${esc(nm)}</b><span>${esc(t('arSatLine', info.kind, Math.round(aimObj.lk.height), state))}</span><span class="more">${t('arMore')}</span>`;
      aimTarget = { kind: 'sat', sat: aimObj.sat };
    } else if (aimObj && aimObj.pl) {
      const km = A.GeoVector(aimObj.pl.body, d, true).Length() * A.KM_PER_AU;
      lab.innerHTML = `<b>${esc(aimObj.pl.name)}</b><span>${t('arPlLine', mag(aimObj.pl.m), kmText(km))}</span><span class="more">${t('arMore')}</span>`;
      aimTarget = aimObj.pl.o;
    } else if (aimCon) { const c = DATA.cons.find(c => c.id === aimCon); lab.innerHTML = `<b>${esc(conName(c))}</b><span class="more">${t('arMore')}</span>`; aimTarget = { kind: 'con', id: aimCon }; }
    else lab.innerHTML = '';
    lab.classList.toggle('go', !!aimTarget);
    const acc = compassAcc;
    $('ar-acc').hidden = !(sensor && typeof acc === 'number' && (acc < 0 || acc > 20));
  }

  function guide(d, P, f, cx, cy) {
    const now = d.getTime();
    const p = st.passes.filter(p => S.FEATURED[p.sat.id] && p.end.t > now && p.start.t - now < 30 * 60e3)[0];
    const el = $('ar-guide');
    if (!p) { el.hidden = true; return; }
    let alt, az, txt;
    const name = fShort(S.FEATURED[p.sat.id]);
    if (now >= p.start.t) {
      const lk = S.satLook(p.sat, d, st.place); alt = lk.alt; az = lk.az; txt = t('arGuideNow', name, mag(lk.mag));
    } else {
      alt = p.start.alt; az = p.start.az;
      const s = Math.round((p.start.t - now) / 1000); txt = t('arGuideSoon', name, s >= 60 ? Math.floor(s / 60) : 0, s % 60, dir(az));
    }
    el.hidden = false; el.querySelector('span').textContent = txt;
    // draw the predicted track
    ctx.strokeStyle = 'rgba(242,196,109,.75)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath();
    let prev = null; for (const s of p.track) { const q = P(enu(s.alt, s.az)); if (q && prev) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); } prev = q; }
    ctx.stroke(); ctx.setLineDash([]);
    const vec = enu(alt, az); const q = P(vec);
    const arrow = el.querySelector('i');
    if (q && q[0] > 20 && q[0] < W - 20 && q[1] > 60 && q[1] < H - 60) {
      ctx.strokeStyle = '#f2c46d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q[0], q[1], 16, 0, Math.PI * 2); ctx.stroke();
      arrow.style.transform = 'rotate(0deg)'; arrow.dataset.here = 'true';
    } else {
      const x = dot(vec, cam.r), y = dot(vec, cam.u); const ang = Math.atan2(x, y) / D2R;
      arrow.style.transform = `rotate(${ang}deg)`; arrow.dataset.here = 'false';
    }
  }

  // ---------- card (shared renderer) ----------
  const card = $('ar-sat');
  const cardHandlers = { con: (id) => { closeObj(); focusCon(id); }, pass: () => { } };
  function openObj(o) {
    if (TP) TP.opened(o);
    sel = o; satSel = o.kind === 'sat' ? o.sat : null; lastCard = 0;
    const c = $('card'); if (c) c.hidden = true; st.focusCon = null;
    card.hidden = false; root.classList.add('sat-open'); card.scrollTop = 0;
    renderCard(new Date(st.t));
  }
  function closeObj() { sel = null; satSel = null; card.hidden = true; root.classList.remove('sat-open'); }
  function renderCard(d) { if (sel) OI.render(card, sel, d, cardHandlers); }
  $('ar-sat-close').addEventListener('click', closeObj);
  $('ar-aim').addEventListener('click', () => {
    if (!aimTarget) return;
    if (aimTarget.kind === 'con') { closeObj(); focusCon(aimTarget.id); }
    else openObj(aimTarget);
  });
  function setTarget(o) { if (view === 'gaze') setView('all', true); arTarget = o; if (o.kind !== 'con') openObj(o); hint(t('arGuideTo', OI.nameOf(o))); }
  function drawTarget(d, P, cx, cy) {
    const p = OI.posOf(arTarget, d); if (!p) return;
    const vec = enu(p.alt, p.az), q = P(vec);
    const name = OI.nameOf(arTarget) + (p.alt < 0 ? t('belowTag') : '');
    ctx.font = '600 13px "Zen Kaku Gothic New", sans-serif';
    if (q && q[0] > 30 && q[0] < W - 30 && q[1] > 70 && q[1] < H - 70) {
      const k = 0.5 + 0.5 * Math.sin(performance.now() / 350);
      ctx.strokeStyle = `rgba(242,196,109,${0.6 + 0.4 * k})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q[0], q[1], 20 + 4 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#f2c46d'; ctx.textAlign = 'center'; ctx.fillText(name, q[0], q[1] - 32); ctx.textAlign = 'left';
      return;
    }
    // off screen: arrow on a ring around the centre
    const x = dot(vec, cam.r), y = dot(vec, cam.u), z = dot(vec, cam.v);
    let ang = Math.atan2(-y, x); if (z < 0 && Math.hypot(x, y) < 1e-3) ang = Math.PI / 2;
    const rr = Math.min(W, H) * 0.38, ax = cx + Math.cos(ang) * rr, ay = cy + Math.sin(ang) * rr;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang); ctx.fillStyle = '#f2c46d';
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-6, -11); ctx.lineTo(-2, 0); ctx.lineTo(-6, 11); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#f2c46d'; ctx.textAlign = 'center'; ctx.fillText(name, ax - Math.cos(ang) * 30, ay - Math.sin(ang) * 30 + 4); ctx.textAlign = 'left';
  }

  function showFix() { const n = $('ar-fov'); n.textContent = t('arFix', (userOffset >= 0 ? '+' : '') + userOffset.toFixed(1)); n.hidden = false; clearTimeout(fovNote.t); fovNote.t = setTimeout(() => { n.hidden = true; }, 2500); }
  function hint(t) { const h = $('ar-hint'); h.textContent = t; h.hidden = !t; clearTimeout(hint.t); if (t) hint.t = setTimeout(() => { h.hidden = true; }, 5000); }

  function frame() { if (!on) return; draw(); raf = requestAnimationFrame(frame); }

  async function open() {
    on = true; root.hidden = false; document.body.classList.add('ar-on'); resize(); frame();
    const needsTap = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
    if (needsTap) { $('ar-perm').hidden = false; }
    else if ('DeviceOrientationEvent' in window && matchMedia('(pointer: coarse)').matches) enableSensors();
    else hint(t('arDesk'));
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (e) { wake = null; }
  }
  function close() {
    cameraOff(); closeObj(); arTarget = null; $('ar-undo').hidden = true;
    if (view === 'gaze') { let v = 'all'; try { v = localStorage.getItem('zenith.arview') === 'aim' ? 'aim' : 'all'; } catch (e) { } setView(v, true); }
    on = false; root.hidden = true; document.body.classList.remove('ar-on'); cancelAnimationFrame(raf);
    removeEventListener('deviceorientationabsolute', onAbs); removeEventListener('deviceorientation', onRel);
    sensor = false; headingOffset = null; userOffset = 0; calNeeded(false);
    try { wake && wake.release(); } catch (e) { } wake = null;
  }
  $('ar-perm').addEventListener('click', enableSensors);
  $('ar-close').addEventListener('click', close);
  // ---------- camera background ----------
  function fovNote() { const n = $('ar-fov'); n.textContent = t('arFov', fov.toFixed(0)); n.hidden = false; clearTimeout(fovNote.t); fovNote.t = setTimeout(() => { n.hidden = true; }, 2500); }
  async function cameraOn() {
    const btn = $('ar-cam');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { hint(t('arCamNo')); return; }
    try {
      cam0 = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      const v = $('ar-video'); v.srcObject = cam0; v.hidden = false; await v.play().catch(() => { });
      zoomK = 1; applyZoom(); btn.setAttribute('aria-pressed', 'true'); root.classList.add('cam'); $('ar-fovbtn').hidden = false;
      hint(t('arCamHint'));
    } catch (e) {
      cam0 = null; btn.setAttribute('aria-pressed', 'false');
      hint(e && e.name === 'NotAllowedError' ? t('arCamDenied') : t('arCamFail'));
    }
  }
  function cameraOff() {
    if (cam0) cam0.getTracks().forEach(t => t.stop());
    cam0 = null; const v = $('ar-video'); v.srcObject = null; v.hidden = true;
    $('ar-cam').setAttribute('aria-pressed', 'false'); root.classList.remove('cam'); fov = 62;
    endCalib(); endHand(false); closeMenu(); zoomK = 1; applyZoom(); $('ar-fovbtn').hidden = true;
  }
  $('ar-cam').addEventListener('click', () => { cam0 ? cameraOff() : cameraOn(); });
  $('ar-red').addEventListener('click', () => { const r = root.classList.toggle('red'); $('ar-red').setAttribute('aria-pressed', String(r)); });

  // ---------- display level (v28) ----------
  const VIEWS = ['all', 'aim', 'gaze'], VL = { all: 'viewAll', aim: 'viewAim', gaze: 'viewGaze' }, VT = { all: 'viewToastAll', aim: 'viewToastAim', gaze: 'viewToastGaze' };
  function note(txt, ms = 2500) { const n = $('ar-fov'); n.textContent = txt; n.hidden = false; clearTimeout(fovNote.t); fovNote.t = setTimeout(() => { n.hidden = true; }, ms); }
  function setView(v, quiet) {
    view = v; root.dataset.view = v; root.classList.toggle('gaze', v === 'gaze'); root.classList.remove('peek');
    $('ar-view-l').textContent = t(VL[v]);
    if (v === 'gaze') { closeObj(); closeMenu(); }
    if (v !== 'gaze') { try { localStorage.setItem('zenith.arview', v); } catch (e) { } }
    if (!quiet) note(t(VT[v]), v === 'gaze' ? 3000 : 1800);
  }
  function peek() { root.classList.add('peek'); clearTimeout(peekT); peekT = setTimeout(() => root.classList.remove('peek'), 3000); }
  $('ar-view').addEventListener('click', () => setView(VIEWS[(VIEWS.indexOf(view) + 1) % 3]));
  // while peeking, any control press keeps the controls up a little longer
  root.addEventListener('click', e => { if (view === 'gaze' && root.classList.contains('peek') && e.target.closest('button')) peek(); }, true);
  setView(view, true);

  // ---------- camera zoom & field of view (v27) ----------
  function applyZoom() {
    const v = $('ar-video'); v.style.transform = zoomK > 1.001 ? `scale(${zoomK})` : '';
    const z = $('ar-zoom'); z.hidden = !(cam0 && zoomK > 1.02 && !calib && !hand);
    if (!z.hidden) z.innerHTML = t('zoomBack', zoomK.toFixed(1), !!cal);
  }
  $('ar-zoom').addEventListener('click', () => setZoom(1));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fovPair = (vf) => { const f = fOf(vf); return [vf.toFixed(1), (2 * Math.atan((W / 2) / f) / D2R).toFixed(1)]; };
  // menu
  const menu = $('ar-fovmenu');
  function openMenu() {
    closeObj();
    const base = camBaseFov();
    $('fm-h').textContent = cal ? t('fmTitleReg') : t('fmTitleNone');
    const [v, h] = fovPair(base);
    $('fm-sub').innerHTML = esc(t('fmSub', v, h)) + '<br>' + esc(cal ? (cal.src === 'moon' ? t('fmSrcMoon', cal.date) : t('fmSrcHand', cal.date)) : t('fmSrcNone'));
    let legacy = null; try { legacy = localStorage.getItem(LEGACY_FOV); } catch (e) { }
    $('fm-clear').hidden = !cal && !legacy;
    menu.hidden = false;
  }
  function closeMenu() { menu.hidden = true; }
  $('ar-fovbtn').addEventListener('click', () => { menu.hidden ? openMenu() : closeMenu(); });
  $('fm-close').addEventListener('click', closeMenu);
  $('fm-moon').addEventListener('click', () => { closeMenu(); startCalib(); });
  $('fm-hand').addEventListener('click', () => { closeMenu(); startHand(); });
  let undoT = 0;
  $('fm-clear').addEventListener('click', () => {
    let legacy = null; try { legacy = localStorage.getItem(LEGACY_FOV); localStorage.removeItem(LEGACY_FOV); } catch (e) { }
    const prev = cal; saveCal(null); closeMenu(); applyZoom();
    const u = $('ar-undo'); u.querySelector('span').textContent = t('fmCleared'); u.hidden = false;
    u.querySelector('button').onclick = () => { saveCal(prev); try { if (legacy) localStorage.setItem(LEGACY_FOV, legacy); } catch (e) { } u.hidden = true; applyZoom(); };
    clearTimeout(undoT); undoT = setTimeout(() => { u.hidden = true; }, 5000);
  });
  // by hand: a slider for nights without the Moon (the pre-v27 way, made easier)
  function startHand() {
    if (!cam0) return;
    hint(''); hand = { fov: camBaseFov() }; setZoom(1);
    const r = $('hand-r'); r.value = String(hand.fov); $('hand-v').textContent = t('fovV', hand.fov.toFixed(1));
    root.classList.add('hand'); $('ar-hand').hidden = false; applyZoom();
  }
  function endHand(save) {
    if (!hand) return;
    if (save) {
      const fn = toFn(fOf(hand.fov));
      if (fn) saveCal({ fn: Math.round(fn * 1e4) / 1e4, src: 'hand', date: today() });
      else { try { localStorage.setItem(LEGACY_FOV, String(Math.round(hand.fov * 10) / 10)); } catch (e) { } }
    }
    hand = null; root.classList.remove('hand'); $('ar-hand').hidden = true; applyZoom();
  }
  $('hand-r').addEventListener('input', e => { if (hand) { hand.fov = +e.target.value; $('hand-v').textContent = t('fovV', hand.fov.toFixed(1)); } });
  $('hand-save').addEventListener('click', () => endHand(true));
  $('hand-cancel').addEventListener('click', () => endHand(false));

  // with the Moon: put it in the left ring, turn, put it in the right ring. Only the phone's own rotation
  // between the two presses is used, so compass error cancels out; the Moon is so far away that turning
  // your body (which also moves the phone sideways) does not bias the result.
  const RING = { l: 0.16, r: 0.84, y: 0.4 };
  function steady() {
    if (!recent.length) return target;
    const sum = (k) => norm(recent.reduce((a, q) => a.map((c, i) => c + q.b[k][i]), [0, 0, 0]));
    const v = sum('v'); let u = sum('u'); u = norm(u.map((c, i) => c - dot(u, v) * v[i]));
    return { v, u, r: cross(v, u) };
  }
  function moonText() {
    const now = new Date(), obs = st.place;
    const m = S.bodyAltAz(A.Body.Moon, now, obs);
    if (m.alt > 2) return { up: true, html: t('cbP1', esc(dir(m.az)), Math.round(m.alt)) };
    let when = '';
    try {
      const r = A.SearchRiseSet(A.Body.Moon, new A.Observer(obs.lat, obs.lon, 0), +1, A.MakeTime(now), 2);
      if (r) when = t('cbRise', md(r.date), hm(r.date), dir(S.bodyAltAz(A.Body.Moon, r.date, obs).az));
    } catch (e) { }
    return { up: false, html: esc(t('cbNoMoon', when)) };
  }
  function startCalib() {
    if (!cam0) { hint(t('cbNoCam')); return; }
    closeObj(); endHand(false); setZoom(1);
    hint(''); calib = { step: 1 }; root.classList.add('calib'); $('ar-calib').hidden = false; applyZoom(); renderCalib();
  }
  function endCalib() { if (!calib) return; calib = null; root.classList.remove('calib'); $('ar-calib').hidden = true; applyZoom(); }
  function renderCalib() {
    const c = calib; if (!c) return;
    const L = $('cb-l'), R = $('cb-r'), go = $('cb-go');
    L.style.left = (W * RING.l) + 'px'; R.style.left = (W * RING.r) + 'px'; L.style.top = R.style.top = (H * RING.y) + 'px';
    L.hidden = R.hidden = c.step > 2;
    L.classList.toggle('dim', c.step !== 1); R.classList.toggle('dim', c.step !== 2);
    $('cb-meter').hidden = c.step !== 2;
    $('cb-again').hidden = c.step !== 3;
    $('cb-cancel').hidden = c.step === 3;
    go.disabled = false;
    if (c.step === 1) {
      $('cb-step').textContent = '1 / 2 · ' + t('cbTitle'); $('cb-h').textContent = t('cbH1');
      const mt = moonText();
      if (!sensor) { $('cb-p').textContent = t('cbNoSensor'); go.disabled = true; }
      else { $('cb-p').innerHTML = mt.html; go.disabled = !mt.up; }
      go.textContent = t('cbGo');
    } else if (c.step === 2) {
      $('cb-step').textContent = '2 / 2 · ' + t('cbTitle'); $('cb-h').textContent = t('cbH2'); $('cb-p').innerHTML = t('cbP2'); go.textContent = t('cbGo');
    } else if (c.step === 3) {
      const [v, h] = fovPair(c.vf);
      $('cb-step').textContent = t('cbTitle'); $('cb-h').textContent = t('cbDone');
      $('cb-p').innerHTML = esc(t('fmSub', v, h)) + '<br>' + esc(t('cbDoneP')); go.textContent = t('cbOk');
    } else {
      $('cb-step').textContent = t('cbTitle'); $('cb-h').textContent = t('cbFail'); $('cb-p').textContent = c.why; go.textContent = t('cbAgain');
    }
  }
  function drawCalib() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(0, 0, W, H);
    if (calib.step === 2 && calib.b1 && target) {
      const a = Math.acos(Math.max(-1, Math.min(1, dot(calib.b1.v, target.v)))) / D2R;
      $('cb-meter').innerHTML = `${a.toFixed(1)}°<small>${esc(t('cbTurned'))}</small>`;
    }
  }
  function solveCalib(b1, b2) {
    const x1 = W * RING.l - W / 2, x2 = W * RING.r - W / 2, y = H * RING.y - H / 2;
    const at = (b, x, f) => norm(b.v.map((c, i) => c + (x / f) * b.r[i] - (y / f) * b.u[i]));
    const turned = Math.acos(Math.max(-1, Math.min(1, dot(b1.v, b2.v)))) / D2R;
    if (turned < 10) return { why: t('cbFailSmall') };
    let best = null;
    for (let vf = 12; vf <= 140; vf += 0.05) {
      const f = fOf(vf), e = Math.acos(Math.max(-1, Math.min(1, dot(at(b1, x1, f), at(b2, x2, f))))) / D2R;
      if (!best || e < best.e) best = { vf, f, e };
    }
    if (best.e > 1.5) return { why: t('cbFailTilt') };
    const fn = toFn(best.f); if (!fn) return { why: t('cbFailOdd') };
    const longFov = 2 * Math.atan(0.5 / fn) / D2R;
    if (longFov < 35 || longFov > 115) return { why: t('cbFailOdd') };
    return { fn, vf: best.vf, e: best.e };
  }
  $('cb-go').addEventListener('click', () => {
    const c = calib; if (!c) return;
    if (c.step === 1) { c.b1 = steady(); c.step = 2; }
    else if (c.step === 2) {
      const r = solveCalib(c.b1, steady());
      if (r.fn) { saveCal({ fn: Math.round(r.fn * 1e4) / 1e4, src: 'moon', date: today() }); c.vf = r.vf; c.step = 3; }
      else { c.why = r.why; c.step = 4; }
    } else if (c.step === 3) { endCalib(); return; }
    else { calib = { step: 1 }; }
    renderCalib();
  });
  $('cb-again').addEventListener('click', () => { calib = { step: 1 }; renderCalib(); });
  $('cb-cancel').addEventListener('click', endCalib);
  addEventListener('resize', () => { if (on) { resize(); renderCalib(); } });
  document.addEventListener('visibilitychange', async () => { if (on && document.visibilityState === 'visible' && navigator.wakeLock) { try { wake = await navigator.wakeLock.request('screen'); } catch (e) { } } });
  return { open, close, isOn: () => on, setTarget, setView, _look: (alt, az) => { look = { alt, az }; }, _cal: { solveCalib, startCalib, get cal() { return cal; }, set target(b) { target = b; sensor = true; lastEvt = performance.now(); recent.length = 0; } } };
}
