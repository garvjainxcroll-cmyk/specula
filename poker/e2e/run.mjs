// End-to-end browser test: the Event Head opens a table, two players in separate browsers
// sit down and play each other, the Big Screen watches, a player loses their connection and
// comes back, a player leaves with their chips, the chip audit balances, and a tournament is
// registered and started. Run: npm run e2e  (builds first). Screenshots: test-results/.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const name of ['playwright', '@playwright/test']) { try { return require(name); } catch { /* next */ } }
  try { const g = execSync('npm root -g').toString().trim(); return createRequire(join(g, 'noop.js'))('playwright'); } catch { /* none */ }
  throw new Error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
}
const { chromium } = loadPlaywright();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = join(root, 'test-results');
mkdirSync(shots, { recursive: true });
const PORT = 8897;
const base = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['scripts/dev-server.mjs', String(PORT)], { cwd: root, env: { ...process.env, ARTHA_STORE: 'memory' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ok   ${msg}`); else { failures++; console.log(`  FAIL ${msg}`); } };

async function waitFor(fn, ms = 15000, step = 250) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(step); }
  return null;
}

async function main() {
  await waitFor(async () => { try { return (await fetch(`${base}/api/health`)).ok; } catch { return false; } });
  const browser = await chromium.launch();
  const errors = [];
  const newPage = async (name, viewport = { width: 1366, height: 860 }) => {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
    return { ctx, page };
  };

  console.log('Event Head opens a table');
  const { page: host } = await newPage('host');
  await host.goto(`${base}/#/host`);
  await host.fill('input[type=password]', 'event-head-2026');
  await host.click('button:has-text("Set the password")');
  await host.click('.hosttabs button:has-text("New game")');
  await host.fill('input[name=tname]', 'Main Table');
  await host.click('button:has-text("Open the table")');
  const code = await waitFor(async () => (await host.$('.roomcard .mono'))?.textContent());
  ok(!!code, `table open with code ${code}`);
  await host.screenshot({ path: join(shots, '01-host-tables.png') });

  console.log('Two players sit down');
  const players = [];
  for (const name of ['Asha', 'Bilal']) {
    const { page, ctx } = await newPage(name, name === 'Bilal' ? { width: 390, height: 844 } : undefined);
    await page.goto(`${base}/#/lobby`);
    await page.click('button:has-text("Join by code")');
    await page.fill('.sheet input', code);
    await page.click('.sheet button:has-text("Open the table")');
    await page.waitForSelector('.sitbtn:not(.ghost)');
    await page.click('.sitbtn:not(.ghost)');
    await page.fill('input[placeholder="Your name at the table"]', name);
    await page.click('button:has-text("Play as guest")');
    await page.click('.sheet button:has-text("Sit down")'); // the seat dialog follows straight on
    await page.waitForSelector('.seat.you');
    players.push({ name, page, ctx });
  }
  ok(players.length === 2, 'both seated');

  console.log('Big Screen watches');
  const { page: screen } = await newPage('screen', { width: 1920, height: 1080 });
  await screen.goto(`${base}/#/screen/${code}`);
  await screen.waitForSelector('.bigscreen .seat .plate');

  console.log('They play');
  let actions = 0; let raised = false; let sawHidden = true; let hands = new Set();
  for (let k = 0; k < 240 && actions < 24; k++) {
    for (const p of players) {
      const panel = await p.page.$('.actions.yours');
      if (!panel) continue;
      const handNo = await p.page.$eval('.ttop .meta', (e) => e.textContent);
      hands.add(handNo);
      if (!raised && (await p.page.$('.sizes button:not([disabled])'))) {
        await p.page.click('.sizes button:has-text("Pot")');
        await p.page.click('.mainbtns .btn:not(.fold):not(.callb)');
        raised = true;
      } else {
        await p.page.click('.mainbtns .btn.callb');
      }
      actions++;
      await sleep(250);
      // while a hand is being played, the Big Screen shows no face-up hole cards
      const live = await screen.$eval('.bigscreen .street', (e) => e.textContent).catch(() => '');
      if (/Pre-flop|Flop|Turn|River/.test(live)) {
        const faces = await screen.$$eval('.bigscreen .seat .cards .pcard:not(.back)', (els) => els.length);
        if (faces > 0) sawHidden = false;
      }
    }
    await sleep(300);
  }
  ok(actions >= 10, `${actions} actions played`);
  ok(raised, 'a pot-size raise from the preset button');
  ok(sawHidden, 'the Big Screen never showed hole cards during a hand');
  await players[0].page.screenshot({ path: join(shots, '02-player-desktop.png') });
  await players[1].page.screenshot({ path: join(shots, '03-player-phone.png'), fullPage: true });
  await screen.screenshot({ path: join(shots, '04-big-screen.png') });

  console.log('Asha loses her connection and comes back');
  await players[0].ctx.setOffline(true);
  await sleep(4000);
  const banner = await players[0].page.$('.offline');
  ok(!!banner, 'the red “connection lost” bar appears');
  await players[0].ctx.setOffline(false);
  const back = await waitFor(async () => !(await players[0].page.$('.offline')), 15000);
  ok(!!back, 'the bar goes away by itself');
  ok(!!(await waitFor(() => players[0].page.$('.seat.you'))), 'her seat and cards are still there');

  console.log('Bilal leaves the table with his chips');
  const before = await players[1].page.evaluate(async () => (await (await fetch('/api/me', { headers: { authorization: `Bearer ${JSON.parse(localStorage.getItem('artha-token'))}` } })).json()).me.bankroll);
  await players[1].page.click('button:has-text("Leave table")');
  await players[1].page.click('.sheet button:has-text("Yes")');
  const after = await waitFor(async () => {
    // Bilal's hand folds when his turn comes; Asha keeps playing meanwhile
    const mine = await players[0].page.$('.actions.yours .btn.callb');
    if (mine) await mine.click().catch(() => null);
    const r = await players[1].page.evaluate(async () => (await (await fetch('/api/me', { headers: { authorization: `Bearer ${JSON.parse(localStorage.getItem('artha-token'))}` } })).json()).me);
    return Object.keys(r.at).length === 0 ? r.bankroll : null;
  }, 30000, 1000);
  ok(after !== null && after > before, `chips back in his account (${before} → ${after})`);

  console.log('The chip audit');
  await host.click('.hosttabs button:has-text("Chip audit")');
  await host.waitForSelector('.okline');
  const marks = await host.$$eval('.okline .mark', (els) => els.map((e) => e.textContent));
  ok(marks.length === 4 && marks.every((m) => m === 'Balanced'), `audit: ${marks.join(', ')}`);
  await host.screenshot({ path: join(shots, '05-host-audit.png') });

  console.log('A tournament');
  await host.click('.hosttabs button:has-text("New game")');
  await host.click('.seg button:has-text("Tournament")');
  await host.fill('#hn', 'Evening Cup');
  await host.fill('#hb', '3');
  await host.click('button:has-text("Create the tournament")');
  await host.waitForSelector('.roomcard');
  const tcode = await host.$$eval('.roomcard', (cards) => cards.find((c) => c.textContent.includes('Evening Cup'))?.querySelector('.mono')?.textContent);
  ok(!!tcode, `tournament code ${tcode}`);
  const asha = players[0].page;
  await asha.goto(`${base}/#/lobby`);
  await asha.waitForSelector('text=Evening Cup');
  await asha.click('button:has-text("Register")');
  await asha.waitForURL(/#\/t\//);
  await asha.waitForSelector('.tclock');
  const cards = await host.$$('.roomcard');
  for (const c of cards) if ((await c.textContent()).includes('Evening Cup')) { await (await c.$('button:has-text("Manage")')).click(); break; }
  await host.click('.sheet button:has-text("Start the tournament")');
  const seated = await waitFor(() => asha.$('.seat.you'), 20000);
  ok(!!seated, 'Asha is seated when the Event Head starts the tournament');
  await sleep(2500);
  await asha.screenshot({ path: join(shots, '06-tournament.png') });
  await host.screenshot({ path: join(shots, '07-host-tournament.png') });

  console.log('The Server check');
  const { page: check } = await newPage('check', { width: 390, height: 844 });
  await check.goto(`${base}/#/status`);
  await check.waitForSelector('textarea', { timeout: 20000 });
  const statusMarks = await check.$$eval('.okline .mark', (els) => els.map((e) => e.textContent));
  const titles = await check.$$eval('.okline b', (els) => els.map((e) => e.textContent));
  ok(titles.includes('The game server answers') && titles.includes('Storage works') && !statusMarks.includes('Problem'), `server check: ${titles.map((t, i) => `${statusMarks[i]} ${t}`).join(', ')}`);
  await check.screenshot({ path: join(shots, '08-server-check.png') });

  ok(errors.length === 0, `no errors in the pages${errors.length ? `: ${errors.slice(0, 5).join(' | ')}` : ''}`);
  await browser.close();
}

main().catch((e) => { failures++; console.error(e); }).finally(() => {
  server.kill();
  if (failures) { console.log(`\n${failures} check(s) failed.`); if (/Error/.test(serverLog)) console.log(serverLog.slice(-3000)); process.exit(1); }
  console.log('\nAll end-to-end checks passed.');
});
