// Share: a picture of the sky as computed for now (or the time on the time bar), made on the phone.
// Portrait 1080×1920 (fits a story, and looks fine in a post). No exact location is ever written on it:
// preset cities are named, "my location" and typed coordinates are not.
import { t, JA, TZ, LOCALE, dir, magT } from './i18n.js';
import { conName, starLabel, planetName } from './names.js';

const D2R = Math.PI / 180;

export function createShare(deps) {
  const { st, S, A, DATA, STAR_RGB, skyState, TR, placeName } = deps;

  function fontsReady() { try { return document.fonts ? document.fonts.ready : Promise.resolve(); } catch (e) { return Promise.resolve(); } }

  // ---- the sky disc (stereographic, zenith centre, N up, E left) ----
  function drawSky(ctx, CX, CY, R, d, opt = {}) {
    const obs = st.place;
    const map = S.horizonMapper(d, obs);
    const sun = S.bodyAltAz(A.Body.Sun, d, obs);
    const sky = skyState(sun.alt, d);
    const proj = (alt, az) => { const r = R * Math.tan((90 - alt) * D2R / 2); return [CX - r * Math.sin(az * D2R), CY - r * Math.cos(az * D2R)]; };
    const k = R / 330; // scale relative to the on-screen map
    ctx.save();
    ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.clip();
    const g = ctx.createRadialGradient(CX, CY, 0, CX, CY, R);
    const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
    const mix = (a, b, q) => a.map((v, i) => v + (b[i] - v) * q);
    g.addColorStop(0, rgb(sky.top)); g.addColorStop(0.72, rgb(mix(sky.top, sky.bottom, 0.4))); g.addColorStop(1, rgb(sky.bottom));
    ctx.fillStyle = g; ctx.fillRect(CX - R, CY - R, 2 * R, 2 * R);
    const nightK = Math.max(0, Math.min(1, (sky.lm - 1) / 4));
    // Milky Way, drawn softer and a little stronger than on screen (the picture is seen small)
    if (nightK > 0.1) {
      ctx.filter = `blur(${Math.round(3 * k)}px)`;
      DATA.mw.forEach((polys, li) => {
        ctx.fillStyle = `rgba(190,202,235,${(0.035 + li * 0.012) * nightK})`;
        ctx.beginPath();
        for (const ring of polys) {
          let first = true;
          for (const [ra, dec] of ring) { const h = map(ra < 0 ? ra + 360 : ra, dec); if (h.alt < -40) { first = true; continue; } const [x, y] = proj(h.alt, h.az); if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); }
          ctx.closePath();
        }
        ctx.fill('evenodd');
      });
      ctx.filter = 'none';
    }
    // constellation figures, faint
    ctx.lineWidth = 1.1 * k; ctx.strokeStyle = `rgba(160,180,220,${0.16 + 0.06 * nightK})`; ctx.beginPath();
    for (const c of DATA.cons) for (const seg of c.lines) { let prev = null; for (const [ra, dec] of seg) { const h = map(ra, dec); if (h.alt < -3) { prev = null; continue; } const q = proj(h.alt, h.az); if (prev) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(q[0], q[1]); } prev = q; } }
    ctx.stroke();
    // stars (limit a little below the chosen sky so the picture is not crowded)
    const lm = Math.min(sky.lm, 5.8);
    const labels = [];
    for (let i = 0; i < DATA.stars.length; i++) {
      const s = DATA.stars[i]; if (s[2] > lm) break;
      const h = map(s[0], s[1]); if (h.alt < 0) continue;
      const air = 1 / Math.max(Math.sin((h.alt + 244 / (165 + 47 * Math.pow(h.alt, 1.1))) * D2R), 0.02);
      const m = s[2] + 0.25 * (air - 1); if (m > lm) continue;
      const [x, y] = proj(h.alt, h.az);
      const q = Math.pow(10, -0.4 * (m - lm));
      const rad = Math.min(0.5 + Math.sqrt(q) * 0.62, 4.6) * k;
      const a = Math.min(1, 0.3 + q * 0.12);
      const c = STAR_RGB[i];
      if (rad > 1.6 * k) { const gg = ctx.createRadialGradient(x, y, 0, x, y, rad * 4); gg.addColorStop(0, rgb(c, a * 0.45)); gg.addColorStop(1, rgb(c, 0)); ctx.fillStyle = gg; ctx.fillRect(x - rad * 4, y - rad * 4, rad * 8, rad * 8); }
      ctx.fillStyle = rgb(c, a); ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      if (DATA.info[i] && s[2] < 1.3 && h.alt > 8) labels.push([x, y, starLabel(i)]);
    }
    ctx.font = `${Math.round(13 * k)}px "Zen Kaku Gothic New", sans-serif`; ctx.fillStyle = 'rgba(225,230,240,.72)'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    for (const [x, y, s] of labels) ctx.fillText(s, x + 7 * k, y - 5 * k);
    // planets
    const seen = [];
    for (const p of S.PLANETS) {
      const h = S.bodyAltAz(p.body, d, obs); if (h.alt < 0) continue;
      const m = A.Illumination(p.body, d).mag; if (m > sky.lm + 0.5) continue;
      const [x, y] = proj(h.alt, h.az);
      const rad = Math.max(2, Math.min(5.5, 2.8 - m * 0.6)) * k;
      const gg = ctx.createRadialGradient(x, y, 0, x, y, rad * 5); gg.addColorStop(0, 'rgba(255,232,190,.45)'); gg.addColorStop(1, 'rgba(255,232,190,0)'); ctx.fillStyle = gg; ctx.fillRect(x - rad * 5, y - rad * 5, rad * 10, rad * 10);
      ctx.fillStyle = 'rgba(255,238,205,1)'; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      ctx.font = `500 ${Math.round(15 * k)}px "Zen Kaku Gothic New", sans-serif`; ctx.fillStyle = 'rgba(255,222,160,.95)';
      ctx.fillText(planetName(p), x + 9 * k, y + 5 * k);
      seen.push({ name: planetName(p), alt: h.alt, az: h.az, mag: m, kind: 'planet' });
    }
    // Moon, lit side toward the Sun
    const mh = S.bodyAltAz(A.Body.Moon, d, obs);
    if (mh.alt > -0.5) {
      const [x, y] = proj(mh.alt, mh.az), r = 11 * k;
      const ill = A.Illumination(A.Body.Moon, d).phase_fraction;
      const [sx, sy] = proj(Math.max(sun.alt, -80), sun.az);
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(sy - y, sx - x));
      const gg = ctx.createRadialGradient(0, 0, r, 0, 0, r * 6); gg.addColorStop(0, `rgba(230,236,248,${0.22 * ill})`); gg.addColorStop(1, 'rgba(230,236,248,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, r * 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(40,44,56,.95)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      const q = 2 * ill - 1; ctx.fillStyle = '#eef0f4'; ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false); ctx.ellipse(0, 0, Math.abs(q) * r, r, 0, Math.PI / 2, -Math.PI / 2, q > 0); ctx.fill();
      ctx.restore();
      ctx.font = `500 ${Math.round(15 * k)}px "Zen Kaku Gothic New", sans-serif`; ctx.fillStyle = 'rgba(232,236,244,.92)'; ctx.fillText(t('moon'), x + r + 7 * k, y + 5 * k);
      seen.unshift({ name: t('moon'), alt: mh.alt, az: mh.az, kind: 'moon', ill });
    }
    // Starlink trains, if one is up and lit right now
    if (TR) for (const c of TR.active(d)) for (const sat of c.members) {
      const lk = S.satLook(sat, d, obs); if (!lk || lk.alt < 0 || !lk.sunlit || sun.alt > -6) continue;
      const [x, y] = proj(lk.alt, lk.az); ctx.fillStyle = 'rgba(236,244,255,.95)'; ctx.beginPath(); ctx.arc(x, y, 1.8 * k, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // rim, altitude rings, cardinal points
    ctx.strokeStyle = 'rgba(160,178,215,.12)'; ctx.lineWidth = 1.2 * k;
    for (const a of [30, 60]) { const r = R * Math.tan((90 - a) * D2R / 2); ctx.beginPath(); ctx.arc(CX, CY, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(200,212,238,.45)'; ctx.lineWidth = 1.6 * k; ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(214,222,240,.85)'; ctx.font = `500 ${Math.round(16 * k)}px "Zen Kaku Gothic New", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [key, az] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) { const x = CX - (R + 22 * k) * Math.sin(az * D2R), y = CY - (R + 22 * k) * Math.cos(az * D2R); ctx.fillText(t(key), x, y); }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    return { seen, sky };
  }

  // ---- the whole picture ----
  function render(W = 1080, H = 1920, og = false) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const d = new Date(st.t);
    const portrait = H > W;
    // background: deep night, a faint glow behind the disc
    const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#05070d'); bg.addColorStop(1, '#020308');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const pad = portrait ? 84 : 64;
    const R = portrait ? 440 : 258;
    const CX = portrait ? W / 2 : W - pad - R - 36, CY = portrait ? 860 : H / 2 + 6;
    const glow = ctx.createRadialGradient(CX, CY, R * 0.7, CX, CY, R * 1.5); glow.addColorStop(0, 'rgba(60,80,130,.16)'); glow.addColorStop(1, 'rgba(60,80,130,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    const { seen } = drawSky(ctx, CX, CY, R, d);

    // text
    const gold = '#f2c46d', ink = '#eef1f6', muted = 'rgba(190,198,215,.78)', faint = 'rgba(140,150,172,.7)';
    const date = new Intl.DateTimeFormat(JA ? 'ja-JP' : 'en-GB', { month: JA ? 'numeric' : 'long', day: 'numeric', weekday: 'short', timeZone: TZ }).format(d);
    const time = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ }).format(d);
    const place = st.place && st.place.id !== 'here' && st.place.id !== 'custom' ? placeName(st.place) : '';
    ctx.textBaseline = 'alphabetic';
    const tx = pad, ty = portrait ? 150 : 118;
    ctx.fillStyle = gold; ctx.font = '500 26px "JetBrains Mono", monospace';
    spaced(ctx, 'ZENITH', tx, ty, 11);
    ctx.fillStyle = ink; ctx.font = `700 ${portrait ? 78 : 56}px "Shippori Mincho", serif`;
    ctx.fillText(og ? '今夜の空' : date, tx, ty + (portrait ? 104 : 82));
    ctx.font = `500 ${portrait ? 40 : 30}px "Zen Kaku Gothic New", sans-serif`; ctx.fillStyle = muted;
    ctx.fillText(og ? 'Tonight’s sky' : `${time}${place ? '  ·  ' + place : ''}`, tx, ty + (portrait ? 166 : 132));
    if (og) {
      ctx.font = '27px "Zen Kaku Gothic New", sans-serif'; ctx.fillStyle = muted;
      ['ISS・天宮・スターリンクの通過', '流星群の見ごろ', 'かざして星と衛星を調べる'].forEach((s, i) => ctx.fillText(s, tx, ty + 236 + i * 46));
    }

    // what is up
    const list = og ? [] : seen.filter(x => x.alt > 3).slice(0, 4);
    let ly = portrait ? CY + R + 128 : ty + 214;
    if (list.length) {
      ctx.font = '500 22px "JetBrains Mono", monospace'; ctx.fillStyle = faint; spaced(ctx, t('shareVisible').toUpperCase(), tx, ly, JA ? 4 : 5);
      ly += portrait ? 64 : 52;
      const colW = portrait ? (W - pad * 2) / 2 : 360;
      list.forEach((x, i) => {
        const cx = portrait ? tx + (i % 2) * colW : tx, cy = portrait ? ly + Math.floor(i / 2) * 96 : ly + i * 78;
        ctx.fillStyle = x.kind === 'moon' ? '#e9ecf2' : '#ffe2aa'; ctx.beginPath(); ctx.arc(cx + 9, cy - 12, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = ink; ctx.font = `500 ${portrait ? 36 : 30}px "Zen Kaku Gothic New", sans-serif`; ctx.fillText(x.name, cx + 32, cy);
        ctx.fillStyle = muted; ctx.font = `${portrait ? 26 : 22}px "Zen Kaku Gothic New", sans-serif`;
        const sub = x.kind === 'moon' ? `${dirWord(x.az)} ${Math.round(x.alt)}° · ${t('litPct', Math.round(x.ill * 100))}` : `${dirWord(x.az)} ${Math.round(x.alt)}° · ${JA ? magT(x.mag) + '等' : 'mag ' + magT(x.mag)}`;
        ctx.fillText(sub, cx + 32, cy + (portrait ? 40 : 32));
      });
    }
    // footer
    ctx.fillStyle = faint; ctx.font = `${portrait ? 24 : 19}px "Zen Kaku Gothic New", sans-serif`;
    ctx.fillText(t('shareNote'), tx, H - (portrait ? 128 : 58));
    ctx.fillStyle = muted; ctx.font = `${portrait ? 26 : 20}px "JetBrains Mono", monospace`;
    ctx.fillText('ise-kk.github.io/zenith', tx, H - (portrait ? 84 : 28));
    return cv;
  }
  const dirWord = (az) => JA ? `${dir(az)}の空` : dir(az);
  function spaced(ctx, s, x, y, gap) { for (const ch of s) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + gap; } }

  function toast(msg, ms = 2200) { const el = document.getElementById('share-toast'); if (!el) return; el.textContent = msg; el.hidden = !msg; clearTimeout(toast.t); if (msg && ms) toast.t = setTimeout(() => { el.hidden = true; }, ms); }

  async function share() {
    try {
      toast(t('shareMaking'), 0);
      await fontsReady();
      const cv = render();
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      const d = new Date(st.t);
      const stamp = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ }).format(d);
      const file = new File([blob], `zenith-${stamp}.png`, { type: 'image/png' });
      const dateTxt = new Intl.DateTimeFormat(JA ? 'ja-JP' : 'en-GB', { month: JA ? 'numeric' : 'long', day: 'numeric', timeZone: TZ }).format(d);
      const data = { files: [file], title: 'Zenith', text: t('shareText', dateTxt) + '\nhttps://ise-kk.github.io/zenith/' };
      toast('');
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share(data); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(t('shareSaved'));
    } catch (e) {
      if (e && e.name === 'AbortError') { toast(''); return; } // the person closed the share sheet
      toast(t('shareFail'));
    }
  }
  return { share, render };
}
