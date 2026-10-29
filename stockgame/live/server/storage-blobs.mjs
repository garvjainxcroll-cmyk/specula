// Netlify Blobs adapter: strong consistency, conditional writes for safe teamwork.
import { getStore } from '@netlify/blobs';

// A read that fails (a brief Blobs hiccup) is tried twice more. Writes are not retried here:
// a conditional write that half-succeeded must go back through the caller's read-check-write.
async function retry(fn) {
  for (let k = 0; ; k++) {
    try { return await fn(); } catch (e) { if (k >= 2) throw e; await new Promise((r) => setTimeout(r, 150 * (k + 1) ** 2)); }
  }
}

export function blobsStore(name = 'jaco-stock-game') {
  const s = getStore({ name, consistency: 'strong' });
  return {
    kind: 'blobs',
    async get(key) { return (await retry(() => s.get(key, { type: 'json' }))) ?? null; },
    async getMeta(key) {
      const r = await retry(() => s.getWithMetadata(key, { type: 'json' }));
      return r ? { data: r.data, etag: r.etag } : null;
    },
    async set(key, data, opts = {}) {
      const o = {};
      if (opts.onlyIfNew) o.onlyIfNew = true;
      if (opts.onlyIfMatch) o.onlyIfMatch = opts.onlyIfMatch;
      const r = await s.setJSON(key, data, o);
      return { modified: r?.modified !== false, etag: r?.etag };
    },
    async del(key) { await s.delete(key); },
    async list(prefix = '') {
      const out = [];
      await retry(async () => { out.length = 0; for await (const page of s.list({ prefix, paginate: true })) for (const b of page.blobs) out.push(b.key); });
      return out.sort();
    },
  };
}
