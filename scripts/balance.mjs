// Balance pass (docs/08): play the real script many times with bot funds and report
// who wins. Usage: node scripts/balance.mjs [games=20] [lineup=standard] [crises=all|none|some]
// Crises are optional for the Event Head, so the pass can release all of them, none, or a random pick.
import { newGame, openQuarter, settleQuarter, finalRelease, stagesFor, fireStage, deskNow, checkOrder } from '../src/engine/game.mjs';
import { rupeePrice } from '../src/engine/market.mjs';
import { SCRIPT } from '../server/script.mjs';
import { BOTS, rng, ordersFor } from '../src/bots/bots.mjs';

const LINEUP = ['economist', 'reader', 'cautious', 'momentum', 'gambler', 'gambler', 'random', 'buyhold', 'carry', 'idle'];

export function playGame(script, lineup, seed, { quiet = true, crises = 'all' } = {}) {
  const teams = lineup.map((b, k) => ({ id: `t${String(k + 1).padStart(2, '0')}`, name: `${BOTS[b].label} ${k + 1}`, bot: b }));
  const rands = Object.fromEntries(teams.map((t, k) => [t.id, rng(seed * 1000 + k + 1)]));
  let w = newGame(teams, script);
  const log = [];
  const pick = rng(seed * 7919 + 17);
  for (let q = 1; q <= script.quarters.length; q++) {
    w = openQuarter(w, script, q);
    const orders = Object.fromEntries(teams.map((t) => [t.id, []]));
    const stages = chooseStages(stagesFor(script, q), crises, pick);
    for (let k = 0; k <= stages.length; k++) {
      if (k > 0) w = fireStage(w, script, stages[k - 1].id).world;
      for (const t of teams) {
        const bot = BOTS[t.bot];
        const now = deskNow(w, t.id, orders[t.id]);
        const ctx = { world: w, teamId: t.id, q, epoch: k, nav: now.nav, rand: rands[t.id], forecastSpec: w.run.forecast };
        const d = bot.decide(ctx);
        if (d) orders[t.id].push(...ordersFor(w, t.id, orders[t.id], d.targets, w.run.epochs.length - 1, checkOrder));
      }
    }
    const forecasts = {}; const bids = {};
    for (const t of teams) {
      const bot = BOTS[t.bot];
      const now = deskNow(w, t.id, orders[t.id]);
      const ctx = { world: w, teamId: t.id, q, nav: now.nav, rand: rands[t.id], forecastSpec: w.run.forecast };
      forecasts[t.id] = bot.forecast(ctx);
      if (w.run.auction && bot.bid) bids[t.id] = bot.bid({ ...ctx, price: rupeePrice(w.mkt, w.run.auction.inst) });
    }
    const res = settleQuarter(w, script, { orders, forecasts, bids });
    w = res.world;
    log.push(res.result);
  }
  w = finalRelease(w, script);
  return { world: w, standings: w.final.standings.rows, teams, log };
}

/** Which stages the (simulated) Event Head releases: all, none, or a random pick that respects the order rules. */
export function chooseStages(all, mode, rand) {
  if (mode === 'none') return [];
  if (mode !== 'some') return all;
  const keepCrisis = new Set();
  for (const s of all) if (s.stageNo === 1 && rand() < 0.6 && (!s.needs || keepCrisis.has(s.needs.replace(/-\d+$/, '')))) keepCrisis.add(s.crisisId);
  return all.filter((s) => keepCrisis.has(s.crisisId) && (s.stageNo === 1 || rand() < 0.8));
}

const LINEUPS = {
  standard: LINEUP,
  crowded: ['reader', 'reader', 'reader', 'reader', 'cautious', 'cautious', 'economist', 'gambler', 'idle', 'buyhold'],
  gamblers: ['reader', 'gambler', 'gambler', 'gambler', 'gambler', 'gambler', 'random', 'random', 'idle', 'carry'],
};

function main() {
  const games = Number(process.argv[2] || 20);
  const lineup = LINEUPS[process.argv[3] || 'standard'];
  const crises = process.argv[4] || 'all';
  console.log(`Balance pass: ${games} games, lineup "${process.argv[3] || 'standard'}", crises: ${crises}`);
  const agg = {};
  for (let g = 1; g <= games; g++) {
    const { standings, teams } = playGame(SCRIPT, lineup, g, { crises });
    for (const row of standings) {
      const bot = teams.find((t) => t.id === row.id).bot;
      const a = (agg[bot] ||= { n: 0, score: 0, rank: 0, wins: 0, nav: 0, forced: 0, rar: 0, fc: 0, minNav: Infinity });
      a.n++; a.swing = (a.swing||0) + row.stats.swing; a.fall = (a.fall||0) + row.stats.deepest; a.ex = (a.ex||0) + row.stats.excess; a.score += row.total; a.rank += row.rank; a.nav += row.nav / 1e9; a.rar += row.rar; a.fc += row.forecast; a.forced += (15 - row.discipline) / 5;
      a.minNav = Math.min(a.minNav, row.nav / 1e9);
      if (row.rank === 1) a.wins++;
    }
  }
  const rows = Object.entries(agg).map(([bot, a]) => ({ bot: BOTS[bot].label, avgScore: (a.score / a.n).toFixed(1), avgRank: (a.rank / a.n).toFixed(2), wins: a.wins, avgFund: `₹${(a.nav / a.n).toFixed(0)} Cr`, worstFund: `₹${a.minNav.toFixed(0)} Cr`, rar: (a.rar / a.n).toFixed(1), forecast: (a.fc / a.n).toFixed(1), forced: (a.forced / a.n).toFixed(1), excess: (a.ex/a.n).toFixed(1)+'%', swing: (a.swing/a.n).toFixed(2), fall: (a.fall/a.n).toFixed(1) }))
    .sort((x, y) => Number(y.avgScore) - Number(x.avgScore));
  console.table(rows);
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
