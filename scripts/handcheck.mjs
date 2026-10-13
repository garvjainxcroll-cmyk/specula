// HAND CHECK — recompute one fund's profit and loss, Risk Used and SPECULA Score for three
// rounds from first principles (prices, positions and the rules on paper), without
// using the engine's accounting code, and confirm they match the site to the paisa.
// Usage: node scripts/handcheck.mjs  (writes HAND_CHECK.md). Also run by tests/handcheck.test.mjs.
import { writeFileSync } from 'node:fs';
import { newGame, openQuarter, fireStage, settleQuarter, finalRelease, stagesFor, deskNow, checkOrder } from '../src/engine/game.mjs';
import { rupeePrice } from '../src/engine/market.mjs';
import { INST } from '../src/config/instruments.mjs';
import { RULES } from '../src/config/rules.mjs';
import { SCRIPT } from '../server/script.mjs';
import { BOTS, rng, ordersFor } from '../src/bots/bots.mjs';
import { fmtRupees, fmtNum } from '../src/engine/num.mjs';

const CHECK_QS = [1, 4, 6];
const TEAM = 't02'; // "Reads the economy"

// ---- plain arithmetic, written out the way you would on paper ----
const B = (x) => BigInt(Math.round(x));
function roundDiv(num, den) { // half away from zero, all BigInt
  if (den < 0n) { num = -num; den = -den; }
  const neg = num < 0n; const a = neg ? -num : num;
  const q = a / den; const r = a - q * den;
  const out = r * 2n >= den ? q + 1n : q;
  return neg ? -out : out;
}
const scaled = (x, dp) => B(Math.round(x * 10 ** dp));
/** value × (new − old) ÷ old, in paise */
const change = (v, oldP, newP) => Number(roundDiv(B(v) * (scaled(newP, 6) - scaled(oldP, 6)), scaled(oldP, 6)));
/** value × pct% */
const ofPct = (v, pct) => Number(roundDiv(B(v) * scaled(pct, 4), 1000000n));
/** value × points ÷ 100 */
const ofPts = (v, pts) => Number(roundDiv(B(v) * scaled(pts, 4), 1000000n));

function px(x, P) { if (x.kind === 'fx') return P.fx[x.econ]; if (x.kind === 'future') return P.fut[x.econ]; if (x.kind === 'cds') return P.cds[x.id]; return P.lp[x.id]; }

export function runHandCheck() {
  const lineup = ['economist', 'reader', 'cautious', 'momentum', 'gambler', 'random', 'buyhold', 'idle'];
  const teams = lineup.map((b, k) => ({ id: `t${String(k + 1).padStart(2, '0')}`, name: `${BOTS[b].label}`, bot: b }));
  const rands = Object.fromEntries(teams.map((t, k) => [t.id, rng(1000 + k + 1)]));
  let w = newGame(teams, SCRIPT);
  const checks = []; let allOk = true;
  for (let q = 1; q <= SCRIPT.quarters.length; q++) {
    w = openQuarter(w, SCRIPT, q);
    const orders = Object.fromEntries(teams.map((t) => [t.id, []]));
    const stages = stagesFor(SCRIPT, q);
    for (let k = 0; k <= stages.length; k++) {
      if (k > 0) w = fireStage(w, SCRIPT, stages[k - 1].id).world;
      for (const t of teams) {
        const now = deskNow(w, t.id, orders[t.id]);
        const d = BOTS[t.bot].decide({ world: w, teamId: t.id, q, epoch: k, nav: now.nav, rand: rands[t.id], forecastSpec: w.run.forecast });
        if (d) orders[t.id].push(...ordersFor(w, t.id, orders[t.id], d.targets, w.run.epochs.length - 1, checkOrder));
      }
    }
    const forecasts = {}; const bids = {};
    for (const t of teams) {
      forecasts[t.id] = BOTS[t.bot].forecast({ world: w, teamId: t.id, q, rand: rands[t.id], forecastSpec: w.run.forecast });
      if (w.run.auction && BOTS[t.bot].bid) bids[t.id] = BOTS[t.bot].bid({ world: w, nav: deskNow(w, t.id, orders[t.id]).nav, price: rupeePrice(w.mkt, w.run.auction.inst) });
    }
    const before = structuredClone(w);
    const res = settleQuarter(w, SCRIPT, { orders, forecasts, bids });
    if (CHECK_QS.includes(q)) { const c = check(before, res, orders[TEAM], q); checks.push(c); allOk &&= c.ok; }
    w = res.world;
  }
  w = finalRelease(w, SCRIPT);
  const sc = scoreCheck(w);
  allOk &&= sc.ok;
  return { checks, score: sc, ok: allOk };
}

/** Recompute one round for TEAM by hand. */
function check(w0, res, orders, q) {
  const team = w0.teams[TEAM]; const run = w0.run;
  const r = res.result.teams[TEAM];
  const lines = [];
  // positions and cash through the window
  const pos = { ...team.pos }; let cash = team.cash;
  const ledger = {}; const L = (id) => (ledger[id] ||= { price: 0, currency: 0, carry: 0, cost: 0, crowd: 0, forced: 0 });
  for (let e = 0; e < run.epochs.length; e++) {
    const ep = run.epochs[e];
    if (e > 0) move(run.epochs[e - 1].px, ep.px, ep.rets, ep.label);
    for (const o of orders.filter((x) => x.epoch === e)) {
      const cost = ofPct(Math.abs(o.delta), ep.spreads[o.inst]);
      cash -= cost; if (INST[o.inst].funded) cash -= o.delta;
      pos[o.inst] = (pos[o.inst] || 0) + o.delta; if (!pos[o.inst]) delete pos[o.inst];
      L(o.inst).cost += cost;
    }
  }
  function move(a, b, rets, label) {
    for (const id of Object.keys(pos)) {
      const x = INST[id]; const v = pos[id];
      if (x.kind === 'future' || x.kind === 'cds') {
        const def = rets?.[id]?.defaulted;
        const to = def ? 100 : px(x, b);
        const p = ofPts(v, to - px(x, a)); cash += p; L(id).price += p;
        if (def) delete pos[id];
        continue;
      }
      const pc = change(v, px(x, a), px(x, b));
      let cur = 0;
      if (x.ccy) cur = change(v + pc, a.fx[x.ccy], b.fx[x.ccy]);
      pos[id] = v + pc + cur; L(id).price += pc; L(id).currency += cur;
    }
  }
  // the bell: forced liquidation (the engine chooses what to close; we check its arithmetic)
  if (r.forced) for (const c of r.forced.closed) {
    const pen = ofPct(Math.abs(c.amount), RULES.forcedWorsePct);
    cash -= pen; if (INST[c.id].funded) cash += c.amount;
    if (c.to === 0) delete pos[c.id]; else pos[c.id] = c.to;
    L(c.id).forced += pen;
  }
  // cash interest: fund value minus money in long positions, at 6% (or 7% if borrowing), a quarter of a year per round
  let longs = 0; let nav = cash;
  for (const [id, v] of Object.entries(pos)) if (INST[id].funded) { nav += v; if (v > 0) longs += v; }
  const base = nav - longs;
  const rate = (base >= 0 ? RULES.cashRatePct : RULES.cashRatePct + RULES.borrowExtraPct) / 4;
  const interest = ofPct(base, rate); cash += interest;
  lines.push(`Cash interest: (fund value ${fmtRupees(nav)} − long positions ${fmtRupees(longs)}) × ${fmtNum(rate)}% = ${fmtRupees(interest, { signed: true })}`);
  // carry on positions at the bell
  for (const [id, v] of Object.entries(pos)) {
    const c = res.result.carry[id]; if (!c?.rate) continue;
    const amt = ofPct(v, Math.round(c.rate / 4 * 100) / 100); cash += amt; L(id).carry += amt;
  }
  // settlement
  move(res.result.pxBell, res.result.pxSettled, res.result.rets, 'Settlement');
  // crowd
  for (const o of orders) {
    const imp = res.result.crowd[o.inst]; if (!imp) continue;
    const amt = -ofPct(o.delta, imp.pct); cash += amt; L(o.inst).crowd += amt;
  }
  // auction
  let auction = 0;
  const aw = r.ledger.auctionWork;
  if (aw) { const value = aw.allotted + change(aw.allotted, aw.price, aw.fair); cash -= aw.allotted; pos[aw.inst] = (pos[aw.inst] || 0) + value; auction = value - aw.allotted; }
  let navEnd = cash; for (const [id, v] of Object.entries(pos)) if (INST[id].funded) navEnd += v;

  // compare with the engine, line by line
  const diffs = [];
  for (const [id, mine] of Object.entries(ledger)) {
    const e = r.ledger.byInst[id];
    const eng = { price: e.price.reduce((a, p) => a + p.amount, 0), currency: e.currency.reduce((a, p) => a + p.amount, 0), carry: e.carry, cost: e.cost, crowd: e.crowd, forced: e.forced };
    for (const k of Object.keys(mine)) if (mine[k] !== eng[k]) diffs.push(`${id} ${k}: hand ${mine[k]} vs site ${eng[k]}`);
  }
  if (interest !== r.ledger.cashInterest) diffs.push(`cash interest: hand ${interest} vs site ${r.ledger.cashInterest}`);
  if (auction !== r.ledger.auction) diffs.push(`auction: hand ${auction} vs site ${r.ledger.auction}`);
  if (navEnd !== r.navEnd) diffs.push(`fund value: hand ${navEnd} vs site ${r.navEnd}`);

  // Risk Used at the bell, by hand
  const rk = handRisk(r.riskBell);
  if (rk.pct !== r.riskBell.pct) diffs.push(`Risk Used: hand ${rk.pct} vs site ${r.riskBell.pct}`);

  // one position written out in full
  const big = Object.entries(r.ledger.byInst).sort((a, b) => Math.abs(sumL(b[1])) - Math.abs(sumL(a[1])))[0];
  const detail = big ? positionDetail(big[0], big[1]) : [];
  return { q, ok: diffs.length === 0, diffs, lines, detail, navOpen: r.navOpen, navEnd: r.navEnd, handNavEnd: navEnd, risk: rk, ledger, interest, auction };
}
const sumL = (l) => l.price.reduce((a, p) => a + p.amount, 0) + l.currency.reduce((a, p) => a + p.amount, 0) + l.carry - l.cost + l.crowd - l.forced;

function positionDetail(id, l) {
  const out = [`**${INST[id].name}**`];
  for (const p of l.price) out.push(p.mode === 'points'
    ? `- Price (${p.seg}): ${fmtRupees(p.base)} × (${p.to} − ${p.from}) ÷ 100 = ${fmtRupees(ofPts(p.base, p.to - p.from), { signed: true })} (site: ${fmtRupees(p.amount, { signed: true })})`
    : `- Price change (${p.seg}): ${fmtRupees(p.base)} × (${p.to} − ${p.from}) ÷ ${p.from} = ${fmtRupees(change(p.base, p.from, p.to), { signed: true })} (site: ${fmtRupees(p.amount, { signed: true })})`);
  for (const p of l.currency) out.push(`- Currency effect (${p.seg}): ${fmtRupees(p.base)} × (${p.to} − ${p.from}) ÷ ${p.from} = ${fmtRupees(change(p.base, p.from, p.to), { signed: true })} (site: ${fmtRupees(p.amount, { signed: true })})`);
  if (l.carryWork) out.push(`- Carry: ${fmtRupees(l.carryWork.base)} × ${l.carryWork.rateQ}% = ${fmtRupees(ofPct(l.carryWork.base, l.carryWork.rateQ), { signed: true })} (site: ${fmtRupees(l.carryWork.amount, { signed: true })})`);
  for (const c of l.costWork) out.push(`- Trading cost: ${fmtRupees(c.amount)} × ${c.spread}% = −${fmtRupees(ofPct(c.amount, c.spread))} (site: −${fmtRupees(c.cost)})`);
  if (l.crowdWork) out.push(`- Crowd impact: −(${fmtRupees(l.crowdWork.flow)}) × ${fmtNum(l.crowdWork.pct)}% = ${fmtRupees(-ofPct(l.crowdWork.flow, l.crowdWork.pct), { signed: true })} (site: ${fmtRupees(l.crowdWork.amount, { signed: true })})`);
  if (l.forcedWork) out.push(`- Forced-sale penalty: ${fmtRupees(l.forcedWork.closed)} × 2% = −${fmtRupees(ofPct(l.forcedWork.closed, 2))} (site: −${fmtRupees(l.forcedWork.penalty)})`);
  out.push(`- **Total: ${fmtRupees(sumL(l), { signed: true })}**`);
  return out;
}

function handRisk(rb) {
  // from the sizes and bad-round moves the site shows, redo steps 1–5 of Risk Used
  const fam = {};
  for (const l of rb.lines) {
    const risk = Math.round(Math.abs(l.value) * l.bad / 100);
    const signed = Math.sign(l.value) * INST[l.id].sign * risk;
    const f = (fam[l.family] ||= { net: 0, sq: 0 });
    f.net += signed; f.sq += (risk / 1e9) ** 2;
  }
  const famRisk = Object.values(fam).map((f) => Math.round(0.5 * Math.abs(f.net) + 0.5 * Math.round(Math.sqrt(f.sq) * 1e9)));
  const combined = Math.round(Math.sqrt(famRisk.reduce((a, x) => a + (x / 1e9) ** 2, 0)) * 1e9);
  const loss = Math.round(combined * rb.M);
  const budget = Math.round(Math.max(0, rb.nav) * RULES.riskBudgetPct / 100);
  const pct = budget > 0 ? Math.round(loss / budget * 10000) / 100 : (loss > 0 ? 999 : 0);
  return { famRisk, combined, loss, budget, pct, M: rb.M, nav: rb.nav };
}

function scoreCheck(w) {
  const rows = w.final.standings.rows;
  const me = rows.find((x) => x.id === TEAM);
  const nav = w.teams[TEAM].navHist;
  const n = nav.length - 1;
  const tr = Math.round((nav[n] / nav[0] - 1) * 10000) / 100;
  const cash = Math.round(((1 + RULES.cashRatePct / 400) ** n - 1) * 10000) / 100;
  const ex = Math.round((tr - cash) * 100) / 100;
  const q = []; for (let k = 1; k <= n; k++) q.push(Math.round((nav[k] / nav[k - 1] - 1) * 10000) / 100);
  const mean = Math.round(q.reduce((a, b) => a + b, 0) / n * 100) / 100;
  const variance = Math.round(q.map((x) => Math.round((x - mean) ** 2 * 100) / 100).reduce((a, b) => a + b, 0) / n * 100) / 100;
  const swing = Math.round(Math.sqrt(variance) * 100) / 100;
  let peak = nav[0]; let deep = 0; for (const v of nav) { peak = Math.max(peak, v); deep = Math.max(deep, Math.round((peak - v) / peak * 10000) / 100); }
  const ra = Math.round((ex / Math.max(swing, RULES.swingFloorPct) - RULES.fallPenaltyPerPct * deep) * 100) / 100;
  const best = Math.max(...rows.filter((r) => r.stats.end >= r.stats.start && r.stats.riskAdj > 0).map((r) => r.stats.riskAdj));
  const rar = Math.round(60 * ra / best * 10) / 10;
  const fc = Math.round(25 * w.teams[TEAM].forecastPts / (10 * SCRIPT.quarters.length) * 10) / 10;
  const disc = Math.max(0, 15 - 5 * w.teams[TEAM].forced);
  const total = Math.round((rar + fc + disc) * 10) / 10;
  const ok = ra === me.stats.riskAdj && rar === me.rar && fc === me.forecast && disc === me.discipline && total === me.total;
  return { ok, tr, cash, ex, swing, deep, ra, best, rar, fc, disc, total, site: { ra: me.stats.riskAdj, rar: me.rar, fc: me.forecast, disc: me.discipline, total: me.total }, name: me.name, fpts: w.teams[TEAM].forecastPts, forced: w.teams[TEAM].forced };
}

function writeDoc(out) {
  const md = [];
  md.push('# Hand check: the maths, recomputed to the paisa', '');
  md.push('This file is produced by `node scripts/handcheck.mjs` and checked by `tests/handcheck.test.mjs` every time the tests run.');
  md.push('It plays the real six-round script, with every crisis released, with eight bot funds, then takes one fund (“Reads the economy”) and recomputes three rounds **by hand**:');
  md.push('the profit and loss on every position, the cash interest, the Risk Used at the bell, and finally the SPECULA Score — using only the prices, the positions and the rules written in the guide and in MODEL_EXPLAINED.md, not the engine’s accounting code.', '');
  md.push(`**Result: ${out.ok ? 'every figure matches the site exactly, to the paisa.' : 'MISMATCHES FOUND — see below.'}**`, '');
  for (const c of out.checks) {
    const label = c.q === 1 ? 'Markets in Normal Times (the Governor hoax and the crash)' : c.q === 4 ? 'the Run on the Dinar (the peg breaks), contagion and the Concord rescue' : 'the Verana Bond Auction, the Reckoning (a default) and the recovery';
    md.push(`## Round 0${c.q}: ${label}`, '');
    md.push(`Fund value: ${fmtRupees(c.navOpen)} at the start → ${fmtRupees(c.navEnd)} on the site; by hand ${fmtRupees(c.handNavEnd)}. ${c.handNavEnd === c.navEnd ? '✔ match' : '✘ MISMATCH'}`, '');
    md.push('| Position | Price | Currency | Carry | Cost | Crowd | Forced | Total |', '|---|---:|---:|---:|---:|---:|---:|---:|');
    for (const [id, l] of Object.entries(c.ledger)) {
      const t = l.price + l.currency + l.carry - l.cost + l.crowd - l.forced;
      md.push(`| ${INST[id].short} | ${fmtRupees(l.price)} | ${fmtRupees(l.currency)} | ${fmtRupees(l.carry)} | ${fmtRupees(-l.cost)} | ${fmtRupees(l.crowd)} | ${fmtRupees(-l.forced)} | ${fmtRupees(t)} |`);
    }
    md.push('', ...c.lines.map((x) => `- ${x}`));
    if (c.auction) md.push(`- Auction: ${fmtRupees(c.auction, { signed: true })}`);
    md.push('', 'The largest position, written out in full:', '', ...c.detail, '');
    md.push(`**Risk Used at the bell, by hand:** family risks ${c.risk.famRisk.map((x) => fmtRupees(x)).join(', ')}; combined √(sum of squares) = ${fmtRupees(c.risk.combined)}; × crisis multiplier ${c.risk.M} = ${fmtRupees(c.risk.loss)}; limit 15% × ${fmtRupees(c.risk.nav)} = ${fmtRupees(c.risk.budget)}; Risk Used = **${c.risk.pct}%**. ${c.diffs.some((d) => d.startsWith('Risk')) ? '✘' : '✔ matches the site'}`, '');
    if (c.diffs.length) md.push('Differences:', ...c.diffs.map((d) => `- ${d}`), '');
  }
  const s = out.score;
  md.push(`## The final SPECULA Score of “${s.name}”`, '');
  md.push(`- Total return ${s.tr}%; cash alone ${s.cash}%; earned by decisions ${s.ex}%`);
  md.push(`- Swing ${s.swing}% (standard deviation of the six round returns); deepest fall ${s.deep}%`);
  md.push(`- Risk-adjusted return = ${s.ex} ÷ ${Math.max(s.swing, 1)} − 0.10 × ${s.deep} = ${s.ra} (site ${s.site.ra})`);
  md.push(`- Risk-adjusted points = 60 × ${s.ra} ÷ best ${s.best} = ${s.rar} (site ${s.site.rar})`);
  md.push(`- Forecast points = 25 × ${s.fpts} ÷ 60 = ${s.fc} (site ${s.site.fc})`);
  md.push(`- Risk discipline = 15 − 5 × ${s.forced} = ${s.disc} (site ${s.site.disc})`);
  md.push(`- **SPECULA Score = ${s.rar} + ${s.fc} + ${s.disc} = ${s.total} (site ${s.site.total}) ${s.ok ? '✔' : '✘'}**`, '');
  writeFileSync(new URL('../HAND_CHECK.md', import.meta.url), md.join('\n'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = runHandCheck();
  writeDoc(out);
  console.log(out.ok ? 'Hand check: every figure matches to the paisa. Wrote HAND_CHECK.md' : `Hand check FAILED:\n${out.checks.flatMap((c) => c.diffs).join('\n')}`);
  if (!out.ok) process.exit(1);
}
