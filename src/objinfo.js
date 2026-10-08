// One card for anything in the sky: planet, Moon, Sun, star, Messier object, satellite, meteor shower, Starlink train.
// Used by the star map and by the pointing (AR) view. `root` holds elements with the classes
// .oc-kind .oc-name .oc-sub .oc-now .oc-lead .oc-facts .oc-actions .oc-foot
import { orbitOf, describeSat, visNote, orbitKind, isModule } from './satinfo.js';
import { t, JA, TZ, LOCALE, kmText, lightTime, magT, magU, magWord } from './i18n.js';
import { mtype, conName, starName, starAlt, messierName, planetName, showerName } from './names.js';
export { mtype };

const PLANET_NOTE = {
  Mercury: ['太陽にいちばん近い最小の惑星。太陽から離れて見える時期が短く、見られる日は貴重です。', 'The smallest planet and the closest to the Sun. It strays far enough from the Sun to be seen only briefly, so a sighting is a treat.'],
  Venus: ['厚い雲に覆われ、太陽の光をよく反射するため、月の次に明るく見える天体です。', 'Wrapped in thick clouds that reflect sunlight well, it is the brightest thing in the night sky after the Moon.'],
  Mars: ['赤く見えるのは地表の酸化鉄（さび）の色。約2年2か月ごとに地球へ近づき、明るくなります。', 'Its red colour is iron oxide (rust) on the surface. Every 2 years and 2 months it comes close to Earth and brightens.'],
  Jupiter: ['太陽系最大の惑星。双眼鏡でも、まわりを回るガリレオ衛星（4つの衛星）が点として見えます。', 'The largest planet. Even binoculars show its four Galilean moons as points of light beside it.'],
  Saturn: ['小さな望遠鏡でも環が見えます。環の傾きは約15年ごとに変わり、真横になると見えなくなります。', 'A small telescope shows its rings. Their tilt changes over about 15 years; edge-on, they almost vanish.'],
};
const RADIUS = { Mercury: 2439.7, Venus: 6051.8, Mars: 3396.2, Jupiter: 71492, Saturn: 60268 };
const MOON_NAMES = { ja: ['新月', '三日月', '上弦の月', '満ちていく月', '満月', '欠けていく月', '下弦の月', '有明の月'], en: ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'] };
const SPEC_COLOR = { O: ['青白い', 'blue-white'], B: ['青白い', 'blue-white'], A: ['白い', 'white'], F: ['黄みがかった白の', 'yellowish-white'], G: ['黄色い', 'yellow'], K: ['オレンジ色の', 'orange'], M: ['赤い', 'red'] };

export function createObjInfo(deps) {
  const { st, S, A, DATA, dir, esc, hm, md, lightYearText, fmtLy, TR, TP } = deps;
  const dayKey = (d) => new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, month: 'numeric', day: 'numeric' }).format(d);
  const when = (d, ref) => d ? (dayKey(d) === dayKey(ref) ? hm(d) : `${md(d)} ${hm(d)}`) : '—';
  const conOf = (ra, dec) => { const c = A.Constellation(ra, dec); const hit = DATA.cons.find(x => x.id === c.symbol); return hit ? conName(hit) : c.name; };
  const observer = () => new A.Observer(st.place.lat, st.place.lon, 0);
  const num = (n) => n.toLocaleString(JA ? 'ja-JP' : 'en');

  // where it is (alt/az) at date
  function posOf(o, d) {
    const obs = st.place;
    if (o.kind === 'planet' || o.kind === 'moon' || o.kind === 'sun') return S.bodyAltAz(o.body, d, obs);
    if (o.kind === 'star') { const s = DATA.stars[o.i]; return S.horizonMapper(d, obs)(s[0], s[1]); }
    if (o.kind === 'messier') return S.horizonMapper(d, obs)(o.m[4], o.m[5]);
    if (o.kind === 'shower') return S.horizonMapper(d, obs)(o.sh.ra, o.sh.dec);
    if (o.kind === 'con') { const c = DATA.cons.find(c => c.id === o.id); return S.horizonMapper(d, obs)(c.lab[0], c.lab[1]); }
    if (o.kind === 'aster') return S.horizonMapper(d, obs)(o.a.ra, o.a.dec); // the middle of the group (v44)
    if (o.kind === 'sat') { const lk = S.satLook(o.sat, d, obs); return lk ? { alt: lk.alt, az: lk.az, lk } : null; }
    if (o.kind === 'train') { const g = TR && TR.byId(o.g), c = g && TR.cluster(g, d); if (!c) return null; const lk = S.satLook(c.members[Math.floor(c.members.length / 2)], d, obs); return lk ? { alt: lk.alt, az: lk.az, lk } : null; }
    return null;
  }
  function nameOf(o) {
    if (o.kind === 'planet') return JA ? o.ja : o.en;
    if (o.kind === 'moon') return t('moon');
    if (o.kind === 'sun') return t('sun');
    if (o.kind === 'star') return starName(o.i);
    if (o.kind === 'messier') return messierName(o.m);
    if (o.kind === 'shower') return showerName(o.sh);
    if (o.kind === 'con') { const c = DATA.cons.find(c => c.id === o.id); return c ? conName(c) : o.id; }
    if (o.kind === 'sat') { const f = S.FEATURED[o.sat.id]; if (f) return JA ? f.ja : f.en; const i = describeSat(o.sat); return i.ja || o.sat.name; }
    if (o.kind === 'train') return t('train');
    if (o.kind === 'aster') return JA ? o.a.ja : o.a.en;
    return '';
  }
  function keyOf(o) { return o.kind + ':' + (o.i ?? o.id ?? o.g ?? (o.sat && o.sat.id) ?? (o.m && o.m[0]) ?? (o.sh && o.sh.code) ?? o.ja); }
  // next rise for a fixed RA/Dec (stars, Messier, radiants)
  function nextRiseFixed(ra, dec, t0) {
    const alt = (ms) => S.horizonMapper(new Date(ms), st.place)(ra, dec).alt;
    let prev = alt(t0);
    for (let ms = t0 + 5 * 60e3; ms < t0 + 26 * 3600e3; ms += 5 * 60e3) { const a = alt(ms); if (prev <= 0 && a > 0) return new Date(ms); prev = a; }
    return null;
  }
  // tonight's path (sunset → sunrise, every 10 min, on the clock) and its rise / highest / set
  const pathCache = new Map();
  function tonightPath(o) {
    if (!st.win || ['sat', 'train', 'sun', 'con'].includes(o.kind)) return null;
    const a = st.win.sunset.getTime(), b = st.win.sunrise.getTime();
    const key = keyOf(o) + '@' + a + ':' + st.place.lat + ',' + st.place.lon;
    if (pathCache.has(key)) return pathCache.get(key);
    const pts = [];
    const step = 10 * 60e3;
    const push = (ms) => { const q = posOf(o, new Date(ms)); if (!q) return; const dd = new Date(ms); const hour = dd.getMinutes() === 0; pts.push({ t: ms, alt: q.alt, az: q.az, hour, label: hour ? String(dd.getHours()) : '' }); };
    push(a);
    for (let ms = Math.ceil(a / step) * step; ms < b; ms += step) push(ms);
    push(b);
    // events, crossings interpolated to the minute
    const cross = (p, q) => p.t + (q.t - p.t) * (0 - p.alt) / (q.alt - p.alt);
    let rise = null, set = null, top = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[i + 1];
      if (p.alt > 0 && (!top || p.alt > top.alt)) top = p;
      if (q && p.alt <= 0 && q.alt > 0 && !rise) rise = { t: cross(p, q), az: q.az };
      if (q && p.alt > 0 && q.alt <= 0) set = { t: cross(p, q), az: p.az };
    }
    const res = { pts, rise, set, top, upAtStart: pts[0].alt > 0, upAtEnd: pts[pts.length - 1].alt > 0 };
    if (pathCache.size > 30) pathCache.delete(pathCache.keys().next().value);
    pathCache.set(key, res);
    return res;
  }
  function tonightText(o) {
    const P = tonightPath(o); if (!P) return '';
    if (!P.top) return t('tnNone');
    const bits = [];
    if (P.rise) bits.push(t('tnRise', hm(new Date(P.rise.t)), dir(P.rise.az)));
    else if (P.upAtStart) bits.push(t('tnUpDusk', dir(P.pts[0].az)));
    const top = P.top;
    const edge = top === P.pts[0] || top === P.pts[P.pts.length - 1];
    if (!edge) bits.push(t('tnTop', hm(new Date(top.t)), dir(top.az), Math.round(top.alt)));
    if (P.set) bits.push(t('tnSet', hm(new Date(P.set.t)), dir(P.set.az)));
    else if (P.upAtEnd) bits.push(t('tnUpDawn'));
    return t('tnHead') + bits.join(' → ');
  }
  const nowLine = (p, extra = '') => p && p.alt > 0 ? t('ocNow', dir(p.az), Math.round(p.alt)) + extra : t('ocBelow') + extra;
  const row = (k, v) => v == null || v === '' ? '' : `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  const rts = (rise, tr, set, d) => `${when(rise && rise.date, d)} · ${when(tr && tr.time.date, d)} · ${when(set && set.date, d)}`;

  function content(o, d) {
    const tt = A.MakeTime(d), p = posOf(o, d);
    const out = { kind: '', name: nameOf(o), sub: '', now: '', lead: '', facts: [], actions: [], foot: '' };
    if (o.kind === 'planet' || o.kind === 'moon' || o.kind === 'sun') {
      const ob = observer();
      const rise = A.SearchRiseSet(o.body, ob, +1, tt, 1.2), set = A.SearchRiseSet(o.body, ob, -1, tt, 1.2), tr = A.SearchHourAngle(o.body, ob, 0, tt);
      const km = A.GeoVector(o.body, tt, true).Length() * A.KM_PER_AU;
      const eq = A.Equator(o.body, tt, ob, false, true);
      const con = o.kind === 'sun' ? null : conOf(eq.ra, eq.dec);
      const ill = o.kind === 'sun' ? null : A.Illumination(o.body, tt);
      const dist = `${kmText(km)} <small>${t('byLight', lightTime(km))}</small>`;
      if (o.kind === 'planet') {
        out.kind = t('kPlanet');
        out.sub = JA ? o.en : '';
        out.now = nowLine(p, p.alt > 0 ? ` · ${magU(ill.mag)}` : rise ? t('risesAt', when(rise.date, d)) : '');
        out.lead = (PLANET_NOTE[o.en] || [])[JA ? 0 : 1] || '';
        const diam = 2 * Math.asin(RADIUS[o.en] / km) * 180 / Math.PI * 3600;
        out.facts = [
          row(t('brightness'), magU(ill.mag)),
          row(t('fromEarth'), dist),
          row(t('inCon'), esc(con)),
          row(t('apparent'), `${diam.toFixed(1)}″`),
          ['Mercury', 'Venus', 'Mars'].includes(o.en) ? row(t('litPart'), `${Math.round(ill.phase_fraction * 100)}%`) : '',
          o.en === 'Saturn' ? row(t('ringTilt'), `${Math.abs(ill.ring_tilt).toFixed(1)}°`) : '',
          row(t('riseTransitSet'), rts(rise, tr, set, d)),
        ];
        out.actions.push({ label: t('solBtn'), href: `https://ise-kk.github.io/sol-atlas/#${o.en.toLowerCase()}` });
      } else if (o.kind === 'moon') {
        const ph = A.MoonPhase(tt);
        out.kind = t('kMoon');
        out.now = nowLine(p, rise && !(p.alt > 0) ? t('risesAt', when(rise.date, d)) : '');
        const age = ph / 360 * 29.530589;
        out.sub = t('moonAge', (MOON_NAMES[JA ? 'ja' : 'en'])[Math.round(ph / 45) % 8], age.toFixed(1));
        const full = A.SearchMoonPhase(180, tt, 40), nw = A.SearchMoonPhase(0, tt, 40);
        out.lead = t('moonLead');
        out.facts = [
          row(t('litPart'), `${Math.round(ill.phase_fraction * 100)}%`),
          row(t('fromEarth'), `${num(Math.round(km))} km <small>${t('byLight', lightTime(km))}</small>`),
          row(t('inCon'), esc(con)),
          row(t('riseTransitSet'), rts(rise, tr, set, d)),
          row(t('nextFull'), full ? `${md(full.date)} ${hm(full.date)}` : ''),
          row(t('nextNew'), nw ? `${md(nw.date)} ${hm(nw.date)}` : ''),
        ];
        out.actions.push({ label: t('solBtn'), href: 'https://ise-kk.github.io/sol-atlas/#moon' });
      } else {
        out.kind = t('kStar');
        out.now = nowLine(p);
        out.lead = t('sunLead');
        out.facts = [row(t('fromEarth'), dist), row(t('riseTransitSet'), rts(rise, tr, set, d))];
        out.actions.push({ label: t('solBtn'), href: 'https://ise-kk.github.io/sol-atlas/#sun' });
      }
    } else if (o.kind === 'star') {
      const s = DATA.stars[o.i], inf = DATA.info[o.i] || [];
      const col = inf[2] && SPEC_COLOR[inf[2][0]] ? SPEC_COLOR[inf[2][0]][JA ? 0 : 1] : null;
      const con = DATA.cons[s[4]];
      out.kind = t('kStar') + (con ? ` · ${conName(con)}` : '');
      out.sub = [starAlt(o.i), inf[2] ? t('spectrum', inf[2]) : ''].filter(Boolean).map(esc).join(' · ');
      const r = !(p.alt > 0) ? nextRiseFixed(s[0], s[1], d.getTime()) : null;
      out.now = nowLine(p, p.alt > 0 ? '' : r ? t('risesAbout', when(r, d)) : '');
      out.lead = [inf[3] ? t('starLight', lightYearText(inf[3])) : '', col ? t('starColor', col) : '', inf[4] && inf[4] >= 2 ? t('timesSun', inf[4] >= 100 ? num(Number(inf[4].toPrecision(2))) : Math.round(inf[4])) : ''].join('').trim();
      out.facts = [
        row(t('brightness'), magU(s[2])),
        inf[3] ? row(t('distance'), t('lyAbout', fmtLy(inf[3]))) : '',
        con ? row(t('constellation'), esc(conName(con))) : '',
      ];
      if (con) out.actions.push({ label: t('seeCon', conName(con)), con: con.id });
      out.foot = t('starFoot');
    } else if (o.kind === 'messier') {
      const m = o.m, con = DATA.cons[m[6]];
      out.kind = `${mtype(m[2])} · ${m[0]}`;
      out.sub = con ? esc(conName(con)) : '';
      const r = !(p.alt > 0) ? nextRiseFixed(m[4], m[5], d.getTime()) : null;
      out.now = nowLine(p, p.alt > 0 ? '' : r ? t('risesAbout', when(r, d)) : '');
      out.lead = m[3] == null ? '' : m[3] < 5 ? t('eyeNaked') : m[3] < 8 ? t('eyeBino') : t('eyeScope');
      out.facts = [row(t('brightness'), m[3] != null ? magU(m[3]) : ''), con ? row(t('constellation'), esc(conName(con))) : ''];
      if (con) out.actions.push({ label: t('seeCon', conName(con)), con: con.id });
    } else if (o.kind === 'aster') { // a star group (v44): what it is, which stars, where now
      const a = o.a, cons = [...new Set(a.stars.map(i => conOf(DATA.stars[i][0] / 15, DATA.stars[i][1])))];
      out.kind = t('kAster');
      out.sub = cons.map(esc).join(JA ? '・' : ', ');
      const r = !(p.alt > 0) ? nextRiseFixed(a.ra, a.dec, d.getTime()) : null;
      out.now = nowLine(p, p.alt > 0 ? '' : r ? t('risesAbout', when(r, d)) : '');
      out.lead = esc(JA ? a.note.ja : a.note.en);
      out.facts = [row(t('asterStars'), a.stars.map(i => esc(starName(i))).join(JA ? '・' : ', '))];
    } else if (o.kind === 'shower') {
      const sh = o.sh;
      out.kind = t('kRadiant');
      out.sub = t('zhrSub', sh.zhr);
      out.now = nowLine(p);
      out.lead = t('radiantLead');
      out.facts = [row(t('speedKm'), t('speedV', sh.v))];
    } else if (o.kind === 'sat') {
      const sat = o.sat, feat = S.FEATURED[sat.id], info = describeSat(sat, feat), orb = orbitOf(sat);
      const lk = p && p.lk, up = lk && lk.alt >= 0;
      const sunAlt = S.bodyAltAz(A.Body.Sun, d, st.place).alt;
      let state;
      if (!up) state = t('satBelow');
      else if (!lk.sunlit) state = t('satShadow');
      else if (sunAlt > -6) state = t('satBright');
      else state = feat ? t('satSeen', magT(lk.mag)) : t('satSeenG', magWord(lk.mag));
      const now = d.getTime();
      const cur = st.passes.find(q => q.sat.id === sat.id && q.start.t <= now && q.end.t >= now);
      const nx = st.passes.find(q => q.sat.id === sat.id && q.start.t > now);
      const age = (now - sat.epoch.getTime()) / 864e5;
      out.kind = info.kind;
      out.name = info.ja || sat.name;
      out.sub = `${info.ja ? esc(sat.name) + ' · ' : ''}NORAD ${sat.id}${orb.cospar ? ' · ' + t('intl') + ' ' + orb.cospar : ''}`;
      out.now = up ? t('satNowUp', dir(lk.az), Math.round(lk.alt), state) : t('satNowNot', state);
      out.lead = info.note;
      out.more = visNote(info);
      const docked = feat ? st.sats.filter(x => st.docked && st.docked.get(x.id) === sat.id && !isModule(x)) : [];
      out.facts = [
        docked.length ? row(t('dockedNow'), docked.map(x => { const n = describeSat(x).ja; return esc(n ? (JA ? `${n}（${x.name.trim()}）` : `${n} (${x.name.trim()})`) : x.name.trim()); }).join('<br>') + `<small>${t('dockedHow')}</small>`) : '',
        lk ? row(t('heightKm'), `${num(Math.round(lk.height))} km`) : '',
        up ? row(t('rangeKm'), `${num(Math.round(lk.range))} km`) : '',
        row(t('speedKm'), t('satSpeed', orb.speed.toFixed(1), num(Math.round(orb.speed * 36) * 100))),
        row(t('orbitOnce'), t('orbitV', orb.period.toFixed(1), orb.revs.toFixed(1))),
        row(t('orbitH'), Math.abs(orb.apogee - orb.perigee) < 30 ? t('about', `${Math.round((orb.apogee + orb.perigee) / 2)} km`) : `${Math.round(orb.perigee)}–${Math.round(orb.apogee)} km`),
        row(t('incl'), `${orb.inc.toFixed(1)}°`),
        row(t('orbitKind'), esc(orbitKind(orb))),
        orb.launchYear ? row(t('launched'), t('yearV', orb.launchYear)) : '',
        cur ? row(t('passNow'), t('passNowV', hm(new Date(cur.end.t)), dir(cur.end.az))) : '',
        row(t('passNext'), nx ? (feat ? t('passNextV', `${md(new Date(nx.start.t))} ${hm(new Date(nx.start.t))}`, dir(nx.start.az), Math.round(nx.max.alt), magT(nx.mag)) : t('passNextVG', `${md(new Date(nx.start.t))} ${hm(new Date(nx.start.t))}`, dir(nx.start.az), Math.round(nx.max.alt), magWord(nx.mag))) : t('noPass')),
        row(t('orbitAge'), age < 1 ? t('hoursAgo', Math.max(1, Math.round(age * 24))) : t('daysAgo', age.toFixed(1))),
      ];
      if (o.pass) out.actions.push({ label: t('showThisPass', hm(new Date(o.pass.start.t))), pass: o.pass });
      else if (nx || cur) out.actions.push({ label: t('showPath'), pass: cur || nx });
      out.foot = t('satFoot');
    } else if (o.kind === 'train') {
      const g = TR && TR.byId(o.g), c = g && TR.cluster(g, d);
      const [yy, mm, dd] = (g ? g.date : '0-1-1').split('-').map(Number);
      const days = g ? Math.floor((d.getTime() - Date.UTC(yy, mm - 1, dd)) / 864e5) : 0;
      out.kind = t('trainKind');
      out.sub = g ? t('trainSub', t('trainDate', mm, dd), c ? c.members.length : g.sats.length) : '';
      const lk = p && p.lk;
      out.now = nowLine(p);
      out.lead = t('trainLead') + ' ' + t('trainCaution');
      const now = d.getTime();
      const cur = (st.trainPasses || []).find(q => q.g.id === o.g && q.start.t <= now && q.end.t >= now);
      const nx = (st.trainPasses || []).find(q => q.g.id === o.g && q.start.t > now);
      out.facts = [
        row(cur ? t('passNow') : t('passNext'), cur ? t('passNowV', hm(new Date(cur.end.t)), dir(cur.end.az)) : nx ? `${md(new Date(nx.start.t))} ${hm(new Date(nx.start.t))} · ${dir(nx.start.az)} → ${dir(nx.end.az)} · ${Math.round(nx.max.alt)}°` : t('trainNoTonight')),
        c ? row(t('trainLen'), t('trainLenV', Math.round(c.spanMin))) : '',
        c ? row(t('trainAlt'), t('about', `${Math.round(c.alt)} km`)) : '',
        g ? row(t('trainAge'), t('trainAgeV', days)) : '',
      ];
      if (o.pass) out.actions.push({ label: t('showThisPass', hm(new Date(o.pass.start.t))), pass: o.pass });
      else if (cur || nx) out.actions.push({ label: t('showPath'), pass: cur || nx });
      out.foot = t('trainFoot');
    }
    return out;
  }

  function render(root, o, d, handlers = {}) {
    const c = content(o, d);
    const q = (s) => root.querySelector(s);
    q('.oc-kind').textContent = c.kind;
    q('.oc-name').textContent = c.name;
    q('.oc-sub').innerHTML = c.sub; q('.oc-sub').hidden = !c.sub;
    const tn = tonightText(o);
    q('.oc-now').innerHTML = c.now + (tn ? `<span class="oc-tn">${tn}</span>` : '');
    q('.oc-lead').textContent = c.lead; q('.oc-lead').hidden = !c.lead;
    const mo = q('.oc-more'); if (mo) { mo.innerHTML = c.more ? `<b>${esc(t('visHow'))}</b>${esc(c.more)}` : ''; mo.hidden = !c.more; }
    if (TP) TP.render(q('.oc-topic'), o, d);
    q('.oc-facts').innerHTML = c.facts.join('');
    const acts = q('.oc-actions');
    const sig = JSON.stringify(c.actions.map(a => a.label + (a.href || '') + (a.con || '')));
    if (acts.dataset.sig !== sig) {
      acts.dataset.sig = sig;
      acts.innerHTML = c.actions.map((a, i) => a.href ? `<a class="oc-btn" href="${a.href}" target="_blank" rel="noopener">${esc(a.label)}</a>` : `<button type="button" class="oc-btn" data-i="${i}">${esc(a.label)}</button>`).join('');
      acts.querySelectorAll('button[data-i]').forEach(b => b.addEventListener('click', () => { const a = c.actions[+b.dataset.i]; if (a.con && handlers.con) handlers.con(a.con); if (a.pass && handlers.pass) handlers.pass(a.pass); }));
    }
    acts.hidden = !c.actions.length;
    q('.oc-foot').textContent = c.foot; q('.oc-foot').hidden = !c.foot;
  }
  return { render, posOf, nameOf, keyOf, tonightPath };
}
