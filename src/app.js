import * as S from './sky.js';
import { createAR } from './ar.js';
import { createObjInfo } from './objinfo.js';
import { createSearch } from './search.js';
import { createTrains } from './trains.js';
import { createShare } from './share.js';
import { createTopics } from './topics.js';
import { describeSat, BRIGHT_MAG } from './satinfo.js';
import { t, JA, LANG, LANGS, setLang, TZ, LOCALE, dir, dir8, magT } from './i18n.js';
import { conName, starLabel, starName, starAlt, messierShort, planetName, showerShort, mtype, MESSIER_EN } from './names.js';
const MESSIER_EN_OF = (m) => MESSIER_EN[m[0]] || '';
const { A } = S;
const DATA = window.ZENITH_DATA;
const $ = (id) => document.getElementById(id);
const D2R = Math.PI / 180;

// ---------- state ----------
const PLACES = [
  { id: 'tokyo', ja: '東京', en: 'Tokyo', lat: 35.6812, lon: 139.7671 },
  { id: 'sapporo', ja: '札幌', en: 'Sapporo', lat: 43.0687, lon: 141.3508 },
  { id: 'sendai', ja: '仙台', en: 'Sendai', lat: 38.2682, lon: 140.8694 },
  { id: 'nagoya', ja: '名古屋', en: 'Nagoya', lat: 35.1709, lon: 136.8815 },
  { id: 'osaka', ja: '大阪', en: 'Osaka', lat: 34.7025, lon: 135.4959 },
  { id: 'fukuoka', ja: '福岡', en: 'Fukuoka', lat: 33.5902, lon: 130.4017 },
  { id: 'naha', ja: '那覇', en: 'Naha', lat: 26.2124, lon: 127.6809 },
];
// the place's name in the current language (saved places may predate the English names)
function placeName(p) {
  if (!p) return '';
  if (p.id === 'here') return t('here');
  const k = PLACES.find(x => x.id === p.id);
  if (k) return JA ? k.ja : k.en;
  return p.ja;
}
const SKIES = { city: { key: 'skyCityS', lm: 4.0 }, suburb: { key: 'skySuburbS', lm: 5.5 }, dark: { key: 'skyDarkS', lm: 6.5 } };
const fShort = (f) => (JA ? f.short : f.shortEn || f.short);
const fName = (f) => (JA ? f.ja : f.en);
const store = {
  get(k, d) { try { const v = localStorage.getItem('zenith.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('zenith.' + k, JSON.stringify(v)); } catch (e) { } },
};
const st = {
  place: store.get('place', PLACES[0]),
  sky: store.get('sky', 'suburb'),
  t: Date.now(), live: true, rate: 1,
  sats: [], passes: [], win: null, events: [], hover: null, focusPass: null, computing: false,
  focusCon: null, showLines: store.get('lines', false),
  satFilter: store.get('satFilter', 'bright'), docked: new Map(),
};

const TR = createTrains({ st, S });
st.trainPasses = [];

// ---------- formatting ----------
const hm = (d) => new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(d);
const hms = (d) => new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: TZ }).format(d);
const md = (d) => new Intl.DateTimeFormat(JA ? 'ja-JP' : 'en-GB', { month: JA ? 'numeric' : 'short', day: 'numeric', weekday: 'short', timeZone: TZ }).format(d);
const mag = magT;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- canvas ----------
const cv = $('sky'), ctx = cv.getContext('2d');
let W = 0, H = 0, R = 0, CX = 0, CY = 0, DPR = 1, R0 = 0, CY0 = 0;
function resize() {
  const box = cv.getBoundingClientRect(); // the canvas may leave room for the tool row below it (phones)
  if (!box.width || !box.height) return;
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = box.width; H = box.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  R0 = Math.min(W, H) / 2 - (Math.min(W, H) < 600 ? 26 : 34); CY0 = H / 2;
  R = R0; CX = W / 2; CY = CY0;
}
addEventListener('resize', () => { resize(); });
// the stage can change size without a window resize (rotation settling, grid changes): watch it directly
if ('ResizeObserver' in window) new ResizeObserver(() => resize()).observe(cv.parentElement);
addEventListener('orientationchange', () => setTimeout(resize, 300));

// stereographic projection from the zenith; N up, E left (looking up)
function proj(alt, az) {
  const z = (90 - alt) * D2R;
  const r = R * Math.tan(z / 2);
  return [CX - r * Math.sin(az * D2R), CY - r * Math.cos(az * D2R)];
}
function unproj(x, y) {
  const dx = CX - x, dy = CY - y;
  const r = Math.hypot(dx, dy) / R;
  const z = 2 * Math.atan(r);
  return { alt: 90 - z / D2R, az: (Math.atan2(dx, dy) / D2R + 360) % 360 };
}

function bvColor(bv) {
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  const k = t / 100; let r, g, b;
  if (k <= 66) { r = 255; g = 99.47 * Math.log(k) - 161.12; b = k <= 19 ? 0 : 138.52 * Math.log(k - 10) - 305.04; }
  else { r = 329.7 * Math.pow(k - 60, -0.1332); g = 288.12 * Math.pow(k - 60, -0.0755); b = 255; }
  const c = [r, g, b].map(v => Math.min(255, Math.max(0, v)));
  const m = (c[0] + c[1] + c[2]) / 3;
  return c.map(v => Math.round(m + (v - m) * 0.55));
}
const STAR_RGB = DATA.stars.map(s => bvColor(s[3]));

// sky brightness from sun altitude -> background + limiting magnitude
function skyState(sunAlt) {
  const lm0 = SKIES[st.sky].lm;
  let lm = lm0, top, bottom, label;
  if (sunAlt > 0) { lm = -1; top = [34, 62, 104]; bottom = [92, 128, 170]; label = t('day'); }
  else if (sunAlt > -6) { const k = -sunAlt / 6; lm = Math.min(lm0, 0 + k * 2); top = mix([30, 52, 92], [14, 24, 52], k); bottom = mix([160, 110, 90], [60, 58, 90], k); label = t('civil'); }
  else if (sunAlt > -12) { const k = (-sunAlt - 6) / 6; lm = Math.min(lm0, 2 + k * 2); top = mix([14, 24, 52], [6, 10, 24], k); bottom = mix([60, 58, 90], [18, 22, 44], k); label = t('nautical'); }
  else if (sunAlt > -18) { const k = (-sunAlt - 12) / 6; lm = Math.min(lm0, 4 + k * 2.5); top = mix([6, 10, 24], [3, 5, 12], k); bottom = mix([18, 22, 44], [8, 10, 20], k); label = t('astro'); }
  else { top = [3, 5, 12]; bottom = [8, 10, 20]; label = t('night'); }
  if (st.sky === 'city' && sunAlt < -6) bottom = mix(bottom, [46, 36, 30], 0.6);
  return { lm, top, bottom, label };
}
function mix(a, b, k) { return a.map((v, i) => v + (b[i] - v) * k); }
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

let lastFrame = { sunAlt: -90, map: null };
// phone, upright: while a card covers the lower part of the screen, the sky shrinks into the space above it
function fitAboveCard() {
  let r = R0, cy = CY0;
  if (PHONE.matches) {
    const open = [$('ocard'), $('card')].find(el => el && !el.hidden);
    if (open) {
      const avail = open.getBoundingClientRect().top - cv.getBoundingClientRect().top;
      // shrink a little (not so much that the stars crowd together) and move up; the far south may stay under the card
      if (avail < 2 * R0 + 40) { r = Math.max(R0 * 0.78, avail / 2 - 24); cy = Math.min(CY0, Math.max(avail / 2 + 2, r + 26)); }
    }
  }
  R += (r - R) * 0.25; CY += (cy - CY) * 0.25;
  if (Math.abs(R - r) < 0.3) R = r; if (Math.abs(CY - cy) < 0.3) CY = cy;
}
function draw() {
  fitAboveCard();
  const d = new Date(st.t);
  const obs = st.place;
  const map = S.horizonMapper(d, obs);
  const sun = S.bodyAltAz(A.Body.Sun, d, obs);
  const sky = skyState(sun.alt);
  lastFrame = { sunAlt: sun.alt, map, sky, date: d };
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // dome
  ctx.save();
  ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.clip();
  const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, R);
  g.addColorStop(0, rgb(sky.top)); g.addColorStop(0.75, rgb(mix(sky.top, sky.bottom, 0.45))); g.addColorStop(1, rgb(sky.bottom));
  ctx.fillStyle = g; ctx.fillRect(CX - R, CY - R, 2 * R, 2 * R);

  const nightK = Math.max(0, Math.min(1, (sky.lm - 1) / 4));
  // Milky Way
  if (nightK > 0.1) {
    const mwA = [0.025, 0.03, 0.035, 0.04, 0.045].map(a => a * nightK * (SKIES[st.sky].lm - 3.5) / 3);
    DATA.mw.forEach((polys, li) => {
      ctx.fillStyle = `rgba(190,200,230,${Math.max(0, mwA[li])})`;
      ctx.beginPath();
      for (const ring of polys) {
        let first = true;
        for (const [ra, dec] of ring) {
          const h = map(ra < 0 ? ra + 360 : ra, dec);
          if (h.alt < -40) { first = true; continue; }
          const [x, y] = proj(h.alt, h.az);
          if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        }
        ctx.closePath();
      }
      ctx.fill('evenodd');
    });
  }
  // ---- constellations: boundaries (projected for hit-testing), lines, labels ----
  const CON = DATA.cons;
  hoverCon = null;
  if (mouse && Math.hypot(mouse[0] - CX, mouse[1] - CY) < R) {
    const hp = unproj(mouse[0], mouse[1]);
    const eq = horToEq(d, obs, hp.alt, hp.az);
    hoverCon = conAt(eq.ra, eq.dec);
  }
  const ringScreen = (ring) => ring.map(([ra, dec]) => { const h = map(ra, dec); return proj(Math.max(h.alt, -80), h.az); });
  const aboveHorizon = (c) => c.bounds.some(ring => ring.some(([ra, dec]) => map(ra, dec).alt > 0));
  const active = st.focusCon || hoverCon;
  const linesOn = st.showLines;
  // spotlight: darken everything outside the focused constellation
  const focusVisible = st.focusCon && CON.some(c => c.id === st.focusCon && aboveHorizon(c));
  if (focusVisible) {
    ctx.save();
    ctx.beginPath(); ctx.arc(CX, CY, R + 2, 0, Math.PI * 2);
    CON.forEach((c, i) => { if (c.id !== st.focusCon) return; for (const ring of c.bounds.map(ringScreen)) { ring.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); } });
    ctx.fillStyle = 'rgba(1,2,6,.5)'; ctx.fill('evenodd');
    ctx.restore();
  }
  const strokeLines = (c) => {
    for (const seg of c.lines) {
      let prev = null;
      for (const [ra, dec] of seg) {
        const h = map(ra, dec);
        if (h.alt < -5) { prev = null; continue; }
        const q = proj(h.alt, h.az);
        if (prev) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); }
        prev = q;
      }
    }
  };
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = `rgba(150,170,210,${(linesOn ? 0.2 : 0.055) * (st.focusCon ? 0.5 : 1) * (0.6 + 0.4 * nightK)})`;
  ctx.beginPath(); for (const c of CON) if (c.id !== active) strokeLines(c); ctx.stroke();
  if (linesOn && !st.focusCon) {
    ctx.font = '500 10.5px "Zen Kaku Gothic New", sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(150,165,200,${0.4 * nightK + 0.1})`;
    for (const c of CON) { if (c.id === active) continue; const h = map(c.lab[0], c.lab[1]); if (h.alt < 8) continue; const [x, y] = proj(h.alt, h.az); ctx.fillText(conName(c), x, y); }
  }
  if (active) {
    const focused = !!st.focusCon;
    CON.forEach((c, i) => {
      if (c.id !== active) return;
      // boundary
      ctx.setLineDash([2, 4]); ctx.lineWidth = 1; ctx.strokeStyle = focused ? 'rgba(242,196,109,.45)' : 'rgba(242,196,109,.25)';
      if (!aboveHorizon(c)) return;
      ctx.beginPath(); for (const ring of c.bounds.map(ringScreen)) { ring.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); } ctx.stroke(); ctx.setLineDash([]);
      // figure
      ctx.lineWidth = focused ? 1.5 : 1.2; ctx.strokeStyle = focused ? 'rgba(246,232,200,.9)' : 'rgba(236,226,200,.7)';
      ctx.beginPath(); strokeLines(c); ctx.stroke();
    });
  }
  // stars
  const lm = sky.lm;
  starScreen = [];
  for (let i = 0; i < DATA.stars.length; i++) {
    const s = DATA.stars[i];
    if (s[2] > lm) break;
    const h = map(s[0], s[1]); if (h.alt < 0) continue;
    // atmospheric extinction ~0.25 mag/airmass
    const air = 1 / Math.max(Math.sin((h.alt + 244 / (165 + 47 * Math.pow(h.alt, 1.1))) * D2R), 0.02);
    const m = s[2] + 0.25 * (air - 1);
    if (m > lm) continue;
    const [x, y] = proj(h.alt, h.az);
    const k = Math.pow(10, -0.4 * (m - lm));
    const rad = Math.min(0.45 + Math.sqrt(k) * 0.55, 4.2);
    let a = Math.min(1, 0.25 + k * 0.12);
    if (st.focusCon && CON[s[4]] && CON[s[4]].id !== st.focusCon) a *= 0.45;
    const c = STAR_RGB[i];
    if (rad > 1.8) {
      const gg = ctx.createRadialGradient(x, y, 0, x, y, rad * 3.2);
      gg.addColorStop(0, rgb(c, a * 0.5)); gg.addColorStop(1, rgb(c, 0));
      ctx.fillStyle = gg; ctx.fillRect(x - rad * 3.2, y - rad * 3.2, rad * 6.4, rad * 6.4);
    }
    ctx.fillStyle = rgb(c, a); ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    if (DATA.info[i]) starScreen.push({ i, x, y, alt: h.alt, az: h.az, mag: s[2] });
  }
  mesScreen = [];
  // labels: active constellation name, its bright stars, Messier objects when focused
  ctx.textAlign = 'left';
  if (active) {
    const aidx = new Set(CON.map((c, i) => c.id === active ? i : -1).filter(i => i >= 0));
    ctx.font = '12px "Zen Kaku Gothic New", sans-serif'; ctx.fillStyle = 'rgba(236,232,220,.92)';
    for (const ss of starScreen) { const s = DATA.stars[ss.i]; if (!aidx.has(s[4]) || s[2] > (st.focusCon ? 3.6 : 2.6)) continue; ctx.fillText(starLabel(ss.i), ss.x + 7, ss.y - 5); }
    const c0 = CON.find(c => c.id === active);
    const h = map(c0.lab[0], c0.lab[1]);
    if (h.alt > -5) {
      const [x, y] = proj(Math.max(h.alt, 2), h.az);
      ctx.font = '700 17px "Shippori Mincho", serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(246,212,140,.95)';
      ctx.fillText(conName(c0), x, y + 22); ctx.textAlign = 'left';
    }
    if (st.focusCon) {
      ctx.font = '11px "JetBrains Mono", monospace';
      for (const mo of DATA.messier) {
        if (!aidx.has(mo[6])) continue;
        const hh = map(mo[4], mo[5]); if (hh.alt < 0) continue;
        const [x, y] = proj(hh.alt, hh.az);
        ctx.strokeStyle = 'rgba(160,210,255,.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(x, y, 6, 4, -0.5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(170,215,255,.9)'; ctx.fillText(messierShort(mo), x + 9, y + 4);
        mesScreen.push({ x, y, o: { kind: 'messier', m: mo } });
      }
    }
  } else if (st.showLines) {
    ctx.font = '11px "Zen Kaku Gothic New", sans-serif'; ctx.fillStyle = `rgba(215,222,236,${0.5 * nightK + 0.15})`;
    for (const ss of starScreen) { if (DATA.stars[ss.i][2] > 1.6) continue; ctx.fillText(starLabel(ss.i), ss.x + 6, ss.y - 5); }
  }

  radScreen = [];
  // meteor radiant (active showers)
  for (const sh of S.SHOWERS) {
    if (!S.showerActive(sh, d)) continue;
    const h = map(sh.ra, sh.dec); if (h.alt < 0) continue;
    const [x, y] = proj(h.alt, h.az);
    ctx.strokeStyle = 'rgba(242,196,109,.75)'; ctx.lineWidth = 1;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); ctx.lineTo(x + Math.cos(a) * 15, y + Math.sin(a) * 15); ctx.stroke(); }
    ctx.fillStyle = 'rgba(242,196,109,.95)'; ctx.font = '11px "Zen Kaku Gothic New", sans-serif'; ctx.fillText(t('radiant', showerShort(sh)), x + 18, y + 4);
    radScreen.push({ x, y, o: { kind: 'shower', sh } });
  }

  // planets
  const planetHits = [];
  for (const p of S.PLANETS) {
    const h = S.bodyAltAz(p.body, d, obs); if (h.alt < 0) continue;
    const m = A.Illumination(p.body, d).mag;
    if (m > lm + 0.5) continue;
    const [x, y] = proj(h.alt, h.az);
    const rad = Math.max(1.6, Math.min(4.5, 2.4 - m * 0.55));
    ctx.fillStyle = 'rgba(255,236,200,.95)'; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    const pn = planetName(p);
    ctx.fillStyle = 'rgba(255,226,170,.9)'; ctx.font = '500 12px "Zen Kaku Gothic New", sans-serif'; if (x > CX + R * 0.6) { ctx.textAlign = 'right'; ctx.fillText(pn, x - 8, y + 4); ctx.textAlign = 'left'; } else ctx.fillText(pn, x + 8, y + 4);
    planetHits.push({ kind: 'planet', name: pn, x, y, alt: h.alt, az: h.az, mag: m, o: { kind: 'planet', body: p.body, ja: p.ja, en: p.en } });
  }
  // moon
  const mh = S.bodyAltAz(A.Body.Moon, d, obs);
  let moonHit = null;
  if (mh.alt > -1) {
    const [x, y] = proj(mh.alt, mh.az);
    const ill = A.Illumination(A.Body.Moon, d);
    drawMoon(x, y, 9, ill.phase_fraction, A.MoonPhase(d), mh, map);
    moonHit = { kind: 'moon', name: t('moon'), x, y, alt: mh.alt, az: mh.az, ill: ill.phase_fraction, o: { kind: 'moon', body: A.Body.Moon, ja: '月' } };
  }
  // sun (daytime)
  if (sun.alt > -1) {
    const [x, y] = proj(sun.alt, sun.az);
    const gg = ctx.createRadialGradient(x, y, 0, x, y, 40); gg.addColorStop(0, 'rgba(255,245,220,1)'); gg.addColorStop(0.2, 'rgba(255,230,180,.6)'); gg.addColorStop(1, 'rgba(255,220,160,0)');
    ctx.fillStyle = gg; ctx.fillRect(x - 40, y - 40, 80, 80);
  }

  // satellite pass tracks for the focused / upcoming passes
  const showPasses = st.focusPass ? [st.focusPass] : st.passes.filter(p => passShown(p) && p.end.t > st.t - 60e3 && p.start.t < st.t + 3 * 3600e3).slice(0, 6);
  for (const p of showPasses) drawPass(p, p === st.focusPass);

  // live satellites
  const satHits = [];
  const sunE = null;
  for (const sat of st.sats) {
    if (st.docked.has(sat.id)) continue; // a ship or module riding on a station: drawn as the station
    const lk = S.satLook(sat, d, obs, sunE); if (!lk || lk.alt < 0) continue;
    const vis = lk.sunlit && sun.alt < -6 && lk.mag < lm + 0.5 && (st.satFilter === 'all' || lk.mag <= BRIGHT_MAG);
    const featured = !!S.FEATURED[sat.id];
    if (!vis && !featured) continue;
    const [x, y] = proj(lk.alt, lk.az);
    if (vis) {
      const rad = Math.max(1.4, Math.min(4.5, 2.6 - lk.mag * 0.6));
      const gg = ctx.createRadialGradient(x, y, 0, x, y, rad * 4); gg.addColorStop(0, 'rgba(235,245,255,.8)'); gg.addColorStop(1, 'rgba(235,245,255,0)');
      ctx.fillStyle = gg; ctx.fillRect(x - rad * 4, y - rad * 4, rad * 8, rad * 8);
      ctx.fillStyle = '#f4f8ff'; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(200,215,240,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.stroke();
    }
    if (featured) { ctx.fillStyle = vis ? '#f4f8ff' : 'rgba(200,215,240,.6)'; ctx.font = '500 12px "Zen Kaku Gothic New", sans-serif'; ctx.fillText(fShort(S.FEATURED[sat.id]) + (vis ? '' : t('inShadow')), x + 8, y - 6); }
    satHits.push({ kind: 'sat', name: featured ? fName(S.FEATURED[sat.id]) : sat.name, x, y, ...lk, vis, o: { kind: 'sat', sat } });
  }
  // Starlink trains: only the bunched-up members, only while sunlit against a dark sky
  for (const c of TR.active(d)) {
    let head = null, n = 0;
    for (const sat of c.members) {
      const lk = S.satLook(sat, d, obs); if (!lk || lk.alt < 0 || !lk.sunlit || sun.alt > -6) continue;
      const [x, y] = proj(lk.alt, lk.az);
      ctx.fillStyle = 'rgba(236,244,255,.92)'; ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
      if (!head) head = { x, y, lk }; n++;
    }
    if (head && n >= 3) {
      ctx.fillStyle = 'rgba(236,244,255,.8)'; ctx.font = '500 11.5px "Zen Kaku Gothic New", sans-serif'; ctx.fillText(t('trainShort'), head.x + 8, head.y - 6);
      satHits.push({ kind: 'train', name: t('train'), x: head.x, y: head.y, ...head.lk, vis: true, o: { kind: 'train', g: c.g.id } });
    }
  }
  // the selected / searched-for object: tonight's path across the sky (hour marks), and a gold ring that breathes gently
  if (st.sel) {
    const path = OI.tonightPath(st.sel);
    if (path) {
      ctx.save();
      ctx.strokeStyle = 'rgba(242,196,109,.42)'; ctx.lineWidth = 1.3; ctx.setLineDash([2, 5]);
      ctx.beginPath(); let prev = null;
      for (const s of path.pts) { if (s.alt <= 0) { prev = null; continue; } const q = proj(s.alt, s.az); if (prev) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); prev = q; }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '10.5px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      for (const s of path.pts) {
        if (!s.hour || s.alt <= 2) continue;
        const [x, y] = proj(s.alt, s.az);
        ctx.fillStyle = 'rgba(242,196,109,.75)'; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(242,196,109,.8)'; ctx.fillText(s.label, x, y - 7);
      }
      ctx.restore();
    }
    const sp = OI.posOf(st.sel, d);
    if (sp && sp.alt > 0) {
      const [x, y] = proj(sp.alt, sp.az);
      const k = 0.5 + 0.5 * Math.sin(performance.now() / 380);
      ctx.strokeStyle = `rgba(242,196,109,${0.55 + 0.4 * k})`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y, 11 + 3 * k, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.restore();

  // horizon ring + altitude grid + cardinal points
  ctx.strokeStyle = 'rgba(160,178,215,.10)'; ctx.lineWidth = 1;
  for (const a of [30, 60]) { const r = R * Math.tan((90 - a) * D2R / 2); ctx.beginPath(); ctx.arc(CX, CY, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(190,205,235,.38)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(210,220,240,.8)'; ctx.font = '500 13px "Zen Kaku Gothic New", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const edge = (az, k) => [CX - (R + k) * Math.sin(az * D2R), CY - (R + k) * Math.cos(az * D2R)];
  for (const [k, az] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) { const [x, y] = edge(az, 15); ctx.fillText(t(k), x, y); }
  ctx.fillStyle = 'rgba(150,165,200,.55)'; ctx.font = '10px "JetBrains Mono", monospace';
  for (const [k, az] of [['NE', 45], ['SE', 135], ['SW', 225], ['NW', 315]]) { const [x, y] = edge(az, 14); ctx.fillText(k, x, y); }
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';

  hits = [...satHits, ...planetHits, ...(moonHit ? [moonHit] : [])];
  drawHover();
}
let hits = [];
let hoverCon = null, starScreen = [], mesScreen = [], radScreen = [];
const TOUCH = matchMedia('(pointer: coarse)').matches;
// horizon (alt, az) -> J2000 RA/Dec, inverse of horizonMapper (rotation transpose)
function horToEq(date, obs, alt, az) {
  const R = A.Rotation_EQJ_HOR(A.MakeTime(date), new A.Observer(obs.lat, obs.lon, 0)).rot;
  const ca = Math.cos(alt * D2R);
  const hx = ca * Math.cos(az * D2R), hy = -ca * Math.sin(az * D2R), hz = Math.sin(alt * D2R);
  const x = R[0][0] * hx + R[0][1] * hy + R[0][2] * hz;
  const y = R[1][0] * hx + R[1][1] * hy + R[1][2] * hz;
  const z = R[2][0] * hx + R[2][1] * hy + R[2][2] * hz;
  return { ra: (Math.atan2(y, x) / D2R + 360) % 360, dec: Math.asin(Math.max(-1, Math.min(1, z))) / D2R };
}
// constellation containing (ra, dec): ray along the meridian toward the north pole, even-odd,
// parity flipped for rings that enclose the north pole (Ursa Minor)
const wrap180 = (a) => ((a + 540) % 360) - 180;
const RING_META = DATA.cons.map(c => c.bounds.map(ring => {
  let tot = 0, sd = 0;
  for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length]; tot += wrap180(b[0] - a[0]); sd += a[1]; }
  return { northCap: Math.abs(tot) > 180 && sd > 0 };
}));
function inRing(ra0, dec0, ring, northCap) {
  let n = 0;
  for (let k = 0; k < ring.length; k++) {
    const [r1, d1] = ring[k], [r2, d2] = ring[(k + 1) % ring.length];
    const a1 = wrap180(r1 - ra0), a2 = a1 + wrap180(r2 - r1);
    if ((a1 <= 0 && a2 > 0) || (a2 <= 0 && a1 > 0)) {
      const t = -a1 / (a2 - a1), dd = d1 + (d2 - d1) * t;
      if (dd > dec0) n++;
    }
  }
  return ((n % 2) === 1) !== northCap;
}
function conAt(ra, dec) {
  for (let i = 0; i < DATA.cons.length; i++) {
    const c = DATA.cons[i];
    for (let j = 0; j < c.bounds.length; j++) if (inRing(ra, dec, c.bounds[j], RING_META[i][j].northCap)) return c.id;
  }
  return null;
}
function pip(x, y, ring) { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins; } return ins; }

function drawMoon(x, y, r, frac, phaseDeg, mh, map) {
  // lit side points toward the Sun: compute screen direction to Sun
  const sun = S.bodyAltAz(A.Body.Sun, new Date(st.t), st.place);
  const [sx, sy] = proj(Math.max(sun.alt, -80), sun.az);
  const ang = Math.atan2(sy - y, sx - x);
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const gg = ctx.createRadialGradient(0, 0, r, 0, 0, r * 5); gg.addColorStop(0, `rgba(230,235,245,${0.18 * frac})`); gg.addColorStop(1, 'rgba(230,235,245,0)');
  ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, r * 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(40,44,56,.9)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  // lit part: half disc toward +x plus/minus terminator ellipse
  const k = 2 * frac - 1; // -1 new .. +1 full
  ctx.fillStyle = '#eef0f4';
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  ctx.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(230,234,242,.85)'; ctx.font = '500 12px "Zen Kaku Gothic New", sans-serif'; ctx.fillText(t('moon'), x + r + 6, y + 4);
}

function drawPass(p, focused) {
  const pts = p.track.map(s => proj(s.alt, s.az));
  ctx.strokeStyle = focused ? 'rgba(242,196,109,.9)' : 'rgba(220,230,250,.28)';
  ctx.lineWidth = focused ? 1.8 : 1.1; ctx.setLineDash(focused ? [] : [3, 4]);
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.setLineDash([]);
  // arrow at end
  const n = pts.length; if (n > 1) {
    const [x1, y1] = pts[n - 2], [x2, y2] = pts[n - 1]; const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.fillStyle = focused ? 'rgba(242,196,109,.9)' : 'rgba(220,230,250,.4)';
    ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 9 * Math.cos(a - 0.4), y2 - 9 * Math.sin(a - 0.4)); ctx.lineTo(x2 - 9 * Math.cos(a + 0.4), y2 - 9 * Math.sin(a + 0.4)); ctx.fill();
  }
  if (focused) {
    ctx.fillStyle = 'rgba(242,196,109,.95)'; ctx.font = '11px "JetBrains Mono", monospace';
    const [x0, y0] = pts[0]; ctx.fillText(hm(new Date(p.start.t)), x0 + 6, y0 + 14);
    const mx = proj(p.max.alt, p.max.az); ctx.fillText(hm(new Date(p.max.t)) + ' ↑' + p.max.alt.toFixed(0) + '°', mx[0] + 8, mx[1] - 8);
  }
}

// ---------- hover ----------
let mouse = null;
cv.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); mouse = [e.clientX - r.left, e.clientY - r.top]; });
cv.addEventListener('pointerleave', e => { if (e.pointerType === 'touch') return; mouse = null; $('tip').hidden = true; });
let touchTimer = 0;
cv.addEventListener('pointerdown', e => {
  const r = cv.getBoundingClientRect(); mouse = [e.clientX - r.left, e.clientY - r.top];
  if (e.pointerType === 'touch') { clearTimeout(touchTimer); touchTimer = setTimeout(() => { mouse = null; $('tip').hidden = true; }, 4000); }
});
function drawHover() {
  const tip = $('tip');
  if (!mouse || Math.hypot(mouse[0] - CX, mouse[1] - CY) > R) { tip.hidden = true; cv.style.cursor = ''; return; }
  let best = null, bd = 14;
  for (const h of hits) { const dd = Math.hypot(h.x - mouse[0], h.y - mouse[1]); if (dd < bd) { bd = dd; best = h; } }
  if (!best) {
    let bs = null, bsd = 9;
    for (const ss of starScreen) { const dd = Math.hypot(ss.x - mouse[0], ss.y - mouse[1]); if (dd < bsd) { bsd = dd; bs = ss; } }
    if (bs) best = { kind: 'star', ...bs };
  }
  const pos = unproj(mouse[0], mouse[1]);
  const where = t('altDir', pos.alt.toFixed(0), dir(pos.az));
  let html;
  if (best && best.kind === 'star') {
    const inf = DATA.info[best.i], s = DATA.stars[best.i];
    const nm = starName(best.i), alt2 = starAlt(best.i);
    const bits = [JA ? `${mag(s[2])}等` : `mag ${mag(s[2])}`];
    if (inf[2]) bits.push(t('spectrum', esc(inf[2])));
    if (inf[3]) bits.push(t('lyAbout', fmtLy(inf[3])));
    html = `<b>${esc(nm)}${alt2 ? ` <small>${esc(alt2)}</small>` : ''}</b><span>${bits.join(' · ')}</span>${inf[3] ? `<span>${t('lightLeft', lightYearText(inf[3]))}</span>` : ''}`;
  } else if (best) {
    let sub = t('altDir', best.alt.toFixed(0), dir(best.az));
    if (best.kind === 'sat') sub += ` · ${t('distKm', Math.round(best.range).toLocaleString())} · ${best.vis ? t('estMag', mag(best.mag)) : t('earthShadow')}`;
    else if (best.kind === 'train') sub += '';
    else if (best.kind === 'moon') sub += ` · ${t('litPct', (best.ill * 100).toFixed(0))}`;
    else sub += ` · ${JA ? mag(best.mag) + '等' : 'mag ' + mag(best.mag)}`;
    html = `<b>${esc(best.name)}</b><span>${sub}</span>`;
  } else if (hoverCon && hoverCon !== st.focusCon) {
    const c = DATA.cons.find(c => c.id === hoverCon);
    html = `<b>${esc(conName(c))}</b><span>${t('tapMore', TOUCH)} · ${where}</span>`;
  } else html = `<span>${where}</span>`;
  cv.style.cursor = (hoverCon || best) ? 'pointer' : '';
  tip.innerHTML = html; tip.hidden = false;
  const tx = Math.min(mouse[0] + 14, W - 290);
  tip.style.transform = `translate(${tx}px, ${mouse[1] + 12}px)`;
}
function fmtLy(ly) { return ly < 100 ? String(ly) : Number(ly.toPrecision(2)).toLocaleString(JA ? 'ja-JP' : 'en'); }
function lightYearText(ly) {
  const y = new Date(st.t).getFullYear();
  if (ly < 1) return t('lyJustNow');
  const r = ly < 100 ? ly : Number(ly.toPrecision(2));
  const yr = y - r;
  if (yr > 0) return t('lyAgo', fmtLy(ly), yr);
  return t('lyAgoBC', fmtLy(ly), 1 - yr);
}

// ---------- tonight ----------
async function computeNight() {
  const obs = st.place;
  const now = new Date(st.live ? Date.now() : st.t);
  st.win = S.nightWindow(now, obs);
  const w = st.win;
  const ev = [];
  ev.push({ t: w.sunset, kind: 'sun', title: t('sunset'), sub: t('sunsetSub') });
  if (w.astroDusk) ev.push({ t: w.astroDusk, kind: 'dark', title: t('dark'), sub: t('darkSub') });
  if (w.astroDawn) ev.push({ t: w.astroDawn, kind: 'dark', title: t('dawn'), sub: t('dawnSub') });
  ev.push({ t: w.sunrise, kind: 'sun', title: t('sunrise'), sub: '' });
  for (const m of S.moonEvents(w, obs)) {
    if (m.t < w.sunset || m.t > w.sunrise) continue;
    const ill = A.Illumination(A.Body.Moon, m.t).phase_fraction;
    const az = S.bodyAltAz(A.Body.Moon, m.t, obs).az;
    ev.push({ t: m.t, kind: 'moon', title: t(m.kind === 'moonrise' ? 'moonrise' : 'moonset'), sub: t('horizonAt', dir8(az), (ill * 100).toFixed(0)) });
  }
  // planets: best visible altitude during the night
  for (const p of S.PLANETS) {
    let best = null;
    for (let ms = (w.nauticalDusk || w.sunset).getTime(); ms <= (w.nauticalDawn || w.sunrise).getTime(); ms += 15 * 60e3) {
      const h = S.bodyAltAz(p.body, new Date(ms), obs);
      if (h.alt > 10 && (!best || h.alt > best.alt)) best = { ...h, t: new Date(ms) };
    }
    if (best) {
      const m = A.Illumination(p.body, best.t).mag;
      if (m < 2.5) ev.push({ t: best.t, kind: 'planet', title: t('planetHigh', planetName(p)), sub: t('planetHighSub', dir8(best.az), best.alt.toFixed(0), mag(m)) });
    }
  }
  st.events = ev;
  renderTonight();
  renderShowers();
  await computePasses();
}

async function computePasses() {
  if (!st.win) return;
  if (!st.sats.length && !TR.groups().length) { st.passes = []; st.trainPasses = []; renderTonight(); return; }
  st.computing = true; renderTonight();
  const t0 = new Date(Math.max(st.win.sunset.getTime(), (st.live ? Date.now() : st.t) - 15 * 60e3));
  st.docked = findDocked(st.sats, t0);
  st.passes = await S.findPasses(st.sats.filter(s => !st.docked.has(s.id)), t0, st.win.sunrise, st.place, (k) => { $('calc').textContent = t('calcPasses', (k * 100) | 0); });
  try { st.trainPasses = await TR.passes(t0, st.win.sunrise, st.place); } catch (e) { st.trainPasses = []; }
  // next space-station passes over the coming 5 days (for when none remain tonight)
  const stations = st.sats.filter(x => S.FEATURED[x.id]);
  st.nextStation = null;
  if (stations.length) {
    const from = new Date(Math.max(Date.now(), st.win.sunrise.getTime()));
    const more = await S.findPasses(stations, from, new Date(from.getTime() + 5 * 864e5), st.place);
    st.nextStation = more.find(p => p.mag < 2) || more[0] || null;
  }
  st.computing = false;
  renderTonight();
}

function renderTonight() {
  const w = st.win; if (!w) return;
  // v33: the page heading is "今夜 · 10/2(金)" (the tab already says 見ごろ); the line under the headline is the place
  $('hl-kick').textContent = t('tonightKick', md(w.sunset));
  $('night-date').textContent = placeName(st.place);
  renderLoc();
  const visAll = st.passes.filter(p => p.mag < SKIES[st.sky].lm - 0.5);
  // 'bright only' (default): space stations always, other satellites only when easy to see; 'all': everything visible
  const vis = visAll.filter(passShown);
  const faint = visAll.length - vis.length;
  const items = [
    ...st.events.map(e => ({ ...e, type: 'ev' })),
    ...vis.map(p => ({ t: new Date(p.start.t), type: 'pass', p })),
    ...(st.trainPasses || []).map(p => ({ t: new Date(p.start.t), type: 'pass', p })),
  ].sort((a, b) => a.t - b.t);
  const passName = (p) => p.kind === 'train' ? t('train') : S.FEATURED[p.sat.id] ? fShort(S.FEATURED[p.sat.id]) : (describeSat(p.sat).ja || titleCase(p.sat.name));

  // one-line summary for the phone sheet: the next thing that happens tonight
  const nowMs = st.live ? Date.now() : st.t;
  const nx = items.find(it => (it.type === 'pass' ? it.p.end.t : it.t.getTime()) > nowMs);
  if (nx) {
    const label = nx.type === 'pass' ? t('fromDir', passName(nx.p), dir(nx.p.start.az)) : nx.title;
    $('peek').innerHTML = `<b>${t('next')} ${hm(nx.t)}</b>${esc(label)}`;
  } else if (st.nextStation) {
    const n = st.nextStation; $('peek').innerHTML = `<b>${t('next')} ${md(new Date(n.start.t))} ${hm(new Date(n.start.t))}</b>${esc(t('fromDir', fShort(S.FEATURED[n.sat.id]), dir(n.start.az)))}`;
  } else $('peek').textContent = t('peekIdle');
  // headline
  const featured = vis.filter(p => S.FEATURED[p.sat.id]);
  const nextF = featured.find(p => p.end.t > Date.now()) || featured[0];
  let head;
  if (!st.sats.length) head = t('headNoData');
  else if (nextF) head = t('headStation', hm(new Date(nextF.start.t)), esc(fShort(S.FEATURED[nextF.sat.id])), dir(nextF.start.az));
  else {
    const n = st.nextStation;
    const nextTxt = n ? t('headNext', md(new Date(n.start.t)), hm(new Date(n.start.t)), esc(fShort(S.FEATURED[n.sat.id])), dir(n.start.az), n.max.alt.toFixed(0), mag(n.mag)) : '';
    head = t('headNone') + (nextTxt ? '<br><span class="head-sub">' + nextTxt + '</span>' : '');
  }
  $('headline').innerHTML = head;

  $('calc').hidden = !st.computing;
  $('tonight').innerHTML = items.map((it, i) => {
    const past = (it.type === 'pass' ? it.p.end.t : it.t.getTime()) < Date.now() && st.live;
    if (it.type === 'ev') return `<li class="ev k-${it.kind}${past ? ' past' : ''}"><button type="button" data-t="${it.t.getTime()}"><time class="num">${hm(it.t)}</time><span class="tt">${it.title}</span><span class="ss">${it.sub}</span></button></li>`;
    const p = it.p, dur = Math.max(1, Math.round((p.end.t - p.start.t) / 60e3));
    if (p.kind === 'train') return `<li class="ev k-pass k-train${past ? ' past' : ''}"><button type="button" data-pass="${i}"><time class="num">${hm(it.t)}</time><span class="tt">${esc(t('train'))}</span><span class="ss">${t('trainPassSub', dir(p.start.az), dir(p.end.az), p.max.alt.toFixed(0), dur)}</span></button></li>`;
    const f = S.FEATURED[p.sat.id];
    const nice = f ? null : describeSat(p.sat).ja;
    return `<li class="ev k-pass${f ? ' featured' : ''}${past ? ' past' : ''}"><button type="button" data-pass="${i}"><time class="num">${hm(it.t)}</time><span class="tt">${esc(f ? fName(f) : (nice || titleCase(p.sat.name)))}${nice ? `<small>${esc(titleCase(p.sat.name))}</small>` : ''}</span><span class="ss">${t('passSub', dir(p.start.az), dir(p.end.az), p.max.alt.toFixed(0), dur, mag(p.mag))}</span></button></li>`;
  }).join('');
  $('tonight').querySelectorAll('[data-pass]').forEach(b => b.addEventListener('click', () => {
    const it = items[+b.dataset.pass]; st.focusPass = it.p; setTime(it.p.start.t - 30e3, 10);
    markActive(b); sheetTo('peek');
  }));
  $('tonight').querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { st.focusPass = null; setTime(+b.dataset.t, 1); markActive(b); sheetTo('peek'); }));
  $('faint-note').textContent = faint > 0 ? t('faintBright', faint) : '';
  document.querySelectorAll('[data-satf]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.satf === st.satFilter)));
  $('satf-note').textContent = t(st.satFilter === 'all' ? 'satAllNote' : 'satBrightNote', BRIGHT_MAG, Math.round(st.sats.length / 10) * 10);
  renderScrubTicks(items);
}
// satellites that fly with a space station (docked ships, its own modules): within a few km of it now and 20 min later
function findDocked(sats, d) {
  const out = new Map();
  const stations = sats.filter(s => S.FEATURED[s.id]); if (!stations.length) return out;
  const d2 = new Date(d.getTime() + 20 * 60e3);
  const pos = (s, t) => { const e = S.satEci(s, t); return e && e.position; };
  const near = (a, b) => a && b && Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 25;
  const ref = stations.map(s => ({ s, p1: pos(s, d), p2: pos(s, d2) }));
  for (const s of sats) {
    if (S.FEATURED[s.id]) continue;
    const p1 = pos(s, d); if (!p1) continue;
    for (const r of ref) if (near(p1, r.p1) && near(pos(s, d2), r.p2)) { out.set(s.id, r.s.id); break; }
  }
  return out;
}
const passShown = (p) => p.kind === 'train' || S.FEATURED[p.sat.id] || st.satFilter === 'all' || p.mag <= BRIGHT_MAG;
document.querySelectorAll('[data-satf]').forEach(b => b.addEventListener('click', () => { st.satFilter = b.dataset.satf; store.set('satFilter', st.satFilter); renderTonight(); }));
function titleCase(s) { return s.replace(/\s+/g, ' ').trim(); }
function markActive(b) { document.querySelectorAll('#tonight button').forEach(x => x.removeAttribute('aria-current')); b.setAttribute('aria-current', 'true'); }

function renderShowers() {
  const now = new Date(st.live ? Date.now() : st.t);
  const peaks = S.showerPeaks(new Date(now.getTime() - 3 * 864e5)).filter(s => s.peak > now - 2 * 864e5).slice(0, 4);
  const lm = SKIES[st.sky].lm;
  $('showers').innerHTML = peaks.map((s, i) => {
    const n = S.showerNight(s, s.peak, st.place, lm);
    const moonTxt = t(n.ill < 0.25 ? 'moonSmall' : n.ill < 0.6 ? 'moonSome' : 'moonBad');
    const grade = t(n.rate >= 20 ? 'good' : n.rate >= 6 ? 'ok' : 'low');
    const cls = n.rate >= 20 ? 'good' : n.rate >= 6 ? 'ok' : 'low';
    const days = Math.round((s.peak - now) / 864e5);
    return `<li class="shower${i === 0 ? ' first' : ''}">
      <div class="sh-top"><span class="sh-name">${esc(JA ? s.ja : s.en)}</span><span class="grade ${cls}">${grade}</span></div>
      <div class="sh-date num">${t('peak')} ${md(s.peak)} ${hm(s.peak)}${days > 0 ? `<small> · ${t('daysLeft', days)}</small>` : days === 0 ? `<small> · ${t('today')}</small>` : ''}</div>
      ${n.best ? `<div class="sh-best">${t('best', hm(n.best.t), n.best.rad.toFixed(0), moonTxt, (n.ill * 100).toFixed(0))}</div>
      <div class="sh-rate">${t('rate', t(SKIES[st.sky].key), Math.max(1, Math.round(n.rate)), s.zhr)}</div>` : `<div class="sh-best">${t('noRadiant')}</div>`}
      <button type="button" class="sh-go" data-t="${n.best ? n.best.t.getTime() : s.peak.getTime()}">${t('seeThatNight')}</button>
    </li>`;
  }).join('');
  $('showers').querySelectorAll('.sh-go').forEach(b => b.addEventListener('click', () => { st.focusPass = null; setTime(+b.dataset.t, 1, true); sheetTo('peek'); }));
}

// ---------- time ----------
function setTime(ms, rate = 1, recompute = false) {
  st.live = false; st.t = ms; st.rate = rate;
  updateTimeUI();
  if (recompute) computeNight();
}
$('now').addEventListener('click', () => { st.live = true; st.rate = 1; st.focusPass = null; st.t = Date.now(); updateTimeUI(); computeNight(); });
document.querySelectorAll('[data-rate]').forEach(b => b.addEventListener('click', () => { st.live = false; st.rate = +b.dataset.rate; updateTimeUI(); }));
function updateTimeUI() {
  document.querySelectorAll('[data-rate]').forEach(b => b.setAttribute('aria-pressed', String(!st.live && +b.dataset.rate === st.rate)));
  $('now').setAttribute('aria-pressed', String(st.live));
}
// scrubber across the night
const scrub = $('scrub');
function renderScrubTicks(items) {
  const w = st.win; if (!w) return;
  const t0 = w.sunset.getTime() - 3600e3, t1 = w.sunrise.getTime() + 3600e3;
  const pct = (t) => ((t - t0) / (t1 - t0) * 100).toFixed(2) + '%';
  const band = (a, b, cls) => a && b ? `<i class="band ${cls}" style="left:${pct(a)};width:calc(${pct(b)} - ${pct(a)})"></i>` : '';
  let html = band(w.sunset, w.civilDusk, 'b1') + band(w.civilDusk, w.nauticalDusk, 'b2') + band(w.nauticalDusk, w.astroDusk, 'b3') + band(w.astroDusk, w.astroDawn, 'b4') + band(w.astroDawn, w.nauticalDawn, 'b3') + band(w.nauticalDawn, w.civilDawn, 'b2') + band(w.civilDawn, w.sunrise, 'b1');
  html += items.filter(it => it.type === 'pass').map(it => `<i class="tick${S.FEATURED[it.p.sat.id] ? ' f' : ''}" style="left:${pct(it.p.start.t)}"></i>`).join('');
  for (let h = Math.ceil(t0 / 3600e3) * 3600e3; h < t1; h += 3600e3) {
    const hh = +new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }).format(new Date(h));
    if (hh % 2 === 0) html += `<span class="hr num" style="left:${pct(h)}">${hh}</span>`;
  }
  $('scrub-track').innerHTML = html + '<b id="cursor"></b>';
  scrub.dataset.t0 = t0; scrub.dataset.t1 = t1;
}
function scrubTo(e) {
  const r = scrub.getBoundingClientRect();
  const k = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  st.focusPass = null; setTime(+scrub.dataset.t0 + k * (+scrub.dataset.t1 - +scrub.dataset.t0), 0);
}
let dragging = false;
scrub.addEventListener('pointerdown', e => { dragging = true; scrub.setPointerCapture(e.pointerId); scrubTo(e); });
scrub.addEventListener('pointermove', e => { if (dragging) scrubTo(e); });
scrub.addEventListener('pointerup', () => { dragging = false; });

// ---------- place & sky ----------
const sel = $('place');
sel.innerHTML = PLACES.map(p => `<option value="${p.id}">${JA ? p.ja : p.en}</option>`).join('') + `<option value="custom">${t('latlonOpt')}</option>`;
if (st.place.id === 'here') sel.insertAdjacentHTML('afterbegin', `<option value="here">${t('here')}</option>`);
sel.value = PLACES.some(p => p.id === st.place.id) || st.place.id === 'here' ? st.place.id : 'custom';
sel.addEventListener('change', () => {
  if (sel.value === 'here') { $('geo').click(); return; }
  if (sel.value === 'custom') { $('custom').hidden = false; $('lat').value = st.place.lat; $('lon').value = st.place.lon; $('lat').focus(); return; }
  $('custom').hidden = true;
  st.place = PLACES.find(p => p.id === sel.value); store.set('place', st.place); computeNight();
});
$('custom').addEventListener('submit', e => {
  e.preventDefault();
  const lat = parseFloat($('lat').value), lon = parseFloat($('lon').value);
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) { $('custom-err').textContent = t('latlonErr'); return; }
  $('custom-err').textContent = '';
  st.place = { id: 'custom', ja: `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`, lat, lon }; store.set('place', st.place);
  $('custom').hidden = true; computeNight();
});
const skySel = $('skysel');
skySel.value = st.sky;
skySel.addEventListener('change', () => { st.sky = skySel.value; store.set('sky', st.sky); renderTonight(); renderShowers(); });

// ---------- orbital data ----------
function loadStoredTLE() {
  const txt = store.get('tle', '');
  if (txt) setSats(S.parseTLE(txt), false);
  renderData();
  // On the hosted site a scheduled job keeps tle.txt fresh next to the page.
  try {
    fetch('tle.txt', { cache: 'no-cache' }).then(r => r.ok ? r.text() : '').then(t => {
      const list = S.parseTLE(t || '');
      if (!list.length) return;
      const cur = st.sats.find(x => x.id === 25544);
      const nw = list.find(x => x.id === 25544) || list[0];
      if (!cur || nw.epoch > cur.epoch) { const merged = mergeTLE(store.get('tle', ''), t); setSats(S.parseTLE(merged), true, merged); st.autoTLE = true; renderData(); computePasses(); }
    }).catch(() => { }).finally(directFetch);
  } catch (e) { }
}
// Fallback: the phone asks CelesTrak itself when the saved data is over a day old.
// Works only if CelesTrak allows cross-site requests; at most once every 2 hours per device.
function directFetch() {
  try {
    if (/claude\.(ai|site)|claudeusercontent/.test(location.hostname) || location.protocol !== 'https:') return;
    const cur = st.sats.find(x => x.id === 25544);
    if (cur && Date.now() - cur.epoch < 864e5) return;
    const last = store.get('directAt', 0);
    if (Date.now() - last < 2 * 3600e3) return;
    store.set('directAt', Date.now());
    const base = 'https://celestrak.org/NORAD/elements/gp.php?FORMAT=tle&GROUP=';
    Promise.all(['stations', 'visual'].map(g => fetch(base + g).then(r => r.ok ? r.text() : '').catch(() => '')))
      .then(([a, b]) => {
        const t = a + '\n' + b;
        const list = S.parseTLE(t); if (!list.length) return;
        const merged = mergeTLE(store.get('tle', ''), t);
        setSats(S.parseTLE(merged), true, merged); st.autoTLE = true; renderData(); computePasses();
      });
  } catch (e) { }
}
function setSats(list, save, raw) {
  // keep the featured stations first, then brightest known list order
  const byId = new Map(); for (const s of list) byId.set(s.id, s);
  st.sats = [...byId.values()].filter(s => Date.now() - s.epoch < 30 * 864e5 || true);
  if (save && raw) store.set('tle', raw);
}
function renderData() {
  const box = $('data-state');
  if (!st.sats.length) { box.innerHTML = t('dataNone'); return; }
  const iss = st.sats.find(s => s.id === 25544) || st.sats[0];
  const age = (Date.now() - iss.epoch) / 864e5;
  const cls = age < 2 ? 'fresh' : age < 5 ? 'aging' : 'stale';
  const note = t(age < 2 ? 'dataFresh' : age < 5 ? 'dataAging' : 'dataStale');
  box.innerHTML = `<b class="${cls}">${t('dataCount', st.sats.length, st.autoTLE)}</b><span>${t('dataEpoch', md(iss.epoch), hm(iss.epoch), age.toFixed(1), note)}</span>`;
}
$('open-data').addEventListener('click', () => { $('dlg').hidden = false; $('tle-text').focus(); });
$('dlg-close').addEventListener('click', () => { $('dlg').hidden = true; });
$('dlg').addEventListener('click', e => { if (e.target === $('dlg')) $('dlg').hidden = true; });
$('tle-form').addEventListener('submit', e => {
  e.preventDefault();
  const raw = $('tle-text').value;
  const list = S.parseTLE(raw);
  if (!list.length) { $('tle-err').textContent = t('tleNotFound'); return; }
  $('tle-err').textContent = '';
  // merge with existing
  const prev = store.get('tle', '');
  const merged = mergeTLE(prev, raw);
  setSats(S.parseTLE(merged), true, merged);
  $('dlg').hidden = true; $('tle-text').value = '';
  renderData(); computePasses();
});
$('tle-clear').addEventListener('click', () => { store.set('tle', ''); st.sats = []; st.passes = []; renderData(); renderTonight(); $('dlg').hidden = true; });
function mergeTLE(a, b) {
  const m = new Map();
  for (const s of S.parseTLE(a || '')) m.set(s.id, s);
  for (const s of S.parseTLE(b)) m.set(s.id, s);
  return [...m.values()].map(s => `${s.name}\n${s.l1}\n${s.l2}`).join('\n');
}

// ---------- constellation focus ----------
const AREA_RANK = (() => { const m = new Map(); for (const c of DATA.cons) m.set(c.id, Math.max(m.get(c.id) || 0, c.area)); const arr = [...m.entries()].sort((a, b) => b[1] - a[1]); return new Map(arr.map(([id, a], i) => [id, { area: a, rank: i + 1 }])); })();
let downAt = null;
cv.addEventListener('pointerdown', e => { const r = cv.getBoundingClientRect(); downAt = [e.clientX - r.left, e.clientY - r.top, performance.now()]; });
// a deliberate tap (short, not a drag) picks the nearest thing under the finger; empty sky picks the constellation
function objectAt(x, y, touch) {
  const rBody = touch ? 24 : 14, rStar = touch ? 16 : 9;
  let best = null, bd = Infinity;
  const consider = (list, rad, get) => { for (const h of list) { const dd = Math.hypot(h.x - x, h.y - y); if (dd < rad && dd < bd) { bd = dd; best = get(h); } } };
  consider(hits, rBody, h => h.o);
  if (!best) consider(radScreen, rBody, h => h.o);
  if (!best) consider(mesScreen, rStar + 2, h => h.o);
  if (!best) consider(starScreen, rStar, h => ({ kind: 'star', i: h.i }));
  return best;
}
cv.addEventListener('pointerup', e => {
  const r = cv.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
  if (!downAt || Math.hypot(x - downAt[0], y - downAt[1]) > 6 || performance.now() - downAt[2] > 450) return;
  if (Math.hypot(x - CX, y - CY) > R) { focusCon(null); closeObj(); return; }
  const o = objectAt(x, y, e.pointerType !== 'mouse');
  if (o) { openObj(o); return; }
  closeObj();
  const hp = unproj(x, y); const eq = horToEq(new Date(st.t), st.place, hp.alt, hp.az);
  const hit = conAt(eq.ra, eq.dec);
  focusCon(hit || null);
});
addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('dlg').hidden) $('dlg').hidden = true; else if (st.sel) closeObj(); else focusCon(null); } });
$('card-close').addEventListener('click', () => focusCon(null));
const tgl = $('t-lines');
tgl.setAttribute('aria-pressed', String(st.showLines));
tgl.addEventListener('click', () => { st.showLines = !st.showLines; store.set('lines', st.showLines); tgl.setAttribute('aria-pressed', String(st.showLines)); });

function focusCon(id) {
  if (id && id !== st.focusCon) TP.opened({ kind: 'con', id });
  if (id) closeObjCard();
  st.focusCon = id;
  $('card').hidden = !id;
  document.querySelector('.legend').hidden = !!id;
  if (id) renderCard();
}
function conStars(id) {
  const out = [];
  DATA.stars.forEach((s, i) => { const c = DATA.cons[s[4]]; if (c && c.id === id) out.push(i); });
  return out; // already sorted by magnitude
}
function conCenter(id) { const c = DATA.cons.find(c => c.id === id); return c.lab; }
function culminationMonth(ra) {
  // month in which the point crosses the meridian at 21:00 local (JST) as seen from the observer
  let best = null;
  const y = new Date(st.t).getFullYear();
  for (let m = 0; m < 12; m++) {
    const d = new Date(Date.UTC(y, m, 15, 21, 0, 0) - st.place.lon / 15 * 3600e3); // about 21:00 local time
    const lst = (A.SiderealTime(d) * 15 + st.place.lon + 720) % 360;
    const diff = Math.abs(((lst - ra + 540) % 360) - 180);
    if (!best || diff < best.diff) best = { m: m + 1, diff };
  }
  return best.m;
}
function nextRise(ra, dec) {
  const t0 = st.t;
  const alt = (ms) => S.horizonMapper(new Date(ms), st.place)(ra, dec).alt;
  let prev = alt(t0);
  for (let ms = t0 + 5 * 60e3; ms < t0 + 26 * 3600e3; ms += 5 * 60e3) { const a = alt(ms); if (prev <= 0 && a > 0) return new Date(ms); prev = a; }
  return null;
}
function renderCard() {
  const id = st.focusCon; if (!id) return;
  const parts = DATA.cons.filter(c => c.id === id);
  const c = parts[0];
  const [ra, dec] = conCenter(id);
  const lat = st.place.lat;
  const maxAlt = 90 - Math.abs(lat - dec), minAlt = Math.abs(lat + dec) - 90;
  const h = S.horizonMapper(new Date(st.t), st.place)(ra, dec);
  const stars = conStars(id);
  const n65 = stars.length;
  const top = stars.slice(0, 5);
  const b0 = top[0];
  const inf0 = b0 != null ? DATA.info[b0] : null;
  const ar = AREA_RANK.get(id);
  const mes = DATA.messier.filter(m => DATA.cons[m[6]] && DATA.cons[m[6]].id === id);
  // plain-language lead
  let lead = '';
  if (inf0) {
    const nm = starName(b0);
    lead += t('brightest', esc(nm), mag(DATA.stars[b0][2]));
    if (inf0[3]) lead += t('lightLeftLead', lightYearText(inf0[3]));
    if (inf0[4] && inf0[4] >= 5) lead += t('timesSun', inf0[4] >= 100 ? Number(inf0[4].toPrecision(2)).toLocaleString(JA ? 'ja-JP' : 'en') : Math.round(inf0[4]));
  }
  const famous = mes.find(m => JA ? m[1] : MESSIER_EN_OF(m));
  if (famous) lead += t('alsoHere', esc(JA ? famous[1] : MESSIER_EN_OF(famous)), famous[0]);
  // tonight / season
  let now;
  const pn = esc(placeName(st.place));
  if (h.alt > 0) now = t('nowIn', dir8(h.az), h.alt.toFixed(0));
  else if (maxAlt < 0) now = t('neverRises', pn);
  else { const r = nextRise(ra, dec); now = r ? t('belowRises', hm(r)) : t('below'); }
  let season;
  let bMin = 90, bMax = -90; for (const pc of parts) for (const ring of pc.bounds) for (const [, dd] of ring) { bMin = Math.min(bMin, dd); bMax = Math.max(bMax, dd); }
  const whollyCirc = lat >= 0 ? bMin > 90 - lat : bMax < -90 - lat;
  if (whollyCirc) season = t('circumpolar', pn);
  else if (minAlt > 0) season = t('partCirc', t('monthName', culminationMonth(ra)));
  else if (maxAlt < 0) season = t('hidden', pn);
  else season = t('season', t('monthName', culminationMonth(ra)), maxAlt.toFixed(0));

  $('card-kicker').textContent = t('conKicker', id);
  $('card-name').textContent = conName(c);
  $('card-latin').textContent = `${JA ? c.la : ''}${c.gen ? (JA ? ' · ' : '') + t('genitive') + ' ' + c.gen : ''}`;
  $('card-lead').innerHTML = lead || t('modest');
  TP.render($('card-topic'), { kind: 'con', id }, new Date(st.t));
  $('card-now').innerHTML = `${now}<br><span>${season}</span>`;
  $('card-facts').innerHTML = [
    [t('area'), t('areaV', Math.round(ar.area).toLocaleString(JA ? 'ja-JP' : 'en'), ar.rank)],
    [t('n65'), t('count', n65)],
    ...(() => { let n = null; for (const i of stars) { const inf = DATA.info[i]; if (inf && inf[3] && (!n || inf[3] < n.ly)) n = { ly: inf[3], nm: starName(i) }; } return n ? [[t('nearest'), `${esc(n.nm)} <small>${t('lyAbout', fmtLy(n.ly))}</small>`]] : []; })(),
    [t('center'), t('raDec', (ra / 15).toFixed(1), (dec >= 0 ? '+' : '−') + Math.abs(dec).toFixed(0))],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('card-stars').innerHTML = top.map(i => {
    const inf = DATA.info[i] || [];
    const nm = JA ? inf[1] : starName(i) !== inf[0] ? starName(i) : '';
    return `<tr><td>${esc(nm || '—')}</td><td class="num">${esc(inf[0] || '')}</td><td class="num r">${mag(DATA.stars[i][2])}</td><td class="num">${esc(inf[2] || '')}</td><td class="num r">${inf[3] ? fmtLy(inf[3]) : '—'}</td></tr>`;
  }).join('');
  $('card-mes-wrap').hidden = !mes.length;
  $('card-mes').innerHTML = mes.map(m => `<li><b class="num">${m[0]}</b> ${esc((JA ? m[1] : MESSIER_EN_OF(m)) || '')} <span>${esc(mtype(m[2]))}${m[3] ? ` · ${JA ? m[3] + '等' : 'mag ' + m[3]}` : ''}</span></li>`).join('');
}
setInterval(() => { if (st.focusCon) renderCard(); }, 5000);

// ---------- anything-card (planets, Moon, stars, Messier, satellites, radiants) ----------
const TP = createTopics({ S, A });
const OI = createObjInfo({ st, S, A, DATA, dir, mag, esc, hm, md, lightYearText, fmtLy, TR, TP });
st.sel = null;
const ocard = $('ocard');
const ocHandlers = { con: (id) => { closeObj(); focusCon(id); }, pass: (p) => { st.focusPass = p; closeObjCard(); setTime(p.start.t - 30e3, 10); } };
function openObj(o) {
  TP.opened(o);
  if (st.focusCon) focusCon(null);
  st.sel = o; ocard.hidden = false; document.querySelector('.legend').hidden = true;
  OI.render(ocard, o, new Date(st.t), ocHandlers); ocard.scrollTop = 0;
}
function closeObjCard() { ocard.hidden = true; if (!st.focusCon) document.querySelector('.legend').hidden = false; }
function closeObj() { st.sel = null; closeObjCard(); }
$('ocard-close').addEventListener('click', closeObj);
setInterval(() => { if (st.sel && !ocard.hidden) OI.render(ocard, st.sel, new Date(st.t), ocHandlers); }, 1000);

// ---------- かざすモード ----------
const ar = createAR({ $, st, DATA, STAR_RGB, S, A, rgb, skyState, horToEq, conAt, focusCon, dir, dir8, mag, esc, hm, md, SKIES, OI, TR, TP });

// ---------- search ----------
const finder = createSearch({ st, S, A, DATA, OI, dir, mag, esc, TR });
function pickFound(o) {
  if (ar.isOn()) { ar.setTarget(o); return; }
  if (o.kind === 'con') { closeObj(); focusCon(o.id); return; }
  openObj(o);
}
// search lives in the pointing view (it guides you there); the star map shows a tonight path when you tap something
$('ar-find').addEventListener('click', () => finder.open(pickFound));
window.__zen = { st, ar, TR, computeNight, openObj, focusCon };

// ---------- share ----------
const sharer = createShare({ st, S, A, DATA, STAR_RGB, skyState, OI, TR, hm, md, placeName, fShort });
$('t-share').addEventListener('click', () => sharer.share());
window.__zen.sharer = sharer;

// ---------- static text in the page ----------
document.documentElement.lang = LANG;
document.querySelectorAll('[data-t]').forEach(el => { el.innerHTML = t(el.dataset.t); });
document.querySelectorAll('[data-t-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.tAria)));
document.querySelectorAll('[data-t-ph]').forEach(el => el.setAttribute('placeholder', t(el.dataset.tPh)));
$('foot-credits').textContent = t('credits', TZ === 'Asia/Tokyo' ? t('tzJapan') : t('tzDevice', TZ));
const langSel = $('lang');
langSel.innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
langSel.value = LANG;
langSel.addEventListener('change', () => { setLang(langSel.value); const u = new URL(location.href); u.searchParams.delete('lang'); location.replace(u.toString()); });
// かざすは本物の空に重ねる機能なので、開くときは必ず「現在」の時刻にする（v32）。
// 時間バーで止めた・ずらした時刻のままだと、通過の案内の秒が止まったり、星や衛星の位置が本物とずれる。
$('t-ar').addEventListener('click', () => { if (!st.live) $('now').click(); ar.open(); });

// ---------- loop ----------
let prev = performance.now();
function loop(now) {
  const dt = now - prev; prev = now;
  if (st.live) st.t = Date.now(); else st.t += dt * st.rate;
  if (st.win) {
    const w = st.win, t0 = +scrub.dataset.t0, t1 = +scrub.dataset.t1;
    const c = $('cursor'); if (c) c.style.left = ((st.t - t0) / (t1 - t0) * 100) + '%';
    if (st.live && Date.now() > w.sunrise.getTime() + 3600e3) computeNight();
  }
  const d = new Date(st.t);
  $('clock').textContent = hms(d);
  $('clock-date').textContent = md(d) + ' · ' + (st.live ? t('live') : st.rate === 0 ? t('paused') : t('speed', st.rate));
  $('live-dot').dataset.live = String(st.live);
  if (!ar.isOn()) { draw(); $('sky-state').textContent = lastFrame.sky.label; }
  requestAnimationFrame(loop);
}

// current location (works on the hosted site; the Claude viewer refuses it)
$('geo').addEventListener('click', () => {
  const msg = $('custom-err');
  if (!navigator.geolocation) { msg.textContent = t('geoNo'); return; }
  $('geo').disabled = true;
  navigator.geolocation.getCurrentPosition(p => {
    $('geo').disabled = false;
    const lat = +p.coords.latitude.toFixed(3), lon = +p.coords.longitude.toFixed(3);
    st.place = { id: 'here', ja: '現在地', lat, lon }; store.set('place', st.place);
    if (![...sel.options].some(o => o.value === 'here')) sel.insertAdjacentHTML('afterbegin', `<option value="here">${t('here')}</option>`);
    sel.value = 'here'; msg.textContent = ''; computeNight();
  }, () => { $('geo').disabled = false; msg.textContent = t('geoFail'); $('custom').hidden = false; }, { timeout: 10000, maximumAge: 600000 });
});
// collapsible panels: closed by default on phones, remembered per viewer
document.querySelectorAll('details.fold').forEach(d => {
  const key = 'fold.' + d.dataset.fold;
  const saved = store.get(key, null);
  d.open = saved == null ? true : saved;
  d.addEventListener('toggle', () => store.set(key, d.open));
});
// ---------- pages (v33) ----------
// Phone upright: tabs 空・見ごろ・その他 at the bottom; 見ごろ and その他 are full-screen pages above the tabs.
// Phone on its side and PC: the sky is always on the left, the right column switches 見ごろ／その他.
const PHONE = matchMedia('(max-width: 980px) and (orientation: portrait)');
const sheet = $('sheet'), sheetBody = $('sheet-body');
const HASH = { hl: '#highlights', more: '#more' };
let pane = location.hash === '#more' ? 'more' : 'hl';
let page = PHONE.matches ? (HASH[pane] === location.hash ? pane : 'sky') : pane;
function showPage(p, fromUser) {
  if (p !== 'sky') { if (p !== pane) sheetBody.scrollTop = 0; pane = p; }
  if (!PHONE.matches && p === 'sky') p = pane;
  page = p;
  $('pane-hl').hidden = pane !== 'hl'; $('pane-more').hidden = pane !== 'more';
  sheet.classList.toggle('open', PHONE.matches && page !== 'sky');
  document.querySelectorAll('#tabs [data-page]').forEach(b => { if (b.dataset.page === page) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  document.querySelectorAll('.pane-seg [data-page]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.page === pane)));
  if (fromUser) { const h = page === 'sky' ? '' : HASH[page]; if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h); }
}
// 'peek' goes back to the sky (used after jumping to a time), anything else opens 見ごろ
function sheetTo(state) {
  if (state === 'peek') { if (PHONE.matches) showPage('sky', true); }
  else { sheetBody.scrollTop = 0; showPage('hl', true); }
}
document.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => showPage(b.dataset.page, true)));
$('info-open').addEventListener('click', () => sheetTo('full'));
addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('open') && $('dlg').hidden && $('loc-pop').hidden) showPage('sky', true); });
PHONE.addEventListener && PHONE.addEventListener('change', () => showPage(PHONE.matches ? 'sky' : pane));
addEventListener('hashchange', () => { const p = location.hash === '#more' ? 'more' : location.hash === '#highlights' ? 'hl' : 'sky'; showPage(p); });
showPage(page);

// ---------- observing place & sky darkness: one button on the phone (v33) ----------
// The button and its panel only drive the existing selects, so the place/sky logic stays in one place.
function renderLoc() {
  const here = st.place.id === 'here';
  const pin = here ? '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 11s4-4 4-6.5a4 4 0 0 0-8 0C2 7 6 11 6 11z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="6" cy="4.6" r="1.4" fill="currentColor"/></svg>' : '';
  const sky = t(SKIES[st.sky].key.replace(/S$/, 'N'));
  $('loc-btn').innerHTML = `${pin}<span class="lb-t">${esc(placeName(st.place))} <i>·</i> ${esc(sky)}</span><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" stroke="currentColor" fill="none" stroke-width="1.4"/></svg>`;
  $('loc-btn').setAttribute('aria-label', t('locBtnAria', placeName(st.place), sky));
  $('more-place').textContent = placeName(st.place);
  $('more-sky').textContent = skySel.options[skySel.selectedIndex] ? skySel.options[skySel.selectedIndex].textContent : sky;
  $('lp-here').setAttribute('aria-pressed', String(here));
  $('lp-places').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.place === st.place.id)));
  $('lp-skies').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sky === st.sky)));
}
$('lp-places').innerHTML = PLACES.map(p => `<button type="button" data-place="${p.id}">${JA ? p.ja : p.en}</button>`).join('') + `<button type="button" data-place="custom">${t('latlonShort')}</button>`;
$('lp-skies').innerHTML = Object.entries(SKIES).map(([k, v]) => `<button type="button" data-sky="${k}"><span>${t(v.key.replace(/S$/, 'N'))}</span><small>${t('limMag', v.lm)}</small></button>`).join('');
const locPop = $('loc-pop');
function locOpen() { renderLoc(); locPop.hidden = false; }
function locClose() { locPop.hidden = true; }
$('loc-btn').addEventListener('click', locOpen);
document.querySelectorAll('[data-loc]').forEach(b => b.addEventListener('click', locOpen));
$('lp-close').addEventListener('click', locClose);
locPop.addEventListener('click', e => { if (e.target === locPop) locClose(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !locPop.hidden) locClose(); });
$('lp-here').addEventListener('click', () => { locClose(); $('geo').click(); });
$('lp-places').addEventListener('click', e => {
  const b = e.target.closest('[data-place]'); if (!b) return;
  locClose();
  sel.value = b.dataset.place; sel.dispatchEvent(new Event('change'));
});
$('lp-skies').addEventListener('click', e => {
  const b = e.target.closest('[data-sky]'); if (!b) return;
  skySel.value = b.dataset.sky; skySel.dispatchEvent(new Event('change')); renderLoc();
});
function boot() {
  resize();
  loadStoredTLE();
  updateTimeUI();
  computeNight();
  TR.load().then(ok => { if (ok) computePasses(); });
  requestAnimationFrame(loop);
  $('loading').dataset.done = 'true';
  setInterval(() => { if (st.live) renderData(); }, 60e3);
  try { if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude\.(ai|site)|claudeusercontent/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => { }); } catch (e) { }
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => 0);
boot();
