// Sky calendar (v34): events that can actually be seen from the observer's place.
// Everything is computed on the device with Astronomy Engine; nothing is fetched.
// Returns plain data; the wording lives in i18n.js.
import { A, bodyAltAz, horizonMapper, PLANETS, showerPeaks, showerNight } from './sky.js';

const D2R = Math.PI / 180;
const HOUR = 3600e3, DAY = 864e5;

// bright stars near the ecliptic the Moon can pass (J2000, degrees)
export const ECL_STARS = [
  { id: 'aldebaran', ja: 'アルデバラン', en: 'Aldebaran', ra: 68.98, dec: 16.51 },
  { id: 'regulus', ja: 'レグルス', en: 'Regulus', ra: 152.09, dec: 11.97 },
  { id: 'spica', ja: 'スピカ', en: 'Spica', ra: 201.30, dec: -11.16 },
  { id: 'antares', ja: 'アンタレス', en: 'Antares', ra: 247.35, dec: -26.43 },
  { id: 'pleiades', ja: 'すばる', en: 'the Pleiades', ra: 56.75, dec: 24.12 },
];
const OUTER = PLANETS.filter(p => p.body === A.Body.Mars || p.body === A.Body.Jupiter || p.body === A.Body.Saturn);
const INNER = PLANETS.filter(p => p.body === A.Body.Mercury || p.body === A.Body.Venus);

function sep(a, b) { // angular separation of two alt/az directions, degrees
  const c = Math.sin(a.alt * D2R) * Math.sin(b.alt * D2R) + Math.cos(a.alt * D2R) * Math.cos(b.alt * D2R) * Math.cos((a.az - b.az) * D2R);
  return Math.acos(Math.max(-1, Math.min(1, c))) / D2R;
}
const sunAlt = (d, obs) => bodyAltAz(A.Body.Sun, d, obs).alt;

// moon phase angle at a time (0 new, 90 first quarter, 180 full, 270 last quarter) and lit fraction
export function moonAt(d) {
  return { phase: A.MoonPhase(A.MakeTime(d)), frac: A.Illumination(A.Body.Moon, A.MakeTime(d)).phase_fraction };
}

// Events from `from` for `days` days. `localHour(d)` gives the local hour (0-23) in the app's time zone,
// `evening(dayStartMs)` gives 17:00 local of a calendar day as a Date. `yieldFn` lets the UI breathe.
export async function almanac(from, days, obs, lm, evening, yieldFn = () => Promise.resolve()) {
  const to = new Date(from.getTime() + days * DAY);
  const out = [];
  const o = new A.Observer(obs.lat, obs.lon, 0);

  // 1. Moon phases
  let mq = A.SearchMoonQuarter(A.MakeTime(from));
  while (mq && mq.time.date < to) {
    out.push({ kind: 'phase', q: mq.quarter, t: mq.time.date });
    mq = A.NextMoonQuarter(mq);
  }

  // 2. Oppositions of Mars, Jupiter, Saturn (visible all night, brightest)
  for (const p of OUTER) {
    const r = A.SearchRelativeLongitude(p.body, 0, A.MakeTime(from));
    if (r && r.date < to) out.push({ kind: 'opp', planet: p, t: r.date, mag: A.Illumination(p.body, r).mag });
  }

  // 3. Greatest elongations of Mercury and Venus, only if the planet is >= 10° up in twilight
  for (const p of INNER) {
    const e = A.SearchMaxElongation(p.body, A.MakeTime(from));
    if (!e || e.time.date >= to) continue;
    const ev = e.visibility === 'evening';
    // sun 6° below the horizon on that day (civil twilight)
    const base = new Date(e.time.date.getTime() - 12 * HOUR);
    const tw = A.SearchAltitude(A.Body.Sun, o, ev ? -1 : +1, A.MakeTime(base), 1.5, -6);
    if (!tw) continue;
    const h = bodyAltAz(p.body, tw.date, obs);
    if (h.alt >= 10) out.push({ kind: 'elong', planet: p, t: e.time.date, evening: ev, elong: e.elongation, at: tw.date, alt: h.alt, az: h.az, mag: A.Illumination(p.body, tw).mag });
  }

  // 4. Close pairs in the dark sky, night by night: Moon–planet (<5°), Moon–bright star (<3°), planet–planet (<3°)
  const bright = PLANETS.filter(p => p.body !== A.Body.Mercury);
  for (let k = 0; k < Math.ceil(days); k++) {
    const e0 = evening(from.getTime() + k * DAY); // 17:00 local
    const best = new Map();
    for (let h = 0; h <= 14; h += 0.5) {
      const d = new Date(e0.getTime() + h * HOUR);
      if (d < from || d >= to) continue;
      if (sunAlt(d, obs) > -8) continue;
      const moon = bodyAltAz(A.Body.Moon, d, obs);
      const pl = bright.map(p => ({ p, h: bodyAltAz(p.body, d, obs) }));
      const consider = (key, a, b, lim, rec) => {
        if (a.alt < 12 || b.alt < 12) return;
        const s = sep(a, b); if (s > lim) return;
        const cur = best.get(key); if (!cur || s < cur.sep) best.set(key, { ...rec, sep: s, t: d, alt: Math.min(a.alt, b.alt), az: a.az });
      };
      for (const x of pl) consider('m-' + x.p.en, moon, x.h, 5, { kind: 'moonPlanet', planet: x.p });
      const map = horizonMapper(d, obs);
      for (const s of ECL_STARS) consider('m-' + s.id, moon, map(s.ra, s.dec), 3, { kind: 'moonStar', star: s });
      for (let i = 0; i < pl.length; i++) for (let j = i + 1; j < pl.length; j++) consider('p-' + pl[i].p.en + pl[j].p.en, pl[i].h, pl[j].h, 3, { kind: 'planets', a: pl[i].p, b: pl[j].p });
    }
    for (const v of best.values()) {
      // the same planet pair stays close for days: keep only the closest night of a run
      if (v.kind === 'planets') {
        const prev = out.find(x => x.kind === 'planets' && x.a === v.a && x.b === v.b && v.t - x.t < 12 * DAY);
        if (prev) { if (v.sep < prev.sep) Object.assign(prev, v); continue; }
      }
      out.push(v);
    }
    if (k % 5 === 4) await yieldFn();
  }

  // 5. Meteor shower peaks, with the best time on that night and the expected rate
  for (const s of showerPeaks(new Date(from.getTime() - 2 * DAY))) {
    if (s.peak > to || s.peak < from - DAY) continue;
    const n = showerNight(s, s.peak, obs, lm);
    if (!n.best) continue;
    out.push({ kind: 'shower', shower: s, t: n.best.t, peak: s.peak, ill: n.ill, rate: n.rate, rad: n.best.rad, moonUp: n.best.moon > 0 });
  }

  return out.sort((a, b) => a.t - b.t);
}

// Next lunar and solar eclipses that can be seen from the place (searches up to `years` ahead).
export function nextEclipses(from, obs, years = 6) {
  const o = new A.Observer(obs.lat, obs.lon, 0);
  const limit = from.getTime() + years * 365.25 * DAY;
  let lunar = null, solar = null;
  let le = A.SearchLunarEclipse(A.MakeTime(from));
  while (le && le.peak.date.getTime() < limit) {
    const alt = bodyAltAz(A.Body.Moon, le.peak.date, obs).alt;
    if (alt > 0) { lunar = { kind: le.kind, t: le.peak.date, alt }; break; }
    le = A.NextLunarEclipse(le.peak);
  }
  let se = A.SearchLocalSolarEclipse(A.MakeTime(from), o);
  while (se && se.peak.time.date.getTime() < limit) {
    if (se.peak.altitude > 0) { solar = { kind: se.kind, t: se.peak.time.date, alt: se.peak.altitude, obscuration: se.obscuration }; break; }
    se = A.NextLocalSolarEclipse(se.peak.time, o);
  }
  return { lunar, solar };
}
