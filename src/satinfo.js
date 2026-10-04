// What a satellite is, and its orbit, from its name and two-line elements.
import { JA } from './i18n.js';
const MU = 398600.4418, RE = 6378.137;
// 'bright only' satellite filter: space stations, Starlink trains and passes estimated brighter than this
export const BRIGHT_MAG = 2;

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
// [pattern, ja name, en name, ja note, en note] — specific notes only where the fact is well documented
const STAGES = [
  [/^SL-16/, 'ゼニット・ロケットの上段（旧ソ連）', 'Zenit rocket upper stage (USSR)', '旧ソ連・ロシアのゼニット・ロケットの2段目。', 'The second stage of the Soviet/Russian Zenit rocket.'],
  [/^SL-14/, 'ツィクロン3ロケットの上段（旧ソ連）', 'Tsyklon-3 rocket upper stage (USSR)', '旧ソ連・ウクライナのツィクロン3ロケットの3段目。気象衛星や海洋観測衛星の打ち上げに使われた。', 'The third stage of the Soviet/Ukrainian Tsyklon-3 rocket, used to launch weather and ocean satellites.'],
  [/^SL-8/, 'コスモス3Mロケットの上段（旧ソ連・ロシア）', 'Kosmos-3M rocket upper stage (USSR/Russia)', '旧ソ連・ロシアのコスモス3Mロケットの2段目。', 'The second stage of the Soviet/Russian Kosmos-3M rocket.'],
  [/^SL-3/, 'ボストーク・ロケットの上段（旧ソ連）', 'Vostok rocket upper stage (USSR)', '旧ソ連のボストーク・ロケットの上段。', 'An upper stage of the Soviet Vostok rocket.'],
  [/^SL-4/, 'ソユーズ・ロケットの上段（旧ソ連・ロシア）', 'Soyuz rocket upper stage (USSR/Russia)', '旧ソ連・ロシアのソユーズ・ロケットの上段。', 'An upper stage of the Soviet/Russian Soyuz rocket.'],
  [/^SL-6/, 'モルニヤ・ロケットの上段（旧ソ連）', 'Molniya rocket upper stage (USSR)', '旧ソ連のモルニヤ・ロケットの上段。', 'An upper stage of the Soviet Molniya rocket.'],
  [/^SL-12/, 'プロトン・ロケットの上段（ロシア）', 'Proton rocket upper stage (Russia)', 'ロシアのプロトン・ロケットの上段。', 'An upper stage of the Russian Proton rocket.'],
  [/^SL-/, '旧ソ連・ロシアのロケットの上段', 'Soviet/Russian rocket upper stage', '', ''],
  [/^CZ-(\w+)/, (m) => `長征${m[1].replace(/^(\d+)/, '$1号')}ロケットの上段（中国）`, (m) => `Long March ${m[1]} rocket upper stage (China)`, '中国の長征ロケットの上段。', 'An upper stage of China’s Long March rocket.'],
  [/^H-2A|^H-IIA/, 'H-IIAロケットの上段（日本）', 'H-IIA rocket upper stage (Japan)', '日本の H-IIA ロケットの2段目。', 'The second stage of Japan’s H-IIA rocket.'],
  [/^ARIANE 4|^ARIANE 40/, 'アリアン4ロケットの上段（欧州）', 'Ariane 4 rocket upper stage (Europe)', '欧州のアリアン4ロケットの上段。', 'An upper stage of Europe’s Ariane 4 rocket.'],
  [/^ARIANE 5/, 'アリアン5ロケットの上段（欧州）', 'Ariane 5 rocket upper stage (Europe)', '欧州のアリアン5ロケットの上段。', 'An upper stage of Europe’s Ariane 5 rocket.'],
  [/^ARIANE/, 'アリアン・ロケットの上段（欧州）', 'Ariane rocket upper stage (Europe)', '', ''],
  [/^ATLAS CENTAUR/, 'アトラス・セントール・ロケットの上段（アメリカ）', 'Atlas-Centaur rocket upper stage (USA)', 'アメリカのアトラス・ロケットの上段「セントール」。', 'The Centaur upper stage of the US Atlas rocket.'],
  [/^ATLAS/, 'アトラス・ロケットの上段（アメリカ）', 'Atlas rocket upper stage (USA)', '', ''],
  [/^DELTA/, 'デルタ・ロケットの上段（アメリカ）', 'Delta rocket upper stage (USA)', 'アメリカのデルタ・ロケットの上段。', 'An upper stage of the US Delta rocket.'],
  [/^TITAN/, 'タイタン・ロケットの上段（アメリカ）', 'Titan rocket upper stage (USA)', 'アメリカのタイタン・ロケットの上段。', 'An upper stage of the US Titan rocket.'],
  [/^THOR AGENA/, 'ソー・アジェナ・ロケットの上段（アメリカ）', 'Thor-Agena rocket upper stage (USA)', 'アメリカのソー・ロケットの上段「アジェナ」。1960年代に多く使われた。', 'The Agena upper stage of the US Thor rocket, much used in the 1960s.'],
  [/^THOR/, 'ソー・ロケットの上段（アメリカ）', 'Thor rocket upper stage (USA)', '', ''],
  [/^FALCON/, 'ファルコン9ロケットの上段（アメリカ）', 'Falcon 9 upper stage (USA)', 'SpaceX のファルコン9ロケットの2段目。', 'The second stage of SpaceX’s Falcon 9.'],
  [/^GSLV/, 'GSLVロケットの上段（インド）', 'GSLV rocket upper stage (India)', 'インドの GSLV ロケットの上段。', 'An upper stage of India’s GSLV rocket.'],
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
  [/ALOS(?!-)/, 'だいち', '地球観測衛星', '日本の陸域観測技術衛星。', 'Daichi (ALOS)', 'Earth observation satellite', 'Japan’s Advanced Land Observing Satellite.'],
  [/LANDSAT/, 'ランドサット', '地球観測衛星', 'アメリカの地球観測衛星シリーズ。', 'Landsat', 'Earth observation satellite', 'A long-running US Earth observation series.'],
  [/NOAA/, 'NOAA気象衛星', '気象衛星', 'アメリカの極軌道気象衛星。', 'NOAA weather satellite', 'Weather satellite', 'A US polar-orbiting weather satellite.'],
  [/METEOR/, 'メテオール', '気象衛星', 'ロシア（旧ソ連）の気象衛星。', 'Meteor', 'Weather satellite', 'A Russian (Soviet) weather satellite.'],
  [/RESURS/, 'レスルス', '地球観測衛星', 'ロシアの地球観測衛星。', 'Resurs', 'Earth observation satellite', 'A Russian Earth observation satellite.'],
  [/OKEAN/, 'オケアン', '海洋観測衛星', '旧ソ連・ロシアの海洋観測衛星。', 'Okean', 'Ocean observation satellite', 'A Soviet/Russian ocean observation satellite.'],
  [/TERRA\b/, 'テラ', '地球観測衛星', 'NASA の地球観測衛星。1999年打ち上げ。陸・海・大気・雲などを観測する。', 'Terra', 'Earth observation satellite', 'A NASA Earth observation satellite launched in 1999, watching land, ocean, air and clouds.'],
  [/AQUA\b/, 'アクア', '地球観測衛星', 'NASA の地球観測衛星。2002年打ち上げ。陸・海・大気・雲などを観測する。', 'Aqua', 'Earth observation satellite', 'A NASA Earth observation satellite launched in 2002, watching land, ocean, air and clouds.'],
  [/SPACEMOBILE|BLUEBIRD/, 'BlueBird（AST SpaceMobile）', '通信衛星', 'AST SpaceMobile 社の通信衛星。スマートフォンと直接つながるための大きなアンテナを広げている（1〜5号は約64㎡、6号以降は約220㎡）。明るく見えることがあり、天文観測への影響も議論されている。', 'BlueBird (AST SpaceMobile)', 'Communications satellite', 'An AST SpaceMobile satellite that talks directly to smartphones through a huge antenna (about 64 m² on BlueBird 1–5, about 220 m² from BlueBird 6). It can look bright, and its effect on astronomy is debated.'],
  [/^ACS3/, 'ACS3（NASAのソーラーセイル）', '技術試験衛星', 'NASA のソーラーセイル（太陽の光の圧力で進む帆）の試験機。2024年打ち上げ。一辺約9mの四角い帆を広げている。', 'ACS3 (NASA solar sail)', 'Technology demonstrator', 'NASA’s test of a solar sail — a sail pushed by the pressure of sunlight. Launched in 2024, with a square sail about 9 m on a side.'],
  [/XRISM/, 'XRISM（クリズム）', 'X線天文衛星', 'JAXA と NASA の X線分光撮像衛星「クリズム」。2023年打ち上げ。', 'XRISM', 'X-ray astronomy satellite', 'The X-ray Imaging and Spectroscopy Mission of JAXA and NASA, launched in 2023.'],
  [/ASTRO-H|HITOMI/, 'ひとみ（ASTRO-H）', 'X線天文衛星', 'JAXA の X線天文衛星「ひとみ」。2016年2月に打ち上げたが、翌3月に姿勢の異常で壊れ、運用を終えた。', 'Hitomi (ASTRO-H)', 'X-ray astronomy satellite', 'JAXA’s X-ray observatory Hitomi. Launched in February 2016, it broke apart after an attitude-control fault the next month.'],
  [/ALOS-2/, 'だいち2号', '地球観測衛星', 'JAXA の「だいち2号」。2014年打ち上げ。電波（レーダー）で、雲や夜でも地表を観測する。', 'Daichi-2 (ALOS-2)', 'Earth observation satellite', 'JAXA’s ALOS-2, launched in 2014. Its radar sees the ground through cloud and at night.'],
  [/MIDORI|ADEOS/, 'みどり2号（ADEOS-II）', '地球観測衛星', '日本の環境観測技術衛星「みどり2号」。2002年に打ち上げたが、翌2003年に電源の故障で運用を終えた。', 'Midori-II (ADEOS-II)', 'Earth observation satellite', 'Japan’s environmental satellite Midori-II, launched in 2002; a power failure ended it in 2003.'],
  [/HXMT|HUIYAN/, '慧眼（HXMT）', 'X線天文衛星', '中国の X線天文衛星「慧眼」。2017年打ち上げ。', 'Insight (HXMT)', 'X-ray astronomy satellite', 'China’s Hard X-ray Modulation Telescope “Insight”, launched in 2017.'],
  [/OAO 3|COPERNICUS/, '軌道天文台3号「コペルニクス」', '天文衛星', 'NASA の軌道天文台3号「コペルニクス」。1972年打ち上げ。紫外線・X線で観測し、1981年まで運用された。', 'OAO-3 Copernicus', 'Astronomy satellite', 'NASA’s Orbiting Astronomical Observatory 3, launched in 1972. It observed in ultraviolet and X-rays until 1981.'],
  [/OAO 2/, '軌道天文台2号', '天文衛星', 'NASA の軌道天文台2号。1968年打ち上げ。宇宙から紫外線で星を観測することに初めて成功した天文衛星。', 'OAO-2', 'Astronomy satellite', 'NASA’s Orbiting Astronomical Observatory 2, launched in 1968 — the first successful ultraviolet observatory in space.'],
  [/SEASAT/, 'シーサット', '海洋観測衛星', 'NASA が1978年に打ち上げた、海を観測する初めての衛星。レーダーを積んでいたが、約3か月半で故障した。', 'Seasat', 'Ocean observation satellite', 'Launched by NASA in 1978, the first satellite built to observe the oceans. It carried a radar but failed after about three and a half months.'],
  [/^ERS-/, 'ERS（欧州の地球観測衛星）', '地球観測衛星', '欧州宇宙機関（ESA）の地球観測衛星。ERS-1 は1991年から2000年まで運用された。', 'ERS (European Earth observation)', 'Earth observation satellite', 'An ESA Earth observation satellite. ERS-1 operated from 1991 to 2000.'],
  [/ORBVIEW 2|SEASTAR/, 'オーブビュー2（シースター）', '海洋観測衛星', '海の色（植物プランクトン）を観測したアメリカの衛星。1997年打ち上げ。', 'OrbView-2 (SeaStar)', 'Ocean observation satellite', 'A US satellite that measured ocean colour (plankton). Launched in 1997.'],
  [/SAOCOM/, 'サオコム', '地球観測衛星', 'アルゼンチンのレーダー地球観測衛星（1Aは2018年、1Bは2020年打ち上げ）。', 'SAOCOM', 'Earth observation satellite', 'Argentina’s radar Earth observation satellites (1A in 2018, 1B in 2020).'],
  [/COSMO-SKYMED/, 'コスモ・スカイメッド', '地球観測衛星', 'イタリアのレーダー地球観測衛星（2007年から順に打ち上げ）。', 'COSMO-SkyMed', 'Earth observation satellite', 'Italy’s radar Earth observation satellites, launched from 2007.'],
  [/KORONAS|CORONAS/, 'コロナス・フォトン', '太陽観測衛星', 'ロシアの太陽観測衛星。2009年に打ち上げたが、翌2010年に電源の故障で運用を終えた。', 'Koronas-Foton', 'Solar observatory', 'A Russian solar observatory launched in 2009; a power failure ended it in 2010.'],
  [/^ISIS/, 'アイシス', '科学衛星', 'カナダの電離層（上空の電気を帯びた大気の層）を調べる衛星。ISIS 1 は1969年打ち上げ。', 'ISIS', 'Science satellite', 'A Canadian satellite that studied the ionosphere (the electrically charged upper atmosphere). ISIS 1 was launched in 1969.'],
  [/INTERCOSMOS/, 'インターコスモス', '科学衛星', '旧ソ連が東欧などの国々と共同で進めた科学衛星計画「インターコスモス」の衛星。', 'Intercosmos', 'Science satellite', 'A satellite of Intercosmos, the Soviet science programme shared with Eastern European and other countries.'],
  [/SERT/, 'サート2', '技術試験衛星', 'NASA が1970年に打ち上げた、イオンエンジンを宇宙で長時間試した衛星。', 'SERT 2', 'Technology demonstrator', 'Launched by NASA in 1970 to test ion engines in space for a long time.'],
  [/^HELIOS/, 'エリオス', '偵察衛星', 'フランスの軍事用の偵察衛星。', 'Helios', 'Reconnaissance satellite', 'A French military reconnaissance satellite.'],
  [/YAOGAN/, '遥感', '人工衛星', '中国の「遥感」シリーズ。詳しい用途は公表されていない。', 'Yaogan', 'Satellite', 'China’s Yaogan series. Its exact purpose is not published.'],
  [/SHIJIAN/, '実践', '人工衛星', '中国の「実践」シリーズ。技術試験などに使われる。詳しい用途は公表されていない。', 'Shijian', 'Satellite', 'China’s Shijian series, used for technology tests and more. Details are not published.'],
  [/^USA \d/, 'アメリカ政府の衛星', '人工衛星', 'アメリカ政府の衛星に付く名前。軍事・情報収集用を含み、詳しい用途は公表されていない。', 'US government satellite', 'Satellite', 'The name given to US government satellites, including military and intelligence ones. Details are not published.'],
  [/SZ-\d+ MODULE|SHENZHOU.*MODULE/, '神舟宇宙船の軌道モジュール', '宇宙船の一部', '神舟宇宙船の軌道モジュール。帰還のときに切り離され、軌道に残ったもの。', 'Shenzhou orbital module', 'Part of a spacecraft', 'The orbital module of a Shenzhou spacecraft, left in orbit when the crew came home.'],
  [/NAUKA|POISK|ZVEZDA|ZARYA/, 'ISSのロシアのモジュール', '宇宙ステーション', '国際宇宙ステーションを構成するロシアのモジュール。', 'Russian ISS module', 'Space station', 'A Russian module of the International Space Station.'],
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
    const m = hit && name.match(hit[0]);
    const nm = hit ? (JA ? hit[1] : hit[2]) : null;
    const spec = hit ? (JA ? hit[3] : hit[4]) : '';
    const gen = L('衛星を軌道へ運んだあと、そのまま地球を回り続けているロケットの一部。', 'The part of a rocket that carried a satellite to orbit and has kept circling ever since.');
    return { kind: L('ロケットの上段', 'Rocket stage'), ja: nm ? (typeof nm === 'function' ? nm(m) : nm) : L('ロケットの上段', 'Rocket upper stage'), note: spec ? spec + (JA ? '' : ' ') + gen : gen, tumble: true };
  }
  if (/DEB/.test(name)) return { kind: L('宇宙ごみ', 'Debris'), ja: L('破片（デブリ）', 'Debris'), note: L('役目を終えた衛星やロケットから生じた破片。', 'A fragment of an old satellite or rocket.'), tumble: true };
  const hit = NAMED.find(([re]) => re.test(name));
  if (hit) return JA ? { kind: hit[2], ja: hit[1], note: hit[3] } : { kind: hit[5], ja: hit[4], note: hit[6] };
  return { kind: L('人工衛星', 'Satellite'), ja: null, note: '' };
}

// How satellites are seen (added to every satellite card)
export function visNote(info) {
  const base = L('人工衛星は自分では光らず、太陽の光を反射して光っています。日没後と日の出前の1〜2時間は、地上は暗いのに上空の衛星には日が当たっているため、よく見えます。地球の影に入ると、空の途中でふっと消えます。',
    'Satellites do not shine by themselves; they reflect sunlight. For an hour or two after sunset and before sunrise the ground is dark while satellites overhead are still in sunshine, so they are easy to see. When one enters the Earth’s shadow it fades out in mid-sky.');
  return info && info.tumble ? base + L('回転しながら飛んでいるものは、明るさが規則正しく変わる（点滅する）ことがあります。', ' Ones that tumble can brighten and fade in a regular rhythm (flash).') : base;
}
// Kind of orbit, from the elements. Sun-synchronous: the inclination at which the orbit plane turns once a
// year with the Sun, cos i ≈ −(a / 12352 km)^3.5 for a near-circular orbit.
export function orbitKind(o) {
  const a = RE + (o.perigee + o.apogee) / 2;
  if (o.ecc > 0.1) return L('楕円軌道（地球に近づいたり離れたりする）', 'Elliptical (swings close to the Earth and far out)');
  const c = -Math.pow(a / 12352, 3.5), iSSO = c >= -1 ? Math.acos(c) * 180 / Math.PI : null;
  if (iSSO && Math.abs(o.inc - iSSO) < 1.5) return L('太陽同期軌道（毎日ほぼ同じ時刻に、同じ地域の上空を通る。地球観測衛星に多い）', 'Sun-synchronous (passes over the same area at about the same local time every day; common for Earth observation)');
  if (o.inc >= 80 && o.inc <= 100) return L('極軌道（北極・南極の近くの上空を通る）', 'Polar (passes near the North and South Poles)');
  const lat = Math.round(o.inc <= 90 ? o.inc : 180 - o.inc);
  return L(`北緯${lat}°〜南緯${lat}°の上空を通る`, `Passes over latitudes ${lat}°N to ${lat}°S`);
}
// Modules of a station (part of its structure) as opposed to visiting ships
export const isModule = (sat) => /TIANHE|WENTIAN|MENGTIAN|NAUKA|POISK|ZVEZDA|ZARYA|UNITY|DESTINY|KIBO|COLUMBUS/.test(sat.name.toUpperCase());
