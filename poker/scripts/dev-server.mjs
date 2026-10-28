// The stand-alone Artha Vyūha server: serves dist/ and runs the same /api/* code as Netlify.
// On top of that it pushes changes to open tables instantly (Server-Sent Events at
// /api/stream?id=ROOM) and runs a background clock, so time-outs and practice bots happen on
// time even between requests. Use it for local play or to host Artha Vyūha on any Node service.
//
//   node scripts/dev-server.mjs [port]
//   PORT=8080 ARTHA_DATA_DIR=/data ARTHA_ADMIN_PASSWORD=... node scripts/dev-server.mjs
//   ARTHA_STORE=memory  → nothing saved to disk (tests)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, tickRoom, activeRooms } from '../server/api.mjs';
import { memoryStore } from '../server/storage-memory.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const port = Number(process.argv[2] || process.env.PORT || 8888);
const dataDir = process.env.ARTHA_DATA_DIR || join(root, '.data');
const file = process.env.ARTHA_STORE === 'memory' ? null : join(dataDir, `artha-store-${port}.json`);
const store = memoryStore({ file, kind: file ? 'file' : 'memory' });
const env = { ADMIN_PASSWORD: process.env.ARTHA_ADMIN_PASSWORD || '' };
// the same Content-Security-Policy as netlify.toml: scripts only from this site
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

// ---- live push ----
const subs = new Map(); // roomId → Set of open responses
function publish(id, v) {
  const set = subs.get(id);
  if (!set) return;
  for (const res of set) res.write(`data: ${JSON.stringify({ v })}\n\n`);
}
function stream(req, res, url) {
  const id = String(url.searchParams.get('id') || '').slice(0, 40);
  if (!id) { res.writeHead(400); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  res.write('retry: 2000\n\n');
  if (!subs.has(id)) subs.set(id, new Set());
  subs.get(id).add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(ping); subs.get(id)?.delete(res); if (!subs.get(id)?.size) subs.delete(id); });
}

// ---- background clock: every half second, bring live rooms up to date ----
let ticking = false;
setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    const ids = new Set([...subs.keys(), ...activeRooms()]);
    for (const id of ids) await tickRoom(store, id, { publish }).catch(() => null);
  } finally { ticking = false; }
}, 500).unref();

const opts = { publish, streaming: true, ipLimit: Number(process.env.ARTHA_IP_LIMIT || 1200) };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === '/api/stream') return stream(req, res, url);
    if (url.pathname.startsWith('/api/')) {
      if (process.env.ARTHA_API_DOWN === '1') { res.writeHead(503); res.end('down'); return; }
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const headers = { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress || 'local' };
      const r = await handle(new Request(url, { method: req.method, headers, body: req.method === 'GET' ? undefined : body }), store, env, opts);
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
    res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'content-security-policy': CSP });
    res.end(data);
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
}).listen(port, () => console.log(`Artha Vyūha on http://localhost:${port}  (store: ${file || 'memory'}; live push on)`));

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { store.flush?.(); process.exit(0); });
