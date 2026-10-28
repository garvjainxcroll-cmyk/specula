// Local server for the live stock game: serves live/dist and runs the same /api/* code as
// Netlify, with a store kept in memory (or in a file with STORE_FILE=...).
// Usage: node live/build.mjs && node live/dev-server.mjs [port]
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from './server/api.mjs';
import { memoryStore } from './server/storage-memory.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const port = Number(process.argv[2] || process.env.PORT || 8899);
const store = memoryStore({ file: process.env.STORE_FILE || null, kind: 'dev' });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: req.method === 'GET' ? undefined : body }), store);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let f = join(dist, normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(dist)) { res.writeHead(403); res.end(); return; }
    try { if ((await stat(f)).isDirectory()) f = join(f, 'index.html'); } catch { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(await readFile(f));
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(port, () => console.log(`Live stock game on http://localhost:${port}  (teams /, Event Head /desk, big screen /screen)`));
