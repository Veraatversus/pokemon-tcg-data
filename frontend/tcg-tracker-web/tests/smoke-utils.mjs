import { chromium } from 'playwright';

export const BASE_URL = process.env.TCG_TRACKER_BASE_URL || 'http://localhost:8080';

export async function withBrowser(testFn) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  try {
    await testFn(page);
  } finally {
    await browser.close();
  }
}

export async function retry(fn, { retries = 3, delayMs = 300, label = 'retry' } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw new Error(`${label} fehlgeschlagen: ${lastError?.message || lastError}`);
}

export async function gotoReady(page, url = BASE_URL) {
  await retry(
    async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(200);
      await page.waitForLoadState('networkidle', { timeout: 12000 });
    },
    { retries: 3, delayMs: 500, label: 'Navigation' }
  );
}

export async function waitForSelectorStable(page, selector, timeout = 30000) {
  await page.waitForSelector(selector, { timeout, state: 'attached' });
  await page.waitForFunction(
    (sel) => {
      const node = document.querySelector(sel);
      if (!node) return false;
      const style = window.getComputedStyle(node);
      return style.display !== 'none' || node.id === 'audit-panel';
    },
    selector,
    { timeout }
  );
}

export async function waitForCondition(page, predicateSource, { timeout = 25000, polling = 250 } = {}) {
  await page.waitForFunction(predicateSource, undefined, { timeout, polling });
}

export async function waitForSaveSettled(page) {
  await page.waitForFunction(() => {
    const pill = document.querySelector('#save-state-pill');
    if (!pill) return true;
    const text = String(pill.textContent || '').toLowerCase();
    return !text.includes('speichert');
  }, undefined, { timeout: 20000, polling: 250 });
}

export async function isLoggedIn(page) {
  return page.evaluate(() => {
    const authButton = document.querySelector('#btn-auth');
    return authButton?.dataset?.state === 'out';
  });
}
