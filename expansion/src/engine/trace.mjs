// Formula traces: the exact formula behind each calculated value, with every input's value
// and where it came from, so an operator can inspect any figure on screen.
// Each input carries a visibility group so hidden regional values can be redacted.

import { CATEGORIES, PACKAGES } from './model.mjs';

const T = (label, value, kind, source = '', group = null) => ({ label, value, kind, source, group });

export function productivityTrace(d, cfg) {
  const p = d.productivity; const pr = cfg.productivity; const a = d.eff.attrs;
  return {
    title: `Effective productivity — ${d.emp.id} ${d.emp.name} as ${d.role.name} in ${d.city.name}`,
    formula: 'Base productivity × Role suitability multiplier × Operating environment × Regional role bonus × Experience × Cultural adaptation × Training × Local support × Relocation fit, capped at the maximum',
    terms: [
      T('Capability fit (0–100)', p.capFit, 'score', `weighted: ${p.capTerms.map((t) => `${t.label} ${t.score} × ${(t.weight * 100).toFixed(0)}%`).join(' + ')}`),
      T('Base productivity', p.baseProd, 'factor', `(capability fit ${p.capFit.toFixed(1)} − ${pr.fitFloor}) ÷ (${pr.fitFull} − ${pr.fitFloor}), never below 0`),
      T('Destination relevance (0–100)', p.relevance, 'score', p.relTerms.map((t) => `${t.label} ${t.value.toFixed(1)} × ${(t.weight * 100).toFixed(0)}%`).join(' + '), 'conditions'),
      T('Role suitability multiplier', p.relevanceMult, 'mult', `${pr.relevanceMin} + (${pr.relevanceMax} − ${pr.relevanceMin}) × relevance ÷ 100; range ${pr.relevanceMin}–${pr.relevanceMax}`),
      T('Role suitability score (0–100)', p.roleSuitability, 'score', 'capability fit × role suitability multiplier, at most 100 (shown for analysis)'),
      T('Operating environment', p.envMult, 'mult', `infrastructure ${a.infrastructure.toFixed(0)} and talent ${a.talentAvailability.toFixed(0)} weighted ${pr.envInfraWeight}/${pr.envTalentWeight} → index ${p.envIndex.toFixed(1)}; range ${pr.environmentMin}–${pr.environmentMax}`, 'conditions'),
      T('Regional role bonus', p.fnMult, 'mult', `${p.fnPct >= 0 ? '+' : ''}${p.fnPct}% for ${d.role.function} (continent + city, capped at ±${pr.functionBonusCap}%)`, 'bonuses'),
      T('Experience', p.expMult, 'mult', `${pr.expMin} + (${pr.expMax} − ${pr.expMin}) × min(${d.emp.yearsExperience}, ${pr.expYearsCap}) ÷ ${pr.expYearsCap}${p.intlBonus ? ` + international bonus ${p.intlBonus.toFixed(3)} (${(d.emp.internationalAssignments || []).length} previous assignments)` : ''}`),
      T('Cultural adaptation', p.culture.mult, 'mult', d.international
        ? `1 + ${pr.cultureSlope} × (cross-cultural score ${p.culture.adjusted.toFixed(1)} − difficulty ${p.culture.difficulty.toFixed(1)}${p.culture.speaks ? `, after ${pr.languageRelief} points of language relief` : ''}); range ${pr.cultureMin}–${pr.cultureMax}`
        : `home continent of the employee: no adaptation difficulty; 1 + ${pr.cultureSlope} × ${p.culture.adjusted.toFixed(1)}, at most ${pr.cultureMax}`, 'conditions'),
      T('Training', p.trainingMult, 'mult', d.emp.employment.trainingRequired ? (d.dep.trainingProvided ? 'training required and provided' : `training required but not provided (×${pr.trainingMissingMult})`) : 'no training required'),
      T('Local support', p.supportMult, 'mult', d.support === 'none' ? `no office, partner or existing presence (×${pr.noSupportMult})` : `support: ${d.support}`),
      T('Relocation fit', p.relocMult, 'mult', d.relocationShortfall ? `package “${PACKAGES[d.dep.relocationPackage || 'none'].label}” below the employee's need “${d.emp.employment.relocationNeeds}” (×${pr.relocationShortfallMult})` : 'package meets the employee’s stated needs'),
    ],
    result: { label: p.capped ? `Effective productivity (capped at ${pr.maxProductivity}; uncapped ${p.raw.toFixed(4)})` : 'Effective productivity', value: p.value, kind: 'factor' },
  };
}

export function revenueTrace(d, res, cfg) {
  const a = d.eff.attrs;
  const rv = cfg.revenue;
  return {
    title: `Direct revenue — ${d.emp.id} ${d.emp.name} in ${d.city.name}`,
    formula: 'Σ over active months: Base opportunity ÷ 12 × Productivity × Market multiplier × Role revenue factor × Business model factor × Risk factor × Special modifier × Home-market factor × (1 − compliance reduction) × Growth that month × Ramp-up × Time share × City shared credit × Continent credit',
    terms: [
      T('Base revenue opportunity (a year)', d.eff.baseRevenueOpportunity, 'money', `${d.city.name}`, 'revenue'),
      T('Effective productivity', d.productivity.value, 'factor', 'see the productivity formula'),
      T('Market multiplier', d.market.value, 'mult', `${rv.mdmMin} + (${rv.mdmMax} − ${rv.mdmMin}) × market index ${d.market.index.toFixed(1)} ÷ 100; index = demand ${a.marketDemand.toFixed(0)} × ${rv.demandWeight} + purchasing power ${a.purchasingPower.toFixed(0)} × ${rv.purchasingWeight} + (100 − competition ${a.competition.toFixed(0)}) × ${rv.competitionWeight}, ÷ ${(rv.demandWeight + rv.purchasingWeight + rv.competitionWeight).toFixed(2)}`, 'demand'),
      T('Role revenue factor', d.roleFactor, 'factor', `${d.role.name}: ${d.mechanism}`),
      T('Business model factor', d.bmf, 'factor', `${d.model?.name || 'no model'} for ${d.mechanism}`),
      T('Risk factor', d.riskFactor, 'mult', `1 − ${rv.riskDiscountMax} × regional risk ${a.riskScore.toFixed(0)} ÷ 100`, 'conditions'),
      T('Special scenario modifier', d.specialRevenue, 'mult', d.eff.specialLabels.join('; ') || 'none', 'bonuses'),
      T('Home-market factor', d.homeFactor, 'mult', d.foreignToTeam ? 'a new (foreign) market for the team' : `home continent: the existing business already serves it (−${cfg.revenue.homeSaturationPct}%)`),
      T('Compliance reduction', d.compliance.revenueImpactPct, 'pct', d.compliance.revenueImpactPct ? 'unresolved non-blocking mandatory requirements' : 'none'),
      T('Market growth', a.growthRate, 'pct', 'a year; month m uses 1 + growth × (m − 0.5) ÷ 12', 'demand'),
      T('Time share', d.share * 100, 'pct', 'share of the employee’s time on this assignment'),
      T('Shared credit', `city ${cfg.revenue.sharedCredit.join(' / ')}; continent ${(cfg.revenue.continentCredit || [1]).join(' / ')}`, 'text', 'earners of the same kind of revenue share customers: by their rank in the same city, and in the same continent (the monthly table shows each month’s credit)'),
      T('Onboarding / ramp-up', `${d.emp.employment.onboardingMonths} / ${d.emp.employment.rampUpMonths} months`, 'text', 'no output while onboarding; then 1/(R+1), 2/(R+1)… until full'),
    ],
    schedule: d.schedule,
    result: { label: 'Direct revenue credited', value: res.directRevenue, kind: 'money' },
    notes: d.operational ? [] : ['This deployment is blocked by a mandatory requirement, so it earns no revenue.'],
  };
}

export const STATEMENT_FORMULAS = {
  revenue: 'Total revenue = Σ direct revenue + Σ revenue enabled for colleagues + Σ revenue protected by risk mitigation (each employee’s contribution counted once)',
  oneTime: 'One-time expansion costs = relocation + visa/permit/registration fees + deployment training + office setup + equipment + market entry (less any specialist savings on them)',
  recurring: 'Recurring costs = salaries + employer contributions + housing + local operating costs + office + marketing + logistics + partner fees + insurance/legal/compliance + employee support + currency conversion + local taxes − specialist savings',
  contingent: 'Contingent costs = pre-operational (blocked) costs + additional documentation + non-compliance penalties + configured blocker penalties + interruptions + duplicated expenditure',
  totalCosts: 'Total expansion costs = one-time + recurring + contingent',
  operatingProfit: 'Operating profit = total revenue − recurring (operating) costs',
  netContribution: 'Net expansion contribution (Round 2 incremental) = total revenue − total expansion costs. Round 1 auction spending is not deducted again here.',
  combined: 'Combined recruitment-and-expansion outcome = net expansion contribution − Round 1 initial hiring cost (winning bids + recruitment + onboarding)',
  roee: 'Return on expansion expenditure = net expansion contribution ÷ total expansion costs (n/a when costs are zero)',
  combinedReturn: 'Combined return = combined outcome ÷ (total expansion costs + Round 1 initial hiring cost)',
  breakEven: 'Break-even revenue = (total costs − taxes − revenue-linked costs) ÷ (1 − revenue-linked costs ÷ revenue); revenue-linked costs are logistics, partner fees, marketing share and currency conversion',
  budgetUtil: 'Budget utilisation = total expansion costs ÷ expansion budget',
  cash: 'Cash remaining = starting cash − Round 1 initial hiring cost − total expansion costs + total revenue (the existing business is not included)',
  margin: 'Profit margin = net expansion contribution ÷ total revenue (n/a without revenue)',
  growth: 'Revenue growth relative to baseline = expansion revenue ÷ (baseline annual revenue × months ÷ 12)',
  perEmployee: 'Per employee = the figure ÷ number of employees hired in Round 1',
  nonCompliance: 'Cost of non-compliance = pre-operational costs + documentation costs + penalties + blocker penalties',
  effectiveness: 'Deployment effectiveness = average over the team’s employees of 100 × Σ months (productivity × ramp-up × time share, on operational assignments) ÷ months in the period, at most 100',
  compliance: 'Compliance and readiness = (compliance share × weighted status score + readiness share × % of deployments operational) ÷ (sum of shares)',
};

export const CATEGORY_FORMULAS = {
  relocation: 'CV relocation estimate × destination relocation multiplier × (1 inside a foreign continent, or the domestic factor in the home continent) × assignment-type relocation factor × relocation package factor; only when the destination is not headquarters and the deployment is operational',
  permits: 'one-time cost of each applicable requirement whose status is compliant or pending',
  training: 'CV training cost × destination operating cost multiplier, when the deployment provides training',
  setup: 'city setup cost, once, when the team opens an office in a city where it had no presence',
  equipment: 'equipment allowance × destination operating cost multiplier, for each operational deployment',
  marketEntry: 'continent market-entry cost, once per foreign continent entered, split equally across the team’s cities there',
  salary: 'annual salary ÷ 12 for each month on payroll: the destination salary × time share while on an operational assignment, the contracted (Round 1) salary for the rest',
  employer: 'salary × employer contribution rate of the continent where the salary is paid',
  housing: 'continent housing allowance × (1 + city cost adjustment) × assignment-type housing factor ÷ 12 × time share × special modifier, for each operational month away from headquarters',
  opex: 'operating cost per employee × destination operating cost multiplier ÷ 12 × time share × special modifier, for each operational month',
  office: 'city office cost ÷ 12 × special modifier, for each month the office is occupied',
  marketing: 'business-model marketing share × revenue earned in the city, plus any campaign budget of the role',
  logistics: 'revenue × role logistics factor × the city’s shipping cost rate',
  partner: 'revenue earned in the city × the continent’s partner fee, where a partner is used instead of an office',
  compliance: 'annual cost of each applicable requirement (for example insurance) ÷ 12 × time share, plus the legal and compliance overhead per employee × destination legal complexity ÷ 100 ÷ 12 × time share, for each operational month',
  support: 'expatriate support allowance ÷ 12 × time share, for employees working outside their own continent',
  fx: 'revenue earned outside the home continent × the continent’s currency conversion cost',
  tax: 'each city: profit before tax × the city’s tax rate, when the profit is positive (penalties are not deductible); finance specialists may then save part of it',
  savings: 'specialists reduce eligible costs in their scope by strength × productivity × ramp-up, capped in total',
  preOperational: 'for a blocked deployment: pre-operational share × the housing and operating costs that would have applied',
  documentation: 'additional documentation cost for each requirement still pending',
  penalties: 'the rule’s penalty for each confirmed violation',
  blockerPenalty: 'the configured penalty for each deployment stopped by a blocker',
  interruption: 'interruption cost when a disclosed CV risk cuts an assignment short',
  duplication: 'duplicated-role share × salary, for a second holder of the same role in the same city',
};
export const categoryLabel = (k) => CATEGORIES[k]?.label || k;
