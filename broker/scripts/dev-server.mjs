// Local server: serves dist/ and runs the same /api/* code as Netlify, with the game saved
// to .data/store-<port>.json. Usage: node scripts/dev-server.mjs [port]
// It also works for a game on one Wi-Fi network: open http://<this computer's address>:<port>.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from '../server/api.mjs';
import { memoryStore } from '../server/storage-memory.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const port = Number(process.argv[2] || process.env.PORT || 8888);
const file = process.env.MARKET_STORE === 'memory' ? null : join(root, '.data', `store-${port}.json`);
const store = memoryStore({ file, kind: 'local' });
const env = { HOST_PASSWORD: process.env.HOST_PASSWORD || '' };
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

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
    res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(port, () => console.log(`Market server on http://localhost:${port}  (host console: http://localhost:${port}/#/host; store: ${file || 'memory'})`));
