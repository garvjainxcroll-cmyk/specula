// Deterministic fingerprints of the material inputs, used to tell whether a stored
// calculation is still current. Notes, timestamps and record revision counters are left
// out: changing a note does not make a calculation outdated; changing any number does.

const VOLATILE = new Set(['rev', 'at', 'by', 'byName', 'notes', 'note', 'history', 'bidLog', 'confirmedAt', 'confirmedBy', 'lockedAt', 'lockedBy', 'receivedAt', 'reference', 'updatedAt', 'updatedBy', 'createdAt', 'createdBy', 'description', 'sample', 'contribution', 'responsibility', 'businessUnit', 'permitsObtained']);

export function stableStringify(x, skip = VOLATILE) {
  if (x === null || typeof x !== 'object') return JSON.stringify(x === undefined ? null : x);
  if (Array.isArray(x)) return `[${x.map((v) => stableStringify(v, skip)).join(',')}]`;
  const keys = Object.keys(x).filter((k) => !skip.has(k) && x[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(x[k], skip)}`).join(',')}}`;
}

/** cyrb53-style 53-bit string hash, twice with different seeds → 26 hex characters. */
function h53(str, seed) {
  let h1 = 0xdeadbeef ^ seed; let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
export const fingerprint = (str) => h53(str, 1) + h53(str, 7);

/** The parts of a session that the calculation depends on. */
export function materialInputs(doc) {
  return {
    config: doc.config, standardProfile: doc.standardProfile, teams: doc.teams, revenueModels: doc.revenueModels,
    continents: doc.continents, cities: doc.cities, employees: doc.employees, rules: doc.rules,
    auction: (doc.auction?.records || []).map((r) => ({ e: r.employeeId, s: r.status, t: r.winningTeamId || null, b: r.winningBid ?? null, c: !!r.confirmed, x: r.resolution?.kind || null })),
    round1: doc.round1?.status || 'open',
    deployments: doc.deployments, compliance: doc.compliance,
    submissions: Object.fromEntries(Object.entries(doc.round2?.submissions || {}).map(([k, v]) => [k, !!v?.received])),
  };
}

export const inputHash = (doc) => fingerprint(stableStringify(materialInputs(doc)));
