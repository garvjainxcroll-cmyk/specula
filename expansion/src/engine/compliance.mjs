// The compliance engine. A rule applies to a deployment according to its scope; its status
// is either recorded by the operator (documents, approvals) or checked automatically from
// the deployment's own data (salary, duration, qualifications, training, partner…).
//
// Statuses are kept apart on purpose:
//   unassessed   no information entered yet — NOT treated as a refusal
//   pending      documents or an approval are awaited (also: "compliant" without required evidence)
//   noncompliant a confirmed violation
//   review       the Super Administrator must look at it
//   na           not applicable; compliant; waived (by an administrator, with a reason)

import { seniorityRank, SENIORITY, PACKAGES } from './model.mjs';
import { capValue } from './capability.mjs';

const has = (arr) => Array.isArray(arr) && arr.length > 0;

/** Does the rule apply to this deployment? */
export function ruleApplies(rule, ctx) {
  const s = rule.appliesTo || {};
  if (has(rule.continentIds) && !rule.continentIds.includes(ctx.cont.id)) return false;
  if (has(rule.cityIds) && !rule.cityIds.includes(ctx.city.id)) return false;
  if (has(s.functions) && !s.functions.includes(ctx.role.function)) return false;
  if (has(s.roles) && !s.roles.includes(ctx.role.id)) return false;
  if (has(s.seniority) && !s.seniority.includes(ctx.emp.seniority)) return false;
  if (has(s.assignmentTypes) && !s.assignmentTypes.includes(ctx.type.id)) return false;
  if (s.when === 'international' && !ctx.international) return false;
  if (s.when === 'foreignToTeam' && !ctx.foreignToTeam) return false;
  return true;
}

export function describeScope(rule, names = {}) {
  const s = rule.appliesTo || {};
  const parts = [];
  parts.push(has(rule.cityIds) ? `cities: ${rule.cityIds.map((c) => names[c] || c).join(', ')}`
    : has(rule.continentIds) ? `continents: ${rule.continentIds.map((c) => names[c] || c).join(', ')}` : 'every destination');
  if (s.when === 'international') parts.push('employees who are not citizens of the destination continent');
  if (s.when === 'foreignToTeam') parts.push('destinations outside the team’s home continent');
  if (has(s.functions)) parts.push(`functions: ${s.functions.join(', ')}`);
  if (has(s.roles)) parts.push(`roles: ${s.roles.join(', ')}`);
  if (has(s.seniority)) parts.push(`seniority: ${s.seniority.join(', ')}`);
  if (has(s.assignmentTypes)) parts.push(`assignment types: ${s.assignmentTypes.join(', ')}`);
  return parts.join('; ');
}

/** Automatic checks: returns { ok, detail } from the deployment's own data. */
export function autoCheck(rule, ctx, fmt) {
  const c = rule.check || { kind: 'status' };
  switch (c.kind) {
    case 'minSalary': {
      let threshold;
      let basis;
      if (c.basis === 'fixed') { threshold = Number(c.amount) || 0; basis = 'a fixed minimum'; }
      else if (c.basis === 'expected') { threshold = Math.round(ctx.emp.employment.expectedSalary * (Number(c.pct) || 100) / 100); basis = `${c.pct}% of the employee’s expected salary`; }
      else { threshold = Math.round(ctx.marketSalary * (Number(c.pct) || 100) / 100); basis = `${c.pct}% of the local market salary (${fmt(ctx.marketSalary)})`; }
      const ok = ctx.salaryBase >= threshold;
      return { ok, detail: `Salary ${fmt(ctx.salaryBase)} ${ok ? '≥' : '<'} minimum ${fmt(threshold)} (${basis})`, threshold };
    }
    case 'maxContractMonths': {
      const ok = ctx.dep.contractMonths <= Number(c.months);
      return { ok, detail: `Assignment of ${ctx.dep.contractMonths} months ${ok ? '≤' : '>'} limit of ${c.months} months` };
    }
    case 'minExperience': {
      const ok = (ctx.emp.yearsExperience || 0) >= Number(c.years);
      return { ok, detail: `${ctx.emp.yearsExperience} years of experience ${ok ? '≥' : '<'} required ${c.years}` };
    }
    case 'minCapability': {
      const v = capValue(ctx.emp, c.key);
      const ok = v >= Number(c.min);
      return { ok, detail: `${c.key} score ${v} ${ok ? '≥' : '<'} required ${c.min}` };
    }
    case 'minSeniority': {
      const ok = seniorityRank(ctx.emp.seniority) >= seniorityRank(c.level);
      return { ok, detail: `Seniority ${ctx.emp.seniority} ${ok ? 'meets' : 'is below'} ${c.level}` };
    }
    case 'localPartner': {
      const ok = !!ctx.dep.localPartner;
      return { ok, detail: ok ? 'A local partner is engaged' : 'No local partner is engaged' };
    }
    case 'officeOrPartner': {
      const ok = !!(ctx.dep.localPartner || ctx.dep.officeArranged || ctx.presence);
      return { ok, detail: ok ? 'A local office, partner or existing presence is in place' : 'Neither a local office nor a partner is arranged' };
    }
    case 'trainingProvided': {
      const ok = !!ctx.dep.trainingProvided;
      return { ok, detail: ok ? 'The required training is provided' : 'The required training is not provided' };
    }
    case 'relocationPackage': {
      const need = PACKAGES[c.min || 'standard']?.rank ?? 1;
      const got = PACKAGES[ctx.dep.relocationPackage || 'none']?.rank ?? 0;
      const ok = got >= need;
      return { ok, detail: `Package “${PACKAGES[ctx.dep.relocationPackage || 'none']?.label}” ${ok ? 'meets' : 'is below'} the minimum “${PACKAGES[c.min || 'standard']?.label}”` };
    }
    case 'assignmentTypeBan': {
      const banned = (c.types || []).includes(ctx.type.id);
      return { ok: !banned, detail: banned ? `“${ctx.type.name}” is not permitted here` : `“${ctx.type.name}” is permitted` };
    }
    default: return null;
  }
}

/**
 * Evaluate one applicable rule for one deployment.
 * entry: the operator's record { status, evidence, note, waiver } (may be missing).
 */
export function evaluateRule(rule, ctx, entry, cfg, fmt) {
  const kind = rule.check?.kind || 'status';
  const auto = kind !== 'status';
  let status; let detail = ''; let evidenceMissing = false;
  if (auto) {
    const r = autoCheck(rule, ctx, fmt);
    status = r.ok ? 'compliant' : 'noncompliant';
    detail = r.detail;
    if (entry?.status === 'review') { status = 'review'; detail += ' — referred for administrator review'; }
  } else {
    status = entry?.status || 'unassessed';
    if (status === 'compliant' && rule.evidenceRequired && !String(entry?.evidence || '').trim()) {
      status = 'pending'; evidenceMissing = true; detail = 'Marked compliant, but the required evidence is not recorded';
    }
  }
  const waived = !!(entry?.waiver && rule.waivable);
  if (waived) status = 'waived';
  const satisfied = ['compliant', 'na', 'waived'].includes(status);
  // a pending rule that can only be completed after arrival does not stop the deployment
  const pendingAllowed = status === 'pending' && rule.satisfiableBefore === false;
  const blocking = !!(rule.mandatory && rule.blocks && !satisfied && !pendingAllowed);
  const chargeCost = status === 'compliant' || status === 'pending';
  const penalty = status === 'noncompliant' ? Number(rule.penalty) || 0 : 0;
  const revenueImpactPct = rule.mandatory && !satisfied && !blocking ? Number(rule.revenueImpactPct) || 0 : 0;
  return {
    ruleId: rule.id, title: rule.title, category: rule.category, mandatory: !!rule.mandatory, blocks: !!rule.blocks,
    satisfiableBefore: rule.satisfiableBefore !== false, evidenceRequired: !!rule.evidenceRequired,
    source: auto ? 'auto' : 'manual', status, detail, evidence: entry?.evidence || '', note: entry?.note || '',
    evidenceMissing, waived, waiver: waived ? entry.waiver : null, waivable: !!rule.waivable,
    satisfied, blocking, pendingAllowed,
    oneTimeCost: chargeCost && rule.costType !== 'annual' ? Number(rule.cost) || 0 : 0,
    annualCost: chargeCost && rule.costType === 'annual' ? Number(rule.cost) || 0 : 0,
    documentationCost: status === 'pending' ? Number(cfg.costs.pendingDocumentationCost) || 0 : 0,
    penalty, penaltyCategory: rule.category === 'Market entry' ? 'Market-entry penalty' : 'Non-compliance penalty',
    revenueImpactPct, scorePenalty: status === 'noncompliant' ? Number(rule.scorePenalty) || 0 : 0,
  };
}

/** Compliance score of a set of evaluations, 0–100 (weighted status scores, minus penalties). */
export function complianceScore(evals, cfg) {
  const scores = cfg.compliance.statusScores;
  let wsum = 0; let acc = 0; let pen = 0;
  for (const e of evals) {
    const s = scores[e.status];
    if (s === null || s === undefined) continue; // not applicable: left out
    const w = e.mandatory ? Number(cfg.compliance.mandatoryWeight) || 1 : 1;
    wsum += w; acc += w * s; pen += e.scorePenalty || 0;
  }
  if (!wsum) return { score: 100, counted: 0, penalty: pen };
  return { score: Math.max(0, Math.min(100, acc / wsum - pen)), counted: wsum, penalty: pen };
}

export { SENIORITY };
