import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, openQuarter, settleQuarter, fireStage, stagesFor, deskNow, checkOrder, finalRelease, replayWindow } from '../src/engine/game.mjs';
import { rupeePrice, cdsPrice, bandMove } from '../src/engine/market.mjs';
import { riskUsed, forcedLiquidation } from '../src/engine/risk.mjs';
import { forecastPoints, specula, fundStats } from '../src/engine/scoring.mjs';
import { ledgerTotal, lineTotal } from '../src/engine/portfolio.mjs';
import { INSTRUMENTS, INST } from '../src/config/instruments.mjs';
import { RULES } from '../src/config/rules.mjs';
import { SCRIPT } from '../server/script.mjs';
import { r2, crToPaise, mulPct } from '../src/engine/num.mjs';
import { rng } from '../src/bots/bots.mjs';

const CR = 1e9;
const quiet = { id: 'test', quarters: Array.from({ length: 24 }, (_, i) => ({ q: i + 1, forecast: { econ: 'AUR', v: 'pi' }, data: {}, news: {} })), final: { data: {} } };

function order(w, team, list, o) {
  const c = checkOrder(w, team, list, o);
  assert.ok(c.ok, c.reason);
  list.push({ inst: o.inst, delta: c.delta, epoch: c.epoch });
  return c;
}

test('buying uses cash, costs the spread, and the fund value drops only by the cost', () => {
  let w = newGame([{ id: 'a', name: 'A' }], quiet);
  w = openQuarter(w, quiet, 1);
  const list = [];
  order(w, 'a', list, { inst: 'AUR10Y', side: 'buy', amountCr: 100 });
  const d = deskNow(w, 'a', list);
  assert.equal(d.st.pos.AUR10Y, 100 * CR);
  assert.equal(d.st.cash, 900 * CR - 0.1 * CR); // 0.10% of ₹100 Cr = ₹0.10 Cr
  assert.equal(d.nav, 1000 * CR - 0.1 * CR);
});

test('the desk refuses any order beyond three times fund value; reducing is always allowed', () => {
  let w = newGame([{ id: 'a', name: 'A' }], quiet);
  w = openQuarter(w, quiet, 1);
  const list = [];
  order(w, 'a', list, { inst: 'AURFUT', side: 'buy', amountCr: 2000 });
  order(w, 'a', list, { inst: 'CALFUT', side: 'sell', amountCr: 900 });
  const no = checkOrder(w, 'a', list, { inst: 'VERFUT', side: 'buy', amountCr: 200 });
  assert.equal(no.ok, false);
  assert.match(no.reason, /3×/);
  const yes = checkOrder(w, 'a', list, { inst: 'AURFUT', side: 'sell', amountCr: 500 });
  assert.equal(yes.ok, true);
  const close = checkOrder(w, 'a', list, { inst: 'CALFUT', side: 'close' });
  assert.equal(close.delta, 900 * CR);
});

test('rate futures settle at 100 minus the rate the central bank sets', () => {
  const sc = structuredClone(quiet);
  sc.quarters[1].data = { AUR: { pi: 1.0 } }; // an inflation surprise the market did not expect
  let w = newGame([{ id: 'a', name: 'A' }], sc);
  w = openQuarter(w, sc, 1);
  w = settleQuarter(w, sc, { orders: {} }).world;
  w = openQuarter(w, sc, 2);
  const F = w.mkt.px.fut.AUR;
  const list = [];
  order(w, 'a', list, { inst: 'AURFUT', side: 'sell', amountCr: 1000 });
  const { world, result } = settleQuarter(w, sc, { orders: { a: list } });
  const S = 100 - result.decisions.AUR.iNew;
  assert.ok(S < F, 'the surprise means a bigger hike than the market expected');
  const l = result.teams.a.ledger.byInst.AURFUT;
  assert.equal(l.price[0].amount, mulPct(-1000 * CR, r2(S - F)));
  assert.ok(l.price[0].amount > 0, 'selling the future before a surprise hike makes money');
  assert.equal(world.teams.a.pos.AURFUT, -1000 * CR); // the position rolls into next quarter's contract
});

test('ledger lines add up exactly to the change in fund value, quarter after quarter, through every crisis', () => {
  const teams = ['a', 'b', 'c'].map((id) => ({ id, name: id }));
  let w = newGame(teams, SCRIPT);
  const R = rng(42);
  for (let q = 1; q <= 24; q++) {
    w = openQuarter(w, SCRIPT, q);
    const orders = { a: [], b: [], c: [] };
    const stages = stagesFor(SCRIPT, q);
    for (let k = 0; k <= stages.length; k++) {
      if (k > 0) w = fireStage(w, SCRIPT, stages[k - 1].id).world;
      for (const t of ['a', 'b', 'c']) {
        for (let j = 0; j < 4; j++) {
          const x = INSTRUMENTS[Math.floor(R() * 44)];
          const o = R() < 0.15 ? { inst: x.id, side: 'close' } : { inst: x.id, side: R() < 0.5 ? 'buy' : 'sell', amountCr: Math.round(R() * 30000) / 100 };
          const c = checkOrder(w, t, orders[t], o);
          if (c.ok) orders[t].push({ inst: x.id, delta: c.delta, epoch: c.epoch });
        }
      }
    }
    const bids = q === 21 ? { a: { price: rupeePrice(w.mkt, 'VER10Y') * 0.99, amountCr: 100 }, b: { price: rupeePrice(w.mkt, 'VER10Y') * 1.02, amountCr: 250 } } : {};
    const res = settleQuarter(w, SCRIPT, { orders, forecasts: { a: 4, b: null }, bids });
    for (const t of ['a', 'b', 'c']) {
      const r = res.result.teams[t];
      assert.equal(ledgerTotal(r.ledger), r.navEnd - r.navOpen, `Q${q} ${t}`);
      for (const v of Object.values(res.world.teams[t].pos)) assert.ok(Number.isInteger(v));
      assert.ok(Number.isInteger(res.world.teams[t].cash));
    }
    w = res.world;
  }
  w = finalRelease(w, SCRIPT);
  assert.equal(w.final.standings.rows.length, 3);
});

test('the whole game is deterministic: an engine-only replay gives identical results', () => {
  const run = () => {
    let w = newGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], SCRIPT);
    for (let q = 1; q <= 24; q++) {
      w = openQuarter(w, SCRIPT, q);
      const orders = { a: [], b: [] };
      const c = checkOrder(w, 'a', [], { inst: q % 2 ? 'AUREQ' : 'GOLD', side: 'buy', amountCr: 50 });
      orders.a.push({ inst: q % 2 ? 'AUREQ' : 'GOLD', delta: c.delta, epoch: 0 });
      for (const s of stagesFor(SCRIPT, q)) w = fireStage(w, SCRIPT, s.id).world;
      w = settleQuarter(w, SCRIPT, { orders, forecasts: { a: 3 } }).world;
    }
    return JSON.stringify(finalRelease(w, SCRIPT).final.standings.rows.map((r) => [r.id, r.total, r.nav]));
  };
  assert.equal(run(), run());
});

test('a crisis moves prices at once and positions are revalued immediately', () => {
  let w = newGame([{ id: 'a', name: 'A' }], SCRIPT);
  for (let q = 1; q < 14; q++) {
    w = openQuarter(w, SCRIPT, q);
    for (const s of stagesFor(SCRIPT, q)) w = fireStage(w, SCRIPT, s.id).world;
    w = settleQuarter(w, SCRIPT, { orders: {} }).world;
  }
  w = openQuarter(w, SCRIPT, 14);
  const list = [];
  order(w, 'a', list, { inst: 'DINAR', side: 'buy', amountCr: 100 });
  const before = deskNow(w, 'a', list).st.pos.DINAR;
  w = fireStage(w, SCRIPT, 'dinar-1').world;
  w = fireStage(w, SCRIPT, 'dinar-2').world; // the peg breaks
  const after = deskNow(w, 'a', list).st.pos.DINAR;
  assert.ok(after < before * 0.7, `dinar holding should fall by about a third: ${before} -> ${after}`);
  assert.equal(w.mkt.econ.KES.pegBroken, true);
  // orders placed after the crisis trade at the new price
  const list2 = [...list];
  order(w, 'a', list2, { inst: 'DINAR', side: 'buy', amountCr: 10 });
  assert.equal(list2[1].epoch, 2);
});

test('default protection pays out in full when a default happens', () => {
  let w = newGame([{ id: 'a', name: 'A' }], SCRIPT);
  for (let q = 1; q < 18; q++) {
    w = openQuarter(w, SCRIPT, q);
    for (const s of stagesFor(SCRIPT, q)) w = fireStage(w, SCRIPT, s.id).world;
    w = settleQuarter(w, SCRIPT, { orders: {} }).world;
  }
  w = openQuarter(w, SCRIPT, 18);
  const p0 = w.mkt.px.cds.BANKCDS;
  const list = [];
  order(w, 'a', list, { inst: 'BANKCDS', side: 'buy', amountCr: 100 });
  w = fireStage(w, SCRIPT, 'halvard-1').world;
  const p1 = w.mkt.px.cds.BANKCDS;
  const cashBefore = deskNow(w, 'a', list).st.cash;
  w = fireStage(w, SCRIPT, 'halvard-2').world;
  const d = deskNow(w, 'a', list);
  assert.equal(d.st.pos.BANKCDS, undefined); // paid out and closed
  assert.equal(d.st.cash - cashBefore, mulPct(100 * CR, r2(100 - p1) === 100 - p1 ? 100 - p1 : 100 - p1));
  assert.ok(p1 > p0);
});

test('Risk Used: bigger and more volatile positions use more; offsetting positions count for less', () => {
  const sigma = Object.fromEntries(INSTRUMENTS.map((x) => [x.id, x.sigma0]));
  const nav = 1000 * CR;
  const one = riskUsed({ AUREQ: 500 * CR }, nav, sigma, 1);
  assert.equal(one.lines[0].bad, 10); // 2 × 5%
  assert.equal(one.loss, 50 * CR);
  assert.equal(one.pct, r2(50 / 150 * 100));
  const two = riskUsed({ AUREQ: 1000 * CR }, nav, sigma, 1);
  assert.ok(Math.abs(two.pct - one.pct * 2) <= 0.011);
  const hedged = riskUsed({ AUREQ: 500 * CR, CALEQ: -500 * CR * 5 / 6 }, nav, sigma, 1);
  assert.ok(hedged.pct < one.pct * 2 && hedged.pct < riskUsed({ AUREQ: 500 * CR, CALEQ: 500 * CR * 5 / 6 }, nav, sigma, 1).pct);
  const crisis = riskUsed({ AUREQ: 500 * CR }, nav, sigma, 1.5);
  assert.ok(Math.abs(crisis.pct - one.pct * 1.5) <= 0.011);
});

test('forced liquidation closes the largest positions down to 80% at a price 2% worse', () => {
  const sigma = Object.fromEntries(INSTRUMENTS.map((x) => [x.id, x.sigma0]));
  const nav = 1000 * CR;
  const pos = { AUREQ: 1500 * CR, GOLD: 200 * CR, OIL: 100 * CR };
  const fl = forcedLiquidation(pos, nav, sigma, 1.2);
  assert.equal(fl.forced, true);
  assert.ok(fl.before.pct > 100);
  assert.ok(fl.after.pct <= 80 && fl.after.pct > 79, String(fl.after.pct));
  assert.equal(fl.closed[0].id, 'AUREQ'); // the largest first
  const none = forcedLiquidation({ AUREQ: 100 * CR }, nav, sigma, 1);
  assert.equal(none.forced, false);
});

test('a forced liquidation is recorded and costs 5 SPECULA points', () => {
  let w = newGame([{ id: 'a', name: 'A' }], quiet);
  w = openQuarter(w, quiet, 1);
  const list = [];
  order(w, 'a', list, { inst: 'SAREQ', side: 'buy', amountCr: 1000 });
  order(w, 'a', list, { inst: 'KESEQ', side: 'buy', amountCr: 1000 });
  const { world, result } = settleQuarter(w, quiet, { orders: { a: list } });
  assert.ok(result.teams.a.forced);
  assert.ok(result.teams.a.forced.after <= 80);
  assert.equal(world.teams.a.forced, 1);
  const pen = Object.values(result.teams.a.ledger.byInst).reduce((a, l) => a + l.forced, 0);
  const closed = result.teams.a.forced.closed.reduce((a, c) => a + Math.abs(c.amount), 0);
  assert.ok(Math.abs(pen - closed * 0.02) <= result.teams.a.forced.closed.length);
  assert.equal(result.standings[0].discipline, 10);
});

test('unused cash earns the cash rate; borrowing costs the cash rate plus 1%', () => {
  let w = newGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], quiet);
  w = openQuarter(w, quiet, 1);
  const la = []; const lb = [];
  order(w, 'b', lb, { inst: 'AUR2Y', side: 'buy', amountCr: 2000 });
  const { result } = settleQuarter(w, quiet, { orders: { a: la, b: lb } });
  assert.equal(result.teams.a.ledger.cashInterest, mulPct(1000 * CR, 1.5));
  const wb = result.teams.b.ledger.cashInterestWork;
  assert.equal(wb.ratePa, 7);
  assert.ok(wb.base < 0 && result.teams.b.ledger.cashInterest < 0);
});

test('crowd impact: buying with the crowd costs more, trading against it pays', () => {
  const teams = 'abcdef'.split('').map((id) => ({ id, name: id }));
  let w = newGame(teams, quiet);
  w = openQuarter(w, quiet, 1);
  const orders = {};
  for (const t of 'abcde') { orders[t] = []; order(w, t, orders[t], { inst: 'SAREQ', side: 'buy', amountCr: 300 }); }
  orders.f = []; order(w, 'f', orders.f, { inst: 'SAREQ', side: 'sell', amountCr: 100 });
  const { result } = settleQuarter(w, quiet, { orders });
  const imp = result.crowd.SAREQ;
  assert.equal(imp.pct, r2(1.0 * 1400 / 1200)); // net ₹1,400 Cr against depth ₹1,200 Cr
  assert.ok(result.teams.a.ledger.byInst.SAREQ.crowd < 0);
  assert.ok(result.teams.f.ledger.byInst.SAREQ.crowd > 0);
});

test('forecast points: 10 for exact, lose 1 per 0.1 off, never below 0, blank is 0', () => {
  assert.equal(forecastPoints(4.5, 4.5).points, 10);
  assert.equal(forecastPoints(4.3, 4.5).points, 8);
  assert.equal(forecastPoints(4.55, 4.5).points, 9.5);
  assert.equal(forecastPoints(2.0, 4.5).points, 0);
  assert.equal(forecastPoints(null, 4.5).points, 0);
  assert.equal(forecastPoints('', 4.5).points, 0);
});

test('SPECULA Score: best risk-adjusted fund gets 60, below ₹1,000 Cr gets 0 there, discipline 15 − 5 each', () => {
  const s = 1000 * CR;
  const funds = [
    { id: 'a', name: 'A', navHist: [s, 1.05 * s, 1.08 * s, 1.15 * s], forecastPoints: 30, forced: 0 },
    { id: 'b', name: 'B', navHist: [s, 1.2 * s, 0.9 * s, 1.3 * s], forecastPoints: 10, forced: 1 },
    { id: 'c', name: 'C', navHist: [s, 0.9 * s, 0.8 * s, 0.95 * s], forecastPoints: 30, forced: 4 },
  ];
  const { rows, best } = specula(funds, 3);
  const A = rows.find((r) => r.id === 'a'); const B = rows.find((r) => r.id === 'b'); const C = rows.find((r) => r.id === 'c');
  assert.equal(A.rar, 60);
  assert.ok(B.rar < 60 && B.rar >= 0);
  assert.equal(C.rar, 0);
  assert.equal(C.discipline, 0);
  assert.equal(B.discipline, 10);
  assert.equal(A.forecast, 25);
  assert.equal(rows[0].id, 'a');
  assert.equal(best, A.stats.riskAdj);
});

test('ties on the SPECULA Score go to the higher final fund value', () => {
  const s = 1000 * CR;
  const { rows } = specula([
    { id: 'x', name: 'X', navHist: [s, s], forecastPoints: 0, forced: 0 },
    { id: 'y', name: 'Y', navHist: [s, s + 5], forecastPoints: 0, forced: 0 },
  ], 1);
  assert.equal(rows[0].total, rows[1].total);
  assert.equal(rows[0].id, 'y');
});

test('fund statistics: swing is the standard deviation of quarterly returns; deepest fall from a peak', () => {
  const s = 1000;
  const st = fundStats([s, 1100, 990, 1089]);
  assert.deepEqual(st.qret, [10, -10, 10]);
  assert.equal(st.deepest, 10);
  assert.equal(st.mean, 3.33);
});

test('Calder’s mark stays inside its band and the reserves pay for holding it', () => {
  const C = { markPerCrown: 7.5, band: { centre: 7.5, width: 2 } };
  const r = bandMove(C, 5);
  assert.equal(r.mpc, 7.65);
  assert.ok(r.reserveChange < 0);
  assert.equal(bandMove(C, 1).mpc, 7.575);
});

test('default protection price rises with default risk', () => {
  assert.ok(cdsPrice(2) < cdsPrice(5));
  assert.ok(cdsPrice(30) < 100);
  assert.equal(cdsPrice(0), 0);
});

test('the script: 24 quarters, one forecast each, crises only in their quarters, one auction in Round 06', () => {
  assert.equal(SCRIPT.quarters.length, 24);
  const ids = new Set();
  for (const q of SCRIPT.quarters) {
    assert.ok(['g', 'pi', 'u', 'i'].includes(q.forecast.v), `Q${q.q}`);
    for (const c of q.crises || []) for (const s of c.stages) { assert.ok(!ids.has(s.id), s.id); ids.add(s.id); }
  }
  assert.deepEqual(SCRIPT.quarters.filter((q) => q.auction).map((q) => q.q), [21]);
  assert.ok(ids.size >= 20, `${ids.size} crisis stages`);
});
