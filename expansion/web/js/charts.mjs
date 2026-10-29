// Charts drawn from the calculated results (never typed-in values), in plain SVG.
// Method (dataviz skill): thin bars (≤ 24px) with 4px rounded data ends, square at the
// baseline; hairline solid grid; one axis; a legend whenever there are two or more series;
// values labelled at the bar tips; a hover/focus tooltip on every bar; and a table view
// under every chart. Team colours follow the team, never its rank.
import { h, mc, m } from './ui.mjs';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v); for (const k of kids.flat()) if (k) el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); return el; };
export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
export const teamColor = (i) => SERIES[i % SERIES.length];

/** A bar whose data end is rounded (4px) and whose baseline end is square. */
function barPath(x0, x1, y, hgt) {
  const r = Math.min(4, Math.abs(x1 - x0) / 2, hgt / 2);
  if (x1 >= x0) return `M${x0},${y} H${x1 - r} Q${x1},${y} ${x1},${y + r} V${y + hgt - r} Q${x1},${y + hgt} ${x1 - r},${y + hgt} H${x0} Z`;
  return `M${x0},${y} H${x1 + r} Q${x1},${y} ${x1},${y + r} V${y + hgt - r} Q${x1},${y + hgt} ${x1 + r},${y + hgt} H${x0} Z`;
}
function niceStep(max) { const raw = max / 4; const p = 10 ** Math.floor(Math.log10(raw || 1)); const n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

/**
 * Horizontal grouped bars.
 * items: [{ label, values: [number per series] }]; series: [{ name, color }]
 * fmt: value → label text (default compact money). Negative values extend left of zero.
 */
export function barChart({ title = null, items, series, fmt = mc, fmtFull = m, unit = '', height = 18, gap = 2, labelW = 130, mark = null }) {
  const root = h('div', { class: 'chart' });
  if (title) root.appendChild(h('h3', {}, title));
  if (series.length > 1) root.appendChild(h('div', { class: 'legend' }, series.map((sr) => h('span', {}, h('span', { class: 'sw', style: { background: sr.color } }), sr.name))));
  const W = 620; const valW = 84;
  const all = items.flatMap((i) => i.values).filter((v) => Number.isFinite(v));
  const hasNeg = all.some((v) => v < 0);
  const maxAbs = Math.max(1, ...all.map(Math.abs), mark ? Math.abs(mark.value) : 0);
  const step = niceStep(maxAbs);
  const top = Math.ceil(maxAbs / step) * step;
  const plotW = W - labelW - valW;
  const lo = hasNeg ? -top : 0;
  const x = (v) => labelW + ((v - lo) / (top - lo)) * plotW;
  const groupH = series.length * (height + gap) + 12;
  const H = items.length * groupH + 26;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': title || 'Chart' });
  const grid = s('g', { class: 'grid' });
  for (let v = lo; v <= top + 1e-9; v += step) {
    grid.appendChild(s('line', { x1: x(v), x2: x(v), y1: 4, y2: H - 20 }));
    grid.appendChild(s('text', { x: x(v), y: H - 6, 'text-anchor': 'middle' }, fmt(v)));
  }
  svg.appendChild(grid);
  svg.appendChild(s('g', { class: 'axis' }, s('line', { x1: x(0), x2: x(0), y1: 4, y2: H - 20 })));
  if (mark) {
    svg.appendChild(s('line', { x1: x(mark.value), x2: x(mark.value), y1: 4, y2: H - 20, stroke: 'var(--ink-2)', 'stroke-width': 1 }));
    svg.appendChild(s('text', { x: x(mark.value) + 4, y: 12 }, mark.label));
  }
  const tip = h('div', { class: 'tip hidden' });
  items.forEach((it, gi) => {
    const gy = 6 + gi * groupH;
    svg.appendChild(s('text', { x: labelW - 8, y: gy + (series.length * (height + gap)) / 2 + 4, 'text-anchor': 'end' }, it.label.length > 24 ? `${it.label.slice(0, 23)}…` : it.label));
    it.values.forEach((v, si) => {
      if (!Number.isFinite(v) || v === 0) return; // zero and n/a stay in the tooltip-free table view
      const y = gy + si * (height + gap);
      const p = s('path', { d: barPath(x(0), x(v), y, height), fill: series[si].color, class: 'mark', tabindex: 0, 'aria-label': `${it.label}, ${series[si].name}: ${fmtFull(v)}` });
      const show = (ev) => {
        tip.replaceChildren(h('div', { class: 'tv' }, `${fmtFull(v)}${unit}`), h('div', { class: 'tr' }, h('span', { class: 'key', style: { background: series[si].color } }), `${series[si].name} · ${it.label}`));
        tip.classList.remove('hidden');
        const r = root.getBoundingClientRect();
        const bx = ev?.clientX ? ev.clientX - r.left : (x(v) / W) * r.width;
        const by = ev?.clientY ? ev.clientY - r.top : (y / H) * r.height;
        tip.style.left = `${Math.min(r.width - 170, bx + 12)}px`; tip.style.top = `${by - 10}px`;
      };
      p.addEventListener('pointermove', show); p.addEventListener('focus', show);
      p.addEventListener('pointerleave', () => tip.classList.add('hidden')); p.addEventListener('blur', () => tip.classList.add('hidden'));
      svg.appendChild(p);
      // value at the tip, in text ink (never the series colour)
      const tx = v >= 0 ? Math.max(x(v), x(0)) + 5 : Math.min(x(v), x(0)) - 5;
      svg.appendChild(s('text', { x: hasNeg ? tx : x(v) + 5, y: y + height / 2 + 4, class: 'val', 'text-anchor': v < 0 && hasNeg ? 'end' : 'start' }, `${fmt(v)}${unit}`));
    });
  });
  root.appendChild(svg);
  root.appendChild(tip);
  root.appendChild(tableView(items, series, fmtFull, unit));
  return root;
}

/** Stacked horizontal bars (counts), e.g. compliance status per team. */
export function stackedChart({ title = null, items, series, height = 20 }) {
  const root = h('div', { class: 'chart' });
  if (title) root.appendChild(h('h3', {}, title));
  root.appendChild(h('div', { class: 'legend' }, series.map((sr) => h('span', {}, h('span', { class: 'sw', style: { background: sr.color } }), sr.name))));
  const W = 620; const labelW = 130; const plotW = W - labelW - 50;
  const max = Math.max(1, ...items.map((i) => i.values.reduce((a, b) => a + b, 0)));
  const H = items.length * (height + 12) + 8;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': title || 'Chart' });
  const tip = h('div', { class: 'tip hidden' });
  items.forEach((it, i) => {
    const y = 4 + i * (height + 12);
    svg.appendChild(s('text', { x: labelW - 8, y: y + height / 2 + 4, 'text-anchor': 'end' }, it.label));
    let acc = 0;
    const total = it.values.reduce((a, b) => a + b, 0);
    it.values.forEach((v, si) => {
      if (!v) return;
      const x0 = labelW + (acc / max) * plotW; const w = (v / max) * plotW;
      acc += v;
      const r = s('rect', { x: x0, y, width: Math.max(0.5, w - 2), height, fill: series[si].color, class: 'mark', tabindex: 0, 'aria-label': `${it.label}, ${series[si].name}: ${v}` });
      const show = (ev) => {
        tip.replaceChildren(h('div', { class: 'tv' }, `${v} of ${total}`), h('div', { class: 'tr' }, h('span', { class: 'key', style: { background: series[si].color } }), `${series[si].name} · ${it.label}`));
        tip.classList.remove('hidden');
        const b = root.getBoundingClientRect();
        tip.style.left = `${Math.min(b.width - 170, (ev?.clientX ? ev.clientX - b.left : ((x0 + w / 2) / W) * b.width) + 12)}px`; tip.style.top = `${(ev?.clientY ? ev.clientY - b.top : (y / H) * b.height) - 10}px`;
      };
      r.addEventListener('pointermove', show); r.addEventListener('focus', show);
      r.addEventListener('pointerleave', () => tip.classList.add('hidden')); r.addEventListener('blur', () => tip.classList.add('hidden'));
      svg.appendChild(r);
    });
    svg.appendChild(s('text', { x: labelW + (total / max) * plotW + 6, y: y + height / 2 + 4, class: 'val' }, String(total)));
  });
  root.appendChild(svg);
  root.appendChild(tip);
  root.appendChild(tableView(items, series, (v) => String(v), ''));
  return root;
}

function tableView(items, series, fmt, unit) {
  return h('details', { class: 'tableview' }, h('summary', {}, 'Show as a table'),
    h('div', { class: 'tablewrap' }, h('table', { class: 't' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), series.map((sr) => h('th', { class: 'num' }, sr.name)))),
      h('tbody', {}, items.map((it) => h('tr', {}, h('td', {}, it.label), it.values.map((v) => h('td', { class: 'num' }, Number.isFinite(v) ? `${fmt(v)}${unit}` : 'n/a'))))))));
}
