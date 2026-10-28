// An in-memory store with the same interface as the Netlify Blobs adapter (conditional writes
// included). Used by the tests, the local dev server and the stand-alone Node server; with a
// file it is saved to disk (at most once a second) and loaded again on restart.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

export function memoryStore({ file = null, kind = 'memory' } = {}) {
  let map = new Map();
  let n = 0;
  if (file && existsSync(file)) {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    map = new Map(Object.entries(raw.map));
    n = raw.n || 0;
  }
  let timer = null;
  const flush = () => {
    timer = null;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify({ n, map: Object.fromEntries(map) }));
    renameSync(`${file}.tmp`, file);
  };
  const persist = () => { if (file && !timer) timer = setTimeout(flush, 1000); };
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
    flush() { if (timer) { clearTimeout(timer); flush(); } },
    _map: map,
  };
}
