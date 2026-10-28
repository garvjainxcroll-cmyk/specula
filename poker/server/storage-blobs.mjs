// Netlify Blobs adapter: strong consistency and conditional writes, so two requests can never
// both change the same document (the loser re-reads and tries again).
import { getStore } from '@netlify/blobs';

export function blobsStore(name = 'alea') {
  const s = getStore({ name, consistency: 'strong' });
  return {
    kind: 'blobs',
    async get(key) { return (await s.get(key, { type: 'json' })) ?? null; },
    async getMeta(key) {
      const r = await s.getWithMetadata(key, { type: 'json' });
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
      for await (const page of s.list({ prefix, paginate: true })) for (const b of page.blobs) out.push(b.key);
      return out.sort();
    },
  };
}
