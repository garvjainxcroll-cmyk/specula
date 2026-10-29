// Netlify Blobs adapter: strong consistency and conditional writes, so two operators can
// never overwrite each other's change (the loser's write is refused and retried).
import { getStore } from '@netlify/blobs';

export function blobsStore(name = 'jaco-r4') {
  const s = getStore({ name, consistency: 'strong' });
  return {
    kind: 'blobs',
    async get(key) { return (await s.get(key, { type: 'json' })) ?? null; },
    async getMeta(key) {
      const r = await s.getWithMetadata(key, { type: 'json' });
      return r ? { data: r.data, etag: r.etag, metadata: r.metadata || {} } : null;
    },
    async head(key) {
      const r = await s.getMetadata(key);
      return r ? { etag: r.etag, metadata: r.metadata || {} } : null;
    },
    async set(key, data, opts = {}) {
      const o = {};
      if (opts.onlyIfNew) o.onlyIfNew = true;
      if (opts.onlyIfMatch) o.onlyIfMatch = opts.onlyIfMatch;
      if (opts.metadata) o.metadata = opts.metadata;
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
