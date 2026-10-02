// Astronomy + satellite computations for an observer on the ground.
import * as A from 'astronomy-engine';
import * as SJ from 'satellite.js';

export { A };
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

// ---------- horizon frame ----------
// Returns a function mapping (raDeg, decDeg) J2000 -> {alt, az} (deg), no refraction.
export function horizonMapper(date, obs) {
  const t = A.MakeTime(date);
  const R = A.Rotation_EQJ_HOR(t, new A.Observer(obs.lat, obs.lon, 0)).rot;
  return (ra, dec) => {
    const cr = Math.cos(ra * D2R), sr = Math.sin(ra * D2R), cd = Math.cos(dec * D2R), sd = Math.sin(dec * D2R);
    const x = cd * cr, y = cd * sr, z = sd;
    const hx = R[0][0] * x + R[1][0] * y + R[2][0] * z;
    const hy = R[0][1] * x + R[1][1] * y + R[2][1] * z;
    const hz = R[0][2] * x + R[1][2] * y + R[2][2] * z;
    return { alt: Math.asin(Math.max(-1, Math.min(1, hz))) * R2D, az: (Math.atan2(-hy, hx) * R2D + 360) % 360 };
  };
}

export function bodyAltAz(body, date, obs) {
  const o = new A.Observer(obs.lat, obs.lon, 0);
  const eq = A.Equator(body, date, o, true, true);
  const h = A.Horizon(date, o, eq.ra, eq.dec, 'normal');
  return { alt: h.altitude, az: h.azimuth };
}

export const PLANETS = [
  { body: A.Body.Mercury, ja: '水星', en: 'Mercury' },
  { body: A.Body.Venus, ja: '金星', en: 'Venus' },
  { body: A.Body.Mars, ja: '火星', en: 'Mars' },
  { body: A.Body.Jupiter, ja: '木星', en: 'Jupiter' },
  { body: A.Body.Saturn, ja: '土星', en: 'Saturn' },
];

// ---------- night window ----------
// The night that contains `date`, or the coming night if it is daytime.
export function nightWindow(date, obs) {
  const o = new A.Observer(obs.lat, obs.lon, 0);
  const sunAlt = bodyAltAz(A.Body.Sun, date, obs).alt;
  let setT;
  if (sunAlt < -0.833) {
    setT = A.SearchRiseSet(A.Body.Sun, o, -1, A.MakeTime(new Date(date.getTime() - 20 * 3600e3)), 1.5);
    // make sure it is the latest sunset before `date`
    let next = A.SearchRiseSet(A.Body.Sun, o, -1, setT.AddDays(0.01), 1.5);
    while (next && next.date < date) { setT = next; next = A.SearchRiseSet(A.Body.Sun, o, -1, setT.AddDays(0.01), 1.5); }
  } else {
    setT = A.SearchRiseSet(A.Body.Sun, o, -1, A.MakeTime(date), 1.5);
  }
  const riseT = A.SearchRiseSet(A.Body.Sun, o, +1, setT, 1.5);
  const alt = (a, dir, from) => { const r = A.SearchAltitude(A.Body.Sun, o, dir, from, 1.5, a); return r ? r.date : null; };
  return {
    sunset: setT.date, sunrise: riseT.date,
    civilDusk: alt(-6, -1, setT), nauticalDusk: alt(-12, -1, setT), astroDusk: alt(-18, -1, setT),
    astroDawn: alt(-18, +1, setT), nauticalDawn: alt(-12, +1, setT), civilDawn: alt(-6, +1, setT),
  };
}

export function moonEvents(win, obs) {
  const o = new A.Observer(obs.lat, obs.lon, 0);
  const out = [];
  const start = A.MakeTime(new Date(win.sunset.getTime() - 3600e3));
  const span = (win.sunrise - win.sunset) / 864e5 + 2 / 24;
  const r = A.SearchRiseSet(A.Body.Moon, o, +1, start, span);
  const s = A.SearchRiseSet(A.Body.Moon, o, -1, start, span);
  if (r) out.push({ kind: 'moonrise', t: r.date });
  if (s) out.push({ kind: 'moonset', t: s.date });
  return out;
}

// ---------- satellites ----------
export function parseTLE(text) {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(Boolean);
  const out = [];
  const ck = (l) => { let s = 0; for (let i = 0; i < 68; i++) { const c = l[i]; if (c >= '0' && c <= '9') s += +c; else if (c === '-') s += 1; } return s % 10 === +l[68]; };
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('1 ') && lines[i + 1] && lines[i + 1].startsWith('2 ')) {
      const l1 = lines[i], l2 = lines[i + 1];
      if (l1.length < 69 || l2.length < 69 || !ck(l1) || !ck(l2)) { i++; continue; }
      let name = (i > 0 && !lines[i - 1].startsWith('1 ') && !lines[i - 1].startsWith('2 ')) ? lines[i - 1].replace(/^0 /, '').trim() : l1.slice(2, 7);
      const satrec = SJ.twoline2satrec(l1, l2);
      out.push({ id: satnum(l1.slice(2, 7)), name, l1, l2, satrec, epoch: epochDate(l1) });
      i++;
    }
  }
  return out;
}
// catalogue number; new objects (100000+) use the "Alpha-5" form, e.g. A0534 = 100534
function satnum(f) {
  const c = f[0];
  if (c >= 'A' && c <= 'Z') return ('ABCDEFGHJKLMNPQRSTUVWXYZ'.indexOf(c) + 10) * 10000 + +f.slice(1);
  return +f;
}
export function satEci(sat, date) {
  const pv = SJ.propagate(sat.satrec, date);
  return pv && pv.position && !isNaN(pv.position.x) ? pv : null;
}
function epochDate(l1) {
  const yy = +l1.slice(18, 20), day = parseFloat(l1.slice(20, 32));
  const y = yy < 57 ? 2000 + yy : 1900 + yy;
  return new Date(Date.UTC(y, 0, 1) + (day - 1) * 864e5);
}

// intrinsic (standard) magnitude at 1000 km, 90° phase; rough published values
const STD_MAG = { 25544: -1.8, 48274: -1.1 };
// v36: other satellites have no per-object brightness here (the observation-based list has no stated terms of use),
// so a rough value by kind is used: rocket bodies are large, debris small. Shown only as a rough guide
// (明るめ／ふつう／暗め), never as a magnitude. The loaded list is CelesTrak's brighter objects.
export function stdMag(sat) {
  if (STD_MAG[sat.id] != null) return STD_MAG[sat.id];
  const n = sat.name || '';
  if (/\bR\/B\b|ROCKET/.test(n)) return 3.0;
  if (/\bDEB\b/.test(n)) return 5.0;
  return 3.5;
}
export const FEATURED = { 25544: { ja: '国際宇宙ステーション', en: 'International Space Station', short: 'ISS', shortEn: 'ISS' }, 48274: { ja: '中国宇宙ステーション「天宮」', en: 'Tiangong space station', short: '天宮', shortEn: 'Tiangong' } };

const RE = 6378.137;
function sunEciKm(date) {
  const v = A.GeoVector(A.Body.Sun, date, false);
  const k = A.KM_PER_AU;
  return [v.x * k, v.y * k, v.z * k];
}
export function satLook(sat, date, obs, sunEci) {
  const pv = SJ.propagate(sat.satrec, date);
  if (!pv || !pv.position || isNaN(pv.position.x)) return null;
  const gmst = SJ.gstime(date);
  const ecf = SJ.eciToEcf(pv.position, gmst);
  const gd = { latitude: obs.lat * D2R, longitude: obs.lon * D2R, height: 0.02 };
  const la = SJ.ecfToLookAngles(gd, ecf);
  const p = [pv.position.x, pv.position.y, pv.position.z];
  const s = sunEci || sunEciKm(date);
  const sl = Math.hypot(...s); const su = s.map(v => v / sl);
  const dp = p[0] * su[0] + p[1] * su[1] + p[2] * su[2];
  const perp = Math.hypot(p[0] - dp * su[0], p[1] - dp * su[1], p[2] - dp * su[2]);
  const sunlit = !(dp < 0 && perp < RE);
  // observer ECI for phase angle
  const oe = SJ.ecfToEci(SJ.geodeticToEcf(gd), gmst);
  const toObs = [oe.x - p[0], oe.y - p[1], oe.z - p[2]];
  const lo = Math.hypot(...toObs);
  const toSun = [s[0] - p[0], s[1] - p[1], s[2] - p[2]]; const ls = Math.hypot(...toSun);
  const cosPh = (toObs[0] * toSun[0] + toObs[1] * toSun[1] + toObs[2] * toSun[2]) / (lo * ls);
  const ph = Math.acos(Math.max(-1, Math.min(1, cosPh)));
  const F = (Math.sin(ph) + (Math.PI - ph) * Math.cos(ph)) / Math.PI;
  const std = stdMag(sat);
  // + atmospheric extinction near the horizon (0.25 mag per airmass, as for the stars)
  const el = la.elevation * R2D;
  const air = el > 0 ? 1 / Math.max(Math.sin((el + 244 / (165 + 47 * Math.pow(el, 1.1))) * D2R), 0.02) : 40;
  const mag = std + 5 * Math.log10(la.rangeSat / 1000) - 2.5 * Math.log10(Math.max(F, 1e-4)) + 0.25 * (air - 1);
  return { alt: la.elevation * R2D, az: (la.azimuth * R2D + 360) % 360, range: la.rangeSat, sunlit, mag, height: Math.hypot(...p) - RE };
}

// Visible passes between t0 and t1 (Date). Coarse scan + refine. Async-sliced for UI.
export async function findPasses(sats, t0, t1, obs, onProgress) {
  const passes = [];
  const step = 30e3;
  const sunCache = new Map();
  const sunAt = (ms) => { const k = Math.round(ms / 600e3); if (!sunCache.has(k)) sunCache.set(k, { eci: sunEciKm(new Date(k * 600e3)), alt: bodyAltAz(A.Body.Sun, new Date(k * 600e3), obs).alt }); return sunCache.get(k); };
  for (let si = 0; si < sats.length; si++) {
    const sat = sats[si];
    let cur = null;
    for (let ms = t0.getTime(); ms <= t1.getTime(); ms += step) {
      const sun = sunAt(ms);
      const lk = satLook(sat, new Date(ms), obs, sun.eci);
      if (!lk) break;
      const up = lk.alt > 10;
      if (up) {
        const vis = lk.sunlit && sun.alt < -6;
        if (!cur) cur = { sat, samples: [] };
        cur.samples.push({ t: ms, ...lk, vis });
      } else if (cur) { finish(cur); cur = null; }
    }
    if (cur) finish(cur);
    if (si % 8 === 7) { onProgress && onProgress(si / sats.length); await new Promise(r => setTimeout(r, 0)); }
  }
  function finish(p) {
    const vis = p.samples.filter(s => s.vis);
    if (!vis.length) return;
    // refine to 5 s over the visible part (+/- one step)
    const a = vis[0].t - step, b = vis[vis.length - 1].t + step;
    const fine = [];
    for (let ms = a; ms <= b; ms += 5e3) {
      const sun = sunAt(ms);
      const lk = satLook(p.sat, new Date(ms), obs, sun.eci);
      if (lk && lk.alt > 10 && lk.sunlit && sun.alt < -6) fine.push({ t: ms, ...lk });
    }
    if (fine.length < 2) return;
    const max = fine.reduce((m, s) => s.alt > m.alt ? s : m, fine[0]);
    const bright = fine.reduce((m, s) => s.mag < m.mag ? s : m, fine[0]);
    passes.push({ sat: p.sat, start: fine[0], end: fine[fine.length - 1], max, mag: bright.mag, track: fine.filter((_, i) => i % 3 === 0).concat([fine[fine.length - 1]]) });
  }
  onProgress && onProgress(1);
  return passes.sort((x, y) => x.start.t - y.start.t);
}

// ---------- meteor showers (IMO working list, standard values) ----------
// lambda = solar longitude of peak (J2000), ra/dec = radiant at peak (deg), v = km/s
export const SHOWERS = [
  { code: 'QUA', ja: 'しぶんぎ座流星群', en: 'Quadrantids', lambda: 283.15, zhr: 110, ra: 230, dec: 49, v: 41, from: [12, 28], to: [1, 12] },
  { code: 'LYR', ja: 'こと座流星群', en: 'Lyrids', lambda: 32.32, zhr: 18, ra: 271, dec: 34, v: 49, from: [4, 14], to: [4, 30] },
  { code: 'ETA', ja: 'みずがめ座η流星群', en: 'Eta Aquariids', lambda: 45.5, zhr: 50, ra: 338, dec: -1, v: 66, from: [4, 19], to: [5, 28] },
  { code: 'PER', ja: 'ペルセウス座流星群', en: 'Perseids', lambda: 140.0, zhr: 100, ra: 48, dec: 58, v: 59, from: [7, 17], to: [8, 24] },
  { code: 'DRA', ja: '10月りゅう座流星群', en: 'Draconids', lambda: 195.4, zhr: 10, ra: 262, dec: 54, v: 20, from: [10, 6], to: [10, 10] },
  { code: 'ORI', ja: 'オリオン座流星群', en: 'Orionids', lambda: 208, zhr: 20, ra: 95, dec: 16, v: 66, from: [10, 2], to: [11, 7] },
  { code: 'NTA', ja: 'おうし座北流星群', en: 'Northern Taurids', lambda: 230, zhr: 5, ra: 58, dec: 22, v: 29, from: [10, 20], to: [12, 10] },
  { code: 'LEO', ja: 'しし座流星群', en: 'Leonids', lambda: 235.27, zhr: 15, ra: 152, dec: 22, v: 71, from: [11, 6], to: [11, 30] },
  { code: 'GEM', ja: 'ふたご座流星群', en: 'Geminids', lambda: 262.2, zhr: 150, ra: 112, dec: 33, v: 35, from: [12, 4], to: [12, 20] },
  { code: 'URS', ja: 'こぐま座流星群', en: 'Ursids', lambda: 270.7, zhr: 10, ra: 217, dec: 76, v: 33, from: [12, 17], to: [12, 26] },
];

export function showerPeaks(from, days = 400) {
  const out = [];
  for (const s of SHOWERS) {
    const now = A.SunPosition(A.MakeTime(from)).elon;
    const est = ((s.lambda - now + 360) % 360) * 365.2422 / 360;
    const t = A.SearchSunLongitude(s.lambda, A.MakeTime(new Date(from.getTime() + Math.max(0, est - 6) * 864e5)), 12);
    if (t) out.push({ ...s, peak: t.date });
  }
  return out.sort((a, b) => a.peak - b.peak);
}
export function showerActive(s, date) {
  const m = date.getUTCMonth() + 1, d = date.getUTCDate();
  const v = m * 100 + d, f = s.from[0] * 100 + s.from[1], t = s.to[0] * 100 + s.to[1];
  return f <= t ? (v >= f && v <= t) : (v >= f || v <= t);
}

// Observing conditions for a shower on the night around `peak`.
// Returns best time, radiant altitude there, moon illumination/altitude, rough hourly count.
export function showerNight(s, peak, obs, lm) {
  const win = nightWindow(new Date(peak.getTime() - 6 * 3600e3), obs);
  const dark0 = win.astroDusk || win.nauticalDusk || win.sunset;
  const dark1 = win.astroDawn || win.nauticalDawn || win.sunrise;
  const ill = A.Illumination(A.Body.Moon, A.MakeTime(peak)).phase_fraction;
  let best = null;
  for (let ms = dark0.getTime(); ms <= dark1.getTime(); ms += 10 * 60e3) {
    const d = new Date(ms);
    const rad = horizonMapper(d, obs)(s.ra, s.dec).alt;
    if (rad <= 0) continue;
    const moon = bodyAltAz(A.Body.Moon, d, obs).alt;
    const moonPen = moon > 0 ? (1 - 0.75 * ill * Math.min(1, (moon + 5) / 30)) : 1;
    const score = Math.sin(rad * D2R) * moonPen;
    if (!best || score > best.score) best = { t: d, rad, moon, score, moonPen };
  }
  if (!best) return { win, ill, best: null, rate: 0 };
  // limiting magnitude drops ~1 mag with a bright moon up; population index r = 2.5
  const lmEff = lm - (best.moon > 0 ? 1.2 * ill : 0);
  const rate = s.zhr * Math.sin(best.rad * D2R) * Math.pow(2.5, lmEff - 6.5);
  return { win, ill, best, rate };
}
