// "Tonight's highlight" (v42): on a night with something to see, say so at the top of the sky and ease in on it.
// pickHero() chooses the one event of the night from the sky calendar (almanac.js) and works out when/where it can be seen.
// Everything is computed on the device. The wording lives in i18n.js; the animation in createHero() (bottom of this file).
import { A, bodyAltAz, horizonMapper, nightWindow } from './sky.js';

const D2R = Math.PI / 180;
const HOUR = 3600e3, STEP = 10 * 60e3;
const MIN_ALT = 12; // a target lower than this is not "up" (houses, trees, haze)

// order of importance on one night: one-off, time-limited things first (v42 design §2)
const RANK = { eclipse: 0, shower: 1, moonPlanet: 2, moonStar: 2, planets: 2, elong: 3, opp: 3 };

// where the event's object is at time d: { alt, az } (a shower: its radiant)
function targetAt(ev, d, obs) {
  switch (ev.kind) {
    case 'opp': case 'elong': return bodyAltAz(ev.planet.body, d, obs);
    case 'moonPlanet': return bodyAltAz(ev.planet.body, d, obs);
    case 'planets': return bodyAltAz(ev.a.body, d, obs);
    case 'moonStar': return horizonMapper(d, obs)(ev.star.ra, ev.star.dec);
    case 'shower': return horizonMapper(d, obs)(ev.shower.ra, ev.shower.dec);
    case 'lunar': return bodyAltAz(A.Body.Moon, d, obs);
    case 'solar': return bodyAltAz(A.Body.Sun, d, obs);
  }
  return null;
}
// dark enough to see it: Sun 6° below the horizon (3° for Venus and Jupiter, which show earlier); the Sun itself needs daylight
function darkEnough(ev, d, obs) {
  if (ev.kind === 'solar') return true;
  const s = bodyAltAz(A.Body.Sun, d, obs).alt;
  const bright = (p) => p && (p.body === A.Body.Venus || p.body === A.Body.Jupiter);
  const lim = (ev.kind === 'opp' || ev.kind === 'elong') && bright(ev.planet) ? -3 : -6;
  return s <= lim;
}

// The events of one night as a flat list: calendar entries (not Moon phases) plus a visible eclipse.
// `cal` = st.cal, `ecl` = st.ecl, `keyOf(date)` = nightKey, `dayOf(date)` = dayKey
export function nightEvents(key, cal, ecl, keyOf, dayOf) {
  const out = [];
  for (const e of cal || []) {
    if (e.kind === 'phase') continue;
    const when = e.kind === 'elong' ? e.at : e.t; // a greatest elongation is seen at twilight, not at the moment of the maximum
    if (keyOf(when) === key) out.push({ ...e, when });
  }
  if (ecl && ecl.lunar && keyOf(ecl.lunar.t) === key) out.push({ kind: 'lunar', sub: ecl.lunar.kind, t: ecl.lunar.t, when: ecl.lunar.t, alt: ecl.lunar.alt });
  if (ecl && ecl.solar && dayOf(ecl.solar.t) === key.slice(0, 10) && keyOf(ecl.solar.t) !== key) { /* a day event: handled by dayEvents() */ }
  return out;
}

// Choose the highlight for `now` (a Date). Returns null when there is nothing to say.
//   ctx: { key, cal, ecl, keyOf, dayOf, obs, lm }
// Result: { ev, id, vis, when, alt, az, tgt: {alt, az} at `when`, rank } where
//   vis  = it is up and dark enough right now ("いま見えるもの"), otherwise `when` is the first moment tonight it will be.
export function pickHero(now, ctx) {
  const { obs } = ctx;
  const list = nightEvents(ctx.key, ctx.cal, ctx.ecl, ctx.keyOf, ctx.dayOf);
  // a solar eclipse is a daytime event: it belongs to the calendar day
  if (ctx.ecl && ctx.ecl.solar && ctx.dayOf(ctx.ecl.solar.t) === ctx.dayOf(now.getTime()) && Math.abs(ctx.ecl.solar.t - now) < 5 * HOUR)
    list.push({ kind: 'solar', sub: ctx.ecl.solar.kind, t: ctx.ecl.solar.t, when: ctx.ecl.solar.t, alt: ctx.ecl.solar.alt, obsc: ctx.ecl.solar.obscuration });
  if (!list.length) return null;
  list.sort((a, b) => ((RANK[a.kind === 'lunar' || a.kind === 'solar' ? 'eclipse' : a.kind]) - (RANK[b.kind === 'lunar' || b.kind === 'solar' ? 'eclipse' : b.kind])) || (a.when - b.when));

  for (const ev of list) {
    const rank = RANK[ev.kind === 'lunar' || ev.kind === 'solar' ? 'eclipse' : ev.kind];
    const minAlt = ev.kind === 'elong' ? 10 : MIN_ALT;
    const here = targetAt(ev, now, obs);
    const id = ev.kind + ':' + (ev.planet ? ev.planet.en : ev.star ? ev.star.id : ev.shower ? ev.shower.code : ev.a ? ev.a.en + ev.b.en : ev.sub || '') + ':' + ctx.key;
    // up and dark right now?
    const nearBest = ev.kind !== 'shower' || Math.abs(now.getTime() - ev.t.getTime()) <= 90 * 60e3; // "the best time is now" only within 1.5 h of it
    if (here && nearBest && here.alt >= minAlt && darkEnough(ev, now, obs) && now.getTime() <= ev.when.getTime() + 3 * HOUR && now.getTime() >= ev.when.getTime() - 5 * HOUR) {
      return { ev, id, vis: true, when: now, alt: here.alt, az: here.az, tgt: here, rank };
    }
    // otherwise: the first moment from now on (until the event is over) when it is up and dark
    const from = Math.max(now.getTime(), ev.when.getTime() - 3 * HOUR), to = ev.when.getTime() + 3 * HOUR;
    for (let ms = from; ms <= to; ms += STEP) {
      const d = new Date(ms);
      const g = targetAt(ev, d, obs);
      if (g && g.alt >= minAlt && darkEnough(ev, d, obs)) {
        if (ms < now.getTime()) break;
        return { ev, id, vis: false, when: d, alt: g.alt, az: g.az, tgt: g, rank };
      }
    }
    // (an event that can no longer be seen tonight is dropped and the next one is tried)
  }
  return null;
}

// How many stars a naked eye can see right now ("about N"), the same limit as the sky drawing and the AR view.
// lm = limiting magnitude of the sky (darkness setting minus moonlight)
export function visibleStars(d, obs, lm, stars) {
  const map = horizonMapper(d, obs);
  let n = 0;
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    if (s[2] > lm) break; // the catalogue is sorted by magnitude
    const h = map(s[0], s[1]);
    if (h.alt < 0) continue;
    const air = 1 / Math.max(Math.sin((h.alt + 244 / (165 + 47 * Math.pow(h.alt, 1.1))) * D2R), 0.02);
    if (s[2] + 0.25 * (air - 1) <= lm) n++;
  }
  return n;
}

// ---------- wording ----------
// Everything the card says, as plain strings. deps: { t, JA, dir, dir8, hm, planetName, lightTime, st, A, S, bodyAltAz }
export function describe(p, deps) {
  const { t, dir, dir8, hm, planetName, lightTime, st, JA } = deps;
  const ev = p.ev, vis = p.vis;
  const clockOf = (d) => { let [h, m] = hm(d).split(':').map(Number); if (m >= 45) { h = (h + 1) % 24; m = 0; } return t('heroClock', h, m >= 15); };
  const alt5 = (a) => Math.round(a / 5) * 5;
  const d16 = dir(p.az), d8 = dir8(p.az);
  const name = (o) => o.kind === 'moon' ? t('moon') : planetName(o);
  const moonAt = p.when;
  const ill = A.Illumination(A.Body.Moon, A.MakeTime(moonAt)).phase_fraction;
  const moonUp = bodyAltAz(A.Body.Moon, moonAt, st.place).alt > 0;
  const r = { clock: '', kicker: t(vis ? 'heroNow' : (ev.kind === 'solar' ? 'heroToday' : 'heroTonight')), head: '', sub: '', cond: '', go: null, chipName: '', chipPos: '' };
  const c = clockOf(p.when);
  switch (ev.kind) {
    case 'opp': case 'elong': {
      const n = planetName(ev.planet);
      r.head = vis ? t('heroHeadVis', n, d16, alt5(p.alt)) : t('heroHeadLater', c, n, d16);
      if (ev.kind === 'opp') {
        const o = new A.Observer(st.place.lat, st.place.lon, 0);
        const km = A.Equator(ev.planet.body, p.when, o, true, true).dist * 149597870.7;
        r.sub = t('heroSubOpp', n, lightTime(km));
      } else r.sub = t('heroSubElong', n, ev.evening, d8);
      r.go = { kind: 'planet', body: ev.planet.body, ja: ev.planet.ja, en: ev.planet.en };
      r.chipName = n; break;
    }
    case 'moonPlanet': case 'moonStar': case 'planets': {
      const a = ev.kind === 'planets' ? planetName(ev.a) : t('moon');
      const b = ev.kind === 'planets' ? planetName(ev.b) : ev.kind === 'moonPlanet' ? planetName(ev.planet) : (JA ? ev.star.ja : ev.star.en);
      r.head = vis ? t('heroHeadPairVis', a, b, d16, alt5(p.alt)) : t('heroHeadPairLater', c, a, b, d16);
      const ct = clockOf(ev.t);
      r.sub = t('heroSubPair', ct, a, b, ev.sep < 1 ? ev.sep.toFixed(1) : ev.sep.toFixed(0));
      if (ev.kind !== 'moonStar') { const pl = ev.kind === 'planets' ? ev.a : ev.planet; r.go = { kind: 'planet', body: pl.body, ja: pl.ja, en: pl.en }; }
      r.chipName = t('heroPairName', a, b); break;
    }
    case 'shower': {
      const n = JA ? ev.shower.ja : ev.shower.en;
      r.head = t('heroHeadShower', n, vis);
      r.sub = t('heroSubShower', clockOf(ev.t), d16);
      r.chipName = n;
      // the honest line: moonlight and when it is easiest to see
      const o = new A.Observer(st.place.lat, st.place.lon, 0);
      const w = nightWindow(ev.t, st.place), dusk = w.astroDusk || w.sunset, dawn = w.astroDawn || w.sunrise;
      const upAtDusk = bodyAltAz(A.Body.Moon, dusk, st.place).alt > 0;
      const ms = upAtDusk ? A.SearchRiseSet(A.Body.Moon, o, -1, A.MakeTime(dusk), 0.7) : null;
      const sets = ms && ms.date < dawn ? ms.date : null; // the Moon sets during the dark hours
      const cb = clockOf(ev.t);
      if (ev.ill < 0.25) r.cond = t('heroMoonNone', cb);
      else if (ev.ill < 0.6) r.cond = t(ev.moonUp ? 'heroMoonSome' : 'heroMoonNone', cb);
      else if (sets) r.cond = t('heroMoonBadSet', clockOf(sets));
      else r.cond = t(ev.moonUp || upAtDusk ? 'heroMoonBad' : 'heroMoonNone', cb);
      break;
    }
    case 'lunar': {
      const k = t('eclLunar')[ev.sub], pen = ev.sub === 'penumbral';
      r.head = t('heroHeadEcl', k, vis && !pen);
      r.sub = pen ? t('heroSubEclPen', clockOf(ev.t)) : t('heroSubEcl', clockOf(ev.t), d16, alt5(p.alt));
      if (pen) r.kicker = t('heroTonight');
      r.chipName = k; break;
    }
    case 'solar': {
      const k = t('eclSolar')[ev.sub];
      r.head = t('heroHeadSolar', k); r.sub = t('heroSubSolar', clockOf(ev.t), Math.round((ev.obsc || 0) * 100)); r.chipName = k; break;
    }
  }
  if (!r.cond && ill >= 0.6 && moonUp && (ev.kind === 'opp' || ev.kind === 'elong' || ev.kind === 'planets')) r.cond = t('heroMoonNote');
  const cs = ev.kind === 'shower' ? clockOf(ev.t) : c;
  r.starsAt = ev.kind === 'shower' ? ev.t : p.when; r.clock = vis && ev.kind !== 'shower' ? '' : cs;
  r.chipPos = vis && ev.kind !== 'shower' ? t('heroChipPos', r.chipName, d16, alt5(p.alt)) : t('heroChipTime', r.chipName, cs);
  return r;
}
function ctxDawn(d, place) { try { return nightWindow(d, place).astroDawn || nightWindow(d, place).sunrise; } catch (e) { return null; } }

// ---------- the card and the ease-in ----------
// The sky is drawn by app.js; this module only says how the picture is moved (xf), draws one ring (ring) and owns the text.
// States: pending (waiting for the sky page) -> intro (ease in, 1.5 s) -> held -> out (first touch: back to the whole sky, 0.6 s) -> chip
const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const outc = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const ZOOM = 1.6;
const HOLD_AUTO = 20; // seconds the card stays if nobody touches the screen

export function createHero(deps) {
  const { $, st, t, store, DATA, SKIES, moonPenalty, ar, onGo, isSkyPage } = deps;
  const stage = document.querySelector('.stage');
  const box = $('hero'), chip = $('hero-chip');
  const rm = matchMedia('(prefers-reduced-motion: reduce)');
  let slow = false, pick = null, text = null, state = 'off', t0 = 0, uFrom = 0, cur = null, curAt = 0, textBottom = 0, tbDirty = true, last = null;
  const motion = () => store.get('hero.motion', true) && !rm.matches;
  const now = () => performance.now() / 1000;

  function curTarget() { // the target's place in the sky now (cached 20 s; one astronomy call)
    if (!pick) return null;
    const ms = Date.now();
    if (!cur || ms - curAt > 20e3) { cur = targetAt(pick.ev, new Date(ms), st.place); curAt = ms; }
    return cur;
  }
  function render() {
    if (!pick) return;
    text = describe(pick, deps); tbDirty = true;
    const at = text.starsAt, lm = SKIES[st.sky].lm - moonPenalty(at);
    const n = visibleStars(at, st.place, lm, DATA.stars);
    const stars = pick.ev.kind === 'solar' ? '' : t('heroStars', text.clock, Math.max(10, Math.round(n / 10) * 10));
    box.innerHTML = `<span class="k">${deps.esc(text.kicker)}</span><h2>${deps.esc(text.head)}</h2><p>${deps.esc(text.sub)}</p>`
      + (text.cond ? `<p class="c">${deps.esc(text.cond)}</p>` : '') + (stars ? `<p class="v">${deps.esc(stars)}</p>` : '')
      + (text.go ? `<button type="button" class="go">${deps.esc(t('heroGo'))} ›</button>` : '');
    const go = box.querySelector('.go'); if (go) go.addEventListener('click', (e) => { e.stopPropagation(); onGo(text.go); });
    chip.innerHTML = `<b>${deps.esc(text.chipName)}</b>${deps.esc(text.chipPos.slice(text.chipName.length).trim())} ›`;
  }
  function show(el, on) { el.hidden = !on; }
  function setClass() { stage.classList.toggle('hero-on', state !== 'off' && state !== 'pending'); }
  function enter(s) {
    state = s; t0 = now(); setClass(); box.style.opacity = 0; tbDirty = true;
    show(box, s === 'intro' || s === 'held' || s === 'out');
    show(chip, s === 'chip' || s === 'out');
    if (s === 'chip') { chip.style.opacity = 1; }
  }
  // ---- called by app.js ----
  function update(key, ctx) {
    const p = ctx ? pickHero(new Date(), ctx) : null;
    if (!p) { pick = null; enter('off'); show(box, false); show(chip, false); return; }
    const same = pick && pick.id === p.id, visChanged = same && pick.vis !== p.vis;
    pick = p; cur = null;
    if (!same || visChanged || !text) render();
    if (same && state !== 'off') return;
    // already shown on this device tonight? then just the chip
    const seen = store.get('hero.seen', '') === p.id;
    enter(seen ? 'chip' : 'pending');
    tryStart();
  }
  function tryStart() {
    if (state !== 'pending' || !pick) return;
    if (!isSkyPage() || ar.isOn() || document.visibilityState !== 'visible') return;
    store.set('hero.seen', pick.id);
    enter('intro');
    if (!motion()) { /* no travelling: the sky is already in place; the card and the ring just appear */ }
  }
  function collapse(auto) {
    if (state !== 'intro' && state !== 'held') return;
    if (state === 'intro' && !auto && now() - t0 < 1.7) return; // the zoom is still travelling: a stray touch must not cut the card short
    // the zoom amount right now, worked out here (not via frame(): frame() calls collapse() itself in 'held')
    uFrom = state === 'held' || !motion() ? 1 : ease(seg(now() - t0, .3, 1.5));
    slow = !!auto; enter('out'); chip.style.opacity = 0;
  }
  // the animation numbers for now
  function frame() {
    const tt = now() - t0, m = motion();
    let u = 0, tx = 0, ring = 0, ch = 0;
    if (state === 'intro') {
      u = m ? ease(seg(tt, .3, 1.5)) : 1; tx = outc(seg(tt, m ? .6 : 0, m ? 1.3 : .25)); ring = outc(seg(tt, m ? 1.3 : 0, m ? 1.6 : .25));
      if (tt > 1.7) { enter('held'); }
    } else if (state === 'held') { u = 1; tx = 1; ring = 1; if (tt > HOLD_AUTO) collapse(true); }
    else if (state === 'out') {
      const k = slow ? 2 : 1; // nobody touched: shrink gently over 1.2 s instead of 0.6 s
      u = uFrom * (1 - ease(seg(tt, 0, .6 * k))); tx = 1 - outc(seg(tt, 0, .3 * k)); ring = 1 - outc(seg(tt, 0, .3 * k)); ch = outc(seg(tt, .3 * k, .7 * k));
      if (tt > .75 * k) enter('chip');
    } else if (state === 'chip') { ch = 1; }
    return { u, tx, ring, ch };
  }
  // the picture's transform for this frame: base circle (RB, CXB, CYB) -> { R, CX, CY, clipTop }
  function xf(RB, CXB, CYB, W, H) {
    const id = { R: RB, CX: CXB, CY: CYB, clipTop: 0 };
    if (state === 'off' || state === 'pending' || !pick) return id;
    const f = frame();
    box.style.opacity = f.tx; box.style.transform = `translateY(${(1 - f.tx) * 8}px)`;
    if (state === 'chip' || state === 'out') chip.style.opacity = f.ch;
    // the circle that fits under the card
    if (tbDirty && !box.hidden) { textBottom = box.offsetTop + box.offsetHeight; tbDirty = false; }
    const top = textBottom + 26, bottom = H - 8;
    const rF = Math.max(RB * .55, Math.min(RB, (bottom - top) / 2)), cyF = top + rF;
    const k1 = rF / RB, b1x = CXB - k1 * CXB, b1y = cyF - k1 * CYB;
    let k = k1, bx = b1x, by = b1y;
    const g = curTarget();
    const canZoom = motion() && g && g.alt >= 5;
    if (canZoom) {
      const z = ZOOM, rr = RB * Math.tan((90 - g.alt) * D2R / 2);
      const px = CXB - rr * Math.sin(g.az * D2R), py = CYB - rr * Math.cos(g.az * D2R); // target at the base circle
      const qx = k1 * px + b1x, qy = k1 * py + b1y;                                       // ... under the card
      k = z * k1; bx = qx * (1 - z) + z * b1x; by = qy * (1 - z) + z * b1y;
    }
    const u = f.u;
    const K = 1 + (k - 1) * u, BX = bx * u, BY = by * u;
    last = { K, BX, BY, RB, CXB, CYB, ring: f.ring };
    return { R: K * RB, CX: K * CXB + BX, CY: K * CYB + BY, clipTop: (textBottom + 6) * f.tx };
  }
  // the gold ring (drawn by app.js after the sky, in the same transform)
  function ring(ctx, proj) {
    if (!pick || !last || last.ring <= 0.01 || (state !== 'intro' && state !== 'held' && state !== 'out')) return;
    const g = curTarget(); if (!g || g.alt < 3) return;
    const [x, y] = proj(g.alt, g.az);
    const shower = pick.ev.kind === 'shower';
    const r = (shower ? 24 : 11) + 7 * Math.max(0, last.K - 1) / (ZOOM - 1);
    ctx.save(); ctx.globalAlpha = last.ring; ctx.lineWidth = 1.6; ctx.strokeStyle = '#f2c46d'; ctx.shadowColor = 'rgba(242,196,109,.5)'; ctx.shadowBlur = 6;
    if (shower) ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  chip.addEventListener('click', () => { if (state === 'chip') { enter('intro'); } });
  // the first touch anywhere puts the whole sky back
  ['pointerdown', 'wheel', 'keydown'].forEach(ev => addEventListener(ev, () => collapse(), { capture: true, passive: true }));
  addEventListener('resize', () => { tbDirty = true; });
  document.addEventListener('visibilitychange', tryStart);
  setInterval(() => { if (pick && state !== 'off' && state !== 'pending') { /* keep the position fresh */ cur = null; } tryStart(); }, 30e3);
  return { update, xf, ring, tryStart, collapse, isOn: () => state !== 'off' && state !== 'pending', state: () => state, _pick: () => pick, _text: () => text };
}
