// The one entry point: computeAll(doc) → every derived figure for a session.
// Pure and deterministic: the same document always gives the same results.

import { MODEL_VERSION, CAP_KEYS } from './model.mjs';
import { buildContext } from './context.mjs';
import { round1Results } from './round1.mjs';
import { computeRound2 } from './round2.mjs';
import { rankTeams } from './ranking.mjs';
import { configIssues, round2Issues } from './validate.mjs';
import { explainTeam } from './explain.mjs';
import { indicesOf, roleFits, crossCulturalFor, capValue } from './capability.mjs';
import { opportunityScore, marketMultiplier } from './regions.mjs';
import { productivityTrace, revenueTrace } from './trace.mjs';
import { inputHash } from './hash.mjs';
import { issue } from './round1.mjs';
import { clamp, r2 } from './money.mjs';

function publicDeployment(d, teamRes, cfg) {
  const base = { id: d.id, teamId: d.teamId, employeeId: d.employeeId, cityId: d.cityId, roleId: d.roleId, typeId: d.typeId, names: d.names, valid: d.valid };
  if (!d.valid) return { ...base, refErrors: d.refErrors, fieldErrors: d.fieldErrors, wrongTeam: d.wrongTeam, owner: d.owner || null };
  const res = teamRes.deployments[d.id];
  return {
    ...base, continentId: d.continentId,
    international: d.international, foreignToTeam: d.foreignToTeam, relocated: d.relocated, presence: d.presence, support: d.support,
    share: d.share, salaryBase: d.salaryBase, homeSalary: d.homeSalary, marketSalary: d.marketSalary,
    startIdx: d.startIdx, plannedEnd: d.plannedEnd, endIdx: d.endIdx, months: d.months, truncation: d.truncation, interruption: d.interruption,
    riskNotes: d.riskNotes, relocationShortfall: d.relocationShortfall,
    productivity: { ...d.productivity }, market: d.market, riskDiscount: d.riskDiscount, riskFactor: d.riskFactor,
    specialRevenue: d.specialRevenue, specialCost: d.specialCost, homeFactor: d.homeFactor, bmf: d.bmf, roleFactor: d.roleFactor, mechanism: d.mechanism,
    revenueRate: d.revenueRate, opportunity: d.opportunity, compliance: d.compliance, operational: d.operational, approval: d.approval,
    schedule: d.schedule, result: res,
    traces: { productivity: productivityTrace(d, cfg), revenue: revenueTrace(d, res, cfg) },
  };
}

export function computeAll(doc) {
  const ctx = buildContext(doc);
  const { cfg } = ctx;
  const r1 = round1Results(ctx);
  const r2res = computeRound2(ctx, r1);
  const ranking = rankTeams(ctx, r2res);
  const hash = inputHash(doc);
  const config = configIssues(ctx);
  const round2 = round2Issues(ctx, r1, r2res);
  const stored = doc.calc?.draft;
  if (!stored) round2.push(issue(cfg, 'R2_CALC', 'No calculation has been run yet: press Run calculation.', { kind: 'calc', id: 'draft' }));
  else if (stored.inputHash !== hash) round2.push(issue(cfg, 'R2_CALC', 'Inputs have changed since the last calculation: run the calculation again.', { kind: 'calc', id: 'draft' }));
  const teams = {};
  for (const t of ctx.teams) {
    const res = r2res.teams[t.id];
    teams[t.id] = { ...res, analysis: explainTeam(ctx, t, r1, r2res) };
  }
  const deployments = {};
  for (const d of r2res.evals) deployments[d.id] = publicDeployment(d, r2res.teams[d.teamId] || { deployments: {} }, cfg);
  // regions: effective attributes and city-level opportunity
  const regions = {};
  for (const [id, eff] of ctx.eff) {
    const ros = opportunityScore(eff, cfg.opportunity);
    regions[id] = { cityId: id, continentId: eff.continentId, attrs: eff.attrs, terms: eff.terms, opportunity: ros, market: marketMultiplier(eff, cfg.revenue), functionBonus: eff.functionBonus, specialRevenue: eff.specialRevenue, specialCost: eff.specialCost, specialLabels: eff.specialLabels, baseRevenueOpportunity: eff.baseRevenueOpportunity, setupCost: eff.setupCost, officeCostAnnual: eff.officeCostAnnual };
  }
  // employees: indices, best roles, regional suitability
  const employees = {};
  for (const e of doc.employees || []) {
    const regional = {};
    for (const [k, cont] of ctx.continents) {
      const cc = crossCulturalFor(e, cfg.indices, k).value;
      const speaks = (e.languages || []).some((l) => (cont.languages || []).includes(l));
      const diff = k === e.origin ? 0 : Math.max(0, (Number(cont.attrs?.culturalDifficulty) || 0) - (speaks ? cfg.productivity.languageRelief : 0));
      regional[k] = r2(clamp(50 + (cc - diff) / 2, 0, 100));
    }
    employees[e.id] = { indices: indicesOf(e, cfg.indices), roles: roleFits(e, cfg.roles).slice(0, 4), regional, scores: Object.fromEntries(CAP_KEYS.map((k) => [k, capValue(e, k)])), owner: ctx.ownerOf[e.id] || null };
  }
  const all = [...config, ...r1.issues, ...round2];
  return {
    modelVersion: MODEL_VERSION, inputHash: hash,
    round1: { teams: r1.teams, counts: r1.counts, total: r1.total },
    round2: { teams },
    deployments, ranking, regions, employees,
    roster: ctx.roster,
    validation: {
      config, round1: r1.issues, round2,
      blocking: { config: config.filter((i) => i.severity === 'blocking').length, round1: r1.issues.filter((i) => i.severity === 'blocking').length, round2: round2.filter((i) => i.severity === 'blocking').length },
      warnings: all.filter((i) => i.severity !== 'blocking').length,
    },
  };
}

export { buildContext, inputHash };
