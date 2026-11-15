// Stoebermodus ohne Login: ist der Schalter in app-flags.json an, sehen nicht angemeldete Besucher alle Sets,
// Karten, Bilder und Preise aus api/v3; Sammeln bleibt angemeldeten Nutzern vorbehalten. Schalter aus (oder
// Datei fehlt/unlesbar) -> kein API-Zugriff, die App bleibt bei "Bitte anmelden".
// Bewusst DOM-frei: die Anzeige (Navigation, Set-Auswahl, Dashboard) uebernimmt der onEnter-Callback aus app.js.
import { state } from './state.js';
import { loadAppFlags } from '../core/app-flags.js';
import { fetchAllAvailableSets } from '../data/pokemon-api.js?v=20261115-browse';
import { loadExcludedSetPredicate, filterExcludedSets } from '../data/excluded-sets.js?v=20261115-browse';

/** API-Sets ohne ausgeschlossene/leere Sets, alle als nicht importiert; Reihenfolge wie geliefert. */
export function buildBrowseSets(apiSets, isExcluded) {
  return filterExcludedSets(Array.isArray(apiSets) ? apiSets : [], isExcluded).map((set) => ({ ...set, imported: false }));
}

/**
 * Startet den Stoebermodus, wenn der Schalter an ist und die Sets ladbar sind. -> true im Stoebermodus, sonst false
 * (dann unveraendert "Bitte anmelden").
 */
export async function startBrowseMode({
  loadFlags = loadAppFlags,
  loadSets = fetchAllAvailableSets,
  loadPredicate = loadExcludedSetPredicate,
  onEnter = () => {},
} = {}) {
  const flags = await loadFlags();
  if (!flags?.browseWithoutLogin) return false;
  let sets;
  try {
    const [apiSets, isExcluded] = await Promise.all([loadSets(), loadPredicate()]);
    sets = buildBrowseSets(apiSets, isExcluded);
  } catch {
    return false;
  }
  state.browseMode = true;
  state.loggedIn = false;
  state.sets = [];
  state.importedSetsAll = [];
  state.allSets = sets;
  state.dbMap = new Map();
  // Leere Summary: das Dashboard liest dann nicht aus dem (nicht vorhandenen) Sheet.
  state.summaryData = [];
  onEnter(sets);
  return true;
}

/** Beendet den Stoebermodus (vor dem Laden der Sammlung nach einem Login). */
export function stopBrowseMode() {
  state.browseMode = false;
}
