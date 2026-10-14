// The whole game in real browsers, the SPECULA way: the host creates the game and its
// teams, teams join with their codes (a laptop and a phone), trade, the host moves
// prices, sends a loan and posts updates, then ends the game and reveals the results.
import { test, expect } from '@playwright/test';

const money = (s) => Number(String(s).replace(/[^\d.−-]/g, '').replace('−', '-'));

test('create the game, teams join with codes, trade, loans, updates, end and reveal', async ({ browser }) => {
  const errors = [];
  const open = async (vp) => {
    const ctx = await browser.newContext({ viewport: vp });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    return p;
  };

  // the host: password, game name, number of teams, codes
  const host = await open({ width: 1366, height: 900 });
  await host.goto('/#/host');
  await host.fill('#host-pass', 'hostpass');
  await host.fill('#host-pass2', 'hostpass');
  await host.click('form button[type=submit]');
  await host.fill('#game-name', 'Test Cup');
  await host.click('#btn-save-name');
  await expect(host.locator('.band .brand-name')).toHaveText('Test Cup');
  await host.fill('#team-count', '4');
  await host.dispatchEvent('#team-count', 'change');
  await expect(host.locator('#team-names')).toHaveValue('Team 01\nTeam 02\nTeam 03\nTeam 04');
  await host.fill('#team-names', 'Alpha\nBravo\nCharlie\nDelta');
  await host.click('#btn-save-teams');
  await expect(host.locator('td.code')).toHaveCount(4);
  const codes = await host.$$eval('td.code', (els) => els.map((e) => e.dataset.code));
  expect(new Set(codes).size).toBe(4);

  // the Big Screen shows how to join and the teams
  const big = await open({ width: 1920, height: 1080 });
  await big.goto('/#/display');
  await expect(big.locator('.bigscreen')).toContainText('Join your team');
  await expect(big.locator('.teams')).toContainText('Charlie');

  // two teams join: Alpha on a laptop, Bravo on a phone
  const alpha = await open({ width: 1366, height: 900 });
  const bravo = await open({ width: 390, height: 844 });
  for (const [p, code, name] of [[alpha, codes[0], 'Asha'], [bravo, codes[1], 'Ravi']]) {
    await p.goto('/#/desk');
    await p.fill('input[name=code]', code);
    await p.fill('input[name=name]', name);
    await p.click('form button[type=submit]');
    await expect(p.locator('.desk-top')).toBeVisible();
  }
  await expect(alpha.locator('.who-team b')).toHaveText('Alpha');
  await expect(alpha.locator('.wl-row .tk')).toHaveText(['AURI', 'NEXO', 'VANT', 'MERB', 'HELX', 'CRTL', 'SKYF', 'GRVT', 'URBT', 'TCOR']);
  await expect(alpha.locator('.bar.closed')).toContainText('not started');
  await expect(host.locator('tr[data-team="Alpha"] .members')).toHaveText('Asha');

  // start with a 10-minute session
  await host.selectOption('#start-secs', '600');
  await host.click('#btn-start');
  await host.click('.sheet .btn:not(.ghost)');
  await expect(host.locator('.desk-top .clock')).toHaveText(/^\d+:\d\d$/);
  await expect(alpha.locator('.desk-top .clock')).toBeVisible();
  await expect(big.locator('.bigclock')).toHaveText(/^\d+:\d\d$/);

  // Alpha buys 1,000 VANT; Bravo (phone) buys 200 GRVT
  await alpha.goto('/#/desk/s/VANT');
  await alpha.click('.trade-bar .btn:not(.sell)');
  await alpha.fill('.qty input', '1000');
  await alpha.click('.sheet button[type=submit]');
  await expect(alpha.locator('.toast').last()).toContainText('Bought 1,000 VANT');
  await bravo.goto('/#/desk/s/GRVT');
  await bravo.click('.trade-bar .btn:not(.sell)');
  await bravo.fill('.qty input', '200');
  await bravo.click('.sheet button[type=submit]');
  await expect(bravo.locator('.toast').last()).toContainText('Bought 200 GRVT');

  // the host dips VANT by 10%: Alpha's money falls at once
  await alpha.goto('/#/desk/portfolio');
  await expect(alpha.locator('.pf-grid table.tbl')).toContainText('VANT');
  const before = money(await alpha.locator('.hero-num').textContent());
  await host.goto('/#/host/market');
  await host.click('[aria-label="VANT down 10 percent"]');
  await expect(host.locator('.toast').last()).toContainText('VANT');
  await expect.poll(async () => before - money(await alpha.locator('.hero-num').textContent()), { timeout: 10000 }).toBeGreaterThan(4500);

  // desks never see other teams, codes or the host's moves
  for (const [p, others] of [[alpha, ['Bravo', 'Ravi', codes[1]]], [bravo, ['Alpha', 'Asha', codes[0]]]]) {
    const txt = await p.locator('body').textContent();
    for (const o of others) expect(txt).not.toContain(o);
    expect(txt).not.toContain('Your level');
  }

  // the dataset: teams with codes and money, and everyone who signed in
  await host.goto('/#/host/data');
  const teamsTable = host.locator('table.tbl').first();
  await expect(teamsTable).toContainText('Total liquidable money');
  await expect(teamsTable).toContainText(codes[0]);
  await expect(host.locator('section', { hasText: 'Everyone signed in' })).toContainText('Ravi');
  const dl = host.waitForEvent('download');
  await host.click('text=Download CSV >> nth=0');
  expect((await dl).suggestedFilename()).toMatch(/^teams-.*\.csv$/);

  // a 6-second loan from Charlie to Alpha at 10%
  await host.goto('/#/host/loans');
  await expect(host.locator('select[name=lender] option')).toHaveCount(5);
  await host.evaluate(() => {
    for (const [n, who] of [['lender', 'Charlie'], ['borrower', 'Alpha']]) {
      const s = document.querySelector(`select[name=${n}]`);
      s.value = [...s.options].find((o) => o.text.startsWith(who)).value;
      s.dispatchEvent(new Event('input'));
    }
  });
  await host.fill('input[name=amount]', '20000');
  await host.fill('input[name=rate]', '10');
  await host.fill('input[name=dl]', '0.1');
  await host.click('form button[type=submit]');
  await host.click('.sheet .btn:not(.ghost)');
  await expect(host.locator('.toast').last()).toContainText('Loan L1 sent');
  await expect(alpha.locator('.toast', { hasText: 'Loan L1' }).first()).toBeVisible();
  await expect(host.locator('.status.elapsed')).toBeVisible({ timeout: 20000 });
  await expect(host.locator('table.tbl')).toContainText('₹22,000.00');
  await expect(alpha.locator('.toast', { hasText: 'Loan L1 repaid' })).toBeVisible({ timeout: 15000 });

  // updates, in serial order, on every desk and the Big Screen
  await host.goto('/#/host/updates');
  for (const t of ['First update: market opens.', 'Second update: VANT recall.']) {
    await host.fill('textarea', t);
    await host.click('form button[type=submit]');
    await expect(host.locator('.up-item', { hasText: t })).toBeVisible();
  }
  await bravo.goto('/#/desk/updates');
  await expect(bravo.locator('.up-item .up-text')).toHaveText(['First update: market opens.', 'Second update: VANT recall.']);
  await expect(bravo.locator('.up-item .eyebrow')).toHaveText(['Update 01', 'Update 02']);
  await expect(big.locator('.ticker')).toContainText('Second update');

  // standings stay sealed until the end; then the host reveals them
  await expect(big.locator('body')).not.toContainText('Final standings');
  await host.goto('/#/host/game');
  await host.click('#btn-end');
  await host.click('.sheet .btn:not(.ghost)');
  await expect(alpha.locator('.bar.closed')).toContainText('game is over');
  await expect(big.locator('.bigscreen')).toContainText('Market closed');
  await host.click('#btn-reveal');
  await host.click('.sheet .btn:not(.ghost)');
  await expect(big.locator('.bigscreen')).toContainText('Final standings');
  await expect(big.locator('.standings tr')).toHaveCount(4);
  await alpha.goto('/#/desk/portfolio');
  await expect(alpha.locator('.place-card')).toBeVisible();
  await expect(alpha.locator('.bar.closed')).toContainText('Your team finished');

  expect(errors).toEqual([]);
});
