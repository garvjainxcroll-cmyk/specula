// "Netlify Blobs has generated an internal error (401)".
//
// On Netlify, every function call is handed its own short-lived Blobs token (through the
// Blobs context). A store opened once and kept between calls keeps the first call's token;
// when that token expires every read and write is refused with 401. These tests stand in
// for Netlify with a small Blobs edge server that accepts only the newest token and gives
// each call a new one, then play real requests through the real function.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

function fakeBlobsEdge() {
  let current = null;
  const blobs = new Map(); let n = 0;
  const refused = [];
  const flaky = { reads: 0 }; // fail this many GETs with a 503, as a brief Netlify hiccup would
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && flaky.reads > 0) { flaky.reads--; res.writeHead(503); res.end('busy'); return; }
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${current}`) { refused.push(auth); res.writeHead(401); res.end('token expired'); return; }
    const url = new URL(req.url, 'http://x');
    const parts = url.pathname.split('/').slice(1).map(decodeURIComponent); // site, store, ...key
    const store = parts[1]; const key = parts.slice(2).join('/');
    const id = `${store}/${key}`;
    const body = await new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c).toString())); });
    if (!key) { // list
      const prefix = url.searchParams.get('prefix') || '';
      const list = [...blobs.keys()].filter((k) => k.startsWith(`${store}/${prefix}`)).map((k) => ({ key: k.slice(store.length + 1), etag: blobs.get(k).etag, last_modified: new Date().toISOString(), size: 1 }));
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ blobs: list, directories: [] })); return;
    }
    const cur = blobs.get(id);
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (!cur) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { etag: cur.etag }); res.end(req.method === 'HEAD' ? undefined : cur.body); return;
    }
    if (req.method === 'PUT') {
      if (req.headers['if-none-match'] === '*' && cur) { res.writeHead(412); res.end(); return; }
      if (req.headers['if-match'] && (!cur || cur.etag !== req.headers['if-match'])) { res.writeHead(412); res.end(); return; }
      const etag = `"e${++n}"`;
      blobs.set(id, { body, etag });
      res.writeHead(200, { etag }); res.end(); return;
    }
    if (req.method === 'DELETE') { blobs.delete(id); res.writeHead(204); res.end(); return; }
    res.writeHead(405); res.end();
  }).listen(0);
  const ready = new Promise((r) => server.once('listening', r));
  /** Netlify starts a new call: a fresh token, and the old one stops working. */
  const newCall = (token) => {
    current = token;
    const url = `http://localhost:${server.address().port}`;
    globalThis.netlifyBlobsContext = Buffer.from(JSON.stringify({ siteID: 'site-1', token, edgeURL: url, uncachedEdgeURL: url })).toString('base64');
  };
  return { server, ready, newCall, refused, blobs, flaky };
}

test('every call uses its own Blobs token, so an expired token never breaks the game', async () => {
  const edge = fakeBlobsEdge();
  await edge.ready;
  const saved = { ...process.env };
  for (const k of ['BLOBS_SITE_ID', 'NETLIFY_SITE_ID', 'SITE_ID', 'BLOBS_TOKEN', 'NETLIFY_BLOBS_TOKEN', 'NETLIFY_AUTH_TOKEN', 'NETLIFY_API_TOKEN', 'SPECULA_ADMIN_PASSWORD']) delete process.env[k];
  try {
    const handler = (await import('../netlify/functions/store.mjs')).default;
    let k = 0;
    const call = async (method, path, body) => {
      edge.newCall(`token-${++k}`);
      const r = await handler(new Request(`https://site.example/api/${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }));
      const text = await r.text();
      assert.notEqual(r.status, 500, `${method} ${path} with token-${k}: ${text}`);
      assert.ok(!/internal error|401/i.test(text), `${method} ${path} with token-${k}: ${text}`);
      return JSON.parse(text);
    };
    const health = await call('GET', 'health');
    assert.equal(health.ok, true);
    assert.equal((await call('POST', 'admin', { action: 'setup', password: 'hall-pass-26' })).ok, true);
    assert.equal((await call('POST', 'admin', { action: 'login', password: 'hall-pass-26' })).ok, true);
    const poll1 = await call('GET', 'poll');
    assert.equal(poll1.ok, true);
    // the same server instance, many calls later, still reads and writes
    for (let i = 0; i < 5; i++) assert.equal((await call('GET', 'poll')).ok, true);
    assert.ok(edge.blobs.size > 0, 'the game wrote to storage');
    assert.deepEqual(edge.refused, [], 'no call used an expired token');
    // a brief hiccup (two 503s on reads) is retried instead of failing the request
    edge.flaky.reads = 2;
    assert.equal((await call('GET', 'poll')).ok, true);
    assert.equal(edge.flaky.reads, 0);
  } finally {
    edge.server.close();
    delete globalThis.netlifyBlobsContext;
    Object.assign(process.env, saved);
  }
});
