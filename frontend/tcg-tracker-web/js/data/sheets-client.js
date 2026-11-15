import { CONFIG } from '../core/config.js';
import { signIn } from '../core/auth.js';
import {
  EVENT_SHEETS_WRITE_FAILED,
  EVENT_SHEETS_WRITE_RETRY,
  EVENT_SHEETS_WRITE_SUCCESS,
} from '../core/storage-keys.js';

// Roher Zugriff auf die Google-Sheets-API: Lesen, Schreiben, Batch, Retry/Backoff und serielle Schreibwarteschlange.
// Kennt keine Fachlogik (db_*-Blaetter, Caches); sheets-db.js baut darauf auf.

const SHEETS_WRITE_GAP_MS = 90;
let sheetsWriteQueue = Promise.resolve();

// Verwirft wartende Schreibvorgaenge (Reset der Datencaches).
export function resetSheetsWriteQueue() {
  sheetsWriteQueue = Promise.resolve();
}

function quoteSheetName(sheetName) {
  const name = String(sheetName ?? '').replace(/'/g, "''");
  return `'${name}'`;
}

export function buildRange(sheetName, a1Range) {
  return `${quoteSheetName(sheetName)}!${a1Range}`;
}

export function isInvalidRangeError(err) {
  const message = String(err?.result?.error?.message || err?.message || '').toLowerCase();
  return err?.status === 400 || message.includes('invalid_argument') || message.includes('unable to parse range');
}

function waitForDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enqueueSheetsMutation(task, { gapMs = SHEETS_WRITE_GAP_MS } = {}) {
  const runTask = async () => {
    const result = await task();
    if (gapMs > 0) {
      await waitForDelay(gapMs);
    }
    return result;
  };

  const scheduled = sheetsWriteQueue.then(runTask, runTask);
  sheetsWriteQueue = scheduled.catch(() => undefined);
  return scheduled;
}

export async function getValues(range, renderOption = 'UNFORMATTED_VALUE', suppressErrorLog = false) {
  const maxRetries = 6;
  try {
    if (!gapi?.client?.sheets?.spreadsheets?.values?.get) {
      throw new Error('Sheets API nicht initialisiert â€“ bitte melden Sie sich an');
    }
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId: CONFIG.SPREADSHEET_ID,
          range,
          valueRenderOption: renderOption
        });
        return response.result.values || [];
      } catch (err) {
        if (err?.status !== 429 || attempt >= maxRetries) throw err;
        const delay = Math.min(10000, 400 * Math.pow(2, attempt)) + Math.floor(Math.random() * 120);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    return [];
  } catch (err) {
    if (!suppressErrorLog) {
      console.error('[getValues]', err);
    }
    throw err;
  }
}

// Formeln mÃ¼ssen mit FORMULA gelesen werden (z.B. HYPERLINK in Overview)
export async function getFormulas(range) {
  return getValues(range, 'FORMULA');
}

function isRetryableWriteError(err) {
  const status = Number(err?.status || err?.result?.error?.code || 0);
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  const message = String(err?.result?.error?.message || err?.message || '').toLowerCase();
  return message.includes('timeout') || message.includes('temporar') || message.includes('rate limit');
}

function isAuthWriteError(err) {
  const status = Number(err?.status || err?.result?.error?.code || 0);
  if (status === 401 || status === 403) return true;
  const message = String(err?.result?.error?.message || err?.message || '').toLowerCase();
  return message.includes('unauthenticated')
    || message.includes('unauthorized')
    || message.includes('permission denied')
    || message.includes('auth');
}

function buildAuthWriteRecoveryError(err) {
  const wrapped = new Error('Google-Anmeldung abgelaufen. Bitte oben erneut anmelden und die Aktion wiederholen.');
  wrapped.cause = err;
  wrapped.code = 'AUTH_RELOGIN_REQUIRED';
  wrapped.status = Number(err?.status || err?.result?.error?.code || 0) || 401;
  return wrapped;
}

function emitWriteEvent(type, detail) {
  if (typeof window === 'undefined' || !window.dispatchEvent || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

export async function putValues(range, values) {
  const maxRetries = 6;
  let reauthedOnce = false;
  try {
    if (!gapi?.client?.sheets?.spreadsheets?.values?.update) {
      throw new Error('Sheets API nicht initialisiert â€“ bitte melden Sie sich an');
    }
    return await enqueueSheetsMutation(async () => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            range,
            valueInputOption: 'USER_ENTERED',
            resource: { values }
          });
          emitWriteEvent(EVENT_SHEETS_WRITE_SUCCESS, {
            range,
            attemptsUsed: attempt + 1,
            maxRetries
          });
          return;
        } catch (err) {
          if (isAuthWriteError(err) && !reauthedOnce) {
            reauthedOnce = true;
            const canAttemptInteractiveReauth = typeof document === 'undefined' || document.visibilityState === 'visible';
            const reauthed = canAttemptInteractiveReauth
              ? await signIn({ forceConsent: false }).catch(() => false)
              : false;
            if (reauthed) {
              emitWriteEvent(EVENT_SHEETS_WRITE_RETRY, {
                range,
                attempt: attempt + 1,
                maxRetries,
                delayMs: 0,
                status: Number(err?.status || err?.result?.error?.code || 0) || null
              });
              continue;
            }
            throw buildAuthWriteRecoveryError(err);
          }
          if (!isRetryableWriteError(err) || attempt >= maxRetries) throw err;
          const delay = Math.min(10000, 500 * Math.pow(2, attempt)) + Math.floor(Math.random() * 150);
          emitWriteEvent(EVENT_SHEETS_WRITE_RETRY, {
            range,
            attempt: attempt + 1,
            maxRetries,
            delayMs: delay,
            status: Number(err?.status || err?.result?.error?.code || 0) || null
          });
          await waitForDelay(delay);
        }
      }
    });
  } catch (err) {
    emitWriteEvent(EVENT_SHEETS_WRITE_FAILED, {
      range,
      status: Number(err?.status || err?.result?.error?.code || 0) || null,
      message: String(err?.result?.error?.message || err?.message || 'Unbekannter Fehler')
    });
    console.error('[putValues]', err);
    throw err;
  }
}

export async function batchPutValues(updates = []) {
  const normalizedUpdates = (updates || []).filter((entry) => entry?.range && Array.isArray(entry?.values) && entry.values.length > 0);
  if (!normalizedUpdates.length) return;

  const maxRetries = 6;
  let reauthedOnce = false;
  const rangeLabel = normalizedUpdates.length === 1 ? normalizedUpdates[0].range : `${normalizedUpdates.length} ranges`;

  try {
    if (!gapi?.client?.sheets?.spreadsheets?.values?.batchUpdate) {
      for (const entry of normalizedUpdates) {
        await putValues(entry.range, entry.values);
      }
      return;
    }

    return await enqueueSheetsMutation(async () => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await gapi.client.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: CONFIG.SPREADSHEET_ID,
            resource: {
              valueInputOption: 'USER_ENTERED',
              data: normalizedUpdates.map((entry) => ({ range: entry.range, values: entry.values }))
            }
          });
          emitWriteEvent(EVENT_SHEETS_WRITE_SUCCESS, {
            range: rangeLabel,
            attemptsUsed: attempt + 1,
            maxRetries
          });
          return;
        } catch (err) {
          if (isAuthWriteError(err) && !reauthedOnce) {
            reauthedOnce = true;
            const canAttemptInteractiveReauth = typeof document === 'undefined' || document.visibilityState === 'visible';
            const reauthed = canAttemptInteractiveReauth
              ? await signIn({ forceConsent: false }).catch(() => false)
              : false;
            if (reauthed) {
              emitWriteEvent(EVENT_SHEETS_WRITE_RETRY, {
                range: rangeLabel,
                attempt: attempt + 1,
                maxRetries,
                delayMs: 0,
                status: Number(err?.status || err?.result?.error?.code || 0) || null
              });
              continue;
            }
            throw buildAuthWriteRecoveryError(err);
          }
          if (!isRetryableWriteError(err) || attempt >= maxRetries) throw err;
          const delay = Math.min(10000, 500 * Math.pow(2, attempt)) + Math.floor(Math.random() * 150);
          emitWriteEvent(EVENT_SHEETS_WRITE_RETRY, {
            range: rangeLabel,
            attempt: attempt + 1,
            maxRetries,
            delayMs: delay,
            status: Number(err?.status || err?.result?.error?.code || 0) || null
          });
          await waitForDelay(delay);
        }
      }
    });
  } catch (err) {
    emitWriteEvent(EVENT_SHEETS_WRITE_FAILED, {
      range: rangeLabel,
      status: Number(err?.status || err?.result?.error?.code || 0) || null,
      message: String(err?.result?.error?.message || err?.message || 'Unbekannter Fehler')
    });
    console.error('[batchPutValues]', err);
    throw err;
  }
}

export async function clearValues(range) {
  if (!gapi?.client?.sheets?.spreadsheets?.values?.clear) return;
  await enqueueSheetsMutation(async () => {
    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range
    });
  });
}

// Metadaten-API (spreadsheets.get) vorhanden? Fuer Aufrufer mit eigener Fehlermeldung.
export function hasSpreadsheetMetaApi() {
  return Boolean(gapi?.client?.sheets?.spreadsheets?.get);
}

// Tabellen-Metadaten lesen; fields ist optional (ohne fields: komplette Metadaten). Ohne Retry/Queue.
export async function getSpreadsheetMeta(fields) {
  const params = { spreadsheetId: CONFIG.SPREADSHEET_ID };
  if (fields !== undefined) params.fields = fields;
  return gapi.client.sheets.spreadsheets.get(params);
}

// Strukturaenderung (spreadsheets.batchUpdate) mit Requests. Ohne Retry/Queue; Aufrufer entscheiden.
export async function batchUpdateSpreadsheet(requests) {
  return gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    resource: { requests }
  });
}

// Range leeren und werfen, wenn die API fehlt (im Gegensatz zum stillen clearValues). Ohne Queue.
export async function clearRangeStrict(range) {
  if (!gapi?.client?.sheets?.spreadsheets?.values?.clear) {
    throw new Error('Sheets API nicht initialisiert â€“ bitte melden Sie sich an');
  }
  return gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: CONFIG.SPREADSHEET_ID,
    range
  });
}
