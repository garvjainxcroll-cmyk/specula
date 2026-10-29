// Netlify gives every function call its own short-lived Blobs token. A store made once and
// kept between calls keeps the first call's token, and once it expires every read and write
// fails with "Netlify Blobs has generated an internal error (401 …)". These tests stand in for
// Netlify: a tiny Blobs server accepts only the newest token, and each call gets a new one.
// Both functions (SPECULA's and the stock game's) must pass. Skipped where @netlify/blobs is
// not installed (run `npm install` here, and in stockgame/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const installed = (dir) => { try { createRequire(join(root, dir, 'package.json')).resolve('@netlify/blobs'); return true; } catch { return false; } };

async function fakeBlobs() {
  let current = 'token-1';
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(req.headers.authorization);
    if (req.headers.authorization !== `Bearer ${current}`) { res.writeHead(401); res.end('token expired'); return; }
    res.writeHead(404); res.end(); // every key is empty: enough for a first poll
  }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const url = `http://localhost:${server.address().port}`;
  const call = (token) => {
    current = token; // Netlify hands this call a fresh token; the old one no longer works
    globalThis.netlifyBlobsContext = Buffer.from(JSON.stringify({ siteID: 'site-1', token, edgeURL: url, uncachedEdgeURL: url })).toString('base64');
  };
  return { server, call, seen };
}

for (const [name, dir, fn, path] of [
  ['the stock game', 'stockgame', 'stockgame/live/netlify/functions/api.mjs', 'poll'],
  ['SPECULA', '.', 'netlify/functions/store.mjs', 'poll'],
]) {
  test(`${name}: each call uses that call's Blobs token, so an expired token never sticks`, { skip: !installed(dir) && `@netlify/blobs is not installed for ${dir}` }, async () => {
    const { server, call, seen } = await fakeBlobs();
    try {
      const handler = (await import(join(root, fn))).default;
      for (const token of ['token-1', 'token-2', 'token-3']) {
        call(token);
        const r = await handler(new Request(`https://site.example/api/${path}`));
        assert.equal(r.status, 200, `call with ${token}: ${await r.text()}`);
      }
      assert.ok(seen.includes('Bearer token-3'), 'the last call used the newest token');
    } finally {
      server.close();
      delete globalThis.netlifyBlobsContext;
    }
  });
}
