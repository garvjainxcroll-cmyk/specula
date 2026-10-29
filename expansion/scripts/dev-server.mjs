// Local server: serves dist/ and runs the same /api/* code as Netlify, with a store saved
// to .data/dev-store-<port>.json. Usage: node scripts/dev-server.mjs [port]
// JACO_STORE=memory keeps everything in memory (used by the end-to-end tests).
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../server/api.mjs';
import { memoryStore } from '../server/storage-memory.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const port = Number(process.argv[2] || process.env.PORT || 8890);
const file = process.env.JACO_STORE === 'memory' ? null : join(root, '.data', `dev-store-${port}.json`);
const store = memoryStore({ file, kind: 'dev' });
const env = { SETUP_CODE: process.env.JACO_SETUP_CODE || '', TOKEN_SECRET: process.env.JACO_TOKEN_SECRET || '', TOKEN_HOURS: 12, PBKDF2_ITERATIONS: process.env.JACO_FAST_HASH === '1' ? 2000 : undefined };
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const headers = {
  'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname.startsWith('/api/')) {
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
    res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache', ...headers });
    res.end(data);
  } catch (e) {
    res.writeHead(500); res.end('Server error');
    console.error(e);
  }
}).listen(port, () => console.log(`JACO CORP Round 4 Control on http://localhost:${port}  (store: ${file || 'memory'})`));
