// Decision analysis: statements about the main drivers of a team's result. Every statement
// is generated from the calculated figures and the model inputs; nothing is said that the
// data does not show. Statements are ordered by the size of the money involved.

import { sum } from './money.mjs';
import { CATEGORIES } from './model.mjs';

export function explainTeam(ctx, team, r1res, r2res) {
  const res = r2res.teams[team.id];
  const fmt = ctx.fmt;
  const deps = r2res.evals.filter((d) => d.teamId === team.id && d.valid);
  const out = [];
  const add = (tone, weight, text, refs = {}) => out.push({ tone, weight: Math.abs(weight || 0), text, refs });
  const dr = (d) => res.deployments[d.id];
  const who = (d) => `${d.emp.id} ${d.emp.name} (${d.role.name}, ${d.city.name})`;

  // strongest positive deployment
  const ranked = deps.filter((d) => dr(d)).sort((a, b) => dr(b).contribution - dr(a).contribution);
  const top = ranked[0];
  if (top && dr(top).contribution > 0) {
    const p = top.productivity;
    add('positive', dr(top).contribution, `${who(top)} contributed ${fmt(dr(top).contribution)} — the team's largest. Role suitability was ${p.roleSuitability.toFixed(0)}/100 (capability fit ${p.capFit.toFixed(0)} × destination relevance ×${p.relevanceMult.toFixed(2)}) and ${top.city.name}'s market multiplier was ×${top.market.value.toFixed(2)}.`, { deploymentId: top.id });
  }
  for (const d of deps) {
    const x = dr(d);
    if (!x) continue;
    // blocked by a mandatory requirement
    if (!d.operational) {
      const names = d.compliance.evals.filter((e) => e.blocking).map((e) => `${e.ruleId} ${e.title} (${e.status === 'unassessed' ? 'not yet assessed' : e.status === 'pending' ? 'pending' : e.status === 'review' ? 'awaiting administrator review' : 'non-compliant'})`);
      add('negative', d.potentialRate * 6 + x.costs, `${who(d)} earned no revenue because a mandatory deployment blocker is unresolved: ${names.join('; ')}. The employee stayed at headquarters and the deployment still cost ${fmt(x.costs)}.`, { deploymentId: d.id });
      continue;
    }
    // revenue reduced by a pending non-blocking requirement
    if (d.compliance.revenueImpactPct > 0) {
      const names = d.compliance.evals.filter((e) => e.revenueImpactPct > 0).map((e) => `${e.ruleId} ${e.title}`);
      add('negative', x.directRevenue * d.compliance.revenueImpactPct / (100 - Math.min(99, d.compliance.revenueImpactPct)), `${who(d)}'s revenue was reduced by ${d.compliance.revenueImpactPct}% while ${names.join(', ')} ${names.length > 1 ? 'remain' : 'remains'} unresolved.`, { deploymentId: d.id });
    }
    // high-cost destination
    const op = d.eff.attrs.operatingCostMultiplier;
    if (op >= 1.2 && x.costs > x.revenue) add('negative', x.costs - x.revenue, `${d.city.name}'s operating cost multiplier of ×${op.toFixed(2)} made ${d.emp.name}'s deployment cost ${fmt(x.costs)} against ${fmt(x.revenue)} of revenue.`, { deploymentId: d.id });
    // relocation larger than what the assignment earned after running costs
    const reloc = x.costsByCategory.relocation || 0;
    const afterRunning = x.revenue - x.recurringCosts;
    if (reloc > 0 && x.revenue > 0 && reloc > afterRunning) add('negative', reloc - Math.max(0, afterRunning), `Relocating ${d.emp.name} to ${d.city.name} cost ${fmt(reloc)}, more than the ${fmt(Math.max(0, afterRunning))} the assignment earned after its running costs.`, { deploymentId: d.id });
    // shared customers
    if (x.avgCredit !== null && x.avgCredit < 0.999 && x.directRevenue > 0) {
      const same = deps.filter((o) => o.cityId === d.cityId && o.mechanism === d.mechanism && o.operational && o.revenueRate > 0).length;
      add('negative', x.directRevenue * (1 / x.avgCredit - 1), `${same} employees earned ${d.mechanism === 'service' ? 'service' : d.mechanism === 'contracts' ? 'contract' : 'sales'} revenue in ${d.city.name} from the same customers, so ${d.emp.name} was credited ${Math.round(x.avgCredit * 100)}% of standalone revenue on average.`, { deploymentId: d.id });
    }
    // an amplifier with nothing to amplify
    const amplifies = (d.role.effects || []).some((e) => e.kind === 'uplift');
    if (amplifies && d.role.mechanism === 'none' && x.enabledRevenue === 0) add('negative', x.costs, `${who(d)} had no revenue-earning colleague within reach (${(d.role.effects || []).filter((e) => e.kind === 'uplift').map((e) => e.scope === 'city' ? 'same city' : e.scope === 'continent' ? 'same continent' : 'whole team').join(', ')}${(d.role.effects || []).some((e) => e.target === 'international') ? ', international assignees only' : ''}), so the role enabled no revenue.`, { deploymentId: d.id });
    else if (x.enabledRevenue > 0 && x.enabledRevenue > x.directRevenue) add('positive', x.enabledRevenue, `${who(d)} enabled ${fmt(x.enabledRevenue)} of colleagues' revenue.`, { deploymentId: d.id });
    // missing training, difficult culture, late or short productive time
    if (d.productivity.trainingMult < 1) add('negative', x.directRevenue * (1 / d.productivity.trainingMult - 1), `${d.emp.name} needed training that was not provided: productivity ×${d.productivity.trainingMult.toFixed(2)}.`, { deploymentId: d.id });
    if (d.productivity.culture.mult <= 0.9) add('negative', x.directRevenue * (1 / d.productivity.culture.mult - 1), `${d.emp.name} found adjusting to ${d.cont.name} hard (cultural difficulty ${d.productivity.culture.difficulty.toFixed(0)} against a cross-cultural score of ${d.productivity.culture.adjusted.toFixed(0)}): productivity ×${d.productivity.culture.mult.toFixed(2)}.`, { deploymentId: d.id });
    if (d.months.length && x.effectiveMonths < 0.5 * ctx.P && d.revenueRate > 0) add('info', d.revenueRate * (ctx.P - x.effectiveMonths), `${d.emp.name} was fully productive for the equivalent of ${x.effectiveMonths.toFixed(1)} of ${ctx.P} months (start, onboarding and ramp-up).`, { deploymentId: d.id });
  }
  // savings by specialists
  const savings = {};
  for (const l of res.lines.filter((x) => x.cat === 'savings')) savings[l.depId] = (savings[l.depId] || 0) - l.amount;
  for (const [id, v] of Object.entries(savings)) {
    const d = deps.find((x) => x.id === id);
    if (d && v > 0) add('positive', v, `${who(d)} saved ${fmt(v)} of ${[...new Set(res.lines.filter((l) => l.cat === 'savings' && l.depId === id).map((l) => CATEGORIES[l.of]?.label.toLowerCase()))].join(', ')}.`, { deploymentId: id });
  }
  // a continent whose entry cost was not recovered
  for (const c of Object.values(res.byContinent)) {
    if (c.continentId === team.homeContinentId) continue;
    const entry = sum(res.lines.filter((l) => l.cat === 'marketEntry' && l.contId === c.continentId).map((l) => l.amount));
    const n = new Set(deps.filter((d) => d.continentId === c.continentId).map((d) => d.employeeId)).size;
    if (entry > 0 && c.contribution < 0) add('negative', -c.contribution, `Entering ${c.name} with ${n} employee${n === 1 ? '' : 's'} lost ${fmt(-c.contribution)} after a market-entry cost of ${fmt(entry)}.`, { continentId: c.continentId });
    else if (c.contribution > 0) add('positive', c.contribution, `${c.name} contributed ${fmt(c.contribution)} (${fmt(c.revenue)} revenue against ${fmt(c.costs)} of costs).`, { continentId: c.continentId });
  }
  // revenue versus profit compared with another team
  for (const o of ctx.teams) {
    if (o.id === team.id) continue;
    const a = res.statement; const b = r2res.teams[o.id].statement;
    if (a.revenue.total > b.revenue.total && a.netContribution < b.netContribution) {
      add('info', b.netContribution - a.netContribution, `${team.label} earned more revenue than ${o.label} (${fmt(a.revenue.total)} against ${fmt(b.revenue.total)}) but a smaller contribution, because its costs were ${fmt(a.totalCosts - b.totalCosts)} higher.`, { teamId: o.id });
    }
  }
  if (res.metrics.budgetUtilPct !== null && res.metrics.budgetUtilPct > 100) add('negative', res.statement.totalCosts - res.metrics.expansionBudget, `Expansion costs used ${res.metrics.budgetUtilPct.toFixed(1)}% of the expansion budget.`);
  if (!deps.length) add('info', 1, 'No deployments have been entered yet.');
  out.sort((a, b) => b.weight - a.weight);
  return out.slice(0, 10).map(({ weight, ...rest }) => rest);
}
