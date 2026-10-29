// The capability model. Capability scores are inputs (1–100, from the CV). This module
// turns them into weighted indices and role fit; it never produces money. The financial
// model (round2.mjs) decides what a capability is worth in a given destination.

import { TECH_KEYS, SOFT_KEYS, INVERTED_INDICES, CAP_LABELS } from './model.mjs';
import { clamp, r1, sum } from './money.mjs';

/** Scores derived from the CV's facts, on the same 0–100 scale. */
export function derivedScores(e) {
  return {
    experience: clamp((Math.min(Number(e.yearsExperience) || 0, 25) / 25) * 100, 0, 100),
    intlExperience: clamp((Math.min((e.internationalAssignments || []).length, 4) / 4) * 100, 0, 100),
    languages: clamp((Math.min((e.languages || []).length, 4) / 4) * 100, 0, 100),
  };
}

export function capValue(e, key) {
  if (TECH_KEYS.includes(key)) return Number(e.technical?.[key]) || 0;
  if (SOFT_KEYS.includes(key)) return Number(e.soft?.[key]) || 0;
  const d = derivedScores(e);
  if (key in d) return d[key];
  throw new Error(`Unknown capability "${key}"`);
}

/** Weighted average of capability scores; weights are normalised so they sum to 1. */
export function weighted(e, weights) {
  const entries = Object.entries(weights || {}).filter(([, w]) => Number(w) > 0);
  const wsum = sum(entries.map(([, w]) => Number(w)));
  if (!wsum) return { value: 0, terms: [] };
  const terms = entries.map(([key, w]) => {
    const score = capValue(e, key);
    const weight = Number(w) / wsum;
    return { key, label: CAP_LABELS[key] || key, weight, score, contribution: weight * score };
  });
  return { value: sum(terms.map((t) => t.contribution)), terms };
}

/** The capability indices of one employee (administrator-weighted). */
export function indicesOf(e, cfgIndices) {
  const out = {};
  for (const [name, w] of Object.entries(cfgIndices || {})) {
    const v = weighted(e, w).value;
    out[name] = r1(INVERTED_INDICES.includes(name) ? 100 - v : v);
  }
  return out;
}

/** How well the employee's capabilities match a role, 0–100 (destination-independent). */
export const capabilityFit = (e, role) => weighted(e, role.weights);

/** Every role, best fit first (ties by role order). */
export function roleFits(e, roles) {
  return roles.map((r, i) => ({ roleId: r.id, name: r.name, fit: r1(capabilityFit(e, r).value), i }))
    .sort((a, b) => (b.fit - a.fit) || (a.i - b.i));
}

export const techAverage = (e) => sum(TECH_KEYS.map((k) => capValue(e, k))) / TECH_KEYS.length;

/**
 * Cross-cultural adjustment of an employee for one continent, 0–100: the weighted
 * cross-cultural index plus any regional compatibility points stated on the CV.
 */
export function crossCulturalFor(e, cfgIndices, continentId) {
  const base = weighted(e, cfgIndices.crossCultural).value;
  const compat = Number(e.strategic?.regionalCompatibility?.[continentId]) || 0;
  return { base, compat, value: clamp(base + compat, 0, 100) };
}
