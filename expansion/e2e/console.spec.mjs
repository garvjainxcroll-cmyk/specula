// The console in a real browser: first sign-in, a full practice rehearsal from auction to
// an official result, every screen opening without an error, and signing out and in.
import { test, expect } from '@playwright/test';

const PW = 'Control-2026-e2e';
const ROUTES = ['dashboard', 'config', 'setup', 'cvs', 'auction', 'auction-results', 'expansion', 'compliance', 'financial', 'comparison', 'rankings', 'reports', 'audit', 'settings'];

test('a rehearsal from first sign-in to an official result', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  // first sign-in: the setup code, then the first Super Administrator
  await page.goto('/');
  const inputs = page.locator('form.box input');
  await expect(inputs).toHaveCount(5);
  await inputs.nth(0).fill('e2e-setup-code');
  await inputs.nth(1).fill('Event Head');
  await inputs.nth(2).fill('head');
  await inputs.nth(3).fill(PW);
  await inputs.nth(4).fill(PW);
  await page.click('button[type=submit]');
  await expect(page.locator('.shell')).toBeVisible();

  // a practice session, clearly labelled
  await page.goto('/#/settings');
  await page.fill('input[placeholder^="e.g. JACO CORP 2026"]', 'Rehearsal');
  await page.click('button:has-text("Create")');
  await expect(page.locator('.modebar.practice')).toContainText('PRACTICE');

  // Round 1: the sample auction, then the lock (with confirmation)
  await page.goto('/#/settings');
  await page.click('button:has-text("Practice tools")');
  await page.click('button:has-text("1. Load the sample auction results")');
  await expect(page.locator('button:has-text("1. Load the sample auction results")')).toBeDisabled();
  await page.goto('/#/auction');
  await page.click('button:text-is("Lock Round 1")');
  await page.click('.modal .mf button.primary');
  await expect(page.locator('.pill:has-text("Round 1 locked")').first()).toBeVisible();
  await expect(page.locator('button:text-is("Unlock Round 1")')).toBeVisible();

  // Round 2: the sample allocations, approved or recorded as blocked, team by team
  await page.goto('/#/settings');
  await page.click('button:has-text("Practice tools")');
  await page.click('button:has-text("3. Load the sample allocations")');
  await expect(page.locator('button:has-text("3. Load the sample allocations")')).toBeDisabled();
  for (const t of ['Team A', 'Team B', 'Team C', 'Team D']) {
    await page.goto('/#/expansion');
    await page.click(`.tabs button:has-text("${t}")`);
    for (let k = 0; k < 8; k++) {
      const approve = page.locator('button:has-text("Approve as operational")');
      if (!(await approve.count())) break;
      const before = await approve.count();
      await approve.first().click();
      await expect(approve).toHaveCount(before - 1);
    }
    for (let k = 0; k < 8; k++) {
      const block = page.locator('button:has-text("Record as blocked")');
      if (!(await block.count())) break;
      const before = await block.count();
      await block.first().click();
      await page.fill('.modal textarea', 'Permit not granted before the deadline');
      await page.click('.modal .mf button.primary');
      await expect(block).toHaveCount(before - 1);
    }
  }

  // the formula behind a figure can be inspected
  await page.goto('/#/expansion');
  await page.locator('button:has-text("ⓘ formula")').first().click();
  await expect(page.locator('.modal')).toContainText(/productivity/i);
  await page.keyboard.press('Escape');

  // calculation, then finalisation (typed confirmation)
  await page.goto('/#/financial');
  await page.click('button:has-text("Run calculation")');
  await expect(page.locator('.pill:has-text("Calculation current")').first()).toBeVisible();
  await page.goto('/#/rankings');
  await expect(page.locator('.note.bad').first()).toContainText('Do not announce them');
  await page.goto('/#/financial');
  await page.click('button:has-text("Finalise Round 2")');
  await page.fill('.modal input[type=text]', 'FINALISE');
  await page.click('.modal .mf button.primary');
  await expect(page.locator('.pill:has-text("Official result v1")').first()).toBeVisible();
  await page.goto('/#/rankings');
  await expect(page.locator('.note.good').first()).toContainText('These are the official rankings');
  await expect(page.locator('table.t tbody tr')).toHaveCount(4);

  // every screen opens
  for (const r of ROUTES) {
    await page.goto(`/#/${r}`);
    await expect(page.locator('h1.page')).toBeVisible();
  }
  expect(errors, errors.join('\n')).toEqual([]);

  // sign out; a wrong password is refused; the right one gets back in
  await page.click('button:has-text("Sign out")');
  const login = page.locator('form.box input');
  await login.nth(0).fill('head');
  await login.nth(1).fill('Wrong-password-1');
  await page.click('button[type=submit]');
  await expect(page.locator('form.box')).toContainText('do not match');
  await login.nth(1).fill(PW);
  await page.click('button[type=submit]');
  await expect(page.locator('.shell')).toBeVisible();
});
