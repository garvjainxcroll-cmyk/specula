// Regions: a city's effective attributes (its continent's values adjusted by the city),
// how relevant a role is there, the market multiplier, and the Regional Opportunity Score.

import { ATTRS } from './model.mjs';
import { clamp, sum } from './money.mjs';

/**
 * Effective attributes of a city.
 *  score (0–100): continent + city points, kept within 0–100
 *  rate (%):      continent + city points, kept within the attribute's range
 *  mult (×):      continent × (1 + city % ÷ 100)
 * Continent-only attributes are taken as they are.
 */
export function effectiveCity(city, cont) {
  const attrs = {}; const terms = {};
  for (const a of ATTRS) {
    const base = Number(cont.attrs?.[a.key]) || 0;
    const adj = a.continentOnly ? 0 : Number(city.adj?.[a.key]) || 0;
    let value;
    if (a.kind === 'score') value = clamp(base + adj, 0, 100);
    else if (a.kind === 'rate') value = clamp(base + adj, a.min ?? -100, a.max ?? 100);
    else if (a.kind === 'mult') value = clamp(base * (1 + adj / 100), a.min ?? 0.1, a.max ?? 10);
    else value = base;
    attrs[a.key] = value;
    terms[a.key] = { base, adj, value, kind: a.kind };
  }
  // housing follows the city's operating-cost adjustment
  const housingAdj = Number(city.adj?.operatingCostMultiplier) || 0;
  attrs.housingAllowanceAnnual = Math.round((Number(cont.attrs?.housingAllowanceAnnual) || 0) * (1 + housingAdj / 100));
  terms.housingAllowanceAnnual = { base: Number(cont.attrs?.housingAllowanceAnnual) || 0, adj: housingAdj, value: attrs.housingAllowanceAnnual, kind: 'money' };
  const fb = {};
  for (const [k, v] of Object.entries(cont.functionBonus || {})) fb[k] = (fb[k] || 0) + Number(v || 0);
  for (const [k, v] of Object.entries(city.functionBonus || {})) fb[k] = (fb[k] || 0) + Number(v || 0);
  const sp = (x) => (x && x.active !== false ? x : { revenuePct: 0, costPct: 0, label: '' });
  const cs = sp(cont.special); const ys = sp(city.special);
  return {
    cityId: city.id, continentId: cont.id, name: city.name, continentName: cont.name,
    attrs, terms,
    baseRevenueOpportunity: Number(city.baseRevenueOpportunity) || 0,
    setupCost: Number(city.setupCost) || 0,
    officeCostAnnual: Number(city.officeCostAnnual) || 0,
    marketEntryCost: Number(cont.attrs?.marketEntryCost) || 0,
    functionBonus: fb,
    specialRevenue: (1 + (Number(cs.revenuePct) || 0) / 100) * (1 + (Number(ys.revenuePct) || 0) / 100),
    specialCost: (1 + (Number(cs.costPct) || 0) / 100) * (1 + (Number(ys.costPct) || 0) / 100),
    specialLabels: [cs.label, ys.label].filter(Boolean),
    languages: cont.languages || [],
    currency: cont.currency || null,
  };
}

const lin = (x, lo, hi) => clamp(((x - lo) / (hi - lo)) * 100, 0, 100);
export const growthScore = (g, ranges) => lin(g, ranges.growthMin, ranges.growthMax);

/** A destination condition on 0–100, including the two derived ones. */
export function driverValue(eff, key, ranges) {
  if (key === 'growthScore') return growthScore(eff.attrs.growthRate, ranges);
  if (key === 'competitionInverse') return 100 - eff.attrs.competition;
  const v = eff.attrs[key];
  if (v === undefined) throw new Error(`Unknown destination driver "${key}"`);
  return v;
}
export const DRIVER_LABELS = {
  growthScore: 'Market growth (scaled 0–100)', competitionInverse: 'Low competition (100 − competitive intensity)',
  marketDemand: 'Market demand', purchasingPower: 'Purchasing power', infrastructure: 'Infrastructure', logistics: 'Logistics',
  talentAvailability: 'Talent availability', competition: 'Competitive intensity', opportunityScore: 'Business opportunity',
  culturalDifficulty: 'Cultural difficulty', legalComplexity: 'Legal complexity', riskScore: 'Regional risk',
};

/** How much the role matters in this destination, 0–100 (weighted destination drivers). */
export function relevance(eff, role, ranges) {
  const entries = Object.entries(role.drivers || {}).filter(([, w]) => Number(w) > 0);
  const wsum = sum(entries.map(([, w]) => Number(w)));
  if (!wsum) return { value: 50, terms: [] };
  const terms = entries.map(([key, w]) => {
    const v = driverValue(eff, key, ranges);
    return { key, label: DRIVER_LABELS[key] || key, weight: Number(w) / wsum, value: v, contribution: (Number(w) / wsum) * v };
  });
  return { value: sum(terms.map((t) => t.contribution)), terms };
}

/** Market multiplier: demand, purchasing power and (low) competition, mapped to [mdmMin, mdmMax]. */
export function marketMultiplier(eff, rev) {
  const wsum = rev.demandWeight + rev.purchasingWeight + rev.competitionWeight;
  const index = wsum > 0
    ? (rev.demandWeight * eff.attrs.marketDemand + rev.purchasingWeight * eff.attrs.purchasingPower + rev.competitionWeight * (100 - eff.attrs.competition)) / wsum
    : 50;
  return { index, value: rev.mdmMin + (rev.mdmMax - rev.mdmMin) * (index / 100) };
}

export const OPPORTUNITY_FACTORS = {
  marketDemand: { label: 'Market demand', benefit: true },
  growth: { label: 'Growth potential', benefit: true },
  roleSuitability: { label: 'Employee-role suitability', benefit: true, deploymentOnly: true },
  infrastructure: { label: 'Infrastructure', benefit: true },
  talent: { label: 'Talent (labour) availability', benefit: true },
  opportunity: { label: 'Business opportunity score', benefit: true },
  productivity: { label: 'Expected productivity', benefit: true, deploymentOnly: true },
  operatingCost: { label: 'Operating cost burden', benefit: false },
  competition: { label: 'Competition', benefit: false },
  legalComplexity: { label: 'Legal complexity', benefit: false },
  relocationCost: { label: 'Relocation cost burden', benefit: false },
  risk: { label: 'Regional risk', benefit: false },
};

/** Each factor on 0–100 before weighting (burdens are still "higher = worse" here). */
export function opportunityRaw(eff, ranges, extra = {}) {
  return {
    marketDemand: eff.attrs.marketDemand,
    growth: growthScore(eff.attrs.growthRate, ranges),
    infrastructure: eff.attrs.infrastructure,
    talent: eff.attrs.talentAvailability,
    opportunity: eff.attrs.opportunityScore,
    operatingCost: lin(eff.attrs.operatingCostMultiplier, ranges.costMultMin, ranges.costMultMax),
    competition: eff.attrs.competition,
    legalComplexity: eff.attrs.legalComplexity,
    relocationCost: lin(eff.attrs.relocationCostMultiplier, ranges.relocMultMin, ranges.relocMultMax),
    risk: eff.attrs.riskScore,
    ...extra,
  };
}

/**
 * Regional Opportunity Score, 0–100 = Σ weight × goodness ÷ Σ weight, where goodness is the
 * factor itself for a benefit and (100 − factor) for a burden. Equivalent to
 * Σ w·benefit − Σ w·burden rescaled from its possible range onto 0–100.
 * City level: role and productivity factors are left out (their weight is not counted).
 */
export function opportunityScore(eff, opp, { roleSuitability = null, productivityScore = null } = {}) {
  const extra = {};
  if (roleSuitability !== null) extra.roleSuitability = roleSuitability;
  if (productivityScore !== null) extra.productivity = productivityScore;
  const raw = opportunityRaw(eff, opp.ranges, extra);
  const factors = [];
  for (const [key, def] of Object.entries(OPPORTUNITY_FACTORS)) {
    const w = Number(opp.weights?.[key]) || 0;
    if (!(key in raw) || w <= 0) continue;
    const goodness = def.benefit ? raw[key] : 100 - raw[key];
    factors.push({ key, label: def.label, benefit: def.benefit, raw: raw[key], goodness, weight: w });
  }
  const wsum = sum(factors.map((f) => f.weight));
  const score = wsum ? sum(factors.map((f) => f.weight * f.goodness)) / wsum : 0;
  for (const f of factors) f.share = wsum ? (f.weight * f.goodness) / wsum : 0;
  return { score, factors };
}
