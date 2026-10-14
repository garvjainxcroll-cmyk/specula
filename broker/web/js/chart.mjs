// Charts on <canvas>: a full line chart (price or net worth) with a crosshair, tooltip,
// keyboard reading and a reference line; and small sparklines for lists.
// One series per chart, so no legend: the title says what is plotted. The line is
// coloured by direction over the range, and the numbers beside it carry the sign.
import { h } from './dom.mjs';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const FONT = '"EB Garamond", Garamond, Georgia, serif';

function hexA(color, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
const toneColor = (tone) => css(tone === 'up' ? '--up' : tone === 'down' ? '--down' : '--gold');

function niceStep(span, n = 4) {
  const raw = span / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

function fit(canvas) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = Math.max(1, Math.round(r.width * dpr)); const hh = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W: r.width, H: r.height };
}

/**
 * A line chart in `box`. set({ xs, ws, ys, ref, refLabel, tone, label }) draws it.
 * xs place the points (market time), ws label them (clock time), ys are paise.
 */
export function lineChart(box, { fmtY, fmtX, fmtTip = fmtX } = {}) {
  const canvas = h('canvas', { tabindex: '0', role: 'img' });
  const tip = h('div', { class: 'chart-tip' });
  const halo = h('div', { class: 'chart-halo' });
  box.append(canvas, halo, tip);
  let d = null; let hover = -1; let geom = null;

  function draw() {
    if (!d || !d.ys.length) return;
    const { ctx, W, H } = fit(canvas);
    ctx.clearRect(0, 0, W, H);
    const padL = 6; const padR = W < 420 ? 64 : 82; const padT = 14; const padB = 26;
    const pw = W - padL - padR; const ph = H - padT - padB;
    let lo = Math.min(...d.ys); let hi = Math.max(...d.ys);
    if (d.ref != null && d.refFit) { lo = Math.min(lo, d.ref); hi = Math.max(hi, d.ref); }
    if (hi - lo < hi * 0.002) { const mid = (hi + lo) / 2; lo = mid * 0.997; hi = mid * 1.003; }
    const padY = (hi - lo) * 0.1; lo -= padY; hi += padY;
    const x0 = d.xs[0]; const x1 = Math.max(d.xs[d.xs.length - 1], x0 + 1); // market time can be exactly 0
    const X = (x) => padL + ((x - x0) / Math.max(1, x1 - x0)) * pw;
    const Y = (y) => padT + (1 - (y - lo) / (hi - lo)) * ph;
    geom = { X, Y, padL, pw };
    const line = toneColor(d.tone); const muted = css('--ink-muted'); const grid = css('--line-soft');
    const surface = css('--surface-raised') || css('--surface');

    // grid and y labels (right side)
    ctx.font = `14px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const step = niceStep(hi - lo);
    ctx.lineWidth = 1; ctx.strokeStyle = grid; ctx.fillStyle = muted;
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + pw, y); ctx.stroke();
      ctx.fillText(fmtY(v), padL + pw + 8, y);
    }
    // x labels
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';
    const n = Math.max(2, Math.min(6, Math.floor(pw / 110)));
    let lastRight = -Infinity;
    for (let k = 0; k <= n; k++) {
      const i = Math.round((k / n) * (d.xs.length - 1));
      const txt = fmtX(d.ws[i]); const tw = ctx.measureText(txt).width;
      let x = X(d.xs[i]); x = Math.min(Math.max(x, padL + tw / 2), padL + pw - tw / 2);
      if (x - tw / 2 < lastRight + 12) continue;
      ctx.fillText(txt, x, H - 6); lastRight = x + tw / 2;
    }
    // reference line (open price / starting money)
    if (d.ref != null && d.ref >= lo && d.ref <= hi) {
      const y = Math.round(Y(d.ref)) + 0.5;
      ctx.strokeStyle = hexA(css('--gold'), 0.55); ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + pw, y); ctx.stroke(); ctx.setLineDash([]);
      if (d.refLabel) { ctx.fillStyle = css('--gold-text'); ctx.textAlign = 'left'; ctx.font = `13px ${FONT}`; ctx.fillText(d.refLabel, padL + 4, y - 5); }
    }
    // area wash + line
    ctx.beginPath();
    d.ys.forEach((v, i) => { const x = X(d.xs[i]); const y = Y(v); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.save();
    ctx.lineTo(X(d.xs[d.xs.length - 1]), padT + ph); ctx.lineTo(X(d.xs[0]), padT + ph); ctx.closePath();
    const g = ctx.createLinearGradient(0, padT, 0, padT + ph);
    g.addColorStop(0, hexA(line, 0.18)); g.addColorStop(1, hexA(line, 0));
    ctx.fillStyle = g; ctx.fill(); ctx.restore();
    ctx.beginPath();
    d.ys.forEach((v, i) => { const x = X(d.xs[i]); const y = Y(v); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    // end dot with a surface ring, and the live halo
    const ex = X(d.xs[d.xs.length - 1]); const ey = Y(d.ys[d.ys.length - 1]);
    dot(ctx, ex, ey, line, surface);
    halo.style.left = `${ex}px`; halo.style.top = `${ey}px`; halo.style.color = line;
    halo.style.display = d.live ? 'block' : 'none';
    // crosshair
    if (hover >= 0 && hover < d.ys.length) {
      const hx = Math.round(X(d.xs[hover])) + 0.5; const hy = Y(d.ys[hover]);
      ctx.strokeStyle = css('--gold'); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, padT + ph); ctx.stroke();
      dot(ctx, hx, hy, line, surface);
      tip.replaceChildren(h('b', { text: fmtY(d.ys[hover], true) }), h('span', { text: fmtTip(d.ws[hover]) }));
      tip.style.display = 'block';
      const tw = tip.offsetWidth;
      tip.style.left = `${hx + 14 + tw > W ? hx - 14 - tw : hx + 14}px`;
    } else tip.style.display = 'none';
  }
  function dot(ctx, x, y, fill, ring) {
    ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  }
  function pick(clientX) {
    if (!d || !geom) return -1;
    const r = canvas.getBoundingClientRect();
    const px = clientX - r.left;
    let best = 0; let bd = Infinity;
    for (let i = 0; i < d.xs.length; i++) { const dd = Math.abs(geom.X(d.xs[i]) - px); if (dd < bd) { bd = dd; best = i; } }
    return best;
  }
  canvas.addEventListener('pointermove', (e) => { hover = pick(e.clientX); draw(); });
  canvas.addEventListener('pointerdown', (e) => { hover = pick(e.clientX); draw(); });
  canvas.addEventListener('pointerleave', () => { hover = -1; draw(); });
  canvas.addEventListener('blur', () => { hover = -1; draw(); });
  canvas.addEventListener('keydown', (e) => {
    if (!d) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (hover < 0) hover = d.ys.length - 1;
      hover = Math.max(0, Math.min(d.ys.length - 1, hover + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1)));
      draw();
    } else if (e.key === 'Escape') { hover = -1; draw(); }
  });
  const ro = new ResizeObserver(() => draw());
  ro.observe(box);
  const onTheme = () => draw();
  window.addEventListener('themechange', onTheme);
  return {
    set(next) {
      const keepEnd = hover >= 0 && d && hover === d.ys.length - 1;
      d = next;
      if (hover >= d.ys.length || keepEnd) hover = keepEnd ? d.ys.length - 1 : -1;
      canvas.setAttribute('aria-label', next.label || 'Chart');
      draw();
    },
    destroy() { ro.disconnect(); window.removeEventListener('themechange', onTheme); },
  };
}

/** A small line in a canvas: ys are any numbers; tone 'up' | 'down' | 'flat'. */
export function spark(canvas, ys, tone, ref = null) {
  if (!canvas.isConnected || !ys || ys.length < 2) return;
  const { ctx, W, H } = fit(canvas);
  ctx.clearRect(0, 0, W, H);
  let lo = Math.min(...ys); let hi = Math.max(...ys);
  if (ref != null) { lo = Math.min(lo, ref); hi = Math.max(hi, ref); }
  if (hi - lo < hi * 0.001) { lo -= hi * 0.0005; hi += hi * 0.0005; }
  const X = (i) => 1 + (i / (ys.length - 1)) * (W - 4);
  const Y = (v) => 2 + (1 - (v - lo) / (hi - lo)) * (H - 4);
  const line = toneColor(tone);
  if (ref != null) {
    ctx.strokeStyle = hexA(css('--gold'), 0.35); ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(0, Math.round(Y(ref)) + 0.5); ctx.lineTo(W, Math.round(Y(ref)) + 0.5); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.beginPath();
  ys.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
  ctx.strokeStyle = line; ctx.lineWidth = 1.75; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  ctx.lineTo(X(ys.length - 1), H); ctx.lineTo(X(0), H); ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, hexA(line, 0.16)); g.addColorStop(1, hexA(line, 0));
  ctx.fillStyle = g; ctx.fill();
}
