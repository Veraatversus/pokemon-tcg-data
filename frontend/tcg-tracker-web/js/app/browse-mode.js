// Stoebermodus ohne Login: ist der Schalter in app-flags.json an, sehen nicht angemeldete Besucher alle Sets,
// Karten, Bilder und Preise aus api/v3; Sammeln bleibt angemeldeten Nutzern vorbehalten. Schalter aus (oder
// Datei fehlt/unlesbar) -> kein API-Zugriff, die App bleibt bei "Bitte anmelden".
// Bewusst DOM-frei: die Anzeige (Navigation, Set-Auswahl, Dashboard) uebernimmt der onEnter-Callback aus app.js.
import { state } from './state.js';
import { loadAppFlags } from '../core/app-flags.js';
import { fetchAllAvailableSets } from '../data/pokemon-api.js?v=20261115-browse-2';
import { loadExcludedSetPredicate, filterExcludedSets } from '../data/excluded-sets.js?v=20261115-browse-2';

/** API-Sets ohne ausgeschlossene/leere Sets, alle als nicht importiert; Reihenfolge wie geliefert. */
export function buildBrowseSets(apiSets, isExcluded) {
  return filterExcludedSets(Array.isArray(apiSets) ? apiSets : [], isExcluded).map((set) => ({ ...set, imported: false }));
}

/**
 * Startet den Stoebermodus, wenn der Schalter an ist und die Sets ladbar sind. -> true im Stoebermodus, sonst false
 * (dann unveraendert "Bitte anmelden").
 */
// Jeder Start und jedes Beenden zaehlt hoch: ein Start, der waehrend des Ladens ueberholt wurde (Login,
// stopBrowseMode, neuer Start), verwirft sein Ergebnis statt einen frischen Login zu ueberschreiben.
let generation = 0;

export async function startBrowseMode({
  loadFlags = loadAppFlags,
  loadSets = fetchAllAvailableSets,
  loadPredicate = loadExcludedSetPredicate,
  onEnter = () => {},
} = {}) {
  const myGeneration = ++generation;
  const overtaken = () => myGeneration !== generation || state.loggedIn;
  const flags = await loadFlags();
  if (!flags?.browseWithoutLogin || overtaken()) return false;
  let sets;
  try {
    const [apiSets, isExcluded] = await Promise.all([loadSets(), loadPredicate()]);
    sets = buildBrowseSets(apiSets, isExcluded);
  } catch {
    return false;
  }
  if (overtaken()) return false;
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

/**
 * Beendet den Stoebermodus (vor dem Laden der Sammlung nach einem Login): bricht einen laufenden Start ab und
 * setzt den Stoeber-Zustand zurueck, damit Dashboard, Set-Ansicht und Statistik die Sammlung neu laden
 * (summaryData null = Summary neu lesen; kein Set offen = Route laedt das Set mit Sammlung neu).
 */
export function stopBrowseMode() {
  generation++;
  state.browseMode = false;
  state.summaryData = null;
  state.currentSet = null;
  state.cards = [];
  state.dbMap = new Map();
}
