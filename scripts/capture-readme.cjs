#!/usr/bin/env node
'use strict';

// Capture the real interface with example BLE readings. Start npm run dev first.
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const { installBluetooth } = require('../tests/browser/fixtures.cjs');
const root = path.resolve(__dirname, '..');
const baseURL = process.env.DASHBOARD_PREVIEW_URL || 'http://127.0.0.1:4173';

(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1200, height: 1050 }, timezoneId: 'Europe/Paris', deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-11-03T09:08:00+01:00'));
    await installBluetooth(page);
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.mode-icon svg')).toHaveCount(2);
    await page.screenshot({ path: path.join(root, 'img/og-dashboard.jpg'), clip: { x: 0, y: 125, width: 1200, height: 630 }, type: 'jpeg', quality: 88, animations: 'disabled' });
    await page.evaluate(() => { window.testBluetooth.historyCount = 24; });
    await page.locator('#connectBtn').click();
    await expect(page.locator('#temperature')).toContainText('22.40');
    await page.locator('#renameBtn').click();
    await page.locator('#deviceAlias').fill('Living room');
    await page.locator('#renameForm button[type="submit"]').click();
    await page.locator('#syncBtn').click();
    await expect(page.locator('#actionFeedback')).toHaveText('Clock synchronized.');
    await page.locator('#loadHistoryBtn').click();
    await expect(page.locator('#historyChart')).toHaveAttribute('data-count', '24');
    await page.screenshot({ path: path.join(root, 'img/dashboard_lywsd02.jpg'), fullPage: true, type: 'jpeg', quality: 88, animations: 'disabled' });
    await page.locator('#ha-tab').click();
    await page.screenshot({ path: path.join(root, 'img/home-assistant-setup.jpg'), fullPage: true, type: 'jpeg', quality: 88, animations: 'disabled' });
    await context.close();
    console.log('Updated browser, Home Assistant and social previews in img/.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
