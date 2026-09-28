// Topics: one short, checked fact per card, with "next" when there are more.
// The texts live in topics.json (loaded the first time a card opens, so start-up stays light).
// Planets also get a computed, always-current line (next opposition / greatest elongation).
import { t, JA, TZ, LOCALE } from './i18n.js';
import { PROPER } from './propernames.js';

export function createTopics({ S, A }) {
  let data = null, loading = null;
  const pos = new Map();      // key -> index of the topic being shown
  const dynCache = new Map(); // planet -> { day, text }

  function load() {
    if (!loading) loading = fetch('topics.json').then(r => (r.ok ? r.json() : {})).catch(() => ({})).then(j => { data = j || {}; });
    return loading;
  }

  function keyOf(o) {
    switch (o.kind) {
      case 'planet': return 'planet:' + o.en;
      case 'moon': return 'moon';
      case 'sun': return 'sun';
      case 'star': return PROPER[o.i] ? 'star:' + PROPER[o.i] : null;
      case 'messier': return 'm:' + o.m[0];
      case 'shower': return 'shower:' + o.sh.code;
      case 'con': return 'con:' + o.id;
      case 'train': return 'train';
      case 'sat': {
        const id = o.sat.id, n = o.sat.name.toUpperCase();
        if (id === 25544 || id === 48274) return 'sat:' + id;
        if (/HST|HUBBLE/.test(n)) return 'sat:HUBBLE';
        if (/AJISAI|EGS/.test(n)) return 'sat:AJISAI';
        if (/^SL-16/.test(n)) return 'sat:SL-16';
        if (/R\/B/.test(n)) return 'sat:RB';
        return null;
      }
    }
    return null;
  }

  const fmtDate = (d) => new Intl.DateTimeFormat(JA ? 'ja-JP' : 'en-GB', { month: 'long', day: 'numeric', timeZone: TZ }).format(d);
  // computed, so it is always current: next opposition (outer planets) or greatest elongation (Mercury, Venus)
  function dynamic(o, now) {
    if (o.kind !== 'planet') return null;
    const day = Math.floor(now.getTime() / 864e5);
    const c = dynCache.get(o.en);
    if (c && c.day === day) return c.text;
    let text = null;
    try {
      const tt = A.MakeTime(now);
      if (o.en === 'Mercury' || o.en === 'Venus') {
        const e = A.SearchMaxElongation(A.Body[o.en], tt);
        const days = Math.ceil((e.time.date - now) / 864e5);
        text = { text: t('dynElong', JA ? o.ja : o.en, fmtDate(e.time.date), days, e.visibility === 'evening'), near: days <= 30 };
      } else {
        const r = A.SearchRelativeLongitude(A.Body[o.en], 0, tt);
        const days = Math.ceil((r.date - now) / 864e5);
        text = { text: t('dynOpp', JA ? o.ja : o.en, fmtDate(r.date), days), near: days <= 30 };
      }
    } catch (e) { text = null; }
    dynCache.set(o.en, { day, text });
    return text;
  }

  function list(o, now) {
    const out = [];
    const dyn = dynamic(o, now);
    const k = keyOf(o);
    if (data && k && Array.isArray(data[k])) {
      for (const x of data[k]) {
        if (x === 'zodiac') { if (data.zodiac) out.push(data.zodiac[JA ? 0 : 1]); }
        else if (Array.isArray(x)) out.push(x[JA ? 0 : 1]);
      }
    }
    // the computed line leads only when the date is near (within 30 days); otherwise it comes last.
    // The fixed topics start at a different one each day, so the same line does not always come first.
    if (out.length > 1) { const sh = Math.floor(now.getTime() / 864e5) % out.length; out.push(...out.splice(0, sh)); }
    if (dyn) { if (dyn.near) out.unshift(dyn.text); else out.push(dyn.text); }
    return { key: (k || o.kind) + (dyn ? '+d' : ''), items: out };
  }

  // fill `el` (a .oc-topic element); hides it when there is nothing to say
  function render(el, o, now) {
    if (!el) return;
    if (!data) { el.hidden = true; load().then(() => render(el, o, now)); return; }
    const { key, items } = list(o, now);
    if (!items.length) { el.hidden = true; el.dataset.sig = ''; return; }
    const i = (pos.get(key) || 0) % items.length;
    const sig = key + '#' + i + '#' + items.length + '#' + items[i];
    el.hidden = false;
    if (el.dataset.sig === sig) return;
    el.dataset.sig = sig;
    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    el.innerHTML = `<p>${esc(items[i])}</p>` + // no heading: just the text, set off by the gold line
      (items.length > 1 ? `<button type="button" class="ot-next">${t('topicNext')} <span class="num">${i + 1} / ${items.length}</span></button>` : '');
    const b = el.querySelector('.ot-next');
    if (b) b.addEventListener('click', () => { pos.set(key, i + 1); render(el, o, now); });
  }
  return { render, load };
}
