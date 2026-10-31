// Netlify Blobs adapter: strong consistency, conditional writes for safe teamwork.
//
// Make a new blobsStore() for every request (netlify/functions/store.mjs does): Netlify gives
// each request its own short-lived Blobs token, and a store kept between requests fails with
// "Netlify Blobs has generated an internal error (401 status code)" once its token expires.
import { getStore } from '@netlify/blobs';

const msg = (e) => String(e?.message || e || '');
// a brief hiccup at Netlify or on the network: worth trying the same read again
const isTransient = (e) => /\b(50[0-4]|429)\b|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed/i.test(msg(e)) && !/\b40[13]\b/.test(msg(e));

// Reads are tried twice more after a hiccup. Writes are not retried here: a conditional write
// that may have half-succeeded must go back through the caller's read-check-write loop.
async function retry(fn) {
  for (let k = 0; ; k++) {
    try { return await fn(); } catch (e) {
      if (k >= 2 || !isTransient(e)) throw e;
      await new Promise((r) => setTimeout(r, 150 * (k + 1) ** 2));
    }
  }
}

export function blobsStore(name = 'specula') {
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
      return retry(async () => {
        const out = [];
        for await (const page of s.list({ prefix, paginate: true })) for (const b of page.blobs) out.push(b.key);
        return out.sort();
      });
    },
  };
}
