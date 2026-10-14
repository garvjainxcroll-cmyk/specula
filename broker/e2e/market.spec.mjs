// The whole website in real browsers: the host, an investor on a laptop and one on a phone.
import { test, expect } from '@playwright/test';

const money = (s) => Number(String(s).replace(/[^\d.−-]/g, '').replace('−', '-'));

test('host and investors: sign up, trade, host moves, loans, updates, privacy', async ({ browser }) => {
  const errors = [];
  const open = async (vp) => {
    const ctx = await browser.newContext({ viewport: vp });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    return p;
  };

  // the host chooses a password and opens the market
  const host = await open({ width: 1366, height: 900 });
  await host.goto('/#/host');
  await host.fill('input[name=password]', 'hostpass');
  await host.fill('input[name=password2]', 'hostpass');
  await host.click('button[type=submit]');
  await expect(host.locator('.mc')).toHaveCount(10);
  await host.click('.top-r .btn');
  await expect(host.locator('.top .mkt')).toContainText('Market open');

  // two investors sign up: ₹10,00,000 each
  const asha = await open({ width: 1366, height: 900 });
  const ravi = await open({ width: 390, height: 844 });
  for (const [p, name, email] of [[asha, 'Asha Rao', 'asha@example.com'], [ravi, 'Ravi Kumar', 'ravi@example.com']]) {
    await p.goto('/');
    await p.click('[data-mode=up]');
    await p.fill('input[name=name]', name);
    await p.fill('input[name=email]', email);
    await p.fill('input[name=phone]', '+91 98765 43210');
    await p.fill('input[name=password]', 'secret1');
    await p.click('button[type=submit]');
    await expect(p.locator('.top')).toBeVisible();
  }
  // exactly the ten stocks in the watchlist
  await expect(asha.locator('.wl-row')).toHaveCount(10);
  await expect(asha.locator('.wl-row .tk')).toHaveText(['AURI', 'NEXO', 'VANT', 'MERB', 'HELX', 'CRTL', 'SKYF', 'GRVT', 'URBT', 'TCOR']);

  // Asha buys 1,000 VANT
  await asha.goto('/#/s/VANT');
  await asha.click('.trade-bar .btn:not(.sell)');
  await asha.fill('.qty input', '1000');
  await asha.click('.sheet button[type=submit]');
  await expect(asha.locator('.toast').last()).toContainText('Bought 1,000 VANT');
  // Ravi (phone) buys 200 GRVT
  await ravi.goto('/#/s/GRVT');
  await ravi.click('.trade-bar .btn:not(.sell)');
  await ravi.fill('.qty input', '200');
  await ravi.click('.sheet button[type=submit]');
  await expect(ravi.locator('.toast').last()).toContainText('Bought 200 GRVT');

  // the host dips VANT by 10%: Asha's money falls at once
  await asha.goto('/#/portfolio');
  await expect(asha.locator('.pf-grid table.tbl')).toContainText('VANT');
  const before = money(await asha.locator('.hero-num').textContent());
  await host.click('[aria-label="VANT down 10 percent"]');
  await expect(host.locator('.toast').last()).toContainText('VANT');
  await expect.poll(async () => before - money(await asha.locator('.hero-num').textContent()), { timeout: 10000 }).toBeGreaterThan(4500);
  await expect(asha.locator('.hero-chg')).toContainText('−');

  // investors never see the host's moves or each other
  for (const [p, other] of [[asha, 'Ravi'], [ravi, 'Asha']]) {
    const txt = await p.locator('body').textContent();
    expect(txt).not.toContain(other);
    expect(txt).not.toContain('Your level');
    expect(txt).not.toContain('Your moves');
  }

  // the dataset shows both, with total liquidable money
  await host.click('a[data-key=data]');
  await expect(host.locator('table.tbl').first()).toContainText('Asha Rao');
  await expect(host.locator('table.tbl').first()).toContainText('Ravi Kumar');
  await expect(host.locator('table.tbl').first()).toContainText('Total liquidable money');
  const dl = host.waitForEvent('download');
  await host.click('text=Download CSV >> nth=0');
  expect((await dl).suggestedFilename()).toMatch(/^investors-.*\.csv$/);
  // the host sees Asha's whole portfolio
  await host.locator('tbody tr.click', { hasText: 'Asha Rao' }).click();
  await expect(host.locator('.sheet')).toContainText('1,000');
  await host.keyboard.press('Escape');

  // a 6-second loan from Asha to Ravi at 10%
  await host.click('a[data-key=loans]');
  await expect(host.locator('select[name=lender] option')).toHaveCount(3);
  await host.selectOption('select[name=lender]', { index: 1 });
  await host.selectOption('select[name=borrower]', { index: 2 });
  await host.fill('input[name=amount]', '20000');
  await host.fill('input[name=rate]', '10');
  await host.fill('input[name=dl]', '0.1');
  await host.click('form button[type=submit]');
  await host.click('.sheet .btn:not(.ghost)');
  await expect(host.locator('.toast').last()).toContainText('Loan L1 sent');
  await expect(host.locator('.status.ongoing')).toBeVisible();
  // both parties are told; at the deadline it is repaid with interest
  await expect(ravi.locator('.toast', { hasText: 'Loan L1' }).first()).toBeVisible();
  await expect(host.locator('.status.elapsed')).toBeVisible({ timeout: 20000 });
  await expect(host.locator('table.tbl')).toContainText('₹22,000.00');
  await expect(asha.locator('.toast', { hasText: 'Loan L1 repaid' })).toBeVisible({ timeout: 15000 });
  await ravi.goto('/#/account');
  await expect(ravi.locator('#notices')).toContainText('Loan L1 repaid');

  // updates, in serial order
  await host.click('a[data-key=updates]');
  for (const t of ['First update: market opens.', 'Second update: VANT recall.']) {
    await host.fill('textarea', t);
    await host.click('form button[type=submit]');
    await expect(host.locator('.up-item', { hasText: t })).toBeVisible();
  }
  await ravi.goto('/#/updates');
  await expect(ravi.locator('.up-item .up-text')).toHaveText(['First update: market opens.', 'Second update: VANT recall.']);
  await expect(ravi.locator('.up-item .eyebrow')).toHaveText(['Update 01', 'Update 02']);

  // closing the market pauses prices and refuses orders
  await host.click('.top-r .btn');
  await expect(asha.locator('.bar.closed')).toBeVisible();
  await asha.goto('/#/s/AURI');
  await asha.click('.trade-bar .btn:not(.sell)');
  await expect(asha.locator('.sheet button[type=submit]')).toBeDisabled();

  expect(errors).toEqual([]);
});
