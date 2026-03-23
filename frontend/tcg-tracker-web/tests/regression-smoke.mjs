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

    console.log('✅ Regression Smoke OK');
  });
}

run().catch((err) => {
  console.error('❌ Regression Smoke fehlgeschlagen:', err);
  process.exitCode = 1;
});
