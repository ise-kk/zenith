// Names of things in the current language.
import { JA } from './i18n.js';
import { PROPER } from './propernames.js';

const DATA = window.ZENITH_DATA;
const hasKana = (s) => /[぀-ヿ一-鿿]/.test(s || '');

export const MESSIER_EN = { M1: 'Crab Nebula', M6: 'Butterfly Cluster', M7: 'Ptolemy Cluster', M8: 'Lagoon Nebula', M11: 'Wild Duck Cluster', M13: 'Great Hercules Cluster', M16: 'Eagle Nebula', M17: 'Omega Nebula', M20: 'Trifid Nebula', M27: 'Dumbbell Nebula', M31: 'Andromeda Galaxy', M33: 'Triangulum Galaxy', M42: 'Orion Nebula', M44: 'Beehive Cluster', M45: 'Pleiades', M51: 'Whirlpool Galaxy', M57: 'Ring Nebula', M81: "Bode's Galaxy", M82: 'Cigar Galaxy', M97: 'Owl Nebula', M101: 'Pinwheel Galaxy', M104: 'Sombrero Galaxy' };
const MTYPE = {
  s: ['渦巻銀河', 'Spiral galaxy'], e: ['楕円銀河', 'Elliptical galaxy'], i: ['不規則銀河', 'Irregular galaxy'], sfr: ['散光星雲', 'Diffuse nebula'], pos: ['星の集まり', 'Star grouping'], rn: ['反射星雲', 'Reflection nebula'],
  球状星団: ['球状星団', 'Globular cluster'], 散開星団: ['散開星団', 'Open cluster'], 惑星状星雲: ['惑星状星雲', 'Planetary nebula'], 星の集まり: ['星の集まり', 'Star grouping'], 超新星残骸: ['超新星残骸', 'Supernova remnant'], 反射星雲: ['反射星雲', 'Reflection nebula'], 不規則銀河: ['不規則銀河', 'Irregular galaxy'],
};
export const mtype = (t) => (MTYPE[t] ? MTYPE[t][JA ? 0 : 1] : t);

export const conName = (c) => (c ? (JA ? c.ja : c.la) : '');
export const conById = (id) => DATA.cons.find(c => c.id === id);

// full name for cards and lists
export function starName(i) {
  const inf = DATA.info[i] || [];
  if (JA) return inf[1] || inf[0] || '恒星';
  return PROPER[i] || inf[0] || (hasKana(inf[1]) ? '' : inf[1]) || 'Star';
}
// short label drawn on the map
export function starLabel(i) {
  const inf = DATA.info[i] || [];
  if (JA) return inf[1] && hasKana(inf[1]) ? inf[1] : (inf[0] || inf[1]);
  return PROPER[i] || inf[0] || '';
}
// the "other" name shown small under the main one
export function starAlt(i) {
  const inf = DATA.info[i] || [];
  if (JA) return inf[1] && inf[0] ? inf[0] : '';
  return PROPER[i] && inf[0] ? inf[0] : '';
}
export function messierName(m) {
  if (JA) return m[1] ? `${m[1]}（${m[0]}）` : m[0];
  return MESSIER_EN[m[0]] ? `${MESSIER_EN[m[0]]} (${m[0]})` : m[0];
}
export const messierShort = (m) => (JA ? (m[1] ? m[0] + ' ' + m[1] : m[0]) : (MESSIER_EN[m[0]] ? m[0] + ' ' + MESSIER_EN[m[0]] : m[0]));
export const planetName = (p) => (JA ? p.ja : p.en);
export const showerName = (sh) => (JA ? sh.ja : sh.en);
export const showerShort = (sh) => (JA ? sh.ja.replace('流星群', '') : sh.en);
