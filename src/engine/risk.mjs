// Exposure (the 3× limit) and Risk Used (the 100% limit), with the working.
//
// Risk Used, in words (guide page 05): an estimate of what the fund could lose in a bad
// round, as a share of the limit. It grows with the size of each position and with how
// sharply that instrument has been moving; positions that offset one another count for less.
//
//  1. For each position: risk = size × bad-round move, where a bad-round move is
//     2 × the instrument's typical per-round move ("how sharply it has been moving").
//  2. Positions are grouped into families that move together (Aurelian rates, shares, ...).
//     Inside a family, offsetting positions count for less:
//        family risk = ½ × |sum of signed risks| + ½ × √(sum of each risk squared)
//  3. Families combine like this:  √(family₁² + family₂² + …)   (they rarely all go wrong together)
//  4. In violent markets the result is multiplied by the crisis multiplier.
//  5. Risk Used = that loss ÷ (15% of fund value).

import { INST, RISK_FAMILIES } from '../config/instruments.mjs';
import { RULES } from '../config/rules.mjs';
import { r2, roundTo } from './num.mjs';

export function grossExposure(pos) {
  let g = 0;
  for (const v of Object.values(pos)) g += Math.abs(v);
  return g;
}

export function exposureMultiple(pos, nav) {
  if (nav <= 0) return Infinity;
  return r2(grossExposure(pos) / nav);
}

export function riskUsed(pos, nav, sigma, M = 1) {
  const lines = [];
  const fam = {};
  for (const [id, v] of Object.entries(pos)) {
    if (!v) continue;
    const x = INST[id];
    const typical = sigma[id] ?? x.sigma0;
    const bad = r2(RULES.badQuarterMultiple * typical);
    const risk = Math.round(Math.abs(v) * bad / 100);
    const signed = Math.sign(v) * x.sign * risk;
    lines.push({ id, value: v, typical, bad, risk, signed, family: x.risk });
    const f = (fam[x.risk] ||= { id: x.risk, name: RISK_FAMILIES[x.risk], net: 0, gross: 0, sq: 0, ids: [] });
    f.net += signed; f.gross += risk; f.sq += (risk / 1e9) ** 2; f.ids.push(id);
  }
  const families = Object.values(fam).map((f) => {
    const spread = Math.round(Math.sqrt(f.sq) * 1e9);
    return { ...f, spread, risk: Math.round(0.5 * Math.abs(f.net) + 0.5 * spread) };
  });
  const sumSq = families.reduce((a, f) => a + (f.risk / 1e9) ** 2, 0);
  const combined = Math.round(Math.sqrt(sumSq) * 1e9);
  const loss = Math.round(combined * M);
  const budget = Math.round(Math.max(0, nav) * RULES.riskBudgetPct / 100);
  const pct = budget > 0 ? r2((loss / budget) * 100) : (loss > 0 ? 999 : 0);
  return { lines, families, combined, M, loss, budget, pct, nav };
}

/**
 * Forced liquidation (guide page 05): if Risk Used is above 100% at settlement, close the
 * largest positions until it falls to 80%, at a price 2% worse than the market.
 * Returns the new positions and a record of what was closed.
 */
export function forcedLiquidation(pos, nav, sigma, M) {
  const before = riskUsed(pos, nav, sigma, M);
  if (before.pct <= RULES.riskLimitPct) return { forced: false, pos, closed: [], before, after: before };
  const p = { ...pos };
  const closed = [];
  const order = Object.keys(p).filter((k) => p[k]).sort((a, b) => Math.abs(p[b]) - Math.abs(p[a]) || (a < b ? -1 : 1));
  let cur = before.pct;
  for (const id of order) {
    if (cur <= RULES.forcedTargetPct) break;
    const v = p[id];
    const full = riskUsed({ ...p, [id]: 0 }, nav, sigma, M).pct;
    if (full >= cur) continue; // closing this one would not lower risk (it is a hedge)
    let keepFrac = 0;
    if (full < RULES.forcedTargetPct) {
      // close just enough of this position to land on 80%
      let lo = 0; let hi = 1; // fraction kept
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        const t = riskUsed({ ...p, [id]: Math.round(v * mid) }, nav, sigma, M).pct;
        if (t > RULES.forcedTargetPct) hi = mid; else lo = mid;
      }
      keepFrac = lo;
    }
    const keep = Math.trunc(v * keepFrac);
    closed.push({ id, from: v, to: keep, amount: v - keep });
    p[id] = keep;
    cur = riskUsed(p, nav, sigma, M).pct;
  }
  const after = riskUsed(p, nav, sigma, M);
  return { forced: true, pos: p, closed, before, after };
}

/** Typical per-round move after a new observed move r (% in rupee terms). */
export function updateSigma(prev, r, floor) {
  const m = RULES.sigmaMemory;
  const s = Math.sqrt(m * prev * prev + (1 - m) * r * r);
  return roundTo(Math.max(floor, s), 2);
}
