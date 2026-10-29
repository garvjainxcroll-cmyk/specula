// Every change to a session is one of these actions. The dispatcher checks permission,
// runs the action against a copy of the session, and records an audit entry (who, when,
// what, the previous and new values, the reason). A refused action changes nothing.
//
// Round-state rules enforced here:
//  - Round 1 records change only while Round 1 is open; once it is locked, only a Super
//    Administrator can correct an outcome, with a reason (kept beside the locked original).
//  - Round 2 records change only after Round 1 is locked and before Round 2 is finalised.
//  - Configuration changes during a live round are scenario changes: Super Administrator
//    only, with a reason. Formula settings cannot change while the formulas are locked.

import { buildContext } from '../src/engine/context.mjs';
import { checkSale } from '../src/engine/round1.mjs';
import { evaluateDeployment } from '../src/engine/round2.mjs';
import { ruleApplies } from '../src/engine/compliance.mjs';
import { computeAll } from '../src/engine/index.mjs';
import { configIssues } from '../src/engine/validate.mjs';
import { stableStringify, fingerprint } from '../src/engine/hash.mjs';
import { monthIndex } from '../src/engine/months.mjs';
import { CHECKS, MANUAL_STATUSES } from '../src/engine/model.mjs';
import { PRACTICE_AUCTION, PRACTICE_DEPLOYMENTS, practiceComplianceFor } from '../src/data/practice.mjs';
import { can } from './auth.mjs';
import {
  Refusal, refuse, need, str, reasonOf, isMoney, checkSection, FORMULA_SECTIONS, deploymentFields, ruleFields,
  continentFields, cityFields, employeeFields, moneyField, ID_RE,
} from './validators.mjs';
import { summarise, snapshotInputs, officialCompute, resultsFingerprint } from './results.mjs';

export { Refusal };
const clone = (x) => (x === undefined ? undefined : structuredClone(x));
const same = (a, b) => stableStringify(a, new Set(['rev'])) === stableStringify(b, new Set(['rev']));

export function diff(before, after, path = '', out = []) {
  if (out.length >= 80) return out;
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (isObj(before) && isObj(after)) {
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) { if (k === 'rev') continue; diff(before[k], after[k], path ? `${path}.${k}` : k, out); }
    return out;
  }
  if (JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)) out.push({ path, before: before ?? null, after: after ?? null });
  return out;
}

export const r1Locked = (doc) => doc.round1.status === 'locked';
export const r2Final = (doc) => doc.round2.status === 'finalised';
export const auctionStarted = (doc) => doc.auction.records.some((r) => r.status !== 'available');
export const isLive = (doc) => auctionStarted(doc) || r1Locked(doc);

const COLLECTIONS = { deployments: 'deployments', teams: 'teams', continents: 'continents', cities: 'cities', employees: 'employees', rules: 'rules', revenueModels: 'revenueModels' };
const findIn = (doc, coll, id) => (doc[coll] || []).find((x) => x.id === id);
const rec = (doc, employeeId) => {
  const r = doc.auction.records.find((x) => x.employeeId === employeeId);
  need(r, 'NOT_FOUND', `There is no CV “${employeeId}”.`);
  return r;
};
const teamOf = (doc, id) => { const t = doc.teams.find((x) => x.id === id); need(t, 'NOT_FOUND', 'Choose a valid team.'); return t; };
const empName = (doc, id) => { const e = doc.employees.find((x) => x.id === id); return e ? `${e.id} ${e.name}` : id; };
const expectRev = (obj, p) => { if (p.expectRev !== undefined && p.expectRev !== (obj.rev || 0)) refuse('STALE', 'Someone else changed this record a moment ago. The screen has been refreshed; check it and try again.'); };
const bump = (obj) => { obj.rev = (obj.rev || 0) + 1; };

function configGuard(x, { formula = false } = {}) {
  const { doc, user, p } = x;
  need(!r2Final(doc), 'ROUND2_FINAL', 'Round 2 results are finalised. A Super Administrator must reopen Round 2 before the configuration can change.');
  if (formula) {
    need(can(user, 'formulas.edit'), 'FORBIDDEN', 'You do not have permission to change formula or scoring settings.', null);
    need(!doc.config.formulasLocked, 'FORMULAS_LOCKED', 'The financial formulas and scoring framework are locked. A Super Administrator must unlock them first.');
  }
  if (isLive(doc)) {
    need(user.role === 'super', 'LIVE_ROUND', 'The round is live: only a Super Administrator may authorise a scenario change.');
    x.reason = reasonOf(p.reason, 'A reason for this scenario change');
    x.kind = 'scenario-change';
  }
}
function r1Guard(doc) {
  need(!r1Locked(doc), 'ROUND1_LOCKED', 'Round 1 is locked. A Super Administrator can correct a result with a logged reason.');
}
function r2Guard(doc) {
  need(r1Locked(doc), 'ROUND1_OPEN', 'Round 1 must be locked before Round 2 deployments are recorded.');
  need(!r2Final(doc), 'ROUND2_FINAL', 'Round 2 is finalised. A Super Administrator must reopen it before any change.');
}
function noNewConfigBlockers(before, after) {
  const key = (i) => `${i.code}|${i.message}`;
  const was = new Set(configIssuesOf(before).filter((i) => i.severity === 'blocking').map(key));
  const now = configIssuesOf(after).filter((i) => i.severity === 'blocking' && !was.has(key(i)));
  if (now.length) refuse('INVALID_CONFIG', `This change would make the configuration invalid: ${now.map((i) => i.message).join(' ')}`, now);
}
function configIssuesOf(doc) { return configIssues(buildContext(doc)); }

function recordRevert(coll, id, before, after) { return { kind: 'record', coll, id, before: clone(before), after: clone(after) }; }

// ---------------- the handlers ----------------

const H = {};

// ----- configuration -----
H['config.section'] = { perm: 'config.edit', run(x) {
  const { doc, p } = x;
  const section = p.section;
  const formula = FORMULA_SECTIONS.includes(section);
  if (section === 'validationSeverity') need(can(x.user, 'severity.set'), 'FORBIDDEN', 'Only a Super Administrator may change which checks block finalisation.');
  if (section === 'visibility') need(can(x.user, 'visibility.set'), 'FORBIDDEN', 'Only a Super Administrator may control what operators and reports can see.');
  if (section === 'currency') need(!auctionStarted(doc), 'LIVE_ROUND', 'The currency cannot change once the auction has started (amounts are relabelled, not converted).');
  configGuard(x, { formula });
  if (p.expectRev !== undefined) need(p.expectRev === (doc.configRev || 0), 'STALE', 'Someone else changed the configuration a moment ago. The screen has been refreshed; check it and try again.');
  const value = checkSection(section, p.value, doc);
  const before = clone(doc.config[section]);
  const prev = clone(doc);
  doc.config[section] = value;
  if (section === 'deployment' || section === 'auction') {
    // the new rules may not leave the recorded data impossible
    if (section === 'auction') {
      const counts = {}; for (const r of doc.auction.records) if (r.status === 'sold') counts[r.winningTeamId] = (counts[r.winningTeamId] || 0) + 1;
      const over = Object.entries(counts).find(([, n]) => n > value.teamSize);
      need(!over, 'INVALID', `Team ${over?.[0]} already has ${over?.[1]} employees, more than a team size of ${value.teamSize}.`);
    }
  }
  noNewConfigBlockers(prev, doc);
  doc.configRev = (doc.configRev || 0) + 1;
  return { summary: `Changed ${section} settings`, target: { kind: 'config', id: section }, changes: diff(before, value, section), revert: { kind: 'config', section, before, after: clone(value) } };
} };

H['config.formulasLock'] = { perm: 'formulas.lock', run(x) {
  const { doc, p } = x;
  const locked = !!p.locked;
  need(doc.config.formulasLocked !== locked, 'NO_CHANGE', locked ? 'The formulas are already locked.' : 'The formulas are already unlocked.');
  if (!locked) x.reason = reasonOf(p.reason, 'A reason for unlocking the formulas');
  doc.config.formulasLocked = locked;
  doc.configRev = (doc.configRev || 0) + 1;
  return { summary: locked ? 'Locked the financial formulas and scoring framework' : 'Unlocked the financial formulas and scoring framework', target: { kind: 'config', id: 'formulasLocked' }, changes: [{ path: 'formulasLocked', before: !locked, after: locked }] };
} };

H['standardProfile.update'] = { perm: 'config.edit', run(x) {
  const { doc, p } = x;
  configGuard(x);
  const before = clone(doc.standardProfile);
  const next = { ...before, ...profileFields(p.patch || {}, doc) };
  const prev = clone(doc);
  doc.standardProfile = next;
  noNewConfigBlockers(prev, doc);
  return { summary: 'Changed the standard business profile', target: { kind: 'standardProfile', id: 'standard' }, changes: diff(before, next), revert: { kind: 'standardProfile', before, after: clone(next) } };
} };

function profileFields(p, doc) {
  const out = {};
  for (const [k, max] of [['companyName', 80], ['industry', 120], ['businessModel', 600], ['capacity', 200], ['workforce', 300], ['infrastructure', 300], ['targetMarkets', 300], ['objectives', 400], ['restrictions', 400], ['requirements', 400], ['modifiers', 400]]) if (p[k] !== undefined) out[k] = str(p[k], max, { field: k });
  for (const k of ['startingCash', 'acquisitionBudget', 'expansionBudget', 'baselineRevenue', 'baselineOpex']) if (p[k] !== undefined) out[k] = moneyField(p[k], k);
  if (p.revenueModelId !== undefined) { need((doc.revenueModels || []).some((m) => m.id === p.revenueModelId), 'INVALID_REF', 'That revenue model does not exist.'); out.revenueModelId = p.revenueModelId; }
  if (p.hqCityId !== undefined) { need(doc.cities.some((c) => c.id === p.hqCityId), 'INVALID_REF', 'That headquarters city does not exist.'); out.hqCityId = p.hqCityId; }
  if (p.existingPresence !== undefined) {
    need(Array.isArray(p.existingPresence) && p.existingPresence.length <= 20, 'INVALID', 'Existing presence must be a list of cities.');
    for (const c of p.existingPresence) need(doc.cities.some((y) => y.id === c), 'INVALID_REF', `Unknown city “${c}”.`);
    out.existingPresence = [...new Set(p.existingPresence)];
  }
  return out;
}

H['team.update'] = { perm: 'config.edit', run(x) {
  const { doc, p } = x;
  const t = teamOf(doc, p.teamId);
  expectRev(t, p);
  const patch = p.patch || {};
  const material = patch.homeContinentId !== undefined || (patch.profile && Object.keys(patch.profile).some((k) => k !== 'companyName'));
  if (material) configGuard(x); else need(!r2Final(doc), 'ROUND2_FINAL', 'Round 2 is finalised.');
  const before = clone(t);
  if (patch.label !== undefined) t.label = str(patch.label, 40, { required: true, field: 'Team label' });
  if (patch.homeContinentId !== undefined) { need(doc.continents.some((c) => c.id === patch.homeContinentId), 'INVALID_REF', 'That continent does not exist.'); t.homeContinentId = patch.homeContinentId; }
  if (patch.profile) t.profile = { ...t.profile, ...profileFields(patch.profile, doc) };
  const prev = clone(doc); prev.teams = prev.teams.map((y) => (y.id === t.id ? before : y));
  noNewConfigBlockers(prev, doc);
  bump(t);
  return { summary: `Updated ${t.label}`, target: { kind: 'team', id: t.id }, changes: diff(before, t), revert: recordRevert('teams', t.id, before, t) };
} };

H['revenueModel.update'] = { perm: 'formulas.edit', run(x) {
  const { doc, p } = x;
  configGuard(x, { formula: true });
  const m = (doc.revenueModels || []).find((y) => y.id === p.id);
  need(m, 'NOT_FOUND', 'That revenue model does not exist.');
  const before = clone(m);
  const patch = p.patch || {};
  if (patch.name !== undefined) m.name = str(patch.name, 80, { required: true, field: 'Model name' });
  if (patch.description !== undefined) m.description = str(patch.description, 400, { field: 'Description' });
  if (patch.factors !== undefined) {
    const f = {};
    for (const k of ['sales', 'contracts', 'service']) { const v = patch.factors[k]; need(typeof v === 'number' && v >= 0 && v <= 3, 'INVALID', `Factor for ${k} must be 0–3.`); f[k] = v; }
    m.factors = f;
  }
  if (patch.marketingPctOfRevenue !== undefined) { need(typeof patch.marketingPctOfRevenue === 'number' && patch.marketingPctOfRevenue >= 0 && patch.marketingPctOfRevenue <= 50, 'INVALID', 'Marketing share must be 0–50%.'); m.marketingPctOfRevenue = patch.marketingPctOfRevenue; }
  bump(m);
  return { summary: `Updated revenue model “${m.name}”`, target: { kind: 'revenueModel', id: m.id }, changes: diff(before, m), revert: recordRevert('revenueModels', m.id, before, m) };
} };

H['continent.update'] = { perm: 'config.edit', run(x) {
  const { doc, p } = x;
  configGuard(x);
  const c = findIn(doc, 'continents', p.id);
  need(c, 'NOT_FOUND', 'That continent does not exist.');
  expectRev(c, p);
  const before = clone(c);
  Object.assign(c, continentFields(p.patch || {}));
  const prev = clone(doc); prev.continents = prev.continents.map((y) => (y.id === c.id ? before : y));
  noNewConfigBlockers(prev, doc);
  bump(c);
  return { summary: `Updated continent ${c.name}`, target: { kind: 'continent', id: c.id }, changes: diff(before, c), revert: recordRevert('continents', c.id, before, c) };
} };

H['city.update'] = { perm: 'config.edit', run(x) {
  const { doc, p } = x;
  configGuard(x);
  const c = findIn(doc, 'cities', p.id);
  need(c, 'NOT_FOUND', 'That city does not exist.');
  expectRev(c, p);
  const before = clone(c);
  const f = cityFields(p.patch || {}, doc);
  if (f.continentId && f.continentId !== c.continentId) {
    need(!doc.deployments.some((d) => d.cityId === c.id), 'IN_USE', `${c.name} has deployments and cannot move to another continent.`);
    need(!doc.teams.some((t) => t.profile?.hqCityId === c.id), 'IN_USE', `${c.name} is a team headquarters and cannot move to another continent.`);
  }
  Object.assign(c, f);
  const prev = clone(doc); prev.cities = prev.cities.map((y) => (y.id === c.id ? before : y));
  noNewConfigBlockers(prev, doc);
  bump(c);
  return { summary: `Updated city ${c.name}`, target: { kind: 'city', id: c.id }, changes: diff(before, c), revert: recordRevert('cities', c.id, before, c) };
} };

H['employee.update'] = { perm: 'config.edit', run(x) {
  const { doc, p } = x;
  const e = findIn(doc, 'employees', p.id);
  need(e, 'NOT_FOUND', 'That CV does not exist.');
  expectRev(e, p);
  if (r1Locked(doc)) {
    need(x.user.role === 'super', 'ROUND1_LOCKED', 'Round 1 is locked: only a Super Administrator may correct a CV, with a reason.');
    x.reason = reasonOf(p.reason, 'A reason for correcting this CV');
    x.kind = 'correction';
    need(!r2Final(doc), 'ROUND2_FINAL', 'Round 2 is finalised. Reopen it before correcting a CV.');
  } else if (auctionStarted(doc)) {
    configGuard(x);
  }
  const before = clone(e);
  const f = employeeFields(p.patch || {});
  if (f.origin) need(doc.continents.some((c) => c.id === f.origin), 'INVALID_REF', 'Origin continent does not exist.');
  Object.assign(e, f);
  if (p.patch?.startingBid !== undefined) {
    const r = rec(doc, e.id);
    need(r.status === 'available', 'AUCTION_STARTED', 'The starting bid cannot change once this CV has been auctioned.');
    r.startingBid = moneyField(p.patch.startingBid, 'Starting bid'); e.startingBid = r.startingBid; bump(r);
  }
  const prev = clone(doc); prev.employees = prev.employees.map((y) => (y.id === e.id ? before : y));
  noNewConfigBlockers(prev, doc);
  bump(e);
  return { summary: `Updated CV ${e.id} ${e.name}`, target: { kind: 'employee', id: e.id }, changes: diff(before, e), revert: r1Locked(doc) ? null : recordRevert('employees', e.id, before, e) };
} };

// ----- compliance rules -----
H['rule.create'] = { perm: 'config.edit', run(x) {
  const { doc, p } = x;
  configGuard(x);
  const f = ruleFields(p.rule || {}, doc, { creating: true });
  need(!doc.rules.some((r) => r.id === f.id), 'DUPLICATE', `Rule ID ${f.id} is already used.`);
  const rule = {
    id: f.id, title: f.title, category: f.category, description: f.description || '', continentIds: f.continentIds || [], cityIds: f.cityIds || [],
    appliesTo: f.appliesTo || { when: 'always', functions: [], seniority: [], assignmentTypes: [], roles: [] },
    mandatory: f.mandatory ?? true, blocks: f.blocks ?? false, satisfiableBefore: f.satisfiableBefore ?? true, evidenceRequired: f.evidenceRequired ?? false,
    check: f.check || { kind: 'status' }, cost: f.cost || 0, costType: f.costType || 'oneTime', penalty: f.penalty || 0, revenueImpactPct: f.revenueImpactPct || 0, scorePenalty: f.scorePenalty || 0,
    waivable: f.waivable ?? false, realLaw: f.realLaw ?? false, verifiedBy: f.verifiedBy || '', approved: false, rev: 0,
  };
  doc.rules.push(rule);
  return { summary: `Added draft rule ${rule.id} ${rule.title}`, target: { kind: 'rule', id: rule.id }, changes: diff(null, rule), revert: recordRevert('rules', rule.id, null, rule) };
} };

H['rule.update'] = { perm: 'config.edit', run(x) {
  const { doc, p } = x;
  configGuard(x);
  const r = findIn(doc, 'rules', p.id);
  need(r, 'NOT_FOUND', 'That rule does not exist.');
  expectRev(r, p);
  const before = clone(r);
  const f = ruleFields(p.patch || {}, doc);
  delete f.id;
  Object.assign(r, f);
  const material = diff(before, r).some((c) => !['description', 'title', 'verifiedBy'].includes(c.path));
  if (material && r.approved) r.approved = false;
  bump(r);
  return { summary: `Updated rule ${r.id}${material && before.approved ? ' (back to draft: it must be approved again)' : ''}`, target: { kind: 'rule', id: r.id }, changes: diff(before, r), revert: recordRevert('rules', r.id, before, r) };
} };

H['rule.delete'] = { perm: 'config.edit', run(x) {
  const { doc, p } = x;
  configGuard(x);
  const r = findIn(doc, 'rules', p.id);
  need(r, 'NOT_FOUND', 'That rule does not exist.');
  need(!Object.values(doc.compliance || {}).some((m) => m[r.id]), 'IN_USE', `Compliance records exist for ${r.id}; mark it as a draft instead of deleting it.`);
  doc.rules = doc.rules.filter((y) => y.id !== r.id);
  return { summary: `Deleted rule ${r.id}`, target: { kind: 'rule', id: r.id }, changes: diff(r, null), revert: recordRevert('rules', r.id, r, null) };
} };

H['rule.approve'] = { perm: 'rules.approve', run(x) {
  const { doc, p } = x;
  configGuard(x);
  const ids = p.all ? doc.rules.filter((r) => !r.approved).map((r) => r.id) : [p.id];
  need(ids.length, 'NO_CHANGE', 'Every rule is already approved.');
  for (const id of ids) {
    const r = findIn(doc, 'rules', id);
    need(r, 'NOT_FOUND', `Rule ${id} does not exist.`);
    need(!(r.realLaw && !String(r.verifiedBy || '').trim()), 'UNVERIFIED', `Rule ${id} is based on real law: record who verified it before approving.`);
    r.approved = true; bump(r);
  }
  return { summary: `Approved ${ids.length === 1 ? `rule ${ids[0]}` : `${ids.length} rules`}`, target: { kind: 'rule', id: ids.join(',') }, changes: ids.map((id) => ({ path: `${id}.approved`, before: false, after: true })) };
} };

H['rule.unapprove'] = { perm: 'rules.approve', run(x) {
  const { doc, p } = x;
  configGuard(x);
  const r = findIn(doc, 'rules', p.id);
  need(r && r.approved, 'NO_CHANGE', 'That rule is not approved.');
  x.reason ||= reasonOf(p.reason);
  r.approved = false; bump(r);
  return { summary: `Returned rule ${r.id} to draft (not applied)`, target: { kind: 'rule', id: r.id }, changes: [{ path: 'approved', before: true, after: false }] };
} };

// ----- Round 1: the auction -----
H['auction.order'] = { perm: 'auction.record', run(x) {
  const { doc, p } = x;
  r1Guard(doc);
  const ids = p.order;
  need(Array.isArray(ids) && ids.length === doc.auction.records.length && new Set(ids).size === ids.length && ids.every((id) => doc.auction.records.some((r) => r.employeeId === id)), 'INVALID', 'The auction order must list every CV exactly once.');
  const before = doc.auction.records.map((r) => [r.employeeId, r.order]);
  ids.forEach((id, i) => { const r = rec(doc, id); r.order = i + 1; bump(r); });
  return { summary: 'Changed the auction order', target: { kind: 'auction', id: 'order' }, changes: [{ path: 'order', before: before.sort((a, b) => a[1] - b[1]).map((y) => y[0]), after: ids }] };
} };

H['auction.start'] = { perm: 'auction.record', run(x) {
  const { doc, p } = x;
  r1Guard(doc);
  const r = rec(doc, p.employeeId);
  need(r.status === 'available', 'INVALID_STATE', `${empName(doc, r.employeeId)} is not available for auction (${r.status}).`);
  const live = doc.auction.records.find((y) => y.status === 'live');
  need(!live, 'ANOTHER_LIVE', `${empName(doc, live?.employeeId)} is already being auctioned. Record its result first.`);
  r.status = 'live'; r.currentBid = null; r.currentBidTeamId = null; bump(r);
  doc.auction.liveId = r.employeeId;
  return { summary: `Started auctioning ${empName(doc, r.employeeId)}`, target: { kind: 'auction', id: r.employeeId }, changes: [{ path: 'status', before: 'available', after: 'live' }] };
} };

H['auction.bid'] = { perm: 'auction.record', run(x) {
  const { doc, p } = x;
  r1Guard(doc);
  const r = rec(doc, p.employeeId);
  need(r.status === 'live', 'INVALID_STATE', 'Bids can be tracked only for the CV currently being auctioned.');
  teamOf(doc, p.teamId);
  need(isMoney(p.amount), 'INVALID', 'The bid must be an amount of zero or more.');
  need(r.currentBid === null || p.amount > r.currentBid, 'LOW_BID', `The current bid is already ${fmtMoneyDoc(doc, r.currentBid)}.`);
  const before = { bid: r.currentBid, team: r.currentBidTeamId };
  r.currentBid = p.amount; r.currentBidTeamId = p.teamId;
  r.bidLog = [...(r.bidLog || []), { teamId: p.teamId, amount: p.amount, at: x.now, by: x.user.username }].slice(-60);
  bump(r);
  return { summary: `Bid of ${fmtMoneyDoc(doc, p.amount)} by ${teamOf(doc, p.teamId).label} for ${empName(doc, r.employeeId)}`, target: { kind: 'auction', id: r.employeeId }, changes: [{ path: 'currentBid', before, after: { bid: p.amount, team: p.teamId } }] };
} };

H['auction.sell'] = { perm: 'auction.record', run(x) {
  const { doc, p } = x;
  r1Guard(doc);
  const r = rec(doc, p.employeeId);
  const t = teamOf(doc, p.teamId);
  const chk = checkSale(buildContext(doc), { employeeId: r.employeeId, teamId: t.id, amount: p.amount });
  if (chk.errors.length) refuse('SALE_REFUSED', chk.errors.join(' '), chk);
  if (chk.warnings.length && !p.ackBudget) refuse('BUDGET_ACK', `${chk.warnings.join(' ')} Confirm that you have seen this warning to record the sale.`, chk);
  need(p.confirm === true, 'CONFIRM_REQUIRED', 'Confirm the winning allocation before it is recorded.');
  const before = clone(r);
  Object.assign(r, { status: 'sold', winningTeamId: t.id, winningBid: p.amount, confirmed: true, confirmedBy: x.user.username, confirmedAt: x.now, resolution: null });
  if (doc.auction.liveId === r.employeeId) doc.auction.liveId = null;
  bump(r);
  return { summary: `Sold ${empName(doc, r.employeeId)} to ${t.label} for ${fmtMoneyDoc(doc, p.amount)}${chk.warnings.length ? ' (over budget — warning acknowledged)' : ''}`, target: { kind: 'auction', id: r.employeeId }, changes: diff({ status: before.status, team: before.winningTeamId, bid: before.winningBid }, { status: 'sold', team: t.id, bid: p.amount }) };
} };

H['auction.withdraw'] = { perm: 'auction.record', run(x) {
  const { doc, p } = x;
  r1Guard(doc);
  const r = rec(doc, p.employeeId);
  need(['available', 'live'].includes(r.status), 'INVALID_STATE', 'Only an available CV, or the one being auctioned, can be withdrawn.');
  x.reason = reasonOf(p.reason, 'A reason for withdrawing the CV');
  const was = r.status;
  r.status = 'withdrawn'; r.resolution = null; if (doc.auction.liveId === r.employeeId) doc.auction.liveId = null; bump(r);
  return { summary: `Withdrew ${empName(doc, r.employeeId)} from the auction`, target: { kind: 'auction', id: r.employeeId }, changes: [{ path: 'status', before: was, after: 'withdrawn' }] };
} };

H['auction.close'] = { perm: 'auction.record', run(x) {
  const { doc, p } = x;
  r1Guard(doc);
  const r = rec(doc, p.employeeId);
  need(r.status === 'live', 'INVALID_STATE', 'Only the CV being auctioned can be closed without a sale.');
  r.status = 'closed'; doc.auction.liveId = null; bump(r);
  return { summary: `Closed the auction of ${empName(doc, r.employeeId)} without a sale`, target: { kind: 'auction', id: r.employeeId }, changes: [{ path: 'status', before: 'live', after: 'closed' }] };
} };

H['auction.reopen'] = { perm: 'auction.record', run(x) {
  const { doc, p } = x;
  r1Guard(doc);
  const r = rec(doc, p.employeeId);
  need(['withdrawn', 'closed'].includes(r.status), 'INVALID_STATE', 'Only a withdrawn or unsold CV can be re-opened for auction.');
  const was = r.status;
  r.status = 'available'; r.resolution = { kind: 'reauction', at: x.now, by: x.user.username }; r.currentBid = null; r.currentBidTeamId = null; bump(r);
  return { summary: `Re-opened ${empName(doc, r.employeeId)} for auction`, target: { kind: 'auction', id: r.employeeId }, changes: [{ path: 'status', before: was, after: 'available' }] };
} };

H['auction.allocate'] = { perm: 'correction', run(x) {
  const { doc, p } = x;
  r1Guard(doc);
  const r = rec(doc, p.employeeId);
  need(['withdrawn', 'closed'].includes(r.status), 'INVALID_STATE', 'Only a withdrawn or unsold CV can be allocated by Event Control decision.');
  const t = teamOf(doc, p.teamId);
  x.reason = reasonOf(p.reason, 'A reason for the direct allocation');
  need(isMoney(p.amount), 'INVALID', 'The price must be an amount of zero or more.');
  need((buildContext(doc).roster[t.id] || []).length < doc.config.auction.teamSize, 'TEAM_FULL', `${t.label} already has ${doc.config.auction.teamSize} employees.`);
  need(p.confirm === true, 'CONFIRM_REQUIRED', 'Confirm the allocation before it is recorded.');
  const was = r.status;
  Object.assign(r, { status: 'sold', winningTeamId: t.id, winningBid: p.amount, confirmed: true, confirmedBy: x.user.username, confirmedAt: x.now, resolution: { kind: 'direct', reason: x.reason, at: x.now, by: x.user.username } });
  bump(r);
  return { summary: `Allocated ${empName(doc, r.employeeId)} to ${t.label} by Event Control decision at ${fmtMoneyDoc(doc, p.amount)}`, target: { kind: 'auction', id: r.employeeId }, changes: [{ path: 'status', before: was, after: 'sold' }, { path: 'winningTeamId', before: null, after: t.id }] };
} };

H['auction.leaveUnallocated'] = { perm: 'correction', run(x) {
  const { doc, p } = x;
  r1Guard(doc);
  const r = rec(doc, p.employeeId);
  need(['withdrawn', 'closed'].includes(r.status), 'INVALID_STATE', 'Only a withdrawn or unsold CV can be left unallocated.');
  x.reason = reasonOf(p.reason, 'A reason for leaving the CV unallocated');
  r.resolution = { kind: 'unallocated', reason: x.reason, at: x.now, by: x.user.username }; bump(r);
  return { summary: `Recorded ${empName(doc, r.employeeId)} as left unallocated`, target: { kind: 'auction', id: r.employeeId }, changes: [{ path: 'resolution', before: null, after: 'unallocated' }] };
} };

H['auction.correct'] = { perm: 'correction', run(x) {
  const { doc, p } = x;
  need(!r2Final(doc), 'ROUND2_FINAL', 'Round 2 is finalised. Reopen it before correcting the auction.');
  const r = rec(doc, p.employeeId);
  need(r.status === 'sold', 'INVALID_STATE', 'Only a confirmed sale can be corrected.');
  x.reason = reasonOf(p.reason, 'A reason for the correction');
  x.kind = 'correction';
  need(p.confirm === true, 'CONFIRM_REQUIRED', 'Confirm the correction before it is recorded.');
  const before = { status: r.status, winningTeamId: r.winningTeamId, winningBid: r.winningBid };
  let after;
  if (p.cancel) {
    after = { status: r1Locked(doc) ? 'withdrawn' : 'available', winningTeamId: null, winningBid: null };
    if (r1Locked(doc)) r.resolution = { kind: 'unallocated', reason: x.reason, at: x.now, by: x.user.username };
  } else {
    const t = teamOf(doc, p.teamId);
    need(isMoney(p.amount), 'INVALID', 'The winning bid must be an amount of zero or more.');
    if (t.id !== r.winningTeamId) need((buildContext(doc).roster[t.id] || []).length < doc.config.auction.teamSize, 'TEAM_FULL', `${t.label} already has ${doc.config.auction.teamSize} employees.`);
    after = { status: 'sold', winningTeamId: t.id, winningBid: p.amount };
  }
  Object.assign(r, after, { confirmed: after.status === 'sold', confirmedBy: x.user.username, confirmedAt: x.now });
  bump(r);
  if (r1Locked(doc)) doc.round1.corrections.push({ at: x.now, by: x.user.username, reason: x.reason, employeeId: r.employeeId, before, after });
  return { summary: `Corrected the auction result for ${empName(doc, r.employeeId)}${r1Locked(doc) ? ' after Round 1 was locked' : ''}`, target: { kind: 'auction', id: r.employeeId }, changes: diff(before, after) };
} };

H['auction.note'] = { perm: 'auction.record', run(x) {
  const { doc, p } = x;
  const r = rec(doc, p.employeeId);
  const before = r.notes || '';
  r.notes = str(p.notes, 1000, { field: 'Notes' });
  bump(r);
  return { summary: `Updated the notes for ${empName(doc, r.employeeId)}`, target: { kind: 'auction', id: r.employeeId }, changes: [{ path: 'notes', before, after: r.notes }], revert: { kind: 'auctionNote', employeeId: r.employeeId, before, after: r.notes } };
} };

H['round1.lock'] = { perm: 'round.lock', run(x) {
  const { doc, p } = x;
  need(!r1Locked(doc), 'NO_CHANGE', 'Round 1 is already locked.');
  need(p.confirm === true, 'CONFIRM_REQUIRED', 'Confirm that you want to lock Round 1.');
  const res = computeAll(doc);
  const blocking = [...res.validation.config, ...res.validation.round1].filter((i) => i.severity === 'blocking');
  if (blocking.length) refuse('VALIDATION', `Round 1 cannot be locked yet: ${blocking.length} problem(s) must be fixed first.`, blocking);
  const records = clone(doc.auction.records).map(({ bidLog, ...r }) => r);
  const snapshot = { at: x.now, by: x.user.username, records, totals: res.round1.teams, roster: res.roster, fingerprint: fingerprint(stableStringify(records, new Set(['rev']))) };
  doc.round1.status = 'locked'; doc.round1.lockedAt = x.now; doc.round1.lockedBy = x.user.username;
  doc.round1.history = [...(doc.round1.history || []), ...(doc.round1.snapshot ? [doc.round1.snapshot] : [])];
  doc.round1.snapshot = snapshot;
  x.backup = 'Round 1 locked';
  return { summary: 'Locked Round 1 and preserved the official employee-to-team mapping', target: { kind: 'round', id: 'round1' }, changes: [{ path: 'round1.status', before: 'open', after: 'locked' }] };
} };

H['round1.unlock'] = { perm: 'round.lock', run(x) {
  const { doc, p } = x;
  need(r1Locked(doc), 'NO_CHANGE', 'Round 1 is not locked.');
  need(!r2Final(doc), 'ROUND2_FINAL', 'Round 2 is finalised. Reopen Round 2 before unlocking Round 1.');
  need(p.confirm === true, 'CONFIRM_REQUIRED', 'Confirm that you want to unlock Round 1.');
  x.reason = reasonOf(p.reason, 'A reason for unlocking Round 1');
  doc.round1.status = 'open';
  doc.round1.unlocks = [...(doc.round1.unlocks || []), { at: x.now, by: x.user.username, reason: x.reason }];
  x.backup = 'Round 1 unlocked';
  return { summary: 'Unlocked Round 1 (the previously locked outcome is preserved)', target: { kind: 'round', id: 'round1' }, changes: [{ path: 'round1.status', before: 'locked', after: 'open' }] };
} };

// ----- Round 2: deployments -----
function overlapProblem(doc, dep, excludeId) {
  const per = doc.config.period;
  const span = (d) => { const s = monthIndex(per, d.startMonth); return [s, s + d.contractMonths - 1]; };
  const [a1, a2] = span(dep);
  const others = doc.deployments.filter((d) => d.employeeId === dep.employeeId && d.teamId === dep.teamId && d.id !== excludeId);
  if (!doc.config.deployment.splitAssignments) {
    const o = others.find((d) => { const [b1, b2] = span(d); return a1 <= b2 && b1 <= a2; });
    if (o) return `${empName(doc, dep.employeeId)} is already deployed in ${o.id} for overlapping months, and split assignments are not enabled.`;
    if ((dep.timeShare ?? 100) !== 100) return 'Split assignments are not enabled, so the time share must be 100%.';
    return null;
  }
  for (let m = a1; m <= a2; m++) {
    const share = (dep.timeShare ?? 100) + others.filter((d) => { const [b1, b2] = span(d); return b1 <= m && m <= b2; }).reduce((s, d) => s + (d.timeShare ?? 100), 0);
    if (share > 100) return `${empName(doc, dep.employeeId)} would be assigned ${share}% of their time in month ${m}.`;
  }
  return null;
}

H['deploy.create'] = { perm: 'deploy.record', run(x) {
  const { doc, p } = x;
  r2Guard(doc);
  const t = teamOf(doc, p.teamId);
  const owner = buildContext(doc).ownerOf[p.employeeId];
  need(doc.employees.some((e) => e.id === p.employeeId), 'INVALID_REF', `There is no employee “${p.employeeId}”.`);
  need(owner === t.id, 'NOT_TEAM_EMPLOYEE', owner ? `${empName(doc, p.employeeId)} was hired by ${teamOf(doc, owner).label} in Round 1, not by ${t.label}.` : `${empName(doc, p.employeeId)} was not hired by any team in Round 1.`);
  for (const k of ['cityId', 'roleId', 'assignmentTypeId', 'salary', 'contractMonths', 'startMonth']) need(p[k] !== undefined && p[k] !== null && p[k] !== '', 'MISSING', `“${k}” is required.`);
  const f = deploymentFields(p, doc);
  const dep = {
    id: `D${String((doc.depSeq || 0) + 1).padStart(3, '0')}`, teamId: t.id, employeeId: p.employeeId,
    cityId: f.cityId, roleId: f.roleId, assignmentTypeId: f.assignmentTypeId, salary: f.salary, contractMonths: f.contractMonths, startMonth: f.startMonth,
    timeShare: f.timeShare ?? 100, relocationPackage: f.relocationPackage || 'standard', trainingProvided: f.trainingProvided ?? false,
    localPartner: f.localPartner ?? false, officeArranged: f.officeArranged ?? false,
    responsibility: f.responsibility || '', businessUnit: f.businessUnit || '', contribution: f.contribution || '', permitsObtained: f.permitsObtained || '', notes: f.notes || '',
    approval: { state: 'pending' }, rev: 0,
  };
  const ov = overlapProblem(doc, dep, null);
  if (ov) refuse('OVERLAP', ov);
  doc.depSeq = (doc.depSeq || 0) + 1;
  doc.deployments.push(dep);
  return { summary: `Recorded deployment ${dep.id}: ${empName(doc, dep.employeeId)} (${t.label}) to ${doc.cities.find((c) => c.id === dep.cityId)?.name}`, target: { kind: 'deployment', id: dep.id }, changes: diff(null, dep), revert: recordRevert('deployments', dep.id, null, dep) };
} };

H['deploy.update'] = { perm: 'deploy.record', run(x) {
  const { doc, p } = x;
  r2Guard(doc);
  const d = findIn(doc, 'deployments', p.id);
  need(d, 'NOT_FOUND', 'That deployment does not exist.');
  expectRev(d, p);
  const before = clone(d);
  const f = deploymentFields(p.patch || {}, doc);
  Object.assign(d, f);
  const ov = overlapProblem(doc, d, d.id);
  if (ov) refuse('OVERLAP', ov);
  const material = diff(before, d).some((c) => !['notes', 'responsibility', 'contribution', 'businessUnit', 'permitsObtained'].includes(c.path));
  let reset = false;
  if (material && d.approval?.state !== 'pending') { d.approval = { state: 'pending' }; reset = true; }
  bump(d);
  return { summary: `Updated deployment ${d.id}${reset ? ' (approval reset: approve it again)' : ''}`, target: { kind: 'deployment', id: d.id }, changes: diff(before, d), revert: recordRevert('deployments', d.id, before, d) };
} };

H['deploy.delete'] = { perm: 'deploy.record', run(x) {
  const { doc, p } = x;
  r2Guard(doc);
  const d = findIn(doc, 'deployments', p.id);
  need(d, 'NOT_FOUND', 'That deployment does not exist.');
  expectRev(d, p);
  doc.deployments = doc.deployments.filter((y) => y.id !== d.id);
  const comp = doc.compliance[d.id]; delete doc.compliance[d.id];
  return { summary: `Deleted deployment ${d.id}`, target: { kind: 'deployment', id: d.id }, changes: diff(d, null), revert: { ...recordRevert('deployments', d.id, d, null), compliance: clone(comp || null) } };
} };

H['deploy.approve'] = { perm: 'deploy.record', run(x) {
  const { doc, p } = x;
  r2Guard(doc);
  const d = findIn(doc, 'deployments', p.id);
  need(d, 'NOT_FOUND', 'That deployment does not exist.');
  const ev = evaluateDeployment(buildContext(doc), d);
  if (!ev.valid) refuse('INVALID', [...ev.refErrors, ...ev.fieldErrors, ev.wrongTeam ? 'This employee was not hired by the team.' : ''].filter(Boolean).join(' '));
  if (!ev.operational) refuse('BLOCKED', `This deployment cannot be approved: it is stopped by ${ev.compliance.evals.filter((e) => e.blocking).map((e) => `${e.ruleId} ${e.title} (${e.status})`).join('; ')}. Resolve the requirement or record the deployment as blocked.`, { blockers: ev.compliance.blockers });
  const res = computeAll(doc);
  const mine = res.validation.round2.filter((i) => i.severity === 'blocking' && (i.ref?.id === d.id || (i.ref?.kind === 'employee' && i.ref?.id === d.employeeId)) && !['R2_NOT_APPROVED', 'R2_BLOCKED', 'R2_CALC', 'R2_EMP_MISSING'].includes(i.code));
  if (mine.length) refuse('VALIDATION', `This deployment cannot be approved yet: ${mine.map((i) => i.message).join(' ')}`, mine);
  const was = d.approval?.state || 'pending';
  d.approval = { state: 'approved', by: x.user.username, at: x.now };
  bump(d);
  return { summary: `Approved deployment ${d.id} as operational`, target: { kind: 'deployment', id: d.id }, changes: [{ path: 'approval', before: was, after: 'approved' }] };
} };

H['deploy.recordBlocked'] = { perm: 'deploy.record', run(x) {
  const { doc, p } = x;
  r2Guard(doc);
  const d = findIn(doc, 'deployments', p.id);
  need(d, 'NOT_FOUND', 'That deployment does not exist.');
  const ev = evaluateDeployment(buildContext(doc), d);
  need(ev.valid && !ev.operational, 'NOT_BLOCKED', 'Only a deployment stopped by a blocking requirement can be recorded as blocked.');
  x.reason = reasonOf(p.reason, 'A note on why the deployment stays blocked');
  const was = d.approval?.state || 'pending';
  d.approval = { state: 'blockedRecorded', by: x.user.username, at: x.now, note: x.reason };
  bump(d);
  return { summary: `Recorded deployment ${d.id} as blocked (${ev.compliance.blockers.join(', ')})`, target: { kind: 'deployment', id: d.id }, changes: [{ path: 'approval', before: was, after: 'blockedRecorded' }] };
} };

H['deploy.unapprove'] = { perm: 'deploy.record', run(x) {
  const { doc, p } = x;
  r2Guard(doc);
  const d = findIn(doc, 'deployments', p.id);
  need(d && d.approval?.state !== 'pending', 'NO_CHANGE', 'That deployment is not approved.');
  const was = d.approval.state;
  d.approval = { state: 'pending' }; bump(d);
  return { summary: `Withdrew the approval of deployment ${d.id}`, target: { kind: 'deployment', id: d.id }, changes: [{ path: 'approval', before: was, after: 'pending' }] };
} };

H['submission.set'] = { perm: 'deploy.record', run(x) {
  const { doc, p } = x;
  r2Guard(doc);
  const t = teamOf(doc, p.teamId);
  const before = clone(doc.round2.submissions[t.id] || null);
  const next = { received: !!p.received, reference: str(p.reference, 120, { field: 'Reference' }), notes: str(p.notes, 600, { field: 'Notes' }), receivedAt: p.received ? (before?.receivedAt || x.now) : null, by: x.user.username };
  doc.round2.submissions[t.id] = next;
  return { summary: `${next.received ? 'Recorded' : 'Cleared'} ${t.label}'s written allocation${next.reference ? ` (${next.reference})` : ''}`, target: { kind: 'submission', id: t.id }, changes: diff(before, next), revert: { kind: 'submission', teamId: t.id, before, after: clone(next) } };
} };

function applicableRule(doc, depId, ruleId) {
  const d = findIn(doc, 'deployments', depId);
  need(d, 'NOT_FOUND', 'That deployment does not exist.');
  const ctx = buildContext(doc);
  const ev = evaluateDeployment(ctx, d);
  need(ev.valid, 'INVALID', 'Fix the deployment’s details before recording compliance.');
  const rule = ctx.rules.find((r) => r.id === ruleId);
  need(rule, 'NOT_FOUND', `Rule ${ruleId} does not exist or is not approved.`);
  need(ruleApplies(rule, { dep: d, emp: ev.emp, team: ev.team, city: ev.city, cont: ev.cont, role: ev.role, type: ev.type, international: ev.international, foreignToTeam: ev.foreignToTeam }), 'NOT_APPLICABLE', `Rule ${ruleId} does not apply to this deployment.`);
  return { d, rule };
}
function afterComplianceChange(doc, d) {
  const ev = evaluateDeployment(buildContext(doc), d);
  const st = d.approval?.state || 'pending';
  if ((st === 'approved' && !ev.operational) || (st === 'blockedRecorded' && ev.operational)) { d.approval = { state: 'pending' }; bump(d); return ' (approval reset: the deployment’s status changed)'; }
  return '';
}

H['compliance.set'] = { perm: 'compliance.record', run(x) {
  const { doc, p } = x;
  r2Guard(doc);
  const { d, rule } = applicableRule(doc, p.deploymentId, p.ruleId);
  const auto = (rule.check?.kind || 'status') !== 'status';
  const allowed = auto ? ['review', 'unassessed'] : MANUAL_STATUSES;
  need(allowed.includes(p.status), 'INVALID', auto ? 'This requirement is checked automatically; it can only be referred for administrator review.' : 'Choose a valid compliance status.');
  const note = str(p.note, 600, { field: 'Note' });
  if (p.status === 'na') need(note.length >= 5, 'REASON_REQUIRED', 'Explain why an applicable requirement is “not applicable”.');
  doc.compliance[d.id] ||= {};
  const before = clone(doc.compliance[d.id][rule.id] || null);
  const next = { status: auto && p.status === 'unassessed' ? null : p.status, evidence: str(p.evidence, 300, { field: 'Evidence' }), note, by: x.user.username, at: x.now, waiver: before?.waiver || null };
  doc.compliance[d.id][rule.id] = next;
  const tail = afterComplianceChange(doc, d);
  return { summary: `${rule.id} for ${d.id}: ${p.status}${tail}`, target: { kind: 'compliance', id: `${d.id}/${rule.id}` }, changes: diff(before, next), revert: { kind: 'compliance', depId: d.id, ruleId: rule.id, before, after: clone(next) } };
} };

H['compliance.bulk'] = { perm: 'compliance.record', run(x) {
  const { doc, p } = x;
  r2Guard(doc);
  const d = findIn(doc, 'deployments', p.deploymentId);
  need(d, 'NOT_FOUND', 'That deployment does not exist.');
  need(['compliant', 'pending'].includes(p.status), 'INVALID', 'Bulk recording is for “compliant” or “pending documentation” only.');
  const ctx = buildContext(doc);
  const ev = evaluateDeployment(ctx, d);
  need(ev.valid, 'INVALID', 'Fix the deployment’s details before recording compliance.');
  doc.compliance[d.id] ||= {};
  const before = clone(doc.compliance[d.id]);
  const changed = [];
  for (const e of ev.compliance.evals) {
    if (e.source !== 'manual' || (doc.compliance[d.id][e.ruleId]?.status && doc.compliance[d.id][e.ruleId].status !== 'unassessed')) continue;
    doc.compliance[d.id][e.ruleId] = { status: p.status, evidence: str(p.evidence, 300, { field: 'Evidence' }), note: '', by: x.user.username, at: x.now, waiver: null };
    changed.push(e.ruleId);
  }
  need(changed.length, 'NO_CHANGE', 'Every operator-assessed requirement for this deployment already has a status.');
  const tail = afterComplianceChange(doc, d);
  return { summary: `Recorded ${changed.length} requirement(s) for ${d.id} as ${p.status}${tail}`, target: { kind: 'compliance', id: d.id }, changes: changed.map((r) => ({ path: r, before: 'unassessed', after: p.status })), revert: { kind: 'complianceAll', depId: d.id, before, after: clone(doc.compliance[d.id]) } };
} };

H['compliance.waive'] = { perm: 'waiver', run(x) {
  const { doc, p } = x;
  r2Guard(doc);
  const { d, rule } = applicableRule(doc, p.deploymentId, p.ruleId);
  need(rule.waivable, 'NOT_WAIVABLE', `Rule ${rule.id} cannot be waived.`);
  x.reason = reasonOf(p.reason, 'A documented reason for the waiver');
  x.kind = 'override';
  doc.compliance[d.id] ||= {};
  const before = clone(doc.compliance[d.id][rule.id] || null);
  doc.compliance[d.id][rule.id] = { ...(before || { status: 'unassessed', evidence: '', note: '' }), waiver: { reason: x.reason, by: x.user.username, at: x.now } };
  const tail = afterComplianceChange(doc, d);
  return { summary: `Waived ${rule.id} for ${d.id} (administrative override)${tail}`, target: { kind: 'compliance', id: `${d.id}/${rule.id}` }, changes: [{ path: 'waiver', before: null, after: x.reason }], revert: { kind: 'compliance', depId: d.id, ruleId: rule.id, before, after: clone(doc.compliance[d.id][rule.id]) } };
} };

H['compliance.unwaive'] = { perm: 'waiver', run(x) {
  const { doc, p } = x;
  r2Guard(doc);
  const { d, rule } = applicableRule(doc, p.deploymentId, p.ruleId);
  const cur = doc.compliance[d.id]?.[rule.id];
  need(cur?.waiver, 'NO_CHANGE', 'This requirement is not waived.');
  x.reason = reasonOf(p.reason);
  x.kind = 'override';
  const before = clone(cur);
  cur.waiver = null;
  const tail = afterComplianceChange(doc, d);
  return { summary: `Removed the waiver of ${rule.id} for ${d.id}${tail}`, target: { kind: 'compliance', id: `${d.id}/${rule.id}` }, changes: [{ path: 'waiver', before: before.waiver.reason, after: null }] };
} };

// ----- calculation and finalisation -----
H['calc.run'] = { perm: 'calc.run', run(x) {
  const { doc } = x;
  need(!r2Final(doc), 'ROUND2_FINAL', 'Round 2 is finalised; its official calculation is preserved.');
  const before = doc.calc.draft ? { at: doc.calc.draft.at, inputHash: doc.calc.draft.inputHash } : null;
  const res = officialCompute(doc);
  doc.calc.draft = { at: x.now, by: x.user.username, inputHash: res.inputHash, modelVersion: res.modelVersion, resultsHash: resultsFingerprint(res), summary: summarise(res) };
  return { summary: `Ran the calculation (draft) — ${res.validation.blocking.round2} blocking issue(s) remain`, target: { kind: 'calc', id: 'draft' }, changes: [{ path: 'calc.draft', before, after: { at: x.now, inputHash: res.inputHash } }] };
} };

H['round2.finalise'] = { perm: 'round.finalise', run(x) {
  const { doc, p } = x;
  need(!r2Final(doc), 'NO_CHANGE', 'Round 2 is already finalised.');
  need(p.confirm === true, 'CONFIRM_REQUIRED', 'Confirm that you want to finalise Round 2.');
  const res = computeAll(doc);
  const blocking = [...res.validation.config, ...res.validation.round1, ...res.validation.round2].filter((i) => i.severity === 'blocking');
  if (blocking.length) refuse('VALIDATION', `Round 2 cannot be finalised: ${blocking.length} blocking problem(s) remain.`, blocking);
  const version = (doc.finals || []).length + 1;
  const final = {
    version, at: x.now, by: x.user.username, inputHash: res.inputHash, modelVersion: res.modelVersion,
    resultsHash: resultsFingerprint(res), summary: summarise(res), inputs: snapshotInputs(doc),
    warnings: [...res.validation.config, ...res.validation.round1, ...res.validation.round2].filter((i) => i.severity !== 'blocking').map((i) => ({ code: i.code, message: i.message })),
    reopened: null,
  };
  doc.finals = [...(doc.finals || []), final];
  doc.round2.status = 'finalised'; doc.round2.finalisedAt = x.now; doc.round2.finalisedBy = x.user.username;
  x.backup = `Round 2 finalised (version ${version})`;
  return { summary: `Finalised Round 2 — official result version ${version}`, target: { kind: 'round', id: 'round2' }, changes: [{ path: 'round2.status', before: 'open', after: 'finalised' }] };
} };

H['round2.reopen'] = { perm: 'round.finalise', run(x) {
  const { doc, p } = x;
  need(r2Final(doc), 'NO_CHANGE', 'Round 2 is not finalised.');
  need(p.confirm === true, 'CONFIRM_REQUIRED', 'Confirm that you want to reopen Round 2 for correction.');
  x.reason = reasonOf(p.reason, 'A reason for the administrative correction');
  x.kind = 'correction';
  const last = doc.finals.at(-1);
  last.reopened = { at: x.now, by: x.user.username, reason: x.reason };
  doc.round2.status = 'open';
  doc.round2.reopenings = [...(doc.round2.reopenings || []), { at: x.now, by: x.user.username, reason: x.reason, version: last.version }];
  x.backup = `Round 2 reopened (version ${last.version} kept)`;
  return { summary: `Reopened Round 2 for correction (official version ${last.version} is preserved until a new one is finalised)`, target: { kind: 'round', id: 'round2' }, changes: [{ path: 'round2.status', before: 'finalised', after: 'open' }] };
} };

// ----- reverting a draft edit -----
H['audit.revert'] = { perm: 'audit.revert', run(x) {
  const { doc, p } = x;
  const e = doc.audit.find((a) => a.seq === p.seq);
  need(e, 'NOT_FOUND', 'That audit entry does not exist.');
  need(e.revert, 'NOT_REVERTIBLE', 'This change cannot be reverted automatically. Use the correction tools instead.');
  need(!e.revertedBy, 'NO_CHANGE', `This change was already reverted (entry #${e.revertedBy}).`);
  x.reason = reasonOf(p.reason, 'A reason for reverting the change');
  const rv = e.revert;
  let next = null;
  if (rv.kind === 'record') {
    if (rv.coll === 'deployments') r2Guard(doc); else configGuard(x, { formula: rv.coll === 'revenueModels' });
    const cur = findIn(doc, rv.coll, rv.id) || null;
    need(same(cur, rv.after), 'CHANGED_SINCE', 'This record has changed since; revert the later change first, or edit it directly.');
    if (rv.before === null) doc[rv.coll] = doc[rv.coll].filter((y) => y.id !== rv.id);
    else if (cur === null) { doc[rv.coll].push(clone(rv.before)); if (rv.compliance) doc.compliance[rv.id] = clone(rv.compliance); }
    else doc[rv.coll] = doc[rv.coll].map((y) => (y.id === rv.id ? { ...clone(rv.before), rev: (cur.rev || 0) + 1 } : y));
    if (rv.coll === 'deployments' && rv.before === null) delete doc.compliance[rv.id];
    next = recordRevert(rv.coll, rv.id, rv.after, rv.before);
  } else if (rv.kind === 'config') {
    configGuard(x, { formula: FORMULA_SECTIONS.includes(rv.section) });
    need(same(doc.config[rv.section], rv.after), 'CHANGED_SINCE', 'These settings have changed since; revert the later change first.');
    doc.config[rv.section] = clone(rv.before); doc.configRev = (doc.configRev || 0) + 1;
    next = { kind: 'config', section: rv.section, before: clone(rv.after), after: clone(rv.before) };
  } else if (rv.kind === 'standardProfile') {
    configGuard(x);
    need(same(doc.standardProfile, rv.after), 'CHANGED_SINCE', 'The standard profile has changed since.');
    doc.standardProfile = clone(rv.before);
    next = { kind: 'standardProfile', before: clone(rv.after), after: clone(rv.before) };
  } else if (rv.kind === 'compliance' || rv.kind === 'complianceAll') {
    r2Guard(doc);
    const cur = rv.kind === 'compliance' ? (doc.compliance[rv.depId]?.[rv.ruleId] || null) : (doc.compliance[rv.depId] || null);
    need(same(cur, rv.after), 'CHANGED_SINCE', 'This compliance record has changed since.');
    if (rv.kind === 'compliance') { doc.compliance[rv.depId] ||= {}; if (rv.before === null) delete doc.compliance[rv.depId][rv.ruleId]; else doc.compliance[rv.depId][rv.ruleId] = clone(rv.before); }
    else doc.compliance[rv.depId] = clone(rv.before) || {};
    next = { ...rv, before: clone(rv.after), after: clone(rv.before) };
  } else if (rv.kind === 'submission') {
    r2Guard(doc);
    need(same(doc.round2.submissions[rv.teamId] || null, rv.after), 'CHANGED_SINCE', 'This submission record has changed since.');
    if (rv.before === null) delete doc.round2.submissions[rv.teamId]; else doc.round2.submissions[rv.teamId] = clone(rv.before);
    next = { ...rv, before: clone(rv.after), after: clone(rv.before) };
  } else if (rv.kind === 'auctionNote') {
    const r = rec(doc, rv.employeeId);
    need((r.notes || '') === rv.after, 'CHANGED_SINCE', 'The notes have changed since.');
    r.notes = rv.before; bump(r);
    next = { ...rv, before: rv.after, after: rv.before };
  } else refuse('NOT_REVERTIBLE', 'This change cannot be reverted automatically.');
  e.revertedBy = (doc.auditSeq || 0) + 1;
  return { summary: `Reverted change #${e.seq} (${e.summary})`, target: e.target, changes: (e.changes || []).map((c) => ({ path: c.path, before: c.after, after: c.before })), revert: next };
} };

// ----- practice sessions -----
H['practice.loadSample'] = { perm: 'practice.load', run(x) {
  const { doc, p } = x;
  need(doc.mode === 'practice', 'OFFICIAL', 'Sample results can be loaded only into a practice session, never the official event.');
  if (p.stage === 'auction') {
    r1Guard(doc);
    need(!auctionStarted(doc), 'INVALID_STATE', 'The auction has already started in this practice session. Reset it first.');
    for (const [t, list] of Object.entries(PRACTICE_AUCTION)) for (const [e, b] of list) {
      const r = rec(doc, e);
      Object.assign(r, { status: 'sold', winningTeamId: t, winningBid: Math.round(b * 1e7), confirmed: true, confirmedBy: `${x.user.username} (practice sample)`, confirmedAt: x.now });
      bump(r);
    }
    return { summary: 'Loaded the sample auction results (practice)', target: { kind: 'auction', id: 'sample' }, changes: [{ path: 'auction', before: 'empty', after: 'sample results' }] };
  }
  if (p.stage === 'round2') {
    r2Guard(doc);
    need(!doc.deployments.length, 'INVALID_STATE', 'This practice session already has deployments. Reset it first.');
    const ctx = buildContext(doc);
    for (const [t, list] of Object.entries(PRACTICE_DEPLOYMENTS)) for (const d of list) {
      if (ctx.ownerOf[d.employeeId] !== t) continue; // only for employees this team actually hired
      doc.depSeq = (doc.depSeq || 0) + 1;
      doc.deployments.push({ id: `D${String(doc.depSeq).padStart(3, '0')}`, teamId: t, ...clone(d), approval: { state: 'pending' }, rev: 0 });
    }
    const c2 = buildContext(doc);
    for (const d of doc.deployments) {
      const ev = evaluateDeployment(c2, d);
      if (!ev.valid) continue;
      doc.compliance[d.id] ||= {};
      for (const r of c2.rules) {
        if ((r.check?.kind || 'status') !== 'status') continue;
        if (ruleApplies(r, { dep: d, emp: ev.emp, team: ev.team, city: ev.city, cont: ev.cont, role: ev.role, type: ev.type, international: ev.international, foreignToTeam: ev.foreignToTeam })) doc.compliance[d.id][r.id] = { ...practiceComplianceFor(d, r.id), note: '', by: `${x.user.username} (practice sample)`, at: x.now, waiver: null };
      }
    }
    for (const t of doc.teams) doc.round2.submissions[t.id] = { received: true, reference: `Practice form ${t.id}`, notes: '', receivedAt: x.now, by: x.user.username };
    return { summary: `Loaded ${doc.deployments.length} sample deployments with compliance records (practice)`, target: { kind: 'deployment', id: 'sample' }, changes: [{ path: 'deployments', before: 0, after: doc.deployments.length }] };
  }
  refuse('INVALID', 'Choose which sample to load: auction or round2.');
} };

H['session.rename'] = { perm: 'session.manage', run(x) {
  const { doc, p } = x;
  const before = doc.name;
  doc.name = str(p.name, 80, { required: true, field: 'Session name' });
  return { summary: `Renamed the session to “${doc.name}”`, target: { kind: 'session', id: doc.id }, changes: [{ path: 'name', before, after: doc.name }] };
} };

// ---------------- dispatcher ----------------

function fmtMoneyDoc(doc, m) {
  if (m === null || m === undefined) return 'n/a';
  const c = doc.config.currency;
  const major = Math.round(m) / (c.minor || 100);
  const [i] = Math.abs(major).toFixed(0).split('.');
  const g = c.grouping === 'indian' ? i.replace(/(\d)(?=(\d\d)+\d$)/g, '$1,') : i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${major < 0 ? '−' : ''}${c.symbol}${g}`;
}

export const ACTIONS = Object.fromEntries(Object.entries(H).map(([k, v]) => [k, v.perm]));

/**
 * Apply one action to a session document (in place). Throws Refusal when it is not allowed.
 * Returns { entry, backup } — the audit entry that was appended.
 */
export function applyAction(doc, action, user, now) {
  const h = H[action?.type];
  if (!h) refuse('UNKNOWN', `Unknown action “${action?.type}”.`);
  if (!can(user, h.perm)) refuse('FORBIDDEN', 'You do not have permission to do this.', null, 403);
  const x = { doc, p: action.payload || {}, user, now, reason: null, kind: 'change', backup: null };
  if (x.p.reason !== undefined && x.p.reason !== '') x.reason = str(x.p.reason, 500, { field: 'Reason' });
  const out = h.run(x);
  doc.auditSeq = (doc.auditSeq || 0) + 1;
  const entry = {
    seq: doc.auditSeq, at: now, user: { id: user.id, username: user.username, name: user.name, role: user.role },
    action: action.type, kind: x.kind, target: out.target, summary: out.summary, changes: (out.changes || []).slice(0, 80),
    reason: x.reason || null, revert: out.revert || null, revertedBy: null, mode: doc.mode,
  };
  doc.audit.push(entry);
  return { entry, backup: x.backup };
}

export { CHECKS, ID_RE };
