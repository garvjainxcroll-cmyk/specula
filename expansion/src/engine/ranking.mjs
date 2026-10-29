// The ranking engine.
//
// Weighted mode: four components, each on 0–100, combined with the configured weights
// (which must total 100%).
//   Financial performance   the chosen money metric, min–max scaled across teams:
//                           best team 100, worst 0, others in proportion; all equal → 100.
//   Deployment effectiveness  productivity actually realised (already 0–100, see MODEL.md)
//   Compliance and readiness  weighted status score blended with the share of operational
//                           deployments (already 0–100)
//   Budget discipline       100 within budget, falling to 0 at the configured overspend;
//                           not applicable when no expansion budget is set (its weight is
//                           then shared among the other components)
// Financial mode: teams are ranked by the money metric itself.
// Ties are broken by the configured tie-break rules, in order. Teams still level after
// every rule share the rank. Nothing is ever decided at random.

import { r2, clamp, sum } from './money.mjs';

export const METRICS = {
  combined: { label: 'Combined recruitment-and-expansion outcome', get: (t) => t.statement.combined },
  incremental: { label: 'Round 2 net expansion contribution', get: (t) => t.statement.netContribution },
  operating: { label: 'Round 2 operating profit', get: (t) => t.statement.operatingProfit },
};

export const TIE_BREAKS = {
  operatingProfit: { label: 'Higher operating profit', get: (t) => t.statement.operatingProfit, better: 'higher' },
  combined: { label: 'Higher combined outcome', get: (t) => t.statement.combined, better: 'higher' },
  incremental: { label: 'Higher net expansion contribution', get: (t) => t.statement.netContribution, better: 'higher' },
  fewerViolations: { label: 'Fewer compliance violations', get: (t) => t.metrics.violations, better: 'lower' },
  lowerExpansionCosts: { label: 'Lower expansion expenditure', get: (t) => t.statement.totalCosts, better: 'lower' },
  complianceScore: { label: 'Higher compliance score', get: (t) => t.metrics.complianceScore, better: 'higher' },
  deploymentEffectiveness: { label: 'Higher deployment effectiveness', get: (t) => t.metrics.deploymentEffectiveness, better: 'higher' },
};

export const COMPONENTS = {
  financial: 'Financial performance', deployment: 'Employee deployment effectiveness', compliance: 'Compliance and operational readiness', budget: 'Budget discipline',
};

export function rankTeams(ctx, r2res) {
  const { cfg } = ctx;
  const rk = cfg.ranking;
  const metric = METRICS[rk.financialMetric] || METRICS.combined;
  const rows = ctx.teams.map((t) => {
    const res = r2res.teams[t.id];
    return { teamId: t.id, label: t.label, res, metricValue: metric.get(res) };
  });
  const vals = rows.map((r) => r.metricValue);
  const lo = Math.min(...vals); const hi = Math.max(...vals);
  for (const r of rows) {
    const m = r.res.metrics;
    const financial = hi === lo ? 100 : (100 * (r.metricValue - lo)) / (hi - lo);
    let compliance = m.complianceReadiness;
    const blocked = m.blockedCount > 0;
    if (blocked && cfg.compliance.blocker.ranking === 'complianceZero') compliance = 0;
    let budget = null;
    if (m.expansionBudget) {
      const over = Math.max(0, m.budgetUtilPct - 100);
      budget = clamp(100 * (1 - over / (rk.budgetMaxOverspendPct || 50)), 0, 100);
    }
    const comps = { financial, deployment: m.deploymentEffectiveness, compliance, budget };
    const w = { ...rk.weights };
    if (budget === null) w.budget = 0;
    const wsum = sum(Object.values(w));
    const overall = wsum ? sum(Object.keys(comps).map((k) => (comps[k] ?? 0) * (w[k] || 0))) / wsum : 0;
    r.components = Object.fromEntries(Object.entries(comps).map(([k, v]) => [k, v === null ? null : r2(v)]));
    r.effectiveWeights = Object.fromEntries(Object.entries(w).map(([k, v]) => [k, wsum ? r2((100 * v) / wsum) : 0]));
    r.overall = r2(overall);
    r.blocked = blocked;
    r.unranked = blocked && cfg.compliance.blocker.ranking === 'unranked';
    r.score = rk.mode === 'financial' ? r.metricValue : r.overall;
  }
  const breaks = (rk.tieBreaks || []).filter((k) => TIE_BREAKS[k]);
  const cmpOne = (a, b, key) => {
    const tb = TIE_BREAKS[key];
    const x = tb.get(a.res); const y = tb.get(b.res);
    const xr = typeof x === 'number' ? r2(x) : x; const yr = typeof y === 'number' ? r2(y) : y;
    if (xr === yr) return 0;
    return tb.better === 'higher' ? (yr > xr ? 1 : -1) : (yr < xr ? 1 : -1);
  };
  const cmp = (a, b) => {
    if (a.unranked !== b.unranked) return a.unranked ? 1 : -1;
    if (a.score !== b.score) return b.score > a.score ? 1 : -1;
    for (const k of breaks) { const c = cmpOne(a, b, k); if (c) return c; }
    return 0;
  };
  rows.sort((a, b) => cmp(a, b) || a.teamId.localeCompare(b.teamId));
  let rank = 0;
  rows.forEach((r, i) => {
    if (r.unranked) { r.rank = null; r.shared = false; return; }
    if (i === 0 || cmp(rows[i - 1], r) !== 0) rank = i + 1;
    r.rank = rank;
    if (i > 0 && !rows[i - 1].unranked && rows[i - 1].score === r.score) {
      const k = breaks.find((key) => cmpOne(rows[i - 1], r, key) !== 0);
      r.tieBrokenBy = k ? TIE_BREAKS[k].label : null;
    }
  });
  for (const r of rows) r.shared = r.rank !== null && rows.filter((x) => x.rank === r.rank).length > 1;
  for (const r of rows) r.explanation = explainRank(ctx, r, rows, metric);
  return {
    mode: rk.mode, metric: rk.financialMetric, metricLabel: metric.label, weights: rk.weights, tieBreaks: breaks.map((k) => TIE_BREAKS[k].label),
    rows: rows.map(({ res, ...rest }) => ({
      ...rest,
      revenue: res.statement.revenue.total, totalCosts: res.statement.totalCosts, operatingProfit: res.statement.operatingProfit,
      netContribution: res.statement.netContribution, combined: res.statement.combined, budgetUtilPct: res.metrics.budgetUtilPct,
      deploymentEffectiveness: res.metrics.deploymentEffectiveness, complianceScore: res.metrics.complianceScore,
      compliantDeployments: res.metrics.compliantDeployments, blockedCount: res.metrics.blockedCount, violations: res.metrics.violations,
    })),
  };
}

function ord(n) { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

function explainRank(ctx, r, rows, metric) {
  const fmt = ctx.fmt;
  const parts = [];
  if (r.unranked) parts.push('Not ranked: at least one deployment is stopped by a mandatory legal requirement, and the configured consequence removes the team from the ranking.');
  else parts.push(`${r.shared ? 'Shares' : 'Takes'} ${ord(r.rank)} place.`);
  if (ctx.cfg.ranking.mode === 'financial') {
    parts.push(`Ranked on ${metric.label.toLowerCase()}: ${fmt(r.metricValue)}.`);
  } else {
    const c = r.components; const w = r.effectiveWeights;
    parts.push(`Overall score ${r.overall.toFixed(2)} = financial ${c.financial.toFixed(1)} × ${w.financial}% + deployment ${c.deployment.toFixed(1)} × ${w.deployment}% + compliance ${c.compliance.toFixed(1)} × ${w.compliance}%${c.budget === null ? ' (no expansion budget set, so budget discipline is not scored)' : ` + budget ${c.budget.toFixed(1)} × ${w.budget}%`}.`);
    parts.push(`Financial score from ${metric.label.toLowerCase()} of ${fmt(r.metricValue)}${rows.length > 1 ? ', scaled between the lowest and highest team' : ''}.`);
  }
  if (r.blocked && !r.unranked) parts.push(`${r.res.metrics.blockedCount} deployment(s) blocked by a mandatory requirement earned no revenue${ctx.cfg.compliance.blocker.ranking === 'complianceZero' ? ', and the compliance component is set to zero' : ''}.`);
  if (r.tieBrokenBy) parts.push(`Level with the team above on score; separated by the tie-break “${r.tieBrokenBy}”.`);
  if (r.shared) parts.push('Level on score and on every tie-break rule, so the place is shared.');
  return parts.join(' ');
}
