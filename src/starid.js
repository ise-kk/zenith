// Star pattern recognition for "写真に重ねる" (v41): which stars are in a night-sky photo, from the photo alone.
// Runs in a Web Worker (photo-worker.js), loaded only when a photo is opened. No network, no DOM.
// 1) findStars: star-like points (background measured on 4 sides, so the edge of a bright sky against dark roofs is not
//    taken for stars; single hot pixels are dropped)  2) solve: triangles of points matched against the catalogue by
//    shape, each guess checked by predicting the other stars  3) an answer only when the match is far beyond chance
//    (log10 probability <= -9, made stricter by the number of guesses tried); otherwise "not found".
// Frames: photo pixels from the centre (x right, y down); fit = {f, M, k1}, M row-major camera -> sky (J2000),
// k1 = radial lens distortion. Tested on synthetic photos with known answers and on real iPhone night-mode photos
// (bench in claude\zenith\_drafts\star-id).
const D2R = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

// ---------- 回転の推定（Horn の四元数法：一致した点の組から最も合う回転） ----------
function jacobiEig4(A) {
  const a = A.map(r => r.slice()), V = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) off += a[i][j] * a[i][j];
    if (off < 1e-22) break;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 4; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 4; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 4; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  let bi = 0; for (let i = 1; i < 4; i++) if (a[i][i] > a[bi][bi]) bi = i;
  return [V[0][bi], V[1][bi], V[2][bi], V[3][bi]];
}
// cams[i] (カメラ座標の向き) を worlds[i] に重ねる回転 M（world = M cam）
export function bestRotation(cams, worlds, wts) {
  let S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  cams.forEach((c, k) => { const w = worlds[k], g = wts ? wts[k] : 1; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i][j] += g * c[i] * w[j]; });
  const [Sxx, Sxy, Sxz] = S[0], [Syx, Syy, Syz] = S[1], [Szx, Szy, Szz] = S[2];
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz]];
  const [q0, qx, qy, qz] = jacobiEig4(N);
  return [
    q0 * q0 + qx * qx - qy * qy - qz * qz, 2 * (qx * qy - q0 * qz), 2 * (qx * qz + q0 * qy),
    2 * (qx * qy + q0 * qz), q0 * q0 - qx * qx + qy * qy - qz * qz, 2 * (qy * qz - q0 * qx),
    2 * (qx * qz - q0 * qy), 2 * (qy * qz + q0 * qx), q0 * q0 - qx * qx - qy * qy + qz * qz];
}
export const toCam = (M, d) => [M[0] * d[0] + M[3] * d[1] + M[6] * d[2], M[1] * d[0] + M[4] * d[1] + M[7] * d[2], M[2] * d[0] + M[5] * d[1] + M[8] * d[2]];
export function projectFit(fit, d) {
  const a = toCam(fit.M, d); if (a[2] < 0.05) return null;
  let x = a[0] / a[2], y = a[1] / a[2];
  if (fit.k1) { const r2 = x * x + y * y, s = 1 + fit.k1 * r2; x *= s; y *= s; }
  return [fit.f * x, fit.f * y];
}
const camRay = (p, f, k1) => {
  let x = p[0] / f, y = p[1] / f;
  if (k1) { for (let i = 0; i < 4; i++) { const r2 = x * x + y * y; x = p[0] / f / (1 + k1 * r2); y = p[1] / f / (1 + k1 * r2); } }
  return norm([x, y, 1]);
};
export const boresight = (M) => norm([M[2], M[5], M[8]]); // カメラの正面（z）を天球へ

// 二項分布の上側確率 P(X >= k), X~Bin(n,p) の log10
function log10BinTail(n, k, p) {
  if (k <= 0) return 0; if (k > n) return -Infinity;
  const lp = Math.log(p), lq = Math.log1p(-p);
  let lc = 0; for (let i = 0; i < k; i++) lc += Math.log(n - i) - Math.log(i + 1);
  let term = lc + k * lp + (n - k) * lq, sum = term;
  for (let i = k + 1; i <= n; i++) { term += Math.log(n - i + 1) - Math.log(i) + lp - lq; sum = Math.max(sum, term) + Math.log1p(Math.exp(-Math.abs(sum - term))); if (term < sum - 40) break; }
  return sum / Math.LN10;
}

// ---------- 星表側の下ごしらえ ----------
export function prepareCatalog(stars, { verMag = 5.0, extra = [] } = {}) {
  const ver = stars.filter(s => s.mag <= verMag).concat(extra).sort((a, b) => a.mag - b.mag);
  return { ver };
}
// 探し方の段階：明るい星だけで素早く → 見つからなければ暗い星まで広げる（天文写真の位置特定の定番の工夫）
export const PASSES = [{ hypMag: 3.0, nHyp: 10 }, { hypMag: 4.0, nHyp: 15 }, { hypMag: 5.0, nHyp: 20 }];
// 星ごとに「近くの星と角度」の一覧（角度順）。maxSep 以内だけ。
function neighbourLists(hyp, maxSep) {
  const cmax = Math.cos(maxSep);
  return hyp.map((s, i) => {
    const L = [];
    for (let j = 0; j < hyp.length; j++) if (j !== i) { const c = dot(s.w, hyp[j].w); if (c > cmax) L.push([Math.acos(Math.min(1, c)), j]); }
    L.sort((a, b) => a[0] - b[0]);
    return { ang: Float64Array.from(L.map(x => x[0])), idx: Int32Array.from(L.map(x => x[1])) };
  });
}
const lowerBound = (arr, v) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; } return lo; };

// ---------- 本体 ----------
// spots: [{x,y,c}] 画素（写真の中心から）・明るい順。iw, ih: 写真の大きさ。
// opts.f: 焦点距離（画素）の見当、opts.fTol: その幅（0.15 = ±15%）。opts.prior: {dir:[x,y,z], tolDeg} 向きの見当（センサー）
export function solve(spots, iw, ih, cat, opts = {}) {
  const t0 = Date.now();
  const diag = Math.hypot(iw, ih);
  const f0 = opts.f || diag * 26 / 43.27, fTol = opts.fTol ?? (opts.f ? 0.06 : 0.15);
  const pxTol = opts.pxTol ?? 0.006 * diag;       // 三角形の照合の許容（画素）
  const verTol = opts.verTol ?? 0.004 * diag;     // 確かめの許容（画素）
  const needLog = opts.needLog ?? -9;             // 偶然の確率がこれより小さいときだけ採用（log10）
  const prior = opts.prior;
  if (spots.length < 3) return { ok: false, why: 'few-spots', ms: Date.now() - t0 };

  const fMin = f0 * (1 - fTol), fMax = f0 * (1 + fTol);
  const fovDiag = 2 * Math.atan(diag / 2 / fMin);
  const cosHalf = Math.cos(fovDiag / 2 + 0.01);

  // 確かめ用：星表の点を写真に投影して、近い明るい点を探す（格子で速く）
  const G = 32, gw = Math.ceil(iw / G) + 1, gh = Math.ceil(ih / G) + 1, grid = new Map();
  spots.forEach((s, i) => { const k = Math.floor((s.x + iw / 2) / G) + Math.floor((s.y + ih / 2) / G) * gw; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  const nearest = (p, tol) => {
    const gx = Math.floor((p[0] + iw / 2) / G), gy = Math.floor((p[1] + ih / 2) / G), r = Math.ceil(tol / G);
    let bd = tol, bi = -1;
    for (let y = gy - r; y <= gy + r; y++) for (let x = gx - r; x <= gx + r; x++) {
      if (x < 0 || y < 0 || x >= gw || y >= gh) continue; const L = grid.get(x + y * gw); if (!L) continue;
      for (const i of L) { const d = Math.hypot(spots[i].x - p[0], spots[i].y - p[1]); if (d < bd) { bd = d; bi = i; } }
    }
    return bi < 0 ? null : { i: bi, d: bd };
  };
  const inFrame = (p, m = 0) => p && Math.abs(p[0]) < iw / 2 - m && Math.abs(p[1]) < ih / 2 - m;

  // 一致を数える：星表の星（明るい順）を投影し、近い点に1対1で対応づける
  function matchAll(fit, tol) {
    const used = new Set(), pairs = [];
    let nPred = 0; const nPredByMag = new Array(8).fill(0);
    const b = boresight(fit.M);
    for (const s of cat.ver) {
      if (dot(s.w, b) < cosHalf) continue;
      const p = projectFit(fit, s.w); if (!inFrame(p, 2)) continue; nPred++;
      for (let ci = 0; ci < 8; ci++) if (s.mag <= [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5][ci]) nPredByMag[ci]++;
      const m = nearest(p, tol); if (!m || used.has(m.i)) continue;
      used.add(m.i); pairs.push({ s, i: m.i, d: m.d });
    }
    return { pairs, nPred, nPredByMag };
  }
  // 一致を使って向きと焦点距離（と弱いゆがみ）を合わせ直す
  function refine(fit, pairs, withK1) {
    let best = fit, bestErr = Infinity;
    const err = (f, k1) => {
      const cams = pairs.map(q => camRay([spots[q.i].x, spots[q.i].y], f, k1)), wl = pairs.map(q => q.s.w);
      const M = bestRotation(cams, wl), F = { f, M, k1 };
      let e = 0; for (const q of pairs) { const p = projectFit(F, q.s.w); e += p ? (p[0] - spots[q.i].x) ** 2 + (p[1] - spots[q.i].y) ** 2 : 1e6; }
      return { F, e };
    };
    // 焦点距離を黄金分割で。ゆがみ（k1）は焦点距離と埋め合わせ合うので、細かい格子で一緒に探す
    const goldenF = (k1, lo, hi) => {
      for (let it = 0; it < 28; it++) { const a = hi - (hi - lo) * 0.618, b = lo + (hi - lo) * 0.618; if (err(a, k1).e < err(b, k1).e) hi = b; else lo = a; }
      return err((lo + hi) / 2, k1);
    };
    if (!withK1) { const r = goldenF(fit.k1 || 0, fit.f * 0.9, fit.f * 1.1); best = r.F; bestErr = r.e; }
    else {
      let bk = 0;
      for (let k1 = -0.1; k1 <= 0.1001; k1 += 0.01) { const r = goldenF(k1, fit.f * 0.85, fit.f * 1.15); if (r.e < bestErr) { bestErr = r.e; best = r.F; bk = k1; } }
      for (let k1 = bk - 0.01; k1 <= bk + 0.01001; k1 += 0.002) { const r = goldenF(k1, best.f * 0.97, best.f * 1.03); if (r.e < bestErr) { bestErr = r.e; best = r.F; } }
    }
    return { fit: best, rms: Math.sqrt(bestErr / pairs.length) };
  }

  // 偶然の一致の起こりやすさ：写真の中の明るい点の密度 × 許容円の面積。
  // 「写るはずの星」は明るい順に区切って数える（街なかでは暗い星が写らないので、全部を分母にすると確かさを低く見すぎる）。
  // いちばん確かな区切りを使い、区切りを選んだ分（8通り）だけきびしくする。
  const area = iw * ih;
  const CUTS = [1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  function score(pairs, nPredByMag) {
    const pChance = Math.min(0.5, spots.length * Math.PI * verTol * verTol / area);
    let bestLg = 0;
    for (let ci = 0; ci < CUTS.length; ci++) {
      const k = pairs.filter(q => q.s.mag <= CUTS[ci]).length - 3, n = nPredByMag[ci] - 3;
      if (k < 2 || n < k) continue;
      bestLg = Math.min(bestLg, log10BinTail(n, k, pChance));
    }
    return bestLg + Math.log10(CUTS.length);
  }

  // 照合に使う点：写真を 3x3 のますに分け、各ますの明るい点を順番に拾う（地上の灯りが一か所にかたまっていても星が入るように）
  const spread = [];
  { const cells = Array.from({ length: 9 }, () => []);
    for (const sp of spots) cells[Math.min(2, Math.floor((sp.x / iw + 0.5) * 3)) + 3 * Math.min(2, Math.floor((sp.y / ih + 0.5) * 3))].push(sp);
    for (let r = 0; spread.length < spots.length; r++) {
      const row = cells.map(c => c[r]).filter(Boolean).sort((a, b) => b.c - a.c); if (!row.length) break; spread.push(...row);
    } }
  let tries = 0, steps = 0, best = null, timedOut = false;
  const budget = opts.budgetMs ?? 10000;            // 時間の上限：超えたら「分からない」で返す（スマホで固まらないように）
  const passes = opts.passes || PASSES;
  passLoop:
  for (const pass of passes) {
  let hyp = cat.ver.filter(s => s.mag <= pass.hypMag);
  if (prior) { const lim = Math.cos(Math.min(Math.PI, prior.tolDeg * D2R + fovDiag / 2 + 0.02)); hyp = hyp.filter(s => dot(s.w, prior.dir) > lim); }
  if (hyp.length < 3) continue;
  const NB = neighbourLists(hyp, fovDiag + 0.02);
  const hs = spread.slice(0, Math.min(pass.nHyp, spread.length));
  const hypIn = (fit) => { const b = boresight(fit.M); let n = 0; for (const s of hyp) { if (dot(s.w, b) < cosHalf) continue; const p = projectFit(fit, s.w); if (inFrame(p, 2) && nearest(p, verTol * 2)) n++; } return n; };

  // 三角形の「形」で探す
  outer:
  for (let a = 2; a < hs.length; a++) for (let b = 1; b < a; b++) for (let c = 0; c < b; c++) {
    const P = [hs[c], hs[b], hs[a]];
    // 焦点距離ごとの正確な三角形の形（広角では、焦点距離が変わると形も少し変わる）
    const FK = 25, fs = [], D01 = [], D02 = [], D12 = [];
    for (let q = 0; q < FK; q++) {
      const f = fMin * Math.pow(fMax / fMin, q / (FK - 1)), R = P.map(s => camRay([s.x, s.y], f));
      fs.push(f); D01.push(angle(R[0], R[1])); D02.push(angle(R[0], R[2])); D12.push(angle(R[1], R[2]));
    }
    const R = P.map(s => camRay([s.x, s.y], f0));
    if (Math.min(angle(R[0], R[1]), angle(R[0], R[2]), angle(R[1], R[2])) < 4 * pxTol / f0) continue; // 近すぎる組は形が当てにならない
    const hand = Math.sign(dot(cross(R[0], R[1]), R[2]));
    const lo = D01[FK - 1] - 1.5 * pxTol / fMin, hi = D01[0] + 1.5 * pxTol / fMin; // d01 は f が大きいほど小さい
    const at = (A) => { // 星表の角度 A に合う f と、そのときの d02・d12
      if (A >= D01[0]) return [fs[0], D02[0], D12[0]]; if (A <= D01[FK - 1]) return [fs[FK - 1], D02[FK - 1], D12[FK - 1]];
      let q = 0; while (q < FK - 2 && D01[q + 1] > A) q++;
      const t = (D01[q] - A) / (D01[q] - D01[q + 1]);
      return [fs[q] + t * (fs[q + 1] - fs[q]), D02[q] + t * (D02[q + 1] - D02[q]), D12[q] + t * (D12[q + 1] - D12[q])];
    };
    for (let i = 0; i < hyp.length; i++) {
      const Ni = NB[i];
      for (let u = lowerBound(Ni.ang, lo); u < Ni.ang.length && Ni.ang[u] <= hi; u++) {
        const j = Ni.idx[u];
        const [f, e02, e12] = at(Ni.ang[u]);
        const tol = 1.5 * pxTol / f;
        for (let v = lowerBound(Ni.ang, e02 - tol); v < Ni.ang.length && Ni.ang[v] <= e02 + tol; v++) {
          const k = Ni.idx[v]; if (k === j) continue;
          if (Math.abs(angle(hyp[j].w, hyp[k].w) - e12) > tol) continue;
          if (Math.sign(dot(cross(hyp[i].w, hyp[j].w), hyp[k].w)) !== hand) continue; // 鏡写しは除く
          if ((++steps & 255) === 0 && Date.now() - t0 > budget) { timedOut = true; break passLoop; }
          const R2 = P.map(s => camRay([s.x, s.y], f));
          const M = bestRotation(R2, [hyp[i].w, hyp[j].w, hyp[k].w]);
          if (prior && angle(boresight(M), prior.dir) > prior.tolDeg * D2R) continue; // 向きの見当と合わない仮説は考えない
          tries++; // 「試した仮説の数」には、考えた仮説だけを数える
          let fit = { f, M, k1: 0 };
          const nIn = hypIn(fit);
          if (nIn < 5) continue;                  // 安い下調べ：明るい星がもう2つ以上合うか
          let { pairs, nPred, nPredByMag } = matchAll(fit, verTol * 3);
          if (pairs.length < 5) continue;
          ({ fit } = refine(fit, pairs, false));
          ({ pairs, nPred, nPredByMag } = matchAll(fit, verTol));
          if (pairs.length < 5) continue;
          const lg = score(pairs, nPredByMag);
          if (!best || lg < best.lg) best = { lg, fit, pairs, nPred };
          if (best.lg + Math.log10(tries) < needLog - 3) break passLoop; // 試した数を差し引いても十分に確か → 打ち切り
        }
      }
    }
  }
  }
  if (!best) return { ok: false, why: timedOut ? 'timeout' : 'no-match', tries, ms: Date.now() - t0 };

  // 仕上げ：ゆがみ込みで合わせ直し → 一致を数え直す、を許容を狭めながら繰り返す
  let fit = best.fit, pairs = best.pairs, nPred, nPredByMag;
  for (const k of [2, 1.5, 1, 1]) {
    ({ fit } = refine(fit, pairs, true));
    ({ pairs, nPred, nPredByMag } = matchAll(fit, verTol * k));
    if (pairs.length < 5) break;
  }
  const lg = score(pairs, nPredByMag);
  // 試した仮説の数だけ「偶然」が起きやすくなるので、その分きびしくする
  const lgAdj = lg + Math.log10(Math.max(1, tries));
  const rms = Math.sqrt(pairs.reduce((e, q) => { const p = projectFit(fit, q.s.w); return e + (p[0] - spots[q.i].x) ** 2 + (p[1] - spots[q.i].y) ** 2; }, 0) / Math.max(1, pairs.length));
  const ok = lgAdj <= needLog && pairs.length >= 5;
  return { ok, why: ok ? 'solved' : (timedOut ? 'timeout' : 'weak'), timedOut, fit, pairs, nPred, lg, lgAdj, rms, tries, ms: Date.now() - t0, nSpots: spots.length };
}

export function findStars(data, w, h, max = 300) {
  const s = 2, W = Math.floor(w / s), H = Math.floor(h / s);
  const full = (x, y) => { const i = (y * w + x) * 4; return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; };
  const L = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0; for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) v += full(x * s + dx, y * s + dy);
    L[y * W + x] = v / (s * s);
  }
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += L[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  const box = (x0, y0, x1, y1) => { x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1); if (x1 <= x0 || y1 <= y0) return null; return (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0)); };
  const G = 3, R = 12; // 星の分（G）をあけて、外側の R の範囲を4つに分けて測る
  const out = [];
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const v = L[y * W + x];
    let peak = true;
    for (let dy = -2; dy <= 2 && peak; dy++) for (let dx = -2; dx <= 2; dx++) { if ((dx || dy) && L[(y + dy) * W + x + dx] > v) { peak = false; break; } }
    if (!peak) continue;
    const q = [box(x - R, y - R, x + R + 1, y - G), box(x - R, y + G + 1, x + R + 1, y + R + 1), box(x - R, y - R, x - G, y + R + 1), box(x + G + 1, y - R, x + R + 1, y + R + 1)].filter(b => b !== null);
    if (q.length < 3) continue;
    const bg = Math.max(...q), c = v - bg;
    if (c < 18) continue;
    // ホットピクセル：元の画素で、いちばん明るい1画素が周り8画素より飛び抜けている
    const fx = x * s, fy = y * s; let pk = -1, px = 0, py = 0;
    for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) { const X = fx + dx, Y = fy + dy; if (X < 1 || Y < 1 || X >= w - 1 || Y >= h - 1) continue; const t = full(X, Y); if (t > pk) { pk = t; px = X; py = Y; } }
    let nb = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) nb += full(px + dx, py + dy);
    nb /= 8;
    if (pk - bg > 30 && (nb - bg) < 0.25 * (pk - bg)) continue;
    let sx = 0, sy = 0, sw = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = Math.max(0, L[(y + dy) * W + x + dx] - bg); sx += t * (x + dx); sy += t * (y + dy); sw += t; }
    out.push({ x: (sx / sw + 0.5) * s, y: (sy / sw + 0.5) * s, c });
  }
  out.sort((a, b) => b.c - a.c);
  const keep = [];
  for (const p of out) { if (keep.some(k => Math.hypot(k.x - p.x, k.y - p.y) < 6 * s)) continue; keep.push(p); if (keep.length >= max) break; }
  return keep;
}

// One job from the page: { rgba, w, h, f35 (35 mm equivalent focal length from EXIF, or 0),
// cat: Float64Array of [x, y, z, mag, id, kind] per object (kind 0 = star, 1 = planet; J2000 unit vectors), budgetMs }
export function runJob(job) {
  const t0 = Date.now(), { w, h } = job, diag = Math.hypot(w, h);
  const spots = findStars(job.rgba, w, h, 300).map(s => ({ x: s.x - w / 2, y: s.y - h / 2, c: s.c }));
  const ver = [], c = job.cat;
  for (let i = 0; i + 5 < c.length; i += 6) ver.push({ w: [c[i], c[i + 1], c[i + 2]], mag: c[i + 3], id: c[i + 4], kind: c[i + 5] });
  ver.sort((a, b) => a.mag - b.mag);
  const cat = { ver };
  // no focal length in the photo: try the usual phone lenses (1x, 0.5x, 2x, 3x) in turn
  const lenses = job.f35 > 5 && job.f35 < 400 ? [[job.f35, 0.06]] : [[26, 0.15], [13, 0.15], [52, 0.12], [77, 0.12]];
  const budget = job.budgetMs || 12000;
  let best = null;
  for (const [f35, fTol] of lenses) {
    const left = budget - (Date.now() - t0); if (left < 500) break;
    const r = solve(spots, w, h, cat, { f: diag * f35 / 43.27, fTol, budgetMs: Math.min(left, lenses.length > 1 ? 6000 : left) });
    if (!best || (r.lgAdj ?? 1) < (best.lgAdj ?? 1)) best = r;
    if (r.ok) break;
  }
  const out = { ok: !!(best && best.ok), why: best ? best.why : 'none', nSpots: spots.length, ms: Date.now() - t0 };
  if (out.ok) {
    out.f = best.fit.f; out.k1 = best.fit.k1 || 0; out.M = best.fit.M; out.lg = best.lgAdj; out.rms = best.rms;
    out.pairs = best.pairs.map(q => ({ id: q.s.id, kind: q.s.kind, mag: q.s.mag, x: spots[q.i].x, y: spots[q.i].y }));
  }
  return out;
}
