import test from 'node:test';
import assert from 'node:assert/strict';

import { tryAutoResumeImport } from '../js/features/collection/import-auto-resume.js';

test('tryAutoResumeImport ist No-Op, wenn importAuthBlocked false ist', async () => {
  const calls = { runImport: 0, showToast: 0, setGlobalStatus: 0 };
  const resumed = await tryAutoResumeImport({
    importAuthBlocked: false,
    runImport: () => { calls.runImport++; },
    showToast: () => { calls.showToast++; },
    setGlobalStatus: () => { calls.setGlobalStatus++; },
  });
  assert.equal(resumed, false);
  assert.equal(calls.runImport, 0);
  assert.equal(calls.showToast, 0);
  assert.equal(calls.setGlobalStatus, 0);
});

test('tryAutoResumeImport ruft runImport, showToast und setGlobalStatus, wenn importAuthBlocked true', async () => {
  const calls = [];
  const resumed = await tryAutoResumeImport({
    importAuthBlocked: true,
    runImport: async () => { calls.push('runImport'); },
    showToast: (msg, kind, ms) => { calls.push(['toast', msg, kind, ms]); },
    setGlobalStatus: (msg) => { calls.push(['status', msg]); },
  });
  assert.equal(resumed, true);
  assert.equal(calls.length, 3);
  // Reihenfolge: showToast -> setGlobalStatus -> runImport
  assert.equal(calls[0][0], 'toast');
  assert.match(calls[0][1], /Login erneuert/);
  assert.equal(calls[0][2], 'info');
  assert.equal(calls[0][3], 3500);
  assert.deepEqual(calls[1], ['status', 'Setze Import fort...']);
  assert.equal(calls[2], 'runImport');
});

test('tryAutoResumeImport ruft KEIN runImport, wenn importAuthBlocked true aber runImport fehlt', async () => {
  const calls = [];
  const resumed = await tryAutoResumeImport({
    importAuthBlocked: true,
    showToast: (msg) => { calls.push(msg); },
  });
  assert.equal(resumed, false);
  assert.equal(calls.length, 0);
});

test('tryAutoResumeImport schluckt Fehler aus runImport, ohne zu eskalieren', async () => {
  const origWarn = console.warn;
  const warns = [];
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };
  try {
    const resumed = await tryAutoResumeImport({
      importAuthBlocked: true,
      runImport: async () => { throw new Error('boom'); },
      showToast: () => {},
    });
    assert.equal(resumed, true);
    assert.ok(warns.some(w => /resume failed/.test(w) && /boom/.test(w)),
      'Erwartet console.warn mit [import-auto-resume] resume failed + Error.message');
  } finally {
    console.warn = origWarn;
  }
});

test('tryAutoResumeImport funktioniert auch ohne showToast und setGlobalStatus', async () => {
  const resumed = await tryAutoResumeImport({
    importAuthBlocked: true,
    runImport: async () => {},
  });
  assert.equal(resumed, true);
});

test('tryAutoResumeImport ist ohne Deps ein sicherer No-Op', async () => {
  const resumed = await tryAutoResumeImport({});
  assert.equal(resumed, false);
});

test('tryAutoResumeImport ruft runImport nur einmal, auch bei verschachteltem Aufruf-Schema', async () => {
  let runCount = 0;
  const slowRun = async () => {
    runCount += 1;
    // Während runImport laeuft, koennte der gleiche Hook nochmal aufgerufen
    // werden – das Ergebnis davon ist nicht Sache dieser Funktion.
    await new Promise(resolve => setTimeout(resolve, 5));
  };
  const resumed = await tryAutoResumeImport({
    importAuthBlocked: true,
    runImport: slowRun,
  });
  assert.equal(resumed, true);
  assert.equal(runCount, 1);
});
