// An in-memory store with the same interface as the Netlify Blobs adapter.
// Used by the tests and by the local dev server (optionally saved to a file).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function memoryStore({ file = null, kind = 'memory' } = {}) {
  let map = new Map();
  let n = 0;
  if (file && existsSync(file)) {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    map = new Map(Object.entries(raw.map));
    n = raw.n || 0;
  }
  const persist = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ n, map: Object.fromEntries(map) }));
  };
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  return {
    kind,
    async get(key) { const e = map.get(key); return e ? clone(e.data) : null; },
    async getMeta(key) { const e = map.get(key); return e ? { data: clone(e.data), etag: e.etag } : null; },
    async set(key, data, opts = {}) {
      const cur = map.get(key);
      if (opts.onlyIfNew && cur) return { modified: false };
      if (opts.onlyIfMatch && (!cur || cur.etag !== opts.onlyIfMatch)) return { modified: false };
      const etag = `"${++n}"`;
      map.set(key, { data: clone(data), etag });
      persist();
      return { modified: true, etag };
    },
    async del(key) { map.delete(key); persist(); },
    async list(prefix = '') { return [...map.keys()].filter((k) => k.startsWith(prefix)).sort(); },
    _map: map,
  };
}
