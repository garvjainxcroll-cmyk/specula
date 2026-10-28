// End-to-end run of the stock game in a real browser: the Event Head desk releases news
// and prices, a team types the codes, trades, and sends its report code back to the desk.
//
//   node stockgame/build.mjs && node stockgame/e2e.mjs [screenshot-folder]
//
// Needs the built pages (and so the secret data) and Playwright's Chromium.
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { pricePaths, fmtPrice } from './src/engine.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const shots = process.argv[2];
if (shots) mkdirSync(shots, { recursive: true });

// Serve each page inside the same skeleton the artifact viewer wraps it in.
const wrap = (f) => `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${readFileSync(join(here, 'dist', f), 'utf8')}</body></html>`;
const server = createServer((req, res) => {
  const f = req.url.startsWith('/desk') ? 'desk.html' : 'market.html';
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(wrap(f));
}).listen(0);
const base = `http://localhost:${server.address().port}`;

let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++; };
const errors = [];

// Expected prices come from the secret data, so no price move is written into this public file.
const game = JSON.parse(readFileSync(join(here, 'secret', 'game.json'), 'utf8'));
const TK = game.stocks.map((s) => s.t);
const PATHS = pricePaths(game.stocks, game.updates.map((u) => u.moves.map((m) => [TK.indexOf(m.t), m.pct])));
const riser = TK.indexOf(game.updates[0].moves.find((m) => m.pct > 0).t);   // a stock update 01 lifts
const faller = TK.indexOf(game.updates[0].moves.find((m) => m.pct < 0).t);  // a stock update 01 drops
const limitAt = ((PATHS[faller][1] + 1) / 100).toFixed(2);                   // just above its new price

const browser = await chromium.launch();
const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const teamCtx = await browser.newContext({ viewport: { width: 1366, height: 860 }, colorScheme: 'dark' });
const desk = await deskCtx.newPage();
const team = await teamCtx.newPage();
for (const p of [desk, team]) p.on('pageerror', (e) => errors.push(e.message)).on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });

await desk.goto(`${base}/desk#control`);
await team.goto(`${base}/market`);
const shot = async (page, name) => { if (shots) await page.screenshot({ path: join(shots, name + '.png'), fullPage: false }); };
const deskCode = async () => (await desk.locator('.code-big').first().textContent()).trim();
const typeCode = async (c) => {
  await team.click('#codeBtn');
  await team.fill('#cIn', c);
  await team.click('#cGo');
  await team.waitForSelector('#cIn', { state: 'detached', timeout: 15000 }).catch(() => {});
};
const cash = async () => team.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('markets:')))).book.cash);

// opening state
await shot(team, 'team-onboarding');
check(await team.locator('#oName').isVisible(), 'team sees the account opening sheet');
await team.fill('#oName', 'Alpha Capital');
await team.click('#oF button[type=submit], .sheet-foot button[form=oF]');
check((await team.textContent('#teamName')) === 'Alpha Capital', 'team account opened');
check((await cash()) === 100000000, 'opening balance is ₹10,00,000');
await shot(desk, 'desk-start');

// 1. news 01
await desk.click('#goNext');
const n1 = await deskCode();
check(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(n1), `desk shows news code ${n1}`);
await typeCode('ABCD-EFGH');
// a wrong code is refused inside the sheet
check((await team.textContent('#cErr')).includes('opened nothing new'), 'a wrong code is refused');
await team.click('#cX');
await typeCode(n1);
check((await team.textContent('#main')).includes(game.updates[0].head), 'news 01 unlocked in the team app');

// trade at the opening prices: buy 100 of a riser at market, rest a limit buy for a faller
await team.goto(`${base}/market#stock-${TK[riser]}`);
await team.click('#main .quote [data-buy]');
await team.fill('#oq', '100');
await team.click('#oGo');
check((await cash()) === 100000000 - 100 * PATHS[riser][0], `bought 100 ${TK[riser]} at the opening price`);
await team.evaluate((t) => { location.hash = 'stock-' + t; }, TK[faller]);
await team.click('#main .quote [data-buy]');
await team.check('input[value=LMT]');
await team.fill('#oq', '50');
await team.fill('#op', limitAt);
await team.click('#oGo');
await team.goto(`${base}/market#orders`);
check((await team.textContent('#main')).includes('Open orders (1)'), 'limit order rests');
await shot(team, 'team-orders');

// 2. prices 01
await desk.click('#goNext');
const p1 = await deskCode();
check(p1 !== n1, `desk shows price code ${p1}`);
await typeCode(p1);
const moved = await team.locator(`#wl .row[data-k="${riser}"] .ltp`).textContent();
check(moved.includes(fmtPrice(PATHS[riser][1])), `${TK[riser]} moved to the sheet's price after update 01`);
check((await team.textContent('#main')).includes('Open orders (0)'), `the ${TK[faller]} limit filled when update 01 dropped the price below it`);

// 3. news 02 then prices 02, but the team trades at old prices after the price code is out
await desk.click('#goNext');
const n2 = await deskCode();
await typeCode(n2);
await desk.click('#goNext');
await team.waitForTimeout(1500); // the trade lands clearly after the price code went out
await team.goto(`${base}/market#stock-${TK[riser]}`);
await team.click('#main .quote [data-sell]');
await team.fill('#oq', '10');
await team.click('#oGo');
const p2 = await deskCode();
await typeCode(p2);

// 4. round pace: the rest of round 1 in one click each
await desk.click('[data-mode=round]');
check((await desk.textContent('.next .what')).includes('updates 03–05'), 'whole-round pace offers news 03–05');
await desk.click('#goNext');
const n5 = await deskCode();
await desk.click('#goNext');
const p5 = await deskCode();
// the team missed both: the latest price code alone opens everything
await typeCode(p5);
const st = await team.evaluate(() => document.querySelector('#session').textContent);
check(st.includes('News 05/45') && st.includes('Prices 05/45'), `one price code caught the team up: ${st}`);
check(n5 !== p5, 'news and price codes differ');

// 5. big screen in a second window of the desk follows the desk
const screen = await deskCtx.newPage();
screen.on('pageerror', (e) => errors.push(e.message));
await screen.goto(`${base}/desk#screen`);
check((await screen.textContent('#screen')).includes(p5), 'big screen shows the current code');
await desk.click('[data-mode=update]');
await desk.click('#goNext');
const n6 = await deskCode();
await screen.waitForFunction((c) => document.querySelector('#screen').textContent.includes(c), n6, { timeout: 5000 }).catch(() => {});
check((await screen.textContent('#screen')).includes(n6), 'big screen updated itself when the desk released news 06');
await shot(screen, 'big-screen-news');

// 6. report code back to the desk
await typeCode(n6);
await team.goto(`${base}/market#funds`);
const rpt = await team.inputValue('#rptOut');
const teamValue = (await team.textContent('.framed .stat .v')).trim();
await shot(team, 'team-funds');
await desk.goto(`${base}/desk#teams`);
await desk.fill('#grace', '0');
await desk.dispatchEvent('#grace', 'change');
await desk.fill('#rpt', rpt);
await desk.click('#chk');
const out = await desk.textContent('#chkOut');
check(out.includes('Alpha Capital'), 'desk decoded the report');
check(out.includes('Voided trades') && out.includes('old prices'), 'the sell at old prices after the price code was voided');
await desk.click('#keep');
check((await desk.textContent('#page')).includes('Standings (1)'), 'team saved to standings');
await desk.fill('#grace', '600');
await desk.dispatchEvent('#grace', 'change');
await desk.fill('#rpt', rpt);
await desk.click('#chk');
const again = await desk.textContent('#chkOut');
check(again.includes(teamValue) && again.includes('Every trade checks out'), `with a long grace nothing is voided and the desk value matches the team's own (${teamValue})`);
await desk.click('[data-rev=all]');
await screen.waitForTimeout(400);
check((await screen.textContent('#screen')).includes('Alpha Capital'), 'big screen reveals the standings');
await shot(screen, 'big-screen-standings');

// 7. tampering is refused
await desk.fill('#rpt', rpt.slice(0, -3) + (rpt.endsWith('A') ? 'BBB' : 'AAA'));
await desk.click('#chk');
check((await desk.textContent('#chkOut')).match(/changed|damaged/), 'an edited report code is refused');

// 8. restore on another device
const team2 = await (await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', isMobile: true, hasTouch: true })).newPage();
team2.on('pageerror', (e) => errors.push(e.message));
await team2.goto(`${base}/market`);
await team2.click('#oRestore');
// the trades go up to prices 05, so the phone needs the latest price code (shown as "missed the last price code?")
await team2.click('#rCode');
await team2.fill('#cIn', p5);
await team2.click('#cGo');
await team2.waitForSelector('#rptIn', { timeout: 15000 });
await team2.fill('#rptIn', rpt);
await team2.click('#restore');
const restored = await team2.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('markets:')))));
const original = await team.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith('markets:')))));
check(restored.team === 'Alpha Capital' && restored.book.trades.length === original.book.trades.length && restored.book.cash === original.book.cash && !(await team2.$('#rptIn')),
  `account restored on a phone from the report code (${restored.book.trades.length} trades, same cash)`);
await shot(team2, 'team-phone-watchlist');
await team2.goto(`${base}/market#stock-GRVT`);
await shot(team2, 'team-phone-stock');
const overflow = await team2.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(overflow <= 0, `no sideways scroll at phone width (${overflow}px)`);

// 9. pages at phone width: desk too
const deskPhone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await deskPhone.goto(`${base}/desk#control`);
const o2 = await deskPhone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(o2 <= 0, `desk has no sideways scroll at phone width (${o2}px)`);

await team.goto(`${base}/market#dashboard`);
await shot(team, 'team-dashboard');
await desk.goto(`${base}/desk#control`);
await shot(desk, 'desk-control');
await desk.goto(`${base}/desk#matrix`);
await shot(desk, 'desk-matrix');

check(errors.length === 0, `no script errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
