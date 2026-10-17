// "Show working": every number a team sees can be opened and checked with a calculator.
import { h, sheet, calc, steps, termTable, money, pct, fmtCr, fmtRupees, fmtNum, fmtSigned, fmtPrice, fmtTerm, lineChart } from './ui.mjs';
import { ECONOMIES, ECON_ORDER, SPECIALS } from '../src/config/economies.mjs';
import { INST, INSTRUMENTS, FAMILIES, RISK_FAMILIES } from '../src/config/instruments.mjs';
import { RULES, FORECAST_VARS } from '../src/config/rules.mjs';
import { explainInstrument } from '../src/config/explain.mjs';
import { r2, r4 } from '../src/engine/num.mjs';
import { fundStats } from '../src/engine/scoring.mjs';

export const FIG = {
  g: { label: 'Growth', unit: '%', dp: 1 }, pi: { label: 'Inflation', unit: '%', dp: 1 }, u: { label: 'Unemployment', unit: '%', dp: 1 },
  i: { label: 'Policy rate', unit: '%', dp: 2 }, b: { label: 'Budget balance', unit: '% of GDP', dp: 1 }, ca: { label: 'Current account', unit: '% of GDP', dp: 1 },
  debt: { label: 'Debt to GDP', unit: '%', dp: 1 },
};

export function forecastQuestion(spec) {
  if (!spec) return '';
  const v = FORECAST_VARS[spec.v];
  return `${ECONOMIES[spec.econ].name}’s ${v.label} in the next release`;
}

// ---------------- data release ----------------

export function releaseTable(release, { prev = null, compact = false, onFigure = null } = {}) {
  const rows = ['g', 'pi', 'u', 'i', 'b', 'ca', 'debt'];
  const head = h('tr', {}, h('th', {}, ''), ECON_ORDER.map((e) => h('th', { class: 'r' }, compact ? e : ECONOMIES[e].name)));
  const body = rows.map((k) => h('tr', {}, h('td', { class: 'muted' }, FIG[k].label, k === 'b' || k === 'ca' ? h('span', { class: 'tiny' }, ' % GDP') : ''),
    ECON_ORDER.map((e) => {
      const r = release.econ[e];
      const v = r[k];
      const exp = r.exp?.[k];
      const was = prev?.econ?.[e]?.[k];
      const surprise = exp !== undefined && k !== 'i' ? r2(v - exp) : null;
      const cell = h('td', { class: 'r num' },
        h('div', { style: { fontWeight: 600 } }, fmtNum(v, FIG[k].dp)),
        surprise !== null && surprise !== 0 ? h('div', { class: `tiny ${surprise > 0 ? 'up' : 'down'}`, title: 'Compared with what forecasters expected' }, `exp ${fmtNum(exp, 1)}`) : null,
        r.revisions || release.revisions?.some((x) => x.econ === e && x.key === k) ? h('div', { class: 'tiny warn' }, 'revised') : null,
        was !== undefined && k === 'i' && was !== v ? h('div', { class: 'tiny muted' }, `was ${fmtNum(was)}`) : null);
      if (onFigure && r.work?.[k]) { cell.style.cursor = 'pointer'; cell.title = 'Show how this figure was worked out'; cell.addEventListener('click', () => onFigure(e, k)); }
      return cell;
    })));
  const specials = ECON_ORDER.flatMap((e) => SPECIALS[e].map((sp) => ({ e, sp })));
  const spRows = specials.map(({ e, sp }) => {
    const v = release.econ[e].special?.[sp.key];
    return h('tr', { class: 'sub' }, h('td', {}, `${ECONOMIES[e].name}: ${sp.label}`), ECON_ORDER.map((x) => h('td', { class: 'r num' }, x === e ? `${fmtNum(v, sp.dp)}${sp.unit && sp.unit.length < 5 ? ' ' + sp.unit : ''}` : '')));
  });
  return h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', {}, head), h('tbody', {}, body, compact ? null : spRows)));
}

export function figureSheet(e, k, release) {
  const r = release.econ[e];
  const w = r.work?.[k];
  const f = FIG[k] || { label: k, unit: '', dp: 1 };
  const body = h('div', { class: 'stack' },
    h('p', {}, `How ${ECONOMIES[e].name}’s ${f.label.toLowerCase()} for this release was worked out. Every term is rounded to two decimals, added up, and the total rounded to ${f.dp} decimal${f.dp === 1 ? '' : 's'}.`),
    w ? termTable(w.terms, { result: w.raw, resultLabel: 'Total before rounding', unit: '', dp: 2 }) : h('p', { class: 'muted' }, 'This is a starting figure from the guide.'),
    w ? h('p', {}, h('b', {}, `Published: ${fmtNum(w.value, f.dp)}${f.unit === '%' ? '%' : ''}`)) : null,
    r.exp?.[k] !== undefined ? h('p', { class: 'muted' }, `Forecasters expected ${fmtNum(r.exp[k], f.dp)} — everything above except this round’s news. The difference is the surprise.`) : null,
    revisionsFor(release, e, k));
  sheet(`${ECONOMIES[e].name}: ${f.label}`, body, { eyebrow: `Data release · Round ${release.q}` });
}
function revisionsFor(release, e, k) {
  const rv = (release.revisions || []).filter((x) => x.econ === e && x.key === k);
  if (!rv.length) return null;
  return h('div', { class: 'crisis-banner' }, rv.map((x) => h('p', {}, `Revised during “${x.label}”: ${fmtNum(x.from, 1)} → ${fmtNum(x.to, 1)} (${fmtSigned(x.by, 1)}).`)));
}

// ---------------- central bank rules ----------------

/** The rule with this round's figures filled in, but not worked out (that is the team's job). */
export function ruleCard(e, qdoc) {
  const c = ECONOMIES[e];
  const rel = qdoc.release.econ[e];
  const mods = qdoc.round?.mods?.[e];
  const R = { ...c.rule, ...(mods || {}) };
  const x = r2(rel.g - c.trend);
  const lines = [
    h('div', { class: 'small' }, qdoc.rules[e].rule),
    h('div', { class: 'small muted' }, qdoc.rules[e].smoothing),
    h('div', { class: 'small' }, 'This quarter: ',
      `inflation ${fmtNum(rel.pi, 1)}%, target ${fmtNum(c.target, 1)}%, growth ${fmtNum(rel.g, 1)}% against trend ${fmtNum(c.trend, 1)}% (gap ${fmtSigned(x)})`,
      e === 'KES' ? `, reserves ₵${Math.round(rel.special.reserves)} bn` : '',
      `, last rate ${fmtNum(rel.i)}%.`),
  ];
  if (mods && Object.keys(mods).length) lines.push(h('div', { class: 'small warn' }, `Crisis change in force for this round: ${modText(mods)}`));
  return h('div', { class: 'panel' }, h('div', { class: 'eyebrow' }, `${c.name} · central bank rule`), lines);
}
export function modText(m) {
  const parts = [];
  if (m.a !== undefined) parts.push(`inflation weight ${m.a}`);
  if (m.b !== undefined) parts.push(`growth weight ${m.b}`);
  if (m.add) parts.push(`emergency ${m.add > 0 ? '+' : '−'}${fmtNum(Math.abs(m.add))}%`);
  if (m.cap10 !== undefined) parts.push(`10-year yield capped at ${fmtNum(m.cap10)}%`);
  if (m.band !== undefined) parts.push(`currency band ±${m.band}%`);
  return parts.join(', ') || 'none';
}

export function decisionSheet(d) {
  const c = ECONOMIES[d.econ];
  sheet(`${c.name}: ${fmtNum(d.iOld)}% → ${fmtNum(d.iNew)}%`, h('div', { class: 'stack' },
    h('p', { class: 'small' }, d.rule),
    termTable(d.terms, { result: d.target, resultLabel: 'Target rate', dp: 2 }),
    steps(d.steps),
    h('p', { class: 'muted small' }, d.change > 0 ? `${c.name} raised its rate by ${fmtNum(d.change)}%.` : d.change < 0 ? `${c.name} cut its rate by ${fmtNum(-d.change)}%.` : `${c.name} left its rate unchanged.`)),
  { eyebrow: 'Central bank decision' });
}

export function decisionsRow(decisions, onOpen) {
  return h('div', { class: 'grid g6' }, ECON_ORDER.map((e) => {
    const d = decisions[e];
    return h('button', { class: 'kpi click', style: { textAlign: 'left' }, onclick: () => (onOpen || decisionSheet)(d) },
      h('div', { class: 'k' }, ECONOMIES[e].name), h('div', { class: 'v num' }, `${fmtNum(d.iNew)}%`),
      h('div', { class: `s ${d.change > 0 ? 'up' : d.change < 0 ? 'down' : ''}` }, d.change ? `${fmtSigned(d.change)} · show working` : 'unchanged · show working'));
  }));
}

// ---------------- prices: why did they move? ----------------

/** Rupee move of an instrument through a quarter: crises (epochs) then settlement. */
export function quarterMoves(result) {
  const out = {};
  for (const x of INSTRUMENTS) {
    const segs = [];
    for (const ep of result.epochs || []) if (ep.rets?.[x.id]) segs.push({ label: ep.label, ret: ep.rets[x.id] });
    if (result.rets?.[x.id]) segs.push({ label: 'Settlement', ret: result.rets[x.id] });
    let total;
    if (x.kind === 'future' || x.kind === 'cds') total = r2(segs.reduce((a, s) => a + (s.ret.points || 0), 0));
    else total = r2((segs.reduce((a, s) => a * (1 + (s.ret.local.pct || 0) / 100) * (1 + (s.ret.fx?.pct || 0) / 100), 1) - 1) * 100);
    out[x.id] = { id: x.id, segs, total, points: x.kind === 'future' || x.kind === 'cds' };
  }
  return out;
}

export function moveExplain(m) {
  const x = INST[m.id];
  return h('div', { class: 'stack' }, m.segs.map((s) => h('div', { class: 'explain-box' },
    h('div', { class: 'eyebrow' }, s.label === 'Settlement' ? 'At settlement' : `Crisis: ${s.label}`),
    s.ret.local.drivers?.length ? h('div', { class: 'working' }, s.ret.local.drivers.map((d) => h('div', { class: 'line' }, h('span', { class: 'lbl' }, d.label), h('span', { class: 'expr num' }, m.points ? `${fmtSigned(d.value, 2)} points` : `${fmtSigned(d.value)}%`))),
      h('div', { class: 'line result' }, h('span', {}, x.ccy ? `Price in ${ECONOMIES[x.ccy].currencyPlural}` : 'Price'), h('span', { class: 'num' }, m.points ? `${fmtSigned(s.ret.points ?? 0, 2)} points` : `${fmtSigned(s.ret.local.pct)}%`))) : h('p', { class: 'muted small' }, 'No change.'),
    s.ret.yieldChange ? yieldParts(s.ret.yieldChange) : null,
    s.ret.fx ? h('p', { class: 'small' }, `Currency: the ${ECONOMIES[s.ret.fx.ccy].currency} moved ${fmtSigned(s.ret.fx.pct)}% against the rupee.`) : null)));
}
function yieldParts(yc) {
  if (!yc.parts?.length) return null;
  return h('div', { class: 'small' }, h('p', { class: 'muted' }, `The yield went from ${fmtNum(yc.from)}% to ${fmtNum(yc.to)}% (${fmtSigned(r2(yc.to - yc.from))}). Where that came from:`),
    h('ul', {}, yc.parts.map((p) => h('li', {}, `${p.label}: ${fmtSigned(p.change)}`))));
}

/** The "Why did prices move?" panel for one settled round. */
export function whyPanel(result, { limit = 12, onInst = null } = {}) {
  const moves = Object.values(quarterMoves(result)).filter((m) => m.total !== 0);
  moves.sort((a, b) => Math.abs(b.points ? b.total * 10 : b.total) - Math.abs(a.points ? a.total * 10 : a.total));
  const top = moves.slice(0, limit);
  const crowd = Object.entries(result.crowd || {}).sort((a, b) => Math.abs(b[1].pct) - Math.abs(a[1].pct)).slice(0, 6);
  return h('div', { class: 'stack' },
    h('p', { class: 'small muted' }, 'The biggest moves of the round and what caused each one. This explains what has already happened; it says nothing about what comes next.'),
    top.map((m) => {
      const x = INST[m.id];
      const lead = biggestCause(m);
      return h('div', { class: 'inst', onclick: () => (onInst ? onInst(m.id) : sheet(`Why ${x.name} moved`, moveExplain(m), { eyebrow: `Round ${result.q}` })) },
        h('div', {}, h('div', { class: 'nm' }, x.name), h('div', { class: 'meta' }, lead)),
        h('div', { class: 'px' }, m.points ? h('span', { class: `num ${m.total > 0 ? 'up' : 'down'}` }, `${fmtSigned(m.total)} pts`) : pct(m.total)));
    }),
    crowd.length ? h('div', { class: 'panel' }, h('div', { class: 'eyebrow' }, 'Crowd impact this round'),
      crowd.map(([id, c]) => h('p', { class: 'small' }, `${INST[id].name}: funds together ${c.net > 0 ? 'bought' : 'sold'} ${fmtCr(Math.abs(c.net), 0)} against a market depth of ₹${c.depth.toLocaleString('en-IN')} Cr, so everyone ${c.net > 0 ? 'buying' : 'selling'} paid ${fmtNum(Math.abs(c.pct))}% extra and anyone trading the other way gained ${fmtNum(Math.abs(c.pct))}%.`))) : null);
}
function biggestCause(m) {
  const all = m.segs.flatMap((s) => (s.ret.local.drivers || []).map((d) => ({ ...d, seg: s.label })));
  if (m.segs.some((s) => s.ret.defaulted)) return 'Default: protection paid out in full.';
  all.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const d = all.find((x) => x.key !== 'drift') || all[0];
  if (!d) return '';
  const fxs = m.segs.map((s) => s.ret.fx?.pct || 0).reduce((a, b) => a + b, 0);
  const extra = Math.abs(fxs) > Math.abs(d.value) ? ` · mostly the currency (${fmtSigned(fxs)}%)` : '';
  return `${d.seg === 'Settlement' ? '' : `${d.seg}: `}${d.label}${extra}`;
}

// ---------------- profit and loss ----------------

const segSum = (arr) => arr.reduce((a, p) => a + p.amount, 0);

export function pnlTable(ledger, { onLine = null } = {}) {
  const ids = Object.keys(ledger.byInst).sort((a, b) => Math.abs(lineTot(ledger.byInst[b])) - Math.abs(lineTot(ledger.byInst[a])));
  const rows = ids.map((id) => {
    const l = ledger.byInst[id];
    return h('tr', { class: 'click', onclick: () => (onLine || pnlSheet)(id, l) },
      h('td', {}, INST[id].short),
      h('td', { class: 'r' }, money(segSum(l.price))),
      h('td', { class: 'r hide-sm' }, money(segSum(l.currency))),
      h('td', { class: 'r hide-sm' }, money(l.carry)),
      h('td', { class: 'r hide-sm' }, money(-l.cost - l.forced + l.crowd)),
      h('td', { class: 'r' }, h('b', {}, money(lineTot(l)))));
  });
  const total = Object.values(ledger.byInst).reduce((a, l) => a + lineTot(l), 0) + ledger.cashInterest + ledger.auction + (ledger.loanInterest || 0);
  return h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Position'), h('th', { class: 'r' }, 'Price'), h('th', { class: 'r hide-sm' }, 'Currency'), h('th', { class: 'r hide-sm' }, 'Carry'), h('th', { class: 'r hide-sm' }, 'Costs'), h('th', { class: 'r' }, 'Total'))),
    h('tbody', {}, rows,
      h('tr', { class: 'click', onclick: () => cashSheet(ledger.cashInterestWork) }, h('td', {}, 'Cash interest'), h('td', { colspan: 4, class: 'hide-sm' }), h('td', { class: 'show-sm' }), h('td', { class: 'r' }, money(ledger.cashInterest))),
      ledger.loanInterest ? h('tr', { class: 'click', 'data-loan-line': '1', onclick: () => loanSheet(ledger.loanInterestWork) }, h('td', {}, 'Loan interest'), h('td', { colspan: 4, class: 'hide-sm' }), h('td', { class: 'show-sm' }), h('td', { class: 'r' }, money(ledger.loanInterest))) : null,
      ledger.auction ? h('tr', { class: 'click', onclick: () => auctionSheet(ledger.auctionWork) }, h('td', {}, 'Auction'), h('td', { colspan: 4, class: 'hide-sm' }), h('td', { class: 'show-sm' }), h('td', { class: 'r' }, money(ledger.auction))) : null,
      h('tr', { class: 'total' }, h('td', {}, 'Profit and loss'), h('td', { colspan: 4, class: 'hide-sm' }), h('td', { class: 'show-sm' }), h('td', { class: 'r' }, money(total))))));
}
export const lineTot = (l) => segSum(l.price) + segSum(l.currency) + l.carry - l.cost + l.crowd - l.forced;

export function pnlSheet(id, l) {
  const x = INST[id];
  const parts = [];
  for (const p of l.price) {
    if (p.mode === 'points') parts.push(h('div', {}, h('div', { class: 'eyebrow' }, `Price · ${p.seg}`), calc(`${fmtCr(p.base)} × (${fmtNum(p.to, 4)} − ${fmtNum(p.from, 4)}) ÷ 100 = ${fmtRupees(p.amount, { signed: true })}`)));
    else parts.push(h('div', {}, h('div', { class: 'eyebrow' }, `Price change · ${p.seg}`), calc(`${fmtCr(p.base)} × (${fmtNum(p.to, 4)} − ${fmtNum(p.from, 4)}) ÷ ${fmtNum(p.from, 4)} = ${fmtRupees(p.amount, { signed: true })}`)));
  }
  for (const p of l.currency) parts.push(h('div', {}, h('div', { class: 'eyebrow' }, `Currency effect · ${p.seg}`), calc(`(${fmtCr(p.base)}) × (${fmtNum(p.to, 4)} − ${fmtNum(p.from, 4)}) ÷ ${fmtNum(p.from, 4)} = ${fmtRupees(p.amount, { signed: true })}`, `₹ per ${ECONOMIES[p.ccy].currency}: ${fmtNum(p.from, 4)} → ${fmtNum(p.to, 4)}. The base is your holding after its price change.`)));
  if (l.carryWork) parts.push(h('div', {}, h('div', { class: 'eyebrow' }, 'Carry'), calc(`${fmtCr(l.carryWork.base)} × ${fmtNum(l.carryWork.ratePa)}% ÷ 4 = ${fmtCr(l.carryWork.base)} × ${fmtNum(l.carryWork.rateQ)}% = ${fmtRupees(l.carryWork.amount, { signed: true })}`), h('p', { class: 'small muted' }, `${l.carryWork.label}${l.carryWork.base < 0 ? ' — you are short, so you pay it' : ''}.`)));
  for (const c of l.costWork || []) parts.push(h('div', {}, h('div', { class: 'eyebrow' }, `Trading cost · ${c.side} · ${c.epoch}`), calc(`${fmtCr(c.amount)} × ${fmtNum(c.spread)}% = −${fmtRupees(c.cost)}`)));
  if (l.crowdWork) parts.push(h('div', {}, h('div', { class: 'eyebrow' }, 'Crowd impact'), calc(`All funds ${l.crowdWork.net > 0 ? 'bought' : 'sold'} ${fmtCr(Math.abs(l.crowdWork.net))} net; depth ₹${l.crowdWork.depth.toLocaleString('en-IN')} Cr → price pushed ${fmtSigned(l.crowdWork.pct)}%`, `−(your net trade ${fmtCr(l.crowdWork.flow, 2, { signed: true })}) × ${fmtSigned(l.crowdWork.pct)}% = ${fmtRupees(l.crowdWork.amount, { signed: true })}`)));
  if (l.forcedWork) parts.push(h('div', { class: 'crisis-banner' }, h('div', { class: 'eyebrow' }, 'Forced-sale penalty'), calc(`Closed ${fmtCr(l.forcedWork.closed)} at a price ${fmtNum(l.forcedWork.pct, 0)}% worse than the market: ${fmtCr(l.forcedWork.closed)} × ${fmtNum(l.forcedWork.pct)}% = −${fmtRupees(l.forcedWork.penalty)}`)));
  if (l.payout) parts.push(h('p', { class: 'good' }, `Default: this protection paid out in full (${fmtRupees(l.payout, { signed: true })}, included in the price line above) and the position was closed.`));
  const tot = lineTot(l);
  parts.push(h('div', { class: 'working' }, h('div', { class: 'line result' }, h('span', {}, 'Total for this position'), h('span', {}, money(tot, { exact: true })))));
  parts.push(h('p', { class: 'small muted' }, 'Price change + currency effect + carry − trading cost + crowd impact − forced-sale penalty. Amounts are exact to the paisa.'));
  sheet(x.name, h('div', { class: 'stack' }, parts), { eyebrow: 'Profit and loss' });
}

export function cashSheet(w) {
  if (!w) return;
  sheet('Cash interest', h('div', { class: 'stack' },
    h('p', {}, 'Unused cash earns the rupee cash rate. Positions beyond your cash are funded by borrowing at that rate plus 1% a year.'),
    calc(w.debt ? `Fund value at the bell ${fmtCr(w.nav)} + loans ${fmtCr(w.debt)} − money in long positions ${fmtCr(w.longs)} = ${fmtCr(w.base, 2, { signed: true })} ${w.borrowing ? '(borrowed)' : '(spare cash)'}`
      : `Fund value at the bell ${fmtCr(w.nav)} − money in long positions ${fmtCr(w.longs)} = ${fmtCr(w.base, 2, { signed: true })} ${w.borrowing ? '(borrowed)' : '(spare cash)'}`,
      `${fmtCr(w.base)} × ${fmtNum(w.ratePa)}% ÷ 4 = ${fmtCr(w.base)} × ${fmtNum(w.rateQ)}% = ${fmtRupees(w.amount, { signed: true })}`),
    h('p', { class: 'small muted' }, 'Short positions do not add to the cash that earns interest; rate futures and default protection use no cash.')), { eyebrow: 'Profit and loss' });
}
export function loanSheet(lines) {
  if (!lines?.length) return;
  sheet('Loan interest', h('div', { class: 'stack' },
    h('p', {}, 'Each loan from the Event Head costs its yearly rate ÷ 4 every round, on what is still owed at the bell. Borrowed cash you have not used still earns the cash rate (see Cash interest).'),
    calc(...lines.map((l) => `Loan ${l.id}: ${fmtCr(l.principal)} × ${fmtNum(l.ratePa)}% ÷ 4 = ${fmtCr(l.principal)} × ${fmtNum(l.rateQ)}% = ${fmtRupees(l.amount, { signed: true })}`))), { eyebrow: 'Profit and loss' });
}

export function auctionSheet(w) {
  if (!w) return;
  sheet('Auction result', h('div', { class: 'stack' },
    calc(`You were sold ${fmtCr(w.allotted)} of bonds at your bid of ${fmtPrice(w.price)}.`,
      `At the settlement price of ${fmtPrice(w.fair)} they are worth ${fmtCr(w.allotted)} × ${fmtNum(w.fair, 4)} ÷ ${fmtNum(w.price, 4)} = ${fmtRupees(w.value)}`,
      `Gain or loss = ${fmtRupees(w.value)} − ${fmtRupees(w.allotted)} = ${fmtRupees(w.pnl, { signed: true })}`),
    h('p', { class: 'small muted' }, `The bonds were added to your ${INST[w.inst].name} position.`)), { eyebrow: 'Profit and loss' });
}

// ---------------- risk ----------------

export function riskSheet(risk, { title = 'Risk Used', note = null } = {}) {
  const famRows = risk.families.map((f) => h('tr', {}, h('td', {}, f.name), h('td', { class: 'r num' }, fmtCr(Math.abs(f.net))), h('td', { class: 'r num' }, fmtCr(f.spread)), h('td', { class: 'r num' }, fmtCr(f.risk))));
  sheet(title, h('div', { class: 'stack' },
    note ? h('p', { class: 'warn' }, note) : null,
    h('p', {}, 'An estimate of what your fund could lose in a bad round, as a share of the limit. It grows with the size of each position and with how sharply that instrument has been moving; positions that offset one another count for less.'),
    h('h4', {}, '1 · Each position'),
    h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Position'), h('th', { class: 'r' }, 'Size'), h('th', { class: 'r' }, 'Typical move'), h('th', { class: 'r' }, 'Bad round'), h('th', { class: 'r' }, 'Risk'))),
      h('tbody', {}, risk.lines.sort((a, b) => b.risk - a.risk).map((l) => h('tr', {}, h('td', {}, INST[l.id].short), h('td', { class: 'r num' }, fmtCr(l.value)), h('td', { class: 'r num' }, `${fmtNum(l.typical)}%`), h('td', { class: 'r num' }, `${fmtNum(l.bad)}%`), h('td', { class: 'r num' }, fmtCr(l.risk))))))),
    h('p', { class: 'small muted' }, 'Risk = |size| × bad-round move, where a bad round is 2 × the instrument’s typical per-round move. The typical move updates every round and at every crisis, from how sharply the price has actually been moving.'),
    h('h4', {}, '2 · Families: offsetting positions count for less'),
    h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Family'), h('th', { class: 'r' }, '|Net|'), h('th', { class: 'r' }, '√Σ risk²'), h('th', { class: 'r' }, 'Family risk'))), h('tbody', {}, famRows))),
    h('p', { class: 'small muted' }, 'Family risk = ½ × |net of risks, longs minus shorts| + ½ × √(sum of each risk squared).'),
    h('h4', {}, '3 · Combine and compare with the limit'),
    calc(`Combined = √(${risk.families.map((f) => fmtNum(f.risk / 1e9, 2)).join('² + ')}²) = ${fmtCr(risk.combined)}`,
      `× crisis multiplier ${fmtNum(risk.M)} = ${fmtCr(risk.loss)}`,
      `Limit = ${RULES.riskBudgetPct}% × fund value ${fmtCr(risk.nav)} = ${fmtCr(risk.budget)}`,
      `Risk Used = ${fmtCr(risk.loss)} ÷ ${fmtCr(risk.budget)} = ${fmtNum(risk.pct)}%`),
    h('p', { class: 'small' }, risk.pct > 100 ? 'Above 100% at the bell: the system will close your largest positions until it falls to 80%, at a price 2% worse than the market, and record a forced liquidation (−5 SPECULA points).'
      : risk.pct > 85 ? 'Close to the limit. A crisis can push Risk Used over 100% without a single new trade.' : 'Inside the limit.')), { eyebrow: 'Show working' });
}

// ---------------- forecasts ----------------

export function forecastBlock(f) {
  if (!f || f.points === undefined) return null;
  return h('div', { class: 'stack' },
    h('div', { class: 'row' }, h('span', {}, forecastQuestion(f.spec)), h('span', { class: 'spacer' }), h('b', { class: 'num' }, `${fmtNum(f.points, 1)} pts`)),
    steps(f.steps || []));
}

// ---------------- the SPECULA Score ----------------

export function scoreSheet(row) {
  const s = row.stats;
  sheet(`${row.name}: ${fmtNum(row.total, 1)} / 100`, h('div', { class: 'stack' },
    h('div', { class: 'kpis' },
      h('div', { class: 'kpi' }, h('div', { class: 'k' }, 'Risk-adjusted return'), h('div', { class: 'v' }, `${fmtNum(row.rar, 1)}`), h('div', { class: 's' }, 'out of 60')),
      h('div', { class: 'kpi' }, h('div', { class: 'k' }, 'Forecast accuracy'), h('div', { class: 'v' }, `${fmtNum(row.forecast, 1)}`), h('div', { class: 's' }, 'out of 25')),
      h('div', { class: 'kpi' }, h('div', { class: 'k' }, 'Risk discipline'), h('div', { class: 'v' }, `${row.discipline}`), h('div', { class: 's' }, 'out of 15'))),
    h('h4', {}, 'Risk-adjusted return (60)'), steps(row.steps.rar),
    s.qret.length ? h('details', {}, h('summary', { class: 'linkish' }, 'Show the swing calculation, round by round'),
      h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Quarter'), h('th', { class: 'r' }, 'Return'), h('th', { class: 'r' }, '− mean'), h('th', { class: 'r' }, 'squared'))),
        h('tbody', {}, s.qret.map((r, i) => h('tr', {}, h('td', {}, `Round ${i + 1}`), h('td', { class: 'r num' }, `${fmtNum(r)}%`), h('td', { class: 'r num' }, fmtNum(r2(r - s.mean))), h('td', { class: 'r num' }, fmtNum(s.sq[i]))))))),
      calc(`Mean = ${fmtNum(s.mean)}%. Average of the squares = ${fmtNum(s.variance)}. Swing = √${fmtNum(s.variance)} = ${fmtNum(s.swing)}%`)) : null,
    h('h4', {}, 'Forecast accuracy (25)'), steps(row.steps.forecast),
    h('h4', {}, 'Risk discipline (15)'), steps(row.steps.discipline),
    calc(`SPECULA Score = ${fmtNum(row.rar, 1)} + ${fmtNum(row.forecast, 1)} + ${row.discipline} = ${fmtNum(row.total, 1)}`)), { eyebrow: 'SPECULA Score' });
}

// ---------------- your own record (results are hidden from other funds) ----------------

/** Your fund's numbers behind the SPECULA Score, from your own history only. */
export function myRecord(team, { final = null } = {}) {
  const s = fundStats(team.navHist, team.flows);
  const marked = Object.values(team.forecasts || {}).filter((f) => f.points !== undefined);
  const disc = Math.max(0, RULES.score.discipline - RULES.score.perForced * (team.forced || 0));
  return h('div', { class: 'stack' },
    h('div', { class: 'kpis' },
      h('div', { class: 'kpi' }, h('div', { class: 'k' }, 'Return beyond cash'), h('div', { class: `v num ${s.excess > 0 ? 'up' : s.excess < 0 ? 'down' : ''}` }, `${fmtSigned(s.excess)}%`), h('div', { class: 's' }, `total ${fmtSigned(s.totalReturn)}% − cash ${fmtNum(s.cashGrowth)}%`)),
      h('div', { class: 'kpi' }, h('div', { class: 'k' }, 'Swing'), h('div', { class: 'v num' }, `${fmtNum(s.swing)}%`), h('div', { class: 's' }, 'round-to-round ups and downs')),
      h('div', { class: 'kpi' }, h('div', { class: 'k' }, 'Deepest fall'), h('div', { class: `v num ${s.deepest ? 'down' : ''}` }, `${fmtNum(s.deepest)}%`), h('div', { class: 's' }, 'from a peak')),
      h('div', { class: 'kpi' }, h('div', { class: 'k' }, 'Risk-adjusted return'), h('div', { class: 'v num' }, fmtNum(s.riskAdj)), h('div', { class: 's' }, s.end < s.start ? 'the fund has lost money: scores 0' : 'the 60 points compare this with the best fund')),
      h('div', { class: 'kpi' }, h('div', { class: 'k' }, 'Forecast points'), h('div', { class: 'v num' }, fmtNum(team.forecastPts || 0, 1)), h('div', { class: 's' }, `of ${marked.length * RULES.forecastMaxPoints} so far`)),
      h('div', { class: 'kpi' }, h('div', { class: 'k' }, 'Risk discipline'), h('div', { class: 'v num' }, `${disc} / 15`), h('div', { class: 's' }, `${team.forced || 0} forced liquidation${team.forced === 1 ? '' : 's'}`))),
    h('button', { class: 'why', onclick: () => myRecordSheet(team) }, 'show the working'),
    final ? null : h('p', { class: 'small muted' }, 'Your SPECULA Score is sealed until the end. Its biggest part, 60 points, compares your risk-adjusted return with the best fund in the room, so it can only be worked out once every fund has finished. The Event Head reveals the standings after the final release.'));
}

export function myRecordSheet(team) {
  const s = fundStats(team.navHist, team.flows);
  const marked = Object.entries(team.forecasts || {}).filter(([, f]) => f.points !== undefined);
  sheet('Your fund’s record', h('div', { class: 'stack' },
    h('h4', {}, 'Risk-adjusted return'),
    steps([
      s.hasFlows ? `Total return, round by round so that capital the Event Head added or removed is not counted as profit: ${fmtNum(s.totalReturn)}%` : `Total return: ${fmtCr(s.end)} ÷ ${fmtCr(s.start)} − 1 = ${fmtNum(s.totalReturn)}%`,
      `Cash alone would have grown ${fmtNum(s.cashGrowth)}% (${fmtNum(RULES.cashRatePct / 4)}% a round for ${s.n} rounds), so your decisions earned ${fmtNum(s.totalReturn)} − ${fmtNum(s.cashGrowth)} = ${fmtNum(s.excess)}%`,
      `Swing = ${fmtNum(s.swing)}%${s.swing < RULES.swingFloorPct ? `, counted as at least ${fmtNum(RULES.swingFloorPct)}%` : ''}`,
      `Deepest fall from a peak = ${fmtNum(s.deepest)}%`,
      `Risk-adjusted return = ${fmtNum(s.excess)} ÷ ${fmtNum(s.swingUsed)} − ${RULES.fallPenaltyPerPct} × ${fmtNum(s.deepest)} = ${fmtNum(s.riskAdj)}`,
      'At the end, the best risk-adjusted return in the room scores 60 and every other fund scores in proportion. You will see yours when the results are revealed.',
    ]),
    s.qret.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Round'), h('th', { class: 'r' }, 'Return'), h('th', { class: 'r' }, '− mean'), h('th', { class: 'r' }, 'squared'))),
      h('tbody', {}, s.qret.map((r, i) => h('tr', {}, h('td', {}, `Round ${i + 1}`), h('td', { class: 'r num' }, `${fmtNum(r)}%`), h('td', { class: 'r num' }, fmtNum(r2(r - s.mean))), h('td', { class: 'r num' }, fmtNum(s.sq[i]))))))) : null,
    h('h4', {}, 'Forecasts'),
    marked.length ? marked.map(([q, f]) => h('div', { class: 'panel', style: { margin: '6px 0' } }, h('div', { class: 'eyebrow' }, `Round ${q}`), forecastBlock(f))) : h('p', { class: 'small muted' }, 'No forecast has been marked yet. Each one is marked when the next data drops.'),
    h('h4', {}, 'Risk discipline'),
    steps([`15 − 5 × ${team.forced || 0} forced liquidation${team.forced === 1 ? '' : 's'} = ${Math.max(0, 15 - 5 * (team.forced || 0))}`])), { eyebrow: 'Only your fund' });
}

export function standingsTable(rows, { me = null, onRow = null, big = false, limit = 99 } = {}) {
  return h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Fund'), h('th', { class: 'r' }, 'Fund value'), h('th', { class: `r ${big ? '' : 'hide-sm'}` }, 'Return'), h('th', { class: 'r' }, 'Score'))),
    h('tbody', {}, rows.slice(0, limit).map((r) => h('tr', { class: onRow ? 'click' : '', style: r.id === me ? { outline: '2px solid var(--gold)', outlineOffset: '-2px' } : null, onclick: onRow ? () => onRow(r) : null },
      h('td', { class: 'num' }, r.rank), h('td', {}, r.name), h('td', { class: 'r num' }, fmtCr(r.nav, big ? 0 : 2)),
      h('td', { class: `r ${big ? '' : 'hide-sm'}` }, pct(r.stats?.totalReturn ?? (r.nav / 1e12 - 1) * 100, { dp: 1 })), h('td', { class: 'r num' }, h('b', {}, fmtNum(r.total, 1))))))));
}

export function familyName(id) { return FAMILIES.find((f) => f.id === id)?.name; }
export { explainInstrument, lineChart };
