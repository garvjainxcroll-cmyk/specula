// What each person is sent. A Super Administrator sees everything. Operators and
// read-only officers see everything except regional information the Super Administrator
// has hidden from them: those values are removed on the server, before anything leaves it.

import { ATTRS } from '../src/engine/model.mjs';
import { OPPORTUNITY_FACTORS } from '../src/engine/regions.mjs';
import { permsOf, publicUser } from './auth.mjs';

const ATTR_GROUP = Object.fromEntries(ATTRS.map((a) => [a.key, a.group]));
ATTR_GROUP.housingAllowanceAnnual = 'costs';
const MONEY_GROUP = { baseRevenueOpportunity: 'revenue', setupCost: 'costs', officeCostAnnual: 'costs' };
const FACTOR_GROUP = { marketDemand: 'demand', growth: 'demand', infrastructure: 'conditions', talent: 'conditions', opportunity: 'demand', operatingCost: 'costs', competition: 'demand', legalComplexity: 'conditions', relocationCost: 'costs', risk: 'conditions' };
const DRIVER_GROUP = { growthScore: 'demand', competitionInverse: 'demand', marketDemand: 'demand', purchasingPower: 'demand', infrastructure: 'conditions', logistics: 'conditions', talentAvailability: 'conditions', competition: 'demand', opportunityScore: 'demand', culturalDifficulty: 'conditions', legalComplexity: 'conditions', riskScore: 'conditions' };
export const HIDDEN = '•••';

/** Which groups are hidden for this audience: 'operators' or 'reports'. */
export function hiddenGroups(cfg, audience) {
  const v = cfg.visibility || {};
  return new Set(Object.entries(v[audience] || {}).filter(([, shown]) => shown === false).map(([g]) => g));
}
const ALL_GROUPS = ['demand', 'costs', 'tax', 'conditions', 'revenue', 'bonuses'];

/** Remove hidden regional values from a session document and its results (in place). */
export function redact(doc, results, cfg, audience = 'operators') {
  const hidden = hiddenGroups(cfg, audience);
  const regions = new Set(cfg.visibility?.hiddenRegions || []);
  if (!hidden.size && !regions.size) return { redacted: false };
  const cityCont = Object.fromEntries((doc.cities || []).map((c) => [c.id, c.continentId]));
  const groupsFor = (contId, cityId) => (regions.has(contId) || regions.has(cityId) ? new Set(ALL_GROUPS) : hidden);
  const strip = (obj, keyGroup, g) => { if (!obj) return; for (const k of Object.keys(obj)) if (g.has(keyGroup[k])) obj[k] = null; };
  for (const c of doc.continents || []) {
    const g = groupsFor(c.id, null);
    if (!g.size) continue;
    strip(c.attrs, ATTR_GROUP, g);
    if (g.has('bonuses')) { c.functionBonus = null; c.special = null; }
    for (const b of [...(c.benefits || []), ...(c.disadvantages || [])]) b.effect = HIDDEN;
    c.redacted = [...g];
  }
  for (const c of doc.cities || []) {
    const g = groupsFor(c.continentId, c.id);
    if (!g.size) continue;
    strip(c.adj, ATTR_GROUP, g);
    for (const [k, grp] of Object.entries(MONEY_GROUP)) if (g.has(grp)) c[k] = null;
    if (g.has('bonuses')) { c.functionBonus = null; c.special = null; }
    for (const b of [...(c.benefits || []), ...(c.disadvantages || [])]) b.effect = HIDDEN;
    c.redacted = [...g];
  }
  if (results) {
    for (const [id, r] of Object.entries(results.regions || {})) {
      const g = groupsFor(r.continentId, id);
      if (!g.size) continue;
      strip(r.attrs, ATTR_GROUP, g);
      for (const k of Object.keys(r.terms || {})) if (g.has(ATTR_GROUP[k])) r.terms[k] = null;
      for (const f of r.opportunity?.factors || []) if (g.has(FACTOR_GROUP[f.key])) { f.raw = null; f.goodness = null; f.share = null; }
      if (g.has('demand')) r.market = null;
      for (const [k, grp] of Object.entries(MONEY_GROUP)) if (g.has(grp)) r[k] = null;
      if (g.has('bonuses')) { r.functionBonus = null; r.specialRevenue = null; r.specialCost = null; r.specialLabels = []; }
      r.redacted = [...g];
    }
    for (const d of Object.values(results.deployments || {})) {
      if (!d.valid) continue;
      const g = groupsFor(d.continentId || cityCont[d.cityId], d.cityId);
      if (!g.size) continue;
      for (const tr of Object.values(d.traces || {})) for (const t of tr.terms || []) if (t.group && g.has(t.group)) { t.value = null; t.source = 'Confidential: hidden by the Super Administrator'; }
      for (const f of d.opportunity?.factors || []) if (g.has(FACTOR_GROUP[f.key])) { f.raw = null; f.goodness = null; f.share = null; }
      for (const t of d.productivity?.relTerms || []) if (g.has(DRIVER_GROUP[t.key])) t.value = null;
      if (g.has('demand')) d.market = null;
      if (g.has('conditions')) { d.riskDiscount = null; d.riskFactor = null; d.productivity.envIndex = null; d.productivity.culture.difficulty = null; }
      if (g.has('bonuses')) { d.specialRevenue = null; d.specialCost = null; d.productivity.fnPct = null; }
      d.redacted = [...g];
    }
  }
  return { redacted: true, groups: [...hidden], regions: [...regions] };
}

/** Audit entries for people who may not see hidden regional values. */
export function redactAudit(entries, cfg) {
  const hidden = hiddenGroups(cfg, 'operators');
  if (!hidden.size && !(cfg.visibility?.hiddenRegions || []).length) return entries;
  return entries.map((e) => (['continent', 'city'].includes(e.target?.kind) || (e.target?.kind === 'config' && e.target.id === 'visibility')
    ? { ...e, changes: (e.changes || []).map((c) => ({ path: c.path, before: HIDDEN, after: HIDDEN })), revert: e.revert ? { kind: e.revert.kind } : null }
    : { ...e, revert: e.revert ? { kind: e.revert.kind } : null }));
}

export function sessionMeta(doc) {
  return {
    id: doc.id, name: doc.name, mode: doc.mode, rev: doc.rev, createdAt: doc.createdAt, createdBy: doc.createdBy, updatedAt: doc.updatedAt || null, updatedBy: doc.updatedBy || null,
    round1: doc.round1.status, round2: doc.round2.status, sourceSessionId: doc.sourceSessionId || null, sampleData: !!doc.sampleData, notice: doc.notice || '',
  };
}

/** The session as sent to the console: no audit log, finals without their input copies. */
export function sessionView(doc, user, results) {
  const d = structuredClone({ ...doc, audit: undefined });
  d.finals = (doc.finals || []).map(({ inputs, ...f }) => structuredClone(f));
  const r = structuredClone(results);
  let redaction = { redacted: false };
  if (user.role !== 'super') redaction = redact(d, r, doc.config, 'operators');
  const draft = doc.calc?.draft || null;
  const tail = (doc.audit || []).slice(-12).reverse();
  return {
    ok: true,
    session: sessionMeta(doc),
    doc: d,
    results: r,
    calc: { draft: draft ? { at: draft.at, by: draft.by, inputHash: draft.inputHash, modelVersion: draft.modelVersion } : null, current: !!draft && draft.inputHash === results.inputHash },
    auditTail: user.role === 'super' ? tail : redactAudit(tail, doc.config),
    redaction,
    me: { user: publicUser(user), perms: permsOf(user) },
    factorLabels: Object.fromEntries(Object.entries(OPPORTUNITY_FACTORS).map(([k, v]) => [k, v.label])),
  };
}
