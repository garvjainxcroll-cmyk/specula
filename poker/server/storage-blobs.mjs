// Netlify Blobs adapter: strong consistency and conditional writes, so two requests can never
// both change the same document (the loser re-reads and tries again).
//
// Every safe change needs the record's version tag (etag) from the read. Some Blobs servers do
// not send it on reads (Netlify's own local reference server, for one) — then a conditional
// write would silently become an ordinary one and two players could, say, take the same seat.
// So when a read has no tag, the tag is taken from the store's listing instead, checked before
// and after reading the data so the two are known to belong together. If they cannot be matched,
// getMeta throws rather than hand out a copy that could be written unprotected.
import { getStore } from '@netlify/blobs';

export function blobsStore(name = 'artha') {
  const s = getStore({ name, consistency: 'strong' });
  async function listedEtag(key) {
    for await (const page of s.list({ prefix: key, paginate: true })) {
      const b = page.blobs.find((x) => x.key === key);
      if (b) return b.etag || null;
    }
    return null;
  }
  return {
    kind: 'blobs',
    async get(key) { return (await s.get(key, { type: 'json' })) ?? null; },
    async getMeta(key) {
      const r = await s.getWithMetadata(key, { type: 'json' });
      if (!r) return null;
      if (r.etag) return { data: r.data, etag: r.etag };
      for (let k = 0; k < 6; k++) {
        const before = await listedEtag(key);
        const again = await s.getWithMetadata(key, { type: 'json' });
        const after = await listedEtag(key);
        if (!again) return null;
        if (again.etag) return { data: again.data, etag: again.etag };
        if (before && before === after) return { data: again.data, etag: before };
      }
      throw new Error(`Storage gave no version tag for ${key}: refusing an unprotected change`);
    },
    async set(key, data, opts = {}) {
      const o = {};
      if (opts.onlyIfNew) o.onlyIfNew = true;
      if (opts.onlyIfMatch) o.onlyIfMatch = opts.onlyIfMatch;
      if ('onlyIfMatch' in opts && !opts.onlyIfMatch) throw new Error(`No version tag for ${key}: refusing an unprotected change`);
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
