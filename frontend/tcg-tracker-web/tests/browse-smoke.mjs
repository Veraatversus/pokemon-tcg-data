// Smoke: Stoebermodus ohne Login. Eigener Browser ohne Login-Profil; app-flags.json wird je Lauf per Route gesetzt.
// Lauf 1 (Schalter an): Dashboard mit allen Sets, Set mit Karten und Hinweis statt Haekchen, Lightbox ohne
// Sammelstatus, Suche mit Treffern, keine Konsolenfehler. Lauf 2 (Schalter aus): "Bitte anmelden." und keine
// Kartendateien aus api/v3.
// Aufruf: TCG_TRACKER_BASE_URL=<url zur index.html> node tests/browse-smoke.mjs
import { chromium } from 'playwright';
import { BASE_URL } from './smoke-utils.mjs';

const fail = (msg) => { throw new Error(msg); };

async function withFlags(enabled, fn) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.route('**/app-flags.json*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ browseWithoutLogin: enabled }),
  }));
  const page = await context.newPage();
  const errors = [];
  const cardRequests = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  page.on('request', (r) => { if (/\/api\/v3\/cards\//.test(r.url())) cardRequests.push(r.url()); });
  try {
    await fn(page, { errors, cardRequests });
  } finally {
    await context.close();
    await browser.close();
  }
}

const base = BASE_URL.replace(/#.*$/, '');

await withFlags(true, async (page, { errors }) => {
  await page.goto(`${base}#dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('.dash-set-card').length > 150, null, { timeout: 30000 });
  if (!(await page.evaluate(() => document.body.classList.contains('browse-mode')))) fail('body.browse-mode fehlt');
  if (await page.locator('#main-nav [data-view="stats"]').isVisible()) fail('Statistik-Link sichtbar');

  await page.evaluate(() => { location.hash = '#set/sv1'; });
  await page.waitForFunction(() => document.querySelectorAll('.card').length > 50, null, { timeout: 30000 });
  if (await page.locator('.card input[data-type="g"]').count()) fail('Sammel-Haekchen im Stoebermodus');
  const hint = await page.locator('.card .browse-login-hint').first().textContent();
  if (hint?.trim() !== 'Zum Sammeln anmelden') fail(`Hinweis fehlt (${hint})`);

  await page.locator('.card .card-img-wrap').first().click();
  await page.waitForSelector('#dialog-lightbox[open]', { timeout: 10000 });
  if (await page.locator('.lightbox-status-panel').isVisible()) fail('Lightbox zeigt Sammelstatus');
  await page.keyboard.press('Escape');

  await page.evaluate(() => { location.hash = '#search'; });
  await page.fill('#search-input', 'Pikachu');
  await page.press('#search-input', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('#view-search .browse-login-hint').length > 0, null, { timeout: 30000 });
  if (await page.locator('#view-search input[data-type="g"]').count()) fail('Suche zeigt Haekchen');

  if (errors.length) fail(`Konsolenfehler: ${errors.slice(0, 3).join(' | ')}`);
  console.log('Stoebermodus an: ok');
});

await withFlags(false, async (page, { cardRequests }) => {
  await page.goto(`${base}#dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /Bitte anmelden/.test(document.body.innerText), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  if (await page.evaluate(() => document.body.classList.contains('browse-mode'))) fail('Stoebermodus trotz Schalter aus');
  if (cardRequests.length) fail(`Kartendateien geladen: ${cardRequests.length}`);
  console.log('Stoebermodus aus: ok');
});
