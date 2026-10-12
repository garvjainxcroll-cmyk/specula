// Local server: serves dist/ and runs the same /api/* code as Netlify, with a store
// saved to .data/dev-store.json. Usage: node scripts/dev-server.mjs [port]
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../server/api.mjs';
import { memoryStore } from '../server/storage-memory.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const port = Number(process.argv[2] || process.env.PORT || 8888);
const file = process.env.SPECULA_STORE === 'memory' ? null : join(root, '.data', `dev-store-${port}.json`);
const store = memoryStore({ file, kind: 'dev' });
const env = { ADMIN_PASSWORD: process.env.SPECULA_ADMIN_PASSWORD || '' };
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname.startsWith('/api/')) {
      if (process.env.SPECULA_API_DOWN === '1') { res.writeHead(503); res.end('down'); return; }
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: req.method === 'GET' ? undefined : body }), store, env);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p.endsWith('/')) p += 'index.html';
    let f = join(dist, p);
    if (!f.startsWith(dist)) { res.writeHead(403); res.end(); return; }
    try { if ((await stat(f)).isDirectory()) f = join(f, 'index.html'); } catch { f = join(dist, 'index.html'); }
    const data = await readFile(f);
    res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(port, () => console.log(`SPECULA dev server on http://localhost:${port}  (store: ${file || 'memory'})`));
