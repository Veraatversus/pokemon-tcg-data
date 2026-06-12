/**
 * import-auto-resume.js – Auto-Resume eines pausierten Imports nach Re-Login
 *
 * Wenn das Google-Token waehrend eines laengeren Bulk-Imports ablaeuft,
 * pausiert `importSetsSequential` und setzt `state.importAuthBlocked = true`.
 * Der User loggt sich neu ein, `onLoginSuccess()` laeuft – an dieser Stelle
 * soll der Import automatisch wieder anlaufen, ohne dass der User nochmal
 * auf "Alle fehlenden importieren" klicken muss.
 *
 * Die Logik ist als kleine pure Funktion extrahiert, damit sie ohne den
 * vollen App-Bootstrap unit-testbar ist.
 */

/**
 * Entscheidet, ob ein Auto-Resume gefeuert werden soll, und tut es dann.
 *
 * @param {object} deps
 * @param {boolean} deps.importAuthBlocked  - ob der vorherige Import wegen Auth abgebrochen wurde
 * @param {() => Promise<unknown>} deps.runImport  - Import-Starter (z. B. importAllMissingSets)
 * @param {(msg: string, kind?: string, ms?: number) => void} deps.showToast
 * @param {(msg: string) => void} [deps.setGlobalStatus]
 * @returns {Promise<boolean>} true, wenn ein Resume gefeuert wurde
 */
export async function tryAutoResumeImport({
  importAuthBlocked,
  runImport,
  showToast,
  setGlobalStatus = () => {},
} = {}) {
  if (!importAuthBlocked) return false;
  if (typeof runImport !== 'function') return false;

  // Flag sofort clearen, damit ein folgender Login-Versuch (oder ein
  // Re-Trigger dieser Funktion) nicht doppelt feuert.
  // Hinweis: Der Aufrufer muss das Flag in seinem State-Container selbst
  // auf false setzen – diese Funktion ist zustandsfrei.
  showToast?.('Login erneuert. Setze pausierten Import fort...', 'info', 3500);
  setGlobalStatus?.('Setze Import fort...');

  try {
    await runImport();
  } catch (err) {
    // Wenn der Resume selbst fehlschlaegt, nicht eskalieren – der User
    // kann weiterhin manuell "Alle fehlenden importieren" klicken.
    console.warn('[import-auto-resume] resume failed', err);
  }
  return true;
}
