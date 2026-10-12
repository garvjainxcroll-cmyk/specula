// The game, quarter by quarter. Pure functions: (world, inputs) -> new world + result.
// The same functions run on the server (live game), in the browser (practice), and in
// the tests (engine-only replay), so all three always agree.

import { ECONOMIES, ECON_ORDER } from '../config/economies.mjs';
import { INSTRUMENTS, INST, INST_IDS } from '../config/instruments.mjs';
import { RULES, roundOf, ROUNDS } from '../config/rules.mjs';
import { r1, r2, r4, crToPaise, mulRatioChange } from './num.mjs';
import { startRelease, computeRelease, decideAll, figsFromRelease, reviseRelease } from './macro.mjs';
import { initialMarket, settleMarket, crisisMarket, marketFigs, futuresFromExpectation, carryRates, rupeePrice } from './market.mjs';
import { riskUsed, forcedLiquidation, grossExposure, updateSigma } from './risk.mjs';
import { freshState, newLedger, applyOrder, revalue, applyForced, applyCarry, applyCashInterest, crowdImpacts, applyCrowd, navOf, ledgerTotal, isFunded } from './portfolio.mjs';
import { forecastPoints, specula } from './scoring.mjs';

const clone = (x) => structuredClone(x);
const view = (w) => ({ release: w.release, econ: w.mkt.econ, glob: w.mkt.glob, moves: w.moves });

export function newGame(teams, script) {
  const release = startRelease();
  release.econ = Object.fromEntries(Object.entries(release.econ).map(([e, r]) => [e, { ...r, delta: {} }]));
  if (script.start) {
    // a scenario may start the world from different figures (the practice game does)
    for (const [e, f] of Object.entries(script.start)) {
      Object.assign(release.econ[e], f);
      release.econ[e].exp = { ...release.econ[e].exp, g: release.econ[e].g, pi: release.econ[e].pi, u: release.econ[e].u };
    }
    release.note = 'Starting position of every economy in this scenario.';
  }
  const mkt = initialMarket(release);
  const sigma = Object.fromEntries(INSTRUMENTS.map((x) => [x.id, x.sigma0]));
  const start = crToPaise(RULES.startFundCr);
  const world = {
    v: 1, scriptId: script.id, q: 0, release, mkt, sigma,
    moves: { oil: 0, copper: 0, wheat: 0, fx: Object.fromEntries(ECON_ORDER.map((e) => [e, 0])), markPerCrownPct: 0, dinarPerCrownPct: 0 },
    round: { n: 1, mods: {}, spreadMult: { all: 1, econ: {} }, M: 1 },
    teams: {}, history: [], run: null, final: null,
    lastPx: clone(mkt.px),
  };
  for (const t of teams) world.teams[t.id] = newTeam(t, start);
  return world;
}

export function newTeam(t, start = crToPaise(RULES.startFundCr)) {
  return { id: t.id, name: t.name, cash: start, pos: {}, open: {}, navHist: [start], forecastPts: 0, forecasts: {}, forced: 0, forcedQs: [] };
}

function spreadsFor(round) {
  const out = {};
  for (const x of INSTRUMENTS) {
    const m = (round.spreadMult.all || 1) * ((x.econ && round.spreadMult.econ?.[x.econ]) || 1);
    out[x.id] = r2(x.spread * m);
  }
  return out;
}

function mergeMods(mods, rules = []) {
  const out = clone(mods);
  for (const r of rules) { const { econ, ...rest } = r; out[econ] = { ...(out[econ] || {}), ...rest }; }
  return out;
}

const specialDeltas = (prev, cur) => {
  const d = {};
  for (const k of ['oilOutput', 'harvest', 'copperOutput', 'badLoans', 'reserves', 'bankShare']) {
    if (cur.special[k] !== undefined && prev.special[k] !== undefined) d[k] = r2(cur.special[k] - prev.special[k]);
  }
  return d;
};

/** The data drop. Opens quarter q (desk unlocks when the window starts). */
export function openQuarter(world0, script, q) {
  if (q !== world0.q + 1) throw new Error(`Cannot open Q${q}: last settled quarter is Q${world0.q}`);
  if (q > script.quarters.length) throw new Error(`This game has ${script.quarters.length} quarters`);
  const world = clone(world0);
  const n = roundOf(q);
  const newRound = n !== world.round.n || q === 1;
  if (newRound) {
    const hadBand = world.round.mods.CAL?.band;
    world.round = { n, mods: {}, spreadMult: { all: 1, econ: {} }, M: 1 };
    const C = world.mkt.econ.CAL;
    if (hadBand || C.band.width !== ECONOMIES.CAL.band.width) C.band = { centre: C.markPerCrown, width: ECONOMIES.CAL.band.width };
  }
  const sq = script.quarters[q - 1];
  let release;
  if (q === 1) {
    release = world.release; release.q = 1;
  } else {
    release = computeRelease(view(world), q, sq.data || {});
    for (const e of ECON_ORDER) release.econ[e].delta = specialDeltas(world.release.econ[e].orig || world.release.econ[e], release.econ[e]);
  }
  world.mkt.econ.CAL.reserves = release.econ.CAL.special.reserves;
  // mark the forecasts made last quarter against this release
  const marked = q > 1 ? markForecasts(world, script, q - 1, release) : null;
  world.release = release;
  const exp = decideAll(world.mkt, marketFigs(release), world.round.mods);
  world.mkt.px.fut = futuresFromExpectation(exp);
  const spreads = spreadsFor(world.round);
  world.run = {
    q, round: n, roundName: ROUNDS[n - 1].name, newRound,
    headlines: sq.headlines || [], forecast: sq.forecast, auction: sq.auction || null,
    exp, spreads, M: world.round.M,
    open: { mpc: world.mkt.econ.CAL.markPerCrown, dpc: world.mkt.econ.KES.dinarPerCrown, px: clone(world.mkt.px), fear: world.mkt.glob.fear },
    epochs: [{ idx: 0, label: 'Window opens', stageId: null, px: clone(world.mkt.px), spreads, M: world.round.M }],
    fired: [], marked,
  };
  return world;
}

function markForecasts(world, script, fq, release) {
  const spec = script.quarters[fq - 1].forecast;
  const actual = release.econ[spec.econ][spec.v];
  const out = { q: fq, spec, actual, teams: {} };
  for (const t of Object.values(world.teams)) {
    const f = t.forecasts[fq];
    const res = forecastPoints(f?.value ?? null, actual);
    t.forecasts[fq] = { ...(f || {}), ...res, spec };
    t.forecastPts = r1(t.forecastPts + res.points);
    out.teams[t.id] = res;
  }
  return out;
}

/** All the crisis stages scripted for the current quarter, in order. */
export function stagesFor(script, q) {
  const sq = script.quarters[q - 1];
  const list = [];
  for (const c of sq.crises || []) c.stages.forEach((s, k) => list.push({ ...s, crisisId: c.id, crisisTitle: c.title, stageNo: k + 1, of: c.stages.length }));
  return list;
}

/** Release one crisis stage. Prices react at once. */
export function fireStage(world0, script, stageId) {
  const world = clone(world0);
  const run = world.run;
  if (!run) throw new Error('No quarter is open');
  const stages = stagesFor(script, run.q);
  const idx = stages.findIndex((s) => s.id === stageId);
  if (idx < 0) throw new Error(`No stage ${stageId} in Q${run.q}`);
  if (run.fired.includes(stageId)) throw new Error('That stage has already been released');
  const st = stages[idx];
  const prevSame = stages.filter((s) => s.crisisId === st.crisisId && s.stageNo < st.stageNo);
  if (prevSame.some((s) => !run.fired.includes(s.id))) throw new Error('Release the earlier stage of this crisis first');

  const relBefore = world.release;
  const relAfter = reviseRelease(relBefore, st.data, st.title);
  const modsBefore = world.round.mods;
  const modsAfter = mergeMods(modsBefore, st.rules);
  const expBefore = decideAll(world.mkt, marketFigs(relBefore), modsBefore);
  const expAfter = decideAll(world.mkt, marketFigs(relAfter), modsAfter);
  const pxBefore = clone(world.mkt.px);
  const res = crisisMarket(world, st, relBefore, relAfter, expBefore, expAfter, modsAfter);
  world.mkt = res.mkt;
  world.release = relAfter;
  world.round.mods = modsAfter;
  if (st.spreadMult) {
    if (st.spreadMult.all) world.round.spreadMult.all = Math.max(world.round.spreadMult.all, st.spreadMult.all);
    for (const [e, m] of Object.entries(st.spreadMult.econ || {})) world.round.spreadMult.econ[e] = Math.max(world.round.spreadMult.econ[e] || 1, m);
  }
  if (st.M) world.round.M = Math.max(world.round.M, st.M);
  // risk responds at once to violent moves
  for (const x of INSTRUMENTS) {
    const r = jumpReturn(x, pxBefore, world.mkt.px, res.rets[x.id]);
    if (r !== null) world.sigma[x.id] = updateSigma(world.sigma[x.id], r, x.sigma0 * 0.75);
  }
  const spreads = spreadsFor(world.round);
  run.exp = expAfter;
  run.spreads = spreads; run.M = world.round.M;
  run.fired.push(stageId);
  run.epochs.push({ idx: run.epochs.length, label: st.title, stageId, px: clone(world.mkt.px), rets: res.rets, spreads, M: world.round.M });
  return { world, event: { stage: st, rets: res.rets, info: res.info, revisions: relAfter.revisions.filter((r) => r.label === st.title) } };
}

function jumpReturn(x, a, b, ret) {
  if (x.kind === 'future') return r2(b.fut[x.econ] - a.fut[x.econ]);
  if (x.kind === 'cds') return ret?.defaulted ? r2(100 - a.cds[x.id]) : r2(b.cds[x.id] - a.cds[x.id]);
  const pa = rupee(x, a); const pb = rupee(x, b);
  if (!pa) return null;
  const r = r2((pb / pa - 1) * 100);
  return r === 0 ? null : r;
}
function rupee(x, px) {
  if (x.kind === 'fx') return px.fx[x.econ];
  const lp = px.lp[x.id];
  return x.ccy ? lp * px.fx[x.ccy] : lp;
}

// ---------------- the desk during the window ----------------

/**
 * Replay a team's quarter so far: positions, cash and ledger at the current epoch.
 * orders: [{ epoch, inst, delta }] (resolved, in time order).
 */
export function replayWindow(world, teamId, orders) {
  const run = world.run;
  const team = world.teams[teamId];
  const st = freshState(team);
  const led = newLedger();
  const defaults = [];
  const lastEpoch = run.epochs.length - 1;
  for (let e = 0; e <= lastEpoch; e++) {
    const ep = run.epochs[e];
    if (e > 0) defaults.push(...revalue(st, led, run.epochs[e - 1].px, ep.px, ep.rets, ep.label));
    for (const o of orders.filter((o) => o.epoch === e)) applyOrder(st, led, o.inst, o.delta, ep.spreads[o.inst], ep.label);
  }
  return { st, led, defaults };
}

/** What the desk shows right now for one team. */
export function deskNow(world, teamId, orders) {
  const { st, led } = replayWindow(world, teamId, orders);
  const nav = navOf(st);
  const gross = grossExposure(st.pos);
  const risk = riskUsed(st.pos, nav, world.sigma, world.round.M);
  return { st, led, nav, gross, exposure: nav > 0 ? r2(gross / nav) : null, risk, pnlSoFar: ledgerTotal(led) };
}

/**
 * Check and resolve an order. order = { inst, side: 'buy'|'sell'|'close', amountCr }.
 * Returns { ok, delta, reason }. The desk refuses any order beyond 3× fund value.
 */
export function checkOrder(world, teamId, orders, order) {
  const run = world.run;
  if (!run) return { ok: false, reason: 'The window is closed.' };
  const x = INST[order.inst];
  if (!x) return { ok: false, reason: 'Unknown instrument.' };
  const now = deskNow(world, teamId, orders);
  const cur = now.st.pos[order.inst] || 0;
  let delta;
  if (order.side === 'close') {
    if (!cur) return { ok: false, reason: 'You have no position to close.' };
    const part = order.amountCr ? Math.min(Math.abs(cur), crToPaise(order.amountCr)) : Math.abs(cur);
    delta = -Math.sign(cur) * part;
  } else {
    const amt = Number(order.amountCr);
    if (!Number.isFinite(amt) || amt <= 0) return { ok: false, reason: 'Enter an amount above zero.' };
    if (amt > 100000) return { ok: false, reason: 'That amount is too large.' };
    const p = crToPaise(Math.round(amt * 100) / 100);
    delta = order.side === 'buy' ? p : -p;
  }
  const after = { ...now.st.pos, [order.inst]: cur + delta };
  if (!after[order.inst]) delete after[order.inst];
  const cost = Math.round(Math.abs(delta) * run.spreads[order.inst] / 100);
  const navAfter = now.nav - cost;
  const grossAfter = grossExposure(after);
  const reducing = Math.abs(cur + delta) < Math.abs(cur) && Math.sign(cur + delta) !== -Math.sign(cur);
  if (!reducing && grossAfter > RULES.leverageLimit * navAfter) {
    const room = Math.max(0, RULES.leverageLimit * navAfter - (now.gross));
    return { ok: false, reason: `Refused: all positions together would reach ${r2(grossAfter / Math.max(1, navAfter))}× your fund value. The limit is 3×. Room left: ₹${r2(room / 1e9)} Cr.` };
  }
  return { ok: true, delta, cost, epoch: run.epochs.length - 1 };
}

// ---------------- settlement ----------------

/**
 * At zero the desk locks, central banks act and prices reset.
 * inputs: { orders: {teamId: [...]}, forecasts: {teamId: number|null}, bids: {teamId: {price, amountCr}} }
 */
export function settleQuarter(world0, script, inputs) {
  const world = clone(world0);
  const run = world.run;
  if (!run) throw new Error('No quarter is open');
  const q = run.q;
  const stages = stagesFor(script, q);
  const unfired = stages.filter((s) => !run.fired.includes(s.id));
  if (unfired.length) throw new Error(`Release the crisis first: ${unfired.map((s) => s.title).join(', ')}`);
  const sq = script.quarters[q - 1];
  const teamIds = Object.keys(world.teams).sort();
  const per = {};

  // 1. the window, replayed
  for (const id of teamIds) {
    const orders = (inputs.orders?.[id] || []).slice();
    const { st, led, defaults } = replayWindow(world, id, orders);
    per[id] = { st, led, defaults, navOpen: world.teams[id].navHist[world.teams[id].navHist.length - 1] };
  }
  // 2. the bell: forced liquidation if Risk Used is above 100%
  for (const id of teamIds) {
    const p = per[id];
    p.navBell = navOf(p.st);
    const fl = forcedLiquidation(p.st.pos, p.navBell, world.sigma, world.round.M);
    p.riskBell = fl.before;
    p.forced = fl.forced ? { closed: fl.closed, before: fl.before.pct, after: fl.after.pct, penalty: applyForced(p.st, p.led, fl.closed) } : null;
    if (fl.forced) { world.teams[id].forced += 1; world.teams[id].forcedQs.push(q); }
  }
  // 3. interest and premiums on what is held at the bell
  const carry = carryRates(world.mkt);
  for (const id of teamIds) { applyCashInterest(per[id].st, per[id].led); applyCarry(per[id].st, per[id].led, carry); }
  // 4. central banks act on the release (with any crisis revisions and rule changes)
  const decisions = decideAll(world.mkt, figsFromRelease(world.release), world.round.mods);
  // 5. prices reset
  const news = mergeNews(sq.news || {}, ...run.fired.map((sid) => stages.find((s) => s.id === sid).settle || {}));
  const pxBell = clone(world.mkt.px);
  const sm = settleMarket(world, world.release, decisions, news, world.round.mods);
  for (const id of teamIds) revalue(per[id].st, per[id].led, pxBell, sm.mkt.px, sm.rets, 'Settlement');
  // 6. crowd impact
  const crowd = crowdImpacts(Object.fromEntries(teamIds.map((id) => [id, per[id].st.flow])));
  for (const id of teamIds) applyCrowd(per[id].st, per[id].led, crowd);
  // 7. a round decision: the auction
  let auction = null;
  if (sq.auction) auction = runAuction(sq.auction, inputs.bids || {}, per, sm.mkt, teamIds, world);
  // 8. book it
  const settledPx = sm.mkt.px;
  world.mkt = sm.mkt;
  const results = {};
  for (const id of teamIds) {
    const t = world.teams[id];
    const p = per[id];
    t.cash = p.st.cash; t.pos = p.st.pos; t.open = p.st.open;
    const navEnd = navOf(p.st);
    t.navHist.push(navEnd);
    const fv = inputs.forecasts?.[id];
    t.forecasts[q] = { value: fv === undefined || fv === null || fv === '' ? null : r2(Number(fv)), spec: sq.forecast };
    results[id] = {
      navOpen: p.navOpen, navBell: p.navBell, navEnd, pnl: navEnd - p.navOpen,
      ledger: p.led, check: ledgerTotal(p.led), forced: p.forced, riskBell: p.riskBell,
      defaults: p.defaults, forecast: t.forecasts[q].value,
    };
    if (results[id].check !== results[id].pnl) throw new Error(`Ledger does not add up for ${id}: ${results[id].check} vs ${results[id].pnl}`);
  }
  // 9. how sharply each instrument has been moving, over the whole quarter
  for (const x of INSTRUMENTS) {
    const r = jumpReturn(x, run.open.px, settledPx, null);
    world.sigma[x.id] = updateSigma(world.sigma[x.id], r ?? 0, x.sigma0 * 0.75);
  }
  world.moves = quarterMoves(run, world);
  world.q = q;
  const standings = specula(teamIds.map((id) => fundRow(world.teams[id])), Math.max(1, q - 1));
  const epochs = run.epochs.map((e) => ({ idx: e.idx, label: e.label, stageId: e.stageId, rets: e.rets || null, spreads: e.spreads, M: e.M }));
  const result = { q, round: run.round, decisions, market: sm.info, rets: sm.rets, crowd, auction, carry, teams: results, standings: standings.rows.map(slimRow), stages: run.fired, epochs, pxOpen: run.open.px, pxBell: pxBell, pxSettled: settledPx, release: world.release };
  world.history.push(historyRow(world, result, sm, run));
  world.prevPx = world.lastPx;
  world.lastPx = settledPx;
  world.lastRun = { ...run, epochs: run.epochs.map(({ px, rets, ...e }) => e) };
  world.run = null;
  return { world, result };
}

function fundRow(t) {
  return { id: t.id, name: t.name, navHist: t.navHist, forecastPoints: t.forecastPts, forced: t.forced };
}
function slimRow(r) { return { id: r.id, name: r.name, rank: r.rank, nav: r.nav, total: r.total, rar: r.rar, forecast: r.forecast, discipline: r.discipline }; }

function mergeNews(...list) {
  const out = {};
  for (const n of list) {
    for (const [k, v] of Object.entries(n)) {
      if (v && typeof v === 'object' && !('v' in v)) {
        out[k] = out[k] || {};
        for (const [e, x] of Object.entries(v)) out[k][e] = addNews(out[k][e], x);
      } else out[k] = addNews(out[k], v);
    }
  }
  return out;
}
function addNews(a, b) {
  const va = (a && typeof a === 'object' ? a.v : a) || 0; const vb = (b && typeof b === 'object' ? b.v : b) || 0;
  const wa = a && typeof a === 'object' ? a.why : null; const wb = b && typeof b === 'object' ? b.why : null;
  return { v: r2(va + vb), why: [wa, wb].filter(Boolean).join('; ') || undefined };
}

function quarterMoves(run, world) {
  const a = run.open.px; const b = world.mkt.px;
  const pct = (x, y) => r2((y / x - 1) * 100);
  const fx = {};
  for (const e of ECON_ORDER) fx[e] = pct(a.fx[e], b.fx[e]);
  return {
    oil: pct(a.lp.OIL, b.lp.OIL), copper: pct(a.lp.COPPER, b.lp.COPPER), wheat: pct(a.lp.WHEAT, b.lp.WHEAT), fx,
    markPerCrownPct: pct(run.open.mpc, world.mkt.econ.CAL.markPerCrown),
    dinarPerCrownPct: pct(run.open.dpc, world.mkt.econ.KES.dinarPerCrown),
  };
}

function historyRow(world, result, sm, run) {
  const econ = {};
  for (const e of ECON_ORDER) {
    const r = world.release.econ[e];
    econ[e] = { g: r.g, pi: r.pi, u: r.u, i: world.mkt.econ[e].i, y10: world.mkt.econ[e].y10 };
  }
  const prices = Object.fromEntries(INST_IDS.map((id) => [id, r4(rupeePrice(world.mkt, id))]));
  const nav = Object.fromEntries(Object.values(world.teams).map((t) => [t.id, t.navHist[t.navHist.length - 1]]));
  return { q: result.q, econ, prices, nav, fear: world.mkt.glob.fear, standings: result.standings, stages: run.fired, decisions: Object.fromEntries(ECON_ORDER.map((e) => [e, result.decisions[e].iNew])) };
}

function runAuction(spec, bids, per, mkt, teamIds, world) {
  const fair = r4(rupeePrice(mkt, spec.inst));
  const valid = [];
  for (const id of teamIds) {
    const b = bids[id];
    if (!b || !(b.amountCr > 0) || !(b.price > 0)) continue;
    const navOpen = per[id].navOpen;
    const maxP = Math.floor(navOpen * spec.maxPctOfFund / 100);
    const amount = Math.min(crToPaise(Math.round(b.amountCr * 100) / 100), maxP);
    valid.push({ id, price: r4(b.price), amount });
  }
  valid.sort((a, b) => b.price - a.price || (a.id < b.id ? -1 : 1));
  let left = crToPaise(spec.sizeCr);
  const allot = {};
  let i = 0;
  while (i < valid.length && left > 0) {
    const tier = valid.filter((v) => v.price === valid[i].price);
    const want = tier.reduce((a, v) => a + v.amount, 0);
    for (const v of tier) allot[v.id] = want <= left ? v.amount : Math.floor(v.amount * left / want / 1e7) * 1e7;
    left -= tier.reduce((a, v) => a + allot[v.id], 0);
    i += tier.length;
  }
  const out = { spec, fair, bids: valid.map((v) => ({ ...v, allotted: allot[v.id] || 0 })), soldPaise: crToPaise(spec.sizeCr) - left };
  for (const v of valid) {
    const a = allot[v.id] || 0;
    if (!a) continue;
    const p = per[v.id];
    const value = a + mulRatioChange(a, v.price, fair); // the bonds at today's market price
    p.st.cash -= a;
    p.st.pos[spec.inst] = (p.st.pos[spec.inst] || 0) + value;
    p.st.open[spec.inst] = (p.st.open[spec.inst] || 0) + (value - a);
    p.led.auction += value - a;
    p.led.auctionWork = { price: v.price, fair, allotted: a, value, pnl: value - a, inst: spec.inst };
  }
  return out;
}

/** After Q24 settles: the final release, which marks the last forecast. */
export function finalRelease(world0, script) {
  const world = clone(world0);
  const last = script.quarters.length;
  if (world.q !== last) throw new Error(`The final release comes after Q${last} settles`);
  if (world.final) return world;
  const release = computeRelease(view(world), last + 1, script.final?.data || {});
  const marked = markForecasts(world, script, last, release);
  world.final = { release, marked };
  const teamIds = Object.keys(world.teams).sort();
  const standings = specula(teamIds.map((id) => fundRow(world.teams[id])), last);
  world.final.standings = standings;
  return world;
}

/** Live SPECULA standings at any point (provisional before the final release). */
export function standingsNow(world) {
  const teamIds = Object.keys(world.teams).sort();
  const scored = world.final ? world.q : Math.max(1, (world.run ? world.run.q - 1 : world.q - 1));
  return specula(teamIds.map((id) => fundRow(world.teams[id])), scored);
}

export { isFunded, rupeePrice, carryRates };
