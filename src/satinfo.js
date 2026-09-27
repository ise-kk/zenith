// What a satellite is, and its orbit, from its name and two-line elements.
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

const STAGES = [
  [/^SL-16/, 'ゼニット・ロケットの上段（旧ソ連）'], [/^SL-8/, 'コスモス3Mロケットの上段（旧ソ連・ロシア）'], [/^SL-3/, 'ボストーク・ロケットの上段（旧ソ連）'],
  [/^SL-14/, 'ツィクロン3ロケットの上段（旧ソ連）'], [/^SL-12/, 'プロトン・ロケットの上段（ロシア）'], [/^SL-/, '旧ソ連・ロシアのロケットの上段'],
  [/^CZ-/, '長征ロケットの上段（中国）'], [/^H-2A|^H-IIA/, 'H-IIAロケットの上段（日本）'], [/^ATLAS/, 'アトラス・ロケットの上段（アメリカ）'],
  [/^DELTA/, 'デルタ・ロケットの上段（アメリカ）'], [/^ARIANE/, 'アリアン・ロケットの上段（欧州）'], [/^TITAN/, 'タイタン・ロケットの上段（アメリカ）'],
  [/^THOR/, 'ソー・ロケットの上段（アメリカ）'], [/^FALCON/, 'ファルコン9ロケットの上段（アメリカ）'],
];
const NAMED = [
  [/HST|HUBBLE/, 'ハッブル宇宙望遠鏡', '宇宙望遠鏡', '1990年打ち上げ。高度約530kmから宇宙を観測し続けている、口径2.4mの望遠鏡。'],
  [/TIANHE|WENTIAN|MENGTIAN/, '天宮の一部', '宇宙ステーション', '中国宇宙ステーション「天宮」を構成するモジュール。'],
  [/SOYUZ/, 'ソユーズ宇宙船', '有人宇宙船', 'ISSとの間で宇宙飛行士を運ぶロシアの宇宙船。'],
  [/PROGRESS/, 'プログレス補給船', '補給船', 'ISSへ水・食料・燃料を運ぶロシアの無人補給船。'],
  [/DRAGON/, 'ドラゴン宇宙船', '宇宙船', 'SpaceXの宇宙船。ISSへ人や物資を運ぶ。'],
  [/CYGNUS/, 'シグナス補給船', '補給船', 'ISSへ物資を運ぶアメリカの無人補給船。'],
  [/SHENZHOU/, '神舟宇宙船', '有人宇宙船', '天宮との間で宇宙飛行士を運ぶ中国の宇宙船。'],
  [/TIANZHOU/, '天舟補給船', '補給船', '天宮へ物資と燃料を運ぶ中国の無人補給船。'],
  [/HTV/, 'HTV-X（日本の補給船）', '補給船', 'ISSへ物資を運ぶ日本の無人補給船。'],
  [/STARLINK/, 'スターリンク', '通信衛星', 'SpaceXの通信衛星群。打ち上げ直後は列になって見えることがある。'],
  [/IRIDIUM/, 'イリジウム', '通信衛星', '衛星電話のための通信衛星。'],
  [/ENVISAT/, 'エンビサット', '地球観測衛星', '欧州の大型地球観測衛星。2012年に通信が途絶え、今は周回を続けるだけになっている。'],
  [/AJISAI|EGS/, 'あじさい（測地実験衛星）', '測地衛星', '1986年に日本が打ち上げた、鏡で覆われた球形の衛星。回転しながら太陽光を反射して点滅する。'],
  [/ALOS/, 'だいち', '地球観測衛星', '日本の陸域観測技術衛星。'],
  [/LANDSAT/, 'ランドサット', '地球観測衛星', 'アメリカの地球観測衛星シリーズ。'],
  [/NOAA/, 'NOAA気象衛星', '気象衛星', 'アメリカの極軌道気象衛星。'],
  [/METEOR/, 'メテオール', '気象衛星', 'ロシア（旧ソ連）の気象衛星。'],
  [/RESURS/, 'レスルス', '地球観測衛星', 'ロシアの地球観測衛星。'],
  [/OKEAN/, 'オケアン', '海洋観測衛星', '旧ソ連・ロシアの海洋観測衛星。'],
  [/TERRA\b/, 'テラ', '地球観測衛星', 'NASAの地球観測衛星。'],
  [/AQUA\b/, 'アクア', '地球観測衛星', 'NASAの地球観測衛星。'],
  [/COSMOS|KOSMOS/, 'コスモス', '人工衛星', '旧ソ連・ロシアの衛星に付けられる共通の名前。軍事用を含むさまざまな衛星がある。'],
];

export function describeSat(sat, featured) {
  const name = sat.name.toUpperCase();
  if (featured) {
    const note = sat.id === 25544
      ? 'アメリカ・ロシア・日本・欧州・カナダが共同で運用する有人の実験施設。日本の実験棟「きぼう」もここにある。常に宇宙飛行士が滞在している。'
      : '中国が運用する有人の宇宙ステーション。3人の宇宙飛行士が交代で長期滞在している。';
    return { kind: '宇宙ステーション', ja: featured.ja, note };
  }
  if (/R\/B/.test(name)) {
    const hit = STAGES.find(([re]) => re.test(name));
    return { kind: 'ロケットの上段', ja: hit ? hit[1] : 'ロケットの上段', note: '衛星を軌道へ運んだあと、そのまま地球を回り続けているロケットの一部。大きな円筒形で、太陽の光をよく反射する。' };
  }
  if (/DEB/.test(name)) return { kind: '宇宙ごみ', ja: '破片（デブリ）', note: '役目を終えた衛星やロケットから生じた破片。' };
  const hit = NAMED.find(([re]) => re.test(name));
  if (hit) return { kind: hit[2], ja: hit[1], note: hit[3] };
  return { kind: '人工衛星', ja: null, note: '' };
}
