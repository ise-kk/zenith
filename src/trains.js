// Starlink "trains": satellites from one recent launch still bunched together along their orbit.
// trains.json is refreshed by the site's scheduled job (SpaceX orbits via CelesTrak, launch dates from SATCAT).
// A launch counts as a train only while at least MIN satellites sit within ARC degrees of each other.
const ARC = 40, MIN = 8;
const D2R = Math.PI / 180;

export function createTrains({ st, S }) {
  let groups = [];
  const cache = new Map();

  async function load() {
    try {
      const r = await fetch('trains.json', { cache: 'no-cache' });
      if (!r.ok) return false;
      const j = await r.json();
      groups = (j.groups || []).map(g => ({ id: g.id, date: g.date, sats: S.parseTLE(g.sats.map(s => s.join('\n')).join('\n')) }))
        .filter(g => g.sats.length >= 5);
      cache.clear();
      return groups.length > 0;
    } catch (e) { return false; }
  }
  function _set(list) { groups = list; cache.clear(); } // tests

  // members bunched together at `date`, ordered from the head of the line to its tail
  function cluster(g, date) {
    const key = g.id + ':' + Math.floor(date.getTime() / 60e3);
    if (cache.has(key)) return cache.get(key);
    let res = null;
    const pv = g.sats.map(s => ({ s, e: S.satEci(s, date) })).filter(x => x.e);
    if (pv.length >= MIN) {
      const r0 = pv[0].e.position, v0 = pv[0].e.velocity;
      const n = norm(cross([r0.x, r0.y, r0.z], [v0.x, v0.y, v0.z]));
      const e1 = norm([r0.x, r0.y, r0.z]), e2 = cross(n, e1);
      const ang = pv.map(x => { const p = [x.e.position.x, x.e.position.y, x.e.position.z]; return { s: x.s, a: (Math.atan2(dot(p, e2), dot(p, e1)) / D2R + 360) % 360, r: Math.hypot(...p) }; })
        .sort((a, b) => a.a - b.a);
      // widest bunch within ARC degrees (with wrap-around)
      let best = null;
      for (let i = 0; i < ang.length; i++) {
        const inWin = [];
        for (let k = 0; k < ang.length; k++) { const d = (ang[(i + k) % ang.length].a - ang[i].a + 360) % 360; if (d <= ARC) inWin.push(ang[(i + k) % ang.length]); else break; }
        if (!best || inWin.length > best.length) best = inWin;
      }
      if (best && best.length >= MIN) {
        const span = (best[best.length - 1].a - best[0].a + 360) % 360;
        const alt = best.reduce((m, x) => m + x.r, 0) / best.length - 6378.137;
        const period = 1440 / (+best[0].s.l2.slice(52, 63));
        res = { g, members: best.map(x => x.s).reverse(), span, spanMin: Math.max(1, span / 360 * period), alt };
      }
    }
    cache.set(key, res);
    if (cache.size > 200) cache.delete(cache.keys().next().value);
    return res;
  }

  function active(date) { return groups.map(g => cluster(g, date)).filter(Boolean); }
  const byId = (id) => groups.find(g => g.id === id);

  // visible passes of each train between t0 and t1: head, middle and tail are computed, then merged
  async function passes(t0, t1, obs) {
    const out = [];
    for (const c of active(t0)) {
      const m = c.members, pick = [m[0], m[Math.floor(m.length / 2)], m[m.length - 1]];
      const ps = await S.findPasses(pick, t0, t1, obs);
      ps.sort((a, b) => a.start.t - b.start.t);
      for (const p of ps) {
        const last = out.length && out[out.length - 1];
        if (last && last.g === c.g && p.start.t - last.end.t < 15 * 60e3) {
          if (p.start.t < last.start.t) last.start = p.start;
          if (p.end.t > last.end.t) last.end = p.end;
          if (p.max.alt > last.max.alt) { last.max = p.max; last.track = p.track; }
        } else out.push({ kind: 'train', g: c.g, sat: p.sat, start: p.start, end: p.end, max: p.max, track: p.track });
      }
    }
    return out.sort((a, b) => a.start.t - b.start.t);
  }
  return { load, cluster, active, byId, passes, groups: () => groups, _set };
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
