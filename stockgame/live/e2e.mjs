// End-to-end run of the LIVE game in a real browser, against the same server code Netlify runs:
// the Event Head signs in with the game key, teams join with the PIN, news and prices reach
// every screen by themselves, teams buy, sell and short, and the standings are revealed.
//
//   node stockgame/live/build.mjs && node stockgame/live/e2e.mjs [screenshot-folder]
//
// Needs the game key (stockgame/secret/live-key.txt) and Playwright's Chromium.
import http from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { handle } from './server/api.mjs';
import { memoryStore } from './server/storage-memory.mjs';
import { openSealed } from './server/sealing.mjs';
import SEALED from './server/game-sealed.mjs';
import { pricePaths, fmtPrice } from '../src/engine.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2];
if (shots) mkdirSync(shots, { recursive: true });
const KEY = readFileSync(join(here, '..', 'secret', 'live-key.txt'), 'utf8').trim();
const game = await openSealed(KEY, SEALED);
const TK = game.stocks.map((s) => s.t);
const PATHS = pricePaths(game.stocks, game.updates.map((u) => u.moves.map((m) => [TK.indexOf(m.t), m.pct])));
const riser = TK.indexOf(game.updates[0].moves.find((m) => m.pct > 0).t);
const faller = TK.indexOf(game.updates[0].moves.find((m) => m.pct < 0).t);

const store = memoryStore();
const dist = join(here, 'dist');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: req.method === 'GET' ? undefined : Buffer.concat(chunks) }), store);
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
  }
  let f = join(dist, normalize(url.pathname));
  try { if ((await stat(f)).isDirectory()) f = join(f, 'index.html'); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(await readFile(f));
}).listen(0);
const base = `http://localhost:${server.address().port}`;

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; };
const errors = [];
const browser = await chromium.launch();
const open = async (path, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, colorScheme: 'dark', ...opts });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await p.goto(base + path);
  return p;
};
const shot = async (p, name) => { if (shots) await p.screenshot({ path: join(shots, name + '.png') }); };
const until = async (p, fn, arg, what) => {
  const ok = await p.waitForFunction(fn, arg, { timeout: 12000 }).then(() => true).catch(() => false);
  check(ok, what);
};
const teamState = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('jaco-live:team')));

// the home page shows the three desks; the Event Head signs in from it
const desk = await open('/');
await until(desk, () => ['Team desk', 'Event Head desk', 'Big screen'].every((t) => document.body.textContent.includes(t)), null, 'home shows the team desk, the Event Head desk and the big screen');
await shot(desk, 'live-home');
await desk.fill('#gkey', 'WRONG-KEY');
await desk.click('#hGo');
await until(desk, () => document.querySelector('#hErr')?.textContent.includes('wrong'), null, 'a wrong game key is refused');
await desk.fill('#gkey', KEY.toLowerCase());
await desk.click('#hGo');
await until(desk, () => location.pathname === '/desk/' && document.querySelector('#goNext'), null, 'signing in on the home page opens the Event Head desk');
const pin = await desk.evaluate(() => document.querySelector('.code-big')?.textContent.trim());
check(/^\d{4}$/.test(pin), `the desk shows a 4-digit join PIN (${pin})`);
const screen = await open('/screen', { viewport: { width: 1440, height: 900 } });
await until(screen, (pin) => document.querySelector('#screen').textContent.includes(pin), pin, 'the big screen shows the PIN without signing in');
await shot(screen, 'live-screen-join');

// two teams join (one from the home page, one on the team desk); a teammate signs in with the team code
const alpha = await open('/');
await alpha.fill('#pin', '0000'); await alpha.fill('#tname', 'Alpha Capital'); await alpha.click('#tGo');
await until(alpha, () => document.querySelector('#tErr')?.textContent.includes('PIN'), null, 'a wrong PIN is refused');
await alpha.fill('#pin', pin); await alpha.click('#tGo');
await until(alpha, () => location.pathname === '/team/' && document.querySelector('#teamName')?.textContent === 'Alpha Capital', null, 'Alpha joined from the home page and landed on its team desk');
const alphaCode = (await teamState(alpha)).code;
const beta = await open('/team/', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'light' });
await beta.fill('#oPin', pin); await beta.fill('#oName', 'Beta Bears'); await beta.click('#oGo2');
await until(beta, () => JSON.parse(localStorage.getItem('jaco-live:team') || '{}').team === 'Beta Bears', null, 'Beta joined on a phone');
const alpha2 = await open('/', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await shot(alpha2, 'live-home-phone');
await alpha2.click('[data-tm=code]'); await alpha2.fill('#tcode', alphaCode); await alpha2.click('#tGo');
await alpha2.waitForURL('**/team/**');
await until(alpha2, () => JSON.parse(localStorage.getItem('jaco-live:team') || '{}').team === 'Alpha Capital', null, 'a teammate signed in with the team code');
await shot(alpha, 'live-team-waiting');

// the market is closed until news goes out
await alpha.goto(`${base}/team/#stock-${TK[riser]}`);
await alpha.click('#main .quote [data-buy]');
check(await alpha.locator('#oGo').isDisabled(), 'orders cannot be placed while the market is closed');
await alpha.click('#oX');

// news 01: every screen gets it without typing anything; the market opens
await desk.click('#goNext');
await until(alpha, (h) => document.body.textContent.includes(h), game.updates[0].head, 'news 01 reached the team by itself');
await until(screen, (h) => document.querySelector('#screen').textContent.includes(h), game.updates[0].head, 'news 01 is on the big screen');
await until(alpha, () => document.querySelector('#mkt')?.textContent.startsWith('Market open'), null, 'the team sees the market open with a countdown');
await shot(screen, 'live-screen-news');

// Alpha buys the riser; Beta shorts the riser (a bad bet) and buys the faller (another)
const order = async (p, k, side, qty, extra) => {
  await p.evaluate((t) => { location.hash = 'stock-' + t; }, TK[k]);
  await p.click(`#main .quote [data-${side === 'B' ? 'buy' : 'sell'}]`);
  if (extra) await extra(p);
  await p.fill('#oq', String(qty));
  await p.click('#oGo');
  await p.waitForSelector('#oq', { state: 'detached', timeout: 8000 }).catch(() => {});
};
await order(alpha, riser, 'B', 100);
await order(beta, riser, 'S', 40);
await order(beta, faller, 'B', 30);
// Alpha also rests a limit buy for the faller just above its next price
await order(alpha, faller, 'B', 50, async (p) => { await p.check('input[value=LMT]'); await p.fill('#op', ((PATHS[faller][1] + 1) / 100).toFixed(2)); });
const a1 = await teamState(alpha), b1 = await teamState(beta);
check(a1.book.holdings[riser]?.qty === 100 && a1.book.orders.some((o) => o.status === 'OPEN'), 'Alpha bought 100 and has a limit order waiting');
check(b1.book.holdings[riser]?.qty === -40 && b1.book.holdings[faller]?.qty === 30, 'Beta is short 40 and long 30');
await until(alpha2, (k) => JSON.parse(localStorage.getItem('jaco-live:team')).book.holdings[k]?.qty === 100, riser, "the teammate's phone shows the same position");
await alpha.goto(`${base}/team/#holdings`);
await shot(alpha, 'live-team-positions');

// prices move: confirm closing the window early; the limit fills; trading stops
await desk.click('#goNext');
await desk.click('#stepYes');
await until(alpha, (px) => document.querySelector('#wl').textContent.includes(px), fmtPrice(PATHS[riser][1]), 'the new price reached the team by itself');
await until(alpha, () => document.querySelector('#mkt')?.textContent === 'Market closed', null, 'moving prices closed the market');
const a2 = await teamState(alpha);
check(a2.book.orders.every((o) => o.status !== 'OPEN') && a2.book.holdings[faller]?.qty === 50, 'the limit order filled at the new price');
await alpha.goto(`${base}/team/#stock-${TK[riser]}`);
await alpha.click('#main .quote [data-sell]');
check(await alpha.locator('#oGo').isDisabled(), 'no trading at the new prices until the market reopens');
await alpha.click('#oX');

// the desk's standings match the official prices
const cap = game.capital * 100;
const alphaValue = cap + 100 * (PATHS[riser][1] - PATHS[riser][0]);
const betaValue = cap - 40 * (PATHS[riser][1] - PATHS[riser][0]) + 30 * (PATHS[faller][1] - PATHS[faller][0]);
await desk.goto(`${base}/desk#teams`);
await until(desk, () => document.querySelectorAll('#page tbody tr').length === 2, null, 'the desk lists both teams');
const rows = await desk.evaluate(() => [...document.querySelectorAll('#page tbody tr')].map((r) => r.textContent));
const rup = (v) => '₹' + Math.round(v / 100).toLocaleString('en-IN');
check(rows[0].includes('Alpha Capital') && rows[0].includes(rup(alphaValue)), `Alpha leads at ${rup(alphaValue)}`);
check(rows[1].includes('Beta Bears') && rows[1].includes(rup(betaValue)), `Beta's short lost money: ${rup(betaValue)}`);
await shot(desk, 'live-desk-teams');

// reveal from last place
await desk.click('[data-show=leaders]');
await desk.click('[data-rev="1"]');
await until(screen, () => document.querySelector('#screen').textContent.includes('Beta Bears') && !document.querySelector('#screen').textContent.includes('Alpha Capital'), null, 'the big screen reveals last place first');
const halfway = await (await fetch(`${base}/api/poll`)).text();
check(halfway.includes(String(betaValue)) && !halfway.includes(String(alphaValue)) && !halfway.includes('Alpha Capital'), 'public feed: only the revealed places carry a name and value');
await desk.click('[data-rev=all]');
await until(screen, () => document.querySelector('#screen').textContent.includes('Alpha Capital'), null, 'then the leader');
await shot(screen, 'live-screen-standings');

// the public feed never carries a story ahead of time, a reason, or a team's money
const pub = await (await fetch(`${base}/api/poll`)).text() + await (await fetch(`${base}/api/news?from=0`)).text();
check(!pub.includes(game.updates[1].head) && !pub.includes(game.updates[0].moves[0].why), 'public feed: no unreleased story, no reasons');

await desk.goto(`${base}/desk#control`);
await shot(desk, 'live-desk-control');
await beta.goto(`${base}/team/#holdings`);
await shot(beta, 'live-team-phone');
const o = await beta.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(o <= 0, `no sideways scroll on the phone (${o}px)`);
check(errors.length === 0, `no script errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
