// Well-known star groups that are not constellations (v44): searchable in かざす, guided to, and drawn as lines.
// Members are given by Bayer designation (as in DATA.info) so they never depend on the order of the star list.
// Only long-established groups whose members are not in dispute. `path`: the lines to draw, as lists of members.
export const ASTERISMS = [
  { id: 'dipper', note: { ja: 'おおぐま座の腰から尾にあたる7つの星。ひしゃくの先の2つの星（メラクからドゥーベ）の間をおよそ5倍のばすと、北極星に届きます。', en: "Seven stars of the Great Bear's back and tail. Extend the line from Merak to Dubhe about five times to reach Polaris." }, ja: '北斗七星', en: 'Big Dipper', keys: ['北斗七星', 'ほくとしちせい', 'ひしゃく', '北斗', 'big dipper', 'plough', 'plow'],
    path: [['η UMa', 'ζ UMa', 'ε UMa', 'δ UMa', 'γ UMa', 'β UMa', 'α UMa', 'δ UMa']] },
  { id: 'nanto', note: { ja: 'いて座の6つの星が作る小さなひしゃく。北斗七星に対して「南斗」と呼ばれます。夏の夜、南の空の低いところに見えます。', en: 'Six stars of Sagittarius forming a small dipper, the “Southern Dipper” of East Asia. Low in the south on summer evenings.' }, ja: '南斗六星', en: 'Milk Dipper', keys: ['南斗六星', 'なんとろくせい', '南斗', 'milk dipper'],
    path: [['μ Sgr', 'λ Sgr', 'φ Sgr', 'σ Sgr', 'τ Sgr', 'ζ Sgr']] },
  { id: 'summer3', note: { ja: 'こと座のベガ、はくちょう座のデネブ、わし座のアルタイルを結ぶ三角形。ベガは織姫星、アルタイルは彦星として知られます。', en: 'Vega (Lyra), Deneb (Cygnus) and Altair (Aquila). Vega and Altair are the weaver and the herdsman of the Tanabata story.' }, ja: '夏の大三角', en: 'Summer Triangle', keys: ['夏の大三角', 'なつのだいさんかく', '大三角', 'summer triangle'],
    path: [['α Lyr', 'α Cyg', 'α Aql', 'α Lyr']] },
  { id: 'winter3', note: { ja: 'オリオン座のベテルギウス、おおいぬ座のシリウス、こいぬ座のプロキオンを結ぶ三角形。', en: 'Betelgeuse (Orion), Sirius (Canis Major) and Procyon (Canis Minor).' }, ja: '冬の大三角', en: 'Winter Triangle', keys: ['冬の大三角', 'ふゆのだいさんかく', '大三角', 'winter triangle'],
    path: [['α Ori', 'α CMi', 'α CMa', 'α Ori']] },
  { id: 'winter6', note: { ja: 'シリウス・リゲル・アルデバラン・カペラ・ポルックス・プロキオンを結ぶ大きな六角形。「冬の大六角形」とも呼ばれます。', en: 'A large hexagon of Sirius, Rigel, Aldebaran, Capella, Pollux and Procyon.' }, ja: '冬のダイヤモンド', en: 'Winter Hexagon', keys: ['冬のダイヤモンド', 'ふゆのだいやもんど', '冬の大六角形', 'ふゆのだいろっかっけい', 'winter hexagon', 'winter circle'],
    path: [['α CMa', 'β Ori', 'α Tau', 'α Aur', 'β Gem', 'α CMi', 'α CMa']] },
  { id: 'spring3', note: { ja: 'うしかい座のアークトゥルス、おとめ座のスピカ、しし座のデネボラを結ぶ三角形。', en: 'Arcturus (Boötes), Spica (Virgo) and Denebola (Leo).' }, ja: '春の大三角', en: 'Spring Triangle', keys: ['春の大三角', 'はるのだいさんかく', '大三角', 'spring triangle'],
    path: [['α Boo', 'α Vir', 'β Leo', 'α Boo']] },
  { id: 'spring4', note: { ja: '春の大三角の3つの星と、りょうけん座のコル・カロリを結ぶ四角形。', en: 'The Spring Triangle plus Cor Caroli in Canes Venatici.' }, ja: '春のダイヤモンド', en: 'Great Diamond', keys: ['春のダイヤモンド', 'はるのだいやもんど', 'great diamond', 'diamond of virgo'],
    path: [['α2 CVn', 'α Boo', 'α Vir', 'β Leo', 'α2 CVn']] },
  { id: 'arc', note: { ja: '北斗七星の柄のカーブをそのままのばすとアークトゥルス、さらにのばすとスピカに届きます。春の星をたどる目印です。', en: "Follow the curve of the Big Dipper's handle to Arcturus, then on to Spica." }, ja: '春の大曲線', en: 'Arc to Arcturus', keys: ['春の大曲線', 'はるのだいきょくせん', '大曲線', 'arc to arcturus', 'spike to spica'],
    path: [['ε UMa', 'ζ UMa', 'η UMa', 'α Boo', 'α Vir']] },
  { id: 'square', note: { ja: 'ペガスス座の3つの星と、アンドロメダ座のアルフェラッツが作る四角形。秋の空の目印です。', en: 'Three stars of Pegasus and Alpheratz in Andromeda: the landmark of the autumn sky.' }, ja: '秋の四辺形', en: 'Great Square of Pegasus', keys: ['秋の四辺形', 'あきのしへんけい', 'ペガススの大四辺形', 'ぺがすすのだいしへんけい', '四辺形', 'great square', 'square of pegasus'],
    path: [['α Peg', 'β Peg', 'α And', 'γ Peg', 'α Peg']] },
  { id: 'belt', note: { ja: 'オリオン座のベルトにあたる、ほぼ一直線に並ぶ3つの星。', en: 'The belt of Orion: three stars in a nearly straight line.' }, ja: 'オリオンの三つ星', en: "Orion's Belt", keys: ['オリオンの三つ星', 'おりおんのみつぼし', '三つ星', 'みつぼし', "orion's belt", 'orions belt', 'belt'],
    path: [['ζ Ori', 'ε Ori', 'δ Ori']] },
];

// resolve members to star indices once; returns [{...a, stars:[i...], lines:[[i...]], ra, dec}]
export function resolveAsterisms(DATA) {
  const byBayer = {};
  for (const [i, inf] of Object.entries(DATA.info)) if (inf && inf[0]) { const k = inf[0]; if (byBayer[k] == null || DATA.stars[i][2] < DATA.stars[byBayer[k]][2]) byBayer[k] = +i; }
  const D2R = Math.PI / 180;
  return ASTERISMS.map(a => {
    const lines = a.path.map(seg => seg.map(b => byBayer[b]));
    if (lines.some(seg => seg.some(i => i == null))) return null; // a member is missing from the catalogue: leave the group out
    const stars = [...new Set(lines.flat())];
    // centre: mean of the unit vectors (works across RA 0h)
    let x = 0, y = 0, z = 0;
    for (const i of stars) { const [ra, dec] = DATA.stars[i]; x += Math.cos(dec * D2R) * Math.cos(ra * D2R); y += Math.cos(dec * D2R) * Math.sin(ra * D2R); z += Math.sin(dec * D2R); }
    const ra = (Math.atan2(y, x) / D2R + 360) % 360, dec = Math.atan2(z, Math.hypot(x, y)) / D2R;
    return { ...a, stars, lines, ra, dec };
  }).filter(Boolean);
}
