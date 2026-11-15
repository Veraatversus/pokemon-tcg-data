// Schalterdatei app-flags.json (liegt neben index.html, wird per Workflow "Stoebermodus an/aus" je Branch gesetzt).
// Immer frisch geladen (kein Cache, Zeitstempel), damit ein Umschalten nach dem Deploy sofort wirkt.
// Nur ein JSON-Objekt mit browseWithoutLogin === true schaltet den Stoebermodus ein; jeder Fehler -> aus.

const OFF = Object.freeze({ browseWithoutLogin: false });

export async function loadAppFlags({ fetchImpl = globalThis.fetch, url = 'app-flags.json' } = {}) {
  try {
    const res = await fetchImpl(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res?.ok) return { ...OFF };
    const data = await res.json();
    return { browseWithoutLogin: Boolean(data && typeof data === 'object' && data.browseWithoutLogin === true) };
  } catch {
    return { ...OFF };
  }
}
