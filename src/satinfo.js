// What a satellite is, and its orbit, from its name and two-line elements.
import { JA } from './i18n.js';
const MU = 398600.4418, RE = 6378.137;

// Orbit from the TLE (mean elements; heights are approximate, ±10 km)
export function orbitOf(sat) {
  const l1 = sat.l1, l2 = sat.l2;
  const inc = +l2.slice(8, 16);
  const ecc = +('0.' + l2.slice(26, 33).trim());
  const n = +l2.slice(52, 63); // revolutions per day
  const nr = n * 2 * Math.PI / 86400;
  const a = Math.cbrt(MU / (nr * nr));
  const yy = +l1.slice(9, 11);
  const launchYear = l1.slice(9, 11).trim() && !isNaN(yy) ? (yy < 57 ? 2000 + yy : 1900 + yy) : null;
  return {
    inc, ecc, revs: n, period: 1440 / n,
    perigee: a * (1 - ecc) - RE, apogee: a * (1 + ecc) - RE,
    speed: Math.sqrt(MU / a), launchYear, cospar: l1.slice(9, 17).trim(),
  };
}

const L = (ja, en) => (JA ? ja : en);
const STAGES = [
  [/^SL-16/, 'ゼニット・ロケットの上段（旧ソ連）', 'Zenit rocket upper stage (USSR)'], [/^SL-8/, 'コスモス3Mロケットの上段（旧ソ連・ロシア）', 'Kosmos-3M rocket upper stage (USSR/Russia)'], [/^SL-3/, 'ボストーク・ロケットの上段（旧ソ連）', 'Vostok rocket upper stage (USSR)'],
  [/^SL-14/, 'ツィクロン3ロケットの上段（旧ソ連）', 'Tsyklon-3 rocket upper stage (USSR)'], [/^SL-12/, 'プロトン・ロケットの上段（ロシア）', 'Proton rocket upper stage (Russia)'], [/^SL-/, '旧ソ連・ロシアのロケットの上段', 'Soviet/Russian rocket upper stage'],
  [/^CZ-/, '長征ロケットの上段（中国）', 'Long March rocket upper stage (China)'], [/^H-2A|^H-IIA/, 'H-IIAロケットの上段（日本）', 'H-IIA rocket upper stage (Japan)'], [/^ATLAS/, 'アトラス・ロケットの上段（アメリカ）', 'Atlas rocket upper stage (USA)'],
  [/^DELTA/, 'デルタ・ロケットの上段（アメリカ）', 'Delta rocket upper stage (USA)'], [/^ARIANE/, 'アリアン・ロケットの上段（欧州）', 'Ariane rocket upper stage (Europe)'], [/^TITAN/, 'タイタン・ロケットの上段（アメリカ）', 'Titan rocket upper stage (USA)'],
  [/^THOR/, 'ソー・ロケットの上段（アメリカ）', 'Thor rocket upper stage (USA)'], [/^FALCON/, 'ファルコン9ロケットの上段（アメリカ）', 'Falcon 9 upper stage (USA)'],
];
// [pattern, ja name, ja kind, ja note, en name, en kind, en note]
const NAMED = [
  [/HST|HUBBLE/, 'ハッブル宇宙望遠鏡', '宇宙望遠鏡', '1990年打ち上げ。高度約530kmから宇宙を観測し続けている、口径2.4mの望遠鏡。', 'Hubble Space Telescope', 'Space telescope', 'Launched in 1990, this 2.4 m telescope has been observing from about 530 km up ever since.'],
  [/TIANHE|WENTIAN|MENGTIAN/, '天宮の一部', '宇宙ステーション', '中国宇宙ステーション「天宮」を構成するモジュール。', 'Part of Tiangong', 'Space station', 'A module of China’s Tiangong space station.'],
  [/SOYUZ/, 'ソユーズ宇宙船', '有人宇宙船', 'ISSとの間で宇宙飛行士を運ぶロシアの宇宙船。', 'Soyuz spacecraft', 'Crewed spacecraft', 'The Russian spacecraft that carries astronauts to and from the ISS.'],
  [/PROGRESS/, 'プログレス補給船', '補給船', 'ISSへ水・食料・燃料を運ぶロシアの無人補給船。', 'Progress cargo ship', 'Cargo ship', 'Russia’s uncrewed ship that brings water, food and fuel to the ISS.'],
  [/DRAGON/, 'ドラゴン宇宙船', '宇宙船', 'SpaceXの宇宙船。ISSへ人や物資を運ぶ。', 'Dragon spacecraft', 'Spacecraft', 'SpaceX’s spacecraft, carrying crew and cargo to the ISS.'],
  [/CYGNUS/, 'シグナス補給船', '補給船', 'ISSへ物資を運ぶアメリカの無人補給船。', 'Cygnus cargo ship', 'Cargo ship', 'An uncrewed US cargo ship for the ISS.'],
  [/SHENZHOU/, '神舟宇宙船', '有人宇宙船', '天宮との間で宇宙飛行士を運ぶ中国の宇宙船。', 'Shenzhou spacecraft', 'Crewed spacecraft', 'China’s spacecraft that carries astronauts to and from Tiangong.'],
  [/TIANZHOU/, '天舟補給船', '補給船', '天宮へ物資と燃料を運ぶ中国の無人補給船。', 'Tianzhou cargo ship', 'Cargo ship', 'China’s uncrewed cargo and fuel ship for Tiangong.'],
  [/HTV/, 'HTV-X（日本の補給船）', '補給船', 'ISSへ物資を運ぶ日本の無人補給船。', 'HTV-X (Japanese cargo ship)', 'Cargo ship', 'Japan’s uncrewed cargo ship for the ISS.'],
  [/STARLINK/, 'スターリンク', '通信衛星', 'SpaceXの通信衛星群。打ち上げ直後は列になって見えることがある。', 'Starlink', 'Communications satellite', 'SpaceX’s internet satellites. Just after launch they can be seen in a line.'],
  [/IRIDIUM/, 'イリジウム', '通信衛星', '衛星電話のための通信衛星。', 'Iridium', 'Communications satellite', 'A satellite of the Iridium satellite-phone network.'],
  [/ENVISAT/, 'エンビサット', '地球観測衛星', '欧州の大型地球観測衛星。2012年に通信が途絶え、今は周回を続けるだけになっている。', 'Envisat', 'Earth observation satellite', 'A large European Earth observation satellite. Contact was lost in 2012; it still circles the Earth.'],
  [/AJISAI|EGS/, 'あじさい（測地実験衛星）', '測地衛星', '1986年に日本が打ち上げた、鏡で覆われた球形の衛星。回転しながら太陽光を反射して点滅する。', 'Ajisai (geodetic satellite)', 'Geodetic satellite', 'A mirror-covered sphere launched by Japan in 1986. It spins and flashes as it reflects sunlight.'],
  [/ALOS/, 'だいち', '地球観測衛星', '日本の陸域観測技術衛星。', 'Daichi (ALOS)', 'Earth observation satellite', 'Japan’s Advanced Land Observing Satellite.'],
  [/LANDSAT/, 'ランドサット', '地球観測衛星', 'アメリカの地球観測衛星シリーズ。', 'Landsat', 'Earth observation satellite', 'A long-running US Earth observation series.'],
  [/NOAA/, 'NOAA気象衛星', '気象衛星', 'アメリカの極軌道気象衛星。', 'NOAA weather satellite', 'Weather satellite', 'A US polar-orbiting weather satellite.'],
  [/METEOR/, 'メテオール', '気象衛星', 'ロシア（旧ソ連）の気象衛星。', 'Meteor', 'Weather satellite', 'A Russian (Soviet) weather satellite.'],
  [/RESURS/, 'レスルス', '地球観測衛星', 'ロシアの地球観測衛星。', 'Resurs', 'Earth observation satellite', 'A Russian Earth observation satellite.'],
  [/OKEAN/, 'オケアン', '海洋観測衛星', '旧ソ連・ロシアの海洋観測衛星。', 'Okean', 'Ocean observation satellite', 'A Soviet/Russian ocean observation satellite.'],
  [/TERRA\b/, 'テラ', '地球観測衛星', 'NASAの地球観測衛星。', 'Terra', 'Earth observation satellite', 'A NASA Earth observation satellite.'],
  [/AQUA\b/, 'アクア', '地球観測衛星', 'NASAの地球観測衛星。', 'Aqua', 'Earth observation satellite', 'A NASA Earth observation satellite.'],
  [/COSMOS|KOSMOS/, 'コスモス', '人工衛星', '旧ソ連・ロシアの衛星に付けられる共通の名前。軍事用を含むさまざまな衛星がある。', 'Kosmos', 'Satellite', 'A name shared by many Soviet and Russian satellites, including military ones.'],
];

// ja: the friendly name in the current language (kept as "ja" for the callers), or null
export function describeSat(sat, featured) {
  const name = sat.name.toUpperCase();
  if (featured) {
    const note = sat.id === 25544
      ? L('アメリカ・ロシア・日本・欧州・カナダが共同で運用する有人の実験施設。日本の実験棟「きぼう」もここにある。常に宇宙飛行士が滞在している。', 'A crewed laboratory run jointly by the US, Russia, Japan, Europe and Canada, including Japan’s Kibo module. Astronauts live aboard all the time.')
      : L('中国が運用する有人の宇宙ステーション。3人の宇宙飛行士が交代で長期滞在している。', 'China’s crewed space station, with crews of three staying for months at a time.');
    return { kind: L('宇宙ステーション', 'Space station'), ja: JA ? featured.ja : featured.en, note };
  }
  if (/R\/B/.test(name)) {
    const hit = STAGES.find(([re]) => re.test(name));
    return { kind: L('ロケットの上段', 'Rocket stage'), ja: hit ? L(hit[1], hit[2]) : L('ロケットの上段', 'Rocket upper stage'), note: L('衛星を軌道へ運んだあと、そのまま地球を回り続けているロケットの一部。大きな円筒形で、太陽の光をよく反射する。', 'The part of a rocket that carried a satellite to orbit and has kept circling ever since. A large cylinder that reflects sunlight well.') };
  }
  if (/DEB/.test(name)) return { kind: L('宇宙ごみ', 'Debris'), ja: L('破片（デブリ）', 'Debris'), note: L('役目を終えた衛星やロケットから生じた破片。', 'A fragment of an old satellite or rocket.') };
  const hit = NAMED.find(([re]) => re.test(name));
  if (hit) return JA ? { kind: hit[2], ja: hit[1], note: hit[3] } : { kind: hit[5], ja: hit[4], note: hit[6] };
  return { kind: L('人工衛星', 'Satellite'), ja: null, note: '' };
}
