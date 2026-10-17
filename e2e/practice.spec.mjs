// Practice mode (one device, no server needed) and the public pages.
import { test, expect } from '@playwright/test';

test('guided practice: two rounds with tips, a practice crisis and a final score', async ({ browser }) => {
  for (const vp of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    const ctx = await browser.newContext({ viewport: vp });
    const p = await ctx.newPage();
    const errors = [];
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto('/#/practice');
    await p.click('[data-practice="start"]');
    // click through every tip that appears (each new tip can take a moment to show)
    const tipOk = async () => {
      for (let k = 0; k < 10; k++) {
        const t = p.locator('[data-tip-ok]');
        try { await t.waitFor({ state: 'visible', timeout: 1200 }); } catch { break; }
        await t.click();
      }
    };
    await expect(p.locator('.tip')).toBeVisible();
    await tipOk();
    for (let q = 1; q <= 2; q++) {
      await p.click('[data-practice="open"]');
      await tipOk();
      if (vp.width < 600) await p.click('[data-tab="market"]');
      await p.locator('.inst[data-inst="AUREQ"]').first().click();
      await p.fill('[data-amount="AUREQ"]', '200');
      await expect(p.locator('[data-go="AUREQ"]')).toBeDisabled(); // a trading note is compulsory
      await p.fill('[data-note="AUREQ"]', 'Aurelian growth beat what forecasters expected');
      await p.click('[data-go="AUREQ"]');
      await expect(p.locator('.toast').last()).toContainText('Bought');
      await tipOk();
      if (vp.width < 600) await p.click('[data-tab="trade"]');
      await p.fill('#forecast-input', '3.5');
      await p.click('[data-save-forecast]');
      if (q === 2) {
        await p.click('[data-practice="crisis"]');
        await expect(p.locator('.takeover')).toBeVisible();
        await p.click('.takeover .btn');
        await tipOk();
      }
      await p.click('[data-practice="bell"]');
      await tipOk();
      await expect(p.locator(`text=Results · Round ${q}`)).toBeVisible();
      await p.click('[data-practice="next"]');
      await tipOk();
    }
    if (vp.width < 600) await p.click('[data-tab="score"]');
    await expect(p.locator('[data-my-final]')).toBeVisible();
    await expect(p.locator('[data-my-rank]')).toBeVisible();
    for (const other of ['Practice Fund Alpha', 'Practice Fund Beta', 'Practice Fund Gamma']) await expect(p.getByText(other)).toHaveCount(0);
    expect(errors).toEqual([]);
    await ctx.close();
  }
});

test('How to Play matches the guide and works on a phone', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('/#/learn');
  for (const t of ['Forty-four instruments in eight families', 'If Risk Used is above 100% when the round settles', 'You lose 1 point for every 0.1 percentage point you are off', 'Every fund starts with 15. Each forced liquidation costs 5', 'Fund codes are private']) {
    await expect(p.locator(`text=${t}`).first()).toBeAttached();
  }
  // the brief's worked example: ₹100 Cr of a 10-year bond, yield up 0.5% → about ₹4 Cr
  await expect(p.locator('text=you lose about ₹4.00 Cr').first()).toBeAttached();
  await expect(p.locator('text=0.25 + 4.60 + 0.5 × (4.60 − 4.00) + 0.5 × (−0.80) = 4.75')).toBeAttached();
  const wide = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(wide).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('single device mode is shown when the live server is missing', async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.route('**/api/**', (r) => r.fulfill({ status: 404, body: 'Not found' }));
  await p.goto('/#/desk');
  await expect(p.locator('.single')).toContainText('Single device mode');
  await p.goto('/#/practice');
  await p.click('[data-practice="start"]');
  await expect(p.locator('.desk-main')).toBeVisible();
  await ctx.close();
});
