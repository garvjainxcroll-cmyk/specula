// The validation checklist. Each issue names the exact record that needs correcting.
// Severity comes from model.mjs CHECKS (fixed ones cannot be changed; the others follow the
// Super Administrator's setting in config.validationSeverity).

import { TECH_KEYS, SOFT_KEYS, FUNCTIONS, SENIORITY, CHECK_KINDS, EFFECT_KINDS, SCOPES, SAVING_CATEGORIES, MECHANISMS, ATTRS, seniorityRank } from './model.mjs';
import { issue } from './round1.mjs';
import { sum } from './money.mjs';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const nonNegMoney = (x) => Number.isInteger(x) && x >= 0;

export function configIssues(ctx) {
  const { cfg, doc } = ctx;
  const out = [];
  const push = (code, msg, ref) => out.push(issue(cfg, code, msg, ref));
  // teams
  const teams = doc.teams || [];
  if (teams.length !== 4) push('CFG_TEAMS', `There are ${teams.length} teams; the event needs four.`, { kind: 'config', id: 'teams' });
  const labels = teams.map((t) => String(t.label || '').trim().toLowerCase());
  teams.forEach((t, i) => {
    if (!labels[i]) push('CFG_TEAMS', `Team ${t.id} has no label.`, { kind: 'team', id: t.id });
    else if (labels.indexOf(labels[i]) !== i) push('CFG_TEAMS', `Two teams are both called “${t.label}”.`, { kind: 'team', id: t.id });
    if (!ctx.continents.has(t.homeContinentId)) push('CFG_HOME', `${t.label} has no valid home continent.`, { kind: 'team', id: t.id, field: 'homeContinentId' });
    const p = ctx.profiles[t.id];
    const hq = ctx.cities.get(p.hqCityId);
    if (!hq) push('CFG_HQ', `${t.label} has no valid headquarters city.`, { kind: 'team', id: t.id, field: 'hqCityId' });
    else if (hq.continentId !== t.homeContinentId) push('CFG_HQ', `${t.label}'s headquarters (${hq.name}) is not in its home continent.`, { kind: 'team', id: t.id, field: 'hqCityId' });
    if (!ctx.models.has(p.revenueModelId)) push('CFG_REVENUE_MODEL', `${t.label} has no valid revenue model.`, { kind: 'team', id: t.id, field: 'revenueModelId' });
    for (const k of ['startingCash', 'acquisitionBudget', 'expansionBudget', 'baselineRevenue', 'baselineOpex']) {
      if (!nonNegMoney(p[k])) push('CFG_ASSUMPTIONS', `${t.label}: “${k}” must be an amount of zero or more.`, { kind: 'team', id: t.id, field: k });
    }
    for (const c of p.existingPresence || []) if (!ctx.cities.has(c)) push('CFG_ASSUMPTIONS', `${t.label}: existing presence lists an unknown city “${c}”.`, { kind: 'team', id: t.id, field: 'existingPresence' });
  });
  const homes = teams.map((t) => t.homeContinentId).filter(Boolean);
  if (new Set(homes).size !== homes.length) push('CFG_HOME_UNIQUE', 'Two or more teams share a home continent.', { kind: 'config', id: 'teams' });
  // continents and cities
  const conts = doc.continents || [];
  const contIds = conts.map((c) => c.id);
  if (new Set(contIds).size !== contIds.length) push('CFG_CITIES', 'Two continents share an identifier.', { kind: 'config', id: 'continents' });
  for (const c of conts) {
    for (const a of ATTRS) {
      const v = c.attrs?.[a.key];
      if (!isNum(v)) push('CFG_ASSUMPTIONS', `${c.name}: “${a.label}” is missing.`, { kind: 'continent', id: c.id, field: a.key });
      else if ((a.kind === 'mult' && v <= 0) || (a.kind === 'money' && !nonNegMoney(v)) || (a.kind === 'score' && (v < 0 || v > 100))) push('CFG_ASSUMPTIONS', `${c.name}: “${a.label}” is outside its allowed range.`, { kind: 'continent', id: c.id, field: a.key });
    }
    if (c.currency && !(Number(c.currency.rateToBase) > 0)) push('CFG_ASSUMPTIONS', `${c.name}: the currency conversion rate must be above zero.`, { kind: 'continent', id: c.id, field: 'currency' });
  }
  const cityIds = (doc.cities || []).map((c) => c.id);
  if (new Set(cityIds).size !== cityIds.length) push('CFG_CITIES', 'Two cities share an identifier.', { kind: 'config', id: 'cities' });
  for (const c of doc.cities || []) {
    if (!ctx.continents.has(c.continentId)) push('CFG_CITIES', `${c.name} is not linked to a valid continent.`, { kind: 'city', id: c.id, field: 'continentId' });
    if (!String(c.name || '').trim()) push('CFG_CITIES', `City ${c.id} has no name.`, { kind: 'city', id: c.id });
    for (const k of ['baseRevenueOpportunity', 'setupCost', 'officeCostAnnual']) if (!nonNegMoney(c[k])) push('CFG_ASSUMPTIONS', `${c.name}: “${k}” must be an amount of zero or more.`, { kind: 'city', id: c.id, field: k });
  }
  const counts = conts.map((k) => (doc.cities || []).filter((c) => c.continentId === k.id).length);
  if (conts.length !== 4 || counts.some((n) => n !== 5)) push('CFG_CITY_COUNT', `There are ${conts.length} continents with ${counts.join(', ') || 'no'} cities; the standard event uses four continents of five cities.`, { kind: 'config', id: 'cities' });
  // CVs
  const emps = doc.employees || [];
  const pool = cfg.auction.poolSize || 20;
  if (emps.length !== pool) push('CFG_CVS', `There are ${emps.length} CVs; the auction needs exactly ${pool}.`, { kind: 'config', id: 'employees' });
  const eids = emps.map((e) => e.id);
  emps.forEach((e, i) => {
    if (eids.indexOf(e.id) !== i) push('CFG_CVS', `Employee ID ${e.id} is used twice.`, { kind: 'employee', id: e.id });
    if (!String(e.name || '').trim()) push('CFG_CVS', `${e.id} has no name.`, { kind: 'employee', id: e.id });
    for (const k of TECH_KEYS) if (!Number.isInteger(e.technical?.[k]) || e.technical[k] < 1 || e.technical[k] > 100) push('CFG_CVS', `${e.id}: ${k} score must be a whole number from 1 to 100.`, { kind: 'employee', id: e.id, field: k });
    for (const k of SOFT_KEYS) if (!Number.isInteger(e.soft?.[k]) || e.soft[k] < 1 || e.soft[k] > 100) push('CFG_CVS', `${e.id}: ${k} score must be a whole number from 1 to 100.`, { kind: 'employee', id: e.id, field: k });
    if (!ctx.continents.has(e.origin)) push('CFG_CVS', `${e.id}: origin continent is not valid.`, { kind: 'employee', id: e.id, field: 'origin' });
    if (!SENIORITY.includes(e.seniority)) push('CFG_CVS', `${e.id}: seniority is not valid.`, { kind: 'employee', id: e.id, field: 'seniority' });
    if (!FUNCTIONS.includes(e.primaryFunction)) push('CFG_CVS', `${e.id}: primary function is not valid.`, { kind: 'employee', id: e.id, field: 'primaryFunction' });
    const em = e.employment || {};
    for (const k of ['expectedSalary', 'minSalary', 'hiringCost', 'onboardingCost', 'relocationBase', 'trainingCost']) if (!nonNegMoney(em[k])) push('CFG_CVS', `${e.id}: ${k} must be an amount of zero or more.`, { kind: 'employee', id: e.id, field: k });
    for (const k of ['onboardingMonths', 'rampUpMonths', 'contractMonths']) if (!Number.isInteger(em[k]) || em[k] < 0) push('CFG_CVS', `${e.id}: ${k} must be a whole number of months.`, { kind: 'employee', id: e.id, field: k });
    if (em.minSalary > em.expectedSalary) push('CFG_CVS', `${e.id}: minimum acceptable salary is above the expected salary.`, { kind: 'employee', id: e.id, field: 'minSalary' });
    if (!nonNegMoney(ctx.auctionById.get(e.id)?.startingBid ?? e.startingBid)) push('CFG_CVS', `${e.id}: starting bid must be an amount of zero or more.`, { kind: 'employee', id: e.id, field: 'startingBid' });
  });
  // weights and ranges
  const rw = cfg.ranking.weights;
  const rws = sum(Object.values(rw).map(Number));
  if (Object.values(rw).some((v) => !isNum(v) || v < 0) || Math.abs(rws - 100) > 1e-9) push('CFG_WEIGHTS', `Ranking weights total ${rws}%; they must total exactly 100%.`, { kind: 'config', id: 'ranking.weights' });
  for (const [k, w] of Object.entries(cfg.indices)) {
    const vals = Object.values(w);
    if (vals.some((v) => !isNum(v) || v < 0) || !(sum(vals) > 0)) push('CFG_WEIGHTS', `Capability index “${k}” needs non-negative weights with a positive total.`, { kind: 'config', id: `indices.${k}` });
  }
  const ow = Object.values(cfg.opportunity.weights);
  if (ow.some((v) => !isNum(v) || v < 0) || !(sum(ow) > 0)) push('CFG_WEIGHTS', 'Regional opportunity weights must be non-negative with a positive total.', { kind: 'config', id: 'opportunity.weights' });
  const pr = cfg.productivity;
  const pairs = [['relevanceMin', 'relevanceMax'], ['environmentMin', 'environmentMax'], ['expMin', 'expMax'], ['cultureMin', 'cultureMax']];
  for (const [a, b] of pairs) if (!(isNum(pr[a]) && isNum(pr[b]) && pr[a] > 0 && pr[a] <= pr[b])) push('CFG_RANGES', `Productivity range ${a}–${b} must be positive with the minimum not above the maximum.`, { kind: 'config', id: `productivity.${a}` });
  for (const k of ['trainingMissingMult', 'noSupportMult', 'relocationShortfallMult']) if (!(isNum(pr[k]) && pr[k] > 0 && pr[k] <= 1)) push('CFG_RANGES', `“${k}” must be above 0 and at most 1.`, { kind: 'config', id: `productivity.${k}` });
  if (!(isNum(pr.fitFloor) && isNum(pr.fitFull) && pr.fitFloor >= 0 && pr.fitFull > pr.fitFloor && pr.fitFull <= 100)) push('CFG_RANGES', 'Capability fit floor must be below the full-productivity fit (both 0–100).', { kind: 'config', id: 'productivity.fitFloor' });
  if (!(isNum(pr.maxProductivity) && pr.maxProductivity > 0 && pr.maxProductivity <= 3)) push('CFG_RANGES', 'Maximum productivity must be above 0 and at most 3.', { kind: 'config', id: 'productivity.maxProductivity' });
  for (const k of ['expYearsCap', 'intlAssignCap']) if (!(isNum(pr[k]) && pr[k] > 0)) push('CFG_RANGES', `“${k}” must be above zero.`, { kind: 'config', id: `productivity.${k}` });
  const rv = cfg.revenue;
  if (!(isNum(rv.mdmMin) && rv.mdmMin > 0 && rv.mdmMin <= rv.mdmMax)) push('CFG_RANGES', 'Market multiplier range must be positive with the minimum not above the maximum.', { kind: 'config', id: 'revenue.mdmMin' });
  if (!(rv.homeSaturationPct >= 0 && rv.homeSaturationPct <= 100)) push('CFG_RANGES', 'Home-market saturation must be 0–100%.', { kind: 'config', id: 'revenue.homeSaturationPct' });
  if (!(rv.riskDiscountMax >= 0 && rv.riskDiscountMax < 1)) push('CFG_RANGES', 'Maximum risk discount must be from 0 up to (not including) 1.', { kind: 'config', id: 'revenue.riskDiscountMax' });
  if (!Array.isArray(rv.sharedCredit) || !rv.sharedCredit.length || rv.sharedCredit.some((x) => !(x >= 0 && x <= 1))) push('CFG_RANGES', 'Shared-credit values must each be between 0 and 1.', { kind: 'config', id: 'revenue.sharedCredit' });
  if (!Array.isArray(rv.continentCredit) || !rv.continentCredit.length || rv.continentCredit.some((x) => !(x >= 0 && x <= 1))) push('CFG_RANGES', 'Continent credit values must each be between 0 and 1.', { kind: 'config', id: 'revenue.continentCredit' });
  if (!(rv.upliftCap >= 0 && rv.upliftCap <= 2) || !(rv.savingsCap >= 0 && rv.savingsCap <= 0.9)) push('CFG_RANGES', 'Uplift cap must be 0–2 and savings cap 0–0.9.', { kind: 'config', id: 'revenue.upliftCap' });
  const p = cfg.period;
  if (!(Number.isInteger(p.months) && p.months >= 1 && p.months <= 36 && Number.isInteger(p.startMonth) && p.startMonth >= 1 && p.startMonth <= 12 && Number.isInteger(p.startYear))) push('CFG_ASSUMPTIONS', 'The evaluation period must be 1–36 months from a valid start month.', { kind: 'config', id: 'period' });
  const c = cfg.costs;
  for (const k of ['baseOpexPerEmployee', 'equipmentPerDeployment', 'expatSupportAnnual', 'complianceOverheadAnnual', 'pendingDocumentationCost', 'interruptionCost']) if (!nonNegMoney(c[k])) push('CFG_ASSUMPTIONS', `Cost assumption “${k}” must be an amount of zero or more.`, { kind: 'config', id: `costs.${k}` });
  for (const k of ['domesticRelocationFactor', 'preOperationalCostPct', 'duplicateRoleCostPct']) if (!(isNum(c[k]) && c[k] >= 0)) push('CFG_ASSUMPTIONS', `Cost assumption “${k}” must be zero or more.`, { kind: 'config', id: `costs.${k}` });
  for (const [k, v] of Object.entries(c.packageFactors || {})) if (!(isNum(v) && v >= 0)) push('CFG_ASSUMPTIONS', `Relocation package factor “${k}” must be zero or more.`, { kind: 'config', id: 'costs.packageFactors' });
  if (!nonNegMoney(cfg.compliance.blocker.fixedPenalty)) push('CFG_ASSUMPTIONS', 'The blocker penalty must be an amount of zero or more.', { kind: 'config', id: 'compliance.blocker' });
  for (const m of doc.revenueModels || []) {
    for (const k of Object.keys(MECHANISMS).filter((x) => x !== 'none')) if (!(isNum(m.factors?.[k]) && m.factors[k] >= 0)) push('CFG_REVENUE_MODEL', `Revenue model “${m.name}”: factor for ${k} must be zero or more.`, { kind: 'config', id: `revenueModels.${m.id}` });
  }
  // roles and assignment types
  const roleIds = (cfg.roles || []).map((r) => r.id);
  if (!roleIds.length || new Set(roleIds).size !== roleIds.length) push('CFG_ROLES', 'Job roles must exist and have unique identifiers.', { kind: 'config', id: 'roles' });
  for (const r of cfg.roles || []) {
    if (!FUNCTIONS.includes(r.function)) push('CFG_ROLES', `Role “${r.name}”: function is not valid.`, { kind: 'config', id: `roles.${r.id}` });
    if (!MECHANISMS[r.mechanism]) push('CFG_ROLES', `Role “${r.name}”: revenue mechanism is not valid.`, { kind: 'config', id: `roles.${r.id}` });
    const ws = Object.values(r.weights || {});
    if (ws.some((v) => !isNum(v) || v < 0) || !(sum(ws) > 0)) push('CFG_WEIGHTS', `Role “${r.name}”: capability weights must be non-negative with a positive total.`, { kind: 'config', id: `roles.${r.id}` });
    if (!(isNum(r.revenueFactor) && r.revenueFactor >= 0 && r.revenueFactor <= 3)) push('CFG_ROLES', `Role “${r.name}”: revenue factor must be 0–3.`, { kind: 'config', id: `roles.${r.id}` });
    for (const ef of r.effects || []) {
      if (!EFFECT_KINDS[ef.kind] || !SCOPES[ef.scope] || !(isNum(ef.max) && ef.max >= 0 && ef.max <= 1) || (ef.kind === 'saving' && !SAVING_CATEGORIES[ef.category])) push('CFG_ROLES', `Role “${r.name}”: an effect is not valid (kind, scope, category or a strength above 100%).`, { kind: 'config', id: `roles.${r.id}` });
    }
  }
  const typeIds = (cfg.assignmentTypes || []).map((t) => t.id);
  for (const t of cfg.assignmentTypes || []) if (!(t.relocationFactor >= 0 && t.housingFactor >= 0)) push('CFG_ROLES', `Assignment type “${t.name}”: factors must be zero or more.`, { kind: 'config', id: `assignmentTypes.${t.id}` });
  for (const id of cfg.deployment.allowedAssignmentTypes || []) if (!typeIds.includes(id)) push('CFG_ROLES', `Permitted assignment type “${id}” does not exist.`, { kind: 'config', id: 'deployment.allowedAssignmentTypes' });
  // rules
  const ruleIds = (doc.rules || []).map((r) => r.id);
  (doc.rules || []).forEach((r, i) => {
    if (ruleIds.indexOf(r.id) !== i) push('CFG_RULES', `Rule ID ${r.id} is used twice.`, { kind: 'rule', id: r.id });
    for (const k of r.continentIds || []) if (!ctx.continents.has(k)) push('CFG_RULES', `Rule ${r.id}: unknown continent “${k}”.`, { kind: 'rule', id: r.id });
    for (const k of r.cityIds || []) if (!ctx.cities.has(k)) push('CFG_RULES', `Rule ${r.id}: unknown city “${k}”.`, { kind: 'rule', id: r.id });
    if (!CHECK_KINDS[r.check?.kind || 'status']) push('CFG_RULES', `Rule ${r.id}: check type is not valid.`, { kind: 'rule', id: r.id });
    if (!nonNegMoney(r.cost || 0) || !nonNegMoney(r.penalty || 0)) push('CFG_RULES', `Rule ${r.id}: cost and penalty must be amounts of zero or more.`, { kind: 'rule', id: r.id });
    if (!(isNum(r.revenueImpactPct ?? 0) && (r.revenueImpactPct ?? 0) >= 0 && (r.revenueImpactPct ?? 0) <= 100)) push('CFG_RULES', `Rule ${r.id}: revenue impact must be 0–100%.`, { kind: 'rule', id: r.id });
    if (!r.approved) push('CFG_RULES_APPROVED', `Rule ${r.id} (${r.title}) is a draft and is not applied until Event Control approves it.`, { kind: 'rule', id: r.id });
    if (r.realLaw && !String(r.verifiedBy || '').trim()) push('CFG_REAL_LAW', `Rule ${r.id} is marked as based on real law but does not record who verified it.`, { kind: 'rule', id: r.id });
  });
  return out;
}

/** Round 2 checks: every deployment and team. */
export function round2Issues(ctx, r1res, r2res) {
  const { cfg, doc } = ctx;
  const out = [];
  const push = (code, msg, ref) => out.push(issue(cfg, code, msg, ref));
  const dcfg = cfg.deployment;
  if (doc.round1?.status !== 'locked') push('R2_R1_LOCKED', 'Round 1 must be locked before Round 2 results can be finalised.', { kind: 'round', id: 'round1' });
  const allowed = new Set(dcfg.allowedAssignmentTypes || []);
  for (const d of r2res.evals) {
    const ref = { kind: 'deployment', id: d.id, teamId: d.teamId, employeeId: d.employeeId };
    const nm = `${d.id} (${d.names?.employee || d.employeeId})`;
    for (const e of d.refErrors) push('R2_INVALID_REF', `${nm}: ${e}`, ref);
    if (d.wrongTeam) push('R2_EMP_WRONG_TEAM', `${nm}: this employee was not hired by ${d.names?.team || d.teamId} in Round 1${d.owner ? ` (hired by ${ctx.teamById[d.owner]?.label || d.owner})` : ' (not hired by any team)'}.`, ref);
    for (const e of d.fieldErrors) push(/negative/.test(e) ? 'R2_NEGATIVE' : 'R2_FIELDS', `${nm}: ${e}`, ref);
    if (!d.valid) continue;
    if (!allowed.has(d.type.id)) push('R2_FIELDS', `${nm}: assignment type “${d.type.name}” is not permitted by the event rules.`, ref);
    if (d.type.maxMonths && d.dep.contractMonths > d.type.maxMonths) push('R2_TYPE_RULES', `${nm}: a ${d.type.name.toLowerCase()} may last at most ${d.type.maxMonths} months (entered ${d.dep.contractMonths}).`, ref);
    if (d.type.minSeniority && seniorityRank(d.emp.seniority) < seniorityRank(d.type.minSeniority)) push('R2_TYPE_RULES', `${nm}: a ${d.type.name.toLowerCase()} needs seniority ${d.type.minSeniority} or above (${d.emp.seniority}).`, ref);
    if (d.salaryBase < d.emp.employment.minSalary) push('R2_SALARY_MIN', `${nm}: salary ${ctx.fmt(d.salaryBase)} is below ${d.emp.name}'s minimum acceptable salary of ${ctx.fmt(d.emp.employment.minSalary)}.`, ref);
    else if (d.salaryBase < d.marketSalary) push('R2_SALARY_MARKET', `${nm}: salary ${ctx.fmt(d.salaryBase)} is below the local market rate of ${ctx.fmt(d.marketSalary)}.`, ref);
    for (const ev of d.compliance.evals) {
      if (ev.status === 'unassessed' && ev.mandatory) push('R2_UNASSESSED', `${nm}: mandatory requirement ${ev.ruleId} (${ev.title}) has not been assessed.`, { ...ref, ruleId: ev.ruleId });
      if (ev.evidenceMissing) push('R2_EVIDENCE', `${nm}: ${ev.ruleId} (${ev.title}) needs evidence; it is treated as pending until evidence is recorded.`, { ...ref, ruleId: ev.ruleId });
    }
    if (!d.operational && d.approval !== 'blockedRecorded') push('R2_BLOCKED', `${nm}: blocked by ${d.compliance.blockers.join(', ')}. Resolve the requirement, or record the deployment as blocked.`, ref);
    if (d.operational && d.approval !== 'approved') push('R2_NOT_APPROVED', `${nm}: not yet approved by an operator.`, ref);
    if (d.startIdx < 1 || d.startIdx > ctx.P || !d.months.length) push('R2_PERIOD', `${nm}: starts ${d.startIdx < 1 ? 'before' : 'after'} the evaluation period${d.months.length ? '' : ', so it has no months inside it'}.`, ref);
    if (d.truncation?.kind === 'contract') push('R2_CONTRACT', `${nm}: the assignment runs past ${d.emp.name}'s employment contract (month ${d.truncation.month}); it is counted only to the contract's end.`, ref);
    for (const n of d.riskNotes) push('R2_RISK', `${nm}: ${n}${d.truncation?.kind === 'risk' ? ` The assignment is cut short at month ${d.truncation.month}.` : ''}`, ref);
    if (d.relocationShortfall) push('R2_RELOCATION', `${nm}: relocation package is below what ${d.emp.name} needs (${d.emp.employment.relocationNeeds}); productivity is reduced.`, ref);
    if (dcfg.requireOfficeOrPartner && d.support === 'none') push('R2_NO_SUPPORT', `${nm}: neither a local office nor a local partner is arranged.`, ref);
    if (!dcfg.allowNoPresence && !d.presence) push('R2_NO_PRESENCE', `${nm}: ${d.city.name} is a city where ${d.team.label} has no prior presence.`, ref);
  }
  // per team
  for (const t of ctx.teams) {
    const tref = { kind: 'team', id: t.id };
    const sub = doc.round2?.submissions?.[t.id];
    if (!sub?.received) push('R2_SUBMISSION', `${t.label}'s written allocation is not recorded as received.`, tref);
    const roster = ctx.roster[t.id] || [];
    const deps = r2res.evals.filter((d) => d.teamId === t.id && d.valid);
    for (const id of roster) if (!deps.some((d) => d.employeeId === id)) push('R2_EMP_MISSING', `${t.label}: ${id} ${ctx.employees.get(id)?.name || ''} has no deployment recorded.`, { kind: 'employee', id, teamId: t.id });
    // overlaps
    for (const id of roster) {
      const ds = deps.filter((d) => d.employeeId === id);
      for (let m = 1; m <= ctx.P; m++) {
        const act = ds.filter((d) => d.months.includes(m));
        const share = sum(act.map((d) => d.share));
        if ((act.length > 1 && !dcfg.splitAssignments) || share > 1 + 1e-9) {
          push('R2_OVERLAP', `${t.label}: ${id} has ${act.length} assignments at once in month ${m} (${act.map((d) => d.id).join(', ')})${dcfg.splitAssignments ? `, totalling ${Math.round(share * 100)}% of their time` : '; split assignments are not enabled'}.`, { kind: 'employee', id, teamId: t.id });
          break;
        }
      }
    }
    const distinct = (f) => { const mp = new Map(); for (const d of deps) { const k = f(d); if (!mp.has(k)) mp.set(k, new Set()); mp.get(k).add(d.employeeId); } return mp; };
    const perCity = distinct((d) => d.cityId); const perCont = distinct((d) => d.continentId);
    if (dcfg.maxPerCity) for (const [c, s] of perCity) if (s.size > dcfg.maxPerCity) push('R2_MAX_CITY', `${t.label}: ${s.size} employees in ${ctx.cities.get(c)?.name} (maximum ${dcfg.maxPerCity}).`, tref);
    if (dcfg.maxPerContinent) for (const [k, s] of perCont) if (s.size > dcfg.maxPerContinent) push('R2_MAX_CONTINENT', `${t.label}: ${s.size} employees in ${ctx.continents.get(k)?.name} (maximum ${dcfg.maxPerContinent}).`, tref);
    if (!dcfg.allowSameCity) for (const [c, s] of perCity) if (s.size > 1) push('R2_SAME_CITY', `${t.label}: ${s.size} employees in ${ctx.cities.get(c)?.name} (${[...s].sort().join(', ')}); a team may place only one employee in each city.`, tref);
    const foreign = [...perCont.keys()].filter((k) => k !== t.homeContinentId);
    if (dcfg.maxForeignContinents !== null && dcfg.maxForeignContinents !== undefined && foreign.length > dcfg.maxForeignContinents) push('R2_FOREIGN_LIMIT', `${t.label} enters ${foreign.length} foreign continents (maximum ${dcfg.maxForeignContinents}).`, tref);
    const prof = ctx.profiles[t.id];
    const where = (id, m) => deps.find((d) => d.employeeId === id && d.months.includes(m)) || null;
    if (dcfg.minHomeRetained > 0) {
      for (let m = 1; m <= ctx.P; m++) {
        const n = roster.filter((id) => { const d = where(id, m); return !d || d.continentId === t.homeContinentId; }).length;
        if (n < dcfg.minHomeRetained) { push('R2_MIN_HOME', `${t.label}: only ${n} employee(s) in the home continent in month ${m} (minimum ${dcfg.minHomeRetained}).`, tref); break; }
      }
    }
    if (dcfg.seniorAtHQ) {
      for (let m = 1; m <= ctx.P; m++) {
        const ok = roster.some((id) => { const e = ctx.employees.get(id); const d = where(id, m); return e?.seniority === 'Executive' && (!d || d.cityId === prof.hqCityId); });
        if (!ok) { push('R2_SENIOR_HQ', `${t.label}: no senior executive at headquarters in month ${m}.`, tref); break; }
      }
    }
    const res = r2res.teams[t.id];
    const mt = res.metrics;
    if (mt.budgetUtilPct !== null && mt.budgetUtilPct > 100) push('R2_BUDGET', `${t.label}: expansion costs ${ctx.fmt(res.statement.totalCosts)} exceed the expansion budget of ${ctx.fmt(mt.expansionBudget)}.`, tref);
    if (mt.cashRemaining < 0) push('R2_CASH', `${t.label}: cash would fall to ${ctx.fmt(mt.cashRemaining)}.`, tref);
    if (mt.weightedRisk !== null && mt.weightedRisk > cfg.thresholds.riskWarn) push('R2_RISK_THRESHOLD', `${t.label}: revenue-weighted regional risk ${mt.weightedRisk.toFixed(1)} is above the threshold of ${cfg.thresholds.riskWarn}.`, tref);
    if (deps.length && (mt.profitMarginPct === null || mt.profitMarginPct < cfg.thresholds.profitMarginWarnPct)) push('R2_PROFIT_THRESHOLD', `${t.label}: profit margin ${mt.profitMarginPct === null ? 'cannot be measured (no revenue)' : `${mt.profitMarginPct.toFixed(1)}%`} is below the threshold of ${cfg.thresholds.profitMarginWarnPct}%.`, tref);
    // reconciliation (a self-check of the engine)
    const s = res.statement;
    const emp = Object.values(res.byEmployee);
    const city = Object.values(res.byCity);
    const checks = [
      ['employee contributions', sum(emp.map((v) => v.contribution)), s.netContribution],
      ['employee revenue', sum(emp.map((v) => v.revenue)), s.revenue.total],
      ['city revenue', sum(city.map((v) => v.revenue)), s.revenue.total],
      ['city costs', sum(city.map((v) => v.costs)), s.totalCosts],
      ['continent contributions', sum(Object.values(res.byContinent).map((v) => v.contribution)), s.netContribution],
      ['function contributions', sum(Object.values(res.byFunction).map((v) => v.contribution)), s.netContribution],
      ['cost sections', s.oneTime.total + s.recurring.total + s.contingent.total, s.totalCosts],
      ['lines', sum(res.lines.map((l) => (l.kind === 'revenue' ? l.amount : -l.amount))), s.netContribution],
    ];
    for (const [what, a, b] of checks) if (a !== b) push('R2_RECONCILE', `${t.label}: ${what} (${ctx.fmt(a)}) do not reconcile with the team total (${ctx.fmt(b)}).`, tref);
  }
  return out;
}
