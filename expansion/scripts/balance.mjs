// Balance pass: for many random auction outcomes, each team plays each strategy, and the
// combined outcome is compared. Usage: node scripts/balance.mjs [trials]
//
// What we want to see: thoughtful international strategies ("cluster", "earners") beat
// staying at home, scattering people, or piling everyone into one city; random play loses.
import { blankDoc, randomAuction, applyAuction, applyDeployments, applyCompliance, strategyPlan, rng, STRATEGIES } from './sim.mjs';
import { computeAll } from '../src/engine/index.mjs';
import { fmtCompact } from '../src/engine/money.mjs';

const trials = Number(process.argv[2] || 20);
const rand = rng(20261029);
const stats = Object.fromEntries(STRATEGIES.map((s) => [s, { combined: [], net: [], wins: 0, eff: [] }]));
const t0 = Date.now();
for (let k = 0; k < trials; k++) {
  const base = blankDoc();
  const outcome = randomAuction(base, rand);
  const results = {};
  for (const s of STRATEGIES) {
    const doc = applyAuction(blankDoc(), outcome);
    const plan = Object.fromEntries(doc.teams.map((t) => [t.id, strategyPlan(doc, t.id, s, rand)]));
    applyDeployments(doc, plan);
    applyCompliance(doc);
    const res = computeAll(doc);
    for (const t of doc.teams) {
      const st = res.round2.teams[t.id].statement;
      results[`${t.id}|${s}`] = st.combined;
      stats[s].combined.push(st.combined); stats[s].net.push(st.netContribution);
      stats[s].eff.push(res.round2.teams[t.id].metrics.deploymentEffectiveness);
    }
  }
  for (const t of 'ABCD') {
    const best = STRATEGIES.map((s) => [s, results[`${t}|${s}`]]).sort((a, b) => b[1] - a[1])[0][0];
    stats[best].wins++;
  }
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`Balance pass: ${trials} random auctions × 4 teams × ${STRATEGIES.length} strategies (${((Date.now() - t0) / 1000).toFixed(1)} s)\n`);
console.log('strategy       mean combined   worst          best           mean net       best strategy for a team');
for (const s of STRATEGIES) {
  const c = stats[s].combined;
  console.log(`${s.padEnd(14)} ${fmtCompact(mean(c)).padStart(12)}   ${fmtCompact(Math.min(...c)).padStart(12)}   ${fmtCompact(Math.max(...c)).padStart(12)}   ${fmtCompact(mean(stats[s].net)).padStart(12)}   ${String(stats[s].wins).padStart(4)} of ${trials * 4}`);
}
