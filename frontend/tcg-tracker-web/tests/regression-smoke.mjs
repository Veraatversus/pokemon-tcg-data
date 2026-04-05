import {
  withBrowser,
  gotoReady,
  waitForSelectorStable,
  BASE_URL,
} from './smoke-utils.mjs';

async function run() {
  await withBrowser(async (page) => {
    await gotoReady(page, BASE_URL);

    await waitForSelectorStable(page, '#global-status');
    await waitForSelectorStable(page, '#save-state-pill');

    const hasUndoButton = await page.locator('#btn-undo-last').count();
    const hasAuditButton = await page.locator('#btn-audit-panel').count();
    const hasAuditPanel = await page.locator('#audit-panel').count();
    const hasTopbar = await page.locator('.topbar').count();
    if (!hasUndoButton || !hasAuditButton) {
      throw new Error('Undo/Audit Buttons nicht gefunden.');
    }
    if (!hasAuditPanel || !hasTopbar) {
      throw new Error('Audit-Panel oder Topbar nicht gefunden.');
    }

    const auditPanelHiddenDefault = await page.evaluate(() => {
      const panel = document.querySelector('#audit-panel');
      return panel ? panel.classList.contains('hidden') : false;
    });
    if (!auditPanelHiddenDefault) {
      throw new Error('Audit-Panel sollte initial verborgen sein.');
    }

    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(250);
    await page.mouse.wheel(0, -350);
    await page.waitForTimeout(250);

    const hasTopbarClassState = await page.evaluate(() => {
      return typeof document.body.classList.contains('topbar-collapsed') === 'boolean';
    });
    if (!hasTopbarClassState) {
      throw new Error('Topbar-Scroll-State nicht auswertbar.');
    }

    await page.goto(`${BASE_URL}#search`, { waitUntil: 'domcontentloaded' });
    await waitForSelectorStable(page, '#search-input');

    await page.evaluate(() => {
      window.SEARCH_HISTORY = ['Base Set', 'Glurak', 'Charizard ex'];
    });

    await page.fill('#search-input', 'b');
    await page.waitForTimeout(250);

    const suggestion = page.locator('#search-autocomplete .search-ac-item').filter({ hasText: 'Base Set' }).first();
    if (await suggestion.count() === 0) {
      throw new Error('Autocomplete zeigt keinen Suchvorschlag für einen 1-Zeichen-Query an.');
    }

    await page.locator('#search-input').blur();
    await page.waitForTimeout(120);
    const dropdownStillVisible = await page.evaluate(() => {
      const node = document.querySelector('#search-autocomplete');
      return node ? !node.classList.contains('hidden') : false;
    });
    if (!dropdownStillVisible) {
      throw new Error('Autocomplete verschwindet zu schnell nach kurzem Blur.');
    }

    await suggestion.click();
    await page.waitForTimeout(150);
    const selectedValue = await page.locator('#search-input').inputValue();
    if (selectedValue !== 'Base Set') {
      throw new Error('Autocomplete-Auswahl wurde nicht in das Suchfeld übernommen.');
    }

    console.log('✅ Regression Smoke OK');
  });
}

run().catch((err) => {
  console.error('❌ Regression Smoke fehlgeschlagen:', err);
  process.exitCode = 1;
});
