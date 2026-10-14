// An in-memory store with the same interface as the Netlify Blobs one. Used by the
// tests and the local server (which can save it to a file).
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
  let pending = null;
  const persist = () => {
    if (!file || pending) return;
    pending = setTimeout(() => {
      pending = null;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ n, map: Object.fromEntries(map) }));
    }, 200);
  };
  const clone = (x) => (x === undefined ? undefined : structuredClone(x));
  return {
    kind,
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
    _map: map,
  };
}
