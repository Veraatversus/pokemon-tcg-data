import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const CLI_ARGS = process.argv.slice(2);
const TRUTHY_PATTERN = /^(1|true|yes|on)$/i;
const SLOWMO_ARG = CLI_ARGS.find((arg) => arg.startsWith('--slowmo='));
const HEADED = CLI_ARGS.includes('--headless')
  ? false
  : CLI_ARGS.includes('--headed') || TRUTHY_PATTERN.test(String(process.env.PLAYWRIGHT_HEADED || '').trim());
const SLOW_MO = Number.parseInt(
  SLOWMO_ARG?.split('=')[1] ?? process.env.PLAYWRIGHT_SLOWMO ?? (HEADED ? '125' : '0'),
  10
) || 0;
const DEFAULT_PROFILE_DIR = resolve(process.cwd(), '.playwright-profile', 'tcg-search');
const PROFILE_DIR = String(process.env.PLAYWRIGHT_PROFILE_DIR || '').trim() || (existsSync(DEFAULT_PROFILE_DIR) ? DEFAULT_PROFILE_DIR : '');
const STORAGE_STATE = String(process.env.PLAYWRIGHT_STORAGE_STATE || '').trim();

export const BASE_URL = process.env.TCG_TRACKER_BASE_URL || 'http://localhost:8080';

export async function withBrowser(testFn) {
  if (PROFILE_DIR) {
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: !HEADED,
      slowMo: SLOW_MO,
      viewport: { width: 1366, height: 900 },
    });
    const page = context.pages()[0] || await context.newPage();
    try {
      await testFn(page);
    } finally {
      await context.close();
    }
    return;
  }

  const browser = await chromium.launch({ headless: !HEADED, slowMo: SLOW_MO });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    ...(STORAGE_STATE ? { storageState: STORAGE_STATE } : {}),
  });
  const page = await context.newPage();
  try {
    await testFn(page);
  } finally {
    await context.close();
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

export async function waitForSelectorStable(page, selector, timeout = 30000, { allowHidden = false } = {}) {
  await page.waitForSelector(selector, { timeout, state: 'attached' });
  await page.waitForFunction(
    ({ sel, allowHidden: allowHiddenValue }) => {
      const node = document.querySelector(sel);
      if (!node) return false;
      if (allowHiddenValue) return true;

      const style = window.getComputedStyle(node);
      const rectCount = typeof node.getClientRects === 'function' ? node.getClientRects().length : 0;
      const opacity = Number.parseFloat(style.opacity || '1');

      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && opacity > 0
        && rectCount > 0;
    },
    { sel: selector, allowHidden },
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
