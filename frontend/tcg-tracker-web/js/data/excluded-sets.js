// Von api/v3 ausgeschlossene Sets (meta.json excludedSetIds / excludedSeries, z. B. TCG Pocket) in der App
// ausblenden: Dashboard, Set-Auswahl, Import, Suche und Statistik lesen state.sets/state.allSets, die loadSets
// gefiltert befuellt. Sheet-Zeilen (db_sets, Overview, Sammlung) bleiben unveraendert - nur die Anzeige filtert.
import { loadV3Meta } from './v3-api.js';

const lower = (value) => String(value ?? '').trim().toLowerCase();

export const EXCLUDED_SETS_TIMEOUT_MS = 8_000;

/** Praedikat (set) => true, wenn das Set ausgeschlossen ist: setId/Alias-Zeilen in excludedSetIds oder Serie in excludedSeries. */
export function buildExcludedSetPredicate(meta = null) {
  const ids = new Set((Array.isArray(meta?.excludedSetIds) ? meta.excludedSetIds : []).map(lower).filter(Boolean));
  const series = new Set((Array.isArray(meta?.excludedSeries) ? meta.excludedSeries : []).map(lower).filter(Boolean));
  if (!ids.size && !series.size) return () => false;
  return (set) => {
    if (!set || typeof set !== 'object') return false;
    if (ids.has(lower(set.setId))) return true;
    const aliases = Array.isArray(set.mergedAliasIds) ? set.mergedAliasIds : [];
    if (aliases.some((alias) => ids.has(lower(alias)))) return true;
    const serie = lower(set.tcgdex_serie_id);
    return Boolean(serie) && series.has(serie);
  };
}

/** Neue Liste ohne ausgeschlossene Sets. */
export function filterExcludedSets(sets, isExcluded) {
  const list = Array.isArray(sets) ? sets : [];
  return typeof isExcluded === 'function' ? list.filter((set) => !isExcluded(set)) : list.slice();
}

/**
 * Laedt api/v3/meta.json (Zeitlimit) und liefert das Praedikat. Fehler/Zeitueberschreitung -> nichts ausschliessen,
 * damit die App ohne meta.json nutzbar bleibt.
 */
export async function loadExcludedSetPredicate({ loadMeta = loadV3Meta, timeoutMs = EXCLUDED_SETS_TIMEOUT_MS } = {}) {
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`meta.json: keine Antwort nach ${timeoutMs} ms`)), timeoutMs);
    });
    const meta = await Promise.race([Promise.resolve().then(() => loadMeta()), timeout]);
    return buildExcludedSetPredicate(meta);
  } catch (err) {
    console.warn('[excluded-sets] meta.json nicht lesbar, keine Sets ausgeblendet', err?.message || err);
    return () => false;
  } finally {
    clearTimeout(timer);
  }
}
