// Shared by every export: where the figures come from, redaction, names and formatting.
//
// Round 2 figures always come from a stored result:
//   source=final  the latest finalised (official) result, rebuilt from its saved inputs
//   source=draft  the stored draft calculation, which must still match the current inputs
// Either way the rebuilt result is checked against the stored fingerprint, so an export can
// never disagree with what the database holds.

import { rebuild, officialCompute, resultsFingerprint } from '../results.mjs';
import { inputHash } from '../../src/engine/hash.mjs';
import { fmtMoney, fmtCompact, fmtPct, fmtNum } from '../../src/engine/money.mjs';
import { redact } from '../view.mjs';
import { refuse } from '../validators.mjs';
import { periodLabel, ymLabel } from '../../src/engine/months.mjs';
import { computeAll } from '../../src/engine/index.mjs';

export function resolveSource(doc, wanted) {
  const finals = doc.finals || [];
  const last = finals.at(-1) || null;
  const draft = doc.calc?.draft || null;
  const want = wanted || (last && doc.round2.status === 'finalised' ? 'final' : draft ? 'draft' : last ? 'final' : null);
  if (want === 'final') {
    if (!last) refuse('NO_FINAL', 'Round 2 has not been finalised yet. Export the draft calculation instead.');
    const { res, ok } = rebuild(last);
    if (!ok) refuse('INTEGRITY', `The official result (version ${last.version}) could not be reproduced exactly from its stored inputs, so it will not be exported. Model version stored: ${last.modelVersion}.`);
    return { kind: 'final', label: `OFFICIAL RESULT · version ${last.version} · finalised ${stamp(last.at)} by ${last.by}${last.reopened ? ` · reopened ${stamp(last.reopened.at)} for correction` : ''}`, draft: false, res, inputs: last.inputs, version: last.version, at: last.at };
  }
  if (want === 'draft') {
    if (!draft) refuse('NO_CALC', 'No calculation has been run yet. Run the calculation first.');
    if (draft.inputHash !== inputHash(doc)) refuse('OUTDATED', 'The inputs have changed since the last calculation. Run the calculation again before exporting.');
    const res = officialCompute(doc);
    if (resultsFingerprint(res) !== draft.resultsHash) refuse('INTEGRITY', 'The stored draft calculation does not match a fresh calculation of the same inputs. Run the calculation again.');
    return { kind: 'draft', label: `DRAFT CALCULATION · run ${stamp(draft.at)} by ${draft.by} · not official`, draft: true, res, inputs: doc, at: draft.at };
  }
  refuse('NO_CALC', 'No calculation has been run yet. Run the calculation first.');
}

/** Current data (for Round 1, CV and configuration exports): no calculation needed. */
export function currentSource(doc) {
  const res = computeAll(doc);
  return { kind: 'current', label: doc.round1.status === 'locked' ? `Round 1 locked ${stamp(doc.round1.lockedAt)} by ${doc.round1.lockedBy}` : 'Round 1 not yet locked: provisional', draft: doc.round1.status !== 'locked', res, inputs: doc };
}

/** Hidden information never leaves in an export: report settings always, operator settings for non-super users. */
export function redacted(inputs, res, actor) {
  const d = structuredClone(inputs); const r = structuredClone(res);
  if (actor.role !== 'super') redact(d, r, d.config, 'operators');
  redact(d, r, d.config, 'reports');
  return { d, r };
}

export function stamp(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  return `${t.toISOString().slice(0, 10)} ${t.toISOString().slice(11, 16)} UTC`;
}

export function helpers(d) {
  const cur = d.config.currency;
  const teams = Object.fromEntries(d.teams.map((t) => [t.id, t]));
  const emps = Object.fromEntries(d.employees.map((e) => [e.id, e]));
  const cities = Object.fromEntries(d.cities.map((c) => [c.id, c]));
  const conts = Object.fromEntries(d.continents.map((c) => [c.id, c]));
  const roles = Object.fromEntries(d.config.roles.map((r) => [r.id, r]));
  const types = Object.fromEntries(d.config.assignmentTypes.map((t) => [t.id, t]));
  return {
    cur, teams, emps, cities, conts, roles, types,
    m: (x) => fmtMoney(x, cur), mc: (x) => fmtCompact(x, cur), pct: (x, dp = 1) => fmtPct(x, dp), num: fmtNum,
    major: (x) => (x === null || x === undefined ? null : x / (cur.minor || 100)),
    team: (id) => teams[id]?.label || id, emp: (id) => (emps[id] ? `${id} ${emps[id].name}` : id),
    city: (id) => cities[id]?.name || id, cont: (id) => conts[id]?.name || id,
    role: (id) => roles[id]?.name || id, type: (id) => types[id]?.name || id,
    period: periodLabel(d.config.period), ym: ymLabel,
  };
}

export const fileTag = (src) => (src.kind === 'final' ? `official-v${src.version}` : src.kind === 'draft' ? 'DRAFT' : 'current');
