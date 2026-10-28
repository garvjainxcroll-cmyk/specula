// One small SVG line chart, used by both pages (inlined by the build).
// A single series: no legend, the title names it. Gold line, faint grid, an emphasised
// endpoint, a crosshair and tooltip on hover, arrow keys move the crosshair.

const SVGNS = 'http://www.w3.org/2000/svg';

// Colours given as var(--token) go into style, where every browser resolves them.
function el(name, attrs, parent) {
  const n = document.createElementNS(SVGNS, name);
  let style = '';
  for (const k in attrs) {
    if (String(attrs[k]).startsWith('var(')) style += `${k}:${attrs[k]};`;
    else n.setAttribute(k, attrs[k]);
  }
  if (style) n.setAttribute('style', style);
  if (parent) parent.appendChild(n);
  return n;
}

function niceStep(span, count) {
  const raw = span / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
}

// points: [{x, y}] in order; opts: { height, xMax, fmtY(y), tipTitle(pt), tipBody(pt), ticks: [{x, label}], ref: y|null, refLabel }
export function lineChart(box, points, opts) {
  box.textContent = '';
  box.classList.add('chart');
  const W = Math.max(260, box.clientWidth || 600);
  const H = opts.height || 220;
  const pad = { l: 8, r: opts.compact ? 8 : 64, t: 12, b: opts.compact ? 8 : 26 };
  const ys = points.map((p) => p.y).concat(opts.ref != null ? [opts.ref] : []);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi - lo < hi * 0.02) { const mid = (hi + lo) / 2; lo = mid * 0.985; hi = mid * 1.015; }
  const step = niceStep(hi - lo, 4);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const xMax = Math.max(1, opts.xMax ?? points[points.length - 1].x);
  const X = (x) => pad.l + (x / xMax) * (W - pad.l - pad.r);
  const Y = (y) => pad.t + (1 - (y - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, height: H, role: 'img', 'aria-label': opts.label || 'Price chart' }, box);
  const defs = el('defs', {}, svg);
  const gid = 'g' + Math.random().toString(36).slice(2, 8);
  const grad = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: '0%', 'stop-color': 'var(--gold)', 'stop-opacity': 0.22 }, grad);
  el('stop', { offset: '100%', 'stop-color': 'var(--gold)', 'stop-opacity': 0 }, grad);

  if (!opts.compact) {
    for (let v = lo; v <= hi + step / 2; v += step) {
      const y = Y(v);
      el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: 'var(--line)', 'stroke-width': 1 }, svg);
      const t = el('text', { x: W - pad.r + 8, y: y + 4, fill: 'var(--muted)', 'font-size': 11 }, svg);
      t.textContent = opts.fmtY(v);
    }
    for (const tk of opts.ticks || []) {
      const x = X(tk.x);
      el('line', { x1: x, x2: x, y1: pad.t, y2: H - pad.b, stroke: 'var(--line)', 'stroke-width': 1, 'stroke-dasharray': '2 4' }, svg);
      const t = el('text', { x: x + 4, y: H - 8, fill: 'var(--muted)', 'font-size': 11 }, svg);
      t.textContent = tk.label;
    }
  }
  if (opts.ref != null) {
    el('line', { x1: pad.l, x2: W - pad.r, y1: Y(opts.ref), y2: Y(opts.ref), stroke: 'var(--muted)', 'stroke-width': 1, 'stroke-dasharray': '4 4', opacity: 0.7 }, svg);
  }

  const d = points.map((p, i) => (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1)).join(' ');
  if (points.length > 1) {
    const last = points[points.length - 1];
    el('path', { d: `${d} L${X(last.x).toFixed(1)} ${H - pad.b} L${X(points[0].x).toFixed(1)} ${H - pad.b} Z`, fill: `url(#${gid})` }, svg);
  }
  el('path', { d, fill: 'none', stroke: 'var(--gold)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
  const end = points[points.length - 1];
  el('circle', { cx: X(end.x), cy: Y(end.y), r: 4.5, fill: 'var(--gold)', stroke: 'var(--panel)', 'stroke-width': 2 }, svg);

  if (opts.compact) return;

  // hover layer
  const hair = el('line', { y1: pad.t, y2: H - pad.b, stroke: 'var(--muted)', 'stroke-width': 1, visibility: 'hidden' }, svg);
  const dot = el('circle', { r: 5, fill: 'var(--gold)', stroke: 'var(--panel)', 'stroke-width': 2, visibility: 'hidden' }, svg);
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  box.appendChild(tip);
  let at = points.length - 1;
  const show = (i) => {
    at = Math.max(0, Math.min(points.length - 1, i));
    const p = points[at];
    hair.setAttribute('x1', X(p.x)); hair.setAttribute('x2', X(p.x)); hair.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', X(p.x)); dot.setAttribute('cy', Y(p.y)); dot.setAttribute('visibility', 'visible');
    tip.textContent = '';
    const s = document.createElement('strong');
    s.textContent = opts.tipTitle(p);
    const b = document.createElement('span');
    b.textContent = opts.tipBody(p);
    b.className = 'muted';
    tip.append(s, b);
    tip.hidden = false;
    const left = Math.min(Math.max(0, X(p.x) - tip.offsetWidth / 2), W - tip.offsetWidth);
    tip.style.left = left + 'px';
    tip.style.top = Math.max(0, Y(p.y) - tip.offsetHeight - 14) + 'px';
  };
  const hide = () => { hair.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  const nearest = (clientX) => {
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    points.forEach((p, i) => { const dd = Math.abs(X(p.x) - x); if (dd < bd) { bd = dd; best = i; } });
    return best;
  };
  svg.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  svg.addEventListener('pointerleave', hide);
  box.tabIndex = 0;
  box.addEventListener('focus', () => show(at));
  box.addEventListener('blur', hide);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { show(at - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { show(at + 1); e.preventDefault(); }
  });
}
