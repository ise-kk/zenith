// 観望会モード (v48): one switch under その他. Turns the whole app red and keeps the screen on.
// Self-contained so it can be removed cleanly: delete this file, its import + initViewing() line in app.js,
// the #more-view row in index.html and the CSS block marked "v48 viewing".
// Red: three full-screen layers over everything (they must be siblings directly under <body>, not inside a
// wrapper, or the blending only sees the wrapper):
//   1) `saturation` blend with grey turns every pixel grey of the same brightness (black stays black);
//   2) `color-dodge` with grey lifts that grey about 1.7x (black stays black) so thin, faint text survives;
//   3) a dim red `multiply` turns it into red, capped for dark-adapted eyes.
//   Result: brightness order is kept, so grey and bluish text stay readable (a plain red multiply, as in
//   かざす, keeps only the red channel and turns them nearly black).
// Text size is NOT changed here (it has its own setting).
export function initViewing({ $, store, t }) {
  const KEY = 'viewing';
  const canWake = 'wakeLock' in navigator;
  for (const c of ['vw-a', 'vw-b', 'vw-c']) { const d = document.createElement('div'); d.className = 'vw-veil ' + c; d.setAttribute('aria-hidden', 'true'); document.body.appendChild(d); }
  let lock = null;
  const wake = async () => {
    if (!canWake || lock || document.visibilityState !== 'visible' || !on()) return;
    try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch (e) { lock = null; }
  };
  const sleep = () => { if (lock) { lock.release().catch(() => {}); lock = null; } };
  const on = () => document.documentElement.classList.contains('viewing');
  const row = $('more-view');
  function render() {
    $('more-view-v').textContent = t(on() ? 'heroOn' : 'heroOff');
    $('more-view-s').textContent = t(canWake ? 'viewSubWake' : 'viewSub');
    row.setAttribute('aria-pressed', String(on()));
  }
  function set(v) {
    document.documentElement.classList.toggle('viewing', v);
    store.set(KEY, v);
    if (v) wake(); else sleep();
    render();
  }
  row.addEventListener('click', () => set(!on()));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
  set(!!store.get(KEY, false));
  return { render };
}
