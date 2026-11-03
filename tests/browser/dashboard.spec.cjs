const { test, expect } = require('@playwright/test');

const { installBluetooth } = require('./fixtures.cjs');

test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await installBluetooth(page);
});

test('connect, change settings, rename, read history and download CSV', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/fr/');
  await expect(page.locator('.desktop-app')).toBeVisible();
  await page.locator('#connectBtn').click();
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'connected');
  await expect(page.locator('#temperature')).toContainText('22,40');
  await expect(page.locator('#battery')).toHaveText('87 %');
  await page.locator('input[name="unit"][value="F"]').check();
  await page.locator('#unitBtn').click();
  await expect(page.locator('#temperature')).toContainText('72,32');
  await page.locator('input[name="clockMode"][value="12"]').check();
  await page.locator('#syncBtn').click();
  await expect(page.locator('#syncBtn')).toBeEnabled();
  await expect(page.locator('#actionFeedback')).toHaveText('Horloge synchronisée.');
  await page.locator('#renameBtn').click();
  await page.locator('#deviceAlias').fill('Salon');
  await page.locator('#renameForm button[type="submit"]').click();
  await expect(page.locator('#deviceLabel')).toHaveText('Salon');
  await page.locator('#loadHistoryBtn').click();
  await expect(page.locator('#historyTableBody tr')).toHaveCount(2);
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportHistoryBtn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('lywsd02-salon-history.csv');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString('utf8')).toContain('temperature_min_c');
  await page.locator('#connectBtn').click();
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'disconnected');
  await page.reload();
  await expect(page.locator('#knownDevicesList')).toContainText('Salon');
  expect(errors).toEqual([]);
});

test('cancelling a pending connection restores the controls immediately', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.testBluetooth.delayConnection = true; });
  await page.locator('#connectBtn').click();
  await expect(page.locator('#connectBtnLabel')).toHaveText('Stop connecting');
  await page.locator('#connectBtn').click();
  await expect(page.locator('#connectBtnLabel')).toHaveText('Connect a clock');
  await page.evaluate(() => window.testBluetooth.finishConnection());
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'disconnected');
  await expect(page.locator('#syncBtn')).toBeDisabled();
});

test('all nine locale pages load their scripts and Arabic keeps its RTL layout', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const locale of ['', 'fr', 'es', 'it', 'de', 'ar', 'zh', 'pt', 'hi']) {
    await page.goto(`/${locale ? `${locale}/` : ''}`);
    await expect(page.locator('#connectBtn')).toBeEnabled();
    await expect(page.locator('html')).toHaveAttribute('data-locale', locale || 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('#ha-tab').click();
    await expect(page.locator('#home-assistant-panel')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('#browser-tab').click();
    await page.locator('#connectBtn').click();
    await page.locator('#advancedSettings > summary').click();
    await expect(page.locator('#temperature')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('a phone without Web Bluetooth retains the connection help', async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true
  });
  try {
    const page = await context.newPage();
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(() => { delete Navigator.prototype.bluetooth; });
    await page.goto('http://127.0.0.1:4173/fr/');
    await expect(page.locator('#compatibilityNotice')).toBeVisible();
    await expect(page.locator('#connectBtn')).toBeDisabled();
    await page.locator('#ha-tab').click();
    await expect(page.locator('#home-assistant-panel')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ouvrir dans HACS' })).toBeVisible();
  } finally { await context.close(); }
});


test('the two modes support deep links, keyboard navigation and browser history', async ({ page }) => {
  await page.goto('/fr/#home-assistant');
  await expect(page.locator('#home-assistant-panel')).toBeVisible();
  await expect(page.locator('#browser-panel')).toBeHidden();
  await expect(page.locator('#ha-tab')).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.locator('#ha-tab').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#browser-tab')).toBeFocused();
  await expect(page.locator('#browser-panel')).toBeVisible();
  await expect(page.locator('#clockWorkspace')).toBeHidden();
  await expect(page.locator('#displaySettings')).toBeVisible();
  await expect(page.locator('#historyPanel')).toBeVisible();
  await expect(page.locator('#logsPanel')).toBeVisible();
  await expect(page.locator('#knownDevices')).toBeHidden();
  await expect(page.locator('#advancedSettings')).not.toHaveAttribute('open');
  await page.goBack();
  await expect(page.locator('#home-assistant-panel')).toBeVisible();
  await page.locator('#browser-tab').click();
  await page.locator('#connectBtn').click();
  await expect(page.locator('#clockWorkspace')).toBeVisible();
  await page.locator('#ha-tab').click();
  await page.locator('#browser-tab').click();
  await expect(page.locator('#status')).toHaveAttribute('data-state', 'connected');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('sync failures are visible without opening the log and a retry clears the error', async ({ page }) => {
  await page.goto('/fr/');
  await page.locator('#connectBtn').click();
  await expect(page.locator('#temperature')).toContainText('22,40');
  await page.evaluate(() => { window.testBluetooth.failTimeWrite = true; });
  await page.locator('#syncBtn').click();
  await expect(page.locator('#actionFeedback')).toHaveAttribute('data-kind', 'error');
  await expect(page.locator('#actionFeedback')).toBeVisible();
  await expect(page.locator('#advancedSettings')).not.toHaveAttribute('open');
  await expect(page.locator('#syncBtn')).toBeEnabled();
  await page.evaluate(() => { window.testBluetooth.failTimeWrite = false; });
  await page.locator('#syncBtn').click();
  await expect(page.locator('#actionFeedback')).toHaveText('Horloge synchronisée.');
  await expect(page.locator('#actionFeedback')).toHaveAttribute('data-kind', 'success');
});


test('all clock controls stay visible and history sits directly above the bottom log', async ({ page }) => {
  await page.goto('/fr/');
  for (const id of ['timezone', 'formatSettings', 'offsetMinutesRange', 'autoSyncClock', 'historyPanel', 'logsPanel']) {
    await expect(page.locator(`#${id}`)).toBeVisible();
    expect(await page.locator(`#${id}`).evaluate(node => node.closest('details'))).toBeNull();
  }
  expect(await page.locator('#browser-panel').evaluate(panel => Array.from(panel.children).slice(-2).map(node => node.id)))
    .toEqual(['historyPanel', 'logsPanel']);
  await expect(page.locator('.device-gallery img')).toHaveCount(3);
  for (const image of await page.locator('.device-gallery img').all()) {
    await expect(image).toBeVisible();
    expect(await image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
  }
  await page.locator('#connectBtn').click();
  await expect(page.locator('#timezone')).toBeEnabled();
  await page.locator('#timezone').selectOption('120');
  await page.locator('#offsetMinutes').fill('5');
  await expect(page.locator('#offsetOutput')).toHaveText('+5 min');
  await page.locator('#syncBtn').click();
  await expect(page.locator('#actionFeedback')).toHaveText('Horloge synchronisée.');
  const payload = await page.evaluate(() => window.testBluetooth.writes.filter(write => write.kind === 'time' && write.bytes.length === 5).at(-1).bytes);
  expect(payload[4]).toBe(2);
  expect(await page.locator('#logs').textContent()).toContain('synchronis');
  await page.locator('#clearLogs').click();
  await expect(page.locator('#logs .log-entry')).toHaveCount(0);
});
