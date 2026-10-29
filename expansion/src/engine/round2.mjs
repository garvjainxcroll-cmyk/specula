// Round 2 — international business expansion: the financial engine.
//
// Every deployment is evaluated once (productivity, market, compliance), then each team
// is simulated month by month across the evaluation period. Each money line is summed
// over the months and rounded once to the minor unit; every total is a sum of rounded
// lines, so team, continent, city, employee and function figures always reconcile.
//
// The full method, with every range and why, is in MODEL.md.

import { PACKAGES, CATEGORIES } from './model.mjs';
import { money, clamp, sum, allocate, ratio, r2 } from './money.mjs';
import { monthIndex, monthLabel } from './months.mjs';
import { capabilityFit, crossCulturalFor } from './capability.mjs';
import { relevance, marketMultiplier, opportunityScore } from './regions.mjs';
import { ruleApplies, evaluateRule, complianceScore } from './compliance.mjs';
import { contractedSalary } from './round1.mjs';

const SAVING_OF = { logistics: 'logistics', opex: 'opex', office: 'opex', housing: 'opex', permits: 'compliance', compliance: 'compliance', documentation: 'compliance', fx: 'fx' };
const NON_DEDUCTIBLE = new Set(['penalties', 'blockerPenalty', 'tax']);

export function salaryInBase(dep, cont) {
  const amt = Number(dep.salary?.amount);
  if (!Number.isFinite(amt)) return NaN;
  if (dep.salary?.currency === 'local') {
    const rate = Number(cont?.currency?.rateToBase);
    if (!(rate > 0)) return NaN;
    return money(amt * rate);
  }
  return amt;
}

/** Productivity during the k-th month of an assignment: nothing while onboarding, then a
 *  straight-line ramp (R months at 1/(R+1), 2/(R+1)…), then full. */
export function rampFactor(k, onboarding, ramp) {
  if (k <= onboarding) return 0;
  if (k <= onboarding + ramp) return (k - onboarding) / (ramp + 1);
  return 1;
}

/** Evaluate one deployment record on its own: references, timing, productivity, market, compliance. */
export function evaluateDeployment(ctx, dep) {
  const { cfg } = ctx;
  const pr = cfg.productivity;
  const out = { id: dep.id, teamId: dep.teamId, employeeId: dep.employeeId, cityId: dep.cityId, roleId: dep.roleId, typeId: dep.assignmentTypeId, valid: false, refErrors: [], fieldErrors: [], wrongTeam: false };
  const team = ctx.teamById[dep.teamId];
  const emp = ctx.employees.get(dep.employeeId);
  const city = ctx.cities.get(dep.cityId);
  const cont = city ? ctx.continents.get(city.continentId) : null;
  const role = ctx.roles.get(dep.roleId);
  const type = ctx.types.get(dep.assignmentTypeId);
  if (!team) out.refErrors.push(`Team “${dep.teamId}” does not exist.`);
  if (!emp) out.refErrors.push(`Employee “${dep.employeeId}” does not exist.`);
  if (!city) out.refErrors.push(`City “${dep.cityId}” does not exist.`);
  else if (!cont) out.refErrors.push(`City “${city.name}” is not linked to a valid continent.`);
  if (!role) out.refErrors.push(`Job role “${dep.roleId}” does not exist.`);
  if (!type) out.refErrors.push(`Assignment type “${dep.assignmentTypeId}” does not exist.`);
  out.names = { team: team?.label, employee: emp ? `${emp.id} ${emp.name}` : dep.employeeId, city: city?.name, continent: cont?.name, role: role?.name, type: type?.name };
  if (out.refErrors.length) return out;
  if (ctx.ownerOf[emp.id] !== team.id) { out.wrongTeam = true; out.owner = ctx.ownerOf[emp.id] || null; return out; }
  out.continentId = cont.id;

  const prof = ctx.profiles[team.id];
  const eff = ctx.eff.get(city.id);
  const P = ctx.P;
  const salaryBase = salaryInBase(dep, cont);
  if (!Number.isInteger(salaryBase) || salaryBase < 0) out.fieldErrors.push('Annual salary at destination is missing, invalid or negative.');
  const startIdx = monthIndex(ctx.period, dep.startMonth);
  if (startIdx === null) out.fieldErrors.push('Planned deployment month is missing or invalid.');
  const dur = Number(dep.contractMonths);
  if (!Number.isInteger(dur) || dur < 1) out.fieldErrors.push('Assignment duration must be a whole number of months, at least 1.');
  const share = dep.timeShare === undefined || dep.timeShare === null ? 1 : Number(dep.timeShare) / 100;
  if (!(share > 0 && share <= 1)) out.fieldErrors.push('Time share must be between 1% and 100%.');
  if (!PACKAGES[dep.relocationPackage || 'none']) out.fieldErrors.push('Relocation package is not recognised.');
  if (out.fieldErrors.length) return out;

  out.valid = true;
  out.team = team; out.emp = emp; out.city = city; out.cont = cont; out.role = role; out.type = type; out.eff = eff; out.prof = prof;
  out.international = cont.id !== emp.origin;
  out.foreignToTeam = cont.id !== team.homeContinentId;
  out.relocated = city.id !== prof.hqCityId;
  out.presence = city.id === prof.hqCityId || (prof.existingPresence || []).includes(city.id);
  out.support = out.presence ? 'presence' : dep.officeArranged ? 'office' : dep.localPartner ? 'partner' : 'none';
  out.share = share;
  out.salaryBase = salaryBase;
  out.homeSalary = contractedSalary(emp, cfg);
  out.marketSalary = money(emp.employment.expectedSalary * eff.attrs.labourCostMultiplier);
  out.dep = dep;

  // ---- timing ----
  let end = startIdx + dur - 1;
  out.startIdx = startIdx; out.plannedEnd = end;
  out.truncation = null; out.interruption = false; out.riskNotes = [];
  const contractEnd = Number(emp.employment.contractMonths) || P;
  if (end > contractEnd) { out.truncation = { kind: 'contract', month: contractEnd }; end = contractEnd; }
  const risk = emp.strategic?.risk || { kind: 'none' };
  if (risk.kind === 'maxAbroadMonths' && out.international && dur > Number(risk.months)) {
    const cut = startIdx + Number(risk.months) - 1;
    if (cut < end) { end = cut; out.truncation = { kind: 'risk', month: cut }; out.interruption = cut >= 1 && cut < P; }
    out.riskNotes.push(`${emp.name} will not stay abroad more than ${risk.months} months (${risk.text || 'disclosed on the CV'}).`);
  }
  if (risk.kind === 'visaHistory' && risk.continentId === cont.id) out.riskNotes.push(`${emp.name}: ${risk.text || 'past work-authorisation difficulty in this continent'}.`);
  if (risk.kind === 'familyCommitment' && out.relocated && !['family'].includes(dep.relocationPackage)) out.riskNotes.push(`${emp.name}: ${risk.text || 'family commitments; a family package is expected'}.`);
  out.endIdx = end;
  out.months = [];
  for (let m = Math.max(1, startIdx); m <= Math.min(P, end); m++) out.months.push(m);

  // ---- productivity ----
  const fit = capabilityFit(emp, role);
  const rel = relevance(eff, role, cfg.opportunity.ranges);
  const relevanceMult = pr.relevanceMin + (pr.relevanceMax - pr.relevanceMin) * (rel.value / 100);
  const roleSuitability = clamp(fit.value * relevanceMult, 0, 100);
  const ew = pr.envInfraWeight + pr.envTalentWeight;
  const envIndex = ew > 0 ? (pr.envInfraWeight * eff.attrs.infrastructure + pr.envTalentWeight * eff.attrs.talentAvailability) / ew : 50;
  const envMult = pr.environmentMin + (pr.environmentMax - pr.environmentMin) * (envIndex / 100);
  const fnPct = clamp(Number(eff.functionBonus[role.function]) || 0, -pr.functionBonusCap, pr.functionBonusCap);
  const fnMult = 1 + fnPct / 100;
  const yrs = Math.min(Number(emp.yearsExperience) || 0, pr.expYearsCap);
  const intlN = Math.min((emp.internationalAssignments || []).length, pr.intlAssignCap);
  const expBase = pr.expMin + (pr.expMax - pr.expMin) * (yrs / pr.expYearsCap);
  const intlBonus = out.international && pr.intlAssignCap > 0 ? pr.intlBonusMax * (intlN / pr.intlAssignCap) : 0;
  const expMult = expBase + intlBonus;
  const cc = crossCulturalFor(emp, cfg.indices, cont.id);
  const speaks = (emp.languages || []).some((l) => (eff.languages || []).includes(l));
  const difficulty = out.international ? Math.max(0, eff.attrs.culturalDifficulty - (speaks ? pr.languageRelief : 0)) : 0;
  const cultureMult = clamp(1 + pr.cultureSlope * (cc.value - difficulty), pr.cultureMin, pr.cultureMax);
  const trainingMult = emp.employment.trainingRequired && !dep.trainingProvided ? pr.trainingMissingMult : 1;
  const supportMult = out.support === 'none' ? pr.noSupportMult : 1;
  const needRank = PACKAGES[emp.employment.relocationNeeds || 'none']?.rank ?? 0;
  const gotRank = PACKAGES[dep.relocationPackage || 'none']?.rank ?? 0;
  out.relocationShortfall = out.relocated && gotRank < needRank;
  const relocMult = out.relocationShortfall ? pr.relocationShortfallMult : 1;
  // base productivity rises in a straight line from 0 at the fit floor to 1.00 at full fit
  const baseProd = Math.max(0, (fit.value - pr.fitFloor) / (pr.fitFull - pr.fitFloor));
  const raw = baseProd * relevanceMult * envMult * fnMult * expMult * cultureMult * trainingMult * supportMult * relocMult;
  const ep = Math.min(pr.maxProductivity, raw);
  out.productivity = {
    value: ep, raw, capped: raw > pr.maxProductivity,
    capFit: fit.value, capTerms: fit.terms, baseProd, relevance: rel.value, relTerms: rel.terms, relevanceMult, roleSuitability,
    envIndex, envMult, fnPct, fnMult, expBase, intlBonus, expMult,
    culture: { index: cc.base, compat: cc.compat, adjusted: cc.value, difficulty, speaks, mult: cultureMult },
    trainingMult, supportMult, relocMult,
  };

  // ---- market ----
  const mm = marketMultiplier(eff, cfg.revenue);
  const model = ctx.models.get(prof.revenueModelId) || null;
  out.model = model;
  out.mechanism = role.mechanism || 'none';
  out.bmf = out.mechanism === 'none' ? 0 : Number(model?.factors?.[out.mechanism]) || 0;
  out.roleFactor = out.mechanism === 'none' ? 0 : Number(role.revenueFactor) || 0;
  out.market = mm;
  out.riskDiscount = clamp(cfg.revenue.riskDiscountMax * (eff.attrs.riskScore / 100), 0, 0.95);
  out.riskFactor = 1 - out.riskDiscount;
  out.specialRevenue = eff.specialRevenue;
  // the team's existing business already serves its home market
  out.homeFactor = out.foreignToTeam ? 1 : 1 - (Number(cfg.revenue.homeSaturationPct) || 0) / 100;
  out.specialCost = eff.specialCost;
  out.opportunity = opportunityScore(eff, cfg.opportunity, { roleSuitability, productivityScore: clamp((ep / pr.maxProductivity) * 100, 0, 100) });

  // ---- compliance ----
  const cctx = { dep, emp, team, city, cont, role, type, international: out.international, foreignToTeam: out.foreignToTeam, salaryBase, marketSalary: out.marketSalary, presence: out.presence };
  const entries = ctx.doc.compliance?.[dep.id] || {};
  const evals = ctx.rules.filter((r) => ruleApplies(r, cctx)).map((r) => evaluateRule(r, cctx, entries[r.id], cfg, ctx.fmt));
  const blockers = evals.filter((e) => e.blocking).map((e) => e.ruleId);
  out.compliance = {
    evals, blocked: blockers.length > 0, blockers,
    revenueImpactPct: Math.min(100, sum(evals.map((e) => e.revenueImpactPct))),
    counts: Object.fromEntries(['compliant', 'pending', 'noncompliant', 'unassessed', 'review', 'na', 'waived'].map((s) => [s, evals.filter((e) => e.status === s).length])),
    evidenceMissing: evals.filter((e) => e.evidenceMissing).length,
  };
  out.operational = !out.compliance.blocked;
  out.approval = dep.approval?.state || 'pending';
  // revenue per productive month before growth (a monthly rate)
  out.revenueRate = out.operational
    ? (eff.baseRevenueOpportunity / 12) * ep * mm.value * out.roleFactor * out.bmf * out.riskFactor * out.specialRevenue * out.homeFactor * (1 - out.compliance.revenueImpactPct / 100)
    : 0;
  out.potentialRate = (eff.baseRevenueOpportunity / 12) * ep * mm.value * out.roleFactor * out.bmf * out.riskFactor * out.specialRevenue * out.homeFactor;
  return out;
}

const growthOf = (d, m) => 1 + (d.eff.attrs.growthRate / 100) * ((m - 0.5) / 12);

/** Simulate one team across the evaluation period. */
export function computeTeam(ctx, team, deps, r1) {
  const { cfg } = ctx;
  const P = ctx.P;
  const costs = cfg.costs;
  const prof = ctx.profiles[team.id];
  const hq = prof.hqCityId;
  const homeCont = ctx.continents.get(team.homeContinentId);
  const model = ctx.models.get(prof.revenueModelId);
  const roster = (ctx.roster[team.id] || []).map((id) => ctx.employees.get(id)).filter(Boolean);
  deps = [...deps].sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const lines = new Map();
  const addLine = (kind, cat, amount, a = {}) => {
    if (!amount) return;
    const key = [kind, cat, a.of || '', a.depId || '', a.empId || '', a.cityId || '', a.contId || '', a.ruleId || '', a.srcId || '', a.basis || ''].join('|');
    const cur = lines.get(key);
    if (cur) cur.amount += amount;
    else lines.set(key, { kind, cat, amount, of: a.of || null, depId: a.depId || null, empId: a.empId || null, cityId: a.cityId || null, contId: a.contId || null, ruleId: a.ruleId || null, srcId: a.srcId || null, basis: a.basis || null });
  };

  // productivity in each month: ramp × time share, only on operational assignments
  const prod = {}; const prodPotential = {};
  for (const d of deps) {
    prod[d.id] = new Array(P + 1).fill(0);
    prodPotential[d.id] = new Array(P + 1).fill(0);
    const o = Number(d.emp.employment.onboardingMonths) || 0;
    const r = Number(d.emp.employment.rampUpMonths) || 0;
    for (const m of d.months) {
      const f = rampFactor(m - d.startIdx + 1, o, r) * d.share;
      prodPotential[d.id][m] = f;
      if (d.operational) prod[d.id][m] = f;
    }
    d.schedule = [];
  }
  // specialists: strength of each effect in each month
  const providers = [];
  for (const d of deps) {
    if (!d.operational) continue;
    (d.role.effects || []).forEach((ef, i) => providers.push({ d, ef, i }));
  }
  const strength = (p, m) => (Number(p.ef.max) || 0) * p.d.productivity.value * prod[p.d.id][m] * (1 - p.d.compliance.revenueImpactPct / 100);
  const inScope = (scope, d, cityId, contId) => (scope === 'city' ? d.cityId === cityId : scope === 'continent' ? d.continentId === contId : true);

  const applySavings = (cat, amount, a, m) => {
    const kind = SAVING_OF[cat];
    if (!kind || amount <= 0) return;
    const ps = providers.filter((p) => p.ef.kind === 'saving' && p.ef.category === kind && inScope(p.ef.scope, p.d, a.cityId, a.contId))
      .map((p) => ({ p, s: strength(p, m) })).filter((x) => x.s > 0);
    const tot = sum(ps.map((x) => x.s));
    if (!tot) return;
    const f = Math.min(1, cfg.revenue.savingsCap / tot);
    for (const x of ps) addLine('cost', 'savings', -amount * x.s * f, { of: cat, depId: x.p.d.id, empId: x.p.d.employeeId, cityId: a.cityId, contId: a.contId, basis: a.basis });
  };
  const addCost = (cat, amount, a, m) => { if (!amount) return; addLine('cost', cat, amount, a); applySavings(cat, amount, a, m); };

  const revCity = new Map(); // cityId → month array of revenue earned there
  const logiCity = new Map(); // revenue × logistics factor
  const bump = (map, c, m, v) => { if (!map.has(c)) map.set(c, new Array(P + 1).fill(0)); map.get(c)[m] += v; };
  let potentialTotal = 0; let standaloneTotal = 0;

  // ---------------- revenue ----------------
  for (let m = 1; m <= P; m++) {
    const direct = [];
    for (const d of deps) {
      const g = growthOf(d, m);
      if (prodPotential[d.id][m] > 0) potentialTotal += d.potentialRate * g * prodPotential[d.id][m];
      const s = d.revenueRate * g * prod[d.id][m];
      if (s > 0) { direct.push({ d, s }); standaloneTotal += s; }
    }
    // shared credit: earners of the same mechanism in the same city share customers
    const groups = new Map();
    for (const x of direct) {
      const k = `${x.d.cityId}|${x.d.mechanism}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(x);
    }
    const sc = cfg.revenue.sharedCredit;
    const kc = cfg.revenue.continentCredit?.length ? cfg.revenue.continentCredit : [1];
    const byRate = (a, b) => (b.d.revenueRate * b.d.share - a.d.revenueRate * a.d.share) || String(a.d.id).localeCompare(String(b.d.id));
    for (const arr of groups.values()) {
      arr.sort(byRate);
      arr.forEach((x, i) => { x.rank = i + 1; x.cityCredit = sc[Math.min(i, sc.length - 1)]; });
    }
    // and partly across the continent: the same brand reaches the same buyers
    const cgroups = new Map();
    for (const x of direct) {
      const k = `${x.d.continentId}|${x.d.mechanism}`;
      if (!cgroups.has(k)) cgroups.set(k, []);
      cgroups.get(k).push(x);
    }
    for (const arr of cgroups.values()) {
      arr.sort(byRate);
      arr.forEach((x, i) => { x.contRank = i + 1; x.contCredit = kc[Math.min(i, kc.length - 1)]; x.credit = x.cityCredit * x.contCredit; x.c = x.s * x.credit; });
    }
    for (const x of direct) {
      const d = x.d;
      addLine('revenue', 'direct', x.c, { depId: d.id, empId: d.employeeId, cityId: d.cityId, contId: d.continentId });
      bump(revCity, d.cityId, m, x.c); bump(logiCity, d.cityId, m, x.c * (Number(d.role.logisticsFactor) || 0));
      // colleagues' uplift on this revenue
      const ups = providers.filter((p) => p.ef.kind === 'uplift' && p.d.id !== d.id && inScope(p.ef.scope, p.d, d.cityId, d.continentId) && (p.ef.target !== 'international' || d.international))
        .map((p) => ({ p, s: strength(p, m) })).filter((y) => y.s > 0);
      const ut = sum(ups.map((y) => y.s));
      if (ut > 0) {
        const f = Math.min(1, cfg.revenue.upliftCap / ut);
        for (const y of ups) {
          const v = x.c * y.s * f;
          addLine('revenue', 'enabled', v, { depId: y.p.d.id, empId: y.p.d.employeeId, cityId: d.cityId, contId: d.continentId, srcId: d.id });
          bump(revCity, d.cityId, m, v); bump(logiCity, d.cityId, m, v * (Number(d.role.logisticsFactor) || 0));
        }
      }
      // risk mitigation recovers part of the risk discount
      if (d.riskDiscount > 0) {
        const ms = providers.filter((p) => p.ef.kind === 'riskMitigation' && p.d.id !== d.id && inScope(p.ef.scope, p.d, d.cityId, d.continentId))
          .map((p) => ({ p, s: strength(p, m) })).filter((y) => y.s > 0);
        const mt = sum(ms.map((y) => y.s));
        if (mt > 0) {
          const f = Math.min(1, 1 / mt);
          for (const y of ms) {
            const v = x.c * (d.riskDiscount / (1 - d.riskDiscount)) * y.s * f;
            addLine('revenue', 'mitigation', v, { depId: y.p.d.id, empId: y.p.d.employeeId, cityId: d.cityId, contId: d.continentId, srcId: d.id });
            bump(revCity, d.cityId, m, v); bump(logiCity, d.cityId, m, v * (Number(d.role.logisticsFactor) || 0));
          }
        }
      }
    }
    for (const d of deps) {
      const x = direct.find((y) => y.d === d);
      if (d.months.includes(m)) {
        d.schedule.push({ m, label: monthLabel(ctx.period, m), k: m - d.startIdx + 1, ramp: rampFactor(m - d.startIdx + 1, Number(d.emp.employment.onboardingMonths) || 0, Number(d.emp.employment.rampUpMonths) || 0), growth: growthOf(d, m), prod: prod[d.id][m], standalone: x ? x.s : 0, rank: x?.rank || null, contRank: x?.contRank || null, cityCredit: x?.cityCredit ?? null, contCredit: x?.contCredit ?? null, credit: x?.credit ?? null, credited: x ? x.c : 0 });
      }
    }
  }

  // ---------------- people costs, month by month ----------------
  const depsOf = (empId) => deps.filter((d) => d.employeeId === empId);
  for (const e of roster) {
    const mine = depsOf(e.id);
    const firstStart = mine.length ? Math.min(...mine.map((d) => Math.max(1, d.startIdx))) : P + 1;
    const contractEnd = Number(e.employment.contractMonths) || P;
    const homeSalary = contractedSalary(e, cfg);
    for (let m = 1; m <= Math.min(P, contractEnd); m++) {
      let used = 0;
      for (const d of mine) {
        if (!d.months.includes(m) || !d.operational) continue;
        const a = { depId: d.id, empId: e.id, cityId: d.cityId, contId: d.continentId };
        const sal = (d.salaryBase / 12) * d.share;
        addCost('salary', sal, a, m);
        addCost('employer', sal * (Number(d.cont.attrs.employerContributionPct) || 0) / 100, a, m);
        used += d.share;
      }
      const rest = Math.max(0, 1 - used);
      if (rest > 1e-12 && (costs.payBeforeDeployment || m >= firstStart)) {
        const a = { empId: e.id, cityId: hq, contId: team.homeContinentId };
        const sal = (homeSalary / 12) * rest;
        addCost('salary', sal, a, m);
        addCost('employer', sal * (Number(homeCont?.attrs?.employerContributionPct) || 0) / 100, a, m);
      }
    }
  }

  // ---------------- deployment costs ----------------
  for (const d of deps) {
    if (!d.months.length) continue;
    const a = { depId: d.id, empId: d.employeeId, cityId: d.cityId, contId: d.continentId };
    const m0 = d.months[0];
    const opMult = d.eff.attrs.operatingCostMultiplier;
    const housingMonthly = d.relocated ? (d.eff.attrs.housingAllowanceAnnual * (Number(d.type.housingFactor) || 0) / 12) * d.share * d.specialCost : 0;
    const opexMonthly = (costs.baseOpexPerEmployee * opMult / 12) * d.share * d.specialCost;
    // one-time
    if (d.operational && d.relocated) {
      const pkg = Number(costs.packageFactors?.[d.dep.relocationPackage || 'none']) || 0;
      const reloc = (Number(d.emp.employment.relocationBase) || 0) * d.eff.attrs.relocationCostMultiplier * (d.foreignToTeam ? 1 : costs.domesticRelocationFactor) * (Number(d.type.relocationFactor) || 0) * pkg;
      addCost('relocation', reloc, a, m0);
    }
    if (d.dep.trainingProvided) addCost('training', (Number(d.emp.employment.trainingCost) || 0) * opMult, a, m0);
    if (d.operational) addCost('equipment', costs.equipmentPerDeployment * opMult, a, m0);
    for (const ev of d.compliance.evals) {
      const ra = { ...a, ruleId: ev.ruleId };
      if (ev.oneTimeCost) addCost('permits', ev.oneTimeCost, ra, m0);
      if (ev.documentationCost) addCost('documentation', ev.documentationCost, ra, m0);
      if (ev.penalty) addCost('penalties', ev.penalty, ra, m0);
    }
    if (!d.operational && cfg.compliance.blocker.fixedPenalty) addCost('blockerPenalty', cfg.compliance.blocker.fixedPenalty, a, m0);
    if (d.interruption) addCost('interruption', costs.interruptionCost, a, Math.min(P, d.endIdx));
    // recurring
    for (const m of d.months) {
      if (d.operational) {
        addCost('housing', housingMonthly, a, m);
        addCost('opex', opexMonthly, a, m);
        if (d.international) addCost('support', (costs.expatSupportAnnual / 12) * d.share, a, m);
        if (d.role.annualBudget) addCost('marketing', (d.role.annualBudget / 12) * d.share * d.specialCost, { ...a, of: 'budget' }, m);
        for (const ev of d.compliance.evals) if (ev.annualCost) addCost('compliance', (ev.annualCost / 12) * d.share, { ...a, ruleId: ev.ruleId }, m);
        // legal and compliance overhead grows with the destination's legal complexity
        if (costs.complianceOverheadAnnual) addCost('compliance', ((costs.complianceOverheadAnnual * d.eff.attrs.legalComplexity / 100) / 12) * d.share, { ...a, of: 'overhead' }, m);
      } else {
        addCost('preOperational', (costs.preOperationalCostPct / 100) * (housingMonthly + opexMonthly), a, m);
      }
    }
  }
  // duplicated roles: a second holder of the same role in the same city adds coordination cost
  for (let m = 1; m <= P; m++) {
    const groups = new Map();
    for (const d of deps) {
      if (!d.operational || !d.months.includes(m)) continue;
      const k = `${d.cityId}|${d.roleId}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(d);
    }
    for (const arr of groups.values()) {
      if (arr.length < 2) continue;
      arr.sort((a, b) => (b.revenueRate - a.revenueRate) || (b.productivity.value - a.productivity.value) || String(a.id).localeCompare(String(b.id)));
      for (const d of arr.slice(1)) addCost('duplication', (costs.duplicateRoleCostPct / 100) * (d.salaryBase / 12) * d.share, { depId: d.id, empId: d.employeeId, cityId: d.cityId, contId: d.continentId }, m);
    }
  }

  // ---------------- city costs ----------------
  const cityIds = [...new Set(deps.filter((d) => d.operational && d.months.length).map((d) => d.cityId))].sort();
  const cityMode = {};
  for (const c of cityIds) {
    const ds = deps.filter((d) => d.cityId === c && d.operational && d.months.length);
    const presence = c === hq || (prof.existingPresence || []).includes(c);
    cityMode[c] = presence ? 'presence' : ds.some((d) => d.dep.officeArranged) ? 'office' : ds.some((d) => d.dep.localPartner) ? 'partner' : 'none';
  }
  for (const c of cityIds) {
    const eff = ctx.eff.get(c);
    const contId = eff.continentId;
    const cont = ctx.continents.get(contId);
    const a = { cityId: c, contId };
    const ds = deps.filter((d) => d.cityId === c && d.operational);
    let setupDone = false;
    for (let m = 1; m <= P; m++) {
      const occupied = ds.some((d) => d.months.includes(m));
      if (cityMode[c] === 'office' && occupied) {
        if (!setupDone) { addCost('setup', eff.setupCost, a, m); setupDone = true; }
        addCost('office', (eff.officeCostAnnual / 12) * eff.specialCost, a, m);
      }
      const rv = revCity.get(c)?.[m] || 0;
      const lv = logiCity.get(c)?.[m] || 0;
      if (!rv) continue;
      const ra = { ...a, basis: 'revenue' };
      addCost('logistics', lv * eff.attrs.shippingCostPct / 100, ra, m);
      if (cityMode[c] === 'partner') addCost('partner', rv * (Number(cont.attrs.partnerFeePct) || 0) / 100, ra, m);
      if (model?.marketingPctOfRevenue) addCost('marketing', rv * model.marketingPctOfRevenue / 100, { ...ra, of: 'share' }, m);
      if (contId !== team.homeContinentId) addCost('fx', rv * (Number(cont.attrs.fxCostPct) || 0) / 100, ra, m);
    }
  }
  // cities where revenue was earned but no one of the team was stationed (enabled revenue only lands where an earner works, so this is just a guard)
  for (const [c, arr] of revCity) if (!cityIds.includes(c) && sum(arr) > 0) cityIds.push(c);

  // ---------------- round every line once ----------------
  let L = [...lines.values()].map((l) => ({ ...l, amount: money(l.amount) })).filter((l) => l.amount !== 0);

  // market entry: once per foreign continent entered, split equally across its cities
  const contsEntered = [...new Set(deps.filter((d) => d.operational && d.months.length && d.foreignToTeam).map((d) => d.continentId))].sort();
  for (const k of contsEntered) {
    const cont = ctx.continents.get(k);
    const total = money(Number(cont.attrs.marketEntryCost) || 0);
    const cs = cityIds.filter((c) => ctx.eff.get(c).continentId === k && deps.some((d) => d.cityId === c && d.operational && d.months.length));
    allocate(total, cs.map(() => 1)).forEach((amt, i) => { if (amt) L.push({ kind: 'cost', cat: 'marketEntry', amount: amt, of: null, depId: null, empId: null, cityId: cs[i], contId: k, ruleId: null, srcId: null, basis: null }); });
  }
  // tax: each city on its own profit (a loss-making city pays none)
  const taxByCity = {};
  if (costs.taxEnabled) {
    const allCities = [...new Set(L.map((l) => l.cityId).filter(Boolean))].sort();
    for (const c of allCities) {
      const rev = sum(L.filter((l) => l.kind === 'revenue' && l.cityId === c).map((l) => l.amount));
      const ded = sum(L.filter((l) => l.kind === 'cost' && l.cityId === c && !NON_DEDUCTIBLE.has(l.cat)).map((l) => l.amount));
      const eff = ctx.eff.get(c);
      const pre = rev - ded;
      const rate = eff ? eff.attrs.taxRate : 0;
      const tax = pre > 0 ? money(pre * rate / 100) : 0;
      taxByCity[c] = { profitBeforeTax: pre, rate, tax, saved: 0 };
      if (!tax) continue;
      L.push({ kind: 'cost', cat: 'tax', amount: tax, of: null, depId: null, empId: null, cityId: c, contId: eff.continentId, ruleId: null, srcId: null, basis: null });
      // tax planning by finance specialists: their strength averaged over the period
      const ps = providers.filter((p) => p.ef.kind === 'saving' && p.ef.category === 'tax' && inScope(p.ef.scope, p.d, c, eff.continentId))
        .map((p) => { let acc = 0; for (let m = 1; m <= P; m++) acc += strength(p, m); return { p, s: acc / P }; }).filter((x) => x.s > 0);
      const st = sum(ps.map((x) => x.s));
      if (st > 0) {
        const f = Math.min(1, cfg.revenue.savingsCap / st);
        for (const x of ps) {
          const v = money(-tax * x.s * f);
          if (v) { L.push({ kind: 'cost', cat: 'savings', amount: v, of: 'tax', depId: x.p.d.id, empId: x.p.d.employeeId, cityId: c, contId: eff.continentId, ruleId: null, srcId: null, basis: null }); taxByCity[c].saved -= v; }
        }
      }
    }
  }
  L.sort((a, b) => (a.kind.localeCompare(b.kind)) || a.cat.localeCompare(b.cat) || String(a.cityId).localeCompare(String(b.cityId)) || String(a.depId).localeCompare(String(b.depId)) || String(a.empId).localeCompare(String(b.empId)) || String(a.ruleId).localeCompare(String(b.ruleId)) || String(a.srcId).localeCompare(String(b.srcId)) || String(a.of).localeCompare(String(b.of)));

  // ---------------- statement ----------------
  const typeOf = (l) => (l.kind === 'revenue' ? 'revenue' : CATEGORIES[l.cat === 'savings' ? l.of : l.cat]?.type || 'recurring');
  const tot = (f) => sum(L.filter(f).map((l) => l.amount));
  const revenue = tot((l) => l.kind === 'revenue');
  const section = (type) => {
    const ls = L.filter((l) => l.kind === 'cost' && typeOf(l) === type);
    const byCategory = {};
    for (const l of ls) {
      const k = l.cat;
      byCategory[k] = (byCategory[k] || 0) + l.amount;
    }
    return { total: sum(ls.map((l) => l.amount)), byCategory };
  };
  const oneTime = section('oneTime'); const recurring = section('recurring'); const contingent = section('contingent');
  const totalCosts = oneTime.total + recurring.total + contingent.total;
  const operatingProfit = revenue - recurring.total;
  const netContribution = revenue - totalCosts;
  const r1Hiring = r1?.initialHiringCost || 0;
  const combined = netContribution - r1Hiring;
  const byType = { direct: tot((l) => l.kind === 'revenue' && l.cat === 'direct'), enabled: tot((l) => l.kind === 'revenue' && l.cat === 'enabled'), mitigation: tot((l) => l.kind === 'revenue' && l.cat === 'mitigation') };
  const statement = { revenue: { total: revenue, byType }, oneTime, recurring, contingent, totalCosts, operatingProfit, netContribution, round1InitialHiringCost: r1Hiring, combined };

  // ---------------- attribution ----------------
  const empIds = roster.map((e) => e.id);
  const byEmployee = Object.fromEntries(roster.map((e) => [e.id, { employeeId: e.id, name: e.name, revenue: 0, ownCosts: 0, sharedCosts: 0, contribution: 0 }]));
  const cityRevByEmp = {};
  for (const l of L) {
    if (l.kind !== 'revenue' || !l.empId) continue;
    cityRevByEmp[l.cityId] ||= {};
    cityRevByEmp[l.cityId][l.empId] = (cityRevByEmp[l.cityId][l.empId] || 0) + l.amount;
  }
  for (const l of L) {
    if (l.kind === 'revenue') { if (byEmployee[l.empId]) byEmployee[l.empId].revenue += l.amount; continue; }
    if (l.empId && byEmployee[l.empId]) { byEmployee[l.empId].ownCosts += l.amount; continue; }
    // a shared city cost: split by the revenue each employee earned in that city
    const w = cityRevByEmp[l.cityId] || {};
    let ids = Object.keys(w).filter((id) => byEmployee[id] && w[id] > 0).sort();
    let weights = ids.map((id) => w[id]);
    if (!ids.length) {
      ids = [...new Set(deps.filter((d) => d.cityId === l.cityId).map((d) => d.employeeId))].filter((id) => byEmployee[id]).sort();
      weights = ids.map(() => 1);
    }
    if (!ids.length) { ids = [...empIds].sort(); weights = ids.map(() => 1); }
    allocate(l.amount, weights).forEach((amt, i) => { byEmployee[ids[i]].sharedCosts += amt; });
  }
  for (const v of Object.values(byEmployee)) v.contribution = v.revenue - v.ownCosts - v.sharedCosts;

  const byCity = {};
  for (const l of L) {
    const c = l.cityId || hq;
    byCity[c] ||= { cityId: c, name: ctx.cities.get(c)?.name || c, continentId: ctx.cities.get(c)?.continentId, revenue: 0, costs: 0, contribution: 0, employees: [], mode: cityMode[c] || (c === hq ? 'presence' : null), tax: taxByCity[c] || null };
    if (l.kind === 'revenue') byCity[c].revenue += l.amount; else byCity[c].costs += l.amount;
  }
  for (const v of Object.values(byCity)) {
    v.contribution = v.revenue - v.costs;
    v.employees = [...new Set(deps.filter((d) => d.cityId === v.cityId).map((d) => d.employeeId))].sort();
  }
  const byContinent = {};
  for (const v of Object.values(byCity)) {
    const k = v.continentId;
    byContinent[k] ||= { continentId: k, name: ctx.continents.get(k)?.name || k, revenue: 0, costs: 0, contribution: 0, cities: [] };
    byContinent[k].revenue += v.revenue; byContinent[k].costs += v.costs; byContinent[k].cities.push(v.cityId);
  }
  for (const v of Object.values(byContinent)) v.contribution = v.revenue - v.costs;

  // main function of each employee: the role of their longest deployment
  const mainDep = {};
  for (const e of roster) {
    const ds = depsOf(e.id);
    ds.sort((a, b) => (b.months.length * b.share - a.months.length * a.share) || String(a.id).localeCompare(String(b.id)));
    mainDep[e.id] = ds[0] || null;
  }
  const byFunction = {};
  for (const e of roster) {
    const f = mainDep[e.id] ? mainDep[e.id].role.function : 'hq';
    byFunction[f] ||= { function: f, revenue: 0, costs: 0, contribution: 0, employees: [] };
    const v = byEmployee[e.id];
    byFunction[f].revenue += v.revenue; byFunction[f].costs += v.ownCosts + v.sharedCosts; byFunction[f].contribution += v.contribution; byFunction[f].employees.push(e.id);
  }

  // per deployment
  const depResults = {};
  for (const d of deps) {
    const mineL = L.filter((l) => l.depId === d.id);
    const rev = sum(mineL.filter((l) => l.kind === 'revenue').map((l) => l.amount));
    const byCat = {};
    for (const l of mineL.filter((x) => x.kind === 'cost')) byCat[l.cat] = (byCat[l.cat] || 0) + l.amount;
    const oneT = sum(mineL.filter((l) => l.kind === 'cost' && typeOf(l) === 'oneTime').map((l) => l.amount));
    const rec = sum(mineL.filter((l) => l.kind === 'cost' && typeOf(l) === 'recurring').map((l) => l.amount));
    const cont = sum(mineL.filter((l) => l.kind === 'cost' && typeOf(l) === 'contingent').map((l) => l.amount));
    const directRev = sum(mineL.filter((l) => l.kind === 'revenue' && l.cat === 'direct').map((l) => l.amount));
    const effMonths = sum(d.schedule.map((s) => s.prod));
    depResults[d.id] = {
      revenue: rev, directRevenue: directRev, enabledRevenue: rev - directRev, costsByCategory: byCat, oneTimeCosts: oneT, recurringCosts: rec, contingentCosts: cont,
      costs: oneT + rec + cont, contribution: rev - oneT - rec - cont, effectiveMonths: effMonths,
      avgCredit: d.schedule.filter((s) => s.credit !== null).length ? sum(d.schedule.filter((s) => s.credit !== null).map((s) => s.credit)) / d.schedule.filter((s) => s.credit !== null).length : null,
    };
  }

  // ---------------- scores and ratios ----------------
  const maxP = cfg.productivity.maxProductivity;
  const effectiveness = {};
  for (const e of roster) {
    const ds = depsOf(e.id);
    let acc = 0;
    for (const d of ds) for (let m = 1; m <= P; m++) acc += d.productivity.value * prod[d.id][m];
    effectiveness[e.id] = clamp((100 * acc) / P, 0, 100);
  }
  const deploymentEffectiveness = roster.length ? sum(roster.map((e) => effectiveness[e.id])) / roster.length : 0;
  const allEvals = deps.flatMap((d) => d.compliance.evals);
  const cs = complianceScore(allEvals, cfg);
  const readiness = deps.length ? (100 * deps.filter((d) => d.operational).length) / deps.length : 0;
  const complianceReadiness = (cfg.compliance.complianceShare * cs.score + cfg.compliance.readinessShare * readiness) / ((cfg.compliance.complianceShare + cfg.compliance.readinessShare) || 1);
  const blocked = deps.filter((d) => !d.operational);
  const noncompliant = allEvals.filter((e) => e.status === 'noncompliant').length;
  const hired = roster.length;
  const variable = tot((l) => l.kind === 'cost' && l.basis === 'revenue');
  const taxTotal = tot((l) => l.cat === 'tax');
  const fixed = totalCosts - taxTotal - variable;
  const vr = revenue > 0 ? variable / revenue : null;
  const breakEven = vr !== null && vr < 1 ? money(fixed / (1 - vr)) : null;
  const expansionBudget = Number(prof.expansionBudget) || 0;
  const baselineForPeriod = (Number(prof.baselineRevenue) || 0) * (P / 12);
  const nonCompliance = (contingent.byCategory.preOperational || 0) + (contingent.byCategory.documentation || 0) + (contingent.byCategory.penalties || 0) + (contingent.byCategory.blockerPenalty || 0);
  const riskW = Object.values(byCity).filter((c) => c.revenue > 0);
  const weightedRisk = riskW.length ? sum(riskW.map((c) => c.revenue * (ctx.eff.get(c.cityId)?.attrs.riskScore || 0))) / sum(riskW.map((c) => c.revenue)) : null;
  const pctOrNull = (x) => (x === null ? null : x * 100);
  const metrics = {
    hired, deployed: new Set(deps.map((d) => d.employeeId)).size,
    deployedInternationally: new Set(deps.filter((d) => d.foreignToTeam).map((d) => d.employeeId)).size,
    revenuePerEmployee: hired ? money(revenue / hired) : null,
    operatingCostPerEmployee: hired ? money(recurring.total / hired) : null,
    profitPerEmployee: hired ? money(netContribution / hired) : null,
    revenueGrowthPct: baselineForPeriod > 0 ? (100 * revenue) / baselineForPeriod : null,
    roeePct: pctOrNull(ratio(netContribution, totalCosts)),
    combinedReturnPct: pctOrNull(ratio(combined, totalCosts + r1Hiring)),
    expansionBudget: expansionBudget || null,
    budgetUtilPct: expansionBudget > 0 ? (100 * totalCosts) / expansionBudget : null,
    cashRemaining: (Number(prof.startingCash) || 0) - r1Hiring - totalCosts + revenue,
    breakEvenRevenue: breakEven, variableCostRatioPct: vr === null ? null : vr * 100, fixedCosts: fixed,
    profitMarginPct: revenue > 0 ? (100 * netContribution) / revenue : null,
    operatingMarginPct: revenue > 0 ? (100 * operatingProfit) / revenue : null,
    costOfNonCompliance: nonCompliance,
    revenueForgoneEstimate: money(Math.max(0, potentialTotal - standaloneTotal)),
    deploymentEffectiveness: r2(deploymentEffectiveness), effectivenessByEmployee: effectiveness,
    complianceScore: r2(cs.score), readinessPct: r2(readiness), complianceReadiness: r2(complianceReadiness),
    blockedCount: blocked.length, compliantDeployments: deps.filter((d) => d.operational && d.compliance.evals.every((e) => e.satisfied)).length,
    noncompliantCount: noncompliant, violations: noncompliant + blocked.length,
    pendingCount: allEvals.filter((e) => e.status === 'pending').length,
    unassessedCount: allEvals.filter((e) => e.status === 'unassessed').length,
    weightedRisk,
  };

  // best and worst destinations (by contribution)
  const citiesSorted = Object.values(byCity).filter((c) => c.cityId !== hq || c.revenue > 0).sort((a, b) => (b.contribution - a.contribution) || a.cityId.localeCompare(b.cityId));
  metrics.bestCity = citiesSorted[0]?.cityId || null;
  metrics.worstCity = citiesSorted.length > 1 ? citiesSorted.at(-1).cityId : null;

  return {
    teamId: team.id, lines: L, statement, metrics, byEmployee, byCity, byContinent, byFunction, deployments: depResults,
    cityMode, taxByCity, mainDeployment: Object.fromEntries(Object.entries(mainDep).map(([k, v]) => [k, v?.id || null])),
    complianceDetail: cs,
  };
}

export function computeRound2(ctx, r1) {
  const evals = (ctx.doc.deployments || []).map((d) => evaluateDeployment(ctx, d));
  const teams = {};
  for (const t of ctx.teams) teams[t.id] = computeTeam(ctx, t, evals.filter((d) => d.teamId === t.id && d.valid), r1.teams[t.id]);
  return { evals, teams };
}
