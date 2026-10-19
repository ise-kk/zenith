// Text size (v47): three steps, set under その他 → 文字の大きさ.
// Not everything grows by the same amount, so the layout holds:
//   sky  — names drawn on the star map and in かざす (canvas). Has room around it, grows the most.
//   body — reading text: cards, tonight's list, the calendar, the guide, その他 rows. Grows a little less.
//   (fixed) — header, bottom tabs, buttons, time bar, big titles. Never changes: they sit in tight rows.
// To make another piece of text follow the setting:
//   CSS  : write its size as  font-size:calc(13px*var(--tb,1))
//   canvas: write its size as  ${fs(13)}px
// To change how much a step grows, edit GROWTH only.
export const GROWTH = {
  sky: [1, 1.15, 1.3],
  body: [1, 1.1, 1.2],
};
export const STEP_KEYS = ['tsStd', 'tsLarge', 'tsXLarge']; // labels in i18n.js
let step = 0;
export const textStep = () => step;
export function setTextStep(i) {
  step = Math.max(0, Math.min(STEP_KEYS.length - 1, i | 0));
  document.documentElement.style.setProperty('--tb', String(GROWTH.body[step]));
}
// canvas font size in px for the sky group
export const fs = (px) => Math.round(px * GROWTH.sky[step] * 10) / 10;
