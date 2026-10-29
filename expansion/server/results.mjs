// Stored results. A calculation stores a compact summary plus a fingerprint of the full
// result; a finalised result also stores a copy of every input. Because the engine is
// deterministic, any report can be rebuilt from those inputs and checked against the
// fingerprint, so exports always reconcile with the official stored result.

import { computeAll } from '../src/engine/index.mjs';
import { inputHash, stableStringify, fingerprint } from '../src/engine/hash.mjs';

const INPUT_KEYS = ['config', 'standardProfile', 'revenueModels', 'teams', 'continents', 'cities', 'employees', 'rules', 'auction', 'round1', 'round2', 'deployments', 'compliance', 'depSeq', 'configRev', 'id', 'name', 'mode', 'notice', 'sampleData'];

export function snapshotInputs(doc) {
  const out = {};
  for (const k of INPUT_KEYS) if (doc[k] !== undefined) out[k] = structuredClone(doc[k]);
  return out;
}

/** The results as they stand once a calculation is recorded for these inputs. */
export function officialCompute(doc) {
  const h = inputHash(doc);
  return computeAll({ ...doc, calc: { draft: { inputHash: h } } });
}

export const resultsFingerprint = (res) => fingerprint(stableStringify(res, new Set()));

/** Rebuild a stored result from its inputs and prove it is unchanged. */
export function rebuild(source) {
  const res = officialCompute(source.inputs);
  const ok = resultsFingerprint(res) === source.resultsHash;
  return { res, ok };
}

export function summarise(res) {
  const teams = {};
  for (const [id, t] of Object.entries(res.round2.teams)) {
    const { effectivenessByEmployee, ...metrics } = t.metrics;
    teams[id] = { statement: t.statement, metrics, byContinent: t.byContinent, byCity: t.byCity, byFunction: t.byFunction, byEmployee: t.byEmployee, analysis: t.analysis };
  }
  const deployments = {};
  for (const [id, d] of Object.entries(res.deployments)) {
    deployments[id] = d.valid
      ? { teamId: d.teamId, employeeId: d.employeeId, cityId: d.cityId, roleId: d.roleId, typeId: d.typeId, operational: d.operational, productivity: d.productivity.value, roleSuitability: d.productivity.roleSuitability, opportunity: d.opportunity.score, revenue: d.result.revenue, costs: d.result.costs, contribution: d.result.contribution, blockers: d.compliance.blockers, compliance: d.compliance.counts }
      : { teamId: d.teamId, employeeId: d.employeeId, valid: false };
  }
  return {
    modelVersion: res.modelVersion, inputHash: res.inputHash,
    ranking: res.ranking, round1: res.round1.teams, teams, deployments,
    validation: { blocking: res.validation.blocking, warnings: res.validation.warnings },
  };
}
