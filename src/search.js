// Search: stars, constellations, planets, the Moon/Sun, Messier objects, satellites, meteor showers.
// Matches Japanese (kanji readings, hiragana/katakana alike), English and rōmaji, as you type.
import { describeSat } from './satinfo.js';
import { PROPER } from './propernames.js';
import { t, JA, TZ, LOCALE } from './i18n.js';
import { mtype, conName, starName, messierName, showerName } from './names.js';

// kanji words that appear in names -> reading (so "どせい", "せいうん", "りゅうせいぐん" work)
const READ = [
  ['国際宇宙ステーション', 'こくさいうちゅうすてーしょん'], ['中国宇宙ステーション', 'ちゅうごくうちゅうすてーしょん'], ['宇宙望遠鏡', 'うちゅうぼうえんきょう'],
  ['流星群', 'りゅうせいぐん'], ['球状星団', 'きゅうじょうせいだん'], ['散開星団', 'さんかいせいだん'], ['星雲', 'せいうん'], ['星団', 'せいだん'], ['銀河', 'ぎんが'],
  ['水星', 'すいせい'], ['金星', 'きんせい'], ['火星', 'かせい'], ['木星', 'もくせい'], ['土星', 'どせい'], ['太陽', 'たいよう'], ['月', 'つき'],
  ['天宮', 'てんきゅう'], ['宇宙船', 'うちゅうせん'], ['補給船', 'ほきゅうせん'], ['上段', 'じょうだん'], ['望遠鏡', 'ぼうえんきょう'],
  ['干潟', 'ひがた'], ['野鴨', 'のがも'], ['三裂', 'さんれつ'], ['子持ち', 'こもち'], ['葉巻', 'はまき'], ['回転花火', 'かいてんはなび'], ['環状', 'かんじょう'],
  ['大', 'だい'], ['座', 'ざ'], ['星', 'せい'],
];
// traditional / popular Japanese names that point at catalogue objects (only well-established ones)
const ALIAS = [
  { keys: ['北極星', 'ほっきょくせい', 'polaris'], star: 'Polaris' },
  { keys: ['織姫星', 'おりひめぼし', 'おりひめ', '織女星'], star: 'Vega' },
  { keys: ['彦星', 'ひこぼし', '牽牛星'], star: 'Altair' },
  { keys: ['老人星', 'ろうじんせい', '南極老人星'], star: 'Canopus' },
  { keys: ['昴', 'すばる', 'pleiades', 'seven sisters'], messier: 'M45' },
];
const MESSIER_EN = { M1: 'Crab Nebula', M8: 'Lagoon Nebula', M13: 'Hercules Cluster', M16: 'Eagle Nebula', M17: 'Omega Nebula', M20: 'Trifid Nebula', M27: 'Dumbbell Nebula', M31: 'Andromeda Galaxy', M33: 'Triangulum Galaxy', M42: 'Orion Nebula', M44: 'Beehive Cluster Praesepe', M45: 'Pleiades', M51: 'Whirlpool Galaxy', M57: 'Ring Nebula', M81: "Bode's Galaxy", M82: 'Cigar Galaxy', M97: 'Owl Nebula', M101: 'Pinwheel Galaxy', M104: 'Sombrero Galaxy' };

const toHira = (s) => s.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
const norm = (s) => toHira(String(s || '').normalize('NFKC').toLowerCase()).replace(/[\s・·\-_（）()「」'’.ー]/g, '');
const reading = (s) => { let t = String(s || ''); for (const [k, v] of READ) t = t.split(k).join(v); return t; };
// hiragana -> rōmaji (Hepburn-ish, good enough for matching "dosei", "orion", "subaru")
const R1 = { あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o', か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko', さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so', た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to', な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no', は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho', ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo', や: 'ya', ゆ: 'yu', よ: 'yo', ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro', わ: 'wa', を: 'o', ん: 'n', が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go', ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo', だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do', ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo', ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po', ゔ: 'vu', ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o' };
const Y = { ゃ: 'ya', ゅ: 'yu', ょ: 'yo' };
function romaji(h) {
  let out = '';
  for (let i = 0; i < h.length; i++) {
    const c = h[i], n = h[i + 1];
    if (c === 'っ') { const r = R1[n] || ''; out += r[0] || ''; continue; }
    if (Y[n] && R1[c]) { const b = R1[c]; out += (b.length === 3 ? b.slice(0, 2) : b[0]) + (b.startsWith('sh') || b.startsWith('ch') || b[0] === 'j' ? Y[n].slice(1) : Y[n]); i++; continue; }
    out += R1[c] ?? c;
  }
  return out;
}
const CATS = [['now', 'catNow'], ['planet', 'catPlanet'], ['con', 'catCon'], ['star', 'catStar'], ['sat', 'catSat'], ['deep', 'catDeep'], ['shower', 'catShower']];
const catOf = (o) => ({ planet: 'planet', moon: 'planet', sun: 'planet', con: 'con', star: 'star', sat: 'sat', train: 'sat', messier: 'deep', shower: 'shower' })[o.kind];

export function createSearch(deps) {
  const { st, S, A, DATA, OI, dir, esc, TR } = deps;
  let index = null, satCount = -1, trainCount = -1;
  const stale = () => !index || satCount !== st.sats.length || (TR && trainCount !== TR.groups().length);

  function build() {
    const it = [];
    const add = (o, label, kind, raw, rank) => {
      const keys = new Set();
      for (const r of raw.filter(Boolean)) { const a = norm(r), b = norm(reading(r)); keys.add(a); keys.add(b); keys.add(romaji(b)); }
      it.push({ o, label, kind, keys: [...keys].filter(Boolean), rank });
    };
    for (const p of S.PLANETS) add({ kind: 'planet', body: p.body, ja: p.ja, en: p.en }, JA ? p.ja : p.en, t('kPlanet'), [p.ja, p.en], 100);
    add({ kind: 'moon', body: A.Body.Moon, ja: '月' }, t('moon'), t('kMoon'), ['月', 'moon', 'luna'], 110);
    add({ kind: 'sun', body: A.Body.Sun, ja: '太陽' }, t('sun'), t('kStar'), ['太陽', 'sun'], 60);
    const seen = new Set();
    for (const c of DATA.cons) {
      if (seen.has(c.id)) continue; seen.add(c.id);
      add({ kind: 'con', id: c.id }, conName(c), t('kCon'), [c.ja, c.ja.replace(/座$/, ''), c.la, c.id], 80);
    }
    const byProper = {};
    const keysSorted = Object.keys(DATA.info).map(Number).sort((a, b) => DATA.stars[a][2] - DATA.stars[b][2]);
    for (const i of keysSorted) {
      const inf = DATA.info[i], s = DATA.stars[i], en = PROPER[i];
      if (en && byProper[en] != null) continue;          // companions of a named star (e.g. Capella B) are not listed separately
      if (en) byProper[en] = i;
      if (!inf || (!inf[1] && !en && s[2] > 3)) continue;
      const bayer = inf[0] || '';
      add({ kind: 'star', i }, starName(i), t('kStar'), [inf[1], en, bayer, bayer.replace(/\s+/g, '')], 70 - s[2] * 5 + ((JA ? inf[1] : en) ? 20 : 0));
    }
    const byM = {};
    for (const m of DATA.messier) { byM[m[0]] = m; add({ kind: 'messier', m }, messierName(m), mtype(m[2]), [m[0], m[1], MESSIER_EN[m[0]]], 40 - (m[3] || 8)); }
    for (const a of ALIAS) {
      if (a.star && byProper[a.star] != null) { const i = byProper[a.star]; const ja = DATA.info[i][1] || a.star; add({ kind: 'star', i }, !JA ? starName(i) : ja.includes(a.keys[0]) ? ja : `${a.keys[0]}（${ja}）`, t('kStar'), a.keys, 75); }
      if (a.messier && byM[a.messier]) { const m = byM[a.messier]; add({ kind: 'messier', m }, messierName(m), mtype(m[2]), a.keys, 45); }
    }
    for (const sh of S.SHOWERS) add({ kind: 'shower', sh }, showerName(sh), t('kShower'), [sh.ja, sh.ja.replace('流星群', ''), sh.en], 50);
    for (const sat of st.sats) {
      const f = S.FEATURED[sat.id], info = describeSat(sat, f);
      const extra = sat.id === 25544 ? ['iss', '国際宇宙ステーション', 'きぼう', 'international space station'] : sat.id === 48274 ? ['天宮', 'てんきゅう', 'css', 'tiangong', '中国宇宙ステーション'] : [];
      add({ kind: 'sat', sat }, info.ja || sat.name, info.kind, [sat.name, info.ja, f && f.ja, f && f.en, String(sat.id), ...extra], f ? 120 : 20);
    }
    for (const c of (TR ? TR.active(new Date(st.t)) : [])) add({ kind: 'train', g: c.g.id }, t('train'), t('trainKind'), ['スターリンク', 'スターリンクトレイン', 'starlink', 'starlink train', 'トレイン'], 115);
    // one entry per object (aliases can duplicate a star/Messier entry): keep the best label per object
    index = it; satCount = st.sats.length; trainCount = TR ? TR.groups().length : 0;
  }

  const dist1 = (a, b) => { // edit distance <= 1 ?
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, e = 0;
    while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++e > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } }
    return e + (a.length - i) + (b.length - j) <= 1;
  };
  function query(q, cat) {
    if (stale()) build();
    const n = norm(q), nr = romaji(n);
    const d = new Date(st.t);
    const scored = new Map();
    for (const e of index) {
      if (cat && cat !== 'now' && catOf(e.o) !== cat) continue;
      let score = 0;
      if (n) for (const k of e.keys) {
        for (const x of (nr !== n ? [n, nr] : [n])) {
          if (k === x) score = Math.max(score, 300);
          else if (k.startsWith(x)) score = Math.max(score, 200 - (k.length - x.length) * 0.3);
          else if (x.length >= 2 && k.includes(x)) score = Math.max(score, 100 - (k.length - x.length) * 0.3);
        }
      } else score = 1;
      if (!score) continue;
      if (cat === 'now') { const p = OI.posOf(e.o, d); if (!p || p.alt <= 0) continue; }
      const key = OI.keyOf(e.o), s = score + e.rank * 0.3;
      if (!scored.has(key) || scored.get(key).s < s) scored.set(key, { e, s });
    }
    let out = [...scored.values()].sort((a, b) => b.s - a.s).map(x => x.e);
    // nothing? try one-letter typos on the start of names ("もしかして")
    if (!out.length && n.length >= 3) {
      const seenK = new Set();
      for (const e of index) { if (cat && cat !== 'now' && catOf(e.o) !== cat) continue; if (e.keys.some(k => dist1(k.slice(0, n.length), n) || dist1(k.slice(0, n.length + 1), n))) { const key = OI.keyOf(e.o); if (!seenK.has(key)) { seenK.add(key); out.push(e); } } }
      out = out.sort((a, b) => b.rank - a.rank); out.fuzzy = true;
    }
    return out.slice(0, n ? 12 : 30);
  }

  // what is up right now (before typing)
  function suggestions() {
    if (stale()) build();
    const d = new Date(st.t);
    const pick = index.filter(e => ['planet', 'moon', 'train'].includes(e.o.kind) || (e.o.kind === 'sat' && S.FEATURED[e.o.sat.id]) || (e.o.kind === 'star' && DATA.stars[e.o.i][2] < 1.3 && !e.label.includes('（')));
    return pick.map(e => ({ e, p: OI.posOf(e.o, d) })).filter(x => x.e.o.kind === 'train' || (x.p && x.p.alt > 5)).sort((a, b) => b.e.rank - a.e.rank).map(x => x.e).slice(0, 8);
  }

  const fmtWhen = (ms) => new Intl.DateTimeFormat(LOCALE, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(new Date(ms));
  function whereText(o) {
    const d = new Date(st.t);
    if (o.kind === 'sat') {
      const p = OI.posOf(o, d);
      if (p && p.alt > 0) return t('nowWhere', dir(p.az), Math.round(p.alt));
      let nx = st.passes.find(q => q.sat.id === o.sat.id && q.start.t > st.t);
      if (!nx && st.nextStation && st.nextStation.sat.id === o.sat.id) nx = st.nextStation;
      return nx ? t('nextVisible', fmtWhen(nx.start.t)) : t('belowHorizon');
    }
    if (o.kind === 'train') {
      const nx = (st.trainPasses || []).find(q => q.g.id === o.g && q.end.t > st.t);
      return nx ? t('nextVisible', fmtWhen(nx.start.t)) : t('trainNoTonight');
    }
    const p = OI.posOf(o, d);
    if (!p) return '';
    return p.alt > 0 ? t('nowWhere', dir(p.az), Math.round(p.alt)) : t('belowHorizon');
  }

  // recent picks
  const RKEY = 'zenith.recent';
  const loadRecent = () => { try { return JSON.parse(localStorage.getItem(RKEY)) || []; } catch (e) { return []; } };
  function remember(e) { const k = OI.keyOf(e.o); const r = loadRecent().filter(x => x !== k); r.unshift(k); try { localStorage.setItem(RKEY, JSON.stringify(r.slice(0, 5))); } catch (er) { } }
  function recent() { if (stale()) build(); const want = loadRecent(); const out = []; for (const k of want) { const e = index.find(x => OI.keyOf(x.o) === k); if (e) out.push(e); } return out; }

  // UI
  const $ = (id) => document.getElementById(id);
  const box = $('find'), input = $('find-q'), list = $('find-list'), chips = $('find-cats');
  let onPick = null, cat = null;
  chips.innerHTML = CATS.map(([k, key]) => `<button type="button" data-cat="${k}" aria-pressed="false">${t(key)}</button>`).join('');
  chips.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { cat = cat === b.dataset.cat ? null : b.dataset.cat; refresh(); }));
  function rowsHTML(items, off) {
    return items.map((e, i) => `<li><button type="button" data-i="${i + off}"><span class="fk">${esc(e.kind)}</span><span class="fn"><b>${esc(e.label)}</b><span class="fw">${whereText(e.o)}</span></span></button></li>`).join('');
  }
  function refresh() {
    chips.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === cat)));
    const q = input.value.trim();
    let groups;
    if (q || cat) { const r = query(q, cat); groups = [[r.fuzzy ? t('didYouMean') : '', r]]; }
    else groups = [[t('upNow'), suggestions()], [t('recent'), recent()]];
    const all = []; let html = '';
    for (const [title, items] of groups) {
      if (!items.length) continue;
      if (title) html += `<li class="find-h">${title}</li>`;
      html += rowsHTML(items, all.length); all.push(...items);
    }
    if (!all.length) html = `<li class="find-empty">${q ? t('notFound') : t('noneOfKind')}</li>`;
    list.innerHTML = html;
    list.querySelectorAll('button[data-i]').forEach(b => b.addEventListener('click', () => { const e = all[+b.dataset.i]; remember(e); close(); onPick && onPick(e.o); }));
  }
  input.addEventListener('input', refresh);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = list.querySelector('button[data-i]'); if (b) b.click(); } if (e.key === 'Escape') close(); });
  $('find-close').addEventListener('click', close);
  box.addEventListener('click', e => { if (e.target === box) close(); });
  function open(pick) { onPick = pick; box.hidden = false; input.value = ''; cat = null; refresh(); setTimeout(() => input.focus(), 30); }
  function close() { box.hidden = true; input.blur(); }
  return { open, close, query, _romaji: romaji };
}
