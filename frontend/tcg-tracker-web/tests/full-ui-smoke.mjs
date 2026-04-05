import {
  withBrowser,
  gotoReady,
  waitForSelectorStable,
  waitForSaveSettled,
  isLoggedIn,
  retry,
  BASE_URL,
} from './smoke-utils.mjs';

const IGNORE_CONSOLE_PATTERNS = [
  /popup_closed/i,
  /Cross-Origin-Opener-Policy/i,
  /GSI_LOGGER/i,
  /signIn/i,
  /favicon/i,
];

function isIgnorableConsoleMessage(text = '') {
  return IGNORE_CONSOLE_PATTERNS.some((pattern) => pattern.test(text));
}

async function clickIfVisible(page, selector, options = {}) {
  const locator = page.locator(selector).first();
  if (await locator.count() === 0) return false;
  if (!(await locator.isVisible().catch(() => false))) return false;
  await locator.click(options).catch(() => {});
  return true;
}

async function closeOpenDialogs(page) {
  const closeSelectors = [
    '#btn-lightbox-image-close',
    '#btn-lightbox-close',
    '#btn-batch-cancel',
    '#btn-queue-builder-cancel',
    '#btn-manage-sets-cancel',
    '#btn-sheets-retry-close',
    'dialog[open] [data-action="close"]',
    'dialog[open] .btn-secondary',
  ];

  for (const selector of closeSelectors) {
    const handled = await clickIfVisible(page, selector);
    if (handled) {
      await page.waitForTimeout(120);
    }
  }

  await page.evaluate(() => {
    document.querySelectorAll('dialog[open]').forEach((dialog) => {
      if (typeof dialog.close === 'function') dialog.close();
    });
  });
}

async function openSettings(page) {
  await retry(
    async () => {
      await page.locator('#btn-open-settings').click({ timeout: 10000 });
    },
    { retries: 2, delayMs: 200, label: 'Einstellungen öffnen' }
  );
  await page.waitForFunction(() => Array.from(document.querySelectorAll('dialog')).some((d) => d.open && /einstellungen/i.test(d.textContent || '')), undefined, { timeout: 15000 });
}

async function testSettingsAndToolButtons(page) {
  await openSettings(page);

  const settingsDialog = page.locator('dialog[open]').filter({ hasText: 'Einstellungen' }).first();
  if (await settingsDialog.count() === 0) {
    throw new Error('Einstellungsdialog konnte nicht geöffnet werden.');
  }

  const toolsSummary = settingsDialog.locator('summary', { hasText: 'Tools & Wartung' });
  if (await toolsSummary.count()) {
    await toolsSummary.click().catch(() => {});
    await page.waitForTimeout(120);
  }

  const proxyButtons = settingsDialog.locator('[data-proxy-click]');
  const buttonCount = await proxyButtons.count();
  for (let index = 0; index < buttonCount; index += 1) {
    const button = proxyButtons.nth(index);
    const label = (await button.textContent())?.trim() || `tool-${index}`;

    if (/Backup importieren/i.test(label)) continue; // opens file picker

    await button.click().catch(() => {});
    await page.waitForTimeout(200);
    await closeOpenDialogs(page);
  }

  await page.keyboard.press('Escape').catch(() => {});
  await closeOpenDialogs(page);
}

async function testDashboardInteractions(page) {
  await page.evaluate(() => { window.location.hash = '#dashboard'; });
  await page.waitForTimeout(300);
  await waitForSelectorStable(page, '#global-status');

  const dashboardTabs = page.locator('[data-dashboard-view]');
  const tabCount = await dashboardTabs.count();
  for (let index = 0; index < tabCount; index += 1) {
    await dashboardTabs.nth(index).click().catch(() => {});
    await page.waitForTimeout(100);
  }

  await clickIfVisible(page, '#btn-dashboard-compact');
  await page.waitForTimeout(100);
  await clickIfVisible(page, '#btn-dashboard-compact');

  const quickFilters = page.locator('.quick-filter-btn');
  const filterCount = await quickFilters.count();
  for (let index = 0; index < filterCount; index += 1) {
    await quickFilters.nth(index).click().catch(() => {});
    await page.waitForTimeout(80);
  }
  await clickIfVisible(page, '.quick-filters-reset');

  const loggedIn = await isLoggedIn(page);
  if (!loggedIn) {
    console.log('⚠️ Full UI Smoke: Dashboard-Setsuche übersprungen (keine aktive Login-Session).');
  }

  await page.locator('[data-dashboard-view="all"]').click().catch(() => {});
  await page.waitForTimeout(120);

  const dashFilter = page.locator('#dash-filter');
  if (loggedIn && await dashFilter.count()) {
    const expectedPattern = /(Scarlet\s*&\s*Violet|Karmesin\s*&?\s*Purpur)/i;

    await dashFilter.fill('SVI');
    await page.waitForTimeout(420);
    const codeMatches = [
      ...(await page.locator('.dash-set-name').allTextContents()),
      ...(await page.locator('.dash-set-series').allTextContents()),
    ];
    if (!codeMatches.some((text) => expectedPattern.test(text))) {
      throw new Error('Dashboard-Setsuche findet PTCGO-Code „SVI“ noch nicht.');
    }

    await dashFilter.fill('scarlet violet');
    await page.waitForTimeout(420);
    const looseMatches = [
      ...(await page.locator('.dash-set-name').allTextContents()),
      ...(await page.locator('.dash-set-series').allTextContents()),
    ];
    if (!looseMatches.some((text) => expectedPattern.test(text))) {
      throw new Error('Dashboard-Setsuche findet „scarlet violet“ ohne Sonderzeichen noch nicht.');
    }

    await dashFilter.fill('');
    await page.waitForTimeout(220);
  }

  await clickIfVisible(page, '#btn-share');
  await page.waitForTimeout(150);
}

async function testSearchView(page) {
  const loggedIn = await isLoggedIn(page);
  if (!loggedIn) {
    console.log('⚠️ Full UI Smoke: Search-Ansicht übersprungen (keine aktive Login-Session).');
    return;
  }

  await page.evaluate(() => {
    window.SEARCH_HISTORY = ['Base Set', 'Glurak', 'Charizard ex'];
    window.location.hash = '#search';
  });
  await page.waitForTimeout(350);

  const searchState = await page.evaluate(async () => {
    const input = document.getElementById('search-input');
    const list = document.getElementById('search-autocomplete');
    if (!input || !list) return { missing: true };

    input.value = 'b';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 260));

    const firstItem = list.querySelector('.search-ac-item');
    const firstLabel = firstItem?.querySelector('.ac-label')?.textContent?.trim() || '';
    const visibleBeforeBlur = !list.classList.contains('hidden');

    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 120));
    const visibleAfterShortBlur = !list.classList.contains('hidden');

    firstItem?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 150));

    return {
      missing: false,
      firstLabel,
      visibleBeforeBlur,
      visibleAfterShortBlur,
      selectedValue: input.value || '',
    };
  });

  if (searchState.missing) {
    throw new Error('Search-UI nicht gefunden.');
  }
  if (!searchState.visibleBeforeBlur || !searchState.firstLabel) {
    throw new Error('Autocomplete zeigt keine brauchbaren Vorschläge an.');
  }
  if (!searchState.visibleAfterShortBlur) {
    throw new Error('Autocomplete verschwindet zu schnell nach kurzem Blur.');
  }
  if (!searchState.selectedValue) {
    throw new Error('Autocomplete-Auswahl wurde nicht übernommen.');
  }
}

async function testStatsView(page) {
  await page.evaluate(() => { window.location.hash = '#stats'; });
  await page.waitForTimeout(400);

  const statsExists = await page.evaluate(() => Boolean(document.querySelector('#stats-content')));
  if (!statsExists) {
    throw new Error('Statistikansicht fehlt im DOM.');
  }
}

async function testSetViewWhenLoggedIn(page) {
  const loggedIn = await isLoggedIn(page);
  if (!loggedIn) {
    console.log('⚠️ Full UI Smoke: Set-/Import-Interaktionen übersprungen (keine aktive Login-Session).');
    return;
  }

  await page.evaluate(() => { window.location.hash = '#set'; });
  await page.waitForTimeout(300);
  await waitForSelectorStable(page, '#set-selector');

  const hasSetChoice = await page.evaluate(() => {
    const select = document.querySelector('#set-selector');
    if (!select) return false;
    const options = Array.from(select.options || []).filter((opt) => String(opt.value || '').trim());
    if (!options.length) return false;
    if (!String(select.value || '').trim()) {
      select.value = options[0].value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  });

  if (!hasSetChoice) {
    console.log('⚠️ Full UI Smoke: Kein ladbares Set gefunden, auth-spezifische Tests übersprungen.');
    return;
  }

  await clickIfVisible(page, '#btn-load');
  await page.waitForFunction(() => document.querySelectorAll('#cards .card').length > 0, undefined, { timeout: 60000, polling: 300 });

  await clickIfVisible(page, '#btn-bulk-edit');
  await page.waitForTimeout(120);
  await clickIfVisible(page, '#btn-bulk-cancel');

  const firstCardImage = page.locator('#cards .card:not(.hidden) .card-img-wrap').first();
  if (await firstCardImage.count()) {
    await firstCardImage.click().catch(() => {});
    await page.waitForTimeout(180);
    await clickIfVisible(page, '#lightbox-img');
    await page.waitForTimeout(180);
    await clickIfVisible(page, '#btn-lightbox-image-close');
    await clickIfVisible(page, '#btn-lightbox-close');
  }

  const gInput = page.locator('#cards .card:not(.hidden) input[data-type="g"]:not(:disabled)').first();
  if (await gInput.count()) {
    const before = await gInput.isChecked();
    await gInput.click().catch(() => {});
    await waitForSaveSettled(page);
    await clickIfVisible(page, '#btn-undo-last');
    await waitForSaveSettled(page);
    const after = await gInput.isChecked();
    if (after !== before) {
      throw new Error('Undo nach Karten-Toggle stellte den Ursprungszustand nicht wieder her.');
    }
  }

  await clickIfVisible(page, '#btn-audit-panel');
  await page.waitForTimeout(150);
  await clickIfVisible(page, '#btn-audit-clear');
}

async function run() {
  await withBrowser(async (page) => {
    const consoleIssues = [];
    const pageErrors = [];

    page.on('console', (msg) => {
      if (!['error', 'warning'].includes(msg.type())) return;
      const text = msg.text();
      if (isIgnorableConsoleMessage(text)) return;
      consoleIssues.push(`[${msg.type()}] ${text}`);
    });
    page.on('pageerror', (err) => {
      pageErrors.push(String(err?.message || err));
    });
    page.on('dialog', async (dialog) => {
      await dialog.dismiss().catch(() => {});
    });

    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL }).catch(() => {});
    await gotoReady(page, `${BASE_URL}?nocache=${Date.now()}#dashboard`);

    await waitForSelectorStable(page, '#global-status');
    await waitForSelectorStable(page, '#btn-open-settings');

    await testDashboardInteractions(page);
    await testSettingsAndToolButtons(page);
    await testSearchView(page);
    await testStatsView(page);
    await testSetViewWhenLoggedIn(page);

    await closeOpenDialogs(page);

    if (pageErrors.length) {
      throw new Error(`JS-Fehler im Browser: ${pageErrors.join(' | ')}`);
    }
    if (consoleIssues.length) {
      throw new Error(`Unerwartete Browser-Konsoleinträge: ${consoleIssues.join(' | ')}`);
    }

    console.log('✅ Full UI Smoke OK');
  });
}

run().catch((err) => {
  console.error('❌ Full UI Smoke fehlgeschlagen:', err);
  process.exitCode = 1;
});
