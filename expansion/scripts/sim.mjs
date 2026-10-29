// Simulation helpers for the balance pass and the tests: fill a session with an auction
// outcome, deployments and compliance records, the way an operator would.
import { newSessionDoc } from '../src/data/seed.mjs';
import { PRACTICE_AUCTION, PRACTICE_DEPLOYMENTS, practiceComplianceFor } from '../src/data/practice.mjs';
import { buildContext } from '../src/engine/context.mjs';
import { evaluateDeployment } from '../src/engine/round2.mjs';
import { ruleApplies } from '../src/engine/compliance.mjs';
import { capabilityFit } from '../src/engine/capability.mjs';
import { PACKAGES } from '../src/engine/model.mjs';

export const L = (x) => Math.round(x * 1e7);

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function blankDoc(mode = 'practice') {
  return newSessionDoc({ id: 'sim', name: 'Simulation', mode, createdAt: '2026-10-29T00:00:00.000Z', createdBy: 'sim' });
}

/** Record an auction outcome: { A: [[employeeId, bidLakh], …], … }. */
export function applyAuction(doc, outcome, { lock = true } = {}) {
  for (const [t, list] of Object.entries(outcome)) for (const [e, b] of list) {
    const r = doc.auction.records.find((x) => x.employeeId === e);
    Object.assign(r, { status: 'sold', winningTeamId: t, winningBid: L(b), confirmed: true });
  }
  if (lock) doc.round1.status = 'locked';
  return doc;
}

export function randomAuction(doc, rand) {
  const ids = doc.employees.map((e) => e.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const out = { A: [], B: [], C: [], D: [] };
  ids.forEach((id, i) => {
    const e = doc.employees.find((x) => x.id === id);
    out['ABCD'[i % 4]].push([id, (e.startingBid / 1e7) * (1 + rand() * 0.6)]);
  });
  return out;
}

/** Add deployments: { A: [fields…] }. Every deployment is approved. */
export function applyDeployments(doc, plan) {
  let n = doc.deployments.length;
  for (const [t, list] of Object.entries(plan)) for (const d of list) {
    doc.deployments.push({ id: `D${String(++n).padStart(3, '0')}`, teamId: t, timeShare: 100, approval: { state: 'approved' }, ...structuredClone(d) });
  }
  doc.depSeq = n;
  return doc;
}

/** Record every applicable operator-assessed requirement (compliant with evidence unless `fn` says otherwise). */
export function applyCompliance(doc, fn = () => ({ status: 'compliant', evidence: 'On file' })) {
  const ctx = buildContext(doc);
  for (const dep of doc.deployments) {
    const ev = evaluateDeployment(ctx, dep);
    if (!ev.valid) continue;
    doc.compliance[dep.id] ||= {};
    for (const r of ctx.rules) {
      if ((r.check?.kind || 'status') !== 'status') continue;
      if (ruleApplies(r, { dep, emp: ev.emp, team: ev.team, city: ev.city, cont: ev.cont, role: ev.role, type: ev.type, international: ev.international, foreignToTeam: ev.foreignToTeam })) doc.compliance[dep.id][r.id] = fn(dep, r.id);
    }
  }
  for (const t of doc.teams) doc.round2.submissions[t.id] = { received: true, reference: `Form ${t.id}` };
  return doc;
}

/** The practice session's full sample: auction, allocations and compliance records. */
export function practiceDoc() {
  const doc = applyAuction(blankDoc(), PRACTICE_AUCTION);
  applyDeployments(doc, PRACTICE_DEPLOYMENTS);
  return applyCompliance(doc, (dep, ruleId) => practiceComplianceFor(dep, ruleId));
}

// ---------------- strategies (for the balance pass) ----------------

/** A deployment that satisfies the sample rules where it can: fair pay, the right package, training, partner. */
export function goodDeployment(ctx, team, emp, cityId, roleId, { months = 12, start = '2027-01' } = {}) {
  const city = ctx.cities.get(cityId);
  const eff = ctx.eff.get(cityId);
  const role = ctx.roles.get(roleId);
  const market = Math.round(emp.employment.expectedSalary * eff.attrs.labourCostMultiplier);
  const salary = Math.max(emp.employment.expectedSalary, emp.employment.minSalary, Math.round(market * 0.9 / 1e5) * 1e5 + 1e5);
  const foreign = city.continentId !== team.homeContinentId;
  const partnerCity = ['VES-FAI', 'VES-JUN'].includes(cityId) && foreign;
  const needs = PACKAGES[emp.employment.relocationNeeds || 'none'].rank;
  const pkg = needs >= 3 ? 'family' : 'standard';
  const leadership = role.id === 'regional-gm' && ['Senior', 'Executive'].includes(emp.seniority) && !(city.continentId === 'CAL' && emp.yearsExperience < 10);
  const typeId = leadership ? 'regional-leadership' : 'fixed-term';
  const mustTrain = emp.employment.trainingRequired || (city.continentId === 'SOL' && ['operations', 'supplyChain'].includes(role.function));
  const maxAbroad = emp.strategic?.risk?.kind === 'maxAbroadMonths' && city.continentId !== emp.origin ? emp.strategic.risk.months : null;
  return {
    employeeId: emp.id, cityId, roleId, assignmentTypeId: typeId, salary: { amount: salary, currency: 'base' },
    contractMonths: maxAbroad ? Math.min(months, maxAbroad) : months, startMonth: start, relocationPackage: pkg, trainingProvided: mustTrain,
    localPartner: partnerCity, officeArranged: !partnerCity, responsibility: role.name, businessUnit: 'Expansion', contribution: '', permitsObtained: '', notes: '',
  };
}

const earningRoles = (ctx) => [...ctx.roles.values()].filter((r) => r.mechanism !== 'none' && r.revenueFactor >= 0.6);
const supportRoles = (ctx) => [...ctx.roles.values()].filter((r) => r.mechanism === 'none' || r.revenueFactor < 0.6);
function bestRole(emp, roles) { return roles.map((r) => ({ r, f: capabilityFit(emp, r).value * (r.revenueFactor || 0.5) })).sort((a, b) => b.f - a.f)[0].r; }
function bestFitRole(emp, roles) { return roles.map((r) => ({ r, f: capabilityFit(emp, r).value })).sort((a, b) => b.f - a.f)[0].r; }

function rateOf(ctx, team, emp, cityId, roleId) {
  const d = goodDeployment(ctx, team, emp, cityId, roleId);
  const ev = evaluateDeployment(ctx, { id: 'x', teamId: team.id, ...d });
  return ev.valid ? ev.potentialRate : 0;
}

export function strategyPlan(doc, teamId, kind, rand = Math.random) {
  const ctx = buildContext(doc);
  const team = ctx.teamById[teamId];
  const emps = (ctx.roster[teamId] || []).map((id) => ctx.employees.get(id));
  const cities = [...ctx.cities.values()];
  const foreign = cities.filter((c) => c.continentId !== team.homeContinentId);
  const home = cities.filter((c) => c.continentId === team.homeContinentId);
  const ER = earningRoles(ctx); const SR = supportRoles(ctx);
  const earnerScore = (e) => Math.max(...ER.map((r) => capabilityFit(e, r).value * r.revenueFactor));
  const sorted = [...emps].sort((a, b) => earnerScore(b) - earnerScore(a));
  const plan = [];
  const put = (e, cityId, roleId) => plan.push(goodDeployment(ctx, team, e, cityId, roleId));
  if (kind === 'home') {
    for (const e of emps) { const r = bestRole(e, ER); const c = home.map((x) => ({ x, v: rateOf(ctx, team, e, x.id, r.id) })).sort((a, b) => b.v - a.v)[0].x; put(e, c.id, r.id); }
  } else if (kind === 'scattered') {
    for (const e of emps) { const c = foreign[Math.floor(rand() * foreign.length)]; put(e, c.id, bestRole(e, ER).id); }
  } else if (kind === 'random') {
    const all = [...ctx.roles.values()];
    for (const e of emps) { const c = cities[Math.floor(rand() * cities.length)]; put(e, c.id, all[Math.floor(rand() * all.length)].id); }
  } else {
    // pick the foreign continent where the team's top earners would earn most
    const conts = [...new Set(foreign.map((c) => c.continentId))];
    const score = (k) => sorted.slice(0, 3).reduce((s, e) => s + Math.max(...foreign.filter((c) => c.continentId === k).map((c) => rateOf(ctx, team, e, c.id, bestRole(e, ER).id))), 0);
    const k = conts.sort((a, b) => score(b) - score(a))[0];
    const kc = foreign.filter((c) => c.continentId === k);
    if (kind === 'concentrated') {
      const c = kc.map((x) => ({ x, v: sorted.slice(0, 3).reduce((s, e) => s + rateOf(ctx, team, e, x.id, bestRole(e, ER).id), 0) })).sort((a, b) => b.v - a.v)[0].x;
      for (const e of emps) put(e, c.id, bestRole(e, ER).id);
    } else if (kind === 'earners') {
      const used = {};
      for (const e of sorted) {
        const r = bestRole(e, ER);
        const c = kc.map((x) => ({ x, v: rateOf(ctx, team, e, x.id, r.id) * ((used[`${x.id}|${r.mechanism}`] || 0) ? 0.6 : 1) })).sort((a, b) => b.v - a.v)[0].x;
        used[`${c.id}|${r.mechanism}`] = (used[`${c.id}|${r.mechanism}`] || 0) + 1;
        put(e, c.id, r.id);
      }
    } else { // cluster: three earners, two specialists alongside them
      const used = {};
      const earners = sorted.slice(0, 3); const helpers = sorted.slice(3);
      let anchor = null;
      for (const e of earners) {
        const r = bestRole(e, ER);
        const c = kc.map((x) => ({ x, v: rateOf(ctx, team, e, x.id, r.id) * ((used[`${x.id}|${r.mechanism}`] || 0) ? 0.6 : 1) })).sort((a, b) => b.v - a.v)[0].x;
        used[`${c.id}|${r.mechanism}`] = (used[`${c.id}|${r.mechanism}`] || 0) + 1;
        anchor ||= c.id;
        put(e, c.id, r.id);
      }
      for (const e of helpers) put(e, anchor, bestFitRole(e, SR).id);
    }
  }
  return plan;
}

export const STRATEGIES = ['cluster', 'earners', 'concentrated', 'home', 'scattered', 'random'];
