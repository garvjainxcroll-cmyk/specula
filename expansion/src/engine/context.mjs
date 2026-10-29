// Builds the lookup tables every calculation uses, from one session document.

import { effectiveCity } from './regions.mjs';
import { fmtMoney } from './money.mjs';

/** The team's business profile. With "identical resources" every team shares the standard
 *  profile's numbers and model; only the name, headquarters and existing presence differ. */
export function profileOf(doc, team) {
  const own = team.profile || {};
  if (!doc.config?.identicalResources) return { ...own, existingPresence: own.existingPresence || [] };
  return {
    ...(doc.standardProfile || {}),
    companyName: own.companyName,
    hqCityId: own.hqCityId,
    existingPresence: own.existingPresence || [],
    modifiers: own.modifiers || doc.standardProfile?.modifiers || '',
  };
}

/** Who hired whom: only confirmed sales count. */
export function rosterOf(doc) {
  const teams = Object.fromEntries((doc.teams || []).map((t) => [t.id, []]));
  const ownerOf = {};
  const recs = [...(doc.auction?.records || [])].sort((a, b) => (a.order - b.order) || String(a.employeeId).localeCompare(String(b.employeeId)));
  for (const r of recs) {
    if (r.status === 'sold' && r.confirmed && r.winningTeamId && teams[r.winningTeamId]) {
      teams[r.winningTeamId].push(r.employeeId);
      ownerOf[r.employeeId] = r.winningTeamId;
    }
  }
  return { teams, ownerOf };
}

export function buildContext(doc) {
  const cfg = doc.config;
  const cur = cfg.currency;
  const continents = new Map((doc.continents || []).map((c) => [c.id, c]));
  const cities = new Map((doc.cities || []).map((c) => [c.id, c]));
  const eff = new Map();
  for (const c of doc.cities || []) {
    const k = continents.get(c.continentId);
    if (k) eff.set(c.id, effectiveCity(c, k));
  }
  const teams = doc.teams || [];
  const { teams: roster, ownerOf } = rosterOf(doc);
  return {
    doc, cfg, cur, period: cfg.period, P: cfg.period.months,
    fmt: (m) => fmtMoney(m, cur),
    continents, cities, eff,
    employees: new Map((doc.employees || []).map((e) => [e.id, e])),
    roles: new Map((cfg.roles || []).map((r) => [r.id, r])),
    types: new Map((cfg.assignmentTypes || []).map((t) => [t.id, t])),
    models: new Map((doc.revenueModels || []).map((m) => [m.id, m])),
    teams, teamById: Object.fromEntries(teams.map((t) => [t.id, t])),
    profiles: Object.fromEntries(teams.map((t) => [t.id, profileOf(doc, t)])),
    rules: (doc.rules || []).filter((r) => r.approved),
    roster, ownerOf,
    auctionById: new Map((doc.auction?.records || []).map((r) => [r.employeeId, r])),
  };
}
