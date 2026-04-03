import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const APP_URL = 'http://localhost:8080';
const SPREADSHEET_STORAGE_KEY = 'poke:release:tcg_spreadsheet_id';
const TOKEN_STORAGE_KEY = 'poke:release:tcg_tracker_token';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, '.playwright-profile');

async function main() {
  console.log('Starte Live-Test fuer TCGDex-Detail-Fix...\n');

  let context;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: { width: 1400, height: 900 },
      slowMo: 80,
    });
  } catch (err) {
    console.warn('Persistentes Profil nicht verfuegbar, starte mit frischem Profil...', err?.message || err);
    const fallbackProfile = path.join(os.tmpdir(), `tcg-tracker-playwright-${Date.now()}`);
    context = await chromium.launchPersistentContext(fallbackProfile, {
      headless: false,
      viewport: { width: 1400, height: 900 },
      slowMo: 80,
    });
  }
  const page = context.pages()[0] || await context.newPage();

  console.log(`Lade App: ${APP_URL}`);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2500);

  let tokenData = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }, TOKEN_STORAGE_KEY);

  if (!tokenData?.token) {
    console.log('\nKein OAuth-Token gefunden. Bitte jetzt im geoeffneten Browser anmelden.');
    console.log('Ich warte bis zu 10 Minuten auf den Token...');
    const maxMs = 10 * 60 * 1000;
    const started = Date.now();
    while (Date.now() - started < maxMs) {
      await page.waitForTimeout(2000);
      tokenData = await page.evaluate((key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return null; }
      }, TOKEN_STORAGE_KEY);
      if (tokenData?.token) break;
    }
    if (!tokenData?.token) {
      console.error('Kein Token innerhalb des Zeitfensters gefunden. Abbruch.');
      await context.close();
      process.exit(1);
    }
  }

  const sheetId = await page.evaluate((key) => localStorage.getItem(key), SPREADSHEET_STORAGE_KEY);
  console.log(`Token vorhanden | Spreadsheet: ${sheetId}`);

  console.log('\nLese Zustand VORHER...');
  const before = await readSheetStats(page, TOKEN_STORAGE_KEY, SPREADSHEET_STORAGE_KEY);
  printStats('VORHER', before);

  // Sync reliable via real UI click (module functions are not global)
  const toolsDetails = page.locator('details.dashboard-tools');
  const isOpen = await toolsDetails.evaluate((el) => el.open);
  if (!isOpen) {
    await page.locator('details.dashboard-tools > summary').click();
    await page.waitForTimeout(400);
  }

  console.log('\nKlicke auf Power-Refresh...');
  const refreshBtn = page.locator('#btn-overview-power-refresh');
  await refreshBtn.click();

  console.log('Warte auf Abschluss (Button wieder aktiv)...');
  try {
    await page.waitForFunction(
      () => {
        const btn = document.getElementById('btn-overview-power-refresh');
        return !!btn && !btn.disabled;
      },
      { timeout: 180000, polling: 2000 }
    );
  } catch {
    console.warn('Timeout beim Warten auf Re-Enable. Ich lese trotzdem den Nachher-Zustand.');
  }

  await page.waitForTimeout(3500);

  console.log('\nLese Zustand NACHHER...');
  const after = await readSheetStats(page, TOKEN_STORAGE_KEY, SPREADSHEET_STORAGE_KEY);
  printStats('NACHHER', after);

  printDelta(before, after);

  console.log('\nTest abgeschlossen. Browser bleibt offen fuer manuelle Kontrolle.');
  await new Promise(() => {});
}

async function readSheetStats(page, tokenKey, sheetKey) {
  return page.evaluate(async ({ tokenKey, sheetKey }) => {
    const token = JSON.parse(localStorage.getItem(tokenKey) || '{}').token;
    const sheetId = localStorage.getItem(sheetKey);
    if (!token || !sheetId) return { error: 'missing token or sheetId' };

    const resp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/db_sets!A1:AC220`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!resp.ok) return { error: `http ${resp.status}` };

    const data = await resp.json();
    const rows = data.values || [];
    const headers = rows[0] || [];
    const body = rows.slice(1);
    const indices = { K: 10, L: 11, V: 21, X: 23, Z: 25, AB: 27 };
    const out = { total: body.length, cols: {} };
    Object.entries(indices).forEach(([key, idx]) => {
      const populated = body.filter((r) => (r[idx] || '').trim() !== '').length;
      out.cols[key] = {
        idx,
        name: headers[idx] || `col${idx + 1}`,
        populated,
        empty: body.length - populated,
      };
    });
    return out;
  }, { tokenKey, sheetKey });
}

function printStats(label, stats) {
  if (!stats || stats.error) {
    console.log(`${label}: Fehler beim Lesen (${stats?.error || 'unknown'})`);
    return;
  }
  console.log(`${label}: ${stats.total} Zeilen`);
  ['K', 'L', 'V', 'X', 'Z', 'AB'].forEach((key) => {
    const c = stats.cols[key];
    console.log(`  ${key}[${c.idx}] ${c.name}: ${c.populated}/${stats.total} befuellt`);
  });
}

function printDelta(before, after) {
  if (!before || !after || before.error || after.error) return;
  console.log('\nDelta (befuellt):');
  ['K', 'L', 'V', 'X', 'Z', 'AB'].forEach((key) => {
    const b = before.cols[key].populated;
    const a = after.cols[key].populated;
    const delta = a - b;
    const mark = delta > 0 ? ' IMPROVED' : '';
    console.log(`  ${key}: ${b} -> ${a} (${delta >= 0 ? '+' : ''}${delta})${mark}`);
  });
}

main().catch((err) => {
  console.error('Unerwarteter Fehler:', err);
  process.exit(1);
});
