import {
  withBrowser,
  gotoReady,
  waitForSelectorStable,
  waitForSaveSettled,
  isLoggedIn,
  retry,
  BASE_URL,
} from './smoke-utils.mjs';

const STRICT = process.env.AUTH_SMOKE_STRICT === '1';

async function run() {
  await withBrowser(async (page) => {
    await gotoReady(page, BASE_URL);

    await waitForSelectorStable(page, '#global-status');
    await waitForSelectorStable(page, '#btn-auth');

    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      const msg = '⚠️ Auth Smoke übersprungen: keine aktive Login-Session gefunden.';
      if (STRICT) throw new Error(msg);
      console.log(msg);
      return;
    }

    await page.evaluate(() => {
      window.location.hash = '#set';
    });

    await page.waitForFunction(() => {
      const setView = document.querySelector('#view-set');
      return Boolean(setView && !setView.classList.contains('hidden'));
    }, undefined, { timeout: 30000, polling: 250 });

    await waitForSelectorStable(page, '#set-selector');

    const hasSetChoice = await page.evaluate(() => {
      const select = document.querySelector('#set-selector');
      if (!select) return false;
      const choices = Array.from(select.options || []).filter((opt) => String(opt.value || '').trim());
      if (!choices.length) return false;
      if (!String(select.value || '').trim()) {
        select.value = choices[0].value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    });

    if (!hasSetChoice) {
      const msg = '⚠️ Auth Smoke übersprungen: kein ladbares Set in Auswahl gefunden.';
      if (STRICT) throw new Error(msg);
      console.log(msg);
      return;
    }

    await retry(
      async () => {
        await page.click('#btn-load', { timeout: 10000 });
      },
      { retries: 3, delayMs: 400, label: 'Set laden' }
    );

    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('#cards .card');
      return cards.length > 0;
    }, undefined, { timeout: 60000, polling: 300 });

    const hasEditableCard = await page.locator('#cards .card:not(.hidden) input[data-type="g"]:not(:disabled)').count();
    if (!hasEditableCard) {
      const msg = '⚠️ Auth Smoke übersprungen: keine editierbare Karte gefunden.';
      if (STRICT) throw new Error(msg);
      console.log(msg);
      return;
    }

    const gInput = page.locator('#cards .card:not(.hidden) input[data-type="g"]:not(:disabled)').first();
    const before = await gInput.isChecked();

    await retry(async () => {
      await gInput.click({ timeout: 10000 });
    }, { retries: 3, delayMs: 350, label: 'Toggle 1' });
    await waitForSaveSettled(page);

    await retry(async () => {
      await gInput.click({ timeout: 10000 });
    }, { retries: 3, delayMs: 350, label: 'Rollback Toggle 2' });
    await waitForSaveSettled(page);

    const after = await gInput.isChecked();
    if (after !== before) {
      throw new Error('Rollback fehlgeschlagen: Kartenstatus weicht vom Ausgangszustand ab.');
    }

    await waitForSelectorStable(page, '#btn-undo-last');
    const undoEnabled = await page.evaluate(() => {
      const btn = document.querySelector('#btn-undo-last');
      return Boolean(btn && !btn.disabled);
    });
    if (!undoEnabled) {
      throw new Error('Undo-Button wurde nach Toggle nicht aktiviert.');
    }

    console.log('✅ Auth Smoke OK');
  });
}

run().catch((err) => {
  console.error('❌ Auth Smoke fehlgeschlagen:', err);
  process.exitCode = 1;
});
