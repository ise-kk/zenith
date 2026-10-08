// First-run guide (v43): a few steps that light up the buttons one group at a time and say what each does.
// Shown once per guide (home / かざす / camera), replayable from その他. Each step points at elements by id,
// so moving a button moves its bubble with it; a step whose elements are not on screen is skipped.
// Kept out of the way: nothing is computed until a guide runs, and the overlay is removed when it ends.

export function createTour(deps) {
  const { t, store } = deps;
  let el = null, steps = [], i = 0, name = '', done = null, raf = 0;
  const vis = (n) => { if (!n) return null; const r = n.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(n).visibility !== 'hidden' ? r : null; };
  // a target is an element id, a list of ids (first one on screen wins: phone tabs vs. wide segment), or a function giving a rect
  function rectOf(x) {
    if (typeof x === 'function') return x();
    for (const id of [].concat(x)) { const r = vis(document.getElementById(id) || document.querySelector(id)); if (r) return r; }
    return null;
  }
  function seen(n) { return !!store.get('tour.' + n, false); }
  function build() {
    el = document.createElement('div'); el.id = 'tour'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = '<svg class="tr-dim" aria-hidden="true"><defs><mask id="tr-m"><rect width="100%" height="100%" fill="#fff"/><g id="tr-holes"></g></mask></defs><rect width="100%" height="100%" fill="rgba(2,4,9,.74)" mask="url(#tr-m)"/><g id="tr-rings"></g></svg><div id="tr-labels"></div>'
      + '<div class="tr-box"><p class="tr-n num"></p><h3 class="tr-h"></h3><p class="tr-p"></p><ul class="tr-items"></ul><div class="tr-row"><button type="button" class="tr-skip"></button><button type="button" class="tr-next btn primary"></button></div></div>';
    document.body.appendChild(el);
    el.querySelector('.tr-next').addEventListener('click', () => go(i + 1));
    el.querySelector('.tr-skip').addEventListener('click', end);
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('.tr-dim')) go(i + 1); }); // a tap on the dim area also moves on
    addEventListener('resize', place);
  }
  function stepOk(s) { return (s.need ? s.need() : true) && [].concat(s.at).some(x => rectOf(x)); }
  function go(k) {
    while (k < steps.length && !stepOk(steps[k])) k++;
    if (k >= steps.length) { end(); return; }
    i = k; draw();
  }
  function draw() {
    const s = steps[i], live = steps.filter(stepOk), n = live.indexOf(s) + 1;
    el.querySelector('.tr-n').textContent = live.length > 1 ? n + ' / ' + live.length : '';
    el.querySelector('.tr-h').textContent = t(s.h);
    const P = el.querySelector('.tr-p'); P.textContent = s.p ? t(s.p) : ''; P.hidden = !s.p;
    // one line per button: its own icon and name (taken from the button itself, so they never drift apart) + what it does
    const ul = el.querySelector('.tr-items'); ul.textContent = ''; ul.hidden = !s.items;
    for (const [id, d, nameKey] of s.items || []) {
      const b = document.getElementById(id) || document.querySelector(id); if (!vis(b)) continue;
      const li = document.createElement('li'), ic = document.createElement('span'), tx = document.createElement('span'), nm = document.createElement('b');
      ic.className = 'tr-ic'; const g = b.querySelector('svg'); if (g) { const c = g.cloneNode(true); c.setAttribute('width', 18); c.setAttribute('height', 18); ic.appendChild(c); }
      nm.textContent = nameKey ? t(nameKey) : ((b.querySelector('[data-t]') || b).textContent.trim() || b.getAttribute('aria-label') || '');
      tx.appendChild(nm); tx.appendChild(document.createTextNode(t(d)));
      li.appendChild(ic); li.appendChild(tx); ul.appendChild(li);
    }
    el.querySelector('.tr-skip').textContent = t('tourSkip');
    el.querySelector('.tr-skip').hidden = n === live.length;
    el.querySelector('.tr-next').textContent = n === live.length ? t('tourDone') : t('tourNext');
    place();
    el.querySelector('.tr-next').focus({ preventScroll: true });
  }
  // light up the targets, put a short label by each, and the text box where it covers nothing lit
  function place() {
    if (!el || !steps[i]) return;
    const s = steps[i], W = innerWidth, H = innerHeight, NS = 'http://www.w3.org/2000/svg';
    const holes = el.querySelector('#tr-holes'), rings = el.querySelector('#tr-rings'), labs = el.querySelector('#tr-labels');
    holes.textContent = ''; rings.textContent = ''; labs.textContent = '';
    let top = H, bot = 0;
    const targets = [].concat(s.at), labels = s.labels || [];
    targets.forEach((x, k) => {
      const r = rectOf(x); if (!r) return;
      const pad = s.round ? 0 : 5, round = s.round || (r.height < 70 ? Math.min(r.height / 2 + pad, 22) : 14);
      const a = { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
      for (const g of [holes, rings]) {
        const q = document.createElementNS(NS, 'rect');
        q.setAttribute('x', a.x); q.setAttribute('y', a.y); q.setAttribute('width', a.w); q.setAttribute('height', a.h); q.setAttribute('rx', round);
        q.setAttribute('fill', g === holes ? '#000' : 'none'); if (g === rings) q.setAttribute('class', 'tr-ring');
        g.appendChild(q);
      }
      top = Math.min(top, a.y); bot = Math.max(bot, a.y + a.h);
      const L = labels[k]; if (!L) return;
      const d = document.createElement('div'); d.className = 'tr-lab'; d.textContent = t(L);
      const maxW = Math.max(84, Math.min(170, s.labelW || a.w + 20));
      d.style.maxWidth = maxW + 'px'; labs.appendChild(d);
      const lw = d.offsetWidth, lh = d.offsetHeight, above = s.labelBelow ? false : a.y - lh - 8 > 4;
      d.style.left = Math.max(6, Math.min(W - lw - 6, a.x + a.w / 2 - lw / 2)) + 'px';
      d.style.top = (above ? a.y - lh - 7 : a.y + a.h + 7) + 'px';
      const lr = { y: above ? a.y - lh - 7 : a.y + a.h + 7, h: lh };
      top = Math.min(top, lr.y); bot = Math.max(bot, lr.y + lr.h);
    });
    const box = el.querySelector('.tr-box'); box.style.top = box.style.bottom = '';
    const bh = box.offsetHeight;
    // the side with more free room, never over a lit spot or a label
    if (top - 12 >= bh + 12 && (top > H - bot || H - bot - 12 < bh + 12)) box.style.top = Math.max(10, top - bh - 14) + 'px';
    else if (H - bot - 12 >= bh + 12) box.style.top = (bot + 14) + 'px';
    else box.style.top = Math.max(10, (H - bh) / 2) + 'px'; // the target fills the screen (the sky): sit in the middle
  }
  function end() {
    if (!el) return;
    store.set('tour.' + name, true);
    removeEventListener('resize', place);
    el.remove(); el = null; steps = []; cancelAnimationFrame(raf);
    const f = done; done = null; f && f();
  }
  // run a guide unless it has been seen (force: replay from その他)
  function run(n, list, opts = {}) {
    if (el || (!opts.force && seen(n))) return false;
    name = n; steps = list; done = opts.onDone || null;
    build(); i = -1; go(0);
    return !!el;
  }
  return { run, end, seen, active: () => !!el, reset: () => { for (const n of ['home', 'ar', 'cam']) store.set('tour.' + n, false); } };
}
