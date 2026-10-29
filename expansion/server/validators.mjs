// Input checking for everything the console can send. The server never trusts the
// website: every value is checked here before it reaches a session.

import { defaultConfig } from '../src/data/defaults.mjs';
import { CAP_KEYS, FUNCTIONS, MECHANISMS, EFFECT_KINDS, SCOPES, SAVING_CATEGORIES, SENIORITY, CHECKS, VISIBILITY_GROUPS, ATTRS, PACKAGES, CHECK_KINDS, RULE_CATEGORIES, MANUAL_STATUSES } from '../src/engine/model.mjs';
import { DRIVER_LABELS } from '../src/engine/regions.mjs';
import { parseYm } from '../src/engine/months.mjs';
import { TIE_BREAKS } from '../src/engine/ranking.mjs';

export class Refusal extends Error {
  constructor(code, message, details = null, status = 200) { super(message); this.code = code; this.details = details; this.status = status; }
}
export const refuse = (code, message, details = null, status = 200) => { throw new Refusal(code, message, details, status); };
export const need = (cond, code, message, details = null, status = 200) => { if (!cond) refuse(code, message, details, status); };

export const isInt = (x) => Number.isInteger(x);
export const isMoney = (x) => Number.isInteger(x) && x >= 0 && x <= 1e15;
export const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
export function str(x, max = 200, { required = false, field = 'text' } = {}) {
  if (x === undefined || x === null) { if (required) refuse('INVALID', `${field} is required.`); return ''; }
  if (typeof x !== 'string') refuse('INVALID', `${field} must be text.`);
  const t = x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  if (required && !t) refuse('INVALID', `${field} is required.`);
  if (t.length > max) refuse('INVALID', `${field} is too long (at most ${max} characters).`);
  return t;
}
export const strList = (x, max = 20, each = 200, field = 'list') => {
  if (x === undefined || x === null) return [];
  if (!Array.isArray(x) || x.length > max) refuse('INVALID', `${field} must be a list of at most ${max} items.`);
  return x.map((v) => str(v, each, { field }));
};
export function reasonOf(r, field = 'A reason') {
  const t = str(r, 500, { field });
  if (t.length < 5) refuse('REASON_REQUIRED', `${field} of at least a few words is required for this change.`);
  return t;
}
export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/;

// ---------------- configuration sections ----------------

const TEMPLATE = defaultConfig();
export const FORMULA_SECTIONS = ['roles', 'assignmentTypes', 'indices', 'productivity', 'revenue', 'costs', 'compliance', 'opportunity', 'ranking', 'thresholds'];
export const CONFIG_SECTIONS = ['event', 'currency', 'period', 'identicalResources', 'auction', 'round1', 'deployment', ...FORMULA_SECTIONS, 'validationSeverity', 'visibility'];

/** Same keys and types as the template (null in the template allows null or a number). */
function shape(value, tmpl, path) {
  if (tmpl === null) { if (value !== null && !isNum(value)) refuse('INVALID', `${path} must be a number or empty.`); return value; }
  if (Array.isArray(tmpl)) {
    if (!Array.isArray(value)) refuse('INVALID', `${path} must be a list.`);
    if (tmpl.length && typeof tmpl[0] === 'number') { if (value.some((v) => !isNum(v))) refuse('INVALID', `${path} must be a list of numbers.`); }
    else if (tmpl.length && typeof tmpl[0] === 'string') { if (value.some((v) => typeof v !== 'string')) refuse('INVALID', `${path} must be a list of names.`); }
    return value;
  }
  if (typeof tmpl === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) refuse('INVALID', `${path} must be a group of settings.`);
    const out = {};
    for (const k of Object.keys(tmpl)) {
      if (!(k in value)) refuse('INVALID', `${path}.${k} is missing.`);
      out[k] = shape(value[k], tmpl[k], `${path}.${k}`);
    }
    for (const k of Object.keys(value)) if (!(k in tmpl)) refuse('INVALID', `${path}.${k} is not a known setting.`);
    return out;
  }
  if (typeof tmpl === 'number') { if (!isNum(value)) refuse('INVALID', `${path} must be a number.`); return value; }
  if (typeof tmpl === 'boolean') { if (typeof value !== 'boolean') refuse('INVALID', `${path} must be yes or no.`); return value; }
  if (typeof tmpl === 'string') return str(value, 200, { field: path });
  return value;
}

const weightsMap = (m, keys, path) => {
  if (!m || typeof m !== 'object' || Array.isArray(m)) refuse('INVALID', `${path} must be a set of weights.`);
  const out = {};
  for (const [k, v] of Object.entries(m)) {
    if (!keys.includes(k)) refuse('INVALID', `${path}: “${k}” is not a known factor.`);
    if (!isNum(v) || v < 0) refuse('INVALID', `${path}: weight for “${k}” must be zero or more.`);
    if (v > 0) out[k] = v;
  }
  return out;
};

function role(r, i) {
  const path = `Role ${i + 1}`;
  if (!r || typeof r !== 'object') refuse('INVALID', `${path} is not valid.`);
  const id = str(r.id, 24, { required: true, field: `${path} identifier` });
  if (!ID_RE.test(id)) refuse('INVALID', `${path}: identifier may use letters, numbers and dashes only.`);
  if (!FUNCTIONS.includes(r.function)) refuse('INVALID', `${path}: function is not valid.`);
  if (!MECHANISMS[r.mechanism]) refuse('INVALID', `${path}: revenue mechanism is not valid.`);
  for (const k of ['revenueFactor', 'logisticsFactor']) if (!isNum(r[k]) || r[k] < 0 || r[k] > 3) refuse('INVALID', `${path}: ${k} must be 0–3.`);
  if (!isMoney(r.annualBudget)) refuse('INVALID', `${path}: campaign budget must be an amount of zero or more.`);
  const effects = (Array.isArray(r.effects) ? r.effects : []).map((ef, j) => {
    if (!EFFECT_KINDS[ef?.kind] || !SCOPES[ef?.scope] || !isNum(ef?.max) || ef.max < 0 || ef.max > 1) refuse('INVALID', `${path}, effect ${j + 1}: kind, scope and a strength from 0 to 1 are required.`);
    const o = { kind: ef.kind, scope: ef.scope, max: ef.max };
    if (ef.kind === 'saving') { if (!SAVING_CATEGORIES[ef.category]) refuse('INVALID', `${path}, effect ${j + 1}: saving category is not valid.`); o.category = ef.category; }
    if (ef.kind === 'uplift') o.target = ef.target === 'international' ? 'international' : 'all';
    return o;
  });
  if (effects.length > 4) refuse('INVALID', `${path}: at most four effects.`);
  return {
    id, name: str(r.name, 80, { required: true, field: `${path} name` }), function: r.function, mechanism: r.mechanism,
    revenueFactor: r.revenueFactor, logisticsFactor: r.logisticsFactor, annualBudget: r.annualBudget,
    weights: weightsMap(r.weights, CAP_KEYS, `${path} capability weights`),
    drivers: weightsMap(r.drivers, Object.keys(DRIVER_LABELS), `${path} destination drivers`),
    effects,
  };
}
function assignmentType(t, i) {
  const path = `Assignment type ${i + 1}`;
  const id = str(t?.id, 24, { required: true, field: `${path} identifier` });
  if (!ID_RE.test(id)) refuse('INVALID', `${path}: identifier may use letters, numbers and dashes only.`);
  for (const k of ['relocationFactor', 'housingFactor']) if (!isNum(t[k]) || t[k] < 0 || t[k] > 5) refuse('INVALID', `${path}: ${k} must be 0–5.`);
  if (t.maxMonths !== null && (!isInt(t.maxMonths) || t.maxMonths < 1)) refuse('INVALID', `${path}: maximum duration must be empty or a whole number of months.`);
  if (t.minSeniority !== null && !SENIORITY.includes(t.minSeniority)) refuse('INVALID', `${path}: minimum seniority is not valid.`);
  return { id, name: str(t.name, 80, { required: true, field: `${path} name` }), relocationFactor: t.relocationFactor, housingFactor: t.housingFactor, maxMonths: t.maxMonths, minSeniority: t.minSeniority };
}

export function checkSection(section, value, doc) {
  if (!CONFIG_SECTIONS.includes(section)) refuse('INVALID', `Unknown configuration section “${section}”.`);
  switch (section) {
    case 'identicalResources': if (typeof value !== 'boolean') refuse('INVALID', 'Choose yes or no.'); return value;
    case 'roles': {
      if (!Array.isArray(value) || !value.length || value.length > 30) refuse('INVALID', 'Provide between 1 and 30 job roles.');
      const out = value.map(role);
      if (new Set(out.map((r) => r.id)).size !== out.length) refuse('INVALID', 'Two roles share an identifier.');
      const used = new Set((doc.deployments || []).map((d) => d.roleId));
      for (const id of used) if (!out.some((r) => r.id === id)) refuse('IN_USE', `Role “${id}” is used by a deployment and cannot be removed.`);
      return out;
    }
    case 'assignmentTypes': {
      if (!Array.isArray(value) || !value.length || value.length > 12) refuse('INVALID', 'Provide between 1 and 12 assignment types.');
      const out = value.map(assignmentType);
      if (new Set(out.map((r) => r.id)).size !== out.length) refuse('INVALID', 'Two assignment types share an identifier.');
      const used = new Set((doc.deployments || []).map((d) => d.assignmentTypeId));
      for (const id of used) if (!out.some((r) => r.id === id)) refuse('IN_USE', `Assignment type “${id}” is used by a deployment and cannot be removed.`);
      return out;
    }
    case 'indices': {
      const out = {};
      for (const k of Object.keys(TEMPLATE.indices)) out[k] = weightsMap(value?.[k], CAP_KEYS, `Index “${k}”`);
      return out;
    }
    case 'validationSeverity': {
      const out = {};
      for (const [k, v] of Object.entries(value || {})) {
        if (!CHECKS[k]) refuse('INVALID', `Unknown check “${k}”.`);
        if (CHECKS[k].fixed) refuse('FIXED', `“${CHECKS[k].title}” is always blocking and cannot be changed.`);
        if (!['blocking', 'warning'].includes(v)) refuse('INVALID', 'Severity must be blocking or warning.');
        out[k] = v;
      }
      return out;
    }
    case 'visibility': {
      const groups = Object.keys(VISIBILITY_GROUPS);
      const pick = (m, name) => { const o = {}; for (const [k, v] of Object.entries(m || {})) { if (!groups.includes(k)) refuse('INVALID', `Unknown information group “${k}”.`); if (typeof v !== 'boolean') refuse('INVALID', `${name}: choose shown or hidden.`); o[k] = v; } return o; };
      const ids = new Set([...(doc.continents || []).map((c) => c.id), ...(doc.cities || []).map((c) => c.id)]);
      const hiddenRegions = (value?.hiddenRegions || []).map((x) => { if (!ids.has(x)) refuse('INVALID', `Unknown region “${x}”.`); return x; });
      return { operators: pick(value?.operators, 'Operators'), reports: pick(value?.reports, 'Reports'), hiddenRegions };
    }
    case 'deployment': {
      const v = shape(value, TEMPLATE.deployment, 'Deployment rules');
      for (const k of ['maxPerCity', 'maxPerContinent', 'maxForeignContinents']) if (v[k] !== null && (!isInt(v[k]) || v[k] < 0)) refuse('INVALID', `${k} must be empty or a whole number.`);
      if (!isInt(v.minHomeRetained) || v.minHomeRetained < 0 || v.minHomeRetained > 10) refuse('INVALID', 'Minimum kept at home must be 0–10.');
      const types = new Set((doc.config.assignmentTypes || []).map((t) => t.id));
      for (const t of v.allowedAssignmentTypes) if (!types.has(t)) refuse('INVALID', `Unknown assignment type “${t}”.`);
      return v;
    }
    case 'auction': {
      const v = shape(value, TEMPLATE.auction, 'Auction rules');
      if (!isInt(v.teamSize) || v.teamSize < 1 || v.teamSize > 10) refuse('INVALID', 'Team size must be 1–10.');
      if (!isInt(v.poolSize) || v.poolSize < 1 || v.poolSize > 60) refuse('INVALID', 'Number of CVs must be 1–60.');
      if (!['bids', 'initialHiringCost'].includes(v.budgetBasis)) refuse('INVALID', 'Budget basis is not valid.');
      if (!['warn', 'block'].includes(v.budgetEnforcement)) refuse('INVALID', 'Budget enforcement is not valid.');
      return v;
    }
    case 'currency': {
      const v = shape(value, TEMPLATE.currency, 'Currency');
      if (v.minor !== 100) refuse('INVALID', 'Amounts are kept to two decimal places; the minor unit must be 100.');
      if (!['indian', 'international'].includes(v.grouping)) refuse('INVALID', 'Digit grouping must be Indian or international.');
      if (!v.code || !v.symbol) refuse('INVALID', 'Currency code and symbol are required.');
      return v;
    }
    case 'period': {
      const v = shape(value, TEMPLATE.period, 'Evaluation period');
      if (!isInt(v.startYear) || v.startYear < 2000 || v.startYear > 2100 || !isInt(v.startMonth) || v.startMonth < 1 || v.startMonth > 12 || !isInt(v.months) || v.months < 1 || v.months > 36) refuse('INVALID', 'The evaluation period must start in a valid month and last 1–36 months.');
      return v;
    }
    case 'ranking': {
      const v = shape(value, TEMPLATE.ranking, 'Ranking');
      if (!['weighted', 'financial'].includes(v.mode)) refuse('INVALID', 'Ranking mode must be weighted or financial.');
      if (!['combined', 'incremental', 'operating'].includes(v.financialMetric)) refuse('INVALID', 'Financial metric is not valid.');
      for (const k of v.tieBreaks) if (!TIE_BREAKS[k]) refuse('INVALID', `Unknown tie-break rule “${k}”.`);
      if (new Set(v.tieBreaks).size !== v.tieBreaks.length) refuse('INVALID', 'A tie-break rule is listed twice.');
      for (const [k, w] of Object.entries(v.weights)) if (w < 0 || w > 100) refuse('INVALID', `Weight for ${k} must be 0–100%.`);
      if (!(v.budgetMaxOverspendPct > 0)) refuse('INVALID', 'The overspend at which budget discipline reaches zero must be above 0%.');
      return v;
    }
    case 'compliance': {
      const c = value || {};
      const ss = {};
      for (const k of Object.keys(TEMPLATE.compliance.statusScores)) {
        const v = c.statusScores?.[k];
        if (k === 'na') { ss.na = null; continue; }
        if (!isNum(v) || v < 0 || v > 100) refuse('INVALID', `Score for “${k}” must be 0–100.`);
        ss[k] = v;
      }
      if (!isNum(c.mandatoryWeight) || c.mandatoryWeight < 1 || c.mandatoryWeight > 10) refuse('INVALID', 'Weight of mandatory requirements must be 1–10.');
      if (!isNum(c.complianceShare) || !isNum(c.readinessShare) || c.complianceShare < 0 || c.readinessShare < 0 || c.complianceShare + c.readinessShare <= 0) refuse('INVALID', 'Compliance and readiness shares must be zero or more, not both zero.');
      const b = c.blocker || {};
      if (!isMoney(b.fixedPenalty)) refuse('INVALID', 'Blocker penalty must be an amount of zero or more.');
      if (!['flag', 'complianceZero', 'unranked'].includes(b.ranking)) refuse('INVALID', 'Blocker ranking consequence is not valid.');
      return { statusScores: ss, mandatoryWeight: c.mandatoryWeight, complianceShare: c.complianceShare, readinessShare: c.readinessShare, blocker: { fixedPenalty: b.fixedPenalty, ranking: b.ranking } };
    }
    default: return shape(value, TEMPLATE[section], section);
  }
}

// ---------------- records ----------------

export function moneyField(v, field) { if (!isMoney(v)) refuse('INVALID', `${field} must be an amount of zero or more.`); return v; }

export function deploymentFields(p, doc) {
  const out = {};
  const has = (k) => p[k] !== undefined;
  if (has('cityId')) { if (!(doc.cities || []).some((c) => c.id === p.cityId)) refuse('INVALID_REF', 'That destination city does not exist.'); out.cityId = p.cityId; }
  if (has('roleId')) { if (!(doc.config.roles || []).some((r) => r.id === p.roleId)) refuse('INVALID_REF', 'That job role does not exist.'); out.roleId = p.roleId; }
  if (has('assignmentTypeId')) {
    if (!(doc.config.assignmentTypes || []).some((t) => t.id === p.assignmentTypeId)) refuse('INVALID_REF', 'That assignment type does not exist.');
    if (!doc.config.deployment.allowedAssignmentTypes.includes(p.assignmentTypeId)) refuse('NOT_PERMITTED', 'That assignment type is not permitted by the event rules.');
    out.assignmentTypeId = p.assignmentTypeId;
  }
  if (has('salary')) {
    const s = p.salary || {};
    if (!isInt(s.amount) || s.amount < 0) refuse('INVALID', 'Annual salary must be an amount of zero or more.');
    if (!['base', 'local'].includes(s.currency)) refuse('INVALID', 'Salary currency must be the base currency or the destination’s local currency.');
    out.salary = { amount: s.amount, currency: s.currency };
  }
  if (has('contractMonths')) { if (!isInt(p.contractMonths) || p.contractMonths < 1 || p.contractMonths > 60) refuse('INVALID', 'Assignment duration must be 1–60 months.'); out.contractMonths = p.contractMonths; }
  if (has('startMonth')) { if (!parseYm(p.startMonth)) refuse('INVALID', 'Planned deployment month must be given as year and month.'); out.startMonth = p.startMonth; }
  if (has('timeShare')) { if (!isInt(p.timeShare) || p.timeShare < 1 || p.timeShare > 100) refuse('INVALID', 'Time share must be a whole number from 1 to 100.'); out.timeShare = p.timeShare; }
  if (has('relocationPackage')) { if (!PACKAGES[p.relocationPackage]) refuse('INVALID', 'Relocation package is not valid.'); out.relocationPackage = p.relocationPackage; }
  for (const k of ['trainingProvided', 'localPartner', 'officeArranged']) if (has(k)) { if (typeof p[k] !== 'boolean') refuse('INVALID', `${k} must be yes or no.`); out[k] = p[k]; }
  for (const [k, max] of [['responsibility', 300], ['businessUnit', 80], ['contribution', 400], ['permitsObtained', 300], ['notes', 1000]]) if (has(k)) out[k] = str(p[k], max, { field: k });
  return out;
}

export function ruleFields(p, doc, { creating = false } = {}) {
  const out = {};
  const has = (k) => p[k] !== undefined;
  if (creating || has('id')) { const id = str(p.id, 24, { required: true, field: 'Rule ID' }); if (!ID_RE.test(id)) refuse('INVALID', 'Rule ID may use letters, numbers and dashes only.'); out.id = id; }
  if (creating || has('title')) out.title = str(p.title, 120, { required: true, field: 'Rule title' });
  if (has('category')) { if (!RULE_CATEGORIES.includes(p.category)) refuse('INVALID', 'Rule category is not valid.'); out.category = p.category; } else if (creating) out.category = 'Employment documentation';
  if (has('description')) out.description = str(p.description, 1000, { field: 'Description' });
  const conts = new Set((doc.continents || []).map((c) => c.id)); const cities = new Set((doc.cities || []).map((c) => c.id));
  if (has('continentIds')) { out.continentIds = strList(p.continentIds, 10, 24, 'Continents'); for (const k of out.continentIds) if (!conts.has(k)) refuse('INVALID_REF', `Unknown continent “${k}”.`); }
  if (has('cityIds')) { out.cityIds = strList(p.cityIds, 30, 24, 'Cities'); for (const k of out.cityIds) if (!cities.has(k)) refuse('INVALID_REF', `Unknown city “${k}”.`); }
  if (has('appliesTo')) {
    const a = p.appliesTo || {};
    if (!['always', 'international', 'foreignToTeam'].includes(a.when || 'always')) refuse('INVALID', 'Applicability is not valid.');
    const roles = new Set((doc.config.roles || []).map((r) => r.id)); const types = new Set((doc.config.assignmentTypes || []).map((t) => t.id));
    out.appliesTo = {
      when: a.when || 'always',
      functions: strList(a.functions, 10, 24, 'Functions').map((f) => { if (!FUNCTIONS.includes(f)) refuse('INVALID', `Unknown function “${f}”.`); return f; }),
      seniority: strList(a.seniority, 4, 24, 'Seniority').map((f) => { if (!SENIORITY.includes(f)) refuse('INVALID', `Unknown seniority “${f}”.`); return f; }),
      assignmentTypes: strList(a.assignmentTypes, 12, 24, 'Assignment types').map((f) => { if (!types.has(f)) refuse('INVALID', `Unknown assignment type “${f}”.`); return f; }),
      roles: strList(a.roles, 30, 24, 'Roles').map((f) => { if (!roles.has(f)) refuse('INVALID', `Unknown role “${f}”.`); return f; }),
    };
  }
  for (const k of ['mandatory', 'blocks', 'satisfiableBefore', 'evidenceRequired', 'waivable', 'realLaw']) if (has(k)) { if (typeof p[k] !== 'boolean') refuse('INVALID', `${k} must be yes or no.`); out[k] = p[k]; }
  if (has('verifiedBy')) out.verifiedBy = str(p.verifiedBy, 200, { field: 'Verified by' });
  if (has('check')) {
    const c = p.check || {};
    if (!CHECK_KINDS[c.kind]) refuse('INVALID', 'Check type is not valid.');
    const o = { kind: c.kind };
    if (c.kind === 'minSalary') { if (!['market', 'expected', 'fixed'].includes(c.basis)) refuse('INVALID', 'Minimum salary basis is not valid.'); o.basis = c.basis; if (c.basis === 'fixed') o.amount = moneyField(c.amount, 'Minimum salary'); else { if (!isNum(c.pct) || c.pct <= 0 || c.pct > 300) refuse('INVALID', 'Minimum salary percentage must be 1–300.'); o.pct = c.pct; } }
    if (c.kind === 'maxContractMonths') { if (!isInt(c.months) || c.months < 1) refuse('INVALID', 'Maximum months must be a whole number.'); o.months = c.months; }
    if (c.kind === 'minExperience') { if (!isNum(c.years) || c.years < 0) refuse('INVALID', 'Minimum years must be zero or more.'); o.years = c.years; }
    if (c.kind === 'minCapability') { if (!CAP_KEYS.includes(c.key) || !isNum(c.min)) refuse('INVALID', 'Capability and minimum score are required.'); o.key = c.key; o.min = c.min; }
    if (c.kind === 'minSeniority') { if (!SENIORITY.includes(c.level)) refuse('INVALID', 'Seniority level is not valid.'); o.level = c.level; }
    if (c.kind === 'relocationPackage') { if (!PACKAGES[c.min]) refuse('INVALID', 'Minimum package is not valid.'); o.min = c.min; }
    if (c.kind === 'assignmentTypeBan') { o.types = strList(c.types, 12, 24, 'Banned types'); }
    out.check = o;
  }
  for (const k of ['cost', 'penalty']) if (has(k)) out[k] = moneyField(p[k], k);
  if (has('costType')) { if (!['oneTime', 'annual'].includes(p.costType)) refuse('INVALID', 'Cost type must be one-time or annual.'); out.costType = p.costType; }
  if (has('revenueImpactPct')) { if (!isNum(p.revenueImpactPct) || p.revenueImpactPct < 0 || p.revenueImpactPct > 100) refuse('INVALID', 'Revenue impact must be 0–100%.'); out.revenueImpactPct = p.revenueImpactPct; }
  if (has('scorePenalty')) { if (!isNum(p.scorePenalty) || p.scorePenalty < 0 || p.scorePenalty > 100) refuse('INVALID', 'Score penalty must be 0–100 points.'); out.scorePenalty = p.scorePenalty; }
  return out;
}

export function continentFields(p) {
  const out = {};
  if (p.name !== undefined) out.name = str(p.name, 60, { required: true, field: 'Continent name' });
  if (p.description !== undefined) out.description = str(p.description, 600, { field: 'Description' });
  if (p.languages !== undefined) out.languages = strList(p.languages, 8, 40, 'Languages');
  if (p.currency !== undefined) {
    const c = p.currency || {};
    if (!(isNum(c.rateToBase) && c.rateToBase > 0)) refuse('INVALID', 'Conversion rate must be above zero.');
    out.currency = { code: str(c.code, 8, { required: true, field: 'Currency code' }), name: str(c.name, 60, { field: 'Currency name' }), rateToBase: c.rateToBase };
  }
  if (p.attrs !== undefined) {
    const a = {};
    for (const d of ATTRS) {
      const v = p.attrs?.[d.key];
      if (!isNum(v)) refuse('INVALID', `${d.label} must be a number.`);
      if (d.kind === 'score' && (v < 0 || v > 100)) refuse('INVALID', `${d.label} must be 0–100.`);
      if (d.kind === 'mult' && (v < (d.min ?? 0.1) || v > (d.max ?? 10))) refuse('INVALID', `${d.label} must be ${d.min}–${d.max}.`);
      if (d.kind === 'rate' && (v < (d.min ?? -100) || v > (d.max ?? 100))) refuse('INVALID', `${d.label} must be ${d.min}–${d.max}.`);
      if (d.kind === 'money' && !isMoney(v)) refuse('INVALID', `${d.label} must be an amount of zero or more.`);
      a[d.key] = v;
    }
    out.attrs = a;
  }
  Object.assign(out, regionExtras(p));
  if (p.requirements !== undefined) out.requirements = Object.fromEntries(['employment', 'protection', 'permits', 'qualifications'].map((k) => [k, str(p.requirements?.[k], 600, { field: k })]));
  return out;
}

export function cityFields(p, doc) {
  const out = {};
  if (p.name !== undefined) out.name = str(p.name, 60, { required: true, field: 'City name' });
  if (p.description !== undefined) out.description = str(p.description, 600, { field: 'Description' });
  if (p.continentId !== undefined) { if (!(doc.continents || []).some((c) => c.id === p.continentId)) refuse('INVALID_REF', 'That continent does not exist.'); out.continentId = p.continentId; }
  if (p.adj !== undefined) {
    const a = {};
    for (const d of ATTRS.filter((x) => !x.continentOnly)) {
      const v = p.adj?.[d.key];
      if (v === undefined || v === null || v === 0) continue;
      if (!isNum(v) || Math.abs(v) > 200) refuse('INVALID', `${d.label} adjustment must be a number between −200 and 200.`);
      a[d.key] = v;
    }
    out.adj = a;
  }
  for (const k of ['baseRevenueOpportunity', 'setupCost', 'officeCostAnnual']) if (p[k] !== undefined) out[k] = moneyField(p[k], k);
  Object.assign(out, regionExtras(p));
  return out;
}

function regionExtras(p) {
  const out = {};
  if (p.functionBonus !== undefined) {
    const fb = {};
    for (const [k, v] of Object.entries(p.functionBonus || {})) { if (!FUNCTIONS.includes(k)) refuse('INVALID', `Unknown function “${k}”.`); if (!isNum(v) || Math.abs(v) > 50) refuse('INVALID', 'Role bonus must be −50 to 50%.'); if (v) fb[k] = v; }
    out.functionBonus = fb;
  }
  if (p.special !== undefined) {
    const s = p.special || {};
    for (const k of ['revenuePct', 'costPct']) if (!isNum(s[k]) || Math.abs(s[k]) > 100) refuse('INVALID', 'Special modifiers must be −100 to 100%.');
    out.special = { revenuePct: s.revenuePct, costPct: s.costPct, label: str(s.label, 160, { field: 'Special modifier label' }), active: s.active !== false };
  }
  for (const k of ['benefits', 'disadvantages']) if (p[k] !== undefined) {
    if (!Array.isArray(p[k]) || p[k].length > 12) refuse('INVALID', `${k} must be a list of at most 12 items.`);
    out[k] = p[k].map((b) => ({ label: str(b?.label, 120, { required: true, field: 'Label' }), effect: str(b?.effect, 200, { field: 'Effect' }) }));
  }
  return out;
}

export function employeeFields(p) {
  const out = {};
  const s = (k, max, req = false) => { if (p[k] !== undefined) out[k] = str(p[k], max, { required: req, field: k }); };
  s('name', 80, true); s('nationality', 60); s('headline', 120); s('category', 80); s('leadershipExperience', 300);
  if (p.age !== undefined) { if (p.age !== null && (!isInt(p.age) || p.age < 16 || p.age > 90)) refuse('INVALID', 'Age must be 16–90 or empty.'); out.age = p.age; }
  if (p.origin !== undefined) out.origin = str(p.origin, 24, { required: true, field: 'Origin continent' });
  if (p.seniority !== undefined) { if (!SENIORITY.includes(p.seniority)) refuse('INVALID', 'Seniority is not valid.'); out.seniority = p.seniority; }
  if (p.primaryFunction !== undefined) { if (!FUNCTIONS.includes(p.primaryFunction)) refuse('INVALID', 'Primary function is not valid.'); out.primaryFunction = p.primaryFunction; }
  if (p.yearsExperience !== undefined) { if (!isNum(p.yearsExperience) || p.yearsExperience < 0 || p.yearsExperience > 60) refuse('INVALID', 'Years of experience must be 0–60.'); out.yearsExperience = p.yearsExperience; }
  for (const k of ['education', 'certifications', 'previousIndustries', 'languages']) if (p[k] !== undefined) out[k] = strList(p[k], 10, 160, k);
  if (p.internationalAssignments !== undefined) {
    if (!Array.isArray(p.internationalAssignments) || p.internationalAssignments.length > 10) refuse('INVALID', 'International assignments must be a list of at most 10.');
    out.internationalAssignments = p.internationalAssignments.map((a) => ({ place: str(a?.place, 120, { required: true, field: 'Place' }), years: isNum(a?.years) ? a.years : 0, role: str(a?.role, 120, { field: 'Role' }) }));
  }
  for (const g of ['technical', 'soft']) if (p[g] !== undefined) {
    const keys = g === 'technical' ? ['finance', 'sales', 'hr', 'ihrm', 'legal', 'operations', 'supplyChain', 'bizDev', 'data', 'strategy'] : ['culturalAdaptability', 'leadership', 'communication', 'problemSolving', 'negotiation', 'decisionMaking', 'teamwork', 'pressure'];
    const o = {};
    for (const k of keys) { const v = p[g]?.[k]; if (!isInt(v) || v < 1 || v > 100) refuse('INVALID', `${k} must be a whole number from 1 to 100.`); o[k] = v; }
    out[g] = o;
  }
  if (p.employment !== undefined) {
    const e = p.employment || {};
    const o = {};
    for (const k of ['expectedSalary', 'minSalary', 'hiringCost', 'onboardingCost', 'relocationBase', 'trainingCost']) o[k] = moneyField(e[k], k);
    for (const k of ['onboardingMonths', 'rampUpMonths', 'contractMonths']) { if (!isInt(e[k]) || e[k] < 0 || e[k] > 60) refuse('INVALID', `${k} must be 0–60 months.`); o[k] = e[k]; }
    if (o.contractMonths < 1) refuse('INVALID', 'Contract duration must be at least one month.');
    if (o.minSalary > o.expectedSalary) refuse('INVALID', 'The minimum acceptable salary cannot be above the expected salary.');
    if (typeof e.trainingRequired !== 'boolean') refuse('INVALID', 'Training requirement must be yes or no.');
    o.trainingRequired = e.trainingRequired;
    if (!PACKAGES[e.relocationNeeds]) refuse('INVALID', 'Relocation needs are not valid.');
    o.relocationNeeds = e.relocationNeeds;
    o.relocationText = str(e.relocationText, 300, { field: 'Relocation requirements' });
    o.trainingText = str(e.trainingText, 300, { field: 'Training requirements' });
    o.restrictions = strList(e.restrictions, 8, 200, 'Restrictions');
    out.employment = o;
  }
  if (p.strategic !== undefined) {
    const t = p.strategic || {};
    const risk = t.risk || { kind: 'none' };
    if (!['none', 'maxAbroadMonths', 'visaHistory', 'familyCommitment'].includes(risk.kind)) refuse('INVALID', 'Risk factor type is not valid.');
    const r = { kind: risk.kind, text: str(risk.text, 300, { field: 'Risk description' }) };
    if (risk.kind === 'maxAbroadMonths') { if (!isInt(risk.months) || risk.months < 1) refuse('INVALID', 'Maximum months abroad must be a whole number.'); r.months = risk.months; }
    if (risk.kind === 'visaHistory') r.continentId = str(risk.continentId, 24, { required: true, field: 'Continent' });
    const compat = {};
    for (const [k, v] of Object.entries(t.regionalCompatibility || {})) { if (!isNum(v) || Math.abs(v) > 30) refuse('INVALID', 'Regional compatibility must be −30 to 30 points.'); if (v) compat[k] = v; }
    if (!isInt(t.intlSuitability) || t.intlSuitability < 1 || t.intlSuitability > 100) refuse('INVALID', 'International suitability must be 1–100.');
    out.strategic = {
      strengths: strList(t.strengths, 8, 200, 'Strengths'), limitations: strList(t.limitations, 8, 200, 'Limitations'),
      bestFit: strList(t.bestFit, 8, 40, 'Best-fit roles'), environments: str(t.environments, 400, { field: 'Suitable environments' }),
      intlSuitability: t.intlSuitability, regionalCompatibility: compat, risk: r,
    };
  }
  return out;
}

export const COMPLIANCE_STATUSES = MANUAL_STATUSES;
