// Fund accounting. All money in paise. Every rupee of profit or loss is recorded as a line,
// and the lines always add up exactly to the change in fund value.

import { INST, INSTRUMENTS } from '../config/instruments.mjs';
import { RULES } from '../config/rules.mjs';
import { mulPct, mulRatioChange, mulPoints, r2 } from './num.mjs';

export const isFunded = (id) => INST[id].funded;

/** Money the fund owes on loans from the Event Head (paise). */
export function debtOf(x) { return (x.loans || []).reduce((a, l) => a + l.principal, 0); }

/** Fund value = cash + money in positions − loans outstanding. */
export function navOf(st) {
  let v = st.cash - debtOf(st);
  for (const [id, x] of Object.entries(st.pos)) if (isFunded(id)) v += x;
  return v;
}

export function newLedger() {
  return { byInst: {}, cashInterest: 0, cashInterestWork: null, loanInterest: 0, loanInterestWork: null, auction: 0, auctionWork: null };
}
function L(led, id) {
  return (led.byInst[id] ||= { price: [], currency: [], carry: 0, carryWork: null, cost: 0, costWork: [], crowd: 0, crowdWork: null, forced: 0, forcedWork: null, payout: 0 });
}
export function ledgerTotal(led) {
  let t = led.cashInterest + led.auction + (led.loanInterest || 0);
  for (const l of Object.values(led.byInst)) {
    t += l.price.reduce((a, p) => a + p.amount, 0) + l.currency.reduce((a, p) => a + p.amount, 0) + l.carry - l.cost + l.crowd - l.forced;
  }
  return t;
}
export function lineTotal(l) {
  return l.price.reduce((a, p) => a + p.amount, 0) + l.currency.reduce((a, p) => a + p.amount, 0) + l.carry - l.cost + l.crowd - l.forced;
}

function bumpOpen(st, id, amount) { st.open[id] = (st.open[id] || 0) + amount; }

/** Execute one order at the current epoch's prices. delta in paise (+ buy, − sell). */
export function applyOrder(st, led, id, delta, spreadPct, epochLabel) {
  if (!delta) return { cost: 0 };
  const before = st.pos[id] || 0;
  const after = before + delta;
  const cost = mulPct(Math.abs(delta), spreadPct);
  st.cash -= cost;
  if (isFunded(id)) st.cash -= delta;
  // open profit and loss is kept in proportion when a position is cut, and reset on a flip
  if (before !== 0 && Math.sign(after) !== Math.sign(before)) st.open[id] = 0;
  else if (before !== 0 && Math.abs(after) < Math.abs(before)) st.open[id] = Math.round((st.open[id] || 0) * Math.abs(after) / Math.abs(before));
  if (after === 0) delete st.pos[id]; else st.pos[id] = after;
  bumpOpen(st, id, -cost);
  const l = L(led, id);
  l.cost += cost;
  l.costWork.push({ amount: Math.abs(delta), spread: spreadPct, cost, epoch: epochLabel, side: delta > 0 ? 'buy' : 'sell' });
  st.flow[id] = (st.flow[id] || 0) + delta;
  return { cost };
}

/**
 * Move every position from one set of prices to the next (a crisis or the settlement).
 * oldPx/newPx: { lp, fx, cds, fut }. rets: market returns (for default flags).
 */
export function revalue(st, led, oldPx, newPx, rets, segLabel) {
  const closedByDefault = [];
  for (const id of Object.keys(st.pos)) {
    const v = st.pos[id];
    if (!v) continue;
    const x = INST[id];
    const l = L(led, id);
    if (x.kind === 'future' || x.kind === 'cds') {
      const from = x.kind === 'future' ? oldPx.fut[x.econ] : oldPx.cds[id];
      const r = rets?.[id];
      const to = r?.defaulted ? 100 : (x.kind === 'future' ? (r?.to ?? newPx.fut[x.econ]) : newPx.cds[id]);
      const pts = to - from;
      const amount = mulPoints(v, pts);
      if (amount || from !== to) l.price.push({ seg: segLabel, amount, base: v, from, to, mode: 'points' });
      st.cash += amount; bumpOpen(st, id, amount);
      if (r?.defaulted) { l.payout += amount; closedByDefault.push({ id, notional: v, amount }); delete st.pos[id]; st.open[id] = 0; }
      continue;
    }
    if (x.ccy) {
      const lo = oldPx.lp[id]; const ln = newPx.lp[id];
      const pc = mulRatioChange(v, lo, ln);
      const fo = oldPx.fx[x.ccy]; const fn = newPx.fx[x.ccy];
      const cur = mulRatioChange(v + pc, fo, fn);
      if (pc || lo !== ln) l.price.push({ seg: segLabel, amount: pc, base: v, from: lo, to: ln, mode: 'ratio' });
      if (cur || fo !== fn) l.currency.push({ seg: segLabel, amount: cur, base: v + pc, from: fo, to: fn, ccy: x.ccy });
      st.pos[id] = v + pc + cur; bumpOpen(st, id, pc + cur);
    } else {
      const po = x.kind === 'fx' ? oldPx.fx[x.econ] : oldPx.lp[id];
      const pn = x.kind === 'fx' ? newPx.fx[x.econ] : newPx.lp[id];
      const pc = mulRatioChange(v, po, pn);
      if (pc || po !== pn) l.price.push({ seg: segLabel, amount: pc, base: v, from: po, to: pn, mode: 'ratio' });
      st.pos[id] = v + pc; bumpOpen(st, id, pc);
    }
  }
  return closedByDefault;
}

/** Close positions chosen by forced liquidation, at a price 2% worse than the market. */
export function applyForced(st, led, closed) {
  let total = 0;
  for (const c of closed) {
    const l = L(led, c.id);
    const penalty = mulPct(Math.abs(c.amount), RULES.forcedWorsePct);
    st.cash -= penalty;
    if (isFunded(c.id)) st.cash += c.amount; // sold at market value…
    if (c.to === 0) { delete st.pos[c.id]; st.open[c.id] = 0; } else {
      st.open[c.id] = Math.round((st.open[c.id] || 0) * Math.abs(c.to) / Math.abs(c.from));
      st.pos[c.id] = c.to;
    }
    l.forced += penalty;
    l.forcedWork = { closed: Math.abs(c.amount), pct: RULES.forcedWorsePct, penalty, from: c.from, to: c.to };
    total += penalty;
  }
  return total;
}

/** Interest and premiums for the round on positions held at the bell. carry = carryRates(). */
export function applyCarry(st, led, carry) {
  for (const id of Object.keys(st.pos)) {
    const v = st.pos[id];
    const c = carry[id];
    if (!c || !c.rate || !v) continue;
    const q = r2(c.rate / 4);
    const amount = mulPct(v, q);
    const l = L(led, id);
    l.carry += amount;
    l.carryWork = { base: v, ratePa: c.rate, rateQ: q, amount, label: c.label };
    st.cash += amount; bumpOpen(st, id, amount);
  }
}

/** Unused cash earns the cash rate; borrowing beyond cash costs the cash rate + 1%. */
export function applyCashInterest(st, led) {
  let longs = 0;
  for (const [id, v] of Object.entries(st.pos)) if (isFunded(id) && v > 0) longs += v;
  const nav = navOf(st);
  const debt = debtOf(st);
  const base = nav + debt - longs; // cash not tied up in long positions (borrowed money included)
  const ratePa = base >= 0 ? RULES.cashRatePct : RULES.cashRatePct + RULES.borrowExtraPct;
  const rateQ = r2(ratePa / 4);
  const amount = mulPct(base, rateQ);
  st.cash += amount;
  led.cashInterest += amount;
  led.cashInterestWork = { nav, longs, debt, base, ratePa, rateQ, amount, borrowing: base < 0 };
  return amount;
}

/** Interest on loans from the Event Head: each loan's yearly rate ÷ 4, every round. */
export function applyLoanInterest(st, led) {
  const lines = [];
  let total = 0;
  for (const l of st.loans || []) {
    const rateQ = r2(l.ratePct / 4);
    const amount = -mulPct(l.principal, rateQ);
    lines.push({ id: l.id, principal: l.principal, ratePa: l.ratePct, rateQ, amount });
    total += amount;
  }
  if (!lines.length) return 0;
  st.cash += total;
  led.loanInterest += total;
  led.loanInterestWork = lines;
  return total;
}

/** Crowd impact: everyone trading the same way this round pays for it. */
export function crowdImpacts(flowsByTeam) {
  const net = {};
  for (const flows of Object.values(flowsByTeam)) for (const [id, f] of Object.entries(flows)) net[id] = (net[id] || 0) + f;
  const impact = {};
  for (const [id, f] of Object.entries(net)) {
    if (!f) continue;
    const depthPaise = INST[id].depth * 1e9;
    let pct = r2(RULES.crowdImpactPctPerDepth * f / depthPaise);
    pct = Math.max(-RULES.crowdImpactCapPct, Math.min(RULES.crowdImpactCapPct, pct));
    if (pct) impact[id] = { net: f, depth: INST[id].depth, pct };
  }
  return impact;
}

export function applyCrowd(st, led, impact) {
  for (const [id, flow] of Object.entries(st.flow)) {
    const imp = impact[id];
    if (!imp || !flow) continue;
    const amount = -mulPct(flow, imp.pct);
    const l = L(led, id);
    l.crowd += amount;
    l.crowdWork = { flow, pct: imp.pct, net: imp.net, depth: imp.depth, amount };
    st.cash += amount; if (st.pos[id]) bumpOpen(st, id, amount);
  }
}

export function freshState(team) {
  return { cash: team.cash, pos: { ...team.pos }, open: { ...(team.open || {}) }, flow: {}, loans: (team.loans || []).map((l) => ({ ...l })) };
}

export { INSTRUMENTS };
