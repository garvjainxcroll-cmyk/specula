// Netlify Blobs storage: strong consistency and conditional writes, so two people
// trading at the same moment can never overwrite each other. A warm function keeps the
// last copy it read and asks Netlify only "has it changed?" (an ETag check), which keeps
// the every-second price checks cheap.
import { getStore } from '@netlify/blobs';

export function blobsStore(name = 'market') {
  const s = getStore({ name, consistency: 'strong' });
  const cache = new Map();
  return {
    kind: 'blobs',
    async getMeta(key) {
      const c = cache.get(key);
      const r = await s.getWithMetadata(key, { type: 'json', ...(c ? { etag: c.etag } : {}) });
      if (!r) { cache.delete(key); return null; }
      if (r.data === null && c && (!r.etag || r.etag === c.etag)) return { data: c.data, etag: c.etag };
      cache.set(key, { data: r.data, etag: r.etag });
      return { data: r.data, etag: r.etag };
    },
    async set(key, data, opts = {}) {
      const o = {};
      if (opts.onlyIfNew) o.onlyIfNew = true;
      if (opts.onlyIfMatch) o.onlyIfMatch = opts.onlyIfMatch;
      const r = await s.setJSON(key, data, o);
      // A conditional write reports "modified" for any answer but 412, so without an
      // ETag the caller confirms the write by reading it back (server/api.mjs).
      const modified = r?.modified !== false;
      if (modified && r?.etag) cache.set(key, { data, etag: r.etag }); else cache.delete(key);
      return { modified, etag: r?.etag || '' };
    },
    async del(key) { cache.delete(key); await s.delete(key); },
  };
}
