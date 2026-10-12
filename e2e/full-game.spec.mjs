// End to end: 8 funds (two with two members each) play all 24 quarters through the real
// screens. Every crisis is released from the Event Head console, the auction runs, phone
// size is used throughout, reconnection and late orders are checked, the admin page is
// reloaded mid-settlement, and the Big Screen's final standings must equal an
// engine-only replay. Zero console errors.
import { test, expect } from '@playwright/test';
import { newGame, openQuarter, fireStage, settleQuarter, finalRelease, stagesFor } from '../src/engine/game.mjs';
import { SCRIPT } from '../server/script.mjs';
import { fmtNum } from '../src/engine/num.mjs';

const PASS = 'hall-pass-2026';
const FUNDS = ['Alpha Capital', 'Bull Run', 'Copia Partners', 'Delta Macro', 'Eagle Eye', 'Fortuna Fund', 'Granary Traders', 'Helios Rates'];
const PHONE = { width: 390, height: 844 };
const LAPTOP = { width: 1366, height: 900 };
const QUARTERS = Number(process.env.E2E_QUARTERS || 24);
const RECONNECT_Q = 5; const LATE_Q = 7; const RELOAD_Q = 9; const AUCTION_Q = 21;
const PICKS = ['AUREQ', 'AUR10Y', 'KESEQ', 'OIL', 'GOLD', 'AURFUT', 'DINAR', 'VER10Y', 'CALEQ', 'WHEAT', 'BANKCDS', 'FEAR', 'KESCDS', 'ORA', 'NORENERGY', 'AURHY', 'CROWN', 'SAR2Y', 'COPPER', 'AURIL10'];

test.describe.configure({ mode: 'serial' });

test(`8 funds play ${QUARTERS} quarters through the real screens`, async ({ browser, baseURL }) => {
  test.setTimeout(80 * 60 * 1000);
  const errors = [];
  const offlineAllowed = new Set();
  const watch = (page, label) => {
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (offlineAllowed.has(label) && /ERR_INTERNET_DISCONNECTED|Failed to load resource|net::/.test(t)) return;
      errors.push(`${label}: ${t}`);
    });
    page.on('pageerror', (e) => errors.push(`${label}: PAGEERROR ${e.message}`));
    page.on('dialog', (d) => d.accept());
  };

  // ---- the Event Head sets up ----
  const adminCtx = await browser.newContext({ viewport: LAPTOP });
  let admin = await adminCtx.newPage(); watch(admin, 'admin');
  await admin.goto('/#/admin');
  await admin.fill('#admin-pass', PASS); await admin.fill('#admin-pass2', PASS); await admin.click('#admin-go');
  await expect(admin.locator('text=Fund codes')).toBeVisible();
  await admin.fill('#fund-names', FUNDS.join('\n'));
  await admin.click('#btn-save-funds');
  await expect(admin.locator(`tr[data-fund="${FUNDS[7]}"] [data-code]`)).not.toHaveText('—');
  const codes = {};
  for (const f of FUNDS) codes[f] = (await admin.locator(`tr[data-fund="${f}"] [data-code]`).textContent()).trim();

  // ---- the Big Screen ----
  const bigCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const big = await bigCtx.newPage(); watch(big, 'display');
  await big.goto('/#/display');

  // ---- ten team members join, some on phones ----
  const members = [];
  for (let i = 0; i < FUNDS.length; i++) {
    const n = i < 2 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const phone = i % 3 === 0 || k === 1;
      const ctx = await browser.newContext({ viewport: phone ? PHONE : LAPTOP, isMobile: phone, hasTouch: phone });
      const page = await ctx.newPage();
      const label = `${FUNDS[i]}#${k + 1}`; watch(page, label);
      await page.goto('/#/desk');
      await page.fill('#join-code', codes[FUNDS[i]].toLowerCase());
      await page.fill('#join-name', `Member ${k + 1}`);
      await page.click('#join-go');
      await expect(page.locator('[data-phase="lobby"]')).toBeVisible();
      members.push({ fund: FUNDS[i], idx: i, k, ctx, page, phone, label });
    }
  }
  await expect(big.locator('text=Funds · 8')).toBeVisible();
  await admin.click('#btn-start');

  const primary = members.filter((m) => m.k === 0);

  for (let q = 1; q <= QUARTERS; q++) {
    // ---- data drop ----
    await expect(admin.locator('#btn-open')).toBeVisible({ timeout: 30000 });
    await expect(big.locator('[data-phase="data"]')).toBeVisible();
    for (const m of members) await expect(m.page.locator('[data-phase="data"]')).toBeVisible();
    if (q === LATE_Q) await admin.selectOption('#win-secs', '60');
    await admin.click('#btn-open');
    for (const m of members) await waitOpen(m);

    // ---- everyone trades and forecasts ----
    for (const m of primary) {
      const inst = PICKS[(m.idx * 3 + q) % PICKS.length];
      const side = (m.idx + q) % 3 === 0 ? 'sell' : 'buy';
      const amt = 40 + 20 * ((m.idx + q) % 5);
      await trade(m, inst, side, amt);
      await forecast(m, fmtNum(3 + m.idx * 0.5 + (q % 4) * 0.25, 2));
    }
    // the second members of two funds trade too: the desk is shared
    for (const m of members.filter((x) => x.k === 1)) await trade(m, 'GOLD', 'buy', 10);
    // a reckless fund loads up on Kesh before the run on the dinar
    if (q === 13) await trade(primary[3], 'KESEQ', 'buy', 900);

    if (q === RECONNECT_Q) await reconnect(members[2]);

    if (q === AUCTION_Q) {
      for (const [m, mult, amt] of [[primary[0], 0.98, 120], [primary[4], 1.03, 250], [primary[6], 0.9, 80]]) await bid(m, mult, amt);
    }

    // ---- crises: released from the console, seen on every screen ----
    const stageIds = await admin.locator('[data-stage]').evaluateAll((els) => els.map((e) => e.dataset.stage));
    for (const id of stageIds) {
      await admin.click(`[data-fire="${id}"]`);
      await expect(admin.locator(`.stage.fired[data-stage="${id}"]`)).toBeVisible({ timeout: 20000 });
      await expect(big.locator('.takeover')).toBeVisible();
      for (const m of members) {
        await expect(m.page.locator('.takeover')).toBeVisible();
        await m.page.click('.takeover .btn');
        await expect(m.page.locator(`.crisis-banner[data-stage="${id}"]`)).toBeVisible();
      }
      // some funds react: cut their biggest position after the shock
      for (const m of primary.filter((x) => (x.idx + q) % 2 === 0)) await closeBiggest(m);
    }

    // ---- the bell ----
    if (q === LATE_Q) {
      const m = primary[5];
      await openTicket(m, 'OIL');
      await expect(m.page.locator('.clock')).toHaveText(/BELL|SETTLED/, { timeout: 90000 });
      await m.page.waitForTimeout(2500);
      await m.page.fill('[data-amount="OIL"]', '25');
      await m.page.click('[data-go="OIL"]', { force: true });
      await expect(m.page.locator('.toast').last()).toContainText(/Late orders are refused|window is closed/);
      await m.page.keyboard.press('Escape');
      // the console settles by itself at zero
    } else if (q === RELOAD_Q) {
      await admin.click('#btn-bell');
      await admin.reload();
      await admin.waitForTimeout(500);
      if (await admin.locator('#btn-finish').isVisible()) await admin.click('#btn-finish');
    } else {
      await admin.click('#btn-bell');
    }
    await expect(admin.locator(q < 24 ? '#btn-next' : '#btn-final')).toBeVisible({ timeout: 60000 });
    await expect(big.locator('[data-phase="results"]')).toBeVisible();
    // results reach every desk
    for (const m of primary) {
      if (m.phone) await m.page.click('[data-tab="results"]');
      await expect(m.page.locator(`text=Results · Q${q}`)).toBeVisible({ timeout: 20000 });
    }
    // phone screens never scroll sideways
    for (const m of members.filter((x) => x.phone).slice(0, 2)) {
      const wide = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(wide, `${m.label} scrolls sideways at Q${q}`).toBeLessThanOrEqual(1);
    }
    if (q < QUARTERS) await admin.click('#btn-next');
  }

  if (QUARTERS === 24) {
    await admin.click('#btn-final');
    await expect(big.locator('[data-phase="final"]')).toBeVisible({ timeout: 30000 });
    await expect(big.getByText('Final standings · SPECULA Score')).toBeVisible();

    // ---- the Big Screen equals an engine-only replay ----
    const exp = await (await fetch(`${baseURL}/api/admin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: PASS, action: 'export' }) })).json();
    const state = exp.data.state;
    let w = newGame(state.teams.map((t) => ({ id: t.id, name: t.name })), SCRIPT);
    for (let q = 1; q <= 24; q++) {
      w = openQuarter(w, SCRIPT, q);
      for (const s of stagesFor(SCRIPT, q)) w = fireStage(w, SCRIPT, s.id).world;
      const orders = {}; const forecasts = {}; const bids = {};
      for (const t of state.teams) {
        const d = exp.data[`orders/${q}/${t.id}`];
        orders[t.id] = (d?.orders || []).map((o) => ({ inst: o.inst, delta: o.delta, epoch: o.epoch }));
        forecasts[t.id] = d?.forecast?.value ?? null;
        if (d?.bid) bids[t.id] = d.bid;
      }
      w = settleQuarter(w, SCRIPT, { orders, forecasts, bids }).world;
    }
    w = finalRelease(w, SCRIPT);
    const replay = w.final.standings.rows;
    const server = exp.data['pub/final'].standings.rows;
    expect(server.map((r) => [r.id, r.rank, r.nav, r.total])).toEqual(replay.map((r) => [r.id, r.rank, r.nav, r.total]));
    // what the hall sees
    const shown = await big.locator('.bigscreen').innerText();
    for (const r of replay) {
      expect(shown).toContain(r.name);
      expect(shown).toContain(fmtNum(r.total, 1));
    }
    const podium = await big.locator('.huge').allInnerTexts();
    expect(podium.slice(0, 3)).toEqual(['1', '2', '3']);
    // the desk shows the same final score
    const m0 = primary[0];
    if (m0.phone) await m0.page.click('[data-tab="score"]');
    await expect(m0.page.getByText('Final standings', { exact: true })).toBeVisible({ timeout: 20000 });
    // the debrief draws
    await admin.click('text=Debrief');
    await expect(admin.locator('text=What happened and why')).toBeVisible();
    await expect(admin.locator('text=Every fund’s value')).toBeVisible();
    await admin.screenshot({ path: 'test-results/debrief.png', fullPage: true });
    await big.screenshot({ path: 'test-results/bigscreen-final.png' });
  }
  await members[0].page.screenshot({ path: 'test-results/desk-phone.png', fullPage: true });
  await members[2].page.screenshot({ path: 'test-results/desk-laptop.png', fullPage: true });

  expect(errors, errors.join('\n')).toEqual([]);

  // ---------------- helpers ----------------
  async function waitOpen(m) {
    await expect(m.page.locator('.clock')).toHaveText(/^\d+:\d\d/, { timeout: 20000 });
  }
  async function dismiss(m) {
    const t = m.page.locator('.takeover .btn');
    if (await t.count()) await t.first().click();
  }
  async function openTicket(m, inst) {
    const p = m.page;
    await dismiss(m);
    if (m.phone) await p.click('[data-tab="market"]');
    const fam = p.locator(`details.fam:has(.inst[data-inst="${inst}"])`);
    if ((await fam.getAttribute('open')) === null) await fam.locator('summary').click();
    await p.locator(`.inst[data-inst="${inst}"]`).first().click();
    await expect(p.locator(`[data-ticket="${inst}"]`)).toBeVisible();
  }
  async function trade(m, inst, side, amt) {
    const p = m.page;
    await openTicket(m, inst);
    if (side === 'sell') await p.click(`[data-ticket="${inst}"] .btn.sell`);
    await p.fill(`[data-amount="${inst}"]`, String(amt));
    const go = p.locator(`[data-go="${inst}"]`);
    if (await go.isDisabled()) { await p.keyboard.press('Escape'); return false; } // refused by the 3× limit before sending
    await go.click();
    await expect(p.locator('.toast').last()).toContainText(/Bought|Sold|Refused|refused|limit/);
    if (await p.locator('.sheet').count()) await p.keyboard.press('Escape');
    return true;
  }
  async function closeBiggest(m) {
    const p = m.page;
    await dismiss(m);
    if (m.phone) await p.click('[data-tab="trade"]');
    const first = p.locator('[data-pane="trade"] .inst').first();
    if (!(await first.count())) return;
    await first.click();
    const btn = p.locator('[data-close]');
    if (await btn.count()) { await btn.first().click(); await expect(p.locator('.toast').last()).toContainText(/Closed|refused|Refused/); }
    if (await p.locator('.sheet').count()) await p.keyboard.press('Escape');
  }
  async function forecast(m, v) {
    const p = m.page;
    await dismiss(m);
    if (m.phone) await p.click('[data-tab="trade"]');
    await p.fill('#forecast-input', String(v));
    await p.click('[data-save-forecast]');
    await expect(p.locator('.toast').last()).toContainText('Forecast saved');
  }
  async function bid(m, mult, amt) {
    const p = m.page;
    if (m.phone) await p.click('[data-tab="trade"]');
    const price = await p.evaluate(async () => (await (await fetch('/api/doc?key=quarter')).json()).doc.prices.VER10Y);
    await p.fill('[data-keep="bid-price"]', (price * mult).toFixed(2));
    await p.fill('[data-keep="bid-amount"]', String(amt));
    await p.click('text=Save bid');
    await expect(p.locator('.toast').last()).toContainText('Bid saved');
  }
  async function reconnect(m) {
    const p = m.page;
    offlineAllowed.add(m.label);
    await m.ctx.setOffline(true);
    await expect(p.locator('.offline')).toBeVisible({ timeout: 20000 });
    await openTicket(m, 'GOLD');
    await p.fill('[data-amount="GOLD"]', '15');
    await p.click('[data-go="GOLD"]');
    await expect(p.locator('.toast').last()).toContainText(/Connection lost/, { timeout: 30000 });
    if (await p.locator('.sheet').count()) await p.keyboard.press('Escape');
    await m.ctx.setOffline(false);
    await expect(p.locator('.offline')).toHaveCount(0, { timeout: 20000 });
    await trade(m, 'GOLD', 'buy', 15);
    offlineAllowed.delete(m.label);
  }
});
