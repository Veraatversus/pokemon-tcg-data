/**
 * @fileoverview Pokemon TCG Collection Tracker für Google Sheets
 * 
 * Dieses Skript verwaltet eine Pokemon-Kartensammlung in Google Sheets.
 * Es integriert Daten von pokemontcg.io und TCGDex APIs, um Kartendaten
 * in deutscher Sprache anzuzeigen und den Sammlungsfortschritt zu tracken.
 * 
 * Hauptfunktionalitäten:
 * - Import und Verwaltung von Pokemon TCG Sets
 * - Anzeige von Karten in einem Grid-Layout
 * - Tracking von normalen und Reverse Holo Karten
 * - Automatische und manuelle Sortierung
 * - Sammlungsstatistiken und Fortschrittsanzeige
 * 
 * @author Pokemon TCG Tracker
 * @version 3.0
 */

// ============================================================================
// GLOBALE KONSTANTEN - API Konfiguration
// ============================================================================

/** @const {boolean} Verwendung der Vera API anstelle der Standard-APIs */
const UseVeraApi = true;

/** @const {string} Spracheinstellung für die Vera API */
const VeraApiLanguage = "en";

/** @const {string} Basis-URL für Vera's Pokemon TCG Daten */
const VTCG_BASE_URL = "https://veraatversus.github.io/pokemon-tcg-data/";

/** @const {string} Basis-URL für TCGDex API (deutsche Kartendaten) */
const TCGDEX_BASE_URL = "https://api.tcgdex.net/v2/de/";

/** @const {string} Basis-URL für pokemontcg.io API */
const PTCG_BASE_URL = "https://api.pokemontcg.io/v2/";

/** @const {number} Verzögerung in ms zwischen API-Aufrufen (Rate Limiting) */
const API_DELAY_MS = 50;

/** @const {string} Die ID des aktiven Google Spreadsheets */
const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();

// Globale Konstante für spezifische ID-Mappings zwischen pokemontcg.io und TCGDex,
// wo automatische Abkürzungen oder Namensabgleiche nicht ausreichen.
const CUSTOM_SET_ID_MAPPINGS = {
  // pokemontcg.io ID (key) : TCGDex ID (value)
  // Diese Mappings werden zuerst geprüft, um spezifische Inkonsistenzen zu behandeln.
  "swsh3.5": "swsh35",
  "sm2.5": "sm25",
  "sm3.5": "sm35",
  "sm7.5": "sm75",
  "swsh4.5": "swsh45",
  // Hinzugefügt basierend auf Benutzerfeedback für potenzielle umgekehrte Zuordnung
  // Dies deckt den Fall ab, dass pokemontcg.io eine ID ohne Punkt und TCGDex eine mit Punkt hat.
  "sm35": "sm3.5",
  "sm75": "sm7.5",
  "swsh35": "swsh3.5",
  "swsh45": "swsh4.5",
  "zsv10pt5": "sv10.5b",
  "rsv10pt5": "sv10.5w"
};


// ============================================================================
// GRID LAYOUT KONSTANTEN - Kartenanzeige
// ============================================================================

/** @const {number} Anzahl der Karten pro Reihe im Grid-Layout */
const CARDS_PER_ROW_IN_GRID = 5;

/** @const {number} Spaltenbreite eines Kartenblocks (ID, Name, Bild, Checkboxen) */
const CARD_BLOCK_WIDTH_COLS = 3;

/** @const {number} Zeilenhöhe eines Kartenblocks (ID/Name, Bild, Checkboxen, Spacer) */
const CARD_BLOCK_HEIGHT_ROWS = 4;

// --- Zeilenhöhen innerhalb eines Kartenblocks ---
/** @const {number} Höhe der ID/Name-Zeile in Pixeln */
const ROW_HEIGHT_ID_NAME = 25;

/** @const {number} Höhe der Bild-Zeile in Pixeln */
const ROW_HEIGHT_IMAGE = 240;

/** @const {number} Höhe der Checkbox/Link-Zeile in Pixeln */
const ROW_HEIGHT_CHECKS_LINK = 30;

/** @const {number} Höhe der Spacer-Zeile zwischen Kartenblöcken */
const ROW_HEIGHT_SPACER = 10;

// --- Spaltenbreiten innerhalb eines Kartenblocks ---
/** @const {number} Breite der ersten Spalte (Karten-ID, G-Checkbox) */
const COLUMN_WIDTH_CARD_COL1 = 40;

/** @const {number} Breite der zweiten Spalte (Name, RH-Checkbox) */
const COLUMN_WIDTH_CARD_COL2 = 40;

/** @const {number} Breite der dritten Spalte (Name Fortsetzung, Cardmarket-Link) */
const COLUMN_WIDTH_CARD_COL3 = 100;

// --- Farben für Sammlungsstatus ---
/** @const {string} Hintergrundfarbe für normal gesammelte Karten (Hellgrün) */
const COLLECTED_COLOR = "#D9EAD3";

/** @const {string} Hintergrundfarbe für Reverse Holo Karten (Hellblau) */
const REVERSE_HOL_COLLECTED_COLOR = "#D0E0F0";

// ============================================================================
// SHEET STRUKTUR KONSTANTEN - Layout und Positionen
// ============================================================================

// --- Set Sheet Header ---
/** @const {number} Anzahl der Header-Zeilen auf Set-Blättern */
const SET_SHEET_HEADER_ROWS = 2;

/** @const {number} Höhe der Header-Zeilen auf Set-Blättern */
const SET_SHEET_HEADER_ROW_HEIGHT = 25;

/** @const {number} Zeile der Sortier-Checkbox auf Set-Blättern */
const SORT_SET_CHECKBOX_ROW = 1;

/** @const {number} Spalten-Offset für Sortier-Checkbox (nach Grid) */
const SORT_SET_CHECKBOX_COL_OFFSET = CARDS_PER_ROW_IN_GRID * CARD_BLOCK_WIDTH_COLS;

// --- Sets Overview Sheet ---
/** @const {number} Anzahl der Header-Zeilen in "Sets Overview" */
const OVERVIEW_HEADER_ROWS = 2;

/** @const {number} Zeile für Titel in "Sets Overview" */
const OVERVIEW_TITLE_ROW = 1;

/** @const {number} Zeile für Zusammenfassung in "Sets Overview" */
const OVERVIEW_SUMMARY_ROW = 2;

/** @const {number} Erste Datenzeile in "Sets Overview" */
const OVERVIEW_DATA_START_ROW = OVERVIEW_HEADER_ROWS + 1;

/** @const {number} Spalte für "Importiert" Checkbox (Spalte I) */
const IMPORTED_CHECKBOX_COL_INDEX = 9;

/** @const {number} Spalte für "Neu importieren" Checkbox (Spalte J) */
const REIMPORT_CHECKBOX_COL_INDEX = 10;

/** @const {number} Spalte für "Übersicht aktualisieren" Header-Checkbox */
const OVERVIEW_REFRESH_CHECKBOX_COL = 10;

// --- Set Sheets - Kartendaten Spalten ---
/** @const {number} Zeile, ab der Kartendaten beginnen (nach Header) */
const CARD_DATA_START_ROW = SET_SHEET_HEADER_ROWS;

/** @const {number} Spaltenindex für Kartennummer (0-basiert) */
const COL_CARD_NUMBER = 0;

/** @const {number} Spaltenindex für Kartenname (0-basiert) */
const COL_CARD_NAME = 1;

/** @const {number} Spaltenindex für Kartenbild (0-basiert) */
const COL_CARD_IMAGE = 2;

// --- Collection Summary Sheet ---
/** @const {number} Anzahl der Header-Zeilen in "Collection Summary" */
const SUMMARY_HEADER_ROWS = 2;

/** @const {number} Zeile für Titel in "Collection Summary" */
const SUMMARY_TITLE_ROW = 1;

/** @const {number} Zeile für Zusammenfassung in "Collection Summary" */
const SUMMARY_SUMMARY_ROW = 2;

/** @const {number} Erste Datenzeile in "Collection Summary" */
const SUMMARY_DATA_START_ROW = SUMMARY_HEADER_ROWS + 1;

/** @const {number} Anzahl der Datenspalten in "Collection Summary" (A-F) */
const COLLECTION_SUMMARY_DATA_COLS = 6;

/** @const {number} Spalte für Header-Checkbox in "Collection Summary" (Spalte G)
 * Früher sortierte sie alle Sets, jetzt löst sie eine Statistik-Aktualisierung aus.
 */
const SUMMARY_SORT_CHECKBOX_COL = 7; // keine Änderung des Werts erforderlich

// ============================================================================
// GLOBALE VARIABLEN - Skript-Status
// ============================================================================

/** @var {number} Timeout für LockService in Millisekunden (30 Sekunden) */
var USER_LOCK_TIMEOUT_MS = 30 * 1000;

/** @const {string} Script Version */
const SCRIPT_VERSION = "3.0.0";

/** @const {number} API Cache Duration (1 Stunde) */
const API_CACHE_DURATION_MS = 3600000;

/** @const {number} Maximale API Retry-Versuche */
const API_MAX_RETRIES = 3;

/** @var {boolean} Flag zur Verhinderung rekursiver Trigger */
var isScriptEditing = false;

// ============================================================================
// SEKTION: UI & MENÜ-FUNKTIONEN
// ============================================================================

/**
 * Erstellt das benutzerdefinierte Menü beim Öffnen der Tabelle.
 * Bietet Zugriff auf alle Hauptfunktionen des Pokemon TCG Trackers.
 * 
 * @function onOpen
 * @memberof UI
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  const mainMenu = ui.createMenu('🎮 Pokémon TCG Tracker');

  // Hauptnavigation
  mainMenu.addItem('📱 Sidebar öffnen', 'openCustomSidebar');
  mainMenu.addSeparator();

  // 📥 Import & Verwaltung
  const importMenu = ui.createMenu('📥 Import & Verwaltung');
  importMenu.addItem('🚀 Setup: Alle Sets laden', 'setupAndImportAllSets');
  importMenu.addItem('➕ Einzelnes Set hinzufügen', 'promptAndPopulateCardsForSet');
  importMenu.addItem('📦 Mehrere Sets (Batch)', 'batchImportSets');
  importMenu.addItem('🌐 Alle Sets importieren (alle)', 'importAllSetsFromOverview');
  importMenu.addItem('🔃 Aktuelles Set reimportieren', 'reimportCurrentSet');
  mainMenu.addSubMenu(importMenu);

  // 🔍 Suche & Filter
  const searchMenu = ui.createMenu('🔍 Suche & Filter');
  searchMenu.addItem('🔎 Karte suchen', 'searchCard');
  searchMenu.addItem('🎯 Sammlung filtern', 'filterCollectionSummary');
  mainMenu.addSubMenu(searchMenu);

  // 📊 Statistik & Anzeige
  const statsMenu = ui.createMenu('📊 Statistik & Anzeige');
  statsMenu.addItem('📈 Quick-Stats', 'showQuickStats');
  statsMenu.addItem('♻️ Statistik aktualisieren', 'updateCollectionSummary');
  statsMenu.addItem('🔄 Importierte Sets neu laden', 'updateAllCardSheets');
  mainMenu.addSubMenu(statsMenu);

  // 🗂️ Sortierung & Bearbeitung
  const sortMenu = ui.createMenu('🗂️ Sortierung & Bearbeitung');
  sortMenu.addItem('↗️ Set sortieren', 'manualSortCurrentSheet');
  sortMenu.addItem('↗️ Alle Sets sortieren', 'manualSortAllSheets'); // menüeintrag bleibt bestehen, Checkbox agiert nun anders
  sortMenu.addItem('✏️ Bulk-Edit', 'bulkEditSet');
  const autoSortMenu = ui.createMenu('⚙️ Auto-Sortierung');
  autoSortMenu.addItem('✅ Aktivieren', 'installSortTrigger');
  autoSortMenu.addItem('❌ Deaktivieren', 'uninstallSortTrigger');
  sortMenu.addSubMenu(autoSortMenu);
  mainMenu.addSubMenu(sortMenu);

  // 💾 Export & Backup
  const backupMenu = ui.createMenu('💾 Export & Backup');
  backupMenu.addItem('📤 CSV exportieren', 'exportCollectionToCSV');
  backupMenu.addItem('📥 CSV importieren (Export-Datei)', 'showCsvImportDialog');
  backupMenu.addItem('♻️ Script-Backup wiederherstellen', 'restoreFromBackup');
  mainMenu.addSubMenu(backupMenu);

  // ⚠️ Verwaltung
  const adminMenu = ui.createMenu('⚠️ Verwaltung');
  adminMenu.addItem('🗑️ Set löschen', 'deleteCurrentSet');
  adminMenu.addItem('💥 ALLE LÖSCHEN', 'deleteAllPersistentData');
  mainMenu.addSubMenu(adminMenu);

    // 🔧 Migration
    const migrateMenu = ui.createMenu('🔧 Migration');
    migrateMenu.addItem('🔄 Persistente Daten aus Blättern wiederherstellen', 'rebuildPersistentDataFromSheets');
    migrateMenu.addItem('🔀 TCGdex-IDs migrieren', 'migrateLegacyTcgdexSetIds');
    mainMenu.addSubMenu(migrateMenu);

  // 🐞 Entwicklung
  const devMenu = ui.createMenu('🐞 Entwicklung');
  devMenu.addItem('🧪 onEdit testen', 'debugOnEdit');
  devMenu.addItem('📋 Logs anzeigen', 'showLogs');
  mainMenu.addSubMenu(devMenu);

  mainMenu.addToUi();
}

/**
 * Filtert Collection Summary nach Abschlussstatus.
 * 
 * @function filterCollectionSummary
 */
function filterCollectionSummary() {
  const ui = SpreadsheetApp.getUi();
  
  const response = ui.prompt(
    '🔍 Sammlung filtern',
    'Filter auswählen:\n1 = Abgeschlossen (100%)\n2 = In Arbeit (1-99%)\n3 = Nicht begonnen (0%)\n4 = Alle anzeigen\n\nGeben Sie eine Zahl ein:',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  
  const filterChoice = response.getResponseText().trim();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const summarySheet = ss.getSheetByName('Collection Summary');
  
  if (!summarySheet || summarySheet.getLastRow() < SUMMARY_DATA_START_ROW + 1) {
    ui.alert('ℹ️ Info', 'Keine Daten zum Filtern gefunden.', ui.ButtonSet.OK);
    return;
  }
  
  const numRows = summarySheet.getLastRow() - SUMMARY_DATA_START_ROW;
  
  // Entferne vorhandene Filter
  const filter = summarySheet.getFilter();
  if (filter) {
    filter.remove();
  }
  
  // Erstelle neuen Filter
  const range = summarySheet.getRange(SUMMARY_DATA_START_ROW + 1, 1, numRows, 7);
  const newFilter = range.createFilter();
  
  // Wende Filter an (Spalte 5 = Completion %)
  switch(filterChoice) {
    case '1': // Abgeschlossen
      newFilter.setColumnFilterCriteria(5, SpreadsheetApp.newFilterCriteria()
        .whenNumberEqualTo(1)
        .build());
      SpreadsheetApp.getActive().toast('Filter: Abgeschlossene Sets', '✅ Gefiltert', 3);
      break;
    case '2': // In Arbeit
      newFilter.setColumnFilterCriteria(5, SpreadsheetApp.newFilterCriteria()
        .whenNumberBetween(0.01, 0.99)
        .build());
      SpreadsheetApp.getActive().toast('Filter: Sets in Arbeit', '🔄 Gefiltert', 3);
      break;
    case '3': // Nicht begonnen
      newFilter.setColumnFilterCriteria(5, SpreadsheetApp.newFilterCriteria()
        .whenNumberEqualTo(0)
        .build());
      SpreadsheetApp.getActive().toast('Filter: Nicht begonnene Sets', '⭕ Gefiltert', 3);
      break;
    case '4': // Alle
      newFilter.remove();
      SpreadsheetApp.getActive().toast('Filter entfernt', 'ℹ️ Alle anzeigen', 3);
      break;
    default:
      ui.alert('❌ Fehler', 'Ungültige Auswahl. Bitte 1-4 eingeben.', ui.ButtonSet.OK);
      return;
  }
}

/**
 * Gibt Statistiken für die Sidebar zurück.
 * 
 * @function getSidebarStats
 * @returns {Object} Statistik-Objekt
 */
function getSidebarStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const summarySheet = ss.getSheetByName("Collection Summary");
  
  let stats = {
    totalCards: 0,
    collectedCards: 0,
    reverseHoloCards: 0,
    totalSets: 0,
    completedSets: 0
  };
  
  if (!summarySheet || summarySheet.getLastRow() < SUMMARY_DATA_START_ROW + 1) {
    return stats;
  }
  
  try {
    const numRows = summarySheet.getLastRow() - SUMMARY_DATA_START_ROW;
    if (numRows > 0) {
      const data = summarySheet.getRange(SUMMARY_DATA_START_ROW + 1, 1, numRows, 5).getValues();
      
      stats.totalSets = data.length;
      data.forEach(row => {
        stats.totalCards += row[1] || 0;
        stats.collectedCards += row[2] || 0;
        stats.reverseHoloCards += row[3] || 0;
        if (row[4] >= 1.0) stats.completedSets++;
      });
    }
  } catch (e) {
    Logger.log(`Fehler beim Laden der Sidebar-Statistiken: ${e.message}`);
  }
  
  return stats;
}

// ============================================================================
// SEKTION: STRING- & ID-NORMALISIERUNG
// ============================================================================

/**
 * Normalisiert einen String durch Kleinschreibung und Entfernung von Sonderzeichen.
 * 
 * Verwendet für:
 * - Set-Namen-Abgleich zwischen APIs
 * - Konsistente String-Vergleiche
 * 
 * @function normalizeString
 * @param {string} str - Der zu normalisierende String
 * @returns {string} Normalisierter String (nur Kleinbuchstaben und Zahlen)
 * 
 * @example
 * normalizeString("Base Set") // returns "baseset"
 * normalizeString("Sword & Shield") // returns "swordshield"
 */
function normalizeString(str) {
  if (str === null || typeof str === 'undefined') {
    return "";
  }
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Normalisiert eine Set-ID für API-übergreifenden Abgleich.
 * 
 * Transformationen:
 * - Entfernt führende Nullen in Zahlen ("sv08" → "sv8")
 * - Ersetzt "." durch "pt" bei Versionsnummern ("sv8.5" → "sv8pt5")
 * - Ersetzt Leerzeichen durch Bindestriche ("Base Set" → "base-set")
 * - Entfernt Sonderzeichen
 * 
 * @function normalizeSetId
 * @param {string} setId - Die zu normalisierende Set-ID
 * @returns {string} Normalisierte Set-ID
 * 
 * @example
 * normalizeSetId("sv08.5") // returns "sv8pt5"
 * normalizeSetId("Base Set") // returns "baseset"
 */
function normalizeSetId(setId) {
  if (!setId) return "";
  let normalized = String(setId).toLowerCase().trim();

  // Ersetze '.' durch 'pt' nur wenn es Teil einer numerischen Version ist (z.B. 8.5)
  // Nicht bei "base.set" oder ähnlichem
  normalized = normalized.replace(/(\d+)\.(\d+)/g, (match, p1, p2) => `${parseInt(p1, 10)}pt${parseInt(p2, 10)}`);

  // Ersetze ' ' durch '-'
  normalized = normalized.replace(/\s+/g, '-');

  // Entferne alle nicht-alphanumerischen Zeichen außer Bindestriche, dann führende Nullen in numerischen Teilen
  normalized = normalized.replace(/[^a-z0-9-]/g, "");

  // Entferne führende Nullen in numerischen Segmenten (z.B. "sv08" -> "sv8", "base01" -> "base1")
  normalized = normalized.replace(/([a-z-]+)(\d+)/g, (match, p1, p2) => {
    return p1 + parseInt(p2, 10);
  });

  return normalized;
}

/**
 * Liefert mögliche Alias-Varianten einer Set-ID (inkl. Custom Mappings vor/zurück).
 *
 * @param {string} setId - Eingabe-ID (z.B. "TCGDEX-sv10.5b" oder "zsv10pt5")
 * @returns {Array<string>} Eindeutige Kandidaten-IDs
 */
function buildSetIdAliasCandidates(setId) {
  if (!setId) return [];

  const raw = String(setId).trim();
  const unprefixed = raw.replace(/^TCGDEX-/i, '');
  const candidates = new Set([raw, unprefixed]);

  const baseKeys = [raw.toLowerCase(), unprefixed.toLowerCase()];

  // Direkte Custom-Mappings (pokemontcg -> tcgdex)
  baseKeys.forEach(key => {
    const mapped = CUSTOM_SET_ID_MAPPINGS[key];
    if (mapped) candidates.add(mapped);
  });

  // Reverse Custom-Mappings (tcgdex -> pokemontcg)
  const normalizedBase = normalizeSetId(unprefixed);
  for (const [pokeId, tcgdexId] of Object.entries(CUSTOM_SET_ID_MAPPINGS)) {
    if (
      String(tcgdexId).toLowerCase() === unprefixed.toLowerCase() ||
      normalizeSetId(tcgdexId) === normalizedBase
    ) {
      candidates.add(pokeId);
    }
  }

  return Array.from(candidates).filter(Boolean);
}

/**
 * Prüft, ob zwei Set-IDs als gleiches Set gelten (Normalisierung + Custom Mapping).
 *
 * @param {string} setIdA
 * @param {string} setIdB
 * @returns {boolean}
 */
function areSetIdsEquivalent(setIdA, setIdB) {
  if (!setIdA || !setIdB) return false;
  if (String(setIdA).trim().toLowerCase() === String(setIdB).trim().toLowerCase()) return true;

  const aNorm = new Set(
    buildSetIdAliasCandidates(setIdA).map(id => normalizeSetId(String(id).replace(/^TCGDEX-/i, '')))
  );
  const bNorm = buildSetIdAliasCandidates(setIdB).map(id => normalizeSetId(String(id).replace(/^TCGDEX-/i, '')));

  return bNorm.some(n => aNorm.has(n));
}

/**
 * Löst eine Set-ID auf eine kanonische Ziel-ID auf Basis eines Normalized->Canonical-Mappings auf.
 * Berücksichtigt Custom-Mappings und TCGDEX-Präfixe.
 *
 * @param {string} inputSetId
 * @param {Map<string,string>} normalizedToCanonicalMap
 * @param {Set<string>} [canonicalSetIds]
 * @returns {string|null}
 */
function resolveCanonicalSetIdFromMap(inputSetId, normalizedToCanonicalMap, canonicalSetIds = null) {
  const aliases = buildSetIdAliasCandidates(inputSetId);

  if (canonicalSetIds) {
    for (const alias of aliases) {
      if (canonicalSetIds.has(alias)) return alias;
    }
  }

  for (const alias of aliases) {
    const normalizedAlias = normalizeSetId(String(alias).replace(/^TCGDEX-/i, ''));
    if (normalizedToCanonicalMap.has(normalizedAlias)) {
      return normalizedToCanonicalMap.get(normalizedAlias);
    }
  }

  return null;
}

/**
 * Normalisiert eine Kartennummer durch Entfernung führender Nullen.
 * 
 * Wichtig für konsistente Lookups zwischen TCGDex (mit Nullen) und
 * pokemontcg.io (ohne Nullen).
 * 
 * @function normalizeCardNumber
 * @param {string} cardNumber - Die zu normalisierende Kartennummer
 * @returns {string} Normalisierte Kartennummer ohne führende Nullen
 * 
 * @example
 * normalizeCardNumber("sv10-001") // returns "sv10-1"
 * normalizeCardNumber("XY005") // returns "XY5"
 * normalizeCardNumber("007a") // returns "7a"
 */
function normalizeCardNumber(cardNumber) {
  if (!cardNumber) return "";
  let normalized = String(cardNumber).trim();

  // Regex, um den String in Präfix (nicht-numerisch), numerischen Teil und Suffix (falls vorhanden) zu zerlegen.
  // Fängt Muster wie "SV001", "007a", "Promo_01" ab.
  const match = normalized.match(/^([a-zA-Z._-]*?)(\d+)([a-zA-Z._-]*)$/);

  if (match) {
    const prefix = match[1];
    const numericPart = match[2];
    const suffix = match[3];

    // Entferne führende Nullen vom numerischen Teil
    const cleanedNumeric = parseInt(numericPart, 10).toString();
    return `${prefix}${cleanedNumeric}${suffix}`;
  }

  // Wenn kein numerischer Teil gefunden wird oder das Format nicht passt, gib den Originalwert zurück.
  // Dies deckt IDs wie "RC1", "A1a" ab, die keine reinen Zahlen mit Nullen haben.
  return normalized;
}


// ============================================================================
// SEKTION: API-ZUGRIFF & DATEN-ABRUF
// ============================================================================

/**
 * Ruft Daten von einer externen API ab (Legacy-Funktion).
 * 
 * @deprecated Verwenden Sie stattdessen {@link fetchApiData}
 * @function fetchData
 * @param {string} url - Die URL der API-Anfrage
 * @returns {Object|null} Geparste JSON-Antwort oder null bei Fehler
 */
function fetchData(url) {
  try {
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true
    });
    const json = response.getContentText();
    const data = JSON.parse(json);
    Utilities.sleep(API_DELAY_MS); // Ratenbegrenzung
    return data;
  } catch (e) {
    Logger.log(`Fehler beim Abrufen von Daten von ${url}: ${e.message}`);
    return null;
  }
}

/**
 * Ruft Daten von einer externen API ab mit Fehlerbehandlung.
 * 
 * Features:
 * - Automatische HTTP-Fehlerbehandlung
 * - JSON-Parsing mit Error-Handling
 * - Logging für Debugging
 * - Spezial-Logging für TCGDex-Antworten
 * 
 * @function fetchApiData
 * @param {string} url - URL des API-Endpunkts
 * @param {string} errorMessagePrefix - Präfix für Fehlermeldungen im Log
 * @returns {Object|null} Geparste JSON-Daten oder null bei Fehler
 * 
 * @example
 * const sets = fetchApiData(`${TCGDEX_BASE_URL}sets`, "Fehler beim Laden der Sets");
 */
function fetchApiData(url, errorMessagePrefix) {
  // `getUi()` is not available in trigger time-driven contexts; wrap in try/catch
  let ui = null;
  try {
    ui = SpreadsheetApp.getUi(); // Holt die Benutzeroberfläche der Tabelle.
  } catch (err) {
    // Running in a non-interactive context (e.g. time trigger) – UI not accessible
    ui = null;
  }
  try {
    const options = { 'muteHttpExceptions': true }; // Unterdrückt HTTP-Ausnahmen, um sie manuell zu behandeln.
    const res = UrlFetchApp.fetch(url, options); // Führt den HTTP-Request aus.

    if (res.getResponseCode() !== 200) {
      Logger.log(`${errorMessagePrefix} API Fehler ${res.getResponseCode()}: ${res.getContentText()}`);
      // ui.alert(`${errorMessagePrefix} API Fehler: ${res.getResponseCode()}. Details im Log.`); // Deaktiviert, da dies in Schleifen zu viele Popups verursachen kann
      return null;
    }
    const content = res.getContentText();
    // Zusätzliches Logging für TCGDex-Antworten, um deutsche Inhalte zu prüfen
    if (url.includes(TCGDEX_BASE_URL)) {
      Logger.log(`TCGDex API Response from ${url}: ${content.substring(0, Math.min(content.length, 500))}...`); // Loggt die ersten 500 Zeichen
    }
    return JSON.parse(content); // Parst die JSON-Antwort.
  } catch (e) {
    Logger.log(`${errorMessagePrefix} Fehler: ${e.message} \nStack: ${e.stack}`);
    // ui.alert(`${errorMessagePrefix} Fehler: ${e.message}. Details im Log.`); // Deaktiviert, da dies in Schleifen zu viele Popups verursachen kann
    return null;
  }
}

/**
 * Lädt TCGDex Sets-Liste mit Caching (1 Stunde).
 * 
 * Cache-Strategie:
 * - Speichert TCGDex Sets für 1 Stunde in Properties
 * - Reduziert API-Calls bei häufigen Sortier-Operationen
 * - Cache wird automatisch invalidiert nach Ablauf
 * 
 * @function loadTcgdexSetsWithCache
 * @returns {Array<Object>} Liste aller TCGDex Sets
 */
function loadTcgdexSetsWithCache() {
  const cacheKey = 'cachedTcgdexSets';
  const cacheTimestampKey = 'cachedTcgdexSetsTimestamp';
  const properties = PropertiesService.getScriptProperties();
  
  const cachedTimestamp = properties.getProperty(cacheTimestampKey);
  const now = Date.now();
  
  // Prüfe ob Cache gültig ist
  if (cachedTimestamp && (now - parseInt(cachedTimestamp)) < API_CACHE_DURATION_MS) {
    const cached = properties.getProperty(cacheKey);
    if (cached) {
      const age = Math.round((now - parseInt(cachedTimestamp)) / 1000);
      Logger.log(`[TCGDex Cache] Hit - ${age}s alt`);
      return JSON.parse(cached);
    }
  }
  
  // Cache abgelaufen oder nicht vorhanden - neu laden
  Logger.log('[TCGDex Cache] Miss - lade von API');
  const sets = fetchApiData(`${TCGDEX_BASE_URL}sets`, "Fehler beim Laden der TCGDex Sets");
  
  if (sets) {
    try {
      properties.setProperty(cacheKey, JSON.stringify(sets));
      properties.setProperty(cacheTimestampKey, now.toString());
      Logger.log(`[TCGDex Cache] ${sets.length} Sets gespeichert`);
    } catch (e) {
      Logger.log(`[TCGDex Cache] Speichern fehlgeschlagen: ${e.message}`);
    }
  }
  
  return sets || [];
}

/**
 * Löscht den TCGDex Sets Cache.
 * Sollte beim Setup/Import aufgerufen werden.
 * 
 * @function clearTcgdexCache
 */
function clearTcgdexCache() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty('cachedTcgdexSets');
  properties.deleteProperty('cachedTcgdexSetsTimestamp');
  Logger.log('[TCGDex Cache] Gelöscht');
}

/**
 * Lädt und kombiniert Kartendaten aus verschiedenen Quellen.
 * 
 * Unterstützt:
 * - TCGDex-only Sets (deutsche Karten ohne pokemontcg.io Daten)
 * - pokemontcg.io Sets mit TCGDex-Anreicherung (deutsche Namen/Bilder)
 * 
 * Prozess:
 * 1. Erkennt Set-Typ (TCGDex-only vs. pokemontcg.io)
 * 2. Lädt Kartendaten von primärer Quelle
 * 3. Merged deutsche TCGDex-Daten wenn verfügbar
 * 4. Normalisiert Kartennummern für konsistente IDs
 * 5. Extrahiert Cardmarket-URLs
 * 
 * @function loadCardsForSet
 * @param {string} setId - Set-ID (pokemontcg.io oder TCGDEX-prefixed)
 * @param {string} setName - Name des Sets für Logging
 * @param {Array<Object>} tcgdexAllSets - Liste aller TCGDex Sets für Matching
 * @returns {{allCards: Array<Object>, cardmarketData: Object, tcgdexDetailedSet: Object|null, pokemontcgDetailedSet: Object|null}}
 * @throws {Error} Wenn Kartendaten nicht geladen werden können
 * 
 * @example
 * const data = loadCardsForSet("sv08", "Surging Sparks", allTcgdexSets);
 * console.log(data.allCards.length); // Anzahl der Karten
 */
function loadCardsForSet(setId, setName, tcgdexAllSets) {
  let allCards = [];
  let cardmarketData = {};
  let tcgdexDetailedSet = null;
  let pokemontcgDetailedSet = null;
  const TCGDEX_ASSETS_BASE_URL = "https://assets.tcgdex.net/de";
  
  const resolveTcgdexImageUrl = (tcgdexSetId, tcgdexCard) => {
    if (tcgdexCard?.image) {
      return `${tcgdexCard.image}/low.jpg`;
    }
    const localId = normalizeCardNumber(tcgdexCard?.localId || tcgdexCard?.id || "");
    if (!tcgdexSetId || !localId) {
      return null;
    }
    return `${TCGDEX_ASSETS_BASE_URL}/${encodeURIComponent(tcgdexSetId)}/${encodeURIComponent(localId)}/low.webp`;
  };

  const isTcgdexOnlySet = setId.startsWith('TCGDEX-');

  if (isTcgdexOnlySet) {
    const tcgdexActualSetId = setId.substring('TCGDEX-'.length);
    tcgdexDetailedSet = fetchApiData(`${TCGDEX_BASE_URL}sets/${tcgdexActualSetId}`, `Fehler beim Laden der TCGDex Karten für ${setName}`);
    
    if (tcgdexDetailedSet && tcgdexDetailedSet.cards) {
      allCards = tcgdexDetailedSet.cards.map(card => ({
        number: normalizeCardNumber(card.localId || card.id),
        name: card.name,
        images: { small: resolveTcgdexImageUrl(tcgdexActualSetId, card) },
        cardmarket: { url: card.links?.cardmarket }
      }));
      allCards.sort((a, b) => naturalSort(a.number || "", b.number || ""));
    }
  } else {
    // pokemontcg.io Set
    const pokemontcgSetId = setId;
    
    if (UseVeraApi) {
      pokemontcgDetailedSet = fetchApiData(`${VTCG_BASE_URL}sets/${VeraApiLanguage}.json`, `Fehler beim Laden der pokemontcg.io Set-Daten für ${setName}`)?.find(set => set.id === setId);
    } else {
      const response = fetchApiData(`${PTCG_BASE_URL}sets/${pokemontcgSetId}`, `Fehler beim Laden der pokemontcg.io Set-Daten für ${setName}`);
      pokemontcgDetailedSet = response?.data;
    }

    if (!pokemontcgDetailedSet) {
      throw new Error(`Konnte pokemontcg.io Set-Daten für "${setName}" nicht abrufen.`);
    }

    let pokemontcgCards = fetchAllPokemontcgIoCards(pokemontcgSetId, setName);
    const matchingTcgdexSet = findMatchingTcgdexSet(pokemontcgDetailedSet, tcgdexAllSets || []);
    
    let tcgdexCardsMap = new Map();
    if (matchingTcgdexSet) {
      tcgdexDetailedSet = fetchApiData(`${TCGDEX_BASE_URL}sets/${matchingTcgdexSet.id}`, `Fehler beim Laden der TCGDex Karten für ${setName}`);
      if (tcgdexDetailedSet && tcgdexDetailedSet.cards) {
        tcgdexDetailedSet.cards.forEach(card => tcgdexCardsMap.set(normalizeCardNumber(card.localId || card.id), card));
      }
    }

    allCards = pokemontcgCards.map(pokemontcgCard => {
      const mergedCard = { ...pokemontcgCard };
      const tcgdexCard = tcgdexCardsMap.get(normalizeCardNumber(pokemontcgCard.number));

      if (tcgdexCard) {
        if (tcgdexCard.name) mergedCard.name = tcgdexCard.name;
        const tcgdexImageUrl = resolveTcgdexImageUrl(matchingTcgdexSet?.id, tcgdexCard);
        if (tcgdexImageUrl) mergedCard.images = { small: tcgdexImageUrl };
        if (tcgdexCard.description) {
          mergedCard.rules = [tcgdexCard.description];
          mergedCard.flavorText = tcgdexCard.description;
        }
      }
      return mergedCard;
    });

    if (tcgdexDetailedSet && tcgdexDetailedSet.cards) {
      const existingCardNumbers = new Set(
        pokemontcgCards.map(card => normalizeCardNumber(card.number))
      );

      tcgdexDetailedSet.cards.forEach(tcgdexCard => {
        const normalizedTcgdexNumber = normalizeCardNumber(tcgdexCard.localId || tcgdexCard.id);
        if (!existingCardNumbers.has(normalizedTcgdexNumber)) {
          const tcgdexCardmarketUrl = tcgdexCard.links?.cardmarket || null;
          const tcgdexImageUrl = tcgdexCard?.image ? `${tcgdexCard.image}/low.jpg` : null;
          const pokemontcgImageUrl = `https://images.pokemontcg.io/${pokemontcgSetId}/${normalizedTcgdexNumber}.png`;
          allCards.push({
            id: tcgdexCard.id,
            number: normalizedTcgdexNumber,
            name: tcgdexCard.name,
            images: { small: tcgdexImageUrl || pokemontcgImageUrl },
            cardmarket: { url: tcgdexCardmarketUrl }
          });

          if (tcgdexCardmarketUrl) {
            cardmarketData[normalizedTcgdexNumber] = { cardmarketUrl: tcgdexCardmarketUrl };
          }
        }
      });
    }

    allCards.sort((a, b) => naturalSort(a.number || "", b.number || ""));

    pokemontcgCards.forEach(card => {
      if (card.cardmarket?.url) {
        cardmarketData[normalizeCardNumber(card.number)] = { cardmarketUrl: card.cardmarket.url };
      }
    });
    setScriptPropertiesData(`pokemontcgIoCardmarketUrls_${pokemontcgSetId}`, cardmarketData);
  }

  return { allCards, cardmarketData, tcgdexDetailedSet, pokemontcgDetailedSet };
}

/**
 * Lädt TCGDex Sets-Liste mit Caching (1 Stunde).
 * 
 * Cache-Strategie:
 * - Speichert TCGDex Sets für 1 Stunde in Properties
 * - Reduziert API-Calls bei häufigen Sortier-Operationen
 * - Cache wird bei Setup neu geladen
 * 
 * @function loadTcgdexSetsWithCache
 * @returns {Array<Object>} Liste aller TCGDex Sets
 */
function loadTcgdexSetsWithCache() {
  const cacheKey = 'cachedTcgdexSets';
  const cacheTimestampKey = 'cachedTcgdexSetsTimestamp';
  const properties = PropertiesService.getScriptProperties();
  
  const cachedTimestamp = properties.getProperty(cacheTimestampKey);
  const now = Date.now();
  
  // Prüfe ob Cache gültig ist
  if (cachedTimestamp && (now - parseInt(cachedTimestamp)) < API_CACHE_DURATION_MS) {
    const cached = properties.getProperty(cacheKey);
    if (cached) {
      Logger.log(`[TCGDex Cache] Hit - ${Math.round((now - parseInt(cachedTimestamp)) / 1000)}s alt`);
      return JSON.parse(cached);
    }
  }
  
  // Cache abgelaufen oder nicht vorhanden - neu laden
  Logger.log('[TCGDex Cache] Miss - lade von API');
  const sets = fetchApiData(`${TCGDEX_BASE_URL}sets`, "Fehler beim Laden der TCGDex Sets");
  
  // Speichere im Cache
  try {
    properties.setProperty(cacheKey, JSON.stringify(sets));
    properties.setProperty(cacheTimestampKey, now.toString());
    Logger.log(`[TCGDex Cache] ${sets.length} Sets gespeichert`);
  } catch (e) {
    Logger.log(`[TCGDex Cache] Speichern fehlgeschlagen: ${e.message}`);
  }
  
  return sets;
}

/**
 * Löscht den TCGDex Sets Cache.
 * Sollte beim Setup aufgerufen werden.
 */
function clearTcgdexCache() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty('cachedTcgdexSets');
  properties.deleteProperty('cachedTcgdexSetsTimestamp');
  Logger.log('[TCGDex Cache] Gelöscht');
}

// ============================================================================
// SEKTION: SET-MATCHING (pokemontcg.io <-> TCGDex)
// ============================================================================

/**
 * Findet ein passendes TCGDex-Set zu einem pokemontcg.io Set.
 * 
 * Matching-Strategie (nach Priorität):
 * 1. Custom Mappings (vordefinierte ID-Zuordnungen)
 * 2. Direkte ID-Übereinstimmung
 * 3. Normalisierte ID-Übereinstimmung
 * 4. PTCGO Code Match (Abkürzungen)
 * 5. Normalisierter Name Match (exakt und partiell)
 * 
 * @function findMatchingTcgdexSet
 * @param {Object} pokemontcgIoSet - Das pokemontcg.io Set-Objekt
 * @param {Array<Object>} allTcgdexSets - Liste aller TCGDex Set-Objekte
 * @returns {Object|null} Passendes TCGDex Set oder null
 * 
 * @example
 * const tcgdexSet = findMatchingTcgdexSet(
 *   { id: 'sv08', name: 'Surging Sparks', ptcgoCode: 'SPS' },
 *   allTcgdexSets
 * );
 */
function findMatchingTcgdexSet(pokemontcgIoSet, allTcgdexSets) {
  // Nutze gecachte TCGDex Sets falls nicht übergeben
  if (!allTcgdexSets) {
    allTcgdexSets = loadTcgdexSetsWithCache();
  }
  
  if (!pokemontcgIoSet || !allTcgdexSets) {
    return null;
  }

  let tcgdexSetsMapByAbbreviation = new Map();
  let tcgdexSetsByNameMap = new Map();
  let tcgdexSetsMapById = new Map();
  let tcgdexSetsMapByNormalizedId = new Map();

  allTcgdexSets.forEach(set => {
    if (set.abbreviation?.official) {
      tcgdexSetsMapByAbbreviation.set(set.abbreviation.official.toLowerCase(), set);
    }
    if (set.name) { // German name
      tcgdexSetsByNameMap.set(normalizeString(set.name), set);
    }
    if (set.en && set.en.name) { // Ensure both 'en' and 'name' exist for English name
      tcgdexSetsByNameMap.set(normalizeString(set.en.name), set);
    }
    if (set.id) {
      tcgdexSetsMapById.set(set.id.toLowerCase(), set);
      tcgdexSetsMapByNormalizedId.set(normalizeSetId(set.id), set);
    }
  });

  let matchedTcgdexSet = null;

  // 1. Priorität: Custom Mappings (pokemontcg.io ID zu TCGDex ID)
  const customMappedTcgdexId = CUSTOM_SET_ID_MAPPINGS[pokemontcgIoSet.id.toLowerCase()];
  if (customMappedTcgdexId) {
    // Prüfe sowohl die direkte customMappedTcgdexId als auch deren normalisierte Form
    if (tcgdexSetsMapById.has(customMappedTcgdexId.toLowerCase())) {
      matchedTcgdexSet = tcgdexSetsMapById.get(customMappedTcgdexId.toLowerCase());
      Logger.log(`[findMatchingTcgdexSet] Gefunden via Custom Mapping (direkt): ${pokemontcgIoSet.id} -> ${customMappedTcgdexId}`);
      return matchedTcgdexSet;
    }
    const normalizedCustomMappedTcgdexId = normalizeSetId(customMappedTcgdexId);
    if (tcgdexSetsMapByNormalizedId.has(normalizedCustomMappedTcgdexId)) {
      matchedTcgdexSet = tcgdexSetsMapByNormalizedId.get(normalizedCustomMappedTcgdexId);
      Logger.log(`[findMatchingTcgdexSet] Gefunden via Custom Mapping (normalisiert): ${pokemontcgIoSet.id} -> ${normalizedCustomMappedTcgdexId}`);
      return matchedTcgdexSet;
    }
  }


  // 2. Priorität: Direkter pokemontcg.io ID zu TCGDex ID Match (wenn sie identisch sind)
  if (tcgdexSetsMapById.has(pokemontcgIoSet.id.toLowerCase())) {
    matchedTcgdexSet = tcgdexSetsMapById.get(pokemontcgIoSet.id.toLowerCase());
    Logger.log(`[findMatchingTcgdexSet] Gefunden via Direkter ID-Match: ${pokemontcgIoSet.id}`);
    return matchedTcgdexSet;
  }

  // 3. Priorität: Normalisierte pokemontcg.io ID zu normalisierter TCGDex ID Match
  const normalizedPokemontcgId = normalizeSetId(pokemontcgIoSet.id);
  if (normalizedPokemontcgId && tcgdexSetsMapByNormalizedId.has(normalizedPokemontcgId)) {
    matchedTcgdexSet = tcgdexSetsMapByNormalizedId.get(normalizedPokemontcgId);
    Logger.log(`[findMatchingTcgdexSet] Gefunden via Normalisierter ID-Match: ${pokemontcgIoSet.id} (${normalizedPokemontcgId})`);
    return matchedTcgdexSet;
  }


  // 4. Priorität: PTCGO Code Match (pokemontcg.io abbreviation zu TCGDex official abbreviation)
  if (pokemontcgIoSet.ptcgoCode) {
    matchedTcgdexSet = tcgdexSetsMapByAbbreviation.get(pokemontcgIoSet.ptcgoCode.toLowerCase());
    if (matchedTcgdexSet) {
      Logger.log(`[findMatchingTcgdexSet] Gefunden via PTCGO Code: ${pokemontcgIoSet.ptcgoCode}`);
      return matchedTcgdexSet;
    }
  }

  // 5. Priorität: Normalisierter Name Match (exakt und dann partiell)
  const normalizedPokeName = pokemontcgIoSet.name ? normalizeString(pokemontcgIoSet.name) : '';
  if (normalizedPokeName) {
    matchedTcgdexSet = tcgdexSetsByNameMap.get(normalizedPokeName);
    if (matchedTcgdexSet) {
      Logger.log(`[findMatchingTcgdexSet] Gefunden via exaktem normalisiertem Namen: ${pokemontcgIoSet.name}`);
      return matchedTcgdexSet;
    } else {
      // Partieller Namensabgleich: Prüfe, ob der pokemontcg.io Name den TCGDex Namen enthält (oder umgekehrt)
      for (const [tcgdexKey, currentTcgdexSet] of tcgdexSetsByNameMap.entries()) {
        const currentTcgdexNormalizedName = currentTcgdexSet.name ? normalizeString(currentTcgdexSet.name) : '';
        const currentTcgdexEnNormalizedName = (currentTcgdexSet.en && currentTcgdexSet.en.name) ? normalizeString(currentTcgdexSet.en.name) : '';

        if ((currentTcgdexNormalizedName && normalizedPokeName.includes(currentTcgdexNormalizedName)) ||
          (currentTcgdexNormalizedName && currentTcgdexNormalizedName.includes(normalizedPokeName)) ||
          (currentTcgdexEnNormalizedName && normalizedPokeName.includes(currentTcgdexEnNormalizedName)) ||
          (currentTcgdexEnNormalizedName && currentTcgdexEnNormalizedName.includes(normalizedPokeName))
        ) {
          matchedTcgdexSet = currentTcgdexSet;
          Logger.log(`[findMatchingTcgdexSet] Gefunden via partiellem Namens-Match: '${pokemontcgIoSet.name}' <-> '${currentTcgdexSet.name}'`);
          return matchedTcgdexSet;
        }
      }
    }
  }

  Logger.log(`[findMatchingTcgdexSet] KEIN TCGDex-Match gefunden für pokemontcg.io Set: ID=${pokemontcgIoSet.id}, Name='${pokemontcgIoSet.name}', PTCGO='${pokemontcgIoSet.ptcgoCode}'`);
  return null;
}


// ============================================================================
// SEKTION: PROPERTIES SERVICE - Datenspeicherung
// ============================================================================

/**
 * Ruft gespeicherte Set-Daten aus ScriptProperties ab.
 * 
 * @deprecated Diese Funktion wird nicht mehr aktiv verwendet
 * @function getStoredSets
 * @returns {Array<Object>} Liste gespeicherter Set-Objekte
 */
function getStoredSets() {
  const properties = PropertiesService.getScriptProperties();
  const setsJson = properties.getProperty('pokemonSets');
  return setsJson ? JSON.parse(setsJson) : [];
}

/**
 * Speichert die abgerufenen Set-Daten in den Skripteigenschaften.
 * @param {Array<Object>} sets Die Liste der Set-Objekte, die gespeichert werden sollen.
 */
function storeSets(sets) {
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('pokemonSets', JSON.stringify(sets));
}

/**
 * Öffnet ein benutzerdefiniertes Sidebar in der Google Tabelle.
 * Dieses Sidebar enthält Schaltflächen, um verschiedene Funktionen des Skripts auszulösen.
 */
function openCustomSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Pokémon TCG Tracker Funktionen') // Titel des Sidebars
    .setWidth(300); // Breite des Sidebars in Pixeln
  SpreadsheetApp.getUi().showSidebar(html); // Zeigt das Sidebar an.
}

// ============================================================================
// SEKTION: SHEET-SETUP & INITIALISIERUNG
// ============================================================================

/**
 * Initialisiert die Basis-Struktur der Google Tabelle.
 * 
 * Erstellt und konfiguriert:
 * - "Sets Overview" Blatt mit Headern und Checkboxen
 * - "Collection Summary" Blatt mit Statistiken
 * - Frozen Rows, Spaltenbreiten und Formatierung
 * 
 * Diese Funktion ist idempotent - sie kann mehrfach ausgeführt werden
 * ohne bestehende Daten zu zerstören.
 * 
 * @function setupSheets
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(); // Holt das aktive Spreadsheet.

  // --- Sets Overview Sheet Setup ---
  let setsSheet = ss.getSheetByName("Sets Overview");
  if (!setsSheet) {
    setsSheet = ss.insertSheet("Sets Overview", 0); // Erstellt das Blatt an erster Position.
  }
  // Sicherstellen, dass genügend Kopfzeilen vorhanden sind.
  if (setsSheet.getMaxRows() < OVERVIEW_HEADER_ROWS) {
    setsSheet.insertRows(1, OVERVIEW_HEADER_ROWS - setsSheet.getMaxRows());
  }

  // Titel für "Sets Overview" (Zeile 1)
  // Merge-Bereich erstreckt sich über alle Daten-Spalten VOR der Checkbox-Spalte.
  setsSheet.getRange(OVERVIEW_TITLE_ROW, 1, 1, OVERVIEW_REFRESH_CHECKBOX_COL - 1).merge();
  setsSheet.getRange(OVERVIEW_TITLE_ROW, 1).setValue("Pokémon TCG Sets Übersicht");
  setsSheet.getRange(OVERVIEW_TITLE_ROW, 1).setHorizontalAlignment("center").setVerticalAlignment("middle").setFontWeight("bold").setBackground("#D9D9D9");

  // "Übersicht aktualisieren" Checkbox in "Sets Overview" (Zeile 1, Spalte J)
  const refreshCheckboxRange = setsSheet.getRange(OVERVIEW_TITLE_ROW, OVERVIEW_REFRESH_CHECKBOX_COL);
  refreshCheckboxRange.setValue(false);
  refreshCheckboxRange.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  refreshCheckboxRange.setHorizontalAlignment("center").setVerticalAlignment("middle").setBackground("#D9D9D9"); // Gleicher Hintergrund wie Titel
  refreshCheckboxRange.setNote("Klicken Sie hier, um die Sets-Übersicht und alle Sets neu zu laden.");

  // Zusammenfassungszeile für "Sets Overview" (Zeile 2)
  // Merge-Bereich erstreckt sich über alle Daten-Spalten UND die Checkbox-Spalte (bis J), um bündig zu sein.
  setsSheet.getRange(OVERVIEW_SUMMARY_ROW, 1, 1, OVERVIEW_REFRESH_CHECKBOX_COL).merge();
  setsSheet.getRange(OVERVIEW_SUMMARY_ROW, 1).setValue("Lade Sets-Statistiken...");
  setsSheet.getRange(OVERVIEW_SUMMARY_ROW, 1).setHorizontalAlignment("center").setVerticalAlignment("middle").setFontWeight("bold").setBackground("#EFEFEF");


  // Setzt oder aktualisiert die Kopfzeilen für die Set-Daten (beginnend nach den neuen Headern, Zeile 3).
  // Diese Zeile erstreckt sich jetzt bis zur Spalte der Refresh-Checkbox (J).
  const overviewDataHeadersRange = setsSheet.getRange(OVERVIEW_DATA_START_ROW, 1, 1, OVERVIEW_REFRESH_CHECKBOX_COL); // A3:J3
  overviewDataHeadersRange.setValues([
    ["Set ID", "Set Name", "Set Logo", "Set Symbol", "Serie", "Erscheinungsdatum", "Gesamtzahl Karten", "Abkürzung (Official)", "Importiert", "Neu importieren"] // KEIN Leerer String für Spalte J mehr
  ]);
  // Styling für die Datenkopfzeile
  overviewDataHeadersRange.setBackground("#C9DAF8"); // Hellblau
  overviewDataHeadersRange.setFontWeight("bold");
  overviewDataHeadersRange.setBorder(true, true, true, true, true, true, "#888888", SpreadsheetApp.BorderStyle.SOLID);

  // MIGRATIONS-SCHRITT: Migriere alte TCGdex-only Set-IDs zu neuen pokemontcg.io IDs
  migrateLegacyTcgdexSetIds();

  setsSheet.setFrozenRows(OVERVIEW_HEADER_ROWS); // Friert die neuen Kopfzeilen ein.
  setsSheet.setColumnWidth(3, 50); // Spaltenbreite für Set Logo (C).
  setsSheet.setColumnWidth(4, 50); // Spaltenbreite für Set Symbol (D).
  setsSheet.setColumnWidth(8, 100); // Spaltenbreite für Abkürzung (Official) (H).
  setsSheet.setColumnWidth(IMPORTED_CHECKBOX_COL_INDEX, 70); // Spaltenbreite für die "Importiert"-Checkbox (I).
  setsSheet.setColumnWidth(REIMPORT_CHECKBOX_COL_INDEX, 100); // Spaltenbreite für die "Neu importieren"-Checkbox (J).
  // setsSheet.setColumnWidth(OVERVIEW_REFRESH_CHECKBOX_COL, 70); // Diese Spaltenbreite ist jetzt für die Reimport-Checkbox zuständig


  // --- Collection Summary Sheet Setup ---
  let summarySheet = ss.getSheetByName("Collection Summary");
  if (!summarySheet) {
    summarySheet = ss.insertSheet("Collection Summary"); // Erstellt das Blatt.
  }
  // Sicherstellen, dass genügend Kopfzeilen vorhanden sind.
  if (summarySheet.getMaxRows() < SUMMARY_HEADER_ROWS) {
    summarySheet.insertRows(1, SUMMARY_HEADER_ROWS - summarySheet.getMaxRows());
  }

  // Titel für "Collection Summary" (Zeile 1)
  // Merge-Bereich erstreckt sich über alle Daten-Spalten VOR der Checkbox-Spalte.
  summarySheet.getRange(SUMMARY_TITLE_ROW, 1, 1, SUMMARY_SORT_CHECKBOX_COL - 1).merge();
  summarySheet.getRange(SUMMARY_TITLE_ROW, 1).setValue("Pokémon TCG Sammlungsübersicht");
  summarySheet.getRange(SUMMARY_TITLE_ROW, 1).setHorizontalAlignment("center").setVerticalAlignment("middle").setFontWeight("bold").setBackground("#D9D9D9");

  // Header-Checkbox in "Collection Summary" (Zeile 1, Spalte G)
  // Früher: "Alle Sets sortieren". Jetzt dient sie zur Aktualisierung der Statistik.
  const sortAllCheckboxRange = summarySheet.getRange(SUMMARY_TITLE_ROW, SUMMARY_SORT_CHECKBOX_COL);
  sortAllCheckboxRange.setValue(false);
  sortAllCheckboxRange.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  sortAllCheckboxRange.setHorizontalAlignment("center").setVerticalAlignment("middle").setBackground("#D9D9D9");
  sortAllCheckboxRange.setNote("Klicken Sie hier, um die Sammlungsübersicht zu aktualisieren.");

  // Zusammenfassungszeile für "Collection Summary" (Zeile 2)
  // Merge-Bereich erstreckt sich über alle Daten-Spalten UND die Checkbox-Spalte (bis G), um bündig zu sein.
  setsSheet.getRange(OVERVIEW_SUMMARY_ROW, 1, 1, OVERVIEW_REFRESH_CHECKBOX_COL).merge();
  summarySheet.getRange(SUMMARY_SUMMARY_ROW, 1).setValue("Lade Sammlungsstatistiken...");
  summarySheet.getRange(SUMMARY_SUMMARY_ROW, 1).setHorizontalAlignment("center").setVerticalAlignment("middle").setFontWeight("bold").setBackground("#EFEFEF");


  // Setzt oder aktualisiert die Kopfzeilen für die Sammlungsdaten (beginnend nach den neuen Headern, Zeile 3).
  // Diese Zeile erstreckt sich jetzt bis zur Spalte der Sortier-Checkbox (G).
  const summaryDataHeadersRange = summarySheet.getRange(SUMMARY_DATA_START_ROW, 1, 1, SUMMARY_SORT_CHECKBOX_COL); // A3:G3
  summaryDataHeadersRange.setValues([
    ["Set Name", "Gesamtzahl Karten", "Gesammelte Karten", "Gesammelte RH Karten", "Abschluss-Prozentsatz", "Abkürzung (Official)", ""] // KEINE Leeren Strings mehr für Spalten H, I, J
  ]);
  // Styling für die Datenkopfzeile
  summaryDataHeadersRange.setBackground("#C9DAF8"); // Hellblau
  summaryDataHeadersRange.setFontWeight("bold");
  summaryDataHeadersRange.setBorder(true, true, true, true, true, true, "#888888", SpreadsheetApp.BorderStyle.SOLID);

  summarySheet.setFrozenRows(SUMMARY_HEADER_ROWS); // Friert die neuen Kopfzeilen ein.
  summarySheet.setColumnWidth(SUMMARY_SORT_CHECKBOX_COL, 70); // Spaltenbreite für die Sortier-Checkbox (G).


  // Verschiebt die Blätter an die korrekte Position, falls sie nicht bereits dort sind.
  if (setsSheet.getIndex() !== 1) { // getIndex() ist 1-basiert.
    ss.setActiveSheet(setsSheet);
    ss.moveActiveSheet(1); // Verschiebt auf Position 1 (Index 0).
  }
  if (summarySheet.getIndex() !== 2) { // getIndex() ist 1-basiert.
    ss.setActiveSheet(summarySheet);
    ss.moveActiveSheet(2); // Verschiebt auf Position 2 (Index 1).
  }
}

/**
 * Hilfsfunktion zum Extrahieren der reinen Set-ID aus einem Hyperlink-String.
 * Dies ist notwendig, da die Set-ID in der Tabelle als Hyperlink zur Set-Seite gespeichert sein kann.
 * @param {string} cellValue Der Wert einer Zelle, der ein Hyperlink sein könnte.
 * @returns {string} Die reine Set-ID.
 */
function extractIdFromHyperlink(cellValue) {
  // Regulärer Ausdruck, um den angezeigten Text in einer HYPERLINK-Formel zu finden.
  const match = /=HYPERLINK\(("[^"]+"),\s*"([^"]+)"\)/i.exec(cellValue);
  if (match && match.length > 2) {
    return match[2]; // Gibt den angezeigten Text (die ID) zurück.
  }
  return cellValue; // Wenn keine Hyperlink-Formel, wird der Wert unverändert zurückgegeben.
}

/**
 * Lädt und parst JSON-Daten aus ScriptProperties sicher.
 * 
 * @function getScriptPropertiesData
 * @param {string} key - Schlüssel der Property
 * @param {Object} [defaultValue={}] - Rückgabewert bei Fehler oder fehlenden Daten
 * @returns {Object} Geparste Daten oder Standardwert
 * 
 * @example
 * const collected = getScriptPropertiesData('collectedCardsData', {});
 */
function getScriptPropertiesData(key, defaultValue = {}) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const data = scriptProperties.getProperty(key);
  try {
    return data ? JSON.parse(data) : defaultValue;
  } catch (e) {
    Logger.log(`Fehler beim Parsen der Eigenschaft '${key}': ${e.message}. Verwende Standardwert.`);
    return defaultValue;
  }
}

/**
 * Speichert ein Objekt als JSON in ScriptProperties.
 * 
 * @function setScriptPropertiesData
 * @param {string} key - Schlüssel der Property
 * @param {Object} data - Zu speicherndes Objekt
 * 
 * @example
 * setScriptPropertiesData('collectedCardsData', { sv08: { '1': {g: true, rh: false} } });
 */
function setScriptPropertiesData(key, data) {
  const scriptProperties = PropertiesService.getScriptProperties(); // Holt den PropertiesService.
  scriptProperties.setProperty(key, JSON.stringify(data)); // Speichert das Objekt als JSON-String.
}


// ============================================================================
// SEKTION: SORTIERUNG & VERGLEICH
// ============================================================================

/**
 * Natürliche Sortierung für alphanumerische Strings.
 * 
 * Sortiert "GG2" vor "GG10" (nicht "GG10" vor "GG2").
 * Verwendet die native localeCompare-Funktion mit numeric-Option.
 * 
 * @function naturalSort
 * @param {string|number} a - Erster Vergleichswert
 * @param {string|number} b - Zweiter Vergleichswert
 * @returns {number} -1, 0, oder 1 für Sortierreihenfolge
 * 
 * @example
 * ["GG10", "GG2", "GG1"].sort(naturalSort) // ["GG1", "GG2", "GG10"]
 */
function naturalSort(a, b) {
  // Sicherstellen, dass beide Inputs Strings sind
  const stringA = String(a);
  const stringB = String(b);

  // localeCompare mit numeric: true bietet eine robuste natürliche Sortierung
  return stringA.localeCompare(stringB, undefined, { numeric: true, sensitivity: 'base' });
}


/**
 * Importiert alle Sets, wobei pokemontcg.io die primäre Quelle ist
 * und TCGDex zur Ergänzung deutscher Werte verwendet wird, falls verfügbar.
 * Füllt die "Sets Overview"-Tabelle und bewahrt dabei manuell bearbeitete Felder.
 * Diese Funktion behandelt nun auch Sets, die nur in TCGDex oder nur in pokemontcg.io existieren.
 */
function populateSetsOverview() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setsSheet = ss.getSheetByName("Sets Overview");
  const ui = SpreadsheetApp.getUi();

  // 1. Bestehende Daten lesen, um Benutzerbearbeitungen zu erhalten.
  const lastExistingRow = setsSheet.getLastRow();
  const numExistingDataRows = Math.max(0, lastExistingRow - OVERVIEW_DATA_START_ROW);
  const existingSetsData = numExistingDataRows > 0 ?
    setsSheet.getRange(OVERVIEW_DATA_START_ROW + 1, 1, numExistingDataRows, setsSheet.getMaxColumns()).getValues() : [];

  const existingSetMap = new Map(); // Map<pokemontcg.io Set ID or TCGDex-only ID, { serie: string, releaseDate: string, abbreviation: string }>
  if (existingSetsData.length > 0) {
    for (let i = 0; i < existingSetsData.length; i++) {
      const row = existingSetsData[i];
      const setId = extractIdFromHyperlink(row[0]);
      const serie = row[4];
      const releaseDate = row[5];
      const abbreviation = row[7];
      // SetLogo (Index 2), SetSymbol (Index 3)
      // Bilder und Symbole sollen beibehalten werden, daher lesen wir sie hier auch.
      const existingLogo = row[2];
      const existingSymbol = row[3];
      existingSetMap.set(setId, { serie: serie, releaseDate: releaseDate, abbreviation: abbreviation, logo: existingLogo, symbol: existingSymbol });
    }
  }

  // SCHRITT 1: Sets von pokemontcg.io abrufen (Primärquelle)
  let pokemontcgIoResponse = null;
  let pokemontcgIoSets = null;
  if (UseVeraApi) {
    pokemontcgIoResponse = fetchApiData(`${VTCG_BASE_URL}sets/${VeraApiLanguage}.json`, "Beim Laden der pokemontcg.io Sets");
    pokemontcgIoSets = pokemontcgIoResponse || [];
  }
  else {
    pokemontcgIoResponse = fetchApiData(`${PTCG_BASE_URL}sets", "Beim Laden der pokemontcg.io Sets`);
    pokemontcgIoSets = pokemontcgIoResponse?.data || [];
  }

  // SCHRITT 2: Sets von TCGDex abrufen
  const tcgdexSetsResponse = fetchApiData(`${TCGDEX_BASE_URL}sets`, "Beim Laden der TCGDex Sets");
  const tcgdexAllSets = tcgdexSetsResponse || [];

  const combinedSetsMap = new Map(); // Map<Unique ID (pokemontcg.io ID or TCGDex-only ID), { pokemontcgData, tcgdexData, isOnlyTcgdex }>

  // SCHRITT 3: pokemontcg.io Sets verarbeiten und TCGDex-Matches finden
  pokemontcgIoSets.forEach(pokemontcgIoSet => {
    const tcgdexMatch = findMatchingTcgdexSet(pokemontcgIoSet, tcgdexAllSets);

    // Nutze die pokemontcg.io ID als primären Schlüssel
    combinedSetsMap.set(pokemontcgIoSet.id, {
      pokemontcgData: pokemontcgIoSet,
      tcgdexData: tcgdexMatch,
      isOnlyTcgdex: false
    });
    
    // MIGRATION: Wenn dieses Set früher als TCGdex-only mit Präfix existierte, übernehme die bestehenden Daten
    const oldTcgdexKey = `TCGDEX-${tcgdexMatch?.id || pokemontcgIoSet.id}`;
    if (existingSetMap.has(oldTcgdexKey)) {
      const oldData = existingSetMap.get(oldTcgdexKey);
      // Nur Labels übernehmen, nicht die neue pokemontcg.io Seite-Daten
      if (!existingSetMap.has(pokemontcgIoSet.id)) {
        existingSetMap.set(pokemontcgIoSet.id, oldData);
      }
      // Alte TCGdex-Eintrags löschen, damit sie nicht erneut hinzugefügt werden
      existingSetMap.delete(oldTcgdexKey);
      Logger.log(`[Migration] Übernahme von TCGdex-only Set "${oldTcgdexKey}" zu "${pokemontcgIoSet.id}"`);
    }
  });

  // SCHRITT 4: TCGDex-only Sets hinzufügen
  tcgdexAllSets.forEach(tcgdexSet => {
    // Prüfe, ob dieses TCGDex-set bereits einem pokemontcg.io Set zugeordnet wurde
    let foundInCombined = false;
    for (const [key, mergedData] of combinedSetsMap.entries()) {
      // Wenn das gemergte Objekt pokemontcg.io Daten UND ein passendes tcgdexData hat,
      // und diese tcgdexData mit dem aktuellen tcgdexSet übereinstimmt, dann ist es bereits abgedeckt.
      if (mergedData.pokemontcgData && mergedData.tcgdexData && mergedData.tcgdexData.id === tcgdexSet.id) {
        foundInCombined = true;
        break;
      }
    }

    if (!foundInCombined) {
      // Dieses TCGDex-Set wurde keinem pokemontcg.io-Set zugeordnet, also ist es TCGDex-only
      combinedSetsMap.set(`TCGDEX-${tcgdexSet.id}`, { // Verwende eindeutigen Schlüssel
        pokemontcgData: null, // Keine pokemontcg.io Daten
        tcgdexData: tcgdexSet,
        isOnlyTcgdex: true
      });
    }
  });

  const allSetsForOverview = Array.from(combinedSetsMap.values());

  // Sortierung: Zuerst nach pokemontcg.io sets (falls vorhanden, nach Release Date absteigend), dann TCGDex-only
  allSetsForOverview.sort((a, b) => {
    // Priorisiere pokemontcg.io Sets
    if (a.pokemontcgData && !b.pokemontcgData) return -1;
    if (!a.pokemontcgData && b.pokemontcgData) return 1;

    // Wenn beide pokemontcg.io Sets sind, sortiere nach Release Date (neueste zuerst)
    if (a.pokemontcgData && b.pokemontcgData) {
      const dateA = new Date(a.pokemontcgData.releaseDate || 0);
      const dateB = new Date(b.pokemontcgData.releaseDate || 0);
      return dateB - dateA;
    }

    // Wenn beide TCGDex-only sind, sortiere nach TCGDex Release Date (neueste zuerst)
    if (a.tcgdexData && b.tcgdexData) {
      const dateA = new Date(a.tcgdexData.releaseDate || 0);
      const dateB = new Date(b.tcgdexData.releaseDate || 0);
      return dateB - dateA;
    }
    return 0;
  });

  let allSetsOverviewData = [];
  let importedCount = 0;
  const importedSetsStatus = getScriptPropertiesData('importedSetsStatus', {});

  // Vorab: vorhandene Set-Blätter erkennen und ggf. alte/alias Set-IDs auf kanonische IDs migrieren.
  const scriptProperties = PropertiesService.getScriptProperties();
  let collectedCardsData = getScriptPropertiesData('collectedCardsData', {});
  let customImageUrls = getScriptPropertiesData('customImageUrls', {});
  let collectedChanged = false;
  let customImagesChanged = false;
  let importedStatusChanged = false;

  const canonicalSetIds = new Set();
  const normalizedToCanonical = new Map();
  allSetsForOverview.forEach(entry => {
    const canonicalId = entry.pokemontcgData ? entry.pokemontcgData.id : `TCGDEX-${entry.tcgdexData.id}`;
    canonicalSetIds.add(canonicalId);

    const aliasCandidates = buildSetIdAliasCandidates(canonicalId);
    aliasCandidates.forEach(aliasId => {
      const normalizedId = normalizeSetId(String(aliasId).replace(/^TCGDEX-/i, ''));
      if (!normalizedToCanonical.has(normalizedId)) {
        normalizedToCanonical.set(normalizedId, canonicalId);
      } else {
        // Bevorzuge reguläre (nicht-TCGDEX) IDs als Ziel bei Kollisionen.
        const existing = normalizedToCanonical.get(normalizedId);
        if (existing.startsWith('TCGDEX-') && !canonicalId.startsWith('TCGDEX-')) {
          normalizedToCanonical.set(normalizedId, canonicalId);
        }
      }
    });
  });

  const importedSheetBySetId = {};
  const allSheets = ss.getSheets();
  allSheets.forEach(sheet => {
    const name = sheet.getName();
    if (name === 'Sets Overview' || name === 'Collection Summary') return;

    const note = sheet.getRange(1, 1).getNote() || '';
    if (!note.startsWith('Set ID: ')) return;

    const noteSetId = note.substring('Set ID: '.length).trim();
    const canonicalId = resolveCanonicalSetIdFromMap(noteSetId, normalizedToCanonical, canonicalSetIds);

    if (!canonicalId) return;

    // Notiz und assoziierte Property-Keys auf kanonische ID migrieren.
    if (noteSetId !== canonicalId) {
      sheet.getRange(1, 1).setNote(`Set ID: ${canonicalId}`);
      Logger.log(`[populateSetsOverview] Alias-Migration im Set-Blatt "${name}": ${noteSetId} -> ${canonicalId}`);

      if (importedSetsStatus[noteSetId]) {
        importedSetsStatus[canonicalId] = true;
        delete importedSetsStatus[noteSetId];
        importedStatusChanged = true;
      }

      if (collectedCardsData[noteSetId]) {
        if (!collectedCardsData[canonicalId]) {
          collectedCardsData[canonicalId] = collectedCardsData[noteSetId];
        } else {
          collectedCardsData[canonicalId] = { ...collectedCardsData[noteSetId], ...collectedCardsData[canonicalId] };
        }
        delete collectedCardsData[noteSetId];
        collectedChanged = true;
      }

      if (customImageUrls[noteSetId]) {
        if (!customImageUrls[canonicalId]) {
          customImageUrls[canonicalId] = customImageUrls[noteSetId];
        } else {
          customImageUrls[canonicalId] = { ...customImageUrls[noteSetId], ...customImageUrls[canonicalId] };
        }
        delete customImageUrls[noteSetId];
        customImagesChanged = true;
      }

      const oldCardmarketKey = `pokemontcgIoCardmarketUrls_${noteSetId}`;
      const newCardmarketKey = `pokemontcgIoCardmarketUrls_${canonicalId}`;
      const oldCardmarketData = getScriptPropertiesData(oldCardmarketKey, null);
      const existingCardmarketData = getScriptPropertiesData(newCardmarketKey, null);
      if (oldCardmarketData && !existingCardmarketData) {
        setScriptPropertiesData(newCardmarketKey, oldCardmarketData);
      }
      if (oldCardmarketData) {
        scriptProperties.deleteProperty(oldCardmarketKey);
      }
    }

    if (!importedSheetBySetId[canonicalId]) {
      importedSheetBySetId[canonicalId] = sheet;
    } else {
      Logger.log(`[populateSetsOverview] Mehrere Blätter für ${canonicalId} erkannt. Verwende erstes Blatt: "${importedSheetBySetId[canonicalId].getName()}"`);
    }

    importedSetsStatus[canonicalId] = true;
    importedStatusChanged = true;
  });

  if (collectedChanged) setScriptPropertiesData('collectedCardsData', collectedCardsData);
  if (customImagesChanged) setScriptPropertiesData('customImageUrls', customImageUrls);
  if (importedStatusChanged) setScriptPropertiesData('importedSetsStatus', importedSetsStatus);

  allSetsForOverview.forEach(setEntry => {
    const pokemontcgIoSet = setEntry.pokemontcgData;
    const tcgdexSet = setEntry.tcgdexData;
    const isOnlyTcgdex = setEntry.isOnlyTcgdex;

    let setIdDisplayValue;
    let finalSetName;
    let finalSerie;
    let finalReleaseDate;
    let finalTotalCards;
    let finalAbbreviation;
    let imagesLogo = "";
    let imagesSymbol = "";
    let actualSetIdForSheetNote; // Die ID, die wirklich in der Blattnotiz gespeichert wird

    // Bestimme die primäre ID für die Anzeige und Blatt-Verknüpfung
    if (pokemontcgIoSet) {
      setIdDisplayValue = pokemontcgIoSet.id;
      actualSetIdForSheetNote = pokemontcgIoSet.id;
    } else { // TCGDex-only Set
      setIdDisplayValue = `TCGDEX-${tcgdexSet.id}`;
      actualSetIdForSheetNote = `TCGDEX-${tcgdexSet.id}`; // Dies ist die ID, die wir in der Blattnotiz verwenden
    }

    // Bestimme den Namen und andere Metadaten
    if (pokemontcgIoSet) {
      finalSetName = pokemontcgIoSet.name;
      finalSerie = pokemontcgIoSet.series || "";
      finalReleaseDate = pokemontcgIoSet.releaseDate || "";
      finalTotalCards = pokemontcgIoSet.total || 0;
      finalAbbreviation = pokemontcgIoSet.ptcgoCode || pokemontcgIoSet.id || "";
      imagesLogo = pokemontcgIoSet.images?.logo ? `=IMAGE("${pokemontcgIoSet.images.logo}"; 1)` : "";
      imagesSymbol = pokemontcgIoSet.images?.symbol ? `=IMAGE("${pokemontcgIoSet.images.symbol}"; 1)` : "";

      if (tcgdexSet) { // Pokemontcg.io Set mit TCGDex Match: Priorisiere TCGDex-Informationen für deutsche Werte
        if (tcgdexSet.name) finalSetName = tcgdexSet.name;
        if (tcgdexSet.serie?.name) finalSerie = tcgdexSet.serie.name;
        if (tcgdexSet.cardCount?.official) finalTotalCards = tcgdexSet.cardCount.official;
        // Auch das Erscheinungsdatum von TCGDex bevorzugen, falls vorhanden
        if (tcgdexSet.releaseDate) finalReleaseDate = tcgdexSet.releaseDate;
      }
    } else if (isOnlyTcgdex && tcgdexSet) {
      // TCGDex-only Set: Verwende nur TCGDex Daten
      finalSetName = tcgdexSet.name || "Unbekannter Name";
      finalSerie = tcgdexSet.serie?.name || "";
      finalReleaseDate = tcgdexSet.releaseDate || "";
      finalTotalCards = tcgdexSet.cardCount?.official || tcgdexSet.cardCount?.total || 0;
      finalAbbreviation = tcgdexSet.abbreviation?.official || "";
      imagesLogo = tcgdexSet.logo ? `=IMAGE("${tcgdexSet.logo}"; 1)` : "";
      imagesSymbol = tcgdexSet.symbol ? `=IMAGE("${tcgdexSet.symbol}"; 1)` : "";
    } else {
      Logger.log("populateSetsOverview: Unerwarteter Set-Eintrag (weder pokemontcg.io noch TCGDex-only mit Daten). Überspringe.");
      return;
    }

    // Prüfe den Importstatus und erstelle Hyperlink, falls Blatt existiert
    let isSetImported = false;
    let cardSheet = importedSheetBySetId[actualSetIdForSheetNote] || null;

    // Fallback: älteres Verhalten über Blattname + exakte Notiz
    if (!cardSheet) {
      const byNameSheet = ss.getSheetByName(finalSetName);
      if (byNameSheet && byNameSheet.getRange(1, 1).getNote() === `Set ID: ${actualSetIdForSheetNote}`) {
        cardSheet = byNameSheet;
      }
    }

    if (cardSheet) {
      const sheetId = cardSheet.getSheetId();
      const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
      setIdDisplayValue = `=HYPERLINK("${sheetUrl}"; "${actualSetIdForSheetNote}")`;
      isSetImported = true;
    }

    // Bestehende Benutzerbearbeitungen beibehalten (Serie, Erscheinungsdatum, Abkürzung)
    const existingData = existingSetMap.get(actualSetIdForSheetNote);
    if (existingData) {
      finalSerie = (existingData.serie && existingData.serie !== "") ? existingData.serie : finalSerie;
      finalReleaseDate = (existingData.releaseDate && existingData.releaseDate !== "") ? existingData.releaseDate : finalReleaseDate;
      finalAbbreviation = (existingData.abbreviation && existingData.abbreviation !== "") ? existingData.abbreviation : finalAbbreviation;
      // NEU: Bestehende Bilder/Symbole erhalten bleiben
      imagesLogo = (existingData.logo && existingData.logo.toString().startsWith("=IMAGE(")) ? existingData.logo : imagesLogo;
      imagesSymbol = (existingData.symbol && existingData.symbol.toString().startsWith("=IMAGE(")) ? existingData.symbol : imagesSymbol;
    }

    importedSetsStatus[actualSetIdForSheetNote] = isSetImported;
    if (isSetImported) {
      importedCount++;
    }

    allSetsOverviewData.push([
      setIdDisplayValue,
      finalSetName,
      imagesLogo,
      imagesSymbol,
      finalSerie,
      finalReleaseDate,
      finalTotalCards,
      finalAbbreviation,
      isSetImported,
      false // "Neu importieren"-Checkbox
    ]);
  });

  setScriptPropertiesData('importedSetsStatus', importedSetsStatus);

  // Löscht bestehenden Inhalt ab OVERVIEW_DATA_START_ROW + 1
  if (setsSheet.getLastRow() > OVERVIEW_DATA_START_ROW) {
    setsSheet.getRange(OVERVIEW_DATA_START_ROW + 1, 1, setsSheet.getLastRow() - OVERVIEW_DATA_START_ROW, setsSheet.getMaxColumns()).clearContent();
  }

  // Schreibt die neuen Set-Übersichtsdaten in das Blatt.
  if (allSetsOverviewData.length > 0) {
    setsSheet.getRange(OVERVIEW_DATA_START_ROW + 1, 1, allSetsOverviewData.length, allSetsOverviewData[0].length).setValues(allSetsOverviewData);

    for (let i = 0; i < allSetsOverviewData.length; i++) {
      const row = i + OVERVIEW_DATA_START_ROW + 1;
      const actualSetIdForSheetNote = extractIdFromHyperlink(allSetsOverviewData[i][0]);

      const importedCheckboxRange = setsSheet.getRange(row, IMPORTED_CHECKBOX_COL_INDEX);
      const reimportCheckboxRange = setsSheet.getRange(row, REIMPORT_CHECKBOX_COL_INDEX);

      // Imported Checkbox Validation
      if (importedSetsStatus[actualSetIdForSheetNote]) {
        importedCheckboxRange.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox(true).build());
      } else {
        importedCheckboxRange.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      }
      // Reimport Checkbox Validation (immer ein normales Kontrollkästchen)
      reimportCheckboxRange.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    }
  }

  // Aktualisiert die Zusammenfassungszeile im Header.
  const totalPokemontcgSets = pokemontcgIoSets.length;
  const totalTcgdexOnlySets = allSetsForOverview.filter(s => s.isOnlyTcgdex).length;
  const notImportedCount = totalPokemontcgSets - importedCount + totalTcgdexOnlySets; // Summe aller nicht importierten Sets
  setsSheet.getRange(OVERVIEW_SUMMARY_ROW, 1).setValue(
    `Gesamtzahl pokemontcg.io Sets: ${totalPokemontcgSets} | Gesamtzahl TCGDex-Only Sets: ${totalTcgdexOnlySets} | Importiert: ${importedCount} | Nicht importiert: ${notImportedCount}`
  );
}

/**
 * Haupt-Setup-Funktion: Initialisiert Tabelle und importiert alle Sets.
 * 
 * Workflow:
 * 1. Erstellt/prüft Basis-Sheet-Struktur (setupSheets)
 * 2. Lädt und füllt Sets-Übersicht (populateSetsOverview)
 * 3. Installiert notwendige Trigger (installAllTriggers)
 * 
 * Diese Funktion sollte beim ersten Setup und bei kompletten Updates
 * verwendet werden.
 * 
 * @function setupAndImportAllSets
 */
function setupAndImportAllSets() {
  clearTcgdexCache(); // Cache invalidieren für frische Daten
  setupSheets(); // Stellt sicher, dass die Basisblätter existieren und Header korrekt sind.
  populateSetsOverview(); // Füllt die Sets-Übersicht und bewahrt bestehende Daten.
  installAllTriggers(); // Installiert alle notwendigen Trigger automatisch
  SpreadsheetApp.getActive().toast('Setup abgeschlossen und Sets importiert.', '✅ Fertig', 5);
}

/**
 * Aktualisiert eine Zeile in der "Sets Overview"-Tabelle, nachdem ein Set (entweder pokemontcg.io oder TCGDex-only)
 * importiert und ein Kartenblatt erstellt wurde.
 * @param {string} setIdToMatchInOverview Die ID des Sets, wie sie in der "Sets Overview" (Spalte A) steht (pokemontcg.io ID oder TCGDex-only ID).
 * @param {object|null} pokemontcgDetailedSetData Die detaillierten Set-Daten von der pokemontcg.io API (Englisch), falls vorhanden.
 * @param {object|null} tcgdexDetailedSetData Die detaillierten Set-Daten von der TCGDex API (Deutsch), falls vorhanden.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} cardSheet Das zugehörige Kartenblatt.
 */
function updateSetsOverviewRowAfterCardImport(setIdToMatchInOverview, pokemontcgDetailedSetData = null, tcgdexDetailedSetData = null, cardSheet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setsSheet = ss.getSheetByName("Sets Overview");
  const ui = SpreadsheetApp.getUi(); // Added for potential alerts.

  const lastExistingRow = setsSheet.getLastRow();
  const numExistingDataRows = Math.max(0, lastExistingRow - OVERVIEW_DATA_START_ROW);
  const setsData = numExistingDataRows > 0 ?
    setsSheet.getRange(OVERVIEW_DATA_START_ROW + 1, 1, numExistingDataRows, setsSheet.getMaxColumns()).getValues() : []; // Use getMaxColumns for existing data read

  let targetRowIndex = -1;
  for (let i = 0; i < setsData.length; i++) {
    if (extractIdFromHyperlink(setsData[i][0]) === setIdToMatchInOverview) {
      targetRowIndex = i;
      break;
    }
  }

  if (targetRowIndex !== -1) {
    const sheetRow = targetRowIndex + OVERVIEW_DATA_START_ROW + 1;
    const targetRange = setsSheet.getRange(sheetRow, 1, 1, OVERVIEW_REFRESH_CHECKBOX_COL);
    let currentValues = targetRange.getValues()[0]; // Get values from the specific target range (A to J)

    // Log current values before modification
    Logger.log(`updateSetsOverviewRowAfterCardImport: Row ${sheetRow} - Initial values: ${JSON.stringify(currentValues)}`);

    const sheetId = cardSheet.getSheetId();
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;

    // Ensure the ID for the hyperlink is clean
    const actualIdForHyperlink = extractIdFromHyperlink(currentValues[0]);
    currentValues[0] = `=HYPERLINK("${sheetUrl}"; "${actualIdForHyperlink}")`;

    // Update imported status and checkbox
    const importedSetsStatus = getScriptPropertiesData('importedSetsStatus', {});
    importedSetsStatus[setIdToMatchInOverview] = true; // Mark as imported
    setScriptPropertiesData('importedSetsStatus', importedSetsStatus);
    currentValues[IMPORTED_CHECKBOX_COL_INDEX - 1] = true;
    currentValues[REIMPORT_CHECKBOX_COL_INDEX - 1] = false;

    // Log values after basic updates
    Logger.log(`updateSetsOverviewRowAfterCardImport: Row ${sheetRow} - After basic updates (checkbox, hyperlink): ${JSON.stringify(currentValues)}`);

    // Priorisiere TCGDex-Informationen, wenn vorhanden
    if (tcgdexDetailedSetData) {
      currentValues[1] = String(tcgdexDetailedSetData.name || currentValues[1] || "Unbekannt"); // Set Name
      currentValues[4] = String(tcgdexDetailedSetData.serie?.name || currentValues[4] || ""); // Serie
      currentValues[5] = String(tcgdexDetailedSetData.releaseDate || currentValues[5] || ""); // Release Date
      currentValues[7] = String(tcgdexDetailedSetData.abbreviation?.official || currentValues[7] || ""); // Abbreviation
      currentValues[6] = Number(tcgdexDetailedSetData.cardCount?.official || tcgdexDetailedSetData.cardCount?.total || currentValues[6] || 0); // Total Cards
      // Set Logo und Symbol NICHT überschreiben (Spalten 2 und 3 - Index 1 und 2)
      // Die Werte in currentValues[2] und currentValues[3] bleiben, wie sie aus der Tabelle gelesen wurden.
      // populateSetsOverview() wird nach dem Import sowieso aufgerufen, um die neuesten Bild-URLs zu setzen.
    } else if (pokemontcgDetailedSetData) {
      // Fallback zu pokemontcg.io Daten, wenn kein TCGDex-Match gefunden wurde
      currentValues[1] = String(pokemontcgDetailedSetData.name || currentValues[1] || "");
      currentValues[4] = String(pokemontcgDetailedSetData.series || currentValues[4] || "");
      currentValues[5] = String(pokemontcgDetailedSetData.releaseDate || currentValues[5] || "");
      currentValues[7] = String(pokemontcgDetailedSetData.ptcgoCode || pokemontcgDetailedSetData.id ||currentValues[7] || "");
      currentValues[6] = Number(pokemontcgDetailedSetData.total || currentValues[6] || 0);
      // Set Logo und Symbol NICHT überschreiben
    }

    // Explicitly convert all elements to string to avoid any type issues with setValues if not already handled
    // This is a safety net.
    for (let i = 0; i < currentValues.length; i++) {
      if (typeof currentValues[i] === 'object' && currentValues[i] !== null && !Array.isArray(currentValues[i])) {
        // This case should ideally not happen if data is well-structured, but as a safeguard.
        Logger.log(`Warning: Found unexpected object at index ${i} in currentValues for row ${sheetRow}. Converting to string.`);
        currentValues[i] = String(currentValues[i]);
      } else if (currentValues[i] === null || typeof currentValues[i] === 'undefined') {
        currentValues[i] = ""; // Ensure null/undefined become empty strings
      }
    }


    try {
      Logger.log(`updateSetsOverviewRowAfterCardImport: Final values to set for row ${sheetRow}: ${JSON.stringify(currentValues)}`);
      targetRange.setValues([currentValues]);
    } catch (e) {
      Logger.log(`ERROR: Failed to set values for range ${targetRange.getA1Notation()} in row ${sheetRow}: ${e.message}. Stack: ${e.stack}`);
      throw new Error(`Failed to update Sets Overview row for set ${setIdToMatchInOverview}: ${e.message}. See script logs for more details.`);
    }

    // Set Data Validations separately for clarity and potential error isolation
    try {
      const importedCheckboxRange = setsSheet.getRange(sheetRow, IMPORTED_CHECKBOX_COL_INDEX);
      const reimportCheckboxRange = setsSheet.getRange(sheetRow, REIMPORT_CHECKBOX_COL_INDEX);

      importedCheckboxRange.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox(true).build());
      reimportCheckboxRange.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    } catch (e) {
      Logger.log(`ERROR: Failed to set data validations for row ${sheetRow}: ${e.message}. Stack: ${e.stack}`);
    }
  }
}

// ============================================================================
// SEKTION: KARTEN-IMPORT & SET-VERWALTUNG
// ============================================================================

/**
 * Ruft alle Karten eines pokemontcg.io Sets mit Paginierung ab.
 * 
 * Die API limitiert Antworten auf 250 Karten pro Seite.
 * Diese Funktion sammelt automatisch alle Seiten.
 * 
 * @function fetchAllPokemontcgIoCards
 * @param {string} pokemontcgSetId - Die pokemontcg.io Set-ID
 * @param {string} setName - Name des Sets für Logging
 * @returns {Array<Object>} Liste aller Karten, sortiert nach Nummer
 * @throws {Error} Wenn keine Karten gefunden werden
 * 
 * @example
 * const cards = fetchAllPokemontcgIoCards("sv08", "Surging Sparks");
 * console.log(`Geladen: ${cards.length} Karten`);
 */
function fetchAllPokemontcgIoCards(pokemontcgSetId, setName) {
  let allPokemontcgCards = [];
  let page = 1;
  const pageSize = 250; // Max cards per page for pokemontcg.io
  let morePages = true;

  Logger.log(`[fetchAllPokemontcgIoCards] Starting fetch for Set ID: ${pokemontcgSetId}, Name: ${setName}`);

  while (morePages) {
    let pokemontcgIoApiUrl = null;
    if (UseVeraApi) {
      pokemontcgIoApiUrl = `${VTCG_BASE_URL}cards/${VeraApiLanguage}/${pokemontcgSetId}.json`;

      const pokemontcgCardsResponse = fetchApiData(pokemontcgIoApiUrl, `Fehler beim Laden der ${pokemontcgIoApiUrl} Karten für Set ${setName}`);


      if (pokemontcgCardsResponse && pokemontcgCardsResponse.length > 0) {
        allPokemontcgCards = allPokemontcgCards.concat(pokemontcgCardsResponse);
        //Logger.log(`[fetchAllPokemontcgIoCards] Fetched ${pokemontcgCardsResponse.length} cards from page ${page}. Total collected: ${allPokemontcgCards.length}`);
        morePages = false; // No more data or error, stop fetching
      }
    }
    else {
      pokemontcgIoApiUrl = `${PTCG_BASE_URL}cards?q=set.id:${pokemontcgSetId}&page=${page}&pageSize=${pageSize}`;
      Logger.log(`[fetchAllPokemontcgIoCards] Fetching page ${page} from: ${pokemontcgIoApiUrl}`);

      const pokemontcgCardsResponse = fetchApiData(pokemontcgIoApiUrl, `Fehler beim Laden der ${pokemontcgIoApiUrl} Karten für Set ${setName}`);

      if (pokemontcgCardsResponse && pokemontcgCardsResponse.data && pokemontcgCardsResponse.data.length > 0) {
        allPokemontcgCards = allPokemontcgCards.concat(pokemontcgCardsResponse.data);
        Logger.log(`[fetchAllPokemontcgIoCards] Fetched ${pokemontcgCardsResponse.data.length} cards from page ${page}. Total collected: ${allPokemontcgCards.length}`);
        page++;
        Utilities.sleep(API_DELAY_MS); // Add a delay after each page fetch
      } else {
        morePages = false; // No more data or error, stop fetching
        Logger.log(`[fetchAllPokemontcgIoCards] No more pokemontcg.io cards found from page ${page}. Stopping pagination.`);
      }

    }


  }

  if (allPokemontcgCards.length === 0) {
    throw new Error(`Keine Karten von pokemontcg.io für Set "${setName}" (ID: ${pokemontcgSetId}) gefunden oder API-Problem nach Paginierung.`);
  }

  allPokemontcgCards.sort((a, b) => naturalSort(a.number || "", b.number || ""));
  Logger.log(`[fetchAllPokemontcgIoCards] Finished fetching all ${allPokemontcgCards.length} cards for Set ID: ${pokemontcgSetId}`);
  return allPokemontcgCards;
}


/**
 * Importiert und rendert Karten für ein spezifisches Set.
 * 
 * Hauptfunktion für den Set-Import:
 * 1. Prüft/erstellt Set-Blatt
 * 2. Lädt Kartendaten (loadCardsForSet)
 * 3. Aktualisiert Sets Overview
 * 4. Rendert Karten im Grid (renderAndSortCardsInSheet)
 * 5. Aktualisiert Collection Summary
 * 
 * Unterstützt sowohl pokemontcg.io als auch TCGDex-only Sets.
 * 
 * @function populateCardsForSet
 * @param {string} setIdFromOverview - Set-ID aus "Sets Overview" (pokemontcg.io oder TCGDEX-prefixed)
 * @throws {Error} Bei fehlenden Daten oder Blatt-Konflikten
 * 
 * @example
 * populateCardsForSet("sv08"); // pokemontcg.io Set
 * populateCardsForSet("TCGDEX-ex03"); // TCGDex-only Set
 */
function populateCardsForSet(setIdFromOverview) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setsSheet = ss.getSheetByName("Sets Overview");
  const ui = SpreadsheetApp.getUi();

  const lastExistingOverviewRow = setsSheet.getLastRow();
  const numExistingOverviewDataRows = Math.max(0, lastExistingOverviewRow - OVERVIEW_DATA_START_ROW);
  const setsData = numExistingOverviewDataRows > 0 ?
    setsSheet.getRange(OVERVIEW_DATA_START_ROW + 1, 1, numExistingOverviewDataRows, setsSheet.getLastColumn()).getValues() : [];

  const overviewSetRow = setsData.find(r => extractIdFromHyperlink(r[0]) === setIdFromOverview);

  if (!overviewSetRow) {
    ui.alert("Error", `Set mit ID "${setIdFromOverview}" nicht in "Sets Overview" gefunden! Bitte führen Sie zuerst "1. Setup & Sets importieren" aus.`, ui.ButtonSet.OK);
    throw new Error(`Set ID "${setIdFromOverview}" nicht in Sets Overview gefunden.`); // Fehler werfen für bessere Behandlung
  }

  const setNameInSheet = overviewSetRow[1];
  let cardSheet = ss.getSheetByName(setNameInSheet);

  // Verbesserte Logik für das Erstellen/Wiederverwenden von Blättern
  if (cardSheet) {
    let sheetNote = cardSheet.getRange(1, 1).getNote() || "";
    const expectedNote = `Set ID: ${setIdFromOverview}`;
    const noteSetId = sheetNote.startsWith('Set ID: ') ? sheetNote.substring('Set ID: '.length).trim() : '';
    
    // DEBUG: Diagnostiziere die aktuelle Situation
    Logger.log(`[populateCardsForSet] Blatt "${setNameInSheet}" found. sheetNote="${sheetNote}", expectedNote="${expectedNote}"`);
    
    // Prüfe auf Migrations-Szenario: TCGdex-only zu regulärer API
    // (Wenn Set ursprünglich als TCGDEX-{ID} importiert wurde, jetzt aber in Haupt-API verfügbar ist)
    let isMigrationCase = false;
    if (sheetNote && sheetNote.startsWith('Set ID: TCGDEX-') && !setIdFromOverview.startsWith('TCGDEX-')) {
      const oldTcgdexId = sheetNote.substring('Set ID: '.length); // z.B. "TCGDEX-me2pt5"
      const normalizedOldId = oldTcgdexId.substring('TCGDEX-'.length); // z.B. "me2pt5"
      const normalizedNewId = setIdFromOverview; // z.B. "me2pt5"
      
      Logger.log(`[Migration Check] oldTcgdexId="${oldTcgdexId}", normalizedOldId="${normalizedOldId}", normalizedNewId="${normalizedNewId}"`);
      
      if (areSetIdsEquivalent(normalizedOldId, normalizedNewId)) {
        isMigrationCase = true;
        Logger.log(`[Migration] TCGdex-only Set wird aktualisiert: ${oldTcgdexId} → ${setIdFromOverview}`);
        cardSheet.getRange(1, 1).setNote(expectedNote);
        SpreadsheetApp.getActive().toast(`♻️ Set "${setNameInSheet}" wird von TCGdex-only zu regulärer API migriert...`, "Migration in Bearbeitung", 3);
      } else {
        Logger.log(`[Migration Check] IDs stimmen nicht überein: "${normalizedOldId}" ≠ "${normalizedNewId}"`);
      }
    } else if (!sheetNote || sheetNote.trim() === "") {
      Logger.log(`[populateCardsForSet] WARNUNG: Blatt "${setNameInSheet}" hat keine Notiz in A1. Dies könnte ein beschädigtes Blatt sein.`);
    }

    // Allgemeine Alias-Migration (z.B. "me02.5" -> "me2pt5"), auch ohne TCGDEX-Präfix
    // Wenn normalisierte IDs übereinstimmen, migriere automatisch auf die erwartete ID.
    if (!isMigrationCase && noteSetId) {
      if (areSetIdsEquivalent(noteSetId, setIdFromOverview) && noteSetId !== setIdFromOverview) {
        Logger.log(`[Alias-Migration] Blatt "${setNameInSheet}": "${noteSetId}" -> "${setIdFromOverview}"`);

        cardSheet.getRange(1, 1).setNote(expectedNote);
        isMigrationCase = true;

        const scriptProperties = PropertiesService.getScriptProperties();

        // importedSetsStatus migrieren
        const importedSetsStatus = getScriptPropertiesData('importedSetsStatus', {});
        if (importedSetsStatus[noteSetId]) {
          importedSetsStatus[setIdFromOverview] = true;
          delete importedSetsStatus[noteSetId];
          setScriptPropertiesData('importedSetsStatus', importedSetsStatus);
        }

        // collectedCardsData / customImageUrls migrieren
        const collectedCardsData = getScriptPropertiesData('collectedCardsData', {});
        if (collectedCardsData[noteSetId] && !collectedCardsData[setIdFromOverview]) {
          collectedCardsData[setIdFromOverview] = collectedCardsData[noteSetId];
          delete collectedCardsData[noteSetId];
          setScriptPropertiesData('collectedCardsData', collectedCardsData);
        }

        const customImageUrls = getScriptPropertiesData('customImageUrls', {});
        if (customImageUrls[noteSetId] && !customImageUrls[setIdFromOverview]) {
          customImageUrls[setIdFromOverview] = customImageUrls[noteSetId];
          delete customImageUrls[noteSetId];
          setScriptPropertiesData('customImageUrls', customImageUrls);
        }

        // Cardmarket-Key migrieren
        const oldCardmarketKey = `pokemontcgIoCardmarketUrls_${noteSetId}`;
        const newCardmarketKey = `pokemontcgIoCardmarketUrls_${setIdFromOverview}`;
        const cardmarketData = getScriptPropertiesData(oldCardmarketKey, null);
        if (cardmarketData) {
          setScriptPropertiesData(newCardmarketKey, cardmarketData);
          scriptProperties.deleteProperty(oldCardmarketKey);
        }

        // Lokale Variable aktualisieren, damit nachfolgende Prüfungen den neuen Zustand sehen
        sheetNote = cardSheet.getRange(1, 1).getNote() || "";
      }
    }
    
    if (sheetNote !== expectedNote && !isMigrationCase) {
      // NOTFALL-FIX: Versuche noch einmal eine "tiefere" Migration für alte Blätter
      // Falls die Notiz völlig falsch ist, versuche eine manuelle Korrektur
      if (sheetNote.includes('TCGDEX-')) {
        Logger.log(`[Notfall-Migration] Versuche manuelle Migration für "${setNameInSheet}" mit alter Notiz: "${sheetNote}"`);
        
        try {
          // Extrahiere die Set-ID aus der alten Notiz (könnte verschiedene Formate sein)
          const possibleOldId = sheetNote.replace('Set ID: ', '').trim();
          if (possibleOldId.includes('TCGDEX-')) {
            const normalizedFromOld = possibleOldId.substring('TCGDEX-'.length);
            if (areSetIdsEquivalent(normalizedFromOld, setIdFromOverview)) {
              Logger.log(`[Notfall-Migration] Manuelle Korrektur erfolgreich: "${possibleOldId}" → "${setIdFromOverview}"`);
              cardSheet.getRange(1, 1).setNote(expectedNote);
              isMigrationCase = true;
              // Migriere auch PropertiesService-Daten
              const oldCardmarketKey = `pokemontcgIoCardmarketUrls_${possibleOldId}`;
              const newCardmarketKey = `pokemontcgIoCardmarketUrls_${setIdFromOverview}`;
              const cardmarketData = getScriptPropertiesData(oldCardmarketKey, null);
              if (cardmarketData) {
                setScriptPropertiesData(newCardmarketKey, cardmarketData);
                PropertiesService.getScriptProperties().deleteProperty(oldCardmarketKey);
                Logger.log(`[Notfall-Migration] Cardmarket-URLs migriert`);
              }
            }
          }
        } catch (migrationError) {
          Logger.log(`[Notfall-Migration] Fehler bei manueller Migration: ${migrationError.message}`);
        }
      }
      
      // Wenn trotz Notfall-Fix immer noch kein Match, dann werfe Fehler
      if (sheetNote !== expectedNote && !isMigrationCase) {
        // Wenn Blatt existiert, aber nicht zu diesem Set gehört
        const errorMessage = `Das Tabellenblatt mit dem Namen "${setNameInSheet}" existiert bereits, ist aber nicht dem Set mit der ID "${setIdFromOverview}" zugeordnet. Bitte löschen oder benennen Sie das Blatt "${setNameInSheet}" um, bevor Sie fortfahren, oder stellen Sie sicher, dass die Notiz in A1 des Blattes korrekt ist ("Set ID: ${setIdFromOverview}"). (Aktuelle Notiz: "${sheetNote}")`;
        // KEIN UI.ALERT HIER, da die aufrufende Funktion den Alert übernimmt.
        Logger.log(errorMessage);
        throw new Error(errorMessage); // Fehler werfen für korrekten Abbruch
      }
    }
    // Wenn cardSheet existiert und die Notiz übereinstimmt, wird es wiederverwendet.
  } else {
    // Wenn cardSheet nicht existiert, wird ein neues Blatt eingefügt.
    cardSheet = ss.insertSheet(setNameInSheet);
    ss.moveActiveSheet(ss.getSheets().length);
  }

  SpreadsheetApp.getActive().toast(`Lade Daten für Set "${setNameInSheet}"...`, "🔄 In Bearbeitung", 5);

  // Wenn Migration durchgeführt wurde, Alte TCGdex-ID aus importedSetsStatus entfernen
  const isMigrationCase = cardSheet.getRange(1, 1).getNote() === `Set ID: ${setIdFromOverview}` && 
                          (setIdFromOverview.startsWith('TCGDEX-') ? false : true); // War es vor kurzem eine TCGdex-ID?
  
  if (isMigrationCase && !setIdFromOverview.startsWith('TCGDEX-')) {
    // Versuche, alte TCGdex-Präfix-ID aus importedSetsStatus zu entfernen
    const oldTcgdexId = `TCGDEX-${setIdFromOverview}`;
    const importedSetsStatus = getScriptPropertiesData('importedSetsStatus', {});
    if (importedSetsStatus[oldTcgdexId]) {
      delete importedSetsStatus[oldTcgdexId];
      setScriptPropertiesData('importedSetsStatus', importedSetsStatus);
      Logger.log(`[Migration] Entferne alte TCGdex-ID aus importedSetsStatus: ${oldTcgdexId}`);
    }
  }

  const tcgdexAllSets = fetchApiData(`${TCGDEX_BASE_URL}sets`, "Fehler beim Laden der TCGDex Sets für Kartenimport");
  const cardData = loadCardsForSet(setIdFromOverview, setNameInSheet, tcgdexAllSets);
  
  const { allCards, cardmarketData, tcgdexDetailedSet, pokemontcgDetailedSet } = cardData;
  
  if (allCards.length === 0) {
    throw new Error(`Keine Karten für Set "${setNameInSheet}" gefunden.`);
  }
  
  cardSheet.getRange(1, 1).setNote(`Set ID: ${setIdFromOverview}`);

  // Update Sets Overview row
  updateSetsOverviewRowAfterCardImport(setIdFromOverview, pokemontcgDetailedSet, tcgdexDetailedSet, cardSheet);

  // Render and sort cards
  renderAndSortCardsInSheet(cardSheet, setIdFromOverview, allCards, cardmarketData);

  // Registriere Set als "bekannt importiert" – leerer {} verhindert falschen TCGDEX-Fallback
  // bei Sets, bei denen noch nichts gesammelt wurde.
  {
    const _ccd = getScriptPropertiesData('collectedCardsData');
    if (_ccd[setIdFromOverview] === undefined) {
      _ccd[setIdFromOverview] = {};
      setScriptPropertiesData('collectedCardsData', _ccd);
      Logger.log(`[populateCardsForSet] Set ${setIdFromOverview} als bekannt in collectedCardsData registriert.`);
    }
  }

  // Update Collection Summary
  updateCollectionSummary();

  SpreadsheetApp.getActive().toast(`${allCards.length} Karten für Set "${setNameInSheet}" im Raster angeordnet.`, `✅ Raster erstellt`, 8);
}


// ============================================================================
// SEKTION: KARTEN-RENDERING & GRID-LAYOUT
// ============================================================================

/**
 * Extrahiert Sammelstatus (G/RH) aus einem bereits gerenderten Set-Blatt.
 *
 * Wird genutzt, wenn persistente Daten für ein Set fehlen, aber im Sheet
 * bereits Checkbox-Zustände vorhanden sind (z. B. Migration alter Tabellen).
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} cardSheet - Set-Blatt
 * @returns {Object} Map: { [cardId]: { g: boolean, rh: boolean } }
 */
function extractCollectedDataFromSheet(cardSheet) {
  const result = {};
  const lastRow = cardSheet.getLastRow();
  if (lastRow <= SET_SHEET_HEADER_ROWS) return result;

  const dataRows = lastRow - SET_SHEET_HEADER_ROWS;
  const totalCols = CARDS_PER_ROW_IN_GRID * CARD_BLOCK_WIDTH_COLS;
  const values = cardSheet.getRange(SET_SHEET_HEADER_ROWS + 1, 1, dataRows, totalCols).getValues();

  const toBoolean = v => v === true || String(v).toLowerCase() === 'true';

  for (let rowBlock = 0; rowBlock * CARD_BLOCK_HEIGHT_ROWS < dataRows; rowBlock++) {
    for (let colBlock = 0; colBlock < CARDS_PER_ROW_IN_GRID; colBlock++) {
      const br = rowBlock * CARD_BLOCK_HEIGHT_ROWS;
      const bc = colBlock * CARD_BLOCK_WIDTH_COLS;
      if (br >= dataRows) break;

      const rawId = String(values[br][bc] || '').trim();
      if (!rawId) continue;

      const checkRow = br + 2;
      if (checkRow >= dataRows) continue;

      const cardId = normalizeCardNumber(rawId);
      const g = toBoolean(values[checkRow][bc]);
      const rh = toBoolean(values[checkRow][bc + 1]);

      if (g || rh) {
        result[cardId] = { g, rh };
      }
    }
  }

  return result;
}

/**
 * Rendert und sortiert Karten in einem Set-Blatt im Grid-Layout.
 * 
 * Zentraler Rendering-Algorithmus:
 * 1. Sortiert Karten nach Sammlungsstatus (ungesammelt zuerst)
 * 2. Leert bestehendes Sheet-Layout
 * 3. Erstellt Header mit Statistiken
 * 4. Rendert Karten in Grid-Formation (5 pro Reihe)
 * 5. Setzt Checkboxen, Bilder und Cardmarket-Links
 * 6. Wendet Farb-Coding an (grün=collected, blau=RH)
 * 
 * @function renderAndSortCardsInSheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} cardSheet - Ziel-Blatt für Rendering
 * @param {string} setId - Set-ID (pokemontcg.io oder TCGDEX-prefixed)
 * @param {Array<Object>} allCards - Liste der zu rendernden Karten
 * @param {Object} pokemontcgIoCardData - Cardmarket-URLs (leer für TCGDex-only)
 * 
 * @example
 * renderAndSortCardsInSheet(sheet, "sv08", cards, cardmarketData);
 */
function renderAndSortCardsInSheet(cardSheet, setId, allCards, pokemontcgIoCardData) {
  // Stellen Sie sicher, dass allCards ein Array ist und keine leeren Elemente enthält,
  // bevor Sie es verarbeiten, um den Fehler "Bereich muss mindestens 1 Zeile enthalten" zu vermeiden.
  if (!allCards || allCards.length === 0) {
    // Wenn keine Karten übergeben wurden, ist das ein Problem.
    // KEIN UI.ALERT HIER, da die aufrufende Funktion den Alert übernimmt.
    // Leert den Datenbereich, falls keine Karten vorhanden sind.
    // Sicherstellen, dass der Bereich zum Löschen gültig ist, auch wenn das Blatt nur Header hat.
    const lastRowInSheet = cardSheet.getLastRow();
    if (lastRowInSheet > SET_SHEET_HEADER_ROWS) {
      cardSheet.getRange(SET_SHEET_HEADER_ROWS + 1, 1, lastRowInSheet - SET_SHEET_HEADER_ROWS, cardSheet.getMaxColumns()).clear();
    }
    // Aktualisiert die Kopfzeile auch bei 0 Karten
    const totalCardsInSet = 0;
    const collectedCount = 0;
    const reverseHoloCount = 0;
    const completionPercentage = 0;
    const officialAbbreviation = getOfficialAbbreviationFromOverview(setId); // Helferfunktion benötigt
    const headerSummaryRange = cardSheet.getRange(2, 1, 1, SORT_SET_CHECKBOX_COL_OFFSET);
    headerSummaryRange.setValue(
      `Gesamtzahl Karten: ${totalCardsInSet} | ` +
      `Gesammelte Karten: ${collectedCount} | ` +
      `Gesammelte RH Karten: ${reverseHoloCount} | ` +
      `Abschluss-Prozentsatz: ${completionPercentage.toLocaleString(undefined, { style: 'percent', minimumFractionDigits: 0 })} | ` +
      `Abkürzung: ${officialAbbreviation}`
    );
    return;
  }

  const collectedCardsData = getScriptPropertiesData('collectedCardsData');

  // Auto-Recover: Wenn für dieses Set noch keine persistente Struktur existiert,
  // versuche vorhandene Checkbox-Zustände direkt aus dem Sheet zu übernehmen.
  if (collectedCardsData[setId] === undefined) {
    const recovered = extractCollectedDataFromSheet(cardSheet);
    collectedCardsData[setId] = recovered;
    setScriptPropertiesData('collectedCardsData', collectedCardsData);
    Logger.log(`[renderAndSortCardsInSheet] Auto-Recover für ${setId}: ${Object.keys(recovered).length} Karten aus Sheet übernommen.`);
  }

  let currentSetCollectedData = collectedCardsData[setId] || {};

  // Fallback für migrierte Sets: wenn unter neuer ID nichts vorhanden ist,
  // aber unter alter TCGDEX-Notation noch Daten liegen, verwende diese.
  if (Object.keys(currentSetCollectedData).length === 0 && !setId.startsWith('TCGDEX-')) {
    const legacySetId = `TCGDEX-${setId}`;
    if (collectedCardsData[legacySetId] && Object.keys(collectedCardsData[legacySetId]).length > 0) {
      currentSetCollectedData = collectedCardsData[legacySetId];
      Logger.log(`[renderAndSortCardsInSheet] Nutze Legacy-Sammlungsdaten aus ${legacySetId} für ${setId}.`);
    }
  }

  const customImageUrls = getScriptPropertiesData('customImageUrls');
  const currentSetCustomImageUrls = customImageUrls[setId] || {};

  // DEBUG: Überprüfe, ob collectedCardsData für dieses Set leer ist (DIAGNOSTIC)
  if (Object.keys(currentSetCollectedData).length === 0 && collectedCardsData[setId] === undefined) {
    Logger.log(`[renderAndSortCardsInSheet] WARNUNG: Keine Sammlungsdaten für Set ${setId} gefunden. Dies könnte bei mehreren Sets sortieren auftreten.`);
  }

  // Schritt 1: Karten mit ihrem gesammelten Status für die Sortierung erweitern.
  const cardsForSorting = allCards.map(card => {
    // Verwende card.number für pokemontcg.io Sets, und card.localId/card.id für TCGDex-only Sets, die zu 'number' gemappt wurden.
    const cardNumberOrId = normalizeCardNumber(card.number || card.id);
    const unnormalizedCardId = card.number || card.id; // Fallback für nicht normalisierte Kartennummern
    
    // Versuche zuerst die normalisierte Version, dann als Fallback die unnormalisierte
    let status = currentSetCollectedData[cardNumberOrId] || currentSetCollectedData[unnormalizedCardId] || { g: false, rh: false };
    
    // DEBUG LOG: Falls beide Keys nicht gefunden wurden, log dies
    if (!currentSetCollectedData[cardNumberOrId] && !currentSetCollectedData[unnormalizedCardId] && Object.keys(currentSetCollectedData).length > 0) {
      Logger.log(`[renderAndSortCardsInSheet] Kartennummer-Mismatch für ${cardNumberOrId} (unnormalisiert: ${unnormalizedCardId}). Verfügbare Keys: ${JSON.stringify(Object.keys(currentSetCollectedData).slice(0, 5))}`);
    }
    
    return { ...card, g: status.g, rh: status.rh, displayId: cardNumberOrId };
  });

  // Schritt 2: Karten sortieren.
  cardsForSorting.sort((a, b) => {
    // Ungesammelte Karten zuerst (false kommt vor true).
    if (a.g !== b.g) {
      return a.g ? 1 : -1;
    }

    // Zusätzliche Sortierung nach RH, wenn G gleich ist.
    if (a.rh !== b.rh) {
      return a.rh ? 1 : -1;
    }

    // Wenn G und RH gleich sind, dann nach natürlicher Kartennummer sortieren.
    return naturalSort(a.displayId, b.displayId);
  });

  // Schritt 3: Blatt leeren.
  const lastRow = cardSheet.getLastRow();
  if (lastRow > SET_SHEET_HEADER_ROWS) {
    // Sicherstellen, dass der gesamte relevante Bereich vollständig geleert wird,
    // um bestehende Merges und Formatierungen zu entfernen.
    const dataRange = cardSheet.getRange(SET_SHEET_HEADER_ROWS + 1, 1, lastRow - SET_SHEET_HEADER_ROWS, cardSheet.getMaxColumns());
    dataRange.clear(); // clear() löscht Inhalt, Formate, Datenvalidierungen und Merges
  }

  // --- Kopfzeilen zu Set-Blatt hinzufügen ---
  let collectedCount = 0;
  let reverseHoloCount = 0;
  cardsForSorting.forEach(card => {
    if (card.g) {
      collectedCount++;
    }
    if (card.rh) {
      reverseHoloCount++;
    }
  });
  const totalCardsInSet = cardsForSorting.length;
  const completionPercentage = (totalCardsInSet > 0) ? collectedCount / totalCardsInSet : 0;

  const officialAbbreviation = getOfficialAbbreviationFromOverview(setId);

  for (let i = 1; i <= SET_SHEET_HEADER_ROWS; i++) {
    cardSheet.setRowHeight(i, SET_SHEET_HEADER_ROW_HEIGHT);
  }

  const headerNameIdRange = cardSheet.getRange(1, 1, 1, SORT_SET_CHECKBOX_COL_OFFSET - 1);
  headerNameIdRange.setValue(`${cardSheet.getName()} (Set-ID: ${extractIdFromHyperlink(setId)})`); // Zeigt die reine ID an
  headerNameIdRange.merge();
  headerNameIdRange.setHorizontalAlignment("center");
  headerNameIdRange.setVerticalAlignment("middle");
  headerNameIdRange.setFontWeight("bold");
  headerNameIdRange.setBackground("#E0E0E0");

  const sortCheckboxRange = cardSheet.getRange(SORT_SET_CHECKBOX_ROW, SORT_SET_CHECKBOX_COL_OFFSET);
  sortCheckboxRange.setValue(false);
  sortCheckboxRange.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  sortCheckboxRange.setHorizontalAlignment("center");
  sortCheckboxRange.setVerticalAlignment("middle");
  sortCheckboxRange.setBackground("#E0E0E0");

  const headerSummaryRange = cardSheet.getRange(2, 1, 1, SORT_SET_CHECKBOX_COL_OFFSET);
  headerSummaryRange.setValue(
    `Gesamtzahl Karten: ${totalCardsInSet} | ` +
    `Gesammelte Karten: ${collectedCount} | ` +
    `Gesammelte RH Karten: ${reverseHoloCount} | ` +
    `Abschluss-Prozentsatz: ${completionPercentage.toLocaleString(undefined, { style: 'percent', minimumFractionDigits: 0 })} | ` +
    `Abkürzung: ${officialAbbreviation}`
  );
  headerSummaryRange.merge();
  headerSummaryRange.setHorizontalAlignment("center");
  headerSummaryRange.setVerticalAlignment("middle");
  headerSummaryRange.setFontWeight("bold");
  headerSummaryRange.setBackground("#EFEFEF");

  cardSheet.getRange(1, 1).setNote(`Set ID: ${setId}`); // Speichert die vollständige ID (z.B. TCGDEX-ex03)

  const totalColsNeeded = CARDS_PER_ROW_IN_GRID * CARD_BLOCK_WIDTH_COLS;
  for (let i = 0; i < CARDS_PER_ROW_IN_GRID; i++) {
    const baseCol = 1 + i * CARD_BLOCK_WIDTH_COLS;
    cardSheet.setColumnWidth(baseCol, COLUMN_WIDTH_CARD_COL1);
    cardSheet.setColumnWidth(baseCol + 1, COLUMN_WIDTH_CARD_COL2);
    cardSheet.setColumnWidth(baseCol + 2, COLUMN_WIDTH_CARD_COL3);
  }
  // Stelle sicher, dass keine unnötigen Spalten am Ende existieren
  if (cardSheet.getMaxColumns() > totalColsNeeded) {
    cardSheet.deleteColumns(totalColsNeeded + 1, cardSheet.getMaxColumns() - totalColsNeeded);
  }

  const numCards = cardsForSorting.length;
  const totalRowsForCards = Math.ceil(numCards / CARDS_PER_ROW_IN_GRID) * CARD_BLOCK_HEIGHT_ROWS;
  const totalRowsNeeded = SET_SHEET_HEADER_ROWS + totalRowsForCards;

  // Stelle sicher, dass das Blatt VOR allen Range-/RowHeight-Operationen groß genug ist.
  if (cardSheet.getMaxRows() < totalRowsNeeded) {
    cardSheet.insertRowsAfter(cardSheet.getMaxRows(), totalRowsNeeded - cardSheet.getMaxRows());
  } else if (cardSheet.getMaxRows() > totalRowsNeeded) {
    cardSheet.deleteRows(totalRowsNeeded + 1, cardSheet.getMaxRows() - totalRowsNeeded);
  }

  if (cardSheet.getMaxColumns() < totalColsNeeded) {
    cardSheet.insertColumnsAfter(cardSheet.getMaxColumns(), totalColsNeeded - cardSheet.getMaxColumns());
  }

  // Setze Zeilenhöhen für die Kartenblöcke
  for (let i = 0; i < totalRowsForCards / CARD_BLOCK_HEIGHT_ROWS; i++) {
    const startSheetRow = SET_SHEET_HEADER_ROWS + 1 + i * CARD_BLOCK_HEIGHT_ROWS;
    cardSheet.setRowHeight(startSheetRow, ROW_HEIGHT_ID_NAME);
    cardSheet.setRowHeight(startSheetRow + 1, ROW_HEIGHT_IMAGE);
    cardSheet.setRowHeight(startSheetRow + 2, ROW_HEIGHT_CHECKS_LINK);
    cardSheet.setRowHeight(startSheetRow + 3, ROW_HEIGHT_SPACER);
  }


  const values = Array(totalRowsForCards).fill(0).map(() => Array(totalColsNeeded).fill(''));
  const backgrounds = Array(totalRowsForCards).fill(0).map(() => Array(totalColsNeeded).fill(null));
  const numberFormats = Array(totalRowsForCards).fill(0).map(() => Array(totalColsNeeded).fill(''));
  const horizontalAlignments = Array(totalRowsForCards).fill(0).map(() => Array(totalColsNeeded).fill(null));
  const verticalAlignments = Array(totalRowsForCards).fill(0).map(() => Array(totalColsNeeded).fill(null));
  const fontWeights = Array(totalRowsForCards).fill(0).map(() => Array(totalColsNeeded).fill(null));
  const wrapStrategies = Array(totalRowsForCards).fill(0).map(() => Array(totalColsNeeded).fill(SpreadsheetApp.WrapStrategy.OVERFLOW));
  const formulas = Array(totalRowsForCards).fill(0).map(() => Array(totalColsNeeded).fill(null));
  const fontColors = Array(totalRowsForCards).fill(0).map(() => Array(totalColsNeeded).fill(''));
  const dataValidations = Array(totalRowsForCards).fill(0).map(() => Array(totalColsNeeded).fill(null));

  const rangesForBorders = [];

  cardsForSorting.forEach((card, index) => {
    const gridRowIndex = Math.floor(index / CARDS_PER_ROW_IN_GRID);
    const gridColIndex = index % CARDS_PER_ROW_IN_GRID;
    const startSheetRow = gridRowIndex * CARD_BLOCK_HEIGHT_ROWS;
    const startSheetCol = gridColIndex * CARD_BLOCK_WIDTH_COLS;

    const cardIdToUse = card.displayId;
    const cardCollectedData = currentSetCollectedData[cardIdToUse] || { g: false, rh: false };

    // 1. ID und Name (Zeile 1 des Blocks)
    values[startSheetRow][startSheetCol] = cardIdToUse;
    numberFormats[startSheetRow][startSheetCol] = '@';
    horizontalAlignments[startSheetRow][startSheetCol] = "center";
    verticalAlignments[startSheetRow][startSheetCol] = "middle";
    fontWeights[startSheetRow][startSheetCol] = "bold";

    values[startSheetRow][startSheetCol + 1] = card.name || "Unbekannt";
    horizontalAlignments[startSheetRow][startSheetCol + 1] = "left";
    verticalAlignments[startSheetRow][startSheetCol + 1] = "middle";
    fontWeights[startSheetRow][startSheetCol + 1] = "bold";
    wrapStrategies[startSheetRow][startSheetCol + 1] = SpreadsheetApp.WrapStrategy.WRAP;

    // Merge Name über die zweite und dritte Spalte des Blocks
    // Die merge-Operation muss direkt auf das Blatt-Objekt angewendet werden, nicht auf die Arrays.
    // Dies muss nach dem Setzen der Werte erfolgen, um Überschreibungen zu vermeiden.
    // Temporäre Anpassung für die Formel-Generierung, da setValues zuerst alles setzt.
    // Das Mergen wird außerhalb dieser Schleife angewendet, nachdem alle Werte gesetzt wurden.


    // 2. Bild (Zeile 2 des Blocks)
    const imageSheetRow = startSheetRow + 1;
    const customImageUrlFormula = currentSetCustomImageUrls[cardIdToUse];
    let finalImageUrlFormula = "";
    // OPTIMIERUNG: `storedPokemontcgIoSpecificData` wird hier nicht mehr für `imageUrl` verwendet.
    // const storedPokemontcgIoSpecificData = pokemontcgIoCardData?.[cardIdToUse]; 

    if (customImageUrlFormula) {
      finalImageUrlFormula = customImageUrlFormula;
    } else if (card.images?.small) { // Bevorzuge das Bild, das bereits in allCards gemerged wurde (TCGDex mit /low.jpg oder pokemontcg.io)
      finalImageUrlFormula = `=IMAGE("${card.images.small}"; 1)`;
    } else {
      // Wenn weder eine benutzerdefinierte URL noch eine API-URL verfügbar ist
      finalImageUrlFormula = "Kein Bild";
    }
    Logger.log(`Kartenbild-Formel für Karte ${cardIdToUse}: ${finalImageUrlFormula}`);

    // Setze die Formel nur, wenn es eine "=IMAGE(" Formel ist. Andernfalls setze den Wert.
    if (finalImageUrlFormula.startsWith("=IMAGE(")) {
      formulas[imageSheetRow][startSheetCol] = finalImageUrlFormula;
    } else {
      values[imageSheetRow][startSheetCol] = finalImageUrlFormula;
    }
    horizontalAlignments[imageSheetRow][startSheetCol] = "center";
    verticalAlignments[imageSheetRow][startSheetCol] = "middle";

    // Merge Image über alle 3 Spalten des Blocks
    // Auch hier: Merging wird später angewendet.


    // 3. Checkboxen und Link (Zeile 3 des Blocks)
    const checksAndLinkSheetRow = startSheetRow + 2;

    values[checksAndLinkSheetRow][startSheetCol] = cardCollectedData.g;
    dataValidations[checksAndLinkSheetRow][startSheetCol] = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    horizontalAlignments[checksAndLinkSheetRow][startSheetCol] = "center";
    verticalAlignments[checksAndLinkSheetRow][startSheetCol] = "middle";

    values[checksAndLinkSheetRow][startSheetCol + 1] = cardCollectedData.rh;
    horizontalAlignments[checksAndLinkSheetRow][startSheetCol + 1] = "center";
    verticalAlignments[checksAndLinkSheetRow][startSheetCol + 1] = "middle";

    if (cardCollectedData.g) {
      dataValidations[checksAndLinkSheetRow][startSheetCol + 1] = SpreadsheetApp.newDataValidation().requireCheckbox().build();
      fontColors[checksAndLinkSheetRow][startSheetCol + 1] = '';
      if (cardCollectedData.rh) {
        backgrounds[checksAndLinkSheetRow][startSheetCol + 1] = REVERSE_HOL_COLLECTED_COLOR;
      }
    } else {
      values[checksAndLinkSheetRow][startSheetCol + 1] = false;
      dataValidations[checksAndLinkSheetRow][startSheetCol + 1] = null;
      fontColors[checksAndLinkSheetRow][startSheetCol + 1] = '#FFFFFF';
    }

    // Cardmarket-URL kommt immer noch aus pokemontcgIoCardData oder card.cardmarket?.url
    const storedCardmarketUrl = pokemontcgIoCardData?.[cardIdToUse]?.cardmarketUrl || card.cardmarket?.url;

    if (storedCardmarketUrl) {
      //if (false) {
      formulas[checksAndLinkSheetRow][startSheetCol + 2] = `=HYPERLINK("${storedCardmarketUrl}"; "CM")`;
    } else {
      // Fallback: If no direct Cardmarket URL, try constructing one using pokemontcg.io card ID (if applicable)
      if (card.id && !setId.startsWith('TCGDEX-')) { // Only if it's a pokemontcg.io card and has a global ID
        //Sample https://www.cardmarket.com/de/Pokemon/Products/Search?searchMode=v2&category=51&searchString=CRZ+GG02
        // const genericCardmarketUrl = `https://www.cardmarket.com/en/Pokemon/Products/Singles?idCategory=1&idProduct=${card.id}`;
        const genericCardmarketUrl = `https://www.cardmarket.com/de/Pokemon/Products/Search?searchMode=v2&searchString=${officialAbbreviation}+${card.number}`;
        formulas[checksAndLinkSheetRow][startSheetCol + 2] = `=HYPERLINK("${genericCardmarketUrl}"; "CM")`;
      } else {
        values[checksAndLinkSheetRow][startSheetCol + 2] = "CM (Link fehlt)";
      }
    }
    horizontalAlignments[checksAndLinkSheetRow][startSheetCol + 2] = "center";
    verticalAlignments[checksAndLinkSheetRow][startSheetCol + 2] = "middle";
    fontColors[checksAndLinkSheetRow][startSheetCol + 2] = "blue";

    const blockColor = cardCollectedData.rh ? REVERSE_HOL_COLLECTED_COLOR : (cardCollectedData.g ? COLLECTED_COLOR : null);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < CARD_BLOCK_WIDTH_COLS; c++) {
        backgrounds[startSheetRow + r][startSheetCol + c] = blockColor;
      }
    }

    rangesForBorders.push(cardSheet.getRange(SET_SHEET_HEADER_ROWS + startSheetRow + 1, startSheetCol + 1, 3, CARD_BLOCK_WIDTH_COLS));
  });

  if (totalRowsForCards > 0) {
    const fullRange = cardSheet.getRange(SET_SHEET_HEADER_ROWS + 1, 1, totalRowsForCards, totalColsNeeded);
    fullRange.setValues(values);
    fullRange.setBackgrounds(backgrounds);
    fullRange.setNumberFormats(numberFormats);
    fullRange.setHorizontalAlignments(horizontalAlignments);
    fullRange.setVerticalAlignments(verticalAlignments);
    fullRange.setFontWeights(fontWeights);
    fullRange.setWrapStrategies(wrapStrategies);
    fullRange.setFontColors(fontColors);

    for (let r = 0; r < totalRowsForCards; r++) {
      for (let c = 0; c < totalColsNeeded; c++) {
        if (formulas[r][c] !== null) {
          cardSheet.getRange(SET_SHEET_HEADER_ROWS + r + 1, c + 1).setFormula(formulas[r][c]);
        }
      }
    }

    for (let r = 0; r < totalRowsForCards; r++) {
      for (let c = 0; c < totalColsNeeded; c++) {
        if (dataValidations[r][c] !== null) {
          cardSheet.getRange(SET_SHEET_HEADER_ROWS + r + 1, c + 1).setDataValidation(dataValidations[r][c]);
        }
      }
    }

    // Applying merges after all values and formulas are set
    cardsForSorting.forEach((card, index) => {
      const gridRowIndex = Math.floor(index / CARDS_PER_ROW_IN_GRID);
      const gridColIndex = index % CARDS_PER_ROW_IN_GRID;
      const startSheetRow = SET_SHEET_HEADER_ROWS + 1 + gridRowIndex * CARD_BLOCK_HEIGHT_ROWS; // Absolute Zeile im Blatt
      const startSheetCol = 1 + gridColIndex * CARD_BLOCK_WIDTH_COLS; // Absolute Spalte im Blatt

      // Merge Name über die zweite und dritte Spalte des Blocks
      cardSheet.getRange(startSheetRow, startSheetCol + 1, 1, CARD_BLOCK_WIDTH_COLS - 1).merge();
      // Merge Image über alle 3 Spalten des Blocks
      cardSheet.getRange(startSheetRow + 1, startSheetCol, 1, CARD_BLOCK_WIDTH_COLS).merge();
    });
  }

  rangesForBorders.forEach(range => {
    range.setBorder(true, true, true, true, true, true, "#BDBDBD", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  });
}

/**
 * Holt die offizielle Abkürzung eines Sets aus "Sets Overview".
 * 
 * @function getOfficialAbbreviationFromOverview
 * @param {string} setId - Set-ID (pokemontcg.io oder TCGDEX-prefixed)
 * @returns {string} Offizielle Abkürzung oder leerer String
 * 
 * @example
 * const abbr = getOfficialAbbreviationFromOverview("sv08"); // "SPS"
 */
function getOfficialAbbreviationFromOverview(setId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setsSheet = ss.getSheetByName("Sets Overview");
  if (!setsSheet || setsSheet.getLastRow() < OVERVIEW_DATA_START_ROW) {
    return "";
  }
  const lastExistingOverviewRow = setsSheet.getLastRow();
  const numExistingOverviewDataRows = Math.max(0, lastExistingOverviewRow - OVERVIEW_DATA_START_ROW);
  const setsData = numExistingOverviewDataRows > 0 ?
    setsSheet.getRange(OVERVIEW_DATA_START_ROW + 1, 1, numExistingOverviewDataRows, setsSheet.getLastColumn()).getValues() : [];

  const currentSetRow = setsData.find(r => extractIdFromHyperlink(r[0]) === setId);
  return currentSetRow ? currentSetRow[7] : ""; // Abkürzung ist in der 8. Spalte (Index 7).
}


/**
 * Zeigt schnelle Statistiken für das aktuelle Set an.
 * 
 * @function showQuickStats
 */
function showQuickStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const ui = SpreadsheetApp.getUi();
  
  const sheetName = sheet.getName();
  if (sheetName === 'Sets Overview' || sheetName === 'Collection Summary') {
    ui.alert('ℹ️ Info', 'Bitte wechseln Sie zu einem Set-Sheet.', ui.ButtonSet.OK);
    return;
  }
  
  const setIdNote = sheet.getRange(1, 1).getNote();
  if (!setIdNote || !setIdNote.startsWith('Set ID: ')) {
    ui.alert('❌ Fehler', 'Kein gültiges Set-Sheet.', ui.ButtonSet.OK);
    return;
  }
  
  const setId = setIdNote.substring('Set ID: '.length);
  
  try {
    // Lade Sammlung-Daten (korrekte Struktur: collectedCardsData[setId][cardId])
    const collectedCardsData = getScriptPropertiesData('collectedCardsData', {});
    let currentSetCollectedData = collectedCardsData[setId] || {};

    // Extrahiere Karten-IDs aus dem Grid (nur ID-Zeilen, keine Bild-/Checkbox-Zellen)
    const lastRow = sheet.getLastRow();
    if (lastRow <= SET_SHEET_HEADER_ROWS) {
      ui.alert('ℹ️ Info', 'Keine Karten im Set.', ui.ButtonSet.OK);
      return;
    }

    // Falls keine gespeicherten Daten vorhanden sind, versuche Recovery aus Sheet-Checkboxen
    if (Object.keys(currentSetCollectedData).length === 0) {
      currentSetCollectedData = extractCollectedDataFromSheet(sheet);
    }

    const dataRows = lastRow - SET_SHEET_HEADER_ROWS;
    const totalCols = CARDS_PER_ROW_IN_GRID * CARD_BLOCK_WIDTH_COLS;
    const values = sheet.getRange(SET_SHEET_HEADER_ROWS + 1, 1, dataRows, totalCols).getValues();

    const cardEntries = [];
    for (let rowBlock = 0; rowBlock * CARD_BLOCK_HEIGHT_ROWS < dataRows; rowBlock++) {
      for (let colBlock = 0; colBlock < CARDS_PER_ROW_IN_GRID; colBlock++) {
        const br = rowBlock * CARD_BLOCK_HEIGHT_ROWS;
        const bc = colBlock * CARD_BLOCK_WIDTH_COLS;
        if (br >= dataRows) break;

        const rawId = String(values[br][bc] || '').trim();
        if (!rawId) continue;

        cardEntries.push({
          rawId,
          normalizedId: normalizeCardNumber(rawId)
        });
      }
    }

    const seen = new Set();
    const uniqueEntries = [];
    for (const entry of cardEntries) {
      if (seen.has(entry.normalizedId)) continue;
      seen.add(entry.normalizedId);
      uniqueEntries.push(entry);
    }

    const totalCards = uniqueEntries.length;
    if (totalCards === 0) {
      ui.alert('ℹ️ Info', 'Keine Karten im Set.', ui.ButtonSet.OK);
      return;
    }

    let normalCollected = 0;
    let rhCollected = 0;
    let bothCollected = 0;
    const missingCards = [];

    uniqueEntries.forEach(entry => {
      const status = currentSetCollectedData[entry.normalizedId] || currentSetCollectedData[entry.rawId] || { g: false, rh: false };
      const hasG = status.g === true;
      const hasRh = status.rh === true;

      if (hasG) normalCollected++;
      if (hasRh) rhCollected++;
      if (hasG && hasRh) bothCollected++;
      if (!hasG) missingCards.push(entry.rawId);
    });

    missingCards.sort((a, b) => naturalSort(String(a || ""), String(b || "")));

    const completion = totalCards > 0 ? (normalCollected / totalCards * 100) : 0;
    const previewLimit = 20;
    const missingText = missingCards.length > 0 ? 
      `\n\nFehlende Karten (${missingCards.length}):\n${missingCards.slice(0, previewLimit).join(', ')}${missingCards.length > previewLimit ? `\n… +${missingCards.length - previewLimit} weitere` : ''}` : 
      '\n\n✅ Alle Normal-Karten gesammelt!';
    
    ui.alert(
      `📊 Statistik: ${sheetName}`,
      `Set-ID: ${setId}\n\n` +
      `Gesamtkarten: ${totalCards}\n` +
      `Normal gesammelt: ${normalCollected} (${completion.toFixed(1)}%)\n` +
      `RH gesammelt: ${rhCollected}\n` +
      `Beide gesammelt: ${bothCollected}\n` +
      `Fehlend: ${missingCards.length}${missingText}`,
      ui.ButtonSet.OK
    );
    
  } catch (error) {
    Logger.log(`Quick-Stats Fehler: ${error.message}`);
    ui.alert('Fehler', `Statistik-Abruf fehlgeschlagen: ${error.message}`, ui.ButtonSet.OK);
  }
}

/**
 * Fordert den Benutzer zur Eingabe einer Set-ID auf und importiert dann die Karten für dieses Set.
 */
function promptAndPopulateCardsForSet() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setsSheet = ss.getSheetByName("Sets Overview");
  if (!setsSheet || setsSheet.getLastRow() < OVERVIEW_DATA_START_ROW) {
    ui.alert("Error", "Bitte führen Sie zuerst '1. Setup & Sets importieren' aus, um die Set-Liste zu füllen!", ui.ButtonSet.OK);
    return;
  }
  const response = ui.prompt('Karten für Set importieren (Raster)', 'Geben Sie die Set-ID ein (aus Spalte A von "Sets Overview", dies ist die pokemontcg.io ID oder TCGDex-Only ID):', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() === ui.Button.OK) {
    const setId = response.getResponseText().trim();
    if (setId) {
      try {
        populateCardsForSet(setId);
      } catch (e) {
        // Fehler wird bereits in populateCardsForSet behandelt und geworfen, hier nur loggen
        Logger.log(`Fehler beim manuellen Importieren von Set ${setId}: ${e.message}`);
        ui.alert("Importfehler", `Fehler beim Importieren von Set "${setId}": ${e.message}.`, ui.ButtonSet.OK);
      }
    }
    else ui.alert("Error", "Die Set-ID darf nicht leer sein!", ui.ButtonSet.OK);
  }
}

/**
 * Reimportiert die Karten des aktuell geöffneten Set-Blattes.
 * 
 * Workflow:
 * 1. Ermittelt Set-ID aus aktuellem Blatt (Notiz in A1)
 * 2. Bestätigt Reimport per Dialog (YES/NO)
 * 3. Löscht alte Kartendaten aus Properties
 * 4. Importiert Karten neu via populateCardsForSet()
 * 5. Zeigt Erfolgs- oder Fehler-Toast
 * 
 * Use Cases:
 * - Daten-Refresh nach API-Änderungen
 * - Behebung von Import-Fehlern
 * - Aktualisierung von Cardmarket-URLs
 * 
 * @function reimportCurrentSet
 */
function reimportCurrentSet() {
  const ui = SpreadsheetApp.getUi();
  const currentSetInfo = getSetSheetAndIdForCurrentSheet();
  
  if (!currentSetInfo) {
    // Fehler wird bereits in getSetSheetAndIdForCurrentSheet gezeigt
    return;
  }

  const { setId, setName } = currentSetInfo;

  // Bestätigung anfordern
  const response = ui.alert(
    'Aktuelles Set reimportieren',
    `Möchten Sie das Set "${setName}" jetzt neu importieren?\n\n` +
    `Die Karten werden aus den APIs neu geladen. Ihr Sammlungsstatus (Checkboxen) bleibt erhalten.`,
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    SpreadsheetApp.getActive().toast("Reimport abgebrochen.", "ℹ️ Abgebrochen", 2);
    return;
  }

  try {
    SpreadsheetApp.getActive().toast(`Reimportiere Set "${setName}"...`, "🔄 In Arbeit", 5);
    
    // Lösche alte Kartendaten aus Properties für dieses Set
    const cardDataKey = `cardData_${setId}`;
    
    // Behalte Sammlungs-Status, lösche aber alte Kartendaten
    PropertiesService.getScriptProperties().deleteProperty(cardDataKey);
    Logger.log(`Alte Kartendaten für Set ${setId} gelöscht.`);
    
    // Reimportiere Karten
    populateCardsForSet(setId);
    
    SpreadsheetApp.getActive().toast(`Set "${setName}" erfolgreich reimportiert.`, "✅ Fertig", 3);
    Logger.log(`Set ${setName} (ID: ${setId}) erfolgreich reimportiert.`);
    
  } catch (error) {
    Logger.log(`Fehler beim Reimportieren von Set ${setName}: ${error.message} \nStack: ${error.stack}`);
    ui.alert("Reimport-Fehler", `Fehler beim Reimportieren von Set "${setName}": ${error.message}. Details im Log.`, ui.ButtonSet.OK);
  }
}

// ============================================================================
// SEKTION: SAMMLUNGS-UPDATES & STATISTIKEN
// ============================================================================

/**
 * Aktualisiert die Sammlungsstatistiken im "Collection Summary" Blatt.
 * 
 * Liest Header-Daten von allen Set-Blättern und erstellt eine
 * zusammenfassende Übersicht:
 * - Gesamtzahl Karten pro Set
 * - Gesammelte normale Karten
 * - Gesammelte Reverse Holo Karten
 * - Abschluss-Prozentsatz
 * 
 * @function updateCollectionSummary
 */
function updateCollectionSummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const summarySheet = ss.getSheetByName("Collection Summary");
  const setsSheet = ss.getSheetByName("Sets Overview");
  const ui = SpreadsheetApp.getUi();

  SpreadsheetApp.getActive().toast("Sammlungsübersicht wird aktualisiert...", "🔄 In Arbeit", 10);

  if (!summarySheet) { ui.alert("Error", "'Collection Summary' nicht gefunden.", ui.ButtonSet.OK); return; }
  if (!setsSheet || setsSheet.getLastRow() < OVERVIEW_DATA_START_ROW) {
    ui.alert("Error", "Keine Sets in 'Sets Overview' gefunden. Bitte führen Sie zuerst '1. Setup & Sets importieren' aus.", ui.ButtonSet.OK);
    return;
  }

  if (summarySheet.getLastRow() > SUMMARY_DATA_START_ROW) {
    summarySheet.getRange(SUMMARY_DATA_START_ROW + 1, 1, summarySheet.getLastRow() - SUMMARY_DATA_START_ROW, SUMMARY_SORT_CHECKBOX_COL).clearContent();
  }

  const summaryData = [];
  const sheets = ss.getSheets();
  const lastExistingOverviewRow = setsSheet.getLastRow();
  const numExistingOverviewDataRows = Math.max(0, lastExistingOverviewRow - OVERVIEW_DATA_START_ROW);
  const setsOverviewData = numExistingOverviewDataRows > 0 ?
    setsSheet.getRange(OVERVIEW_DATA_START_ROW + 1, 1, numExistingOverviewDataRows, setsSheet.getLastColumn()).getValues() : [];

  let totalCollectedCardsAllSets = 0;
  let totalCollectedRHCardsAllSets = 0;
  let totalCardsAcrossAllSets = 0;

  sheets.forEach(sheet => {
    const sheetName = sheet.getName();
    // Nur Blätter verarbeiten, die keine Übersichtsblätter sind und eine Set ID in der Notiz haben
    if (sheetName !== "Sets Overview" && sheetName !== "Collection Summary") {
      try {
        const setIdNote = sheet.getRange(1, 1).getNote();
        let setId = null; // Dies kann pokemontcg.io ID oder TCGDex-only ID sein
        if (setIdNote && setIdNote.startsWith('Set ID: ')) {
          setId = setIdNote.substring('Set ID: '.length);
        }

        if (!setId) {
          Logger.log(`updateCollectionSummary: Set ID nicht in Notiz für Blatt "${sheetName}" gefunden. Überspringe.`);
          return;
        }

        const setRowInOverview = setsOverviewData.find(r => extractIdFromHyperlink(r[0]) === setId);
        const officialAbbreviation = setRowInOverview ? setRowInOverview[7] : "";

        let headerSummaryString = sheet.getRange(2, 1).getValue();
        headerSummaryString = headerSummaryString.replace(/\u00A0/g, ' ').trim();

        // Regex korrigiert: ** zu * geändert.
        const match = headerSummaryString.match(
          /Gesamtzahl Karten:\s*(\d+)\s*\|\s*Gesammelte Karten:\s*(\d+)\s*\|\s*Gesammelte RH Karten:\s*(\d+)\s*\|\s*Abschluss-Prozentsatz:\s*([\d,.]+)\s*%/
        );

        if (match) {
          const totalCardsInSet = parseInt(match[1]) || 0;
          const collectedCount = parseInt(match[2]) || 0;
          const reverseHoloCount = parseInt(match[3]) || 0;
          const completion = parseFloat(match[4].replace(',', '.')) / 100 || 0;

          summaryData.push([sheetName, totalCardsInSet, collectedCount, reverseHoloCount, completion, officialAbbreviation, ""]);
          totalCardsAcrossAllSets += totalCardsInSet;
          totalCollectedCardsAllSets += collectedCount;
          totalCollectedRHCardsAllSets += reverseHoloCount;

        } else {
          Logger.log(`Konnte Zusammenfassungsstring aus Blatt "${sheetName}" nicht parsen: "${headerSummaryString}". Überspringe dieses Blatt für die Zusammenfassung.`);
        }

      } catch (e) {
        Logger.log(`Fehler beim Lesen der Zusammenfassung aus Blatt "${sheetName}": ${e.message}. Überspringe dieses Blatt für die Zusammenfassung.`);
      }
    }
  });

  if (summaryData.length > 0) {
    summarySheet.getRange(SUMMARY_DATA_START_ROW + 1, 1, summaryData.length, SUMMARY_SORT_CHECKBOX_COL).setValues(summaryData);
    summarySheet.getRange(SUMMARY_DATA_START_ROW + 1, 5, summaryData.length, 1).setNumberFormat("0.00%");

    SpreadsheetApp.getActive().toast('Sammlungsübersicht aktualisiert.', '✅ Fertig', 8);
  } else {
    SpreadsheetApp.getActive().toast('Keine Set-Blätter zum Aktualisieren der Sammlungsübersicht gefunden.', 'ℹ️ Info', 5);
  }

  const overallCompletion = (totalCardsAcrossAllSets > 0) ? totalCollectedCardsAllSets / totalCardsAcrossAllSets : 0;
  
  // Erweiterte Statistiken
  const totalSets = summaryData.length;
  const completedSets = summaryData.filter(row => row[4] >= 1.0).length;
  const inProgressSets = summaryData.filter(row => row[4] > 0 && row[4] < 1.0).length;
  const notStartedSets = summaryData.filter(row => row[4] === 0).length;
  const avgCompletion = totalSets > 0 ? summaryData.reduce((sum, row) => sum + row[4], 0) / totalSets : 0;
  
  summarySheet.getRange(SUMMARY_SUMMARY_ROW, 1).setValue(
    `Gesamtzahl Karten (alle Sets): ${totalCardsAcrossAllSets} | Gesammelte Karten: ${totalCollectedCardsAllSets} | Gesammelte RH Karten: ${totalCollectedRHCardsAllSets} | Gesamtabschluss: ${overallCompletion.toLocaleString(undefined, { style: 'percent', minimumFractionDigits: 0 })}`
  );
  
  // Zusätzliche Statistik-Zeile
  summarySheet.getRange(SUMMARY_SUMMARY_ROW + 1, 1).setValue(
    `📊 Sets: ${totalSets} gesamt | ✅ ${completedSets} abgeschlossen | 🔄 ${inProgressSets} in Arbeit | ⭕ ${notStartedSets} nicht begonnen | Ø Fortschritt: ${avgCompletion.toLocaleString(undefined, { style: 'percent', minimumFractionDigits: 1 })}`
  );
}

/**
 * Aktualisiert alle Kartenblätter (Rasterdarstellung) in der Tabelle.
 * Dieser Vorgang kann bei vielen Sets lange dauern und erfordert eine Bestätigung des Benutzers.
 */
function updateAllCardSheets() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert("Importierte Kartenblätter aktualisieren (Raster)", "Es werden nur bereits importierte Sets neu geladen. Bestehende Checkbox-Markierungen bleiben erhalten.\n\nMöchten Sie wirklich fortfahren?", ui.ButtonSet.YES_NO);
  if (response !== ui.Button.YES) return;

  const importedSets = getImportedSetsFromSheets();
  if (importedSets.length === 0) {
    ui.alert("Info", "Keine importierten Sets gefunden.", ui.ButtonSet.OK);
    return;
  }

  let processedCount = 0;
  const startTime = Date.now();
  SpreadsheetApp.getActive().toast(`Starte Aktualisierung für ${importedSets.length} importierte Sets...`, "🔄 In Arbeit", 10);

  for (let i = 0; i < importedSets.length; i++) {
    const { setId: setIdFromOverview, setName } = importedSets[i];
    
    // Berechne Fortschritt und ETA
    const progress = Math.round(((i + 1) / importedSets.length) * 100);
    const elapsed = Date.now() - startTime;
    const avgTimePerSet = elapsed / (i + 1);
    const remaining = (importedSets.length - i - 1) * avgTimePerSet;
    const etaMinutes = Math.round(remaining / 60000);
    const etaSeconds = Math.round((remaining % 60000) / 1000);
    const etaText = etaMinutes > 0 ? `~${etaMinutes}min ${etaSeconds}s` : `~${etaSeconds}s`;
    
    SpreadsheetApp.getActive().toast(
      `Set ${i + 1}/${importedSets.length} (${progress}%) - ${setName}\nVerbleibende Zeit: ${etaText}`, 
      "🔄 Importiere", 
      5
    );
    
    try {
      populateCardsForSet(setIdFromOverview);
      processedCount++;
      if (i < importedSets.length - 1) Utilities.sleep(API_DELAY_MS + 1000);
    } catch (e) {
      Logger.log(`Kritischer Fehler beim Aktualisieren von Set ${setName} (ID: ${setIdFromOverview}): ${e.message} \nStack: ${e.stack}`);
      SpreadsheetApp.getUi().alert(`Fehler bei Set ${setName}`, `Fehler: ${e.message}. Details im Log. Das Update wird mit dem nächsten Set fortgesetzt.`);
    }
  }

  populateSetsOverview();
  updateCollectionSummary();
  SpreadsheetApp.getActive().toast(`Importierte Kartenblätter aktualisiert. Sammlungsübersicht wurde aktualisiert.`, "✅ Fertig", 10);
  ui.alert("Aktualisierung abgeschlossen", `${processedCount}/${importedSets.length} importierte Sets verarbeitet.`, ui.ButtonSet.OK);
}

/**
 * Importiert/aktualisiert alle Sets aus der Sets-Overview (inkl. bisher nicht importierter Sets).
 *
 * @function importAllSetsFromOverview
 */
function importAllSetsFromOverview() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    "Alle Sets importieren",
    "Dieser Vorgang importiert wirklich ALLE Sets aus der Übersicht (auch bisher nicht importierte) und kann sehr lange dauern.\n\nMöchten Sie fortfahren?",
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setsSheet = ss.getSheetByName("Sets Overview");
  if (!setsSheet || setsSheet.getLastRow() < OVERVIEW_DATA_START_ROW) {
    ui.alert("Error", "Keine Sets in 'Sets Overview' gefunden.", ui.ButtonSet.OK);
    return;
  }

  const lastExistingOverviewRow = setsSheet.getLastRow();
  const numExistingOverviewDataRows = Math.max(0, lastExistingOverviewRow - OVERVIEW_DATA_START_ROW);
  const setsData = numExistingOverviewDataRows > 0 ?
    setsSheet.getRange(OVERVIEW_DATA_START_ROW + 1, 1, numExistingOverviewDataRows, 2).getValues() : [];

  let processedCount = 0;
  const startTime = Date.now();
  SpreadsheetApp.getActive().toast(`Starte Vollimport für ${setsData.length} Sets...`, "🔄 In Arbeit", 10);

  for (let i = 0; i < setsData.length; i++) {
    const setIdFromOverview = extractIdFromHyperlink(setsData[i][0]);
    const setName = setsData[i][1];

    if (!setIdFromOverview || !setName) {
      Logger.log(`Überspringe Zeile ${i + OVERVIEW_DATA_START_ROW + 1} in Sets Overview: Fehlende Set ID oder Name.`);
      continue;
    }

    const progress = Math.round(((i + 1) / setsData.length) * 100);
    const elapsed = Date.now() - startTime;
    const avgTimePerSet = elapsed / (i + 1);
    const remaining = (setsData.length - i - 1) * avgTimePerSet;
    const etaMinutes = Math.round(remaining / 60000);
    const etaSeconds = Math.round((remaining % 60000) / 1000);
    const etaText = etaMinutes > 0 ? `~${etaMinutes}min ${etaSeconds}s` : `~${etaSeconds}s`;

    SpreadsheetApp.getActive().toast(
      `Set ${i + 1}/${setsData.length} (${progress}%) - ${setName}\nVerbleibende Zeit: ${etaText}`,
      "🌐 Importiere alle",
      5
    );

    try {
      populateCardsForSet(setIdFromOverview);
      processedCount++;
      if (i < setsData.length - 1) Utilities.sleep(API_DELAY_MS + 1000);
    } catch (e) {
      Logger.log(`Kritischer Fehler beim Vollimport von Set ${setName} (ID: ${setIdFromOverview}): ${e.message} \nStack: ${e.stack}`);
      SpreadsheetApp.getUi().alert(`Fehler bei Set ${setName}`, `Fehler: ${e.message}. Details im Log. Der Import wird mit dem nächsten Set fortgesetzt.`);
    }
  }

  populateSetsOverview();
  updateCollectionSummary();
  SpreadsheetApp.getActive().toast(`Vollimport abgeschlossen. Sammlungsübersicht wurde aktualisiert.`, "✅ Fertig", 10);
  ui.alert("Vollimport abgeschlossen", `${processedCount}/${setsData.length} Sets verarbeitet.`, ui.ButtonSet.OK);
}

// ============================================================================
// SEKTION: EVENT-HANDLER (onEdit)
// ============================================================================

/**
 * Haupt-Event-Handler für Zellbearbeitungen.
 * 
 * Koordiniert alle Sheet-Änderungen:
 * - Checkbox-Aktivierungen in Übersichtsblättern
 * - Karten-Sammlungsstatus-Änderungen (G/RH Checkboxen)
 * - Bild-URL-Änderungen
 * - Set-Import/Reimport-Trigger
 * - Sortier-Trigger
 * 
 * Features:
 * - Lock-basierte Synchronisation (verhindert Race Conditions)
 * - Duplikats-Erkennung für Benutzer-Clicks
 * - Rekursions-Schutz (isScriptEditing Flag)
 * - Detailliertes Logging
 * 
 * @function handleOnEdit
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e - Edit-Event-Objekt
 */
function handleOnEdit(e) {
  // 1. Check if this is a script-initiated edit (recursive call)
  if (isScriptEditing) {
    Logger.log("[handleOnEdit] Script is already performing an edit. Ignoring this recursive trigger.");
    return;
  }

  // 2. Acquire a global script lock to serialize edits from *all* users.
  //    User locks only cover the current account; script lock ensures only one
  //    trigger runs at a time, preventing duplicate API calls from different users.
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(USER_LOCK_TIMEOUT_MS);
  } catch (err) {
    // Silent early exit (no alert) since another execution is already running;
    // the duplicate-detection further down will catch repeats if this run is
    // triggered after the first one completes.
    Logger.log("[handleOnEdit] Could not obtain script lock after %s seconds. Skipping execution.", USER_LOCK_TIMEOUT_MS / 1000);
    return;
  }

  // Setze flag HIER um sicherzustellen, dass es IMMER zurückgesetzt wird
  isScriptEditing = true;
  
  try {
    // 3. Persistent check for duplicate user-initiated events (using PropertiesService)
    const properties = PropertiesService.getScriptProperties();
    const range = e.range;
    const value = e.value; // Store the original value from event

    // Robust check for user-initiated check (true from false)
    const isUserInitiatedCheckActual = isUserInitiatedCheck(value, e.oldValue);
    
    // Define variables for logging
    const isNewValueTrueActual = (value === true || (typeof value === 'string' && value.toLowerCase() === 'true'));
    const wasOldValueTrueActual = (e.oldValue === true || (typeof e.oldValue === 'string' && e.oldValue.toLowerCase() === 'true'));

    // Only apply duplicate check for user-initiated checkbox activations
    if (isUserInitiatedCheckActual) {
      const lastProcessedEditStr = properties.getProperty('lastProcessedEdit');
      if (lastProcessedEditStr) {
        const lastProcessedEdit = JSON.parse(lastProcessedEditStr);
        const currentTime = Date.now();
        const timeDiff = currentTime - lastProcessedEdit.timestamp;
        
        // Check if same cell, same value, and within 60 seconds (Google triggers can be delayed by Locks)
        if (lastProcessedEdit.range === range.getA1Notation() &&
          (lastProcessedEdit.value === true || (typeof lastProcessedEdit.value === 'string' && lastProcessedEdit.value.toLowerCase() === 'true')) &&
          (timeDiff < 60000)) { // 60 second threshold to catch lock-delayed duplicate triggers
          Logger.log(`[handleOnEdit] Duplicate user-initiated trigger detected (same cell, same true value, ${timeDiff}ms ago). Ignoring.`);
          // reset flag before exiting so future edits are handled normally
          isScriptEditing = false;
          return;
        }
      }
    }
    const sheet = range.getSheet();
    const sheetName = sheet.getName();

    Logger.log(`[handleOnEdit] Triggered on sheet: ${sheetName}, range: ${range.getA1Notation()}, value: ${e.value} (type: ${typeof e.value}), oldValue: ${e.oldValue} (type: ${typeof e.oldValue})`);
    Logger.log(`[handleOnEdit] isNewValueTrueActual: ${isNewValueTrueActual}, wasOldValueTrueActual: ${wasOldValueTrueActual}, isUserInitiatedCheckActual: ${isUserInitiatedCheckActual}`);

    try { // This inner try block encapsulates the sheet modifications and ensures isScriptEditing reset.
      // --- Special handling for header checkboxes in Overview and Summary sheets ---
      if (sheetName === "Sets Overview" && range.getColumn() === OVERVIEW_REFRESH_CHECKBOX_COL && range.getRow() === OVERVIEW_TITLE_ROW) {
        Logger.log(`[handleOnEdit] Detected 'Sets Overview' refresh checkbox edit.`);
        onRefreshOverviewCheckboxEdit(e, isUserInitiatedCheckActual); // Pass isUserInitiatedCheckActual
        return;
      }
      if (sheetName === "Collection Summary" && range.getColumn() === SUMMARY_SORT_CHECKBOX_COL && range.getRow() === SUMMARY_TITLE_ROW) {
        Logger.log(`[handleOnEdit] Detected 'Collection Summary' sort all sets checkbox edit.`);
        onSortAllSetsCheckboxEdit(e, isUserInitiatedCheckActual); // Pass isUserInitiatedCheckActual
        return;
      }

      // --- Handling for "Importiert" and "Neu importieren" checkboxes in Sets Overview data rows ---
      if (sheetName === "Sets Overview" && range.getRow() > OVERVIEW_HEADER_ROWS) {
        Logger.log(`[handleOnEdit] Detected Sets Overview data row checkbox edit.`);
        if (range.getColumn() === IMPORTED_CHECKBOX_COL_INDEX) {
          Logger.log(`[handleOnEdit] Calling onImportCheckboxEdit for cell ${range.getA1Notation()}.`);
          onImportCheckboxEdit(e, isUserInitiatedCheckActual);
        } else if (range.getColumn() === REIMPORT_CHECKBOX_COL_INDEX) {
          Logger.log(`[handleOnEdit] Calling onReimportCheckboxEdit for cell ${range.getA1Notation()}.`);
          onReimportCheckboxEdit(e, isUserInitiatedCheckActual);
        }
        return;
      }

      // --- Handling for "Sortieren" checkbox in individual Set Sheets ---
      if (range.getRow() === SORT_SET_CHECKBOX_ROW && range.getColumn() === SORT_SET_CHECKBOX_COL_OFFSET) {
        Logger.log(`[handleOnEdit] Detected individual Set Sheet sort checkbox edit.`);
        onSortSetCheckboxEdit(e, isUserInitiatedCheckActual);
        return;
      }

      // --- General handling for card collection checkboxes (G and RH) and Image cells ---
      if (sheetName !== "Sets Overview" && sheetName !== "Collection Summary" && range.getRow() > SET_SHEET_HEADER_ROWS) {
        const col = range.getColumn();
        const row = range.getRow();

        const cardBlockStartCol = Math.floor((col - 1) / CARD_BLOCK_WIDTH_COLS) * CARD_BLOCK_WIDTH_COLS + 1;
        const cardBlockStartRow = SET_SHEET_HEADER_ROWS + Math.floor((row - (SET_SHEET_HEADER_ROWS + 1)) / CARD_BLOCK_HEIGHT_ROWS) * CARD_BLOCK_HEIGHT_ROWS + 1;

        const isGCheckbox = (col === cardBlockStartCol) && (row === cardBlockStartRow + 2);
        const isRHCheckbox = (col === cardBlockStartCol + 1) && (row === cardBlockStartRow + 2);
        const isImageCell = (col >= cardBlockStartCol && col < cardBlockStartCol + CARD_BLOCK_WIDTH_COLS) && (row === cardBlockStartRow + 1);

        if (isGCheckbox || isRHCheckbox || isImageCell) {
          Logger.log(`[handleOnEdit] Detected card data edit (G/RH checkbox or image cell).`);
          const cardIdCell = sheet.getRange(cardBlockStartRow, cardBlockStartCol);
          const rawCardId = cardIdCell.getValue(); // Get the raw value for the card ID cell

          const setIdNote = sheet.getRange(1, 1).getNote();
          let setId = null;
          if (setIdNote && setIdNote.startsWith('Set ID: ')) {
            setId = setIdNote.substring('Set ID: '.length);
          }

          if (!setId || !rawCardId) { // Check both
            Logger.log(`[handleOnEdit] ERROR: Invalid card ID "${rawCardId}" or Set ID "${setId}" for cell ${cardIdCell.getA1Notation()}. Aborting card data update.`);
            return; // Abort if critical info is missing
          }
          // Add a log here:
          Logger.log(`[handleOnEdit] Preparing to call processCardDataEdit for Set ID: "${setId}", Card ID: "${rawCardId}"`);
          // Call processCardDataEdit with the necessary info
          processCardDataEdit(e, rawCardId, setId, isGCheckbox, isRHCheckbox, isImageCell);
        }
      }
    } finally {
      // Stelle sicher dass isScriptEditing nur hier in diesem try/finally Block zurückgesetzt wird
      // und NICHT in der äußeren finally, um Verwirrung zu vermeiden
      isScriptEditing = false;
    }
  } catch (error) {
    Logger.log(`[handleOnEdit] Unexpected error: ${error.message} \nStack: ${error.stack}`);
    isScriptEditing = false; // Reset flag on error
  } finally {
    if (lock && lock.hasLock()) {
      lock.releaseLock();
      Logger.log("[handleOnEdit] Lock released.");
    }
  }
}

/**
 * Hilfsfunktion: Zählt gesammelte Karten für ein Set
 * @param {Object} collectedCardsData Das gesammelte Karten-Objekt für ein Set
 * @returns {{collectedCount: number, reverseHoloCount: number}} Zählergebnisse
 */
function countCollectedCards(collectedCardsData) {
  let collectedCount = 0;
  let reverseHoloCount = 0;
  
  for (const cardId in collectedCardsData) {
    if (collectedCardsData.hasOwnProperty(cardId)) {
      if (collectedCardsData[cardId].g) collectedCount++;
      if (collectedCardsData[cardId].rh) reverseHoloCount++;
    }
  }
  
  return { collectedCount, reverseHoloCount };
}

/**
 * Hilfsfunktion: Aktualisiert die Header-Zusammenfassung eines Set-Blattes
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet Das Set-Blatt
 * @param {string} setId Die Set-ID
 * @param {number} collectedCount Anzahl der gesammelten Karten
 * @param {number} reverseHoloCount Anzahl der RH-Karten
 */
function updateSetSheetHeaderSummary(sheet, setId, collectedCount, reverseHoloCount) {
  const headerSummaryText = sheet.getRange(2, 1).getValue();
  const totalMatch = headerSummaryText.match(/Gesamtzahl Karten:\s*(\d+)/);
  const totalCards = totalMatch ? parseInt(totalMatch[1]) : 0;
  
  const completionPercentage = (totalCards > 0) ? collectedCount / totalCards : 0;
  const officialAbbreviation = getOfficialAbbreviationFromOverview(setId);
  
  const headerSummaryRange = sheet.getRange(2, 1, 1, SORT_SET_CHECKBOX_COL_OFFSET);
  headerSummaryRange.setValue(
    `Gesamtzahl Karten: ${totalCards} | ` +
    `Gesammelte Karten: ${collectedCount} | ` +
    `Gesammelte RH Karten: ${reverseHoloCount} | ` +
    `Abschluss-Prozentsatz: ${completionPercentage.toLocaleString(undefined, { style: 'percent', minimumFractionDigits: 0 })} | ` +
    `Abkürzung: ${officialAbbreviation}`
  );
}

/**
 * Behandelt G-Checkbox-Änderungen (Normal-Sammlung).
 * 
 * Logik:
 * - Bei Aktivierung: Setzt g=true und aktiviert RH-Checkbox
 * - Bei Deaktivierung: Setzt g=false UND rh=false
 * - RH-Abhängigkeit: RH-Validation nur aktiv wenn G=true
 * - Farb-Coding: Weiß (deaktiviert) → Standard (aktiv)
 * 
 * WICHTIG: Wird NUR in onEdit-Kontext aufgerufen (isScriptEditing=true)
 * 
 * @function handleGCheckboxChange
 * @param {Object} cardData - Kartenobjekt mit g/rh Status
 * @param {boolean} isChecked - Neuer Checkbox-Status
 * @param {GoogleAppsScript.Spreadsheet.Range} rhCheckboxCell - RH-Checkbox-Zelle
 * @returns {boolean} True wenn Daten geändert wurden
 */
function handleGCheckboxChange(cardData, isChecked, rhCheckboxCell) {
  if (cardData.g === isChecked) return false;
  
  cardData.g = isChecked;
  
  if (!isChecked) {
    // Wenn G deaktiviert wird, deaktiviere auch RH
    if (cardData.rh) {
      cardData.rh = false;
      // isScriptEditing ist true, daher triggert setValue nicht recursiv
      rhCheckboxCell.setValue(false);
    }
    rhCheckboxCell.clearDataValidations();
    rhCheckboxCell.setFontColor('#FFFFFF');
  } else {
    // Wenn G aktiviert wird, aktiviere RH-Validierung
    rhCheckboxCell.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    rhCheckboxCell.setFontColor(null);
  }
  
  return true;
}

/**
 * Behandelt RH-Checkbox-Änderungen (Reverse Holo).
 * 
 * Logik:
 * - Kann nur aktiviert werden wenn g=true
 * - Bei Versuch RH ohne G zu aktivieren: Auto-Reset zu false
 * - Validierung: Prüft G-Status vor Update
 * - Farb-Coding: Blau wenn beide gesetzt
 * 
 * @function handleRHCheckboxChange
 * @param {Object} cardData - Kartenobjekt mit g/rh Status
 * @param {boolean} isChecked - Neuer Checkbox-Status
 * @param {GoogleAppsScript.Spreadsheet.Range} rhCheckboxCell - RH-Checkbox-Zelle
 * @returns {boolean} True wenn Daten geändert wurden
 */
function handleRHCheckboxChange(cardData, isChecked, rhCheckboxCell) {
  if (!cardData.g && isChecked) {
    // RH kann nicht aktiviert werden wenn G nicht gesetzt ist
    rhCheckboxCell.setValue(false);
    cardData.rh = false;
    return false;
  }
  
  if (cardData.rh === isChecked) return false;
  
  cardData.rh = isChecked;
  return true;
}

/**
 * Verarbeitet Karten-Daten-Änderungen (Checkboxen & Bilder).
 * 
 * Behandelt drei Arten von Änderungen:
 * 1. G-Checkbox: Normal gesammelt Status
 * 2. RH-Checkbox: Reverse Holo Status (nur wenn G=true)
 * 3. Bild-Zelle: Custom Image URLs
 * 
 * Logik:
 * - G-Checkbox: Bei Deaktivierung wird RH automatisch deaktiviert
 * - RH-Checkbox: Kann nur aktiviert werden wenn G=true
 * - Bild-Änderungen: Speichert custom IMAGE() Formeln
 * - Header-Update: Aktualisiert Statistiken bei jeder Änderung
 * - Farb-Coding: Wendet Hintergrundfarben basierend auf Status an
 * 
 * WICHTIG: Diese Funktion wird NUR in onEdit-Kontext aufgerufen,
 * wo isScriptEditing bereits true ist. Die flush() wird am Ende aufgerufen.
 * 
 * @function processCardDataEdit
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e - Event-Objekt
 * @param {string} rawCardId - Rohe Karten-ID aus Zelle
 * @param {string} setId - Set-ID des Blattes
 * @param {boolean} isGCheckbox - True wenn G-Checkbox bearbeitet
 * @param {boolean} isRHCheckbox - True wenn RH-Checkbox bearbeitet
 * @param {boolean} isImageCell - True wenn Bildzelle bearbeitet
 */
function processCardDataEdit(e, rawCardId, setId, isGCheckbox, isRHCheckbox, isImageCell) {
  const range = e.range;
  const sheet = range.getSheet();
  const cardId = normalizeCardNumber(String(rawCardId));

  let collectedCardsData = getScriptPropertiesData('collectedCardsData');
  let customImageUrls = getScriptPropertiesData('customImageUrls');

  let dataModified = false;
  let uiNeedsUpdate = false;

  // Initialisiere verschachtelte Objekte
  if (!collectedCardsData[setId]) collectedCardsData[setId] = {};
  if (!collectedCardsData[setId][cardId]) collectedCardsData[setId][cardId] = { g: false, rh: false };
  if (!customImageUrls[setId]) customImageUrls[setId] = {};

  // Berechne Kartenblock-Koordinaten
  const cardBlockStartCol = Math.floor((range.getColumn() - 1) / CARD_BLOCK_WIDTH_COLS) * CARD_BLOCK_WIDTH_COLS + 1;
  const cardBlockStartRow = SET_SHEET_HEADER_ROWS + Math.floor((range.getRow() - (SET_SHEET_HEADER_ROWS + 1)) / CARD_BLOCK_HEIGHT_ROWS) * CARD_BLOCK_HEIGHT_ROWS + 1;
  const rhCheckboxCell = sheet.getRange(cardBlockStartRow + 2, cardBlockStartCol + 1);
  const cardBlockRange = sheet.getRange(cardBlockStartRow, cardBlockStartCol, 3, CARD_BLOCK_WIDTH_COLS);

  // Bildzellen-Logik
  if (isImageCell) {
    const newFormula = range.getFormula();
    Logger.log(`[processCardDataEdit] Image cell edited. New formula: "${newFormula}".`);
    
    if (newFormula && newFormula.toString().startsWith('=IMAGE(') && newFormula.toString().endsWith(')')) {
      if (customImageUrls[setId][cardId] !== newFormula) {
        customImageUrls[setId][cardId] = newFormula;
        dataModified = true;
        uiNeedsUpdate = true;
        Logger.log(`[processCardDataEdit] Custom image URL for card ${cardId} updated.`);
      }
    } else {
      if (customImageUrls[setId].hasOwnProperty(cardId)) {
        delete customImageUrls[setId][cardId];
        dataModified = true;
        uiNeedsUpdate = true;
        if (Object.keys(customImageUrls[setId]).length === 0) delete customImageUrls[setId];
        Logger.log(`[processCardDataEdit] Custom image URL for card ${cardId} deleted.`);
      }
    }
    setScriptPropertiesData('customImageUrls', customImageUrls);
  }

  // Checkbox-Logik
  if (isGCheckbox || isRHCheckbox) {
    Logger.log(`[processCardDataEdit] Checkbox edited.`);
    const isChecked = (e.value === true || (typeof e.value === 'string' && e.value.toLowerCase() === 'true'));
    const cardData = collectedCardsData[setId][cardId];

    if (isGCheckbox) {
      const changed = handleGCheckboxChange(cardData, isChecked, rhCheckboxCell);
      if (changed) {
        dataModified = true;
        uiNeedsUpdate = true;
        Logger.log(`[processCardDataEdit] G-Checkbox for card ${cardId} changed to: ${isChecked}`);
      }
    } else if (isRHCheckbox) {
      const changed = handleRHCheckboxChange(cardData, isChecked, rhCheckboxCell);
      if (changed) {
        dataModified = true;
        uiNeedsUpdate = true;
        Logger.log(`[processCardDataEdit] RH-Checkbox for card ${cardId} changed to: ${isChecked}`);
      }
    }
    
    // Speicher minimieren: Eintrag löschen wenn nichts gesammelt
    if (!cardData.g && !cardData.rh) {
      delete collectedCardsData[setId][cardId];
    }
    // Set-Ebene absichtlich NICHT löschen – leerer {} Eintrag = "bekannt importiert"
    setScriptPropertiesData('collectedCardsData', collectedCardsData);
  }

  // UI-Updates nur wenn nötig
  if (dataModified || uiNeedsUpdate) {
    const { collectedCount, reverseHoloCount } = countCollectedCards(collectedCardsData[setId] || {});
    updateSetSheetHeaderSummary(sheet, setId, collectedCount, reverseHoloCount);
    Logger.log(`[processCardDataEdit] Header summary for set ${setId} updated.`);

    // Wende Hintergrundfarbe an (nutze cardData-Referenz, die auch nach delete noch gültig ist)
    const blockColor = cardData.rh ? REVERSE_HOL_COLLECTED_COLOR :
                       (cardData.g ? COLLECTED_COLOR : null);
    cardBlockRange.setBackground(blockColor);
    Logger.log(`[processCardDataEdit] Applied color ${blockColor} to range ${cardBlockRange.getA1Notation()}.`);
  }

  SpreadsheetApp.flush();
}

/**
 * Diese Funktion wird durch einen installierbaren handleOnEdit-Trigger ausgeführt,
 * um die "Importiert"-Checkbox in der "Sets Overview" zu verwalten und Set-Importe zu starten.
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e Das Ereignisobjekt.
 * @param {boolean} isUserInitiatedCheck Gibt an, ob der Klick vom Benutzer ausgelöst wurde (TRUE von FALSE).
 */
function onImportCheckboxEdit(e, isUserInitiatedCheck) { // Added isUserInitiatedCheck parameter
  const range = e.range;
  const sheet = range.getSheet();
  const ui = SpreadsheetApp.getUi();

  Logger.log(`[onImportCheckboxEdit] Entered for sheet: ${sheet.getName()}, range: ${range.getA1Notation()}, isUserInitiatedCheck: ${isUserInitiatedCheck}`);

  const setId = extractIdFromHyperlink(sheet.getRange(e.range.getRow(), 1).getValue());
  const setName = sheet.getRange(e.range.getRow(), 2).getValue();
  Logger.log(`[onImportCheckboxEdit] Extracted Set ID: ${setId}, Set Name: ${setName}`);

  if (!setId) {
    Logger.log(`[onImportCheckboxEdit] ERROR: Set ID is null or empty for row ${e.range.getRow()}. Resetting checkbox.`);
    range.setValue(false);
    range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    ui.alert("Fehler", "Konnte Set-ID nicht finden. Import abgebrochen.", ui.ButtonSet.OK);
    return;
  }

  let importedSetsStatus = getScriptPropertiesData('importedSetsStatus', {});

  if (isUserInitiatedCheck) {
    Logger.log(`[onImportCheckboxEdit] User explicitly checked the box. Proceeding with import logic.`);

    // guard: if we already imported this set earlier, skip doing it again
    if (importedSetsStatus[setId]) {
      Logger.log(`[onImportCheckboxEdit] Set ${setId} already marked as imported; skipping re-import.`);
      // ensure checkbox shows true and leave it alone
      range.setValue(true);
      return;
    }
    
    // WICHTIG: Setze checkbox zu false OHNE flush() um keinen rekursiven onEdit zu triggern
    range.setValue(false);
    range.clearDataValidations();
    range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    // KEIN flush() hier!

    try {
      SpreadsheetApp.getActive().toast(`Importiere Set "${setName}"...`, "🔄 Import", 5);
      Logger.log(`[onImportCheckboxEdit] Calling populateCardsForSet(${setId})`);
      populateCardsForSet(setId);
      importedSetsStatus[setId] = true;
      setScriptPropertiesData('importedSetsStatus', importedSetsStatus);

      // Setze checkbox zu true NACH dem erfolgreichen Import
      range.setValue(true);
      range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox(true).build());
      SpreadsheetApp.getActive().toast(`Set "${setId}" wurde erfolgreich importiert.`, '✅ Importiert', 3);
      Logger.log(`[onImportCheckboxEdit] Import process completed successfully for ${setId}.`);
    } catch (error) {
      Logger.log(`[onImportCheckboxEdit] ERROR during import for Set ${setName} (${setId}): ${error.message}\nStack: ${error.stack}`);
      importedSetsStatus[setId] = false;
      setScriptPropertiesData('importedSetsStatus', importedSetsStatus);
      range.setValue(false);
      range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      ui.alert("Importfehler", `Fehler beim Importieren von Set "${setName}": ${error.message}. Die Checkbox wird zurückgesetzt.`, ui.ButtonSet.OK);
    } finally {
      // isScriptEditing is managed by handleOnEdit's try/finally block
      Logger.log(`[onImportCheckboxEdit] Finally block executed.`);
    }
  } else if (!isUserInitiatedCheck && (e.value === false || (typeof e.value === 'string' && e.value.toLowerCase() === 'false')) &&
    (e.oldValue === true || (typeof e.oldValue === 'string' && e.oldValue.toLowerCase() === 'true'))) {
    Logger.log(`[onImportCheckboxEdit] User attempted to uncheck the box (non-user initiated check).`);
    const setSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(setName);

    if (setSheet && setSheet.getRange(1, 1).getNote() === `Set ID: ${setId}`) {
      Logger.log(`[onImportCheckboxEdit] Set sheet for ${setId} exists. Reverting checkbox to true.`);
      range.setValue(true);
      ui.alert("Aktion nicht erlaubt", "Diese Checkbox kann nicht manuell deaktiviert werden, solange das Set-Blatt existiert. Löschen Sie das Set über das Menü 'Aktuelles Set löschen', um es zu entfernen.", ui.ButtonSet.OK);
    } else {
      Logger.log(`[onImportCheckboxEdit] Set sheet for ${setId} does not exist or note mismatch. Allowing unchecking.`);
      importedSetsStatus[setId] = false;
      setScriptPropertiesData('importedSetsStatus', importedSetsStatus);
      range.setValue(false);
      range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      SpreadsheetApp.getActive().toast(`Set "${setId}" als nicht importiert markiert.`, 'ℹ️ Status aktualisiert', 3);
    }
  } else {
    // This is the case where the script sets the value, and it's not a user-initiated check.
    // E.g., populateSetsOverview setting `isSetImported` to `true` or `false` programmatically.
    // No user action to handle, just let it pass.
    Logger.log(`[onImportCheckboxEdit] Not a user-initiated change, and not a user uncheck. Ignoring.`);
  }
}

/**
 * Diese Funktion wird durch einen installierbaren handleOnEdit-Trigger ausgeführt,
 * um die Sortier-Checkbox auf den einzelnen Set-Blättern zu verwalten.
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e Das Ereignisobjekt.
 * @param {boolean} isUserInitiatedCheck Gibt an, ob der Klick vom Benutzer ausgelöst wurde (TRUE von FALSE).
 */
function onSortSetCheckboxEdit(e, isUserInitiatedCheck) {
  const range = e.range;
  const sheet = range.getSheet();
  const ui = SpreadsheetApp.getUi();

  Logger.log(`[onSortSetCheckboxEdit] Entered for sheet: ${sheet.getName()}, range: ${range.getA1Notation()}, isUserInitiatedCheck: ${isUserInitiatedCheck}`);

  if (!isUserInitiatedCheck) {
    Logger.log(`[onSortSetCheckboxEdit] Not a user-initiated check. Resetting checkbox to false.`);
    resetCheckbox(range);
    return;
  }

  const setIdNote = sheet.getRange(1, 1).getNote();
  let setId = null;
  if (setIdNote && setIdNote.startsWith('Set ID: ')) {
    setId = setIdNote.substring('Set ID: '.length);
  }
  Logger.log(`[onSortSetCheckboxEdit] Extracted Set ID: ${setId}`);

  if (!setId) {
    Logger.log(`[onSortSetCheckboxEdit] ERROR: Set ID not found in note for sheet "${sheet.getName()}".`);
    resetCheckbox(range);
    ui.alert("Fehler", "Konnte Set-ID nicht finden. Sortierung abgebrochen.", ui.ButtonSet.OK);
    return;
  }

  handleHeaderCheckbox(e, isUserInitiatedCheck, 'onSortSetCheckboxEdit', () => {
    SpreadsheetApp.getActive().toast(`Sortiere Set "${sheet.getName()}"...`, "🔄 Sortieren", 5);
    Logger.log(`[onSortSetCheckboxEdit] Calling manualSortCurrentSheet().`);
    manualSortCurrentSheet();
    SpreadsheetApp.getActive().toast(`Sortierung für Set "${sheet.getName()}" abgeschlossen.`, "✅ Fertig", 3);
  });
}

/**
 * Diese Funktion wird durch einen installierbaren handleOnEdit-Trigger ausgeführt,
 * um die "Neu importieren"-Checkbox in der "Sets Overview" zu verwalten.
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e Das Ereignisobjekt.
 * @param {boolean} isUserInitiatedCheck Gibt an, ob der Klick vom Benutzer ausgelöst wurde (TRUE von FALSE).
 */
function onReimportCheckboxEdit(e, isUserInitiatedCheck) { // Added isUserInitiatedCheck parameter
  const range = e.range;
  const sheet = range.getSheet();
  const ui = SpreadsheetApp.getUi();

  Logger.log(`[onReimportCheckboxEdit] Entered for sheet: ${sheet.getName()}, range: ${range.getA1Notation()}, isUserInitiatedCheck: ${isUserInitiatedCheck}`);

  const setId = extractIdFromHyperlink(sheet.getRange(e.range.getRow(), 1).getValue());
  const setName = sheet.getRange(e.range.getRow(), 2).getValue();
  Logger.log(`[onReimportCheckboxEdit] Extracted Set ID: ${setId}, Set Name: ${setName}`);

  if (!setId) {
    Logger.log(`[onReimportCheckboxEdit] ERROR: Set ID is null or empty for row ${e.range.getRow()}. Resetting checkbox.`);
    range.setValue(false);
    range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    ui.alert("Fehler", "Konnte Set-ID nicht finden. Re-Import abgebrochen.", ui.ButtonSet.OK);
    return;
  }

  if (isUserInitiatedCheck) {
    Logger.log(`[onReimportCheckboxEdit] User explicitly checked the box. Proceeding with re-import logic.`);
    // WICHTIG: Setze checkbox zu false OHNE flush() um keinen rekursiven onEdit zu triggern
    range.setValue(false);
    range.clearDataValidations();
    range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    // KEIN flush() hier!

    try {
      SpreadsheetApp.getActive().toast(`Importiere Set "${setName}" neu...`, "🔄 Re-Import", 5);
      Logger.log(`[onReimportCheckboxEdit] Calling populateCardsForSet(${setId}).`);
      populateCardsForSet(setId);
      Logger.log(`[onReimportCheckboxEdit] Calling populateSetsOverview().`);
      populateSetsOverview();
      SpreadsheetApp.getActive().toast(`Re-Import für Set "${setName}" abgeschlossen.`, "✅ Fertig", 3);
      Logger.log(`[onReimportCheckboxEdit] Re-import process completed successfully for ${setId}.`);
    } catch (error) {
      Logger.log(`[onReimportCheckboxEdit] ERROR during re-import for Set ${setName} (${setId}): ${error.message}\nStack: ${error.stack}`);
      ui.alert("Re-Import Fehler", `Fehler beim Re-Import von Set "${setName}": ${error.message}.`, ui.ButtonSet.OK);
    }
  } else if (!isUserInitiatedCheck && (e.value === false || (typeof e.value === 'string' && e.value.toLowerCase() === 'false')) &&
    (e.oldValue === true || (typeof e.oldValue === 'string' && e.oldValue.toLowerCase() === 'true'))) {
    Logger.log(`[onReimportCheckboxEdit] User attempted to uncheck the box. Reverting to checked state.`);
    range.setValue(true);
    ui.alert("Aktion nicht erlaubt", "Diese Checkbox kann nicht manuell deaktiviert werden. Sie dient zum Auslösen eines Re-Imports und wird automatisch zurückgesetzt.", ui.ButtonSet.OK);
  } else {
    // This is the case where the script sets the value.
    Logger.log(`[onReimportCheckboxEdit] Not a user-initiated change, and not a user uncheck. Ignoring.`);
  }
}

/**
 * Diese Funktion wird durch einen installierbaren handleOnEdit-Trigger ausgeführt,
 * um die "Übersicht aktualisieren" Checkbox in der "Sets Overview" zu verwalten.
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e Das Ereignisobjekt.
 * @param {boolean} isUserInitiatedCheck Gibt an, ob der Klick vom Benutzer ausgelöst wurde (TRUE von FALSE).
 */
function onRefreshOverviewCheckboxEdit(e, isUserInitiatedCheck) {
  handleHeaderCheckbox(e, isUserInitiatedCheck, 'onRefreshOverviewCheckboxEdit', () => {
    SpreadsheetApp.getActive().toast(`Aktualisiere Sets Overview...`, "🔄 Aktualisieren", 5);
    Logger.log(`[onRefreshOverviewCheckboxEdit] Calling setupAndImportAllSets().`);
    setupAndImportAllSets();
    SpreadsheetApp.getActive().toast(`Sets Overview aktualisiert.`, "✅ Fertig", 3);
  });
}

/**
 * Diese Funktion wird durch einen installierbaren handleOnEdit-Trigger ausgeführt,
 * um die "Alle Sets sortieren" Checkbox in der "Collection Summary" zu verwalten.
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e Das Ereignisobjekt.
 * @param {boolean} isUserInitiatedCheck Gibt an, ob der Klick vom Benutzer ausgelöst wurde (TRUE von FALSE).
 */
function onSortAllSetsCheckboxEdit(e, isUserInitiatedCheck) {
  handleHeaderCheckbox(e, isUserInitiatedCheck, 'onSortAllSetsCheckboxEdit', () => {
    // obwohl der Funktionsname auf 'SortAllSets' referenziert, aktualisieren wir nun
    // lediglich die Sammlung-Statistik. Der Menüeintrag bleibt unverändert.
    SpreadsheetApp.getActive().toast("Statistik aktualisieren...", "🔄 Aktualisieren", 10);
    Logger.log(`[onSortAllSetsCheckboxEdit] Calling updateCollectionSummary().`);
    updateCollectionSummary();
    SpreadsheetApp.getActive().toast("Statistik aktualisiert.", "✅ Fertig", 8);
  });
}

/**
 * Funktion, die von einer zugewiesenen Zeichnung/einem Bild ausgelöst wird,
 * um die Sets Overview zu aktualisieren.
 * HINWEIS: Diese Funktion wird nicht mehr über zugewiesene Zeichnungen aufgerufen,
 * sondern über die neue Checkbox im Header der "Sets Overview".
 */
function triggerRefreshOverview() {
  setupAndImportAllSets();
}

/**
 * Funktion, die von einer zugewiesenen Zeichnung/einem Bild ausgelöst wird,
 * um alle Set-Blätter zu sortieren.
 * HINWEIS: Diese Funktion wird nicht mehr über zugewiesene Zeichnungen aufgerufen,
 * sondern über die neue Checkbox im Header der "Collection Summary".
 */
function triggerSortAllSets() {
  manualSortAllSheets();
}


/**
 * Hilfsfunktion: Prüft ob eine Änderung vom Benutzer initiiert wurde (false -> true)
 * @param {any} newValue Der neue Wert
 * @param {any} oldValue Der alte Wert
 * @returns {boolean} True wenn Benutzer die Checkbox aktiviert hat
 */
function isUserInitiatedCheck(newValue, oldValue) {
  const isNewValueTrue = (newValue === true || (typeof newValue === 'string' && newValue.toLowerCase() === 'true'));
  const wasOldValueTrue = (oldValue === true || (typeof oldValue === 'string' && oldValue.toLowerCase() === 'true'));
  return isNewValueTrue && !wasOldValueTrue;
}

/**
 * Hilfsfunktion: Setzt eine Checkbox zurück
 * 
 * WICHTIG: Diese Funktion wird NICHT in onEdit-Kontext aufgerufen,
 * sondern nur durch Menü-Funktionen. Sie setzt das isScriptEditing Flag
 * um zu verhindern, dass das Reset selbst einen onEdit-Trigger auslöst.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Range} range Die Checkbox-Zelle
 */
function resetCheckbox(range) {
  if (!isScriptEditing) {
    isScriptEditing = true;
  }
  try {
    range.setValue(false);
    range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    SpreadsheetApp.flush();
  } finally {
    if (!isScriptEditing) {
      isScriptEditing = false;
    }
  }
}

/**
 * Hilfsfunktion: Allgemeine Checkbox-Handler-Logik für Header-Checkboxen
 * 
 * WICHTIG: Diese Funktion wird NUR in onEdit-Kontext aufgerufen,
 * wo isScriptEditing bereits true ist. setValue() triggert daher
 * keinen rekursiven onEdit-Trigger aus.
 * 
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e Das Event-Objekt
 * @param {boolean} isUserInitiatedCheck Ob vom Benutzer initiiert
 * @param {string} actionName Name der Aktion für Logging
 * @param {Function} actionFunction Die auszuführende Funktion
 */
function handleHeaderCheckbox(e, isUserInitiatedCheck, actionName, actionFunction) {
  const range = e.range;
  const sheet = range.getSheet();
  const ui = SpreadsheetApp.getUi();

  Logger.log(`[${actionName}] Entered for sheet: ${sheet.getName()}, range: ${range.getA1Notation()}, isUserInitiatedCheck: ${isUserInitiatedCheck}`);

  if (!isUserInitiatedCheck) {
    Logger.log(`[${actionName}] Not a user-initiated check. Ignoring trigger.`);
    return;
  }

  Logger.log(`[${actionName}] User explicitly checked the box. Proceeding with action.`);
  
  // Setze checkbox zu false (wir sind bereits in isScriptEditing=true Kontext)
  range.setValue(false);
  range.clearDataValidations();
  range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  // Kein Flush hier! Das würde einen zusätzlichen onEdit-Trigger auslösen

  try {
    actionFunction();
    Logger.log(`[${actionName}] Action completed successfully.`);
  } catch (error) {
    Logger.log(`[${actionName}] ERROR: ${error.message}\nStack: ${error.stack}`);
    ui.alert("Fehler", `Fehler bei ${actionName}: ${error.message}.`, ui.ButtonSet.OK);
  }
}


/**
 * Hilfsfunktion: Setzt den Checkbox-Status und die Data Validation in einem Range
 * 
 * WICHTIG: Diese Funktion wird NUR in onEdit-Kontext aufgerufen,
 * wo isScriptEditing bereits true ist. Sie setzt daher den Wert
 * und löst keinen rekursiven onEdit-Trigger aus.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Range} range Der zu setzende Bereich
 * @param {boolean} value Der Wert für die Checkbox
 * @param {boolean} isReadonly Wenn true, wird die Checkbox auf readonly gesetzt
 */
function setCheckboxState(range, value, isReadonly = false) {
  // Setze setValue() NUR wenn isScriptEditing true ist (wir sind in onEdit-Kontext)
  // Dadurch wird der onEdit-Trigger vom setValue nicht erneut ausgelöst
  range.setValue(value);
  if (isReadonly) {
    range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox(true).build());
  } else {
    range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  }
}

/**
 * Hilfsfunktion: Lädt und bereitet Kartendaten für Sortierung vor
 * @param {string} setId Die Set-ID (pokemontcg.io oder TCGDex-only)
 * @param {string} setName Name des Sets
 * @param {Array<object>} tcgdexAllSets Liste aller TCGDex Sets
 * @returns {{allCards: Array, cardmarketData: Object}} Vorbereitete Kartendaten
 */
function prepareCardsForSorting(setId, setName, tcgdexAllSets) {
  const cardData = loadCardsForSet(setId, setName, tcgdexAllSets);
  const { allCards, cardmarketData } = cardData;
  
  if (!setId.startsWith('TCGDEX-')) {
    // Für pokemontcg.io Sets: lade gespeicherte Cardmarket-URLs
    const storedCardmarketData = getScriptPropertiesData(`pokemontcgIoCardmarketUrls_${setId}`, {});
    return { allCards, cardmarketData: { ...storedCardmarketData, ...cardmarketData } };
  }
  
  return { allCards, cardmarketData };
}

/**
 * Liefert eine Liste der aktuell importierten Sets basierend auf vorhandenen Tabellenblättern.
 * Jedes Element enthält {setId, setName}. Nur Blätter mit einer gültigen "Set ID:"-Notiz
 * in Zelle A1 werden berücksichtigt. Diese Methode ist deutlich effizienter als das
 * Durchlaufen der kompletten "Sets Overview" Tabelle und vermeidet das Sortieren
 * von noch nicht importierten Sets.
 *
 * @returns {Array<{setId:string,setName:string}>}
 */
function getImportedSetsFromSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const imported = [];
  sheets.forEach(sheet => {
    const name = sheet.getName();
    if (name === 'Sets Overview' || name === 'Collection Summary') return;
    const note = sheet.getRange(1, 1).getNote();
    if (note && note.startsWith('Set ID: ')) {
      const setId = note.substring('Set ID: '.length);
      if (setId) {
        imported.push({ setId, setName: name });
      }
    }
  });
  return imported;
}

/**
 * Liefert eine Liste der aktuell importierten Sets basierend auf vorhandenen Tabellenblättern.
 * Jedes Element enthält {setId, setName}. Nur Blätter mit einer gültigen "Set ID:"-Notiz
 * in Zelle A1 werden berücksichtigt. Diese Methode ist deutlich effizienter als das
 * Durchlaufen der kompletten "Sets Overview" Tabelle und vermeidet das Sortieren
 * von noch nicht importierten Sets.
 *
 * @returns {Array<{setId:string,setName:string}>}
 */
function getImportedSetsFromSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const imported = [];
  sheets.forEach(sheet => {
    const name = sheet.getName();
    if (name === 'Sets Overview' || name === 'Collection Summary') return;
    const note = sheet.getRange(1, 1).getNote();
    if (note && note.startsWith('Set ID: ')) {
      const setId = note.substring('Set ID: '.length);
      if (setId) {
        imported.push({ setId, setName: name });
      }
    }
  });
  return imported;
}

/**
 * Hilfsfunktion zum Installieren eines Zeit-Triggers mit den gegebenen Parametern
 * @param {string} intervalType Art des Intervalls ('minütlich', 'täglich', 'stündlich', 'wöchentlich')
 * @param {number} frequency Frequenz des Triggers
 * @param {number|null} hour Stunde für tägliche/wöchentliche Trigger
 */
function createTimeTrigger(intervalType, frequency, hour) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('sortTriggerInstalled') === 'true') {
    return 'Ein Sortier-Trigger ist bereits installiert. Bitte löschen Sie zuerst vorhandene Trigger, bevor Sie einen neuen erstellen.';
  }

  let triggerBuilder = ScriptApp.newTrigger("sortAllSheetsTrigger").timeBased();

  switch (intervalType) {
    case 'minütlich':
      triggerBuilder = triggerBuilder.everyMinutes(frequency);
      break;
    case 'täglich':
      triggerBuilder = triggerBuilder.everyDays(frequency).atHour(hour !== null ? hour : 0);
      break;
    case 'stündlich':
      triggerBuilder = triggerBuilder.everyHours(frequency);
      break;
    case 'wöchentlich':
      triggerBuilder = triggerBuilder.everyWeeks(frequency).atHour(hour !== null ? hour : 0);
      break;
  }

  triggerBuilder.create();
  props.setProperty('sortTriggerInstalled','true');

  let confirmationMessage = `Der Sortier-Trigger wurde erfolgreich installiert: ${intervalType}`;
  if (frequency > 1) {
    confirmationMessage += ` (alle ${frequency} ${intervalType.slice(0, -2)}en)`;
  }
  if (hour !== null && (intervalType === 'täglich' || intervalType === 'wöchentlich')) {
    confirmationMessage += ` um ${hour}:00 Uhr`;
  }
  
  return confirmationMessage;
}

// ============================================================================
// SEKTION: TRIGGER-MANAGEMENT
// ============================================================================

/**
 * Installiert periodischen Sortier-Trigger mit konfigurierbaren Intervallen.
 * 
 * Unterstützte Intervalle:
 * - Minütlich: Sortiert alle X Minuten
 * - Stündlich: Sortiert alle X Stunden
 * - Täglich: Sortiert täglich zur angegebenen Uhrzeit
 * - Wöchentlich: Sortiert wöchentlich zur angegebenen Uhrzeit
 * 
 * Workflow:
 * 1. Löscht bestehende sortAllSheetsTrigger-Trigger
 * 2. Fragt Benutzer nach Intervalltyp
 * 3. Fragt nach Frequenz (z.B. "alle 3 Stunden")
 * 4. Bei täglich/wöchentlich: Fragt nach Uhrzeit
 * 5. Erstellt Trigger mit createTimeTrigger()
 * 
 * @function installSortTrigger
 */
function installSortTrigger() {
  const ui = SpreadsheetApp.getUi();

  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "sortAllSheetsTrigger") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  // clear global installation flag so another user can install later if desired
  PropertiesService.getScriptProperties().deleteProperty('sortTriggerInstalled');

  const typeResponse = ui.prompt(
    'Sortier-Trigger installieren',
    'Möchten Sie einen *minütlichen*, *täglichen*, *stündlichen* oder *wöchentlichen* Sortier-Trigger einrichten? (Antworten Sie mit "minütlich", "täglich", "stündlich" oder "wöchentlich")',
    ui.ButtonSet.OK_CANCEL
  );

  if (typeResponse.getSelectedButton() !== ui.Button.OK) {
    SpreadsheetApp.getActive().toast("Installation des Triggers abgebrochen.", "ℹ️ Abgebrochen", 2);
    return;
  }
  const intervalType = typeResponse.getResponseText().trim().toLowerCase();

  if (!['minütlich', 'täglich', 'stündlich', 'wöchentlich'].includes(intervalType)) {
    ui.alert("Error", "Ungültiger Intervalltyp. Bitte antworten Sie mit 'minütlich', 'täglich', 'stündlich' oder 'wöchentlich'.", ui.ButtonSet.OK);
    return;
  }

  const frequencyPromptText = `Wie oft soll der Trigger laufen? (Geben Sie eine positive ganze Zahl ein, z.B. '1' für jede Minute/Stunde/Tag/Woche, '3' für alle 3 Minuten/Stunden/Tage/Wochen)`;
  const frequencyResponse = ui.prompt(
    'Sortier-Trigger installieren',
    frequencyPromptText,
    ui.ButtonSet.OK_CANCEL
  );

  if (frequencyResponse.getSelectedButton() !== ui.Button.OK) {
    SpreadsheetApp.getActive().toast("Installation des Triggers abgebrochen.", "ℹ️ Abgebrochen", 2);
    return;
  }
  const frequency = parseInt(frequencyResponse.getResponseText().trim(), 10);

  if (isNaN(frequency) || frequency <= 0) {
    ui.alert("Error", "Ungültige Frequenz. Bitte geben Sie eine positive ganze Zahl ein.", ui.ButtonSet.OK);
    return;
  }

  let hour = null;
  if (intervalType === 'täglich' || intervalType === 'wöchentlich') {
    const hourResponse = ui.prompt(
      'Sortier-Trigger installieren',
      'Um welche Uhrzeit (0-23) soll der Trigger ausgeführt werden?',
      ui.ButtonSet.OK_CANCEL
    );

    if (hourResponse.getSelectedButton() !== ui.Button.OK) {
      SpreadsheetApp.getActive().toast("Installation des Triggers abgebrochen.", "ℹ️ Abgebrochen", 2);
      return;
    }
    hour = parseInt(hourResponse.getResponseText().trim(), 10);

    if (isNaN(hour) || hour < 0 || hour > 23) {
      ui.alert("Error", "Ungültige Uhrzeit. Bitte geben Sie eine Zahl zwischen 0 und 23 ein.", ui.ButtonSet.OK);
      return;
    }
  }

  const confirmationMessage = createTimeTrigger(intervalType, frequency, hour);
  ui.alert('Sortier-Trigger installiert.', confirmationMessage, ui.ButtonSet.OK);
  Logger.log(confirmationMessage);
}

/**
 * Installiert alle notwendigen installierbaren onEdit-Trigger.
 * Dies umfasst den Haupt-`handleOnEdit`-Trigger.
 */
function installAllTriggers() {
  const ui = SpreadsheetApp.getUi();
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;

  // Lösche ALLE bestehenden onEdit-Trigger, um Konflikte zu vermeiden.
  // Dies fängt sowohl installierbare Trigger als auch einfache Trigger (die manchmal hartnäckig sein können) ab,
  // indem alle Trigger durchlaufen werden, die vom Event-Typ her passen.
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getEventType() === ScriptApp.EventType.ON_EDIT) {
      ScriptApp.deleteTrigger(triggers[i]);
      Logger.log(`Gelöschter alter onEdit-Trigger: ${triggers[i].getHandlerFunction() || 'Unbekannt'}`);
      deletedCount++;
    }
  }
  Logger.log(`Gelöscht: ${deletedCount} bestehende onEdit-Trigger.`);


  try {
    // Erstelle den EINEN installierbaren onEdit-Trigger für handleOnEdit
    ScriptApp.newTrigger("handleOnEdit") // Beziehe dich direkt auf die Funktion handleOnEdit
      .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
      .onEdit()
      .create();
    Logger.log("Installierbarer onEdit-Trigger für 'handleOnEdit' erfolgreich erstellt.");
    // No UI alert here, toast will be shown by setupAndImportAllSets.
  } catch (e) {
    ui.alert("Fehler bei Trigger-Installation", `Es gab einen Fehler beim Erstellen des Haupt-Triggers: ${e.message}. Bitte stellen Sie sicher, dass Sie alle Berechtigungen erteilt haben.`, ui.ButtonSet.OK);
    Logger.log(`Fehler beim Erstellen des handleOnEdit-Triggers: ${e.message} \nStack: ${e.stack}`);
  }
}

/**
 * Deinstalliert alle notwendigen installierbaren onEdit-Trigger.
 * Dies umfasst den Haupt-`handleOnEdit`-Trigger.
 */
function uninstallAllTriggers() {
  const ui = SpreadsheetApp.getUi();
  const triggers = ScriptApp.getProjectTriggers();
  let triggersDeleted = 0;

  // Liste der Trigger-Funktionen, die verwaltet werden sollen.
  const mainTriggerFunction = "handleOnEdit";

  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getEventType() === ScriptApp.EventType.ON_EDIT && triggers[i].getHandlerFunction() === mainTriggerFunction) {
      ScriptApp.deleteTrigger(triggers[i]);
      triggersDeleted++;
    }
  }

  if (triggersDeleted > 0) {
    Logger.log(`${triggersDeleted} onEdit-Trigger deinstalliert.`);
  } else {
    Logger.log("Keine onEdit-Trigger zum Deinstallieren gefunden.");
  }
}


/**
 * Trigger-Callback: Sortiert alle importierten Set-Blätter automatisch.
 * 
 * Ausgeführt durch:
 * - Zeit-basierte Trigger (installiert via installSortTrigger)
 * - Periodische Ausführung (minütlich/stündlich/täglich/wöchentlich)
 * 
 * Workflow:
 * 1. Lädt alle Sets aus "Sets Overview"
 * 2. Iteriert über jedes Set
 * 3. Prüft ob Sheet existiert und Set-ID übereinstimmt
 * 4. Lädt Karten mit prepareCardsForSorting()
 * 5. Rendert mit renderAndSortCardsInSheet()
 * 6. Speichert Sortier-Zeitstempel
 * 7. Aktualisiert Collection Summary
 * 
 * Performance:
 * - 100ms Sleep zwischen Sets (API-Rate-Limiting)
 * - Detailliertes Logging
 * - Error-Handling pro Set (Fehler blockieren nicht andere Sets)
 * 
 * @function sortAllSheetsTrigger
 * 
 * @see installSortTrigger
 * @see prepareCardsForSorting
 * @see renderAndSortCardsInSheet
 */
function sortAllSheetsTrigger() {
  // prevent multiple simultaneous executions (duplicate triggers or overlapping runs)
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) { // wait up to 1 second
    Logger.log('sortAllSheetsTrigger: another instance is running, aborting duplicate call');
    return;
  }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
  const imported = getImportedSetsFromSheets();
  if (imported.length === 0) {
    Logger.log("sortAllSheetsTrigger: Keine importierten Set-Blätter gefunden. Überspringe Sortierung.");
    return;
  }

  Logger.log(`Starte automatische Sortierung für ${imported.length} importierte Sets...`);

  const tcgdexAllSets = fetchApiData(`${TCGDEX_BASE_URL}sets`, "Fehler beim Laden der TCGDex Sets für automatische Sortierung");

  const startTime = Date.now();
  const MAX_DURATION = 5 * 60 * 1000; // Sicherheitsabbruch bei 5 Minuten

  imported.forEach(({setId, setName}, idx) => {
    if (Date.now() - startTime > MAX_DURATION) {
      Logger.log(`sortAllSheetsTrigger: Zeitlimit erreicht nach ${idx} Sets, beende Trigger.`);
      return; // exit this iteration, the lock release will follow
    }
    const sheet = ss.getSheetByName(setName);
    if (sheet && sheet.getRange(1, 1).getNote() === `Set ID: ${setId}`) {
      try {
        Logger.log(`Sortiere Blatt: ${setName} (Set ID: ${setId})`);

        const { allCards, cardmarketData } = prepareCardsForSorting(setId, setName, tcgdexAllSets);
        
        if (allCards.length === 0) {
          Logger.log(`sortAllSheetsTrigger: Keine Karten für Set ${setId} gefunden. Überspringe.`);
          return;
        }

        renderAndSortCardsInSheet(sheet, setId, allCards, cardmarketData);
        PropertiesService.getScriptProperties().setProperty(`lastSortTime_${setId}`, new Date().getTime().toString());

      } catch (e) {
        Logger.log(`Fehler bei automatischer Sortierung von Set ${setName} (ID: ${setId}): ${e.message} \nStack: ${e.stack}`);
      }
    } else {
      Logger.log(`Blatt "${setName}" für Set ID ${setId} nicht gefunden oder Notiz stimmt nicht überein. Überspringe.`);
    }
    Utilities.sleep(100);
  });
  Logger.log("Automatische Sortierung abgeschlossen.");

  updateCollectionSummary();
  Logger.log("Sammlungsübersicht nach Trigger-Sortierung aktualisiert.");
  } finally {
    lock.releaseLock();
  }
}

/**
 * Sortiert alle Set-Blätter manuell (User-initiiert).
 * 
 * Unterschied zu sortAllSheetsTrigger:
 * - Erfordert Bestätigung via Dialog
 * - Zeigt Toast-Notifications (Progress & Completion)
 * - Von Menü-Option aufrufbar
 * - Keine automatische Trigger-Löschung
 * 
 * Workflow:
 * 1. Prüft ob Sets vorhanden
 * 2. Bestätigt via Dialog (YES/NO)
 * 3. Sortiert alle Sets (identisch zu sortAllSheetsTrigger)
 * 4. Zeigt Erfolgs-Toast
 * 5. Aktualisiert Collection Summary
 * 
 * Use Cases:
 * - Manuelle Neuordnung nach Sammlungsänderungen
 * - Test von Sortier-Algorithmus
 * - Update nach Import-Problemen
 * 
 * @function manualSortAllSheets
 */
function manualSortAllSheets() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const imported = getImportedSetsFromSheets();
  if (imported.length === 0) {
    ui.alert("Info", "Keine importierten Sets gefunden. Bitte importieren Sie zuerst Sets.", ui.ButtonSet.OK);
    return;
  }

  let processedCount = 0;
  SpreadsheetApp.getActive().toast(`Starte manuelle Sortierung für ${imported.length} importierte Sets...`, "🔄 In Arbeit", 10);

  const tcgdexAllSets = fetchApiData(`${TCGDEX_BASE_URL}sets`, "Fehler beim Laden der TCGDex Sets für manuelle Sortierung");

  const startTime = Date.now();
  const MAX_DURATION = 5 * 60 * 1000; // 5 Minuten Sicherheitsgrenze

  for (let i = 0; i < imported.length; i++) {
    // beende frühzeitig wenn wir uns dem Timeout nähern
    if (Date.now() - startTime > MAX_DURATION) {
      Logger.log(`manualSortAllSheets: Zeitlimit erreicht nach ${i} Sets, abgebrochen.`);
      ui.alert("Zeitlimit erreicht", `Sortierung wurde nach ${i} Sets abgebrochen, weil das Zeitlimit erreicht wurde. Bitte erneut ausführen.`, ui.ButtonSet.OK);
      break;
    }
    const { setId, setName } = imported[i];

    const sheet = ss.getSheetByName(setName);
    if (sheet && sheet.getRange(1, 1).getNote() === `Set ID: ${setId}`) {
      SpreadsheetApp.getActive().toast(`Sortiere Set ${i + 1}/${imported.length}: ${setName}`, "🔄 In Arbeit", 5);
      try {
        const { allCards, cardmarketData } = prepareCardsForSorting(setId, setName, tcgdexAllSets);
        if (allCards.length === 0) {
          Logger.log(`manualSortAllSheets: Keine Karten für Set ${setId} gefunden. Überspringe.`);
          continue;
        }

        renderAndSortCardsInSheet(sheet, setId, allCards, cardmarketData);
        PropertiesService.getScriptProperties().setProperty(`lastSortTime_${setId}`, new Date().getTime().toString());
        processedCount++;
        Utilities.sleep(100);
      } catch (e) {
        Logger.log(`Fehler bei manueller Sortierung von Set ${setName} (ID: ${setId}): ${e.message} \nStack: ${e.stack}`);
        ui.alert(`Fehler bei Set ${setName}`, `Fehler: ${e.message}. Details im Log. Sortierung wird mit nächstem Set fortgesetzt.`, ui.ButtonSet.OK);
      }
    } else {
      Logger.log(`Blatt "${setName}" für Set ID ${setId} nicht gefunden oder Notiz stimmt nicht überein. Überspringe manuelle Sortierung.`);
    }
  }
  updateCollectionSummary();
  Logger.log("Sammlungsübersicht nach manueller Sortierung aller Blätter aktualisiert.");

  SpreadsheetApp.getActive().toast(`Manuelle Sortierung abgeschlossen. ${processedCount}/${imported.length} Sets verarbeitet.`, "✅ Fertig", 10);
  ui.alert("Manuelle Sortierung abgeschlossen", `${processedCount}/${imported.length} Sets wurden sortiert.`, ui.ButtonSet.OK);
}

/**
 * Sortiert nur das aktuell geöffnete Set-Blatt.
 * 
 * Unterschied zu manualSortAllSheets:
 * - Sortiert nur ein einzelnes Set (schneller)
 * - Keine Bestätigungs-Dialog erforderlich
 * - Ideal für schnelle Updates nach Änderungen
 * 
 * Validierung:
 * - Prüft ob aktuelles Sheet ein Set-Blatt ist
 * - Lehnt Overview/Summary-Blätter ab
 * - Prüft Set-ID in Zelle A1 (Notiz)
 * 
 * Workflow:
 * 1. Extrahiert Set-ID aus A1-Notiz
 * 2. Lädt Karten mit prepareCardsForSorting()
 * 3. Rendert mit renderAndSortCardsInSheet()
 * 4. Speichert Sortier-Zeitstempel
 * 5. Aktualisiert Collection Summary
 * 
 * Use Cases:
 * - Schnelles Re-Sorting nach manuellen Änderungen
 * - Test einzelner Sets
 * - Korrektur von Import-Fehlern
 * 
 * @function manualSortCurrentSheet
 */
function manualSortCurrentSheet() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const currentSheet = ss.getActiveSheet();
  const sheetName = currentSheet.getName();
  const setsSheet = ss.getSheetByName("Sets Overview");

  if (sheetName === "Sets Overview" || sheetName === "Collection Summary") {
    ui.alert("Error", "Dies ist kein Karten-Set-Blatt. Bitte wechseln Sie zu einem Set-Blatt, um diese Funktion zu nutzen.", ui.ButtonSet.OK);
    return;
  }

  const setIdNote = currentSheet.getRange(1, 1).getNote();
  let setId = null; // Dies ist die pokemontcg.io Set ID oder TCGDex-only ID
  if (setIdNote && setIdNote.startsWith('Set ID: ')) {
    setId = setIdNote.substring('Set ID: '.length);
  }

  if (!setId) {
    ui.alert("Error", `Konnte die Set-ID für das Blatt "${sheetName}" nicht finden (Notiz in A1 fehlt oder ist ungültig). Bitte stellen Sie sicher, dass das Set in der "Sets Overview" gelistet ist und importieren Sie es ggf. erneut.`, ui.ButtonSet.OK);
    return;
  }

  SpreadsheetApp.getActive().toast(`Sortiere aktuelles Set "${sheetName}" neu...`, "🔄 Sortieren", 3);
  try {
    const tcgdexAllSets = fetchApiData(`${TCGDEX_BASE_URL}sets`, "Fehler beim Laden der TCGDex Sets für Sortierung (aktuelles Blatt)");
    const { allCards, cardmarketData } = prepareCardsForSorting(setId, sheetName, tcgdexAllSets);
    
    if (allCards.length === 0) {
      ui.alert("Fehler", `Konnte Karten für Set "${sheetName}" nicht laden. Sortierung abgebrochen.`, ui.ButtonSet.OK);
      return;
    }

    renderAndSortCardsInSheet(currentSheet, setId, allCards, cardmarketData);
    PropertiesService.getScriptProperties().setProperty(`lastSortTime_${setId}`, new Date().getTime().toString());

    updateCollectionSummary();
    Logger.log(`Sammlungsübersicht nach manueller Sortierung von Blatt "${sheetName}" aktualisiert.`);

    SpreadsheetApp.getActive().toast(`Sortierung für Set "${sheetName}" abgeschlossen.`, "✅ Fertig", 3);
  }
  catch (error) {
    Logger.log(`Fehler beim Neusortieren des aktuellen Sets ${sheetName}: ${error.message} \nStack: ${error.stack}`);
    ui.alert("Error", `Fehler beim Neusortieren des aktuellen Sets "${sheetName}": ${error.message}. Details im Log.`, ui.ButtonSet.OK);
  }
}

/**
 * Hilfsfunktion, um die Set-ID (pokemontcg.io oder TCGDex-only) und den Blattnamen des aktuell aktiven Set-Blattes zu erhalten.
 * @returns {{setId: string, setName: string, sheet: GoogleAppsScript.Spreadsheet.Sheet}|null} Objekt mit Set-ID, Name und Blatt, oder null bei Fehler.
 */
function getSetSheetAndIdForCurrentSheet() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const currentSheet = ss.getActiveSheet();
  const sheetName = currentSheet.getName();

  if (sheetName === "Sets Overview" || sheetName === "Collection Summary") {
    ui.alert("Error", "Dies ist kein Karten-Set-Blatt. Bitte wechseln Sie zu einem Set-Blatt, um diese Funktion zu nutzen.", ui.ButtonSet.OK);
    return null;
  }

  const setIdNote = currentSheet.getRange(1, 1).getNote();
  let setId = null;
  if (setIdNote && setIdNote.startsWith('Set ID: ')) {
    setId = setIdNote.substring('Set ID: '.length);
  }

  if (!setId) {
    ui.alert("Error", `Konnte die Set-ID für das Blatt "${sheetName}" nicht finden (Notiz in A1 fehlt oder ist ungültig). Bitte stellen Sie sicher, dass das Set in der "Sets Overview" gelistet ist und importieren Sie es ggf. erneut.`, ui.ButtonSet.OK);
    return null;
  }
  return { setId: setId, setName: sheetName, sheet: currentSheet };
}

// ============================================================================
// SEKTION: LÖSCHFUNKTIONEN & BEREINIGUNG
// ============================================================================

/**
 * Löscht das aktuell geöffnete Set komplett.
 * 
 * Bereinigt:
 * - Set-Blatt aus Spreadsheet
 * - Set-Eintrag aus "Sets Overview" (Status update)
 * - Alle Kartendaten (collectedCardsData)
 * - Custom-Bilder (customImageUrls)
 * - Cardmarket-URLs (pokemontcgIoCardmarketUrls)
 * - Import-Status (importedSetsStatus)
 * 
 * Sicherheit:
 * - Schützt spezielle Blätter via getSetSheetAndIdForCurrentSheet()
 * - Bestätigt Löschung per Dialog (YES/NO)
 * - Aktualisiert Collection Summary nach Löschung
 * - Detailliertes Error-Handling mit Logging
 * 
 * Unterstützt:
 * - Pokemontcg.io Sets (mit Cardmarket-URLs)
 * - TCGDex-Only Sets (ohne Cardmarket-URLs)
 * 
 * @function deleteCurrentSet
 */
function deleteCurrentSet() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setsSheet = ss.getSheetByName("Sets Overview");

  const currentSetInfo = getSetSheetAndIdForCurrentSheet();
  if (!currentSetInfo) return;

  const { setId, setName, sheet } = currentSetInfo; // setId ist pokemontcg.io Set ID oder TCGDex-only ID

  const response = ui.alert(
    "Set löschen bestätigen",
    `Möchten Sie das Set-Blatt "${setName}" und ALLE zugehörigen Sammlungsdaten unwiderruflich löschen?`,
    ui.ButtonSet.YES_NO
  );

  if (response === ui.Button.YES) {
    try {
      ss.deleteSheet(sheet);
      SpreadsheetApp.getActive().toast(`Blatt "${setName}" gelöscht.`, "✅ Gelöscht", 3);

      const scriptProperties = PropertiesService.getScriptProperties();

      let collectedCardsData = getScriptPropertiesData('collectedCardsData');
      if (collectedCardsData[setId]) {
        delete collectedCardsData[setId];
        setScriptPropertiesData('collectedCardsData', collectedCardsData);
        Logger.log(`Collected cards data for Set ${setId} gelöscht.`);
      }

      let customImageUrls = getScriptPropertiesData('customImageUrls');
      if (customImageUrls[setId]) {
        delete customImageUrls[setId];
        setScriptPropertiesData('customImageUrls', customImageUrls);
        Logger.log(`Custom image URLs for Set ${setId} gelöscht.`);
      }

      // Löscht Cardmarket URLs für dieses Set (existiert nur für pokemontcg.io Sets)
      // Bei TCGDex-only Sets ist dies leer.
      PropertiesService.getScriptProperties().deleteProperty(`pokemontcgIoCardmarketUrls_${setId}`);
      Logger.log(`pokemontcg.io Cardmarket URLs for Set ${setId} gelöscht (falls vorhanden).`);

      let importedSetsStatus = getScriptPropertiesData('importedSetsStatus');
      if (importedSetsStatus[setId]) {
        importedSetsStatus[setId] = false;
        setScriptPropertiesData('importedSetsStatus', importedSetsStatus);
        Logger.log(`Imported status for Set ${setId} updated to false.`);
      }

      // Aktualisiert den Status in der Sets Overview, ohne die Zeile zu löschen
      // Da die Set-Zeile im populateSetsOverview neu generiert wird, braucht sie hier nicht gelöscht zu werden.
      // Stattdessen wird populateSetsOverview aufgerufen, um die Übersicht zu aktualisieren.
      populateSetsOverview();
      updateCollectionSummary();

      ui.alert("Set gelöscht", `Das Set "${setName}" und alle zugehörigen Daten wurden erfolgreich gelöscht.`, ui.ButtonSet.OK);

    } catch (error) {
      Logger.log(`Fehler beim Löschen des Sets ${setName}: ${error.message} \nStack: ${error.stack}`);
      ui.alert("Error", `Fehler beim Löschen des Sets "${setName}": ${error.message}. Details im Log.`, SpreadsheetApp.getUi().ButtonSet.OK);
    }
  } else {
    SpreadsheetApp.getActive().toast("Löschvorgang abgebrochen.", "ℹ️ Abgebrochen", 2);
  }
}

/**
 * Deinstalliert alle periodischen Sortier-Trigger.
 * 
 * Entfernt:
 * - Alle Zeit-Trigger für "sortAllSheetsTrigger"
 * 
 * Sicherheit:
 * - Bestätigung per Dialog (YES/NO)
 * - Bestätigung nach erfolgreicher Deinstallation
 * - Log-Eintrag für jeden entfernten Trigger
 * 
 * Use Case:
 * - Trigger-Bereinigung
 * - Änderung der Sortier-Strategie
 * - Performance-Optimierung
 * 
 * @function uninstallSortTrigger
 */
function uninstallSortTrigger() {
  const ui = SpreadsheetApp.getUi();
  const triggers = ScriptApp.getProjectTriggers();
  let triggersDeleted = 0;

  const response = ui.alert(
    "Trigger deinstallieren bestätigen",
    "Möchten Sie den automatischen Sortier-Trigger wirklich deinstallieren? Er wird dann nicht mehr automatisch ausgeführt.",
    ui.ButtonSet.YES_NO
  );

  if (response === ui.Button.YES) {
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === "sortAllSheetsTrigger") {
        ScriptApp.deleteTrigger(triggers[i]);
        triggersDeleted++;
      }
    }

    if (triggersDeleted > 0) {
      ui.alert('Trigger deinstalliert', `${triggersDeleted} Sortier-Trigger wurde(n) erfolgreich deinstalliert.`, ui.ButtonSet.OK);
      Logger.log(`${triggersDeleted} Sortier-Trigger deinstalliert.`);
    } else {
      ui.alert('Kein Trigger gefunden', 'Es war kein aktiver Sortier-Trigger installiert.', ui.ButtonSet.OK);
      Logger.log("Kein Sortier-Trigger zum Deinstallieren gefunden.");
    }
  } else {
    SpreadsheetApp.getActive().toast("Deinstallation abgebrochen.", "ℹ️ Abgebrochen", 2);
  }
}

/**
 * Löscht alle persistenten Daten und setzt Spreadsheet zurück.
 * 
 * ACHTUNG: Destruktive Operation!
 * 
 * Entfernt:
 * - Alle Properties (collectedCardsData, customImageUrls, etc.)
 * - Alle Set-Blätter (außer Overview & Summary)
 * - Inhalte von "Sets Overview" & "Collection Summary"
 * - Alle installierten Trigger (Sort-Trigger & onEdit-Trigger)
 * 
 * Workflow:
 * 1. Erste Bestätigung (YES/NO)
 * 2. Zweite Sicherheitsabfrage (YES/NO)
 * 3. Deinstalliert alle Trigger
 * 4. Löscht alle Properties
 * 5. Entfernt alle Set-Blätter
 * 6. Leert Overview & Summary
 * 7. Führt setupSheets() aus (Neuinitialisierung)
 * 
 * Sicherheit:
 * - Doppelte Bestätigung erforderlich
 * - Detailliertes Logging jeder Löschung
 * - Error-Handling mit Fallback
 * - Toast-Notifications für Benutzer-Feedback
 * 
 * @function deleteAllPersistentData
 */
function deleteAllPersistentData() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scriptProperties = PropertiesService.getScriptProperties();

  const firstResponse = ui.alert(
    "ALLE DATEN LÖSCHEN BESTÄTIGEN",
    "Möchten Sie wirklich ALLE persistenten Daten (gesammelte Karten, benutzerdefinierte Bilder, gecachte Set-Daten) unwiderruflich löschen? Ein Backup wird erstellt.",
    ui.ButtonSet.YES_NO
  );

  if (firstResponse !== ui.Button.YES) {
    SpreadsheetApp.getActive().toast("Löschvorgang abgebrochen.", "ℹ️ Abgebrochen", 2);
    return;
  }

  const secondResponse = ui.alert(
    "LETZTE BESTÄTIGUNG: ALLE DATEN LÖSCHEN",
    "Sind Sie ABSOLUT SICHER? Ein Backup wird erstellt, aber alle aktuellen Sheets werden gelöscht.",
    ui.ButtonSet.YES_NO
  );

  if (secondResponse !== ui.Button.YES) {
    SpreadsheetApp.getActive().toast("Löschvorgang abgebrochen.", "ℹ️ Abgebrochen", 2);
    return;
  }

  try {
    // Backup erstellen
    SpreadsheetApp.getActive().toast("Erstelle Backup...", "🔄 Backup", 3);
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
    const backupKey = `backup_${timestamp}`;
    const allData = scriptProperties.getProperties();
    scriptProperties.setProperty(backupKey, JSON.stringify({
      timestamp: timestamp,
      data: allData
    }));
    Logger.log(`Backup erstellt: ${backupKey} (${Object.keys(allData).length} Properties)`);
    
    SpreadsheetApp.getActive().toast("Lösche alle persistenten Daten...", "🔄 In Arbeit", 5);
    Logger.log("Starte Löschen aller persistenten Daten.");

    uninstallAllTriggers();
    uninstallSortTrigger();

    const allKeys = scriptProperties.getKeys();
    allKeys.forEach(key => {
      if (key.startsWith('backup_')) {
        Logger.log(`Backup-Property behalten: ${key}`);
        return;
      }
      scriptProperties.deleteProperty(key);
      Logger.log(`Gelöschte Property: ${key}`);
    });

    const sheets = ss.getSheets();
    sheets.forEach(sheet => {
      const sheetName = sheet.getName();
      if (sheetName !== "Sets Overview" && sheetName !== "Collection Summary") {
        ss.deleteSheet(sheet);
        Logger.log(`Blatt "${sheetName}" gelöscht.`);
      }
    });

    const setsSheet = ss.getSheetByName("Sets Overview");
    if (setsSheet) {
      setsSheet.clearContents();
    }
    const summarySheet = ss.getSheetByName("Collection Summary");
    if (summarySheet) {
      summarySheet.clearContents();
    }

    setupSheets();

    SpreadsheetApp.getActive().toast('Alle persistenten Daten erfolgreich gelöscht.', '✅ Fertig', 5);
    Logger.log("Alle persistenten Daten erfolgreich gelöscht.");
  } catch (error) {
    Logger.log(`Fehler beim Löschen aller persistenten Daten: ${error.message} \nStack: ${error.stack}`);
    ui.alert("Error", `Fehler beim Löschen aller persistenten Daten: ${error.message}. Details im Log.`, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Stellt Daten aus einem Backup wieder her.
 * 
 * Features:
 * - Listet verfügbare Backups auf
 * - Stellt ausgewähltes Backup wieder her
 * - Validiert Backup-Daten vor Wiederherstellung
 * 
 * @function restoreFromBackup
 */
function restoreFromBackup() {
  const ui = SpreadsheetApp.getUi();
  const scriptProperties = PropertiesService.getScriptProperties();
  const allKeys = scriptProperties.getKeys();
  const backupKeys = allKeys.filter(key => key.startsWith('backup_'));
  
  if (backupKeys.length === 0) {
    ui.alert('ℹ️ Info', 'Keine Backups gefunden.', ui.ButtonSet.OK);
    return;
  }
  
  // Liste Backups auf
  const backupList = backupKeys.map(key => {
    const timestamp = key.replace('backup_', '');
    return `${timestamp}`;
  }).join('\n');
  
  const response = ui.prompt(
    'Script-Backup wiederherstellen',
    `Diese Funktion stellt Script-Backups wieder her (nicht CSV).\n\nVerfügbare Backups:\n${backupList}\n\nGeben Sie den Zeitstempel ein (z.B. 20260201_143055):`,
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  
  const selectedTimestamp = response.getResponseText().trim();
  const backupKey = `backup_${selectedTimestamp}`;
  
  if (!backupKeys.includes(backupKey)) {
    ui.alert('❌ Fehler', 'Backup nicht gefunden.', ui.ButtonSet.OK);
    return;
  }
  
  try {
    SpreadsheetApp.getActive().toast('Stelle Backup wieder her...', '🔄 In Arbeit', 5);
    const backupJson = scriptProperties.getProperty(backupKey);
    const backup = JSON.parse(backupJson);
    
    // Stelle Daten wieder her (außer Backup-Keys selbst)
    Object.keys(backup.data).forEach(key => {
      if (!key.startsWith('backup_')) {
        scriptProperties.setProperty(key, backup.data[key]);
      }
    });
    
    Logger.log(`Backup ${selectedTimestamp} wiederhergestellt: ${Object.keys(backup.data).length} Properties`);
    SpreadsheetApp.getActive().toast('Backup erfolgreich wiederhergestellt!', '✅ Fertig', 5);
  } catch (error) {
    Logger.log(`Fehler bei Wiederherstellung: ${error.message}`);
    ui.alert(`Fehler: ${error.message}`);
  }
}

/**
 * Sucht nach einer Karte über alle Sets hinweg.
 * 
 * @function searchCard
 */
function searchCard() {
  const ui = SpreadsheetApp.getUi();
  
  const response = ui.prompt(
    '🔍 Karte suchen',
    'Geben Sie den Kartennamen oder die Nummer ein:',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  
  const searchTerm = response.getResponseText().trim().toLowerCase();
  if (!searchTerm) {
    return;
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  const results = [];
  
  SpreadsheetApp.getActive().toast('Suche läuft...', '🔍 Suchen', 3);
  
  // Dynamisch berechnete Spaltenanzahl basierend auf Grid-Konstanten
  const numCols = CARDS_PER_ROW_IN_GRID * CARD_BLOCK_WIDTH_COLS;
  
  // Durchsuche alle Set-Sheets
  for (const sheet of sheets) {
    const sheetName = sheet.getName();
    if (sheetName === 'Sets Overview' || sheetName === 'Collection Summary') {
      continue;
    }
    
    const lastRow = sheet.getLastRow();
    if (lastRow < CARD_DATA_START_ROW + 1) {
      continue;
    }
    
    const numRows = lastRow - CARD_DATA_START_ROW;
    const data = sheet.getRange(CARD_DATA_START_ROW + 1, 1, numRows, numCols).getValues();
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      for (let block = 0; block < CARDS_PER_ROW_IN_GRID; block++) {
        const colOffset = block * CARD_BLOCK_WIDTH_COLS;
        if (colOffset >= row.length) break;
        
        const cardNumber = row[colOffset];
        const cardName = row[colOffset + 1];
        
        if (!cardNumber) continue;
        
        const numberMatch = String(cardNumber).toLowerCase().includes(searchTerm);
        const nameMatch = String(cardName).toLowerCase().includes(searchTerm);
        
        if (numberMatch || nameMatch) {
          results.push({
            set: sheetName,
            number: cardNumber,
            name: cardName,
            row: CARD_DATA_START_ROW + 2 + i
          });
        }
      }
    }
  }
  
  // Zeige Ergebnisse
  if (results.length === 0) {
    ui.alert('🔍 Suchergebnis', `Keine Karten gefunden für: "${searchTerm}"`, ui.ButtonSet.OK);
    return;
  }
  
  // Erstelle Ergebnis-String
  let resultText = `${results.length} Karte(n) gefunden:\n\n`;
  results.slice(0, 20).forEach((result, i) => {
    resultText += `${i + 1}. ${result.set} - #${result.number} ${result.name}\n`;
  });
  
  if (results.length > 20) {
    resultText += `\n... und ${results.length - 20} weitere`;
  }
  
  ui.alert('🔍 Suchergebnis', resultText, ui.ButtonSet.OK);
  
  // Springe zum ersten Ergebnis
  if (results.length > 0) {
    const firstResult = results[0];
    const sheet = ss.getSheetByName(firstResult.set);
    if (sheet) {
      ss.setActiveSheet(sheet);
      sheet.setActiveRange(sheet.getRange(firstResult.row, 1));
      SpreadsheetApp.getActive().toast(`Springe zu: ${firstResult.name}`, '✅ Gefunden', 3);
    }
  }
}

/**
 * Exportiert die gesamte Sammlung als CSV-Datei.
 * 
 * Format: Set,CardNumber,CardName,Normal,ReverseHolo
 * 
 * Features:
 * - Durchläuft alle Set-Sheets
 * - Sammelt Karten-Daten und Sammlung-Status
 * - Generiert Download-Link für CSV
 * 
 * @function exportCollectionToCSV
 */
function exportCollectionToCSV() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const scriptProperties = PropertiesService.getScriptProperties();
  
  try {
    SpreadsheetApp.getActive().toast('Exportiere Sammlung...', '📤 Export', 5);
    
    // CSV Header
    let csvContent = 'Set,SetName,CardNumber,CardName,Normal,ReverseHolo\n';
    let totalCards = 0;
    
    // Durchlaufe alle Sheets außer Spezialblätter
    const sheets = ss.getSheets();
    for (const sheet of sheets) {
      const sheetName = sheet.getName();
      if (sheetName === 'Sets Overview' || sheetName === 'Collection Summary') {
        continue;
      }
      
      // Extrahiere technische Set-ID aus der Note in A1 (Format: "Set ID: xyz")
      const noteText = sheet.getRange(1, 1).getNote() || '';
      let setId = sheetName; // Fallback
      
      if (noteText.startsWith('Set ID: ')) {
        setId = noteText.substring('Set ID: '.length).trim();
      } else {
        Logger.log(`CSV Export: Warnung - Keine Set ID Note gefunden für Sheet "${sheetName}". Verwende Sheet-Namen.`);
      }
      
      // Lade Sammlung-Daten für dieses Set
      const allCollectedData = getScriptPropertiesData('collectedCardsData', {});
      const collectedData = allCollectedData[setId] || {};
      
      // Lies Karten aus Sheet
      const lastRow = sheet.getLastRow();
      if (lastRow < CARD_DATA_START_ROW + 1) {
        continue; // Keine Karten
      }
      
      const numRows = lastRow - CARD_DATA_START_ROW;
      const numCols = CARDS_PER_ROW_IN_GRID * CARD_BLOCK_WIDTH_COLS;
      const range = sheet.getRange(CARD_DATA_START_ROW + 1, 1, numRows, numCols);
      const rawValues = range.getValues();
      const displayValues = range.getDisplayValues();
      
      // DIAGNOSTIC: Check if COL_CARD_NUMBER is actually a checkbox column
      if (displayValues.length > 0) {
        const col0Values = displayValues.slice(0, Math.min(3, displayValues.length)).map(r => r[0]);
        const col0HasBoolean = col0Values.some(v => typeof v === 'boolean');
        const col0HasString = col0Values.some(v => typeof v === 'string' && v.length > 0);
        
        if (col0HasBoolean && !col0HasString) {
          Logger.log(`CSV Export: ⚠️ CRITICAL: Column 0 contains booleans (checkboxes), not card numbers!`);
          Logger.log(`CSV Export: Column 0 values sample: ${JSON.stringify(col0Values)}`);
          Logger.log(`CSV Export: This suggests column indices are WRONG. Need to find actual card number column.`);
        }
      }
      
      Logger.log(`CSV Export: Sheet "${sheetName}". Range A${CARD_DATA_START_ROW + 1}:J${lastRow}. Rows: ${numRows}`);
      if (rawValues.length > 0) {
        Logger.log(`CSV Export: Raw values row 1: ${JSON.stringify(rawValues[0].slice(0, 5))}`);
        Logger.log(`CSV Export: Display values row 1: ${JSON.stringify(displayValues[0].slice(0, 5))}`);
      }
      
      // Debug: Log ALL columns for first row to understand structure
      if (displayValues.length > 0) {
        Logger.log(`CSV Export: Sheet "${sheetName}" has ${displayValues.length} rows. First row ALL columns: ${JSON.stringify(displayValues[0])}`);
        Logger.log(`CSV Export: Column types - [0]=${typeof displayValues[0][0]}, [1]=${typeof displayValues[0][1]}, [2]=${typeof displayValues[0][2]}, [3]=${typeof displayValues[0][3]}, [4]=${typeof displayValues[0][4]}`);
        Logger.log(`CSV Export: RAW Col0=${JSON.stringify(rawValues[0][0])}, RAW Col1=${JSON.stringify(rawValues[0][1])}, RAW Col2=${JSON.stringify(rawValues[0][2])}, RAW Col3=${JSON.stringify(rawValues[0][3])}`);
        
        // Diagnose: Which column contains actual card numbers (should be string or number, not boolean)?
        let actualCardNumberCol = -1;
        let actualCardNameCol = -1;
        for (let c = 0; c < Math.min(10, displayValues[0].length); c++) {
          const val = displayValues[0][c];
          const valStr = String(val).toLowerCase();
          Logger.log(`CSV Export: Column ${c}: value="${val}" type=${typeof val} is_boolean=${typeof val === 'boolean'}`);
          // Find numeric or string that looks like card number
          if (!actualCardNumberCol && val && typeof val !== 'boolean' && /^[0-9A-Za-z]/.test(String(val))) {
            actualCardNumberCol = c;
            Logger.log(`CSV Export: Identified column ${c} as potential CardNumber column (value: ${val})`);
          }
        }
      }
      
      // Escape CSV-Felder mit Kommas/Anführungszeichen
      const escapeCsv = (field) => {
        if (!field) return '';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      // Sheet-Layout basiert auf einem wiederholten Kartenblock im Grid.
      // Wir berechnen die Anzahl der möglichen Spalten dynamisch, damit Änderungen
      // an CARDS_PER_ROW_IN_GRID oder CARD_BLOCK_WIDTH_COLS automatisch übernommen werden.
      const maxCols = CARDS_PER_ROW_IN_GRID * CARD_BLOCK_WIDTH_COLS;
      Logger.log(`CSV Export: Processing sheet "${sheetName}" with grid layout. maxCols=${maxCols}`);
      
      for (let rowIdx = 0; rowIdx < displayValues.length; rowIdx++) {
        const row = displayValues[rowIdx];
        
        // Iteriere pro Kartenblock im Grid
        for (let cardIndex = 0; cardIndex < CARDS_PER_ROW_IN_GRID; cardIndex++) {
          const colNum = cardIndex * CARD_BLOCK_WIDTH_COLS;
          const colName = colNum + 1;
          
          if (colNum >= row.length) break; // Keine weiteren Spalten
          
          const cardNumber = row[colNum];
          const cardName = row[colName];
          
          if (!cardNumber) continue; // Leere Kartennummer = keine Karte
          
          // Debug-Logging für erste Karte
          if (rowIdx === 0 && cardIndex === 0) {
            Logger.log(`CSV Export: First card from grid. Row 0, CardIndex 0: Number="${cardNumber}", Name="${cardName}"`);
          }
          
          const cardId = normalizeCardNumber(String(cardNumber));
          const cardStatus = collectedData[cardId] || { g: false, rh: false };
          const normalCollected = cardStatus.g ? '1' : '0';
          const reverseHoloCollected = cardStatus.rh ? '1' : '0';
          
          csvContent += `${escapeCsv(setId)},${escapeCsv(sheetName)},${escapeCsv(cardNumber)},${escapeCsv(cardName)},${normalCollected},${reverseHoloCollected}\n`;
          totalCards++;
        }
      }
    }
    
    // Erstelle Blob und Download-Info
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
    const fileName = `Pokemon_Collection_${timestamp}.csv`;
    const blob = Utilities.newBlob(csvContent, 'text/csv', fileName);
    
    // Zeige Download-Dialog
    const htmlOutput = HtmlService.createHtmlOutput(
      `<h3>CSV Export erfolgreich!</h3>
      <p>Karten exportiert: <strong>${totalCards}</strong></p>
      <p><a href="${DriveApp.createFile(blob).getDownloadUrl()}" target="_blank">📥 ${fileName} herunterladen</a></p>
      <p><em>Hinweis: Die Datei wurde in Ihr Google Drive hochgeladen.</em></p>
      <script>
        setTimeout(function() {
          google.script.host.close();
        }, 10000);
      </script>`
    ).setWidth(400).setHeight(250);
    
    ui.showModalDialog(htmlOutput, '📤 CSV Export');
    
    Logger.log(`CSV Export abgeschlossen: ${totalCards} Karten exportiert`);
    SpreadsheetApp.getActive().toast(`${totalCards} Karten exportiert!`, '✅ Fertig', 5);
    
  } catch (error) {
    Logger.log(`Fehler beim CSV-Export: ${error.message}`);
    ui.alert(`Fehler beim Export: ${error.message}`);
  }
}

/**
 * Öffnet einen Dialog zum CSV-Import.
 * 
 * @function showCsvImportDialog
 */
function showCsvImportDialog() {
  const htmlOutput = HtmlService.createHtmlOutput(
    `<div style="font-family:Arial,sans-serif; padding:12px;">
      <h3>CSV Import</h3>
      <p>Wählen Sie eine CSV-Datei aus dem Export aus.</p>
      <input type="file" id="csvFile" accept=".csv,text/csv" />
      <div style="margin-top:12px; display:flex; gap:8px;">
        <button onclick="importCsv()" style="padding:6px 12px;">Importieren</button>
        <button onclick="google.script.host.close()" style="padding:6px 12px;">Abbrechen</button>
      </div>
      <p style="font-size:12px; color:#666; margin-top:10px;">Format: Set,SetName,CardNumber,CardName,Normal,ReverseHolo</p>
      <script>
        function importCsv() {
          const fileInput = document.getElementById('csvFile');
          const file = fileInput.files[0];
          if (!file) {
            alert('Bitte eine CSV-Datei auswählen.');
            return;
          }
          const reader = new FileReader();
          reader.onload = function(e) {
            google.script.run
              .withSuccessHandler(function() { google.script.host.close(); })
              .withFailureHandler(function(err) { alert(err && err.message ? err.message : err); })
              .importCollectionFromCSV(e.target.result);
          };
          reader.readAsText(file);
        }
      </script>
    </div>`
  ).setWidth(420).setHeight(240);

  SpreadsheetApp.getUi().showModalDialog(htmlOutput, '📥 CSV Import');
}

/**
 * Importiert die Sammlung aus einer CSV-Datei (Export-Format).
 * 
 * Erwartetes Format:
 * Set,SetName,CardNumber,CardName,Normal,ReverseHolo
 * 
 * Features:
 * - Validiert Header
 * - Setzt collectedCardsData entsprechend
 * - Aktualisiert Übersichten
 * 
 * @function importCollectionFromCSV
 * @param {string} csvContent - CSV-Inhalt als String
 */
function importCollectionFromCSV(csvContent) {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    // Make sure the overview/summary sheets are present so updates later don't fail.
    // setupSheets is idempotent and safe even if already run earlier.
    try {
      setupSheets();
    } catch (err) {
      Logger.log(`CSV Import: setupSheets() Fehler – ${err.message}`);
    }

    if (!csvContent || typeof csvContent !== 'string') {
      ui.alert('❌ Fehler', 'CSV-Inhalt fehlt oder ist ungültig.', ui.ButtonSet.OK);
      return;
    }

    let rows = [];
    try {
      rows = Utilities.parseCsv(csvContent);
    } catch (e) {
      Logger.log(`CSV Parse Fehler (Utilities): ${e.message}. Versuche Fallback.`);
      rows = parseCsvFallback(csvContent);
    }

    if (!rows || rows.length === 0) {
      ui.alert('❌ Fehler', 'CSV-Datei ist leer oder konnte nicht gelesen werden.', ui.ButtonSet.OK);
      Logger.log(`CSV Import: Keine Zeilen geparst. csvContent Länge: ${csvContent ? csvContent.length : 0}`);
      return;
    }

    if (rows.length < 2) {
      ui.alert('❌ Fehler', `CSV enthält nur ${rows.length} Zeile(n), mindestens 2 erforderlich (Header + mindestens eine Datenzeile).`, ui.ButtonSet.OK);
      Logger.log(`CSV Import: Zu wenig Zeilen. Geparste Zeilen: ${rows.length}`);
      return;
    }

    const header = rows[0].map(h => String(h || '').trim().replace(/^\uFEFF/, ''));
    const expected = ['Set', 'SetName', 'CardNumber', 'CardName', 'Normal', 'ReverseHolo'];
    const headerOk = expected.every((col, i) => header[i] === col);
    if (!headerOk) {
      const actualHeader = header.join(' | ');
      ui.alert('❌ Fehler', `CSV-Header ungültig.\n\nGefunden: ${actualHeader}\n\nErwartet: Set | SetName | CardNumber | CardName | Normal | ReverseHolo`, ui.ButtonSet.OK);
      Logger.log(`CSV Header Fehler. Gefunden: [${header}], Erwartet: [${expected}]`);
      return;
    }

    const modeResponse = ui.alert(
      'CSV Import',
      'Vorhandene Daten überschreiben?\n\nJA = CSV überschreibt bestehende Werte\nNEIN = CSV ergänzt nur (keine Löschung)',
      ui.ButtonSet.YES_NO
    );

    const overwriteMode = modeResponse === ui.Button.YES;

    SpreadsheetApp.getActive().toast('Importiere CSV...', '📥 Import', 5);

    const collectedCardsData = getScriptPropertiesData('collectedCardsData', {});
    const touchedSets = new Set();
    const unknownSets = new Set();
    const invalidSets = new Set();
    let importedRows = 0;
    let updatedCards = 0;
    let invalidRows = 0;
    let unknownCards = 0;
    const unknownSamples = []; // keep examples for diagnostics

    // Cache Set-Sheets und Card-IDs
    // WICHTIG: Durchsuche alle Sheets und baue Set-ID-Mapping aus Notes auf
    const setSheetMap = new Map(); // setId -> sheet
    const cardIdSetMap = new Map(); // setId -> Set<cardId>
    Logger.log(`CSV Import: Starting to build set cache from all sheets`);
    
    const allSheets = ss.getSheets();
    const setIdToSheetMap = new Map(); // Erstelle zuerst ein Map von allen Sheets
    
    for (const sheet of allSheets) {
      const sheetName = sheet.getName();
      if (sheetName === 'Sets Overview' || sheetName === 'Collection Summary') {
        continue;
      }
      
      // Lese Set-ID aus Note
      const noteText = sheet.getRange(1, 1).getNote() || '';
      let setId = sheetName; // Fallback zu Sheet-Name
      
      if (noteText.startsWith('Set ID: ')) {
        setId = noteText.substring('Set ID: '.length).trim();
      }
      
      Logger.log(`CSV Import: Found sheet "${sheetName}" with Set ID: "${setId}"`);
      setIdToSheetMap.set(setId, sheet);
    }
    
    // Vorab: bringe die Übersicht in einen aktuellen Zustand – so haben wir immer
    // eine chance, fehlende Sets direkt anzulegen, falls sie in der CSV auftauchen.
    try {
      populateSetsOverview();
    } catch (e) {
      Logger.log(`CSV Import: Fehler beim Vorab-Update der Übersicht: ${e.message}`);
    }

    // Nun durchsuche die CSV-Zeilen nach benötigten Set-IDs
    const neededSetIds = new Set();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 6) continue;
      const setId = String(row[0] || '').trim();
      if (setId) neededSetIds.add(setId);
    }
    
    // Lade die benötigten Set-IDs in Cache
    for (const setId of neededSetIds) {
      if (setSheetMap.has(setId)) continue; // Bereits gecacht
      
      const sheet = setIdToSheetMap.get(setId);
      if (!sheet) {
        Logger.log(`CSV Import: Set sheet not gefunden (noch) für: ${setId}`);
        unknownSets.add(setId);
        continue;
      }
      
      const cardIdSet = getCardIdSetFromSheet(sheet);
      setSheetMap.set(setId, sheet);
      cardIdSetMap.set(setId, cardIdSet);
      Logger.log(`CSV Import: Cached ${setId} with ${cardIdSet.size} cards`);
    }

    Logger.log(`CSV Import: Set cache built. Sets: ${setSheetMap.size}, Unknown: ${unknownSets.size}, Invalid: ${invalidSets.size}. Sheets available: ${setIdToSheetMap.size}`);

    let hasLoggedFirstRow = false;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 6) {
        Logger.log(`CSV Data Row ${i}: Skipped (too short). Row: ${row ? JSON.stringify(row) : 'null'}`);
        continue;
      }

      // CSV-Spalten: Set(0), SetName(1), CardNumber(2), CardName(3), Normal(4), ReverseHolo(5)
      const setId = String(row[0] || '').trim();
      const rawCardNumber = String(row[2] || '').trim();  // Spalte 2 = CardNumber in CSV
      const cardNumber = normalizeCardNumber(rawCardNumber);
      
      // Debug erste Kartenzelle
      if (i === 2 && !hasLoggedFirstRow) {
        Logger.log(`CSV Import: First data row. ROW=${JSON.stringify(row.slice(0, 6))}. setId=${setId}, rawCardNumber=${rawCardNumber}, normalized=${cardNumber}`);
        hasLoggedFirstRow = true;
      }
      
      if (!setId || !cardNumber) {
        Logger.log(`CSV Data Row ${i}: Skipped (empty setId or cardNumber). setId=${setId}, raw=${rawCardNumber}, normalized=${cardNumber}`);
        invalidRows++;
        continue;
      }

      if (!setSheetMap.has(setId)) {
        Logger.log(`CSV Data Row ${i}: Set not in cache: ${setId} – versuche automatischen Import`);
        // aktualisiere Übersicht in der Hoffnung, dass das Set dort auftaucht
        try {
          populateSetsOverview();
        } catch (e) {
          Logger.log(`CSV Import: Fehler beim refresh der Übersicht vor Import von ${setId}: ${e.message}`);
        }
        try {
          populateCardsForSet(setId);
          Logger.log(`CSV Import: Automatisches Erzeugen/Import des Sets ${setId} erfolgreich`);
        } catch (e) {
          Logger.log(`CSV Import: Automatischer Import von ${setId} schlug fehl: ${e.message}`);
          unknownSets.add(setId);
          continue;
        }
        // ziehe neu erstelltes Blatt in den Cache
        const newSheet = ss.getSheets().find(s => s.getRange(1,1).getNote() === `Set ID: ${setId}`);
        if (newSheet) {
          const cardIdSet = getCardIdSetFromSheet(newSheet);
          setSheetMap.set(setId, newSheet);
          cardIdSetMap.set(setId, cardIdSet);
          Logger.log(`CSV Import: ${setId} nach automatischem Import gecacht (${cardIdSet.size} Karten)`);
        } else {
          Logger.log(`CSV Import: Sheet nach Import von ${setId} nicht gefunden, markiere als unbekannt.`);
          unknownSets.add(setId);
          continue;
        }
      }

      const normalParsed = parseCsvBoolean(row[4]);
      const reverseParsed = parseCsvBoolean(row[5]);
      if (normalParsed === null || reverseParsed === null) {
        Logger.log(`CSV Data Row ${i}: Invalid boolean values. Normal=${row[4]}, ReverseHolo=${row[5]}`);
        invalidRows++;
        continue;
      }

      const normalizedNormal = normalParsed || reverseParsed;
      const normalizedReverse = reverseParsed && normalizedNormal;

      const cardIdSet = cardIdSetMap.get(setId);
      if (cardIdSet && !cardIdSet.has(cardNumber)) {
        Logger.log(`CSV Data Row ${i}: Card not in set. Set=${setId}, Card=${cardNumber}. Available: ${Array.from(cardIdSet).slice(0, 5).join(', ')}...`);
        if (unknownSamples.length < 10) {
          unknownSamples.push({row:i, setId:setId, cardNumber:cardNumber, cardIdSetSize: cardIdSet.size, cardIdSetSample: Array.from(cardIdSet).slice(0,5)});
        }
        unknownCards++;
        continue;
      }

      if (!collectedCardsData[setId]) collectedCardsData[setId] = {};
      if (!collectedCardsData[setId][cardNumber]) collectedCardsData[setId][cardNumber] = { g: false, rh: false };

      const before = JSON.stringify(collectedCardsData[setId][cardNumber]);

      if (overwriteMode) {
        collectedCardsData[setId][cardNumber].g = normalizedNormal;
        collectedCardsData[setId][cardNumber].rh = normalizedReverse;
      } else {
        if (normalizedNormal) collectedCardsData[setId][cardNumber].g = true;
        if (normalizedReverse) collectedCardsData[setId][cardNumber].rh = true;
      }

      const after = JSON.stringify(collectedCardsData[setId][cardNumber]);
      if (before !== after) {
        updatedCards++;
        Logger.log(`CSV Data Row ${i}: Updated ${setId}/${cardNumber}. Before: ${before}, After: ${after}`);
      }

      touchedSets.add(setId);
      importedRows++;
    }
    
    Logger.log(`CSV Import: Processing complete. Imported=${importedRows}, Updated=${updatedCards}, Invalid=${invalidRows}, Unknown Cards=${unknownCards}, Unknown Sets=${unknownSets.size}`);

    setScriptPropertiesData('collectedCardsData', collectedCardsData);

    // UI für betroffene Sets aktualisieren
    touchedSets.forEach(setId => {
      const sheet = ss.getSheetByName(setId);
      if (!sheet) return;
      try {
        const setCollectedData = collectedCardsData[setId] || {};
        applyCollectedDataToSetSheet(setId, sheet, setCollectedData);
        const counts = countCollectedCards(setCollectedData);
        updateSetSheetHeaderSummary(sheet, setId, counts.collectedCount, counts.reverseHoloCount);

        // die zugehörige Zeile in der Sets-Übersicht anpassen wie es ein Import-Checkbox-Trigger täte
        try {
          updateSetsOverviewRowAfterCardImport(setId, null, null, sheet);
        } catch (ignored) {
          // falls etwas schiefgeht (z.B. Übersicht existiert noch nicht), ignorieren
        }
      } catch (e) {
        Logger.log(`CSV Import UI-Update Fehler für Set ${setId}: ${e.message}`);
      }
    });

    // Zusammenfassung neu berechnen (wird normalerweise durch Trigger erledigt)
    updateCollectionSummary();

    // Falls unbekannte Sets auftauchen, weisen wir den Benutzer hin und aktualisieren die Übersicht
    if (unknownSets.size > 0) {
      const unknownList = Array.from(unknownSets).join(', ');
      ui.alert('⚠️ Unbekannte Sets',
               `Die CSV enthält Einträge für Sets, die derzeit nicht in der "Sets Overview" vorhanden sind:\n${unknownList}\n\nDie Übersicht wird jetzt aktualisiert. Anschließend werden fehlende Set-Blätter automatisch erzeugt.`,
               ui.ButtonSet.OK);
      try {
        populateSetsOverview();
      } catch (e) {
        Logger.log(`Fehler beim Aktualisieren der Sets-Übersicht nach CSV-Import: ${e.message}`);
      }

      // Erstelle fehlende Set-Blätter automatisch
      for (const setId of unknownSets) {
        try {
          Logger.log(`CSV Import: Versuche automatisches Erzeugen / Importieren von Set ${setId}`);
          populateCardsForSet(setId);
          touchedSets.add(setId);
        } catch (e) {
          Logger.log(`CSV Import: Fehler beim automatischen Import von Set ${setId}: ${e.message}`);
          // Wenn populateCardsForSet scheitert, setzen wir das Set weiterhin auf unbekannt; der Nutzer muss es manuell importieren.
        }
      }
    } else {
      // auch ohne unbekannte Sets bringt ein Update keine Nachteile und stellt sicher, dass
      // Abkürzungen/Hyperlinks etc. aktuell sind
      try {
        populateSetsOverview();
      } catch (e) {
        Logger.log(`Fehler beim Aktualisieren der Sets-Übersicht nach CSV-Import: ${e.message}`);
      }
    }

    // wenn wir die Übersicht erneuert haben, in seltenen Fällen nochmals die Sammlung
    // zusammenfassen, damit Abkürzungen aus der Übersicht einfließen
    updateCollectionSummary();

    const resultParts = [
      `Zeilen verarbeitet: ${importedRows}`,
      `Karten aktualisiert: ${updatedCards}`,
      `Ungültige Zeilen: ${invalidRows}`,
      `Unbekannte Karten: ${unknownCards}`
    ];

    // debugging info for unknown cards
    if (unknownSamples.length > 0) {
      resultParts.push(`
Beispiele für nicht erkannte Karten (max 10):`);
      unknownSamples.forEach(s => {
        resultParts.push(`Row ${s.row}: Set=${s.setId}, Card="${s.cardNumber}" (sheet had ${s.cardIdSetSize} entries, sample: ${s.cardIdSetSample.join(', ')})`);
      });
    }
    if (unknownSets.size > 0) {
      resultParts.push(`Unbekannte Sets: ${Array.from(unknownSets).slice(0, 10).join(', ')}${unknownSets.size > 10 ? '…' : ''}`);
    }
    if (invalidSets.size > 0) {
      resultParts.push(`Ungültige Set-Sheets: ${Array.from(invalidSets).slice(0, 10).join(', ')}${invalidSets.size > 10 ? '…' : ''}`);
    }

    // Speichere Log-Zusammenfassung
    const userProperties = PropertiesService.getUserProperties();
    const logSummary = `[${new Date().toLocaleTimeString('de-DE')}] CSV Import\n${resultParts.join('\n')}\n\n` + 
                       (userProperties.getProperty('recentLogs') || '').substring(0, 1000);
    userProperties.setProperty('recentLogs', logSummary);

    SpreadsheetApp.getActive().toast('CSV-Import abgeschlossen', '✅ Fertig', 5);
    ui.alert('CSV-Import abgeschlossen', resultParts.join('\n'), ui.ButtonSet.OK);
  } catch (error) {
    Logger.log(`Fehler beim CSV-Import: ${error.message}`);
    ui.alert(`Fehler beim CSV-Import: ${error.message}`);
  }
}

/**
 * Wendet gesammelte Karten-Daten auf ein Set-Blatt an.
 * 
 * @function applyCollectedDataToSetSheet
 * @param {string} setId - Set-ID
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Set-Blatt
 * @param {Object} setCollectedData - Gesammelte Daten für das Set
 */
function applyCollectedDataToSetSheet(setId, sheet, setCollectedData) {
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < SET_SHEET_HEADER_ROWS + 1) return;

  const maxBlocks = Math.ceil((lastRow - SET_SHEET_HEADER_ROWS) / CARD_BLOCK_HEIGHT_ROWS);

  for (let gridRowIndex = 0; gridRowIndex < maxBlocks; gridRowIndex++) {
    const startSheetRow = SET_SHEET_HEADER_ROWS + 1 + gridRowIndex * CARD_BLOCK_HEIGHT_ROWS;
    if (startSheetRow > lastRow) break;

    for (let gridColIndex = 0; gridColIndex < CARDS_PER_ROW_IN_GRID; gridColIndex++) {
      const startSheetCol = 1 + gridColIndex * CARD_BLOCK_WIDTH_COLS;
      const cardIdValue = sheet.getRange(startSheetRow, startSheetCol).getValue();
      if (!cardIdValue) continue;

      const cardId = normalizeCardNumber(String(cardIdValue));
      const status = setCollectedData[cardId] || { g: false, rh: false };

      const gCell = sheet.getRange(startSheetRow + 2, startSheetCol);
      const rhCell = sheet.getRange(startSheetRow + 2, startSheetCol + 1);

      gCell.setValue(!!status.g);
      if (status.g) {
        rhCell.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
        rhCell.setValue(!!status.rh);
      } else {
        rhCell.setDataValidation(null);
        rhCell.setValue(false);
      }

      const blockColor = status.rh ? REVERSE_HOL_COLLECTED_COLOR : (status.g ? COLLECTED_COLOR : null);
      sheet.getRange(startSheetRow, startSheetCol, 3, CARD_BLOCK_WIDTH_COLS).setBackground(blockColor);
    }
  }
}

/**
 * Liest alle Kartennummern aus einem Set-Grid.
 * 
 * @function getCardIdsFromSetSheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Set-Blatt
 * @returns {string[]} Liste normalisierter Kartennummern
 */
function getCardIdsFromSetSheet(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < SET_SHEET_HEADER_ROWS + 1) return [];

  const totalColsNeeded = CARDS_PER_ROW_IN_GRID * CARD_BLOCK_WIDTH_COLS;
  const numRows = lastRow - SET_SHEET_HEADER_ROWS;
  const values = sheet.getRange(SET_SHEET_HEADER_ROWS + 1, 1, numRows, totalColsNeeded).getValues();
  const cardIds = [];

  for (let r = 0; r < values.length; r += CARD_BLOCK_HEIGHT_ROWS) {
    for (let c = 0; c < totalColsNeeded; c += CARD_BLOCK_WIDTH_COLS) {
      const raw = values[r][c];
      if (!raw) continue;
      cardIds.push(normalizeCardNumber(String(raw)));
    }
  }

  return cardIds;
}

/**
 * Erstellt ein Set für schnelle Card-ID Lookups.
 * 
 * @function getCardIdSetFromSheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Set-Blatt
 * @returns {Set<string>} Set normalisierter Kartennummern
 */
function getCardIdSetFromSheet(sheet) {
  return new Set(getCardIdsFromSetSheet(sheet));
}

/**
 * Parst CSV-Boolean-Werte robust.
 * 
 * @function parseCsvBoolean
 * @param {string} value - CSV-Wert
 * @returns {boolean|null} true/false oder null bei ungültigem Wert
 */
function parseCsvBoolean(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === '' || v === '0' || v === 'false') return false;
  if (v === '1' || v === 'true') return true;
  return null;
}

/**
 * Fallback CSV-Parser (manual line-by-line mit Quoted String Support).
 * 
 * @function parseCsvFallback
 * @param {string} csvContent - CSV-String
 * @returns {Array<Array<string>>} Geparste Zeilen
 */
function parseCsvFallback(csvContent) {
  if (!csvContent) return [];
  
  const rows = [];
  const lines = csvContent.split(/\r?\n/);
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    const row = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current || row.length > 0) {
      row.push(current.trim());
    }
    
    if (row.length > 0) {
      rows.push(row);
    }
  }
  
  return rows;
}

/**
 * Batch-Import: Importiert mehrere Sets auf einmal.
 * 
 * Features:
 * - Dialog für Set-ID Eingabe (kommasepariert)
 * - Fortschrittsanzeige mit ETA
 * - Fehlertoleranz (einzelne Sets können fehlschlagen)
 * 
 * @function batchImportSets
 */
function batchImportSets() {
  const ui = SpreadsheetApp.getUi();
  
  const response = ui.prompt(
    '📦 Batch-Import',
    'Geben Sie Set-IDs ein (kommasepariert):\\n\\nBeispiel: base1, base2, base3',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  
  const input = response.getResponseText().trim();
  if (!input) {
    ui.alert('❌ Fehler', 'Keine Set-IDs eingegeben.', ui.ButtonSet.OK);
    return;
  }
  
  // Parse Set-IDs
  const setIds = input.split(',').map(id => id.trim()).filter(id => id.length > 0);
  
  if (setIds.length === 0) {
    ui.alert('❌ Fehler', 'Keine gültigen Set-IDs gefunden.', ui.ButtonSet.OK);
    return;
  }
  
  // Bestätigung
  const confirmResponse = ui.alert(
    'Batch-Import starten?',
    `${setIds.length} Set(s) werden importiert:\\n${setIds.join(', ')}\\n\\nFortfahren?`,
    ui.ButtonSet.YES_NO
  );
  
  if (confirmResponse !== ui.Button.YES) {
    return;
  }
  
  // Import durchführen
  let successCount = 0;
  let failedSets = [];
  const startTime = Date.now();
  
  for (let i = 0; i < setIds.length; i++) {
    const setId = setIds[i];
    
    // Fortschritt berechnen
    const progress = Math.round(((i + 1) / setIds.length) * 100);
    const elapsed = Date.now() - startTime;
    const avgTimePerSet = elapsed / (i + 1);
    const remaining = (setIds.length - i - 1) * avgTimePerSet;
    const etaMinutes = Math.round(remaining / 60000);
    const etaSeconds = Math.round((remaining % 60000) / 1000);
    const etaText = etaMinutes > 0 ? `~${etaMinutes}min ${etaSeconds}s` : `~${etaSeconds}s`;
    
    SpreadsheetApp.getActive().toast(
      `Set ${i + 1}/${setIds.length} (${progress}%) - ${setId}\\nVerbleibende Zeit: ${etaText}`,
      '📦 Batch-Import',
      5
    );
    
    try {
      populateCardsForSet(setId);
      successCount++;
      Utilities.sleep(API_DELAY_MS + 500);
    } catch (error) {
      Logger.log(`Batch-Import: Fehler bei Set ${setId}: ${error.message}`);
      failedSets.push(setId);
    }
  }
  
  // Aktualisiere Übersichten
  populateSetsOverview();
  updateCollectionSummary();
  
  // Ergebnis anzeigen
  const resultMsg = failedSets.length > 0 
    ? `${successCount}/${setIds.length} Sets erfolgreich importiert.\\n\\nFehlgeschlagen: ${failedSets.join(', ')}`
    : `Alle ${successCount} Sets erfolgreich importiert!`;
  
  SpreadsheetApp.getActive().toast(resultMsg, '✅ Batch-Import abgeschlossen', 10);
  ui.alert('Batch-Import abgeschlossen', resultMsg, ui.ButtonSet.OK);
}

/**
 * Bulk-Edit: Markiert alle Karten eines Sets als gesammelt/nicht gesammelt.
 * 
 * @function bulkEditSet
 */
function bulkEditSet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const ui = SpreadsheetApp.getUi();
  
  // Prüfe ob aktuelles Sheet ein Set-Sheet ist
  const sheetName = sheet.getName();
  if (sheetName === 'Sets Overview' || sheetName === 'Collection Summary') {
    ui.alert('❌ Fehler', 'Bitte wechseln Sie zu einem Set-Sheet.', ui.ButtonSet.OK);
    return;
  }
  
  const setIdNote = sheet.getRange(1, 1).getNote();
  if (!setIdNote || !setIdNote.startsWith('Set ID: ')) {
    ui.alert('❌ Fehler', 'Kein gültiges Set-Sheet.', ui.ButtonSet.OK);
    return;
  }
  
  const setId = setIdNote.substring('Set ID: '.length);
  
  const response = ui.prompt(
    '✏️ Bulk-Edit',
    'Aktion auswählen:\n1 = Alle Normal markieren\n2 = Alle RH markieren\n3 = Beide markieren\n4 = Alle Normal entfernen\n5 = Alle RH entfernen\n6 = Alle entfernen\n\nGeben Sie eine Zahl ein:',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  
  const action = response.getResponseText().trim();
  
  const confirmResponse = ui.alert(
    'Bulk-Edit bestätigen',
    `Möchten Sie wirklich alle Karten in "${sheetName}" ändern?\nDies kann nicht rückgängig gemacht werden!`,
    ui.ButtonSet.YES_NO
  );
  
  if (confirmResponse !== ui.Button.YES) {
    return;
  }
  
  try {
    SpreadsheetApp.getActive().toast('Bulk-Edit läuft...', '✏️ In Arbeit', 5);
    
    // Lade aktuelle Sammlung-Daten
    const allCollectionData = getScriptPropertiesData('collectedCardsData') || {};
    if (!allCollectionData[setId]) {
      allCollectionData[setId] = {};
    }
    const collectedData = allCollectionData[setId];
    
    const cardIds = getCardIdsFromSetSheet(sheet);
    if (cardIds.length === 0) {
      ui.alert('ℹ️ Info', 'Keine Karten im Sheet gefunden.', ui.ButtonSet.OK);
      return;
    }
    
    let changedCount = 0;
    
    for (const cardId of cardIds) {
      if (!collectedData[cardId]) {
        collectedData[cardId] = { g: false, rh: false };
      }
      
      switch(action) {
        case '1': // Alle Normal markieren
          if (!collectedData[cardId].g) {
            collectedData[cardId].g = true;
            changedCount++;
          }
          break;
        case '2': // Alle RH markieren (impliziert Normal)
          if (!collectedData[cardId].g || !collectedData[cardId].rh) {
            collectedData[cardId].g = true;
            collectedData[cardId].rh = true;
            changedCount++;
          }
          break;
        case '3': // Beide markieren
          if (!collectedData[cardId].g || !collectedData[cardId].rh) {
            collectedData[cardId].g = true;
            collectedData[cardId].rh = true;
            changedCount++;
          }
          break;
        case '4': // Alle Normal entfernen (impliziert RH entfernen)
          if (collectedData[cardId].g || collectedData[cardId].rh) {
            collectedData[cardId].g = false;
            collectedData[cardId].rh = false;
            changedCount++;
          }
          break;
        case '5': // Alle RH entfernen
          if (collectedData[cardId].rh) {
            collectedData[cardId].rh = false;
            changedCount++;
          }
          break;
        case '6': // Alle entfernen
          if (collectedData[cardId].g || collectedData[cardId].rh) {
            collectedData[cardId].g = false;
            collectedData[cardId].rh = false;
            changedCount++;
          }
          break;
        default:
          ui.alert('❌ Fehler', 'Ungültige Auswahl.', ui.ButtonSet.OK);
          return;
      }
    }
    
    // Speichere Änderungen unter korrektem Key
    allCollectionData[setId] = collectedData;
    setScriptPropertiesData('collectedCardsData', allCollectionData);
    
    Logger.log(`Bulk-Edit: ${changedCount} Karten geändert für Set ${setId}`);
    Logger.log(`Gespeicherte Daten: ${JSON.stringify(collectedData).substring(0, 200)}`);
    
    applyCollectedDataToSetSheet(setId, sheet, collectedData);
    const counts = countCollectedCards(collectedData);
    updateSetSheetHeaderSummary(sheet, setId, counts.collectedCount, counts.reverseHoloCount);
    updateCollectionSummary();
    
    SpreadsheetApp.getActive().toast(`${changedCount} Karte(n) geändert!`, '✅ Fertig', 5);
    ui.alert('Bulk-Edit abgeschlossen', `${changedCount} Karte(n) wurden geändert.`, ui.ButtonSet.OK);
    
  } catch (error) {
    Logger.log(`Bulk-Edit Fehler: ${error.message}\nStack: ${error.stack}`);
    ui.alert('Fehler', `Bulk-Edit fehlgeschlagen: ${error.message}`, ui.ButtonSet.OK);
  }
}

/**
 * Simuliert ein Event-Objekt für Testzwecke und ruft `handleOnEdit()` auf.
 * Nützlich zum Debuggen der `handleOnEdit`-Funktion ohne tatsächliche Bearbeitung der Zelle.
 */
function debugOnEdit() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const ui = SpreadsheetApp.getUi();

  const cellResponse = ui.prompt(
    'Debug: handleOnEdit()',
    'Geben Sie die Zelle an, die Sie simulieren möchten (z.B. "A1" oder "C5").',
    ui.ButtonSet.OK_CANCEL
  );

  if (cellResponse.getSelectedButton() !== ui.Button.OK) {
    ui.alert("Debug abgebrochen.", "Debug-Ausführung von handleOnEdit() wurde abgebrochen.", ui.ButtonSet.OK);
    return;
  }
  const cellAddress = cellResponse.getResponseText().trim();

  let rangeToSimulate;
  try {
    rangeToSimulate = sheet.getRange(cellAddress);
  } catch (e) {
    ui.alert("Fehler", `Ungültige Zellenadresse: ${cellAddress}. Bitte versuchen Sie es erneut.`, ui.ButtonSet.OK);
    Logger.log(`Fehler bei debugOnEdit: Ungültige Zellenadresse "${cellAddress}" - ${e.stack}`);
    return;
  }

  const valueResponse = ui.prompt(
    'Debug: handleOnEdit()',
    `Geben Sie den Wert ein, der in Zelle ${cellAddress} simuliert werden soll (z.B. "TRUE", "FALSE", "Text").`,
    ui.ButtonSet.OK_CANCEL
  );

  if (valueResponse.getSelectedButton() !== ui.Button.OK) {
    ui.alert("Debug abgebrochen.", "Debug-Ausführung von handleOnEdit() wurde abgebrochen.", ui.ButtonSet.OK);
    return;
  }
  let simulatedValue = valueResponse.getResponseText();
  let simulatedOldValue = rangeToSimulate.getValue(); // Get current value as old value for simulation

  // Convert string "TRUE"/"FALSE" to boolean true/false for consistent testing
  if (typeof simulatedValue === 'string') {
    if (simulatedValue.toLowerCase() === 'true') {
      simulatedValue = true;
    } else if (simulatedValue.toLowerCase() === 'false') {
      simulatedValue = false;
    }
  }
  // Also ensure oldValue is treated as boolean if it was a checkbox
  if (typeof simulatedOldValue === 'string') {
    if (simulatedOldValue.toLowerCase() === 'true') {
      simulatedOldValue = true;
    } else if (simulatedOldValue.toLowerCase() === 'false') {
      simulatedOldValue = false;
    }
  }


  const dummyEvent = {
    range: rangeToSimulate,
    value: simulatedValue,
    oldValue: simulatedOldValue, // Pass the old value for simulation
    source: ss
  };

  try {
    Logger.log(`[debugOnEdit] Simuliere handleOnEdit() für Zelle: ${cellAddress}, Wert: ${simulatedValue} (type: ${typeof simulatedValue}), Alter Wert: ${simulatedOldValue} (type: ${typeof simulatedOldValue})`);
    handleOnEdit(dummyEvent);
    ui.alert("Debug: handleOnEdit()", `handleOnEdit() erfolgreich für Zelle ${cellAddress} mit Wert "${simulatedValue}" ausgeführt. Überprüfen Sie das Log für Details.`, ui.ButtonSet.OK);
  } catch (error) {
    Logger.log(`[debugOnEdit] FEHLER bei der Ausführung von handleOnEdit() im Debug-Modus: ${error.message} \nStack: ${error.stack}`);
    ui.alert("Fehler", `Fehler beim Ausführen von handleOnEdit() im Debug-Modus: ${error.message}. Details im Log.`, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Zeigt aktuelle Logs in einem Dialog an.
 * 
 * @function showLogs
 */
function showLogs() {
  const ui = SpreadsheetApp.getUi();
  
  try {
    // Aktuell gibt es keine native Log-Export-Funktion in Apps Script
    // Daher zeigen wir eine Anleitung
    const htmlOutput = HtmlService.createHtmlOutput(`
      <div style="font-family:Arial,sans-serif; padding:15px; line-height:1.6;">
        <h2>📋 Logs anzeigen</h2>
        
        <p><strong>Option 1: Apps Script Editor (einfach)</strong></p>
        <ol>
          <li>Öffne <strong>Erweiterungen → Apps Script</strong></li>
          <li>Klicke auf die <strong>Ausführungs-Protokoll</strong> (Uhr-Symbol)</li>
          <li>Wähle die aktuelle Ausführung</li>
          <li>Siehst du alle Log-Einträge</li>
        </ol>
        
        <p><strong>Option 2: Inline Log-Anzeige (aktuell läuft)</strong></p>
        <p>Der letzte CSV-Import hat diese Logs produziert:</p>
        
        <pre style="background:#f5f5f5; padding:10px; border-radius:5px; overflow-x:auto; max-height:400px; border:1px solid #ddd;">
${getRecentLogs()}
        </pre>
        
        <p style="font-size:12px; color:#666; margin-top:15px;">
          <strong>💡 Tipp:</strong> Nach jedem Import/Export werden Logs automatisch geschrieben. 
          Nutze die Apps Script Console für detaillierte Debugging-Infos.
        </p>
      </div>
    `).setWidth(600).setHeight(500);
    
    ui.showModalDialog(htmlOutput, '📋 Logs anzeigen');
  } catch (error) {
    ui.alert('Fehler', `Fehler beim Anzeigen der Logs: ${error.message}`, ui.ButtonSet.OK);
  }
}

/**
 * Liest die letzten Logs aus einer lokalen Property.
 * 
 * @function getRecentLogs
 * @returns {string} Die Logs
 */
function getRecentLogs() {
  const userProperties = PropertiesService.getUserProperties();
  const logs = userProperties.getProperty('recentLogs') || 'Keine Logs vorhanden. Führe einen Import/Export durch.';
  return logs;
}
/**
 * Migriert alte TCGdex-only Set-IDs (mit TCGDEX- Präfix) zu neuen pokemontcg.io IDs.
 * Wird während Setup aufgerufen, um sicherzustellen, dass Sets korrekt aktualisiert werden,
 * wenn sie von TCGdex-only zu regulären API-Sets übergehen.
 * 
 * Migrations-Logik:
 * - Überprüft alle Blätter nach alten TCGdex-präfix Noten (Set ID: TCGDEX-...)
 * - Sucht nach entsprechenden Blättern ohne Präfix
 * - Aktualisiert importedSetsStatus und andere PropertiesService-Daten
 * - Aktualisiert Blattnoten zu neuen IDs
 * 
 * @function migrateLegacyTcgdexSetIds
 * @throws {Error} Bei kritischen Fehlern während der Migration
 */
function migrateLegacyTcgdexSetIds() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const properties = PropertiesService.getScriptProperties();
  let importedSetsStatus = getScriptPropertiesData('importedSetsStatus', {});
  let allCollectedData = getScriptPropertiesData('collectedCardsData', {});
  let allCustomImageUrls = getScriptPropertiesData('customImageUrls', {});
  let migrationCount = 0;
  let sheetsChecked = 0;
  let importedStatusChanged = false;
  let collectedDataChanged = false;
  let customImageChanged = false;

  // Nur zu pokemontcg.io migrieren, wenn dort ein echtes Set existiert.
  let pokemontcgIoSets = [];
  if (UseVeraApi) {
    const pokemontcgIoResponse = fetchApiData(`${VTCG_BASE_URL}sets/${VeraApiLanguage}.json`, "Beim Laden der pokemontcg.io Sets für Migration");
    pokemontcgIoSets = pokemontcgIoResponse || [];
  } else {
    const pokemontcgIoResponse = fetchApiData(`${PTCG_BASE_URL}sets`, "Beim Laden der pokemontcg.io Sets für Migration");
    pokemontcgIoSets = pokemontcgIoResponse?.data || [];
  }

  const normalizedToCanonicalPokemontcgId = new Map();
  const canonicalPokemontcgSetIds = new Set();
  pokemontcgIoSets.forEach(set => {
    canonicalPokemontcgSetIds.add(set.id);
    const aliasCandidates = buildSetIdAliasCandidates(set.id);
    aliasCandidates.forEach(aliasId => {
      const normalized = normalizeSetId(String(aliasId).replace(/^TCGDEX-/i, ''));
      if (!normalizedToCanonicalPokemontcgId.has(normalized)) {
        normalizedToCanonicalPokemontcgId.set(normalized, set.id);
      }
    });
  });

  // Durchsuche alle Blätter nach alten TCGdex-only Set-IDs
  const allSheets = ss.getSheets();
  
  for (const sheet of allSheets) {
    const sheetName = sheet.getName();
    
    // Ignoriere spezielle Blätter
    if (sheetName === "Sets Overview" || sheetName === "Collection Summary") {
      continue;
    }
    
    sheetsChecked++;
    
    try {
      const noteCell = sheet.getRange(1, 1);
      const note = noteCell.getNote() || "";
      
      Logger.log(`[migrateLegacyTcgdexSetIds] Prüfe Blatt "${sheetName}": Notiz = "${note}"`);
      
      if (!note || !note.startsWith('Set ID: ')) {
        continue;
      }

      const oldSetId = note.substring('Set ID: '.length).trim();
      const targetSetId = resolveCanonicalSetIdFromMap(oldSetId, normalizedToCanonicalPokemontcgId, canonicalPokemontcgSetIds);

      // Nur migrieren, wenn es wirklich ein passendes pokemontcg.io Set gibt.
      if (!targetSetId) {
        Logger.log(`[migrateLegacyTcgdexSetIds] Skip "${sheetName}": "${oldSetId}" bleibt unverändert (kein passendes pokemontcg.io Set).`);
        continue;
      }

      if (oldSetId === targetSetId) {
        continue;
      }

      Logger.log(`[migrateLegacyTcgdexSetIds] MIGRATION DETECTED: "${oldSetId}" → "${targetSetId}"`);

      noteCell.setNote(`Set ID: ${targetSetId}`);
      migrationCount++;

      // importedSetsStatus migrieren
      if (importedSetsStatus[oldSetId]) {
        importedSetsStatus[targetSetId] = true;
        delete importedSetsStatus[oldSetId];
        importedStatusChanged = true;
      } else if (!importedSetsStatus[targetSetId]) {
        importedSetsStatus[targetSetId] = true;
        importedStatusChanged = true;
      }

      // collectedCardsData migrieren (Merge: Zielwerte haben Vorrang)
      if (allCollectedData[oldSetId]) {
        if (!allCollectedData[targetSetId]) {
          allCollectedData[targetSetId] = allCollectedData[oldSetId];
        } else {
          allCollectedData[targetSetId] = { ...allCollectedData[oldSetId], ...allCollectedData[targetSetId] };
        }
        delete allCollectedData[oldSetId];
        collectedDataChanged = true;
      }

      // customImageUrls migrieren
      if (allCustomImageUrls[oldSetId]) {
        if (!allCustomImageUrls[targetSetId]) {
          allCustomImageUrls[targetSetId] = allCustomImageUrls[oldSetId];
        } else {
          allCustomImageUrls[targetSetId] = { ...allCustomImageUrls[oldSetId], ...allCustomImageUrls[targetSetId] };
        }
        delete allCustomImageUrls[oldSetId];
        customImageChanged = true;
      }

      // Cardmarket-URLs migrieren
      const oldCardmarketKey = `pokemontcgIoCardmarketUrls_${oldSetId}`;
      const newCardmarketKey = `pokemontcgIoCardmarketUrls_${targetSetId}`;
      const oldCardmarketData = getScriptPropertiesData(oldCardmarketKey, null);
      const newCardmarketData = getScriptPropertiesData(newCardmarketKey, null);
      if (oldCardmarketData && !newCardmarketData) {
        setScriptPropertiesData(newCardmarketKey, oldCardmarketData);
      }
      if (oldCardmarketData) {
        properties.deleteProperty(oldCardmarketKey);
      }
    } catch (e) {
      Logger.log(`[Migration] Fehler beim Überprüfen von Blatt "${sheetName}": ${e.message}`);
      // Fortsetzen mit nächstem Blatt, nicht abbrechen
    }
  }
  
  if (collectedDataChanged) {
    setScriptPropertiesData('collectedCardsData', allCollectedData);
  }
  if (customImageChanged) {
    setScriptPropertiesData('customImageUrls', allCustomImageUrls);
  }

  // Speichere aktualisierte importedSetsStatus
  if (importedStatusChanged || migrationCount > 0) {
    setScriptPropertiesData('importedSetsStatus', importedSetsStatus);
  }
  
  Logger.log(`[migrateLegacyTcgdexSetIds] Abgeschlossen: ${sheetsChecked} Blätter geprüft, ${migrationCount} migriert`);
}

/**
 * Liest Checkbox-Zustände aus allen vorhandenen Set-Blättern und baut collectedCardsData
 * in den Script-Properties neu auf.
 *
 * Gedacht für die Migration einer alten Tabelle ohne persistente Daten:
 * - Checkbox-Häkchen im Sheet = Quelle der Wahrheit
 * - TCGdex-only Sets (Notiz "Set ID: TCGDEX-xxx") werden dabei direkt migriert
 * - Bestehende persistente Daten werden mit Sheet-Daten zusammengeführt
 *   (Sheet gewinnt bei Konflikten)
 *
 * @function rebuildPersistentDataFromSheets
 */
function rebuildPersistentDataFromSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  const confirm = ui.alert(
    '🔄 Persistente Daten aus Blättern wiederherstellen',
    'Diese Funktion liest alle Checkbox-Zustände aus den vorhandenen Set-Blättern und ' +
    'speichert sie in den Script-Properties.\n\n' +
    'Vorhandene Sammeldaten werden mit den Sheet-Daten zusammengeführt (Sheet hat Vorrang).\n' +
    'TCGdex-only Sets (TCGDEX-...) werden automatisch migriert.\n\n' +
    'Fortfahren?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  const properties = PropertiesService.getScriptProperties();
  let importedSetsStatus = getScriptPropertiesData('importedSetsStatus', {});
  let collectedCardsData = getScriptPropertiesData('collectedCardsData', {});

  // Für Migrationen: nur auf echte pokemontcg.io Set-IDs migrieren.
  let pokemontcgIoSets = [];
  if (UseVeraApi) {
    const pokemontcgIoResponse = fetchApiData(`${VTCG_BASE_URL}sets/${VeraApiLanguage}.json`, "Beim Laden der pokemontcg.io Sets für Wiederherstellung");
    pokemontcgIoSets = pokemontcgIoResponse || [];
  } else {
    const pokemontcgIoResponse = fetchApiData(`${PTCG_BASE_URL}sets`, "Beim Laden der pokemontcg.io Sets für Wiederherstellung");
    pokemontcgIoSets = pokemontcgIoResponse?.data || [];
  }

  const normalizedToCanonicalPokemontcgId = new Map();
  const canonicalPokemontcgSetIds = new Set();
  pokemontcgIoSets.forEach(set => {
    canonicalPokemontcgSetIds.add(set.id);
    const aliasCandidates = buildSetIdAliasCandidates(set.id);
    aliasCandidates.forEach(aliasId => {
      const normalized = normalizeSetId(String(aliasId).replace(/^TCGDEX-/i, ''));
      if (!normalizedToCanonicalPokemontcgId.has(normalized)) {
        normalizedToCanonicalPokemontcgId.set(normalized, set.id);
      }
    });
  });

  let setsProcessed = 0;
  let cardsCollected = 0;
  let setsSkipped = 0;
  let tcgdexMigrated = 0;

  for (const sheet of ss.getSheets()) {
    const sheetName = sheet.getName();
    if (sheetName === 'Sets Overview' || sheetName === 'Collection Summary') continue;

    try {
      let note = sheet.getRange(1, 1).getNote() || '';

      // --- Set-ID-Migration (mapping-aware): nur wenn es ein echtes pokemontcg.io Zielset gibt ---
      if (note.startsWith('Set ID: ')) {
        const oldId = note.substring('Set ID: '.length).trim();
        const targetSetId = resolveCanonicalSetIdFromMap(oldId, normalizedToCanonicalPokemontcgId, canonicalPokemontcgSetIds);

        if (targetSetId && oldId !== targetSetId) {
          sheet.getRange(1, 1).setNote(`Set ID: ${targetSetId}`);
          note = `Set ID: ${targetSetId}`;

          if (collectedCardsData[oldId]) {
            if (!collectedCardsData[targetSetId]) collectedCardsData[targetSetId] = {};
            Object.assign(collectedCardsData[targetSetId], collectedCardsData[oldId]);
            delete collectedCardsData[oldId];
          }

          if (importedSetsStatus[oldId]) {
            importedSetsStatus[targetSetId] = true;
            delete importedSetsStatus[oldId];
          }

          const oldCmKey = `pokemontcgIoCardmarketUrls_${oldId}`;
          const newCmKey = `pokemontcgIoCardmarketUrls_${targetSetId}`;
          const cmData = getScriptPropertiesData(oldCmKey, null);
          if (cmData) {
            setScriptPropertiesData(newCmKey, cmData);
            properties.deleteProperty(oldCmKey);
          }

          tcgdexMigrated++;
          Logger.log(`[rebuildPersistentDataFromSheets] Set-ID migriert: ${oldId} → ${targetSetId}`);
        }
      }

      if (!note.startsWith('Set ID: ')) {
        Logger.log(`[rebuildPersistentDataFromSheets] Überspringe "${sheetName}": keine Set-ID-Notiz`);
        setsSkipped++;
        continue;
      }

      const setId = note.substring('Set ID: '.length).trim();

      // Als importiert markieren + Sentinel anlegen
      importedSetsStatus[setId] = true;
      if (!collectedCardsData[setId]) collectedCardsData[setId] = {};

      // --- Checkbox-Zustände aus Sheet lesen ---
      const lastRow = sheet.getLastRow();
      if (lastRow <= SET_SHEET_HEADER_ROWS) {
        setsProcessed++;
        continue; // Leeres Sheet
      }

      const dataRows = lastRow - SET_SHEET_HEADER_ROWS;
      const totalCols = CARDS_PER_ROW_IN_GRID * CARD_BLOCK_WIDTH_COLS;
      // Alles in einem Aufruf lesen (effizient)
      const vals = sheet.getRange(SET_SHEET_HEADER_ROWS + 1, 1, dataRows, totalCols).getValues();

      for (let rowBlock = 0; rowBlock * CARD_BLOCK_HEIGHT_ROWS < dataRows; rowBlock++) {
        for (let colBlock = 0; colBlock < CARDS_PER_ROW_IN_GRID; colBlock++) {
          const br = rowBlock * CARD_BLOCK_HEIGHT_ROWS;  // offset in vals[]
          const bc = colBlock * CARD_BLOCK_WIDTH_COLS;
          if (br >= dataRows) break;

          const rawId = String(vals[br][bc] || '').trim();
          if (!rawId) continue;
          const cardId = normalizeCardNumber(rawId);

          const checkRow = br + 2;
          if (checkRow >= dataRows) continue;

          const toBoolean = v => v === true || String(v).toLowerCase() === 'true';
          const g  = toBoolean(vals[checkRow][bc]);
          const rh = toBoolean(vals[checkRow][bc + 1]);

          if (g || rh) {
            // Sheet-Daten überschreiben persistente Daten (Sheet = Quelle der Wahrheit)
            collectedCardsData[setId][cardId] = { g, rh };
            cardsCollected++;
          } else {
            // Eintrag entfernen wenn nichts gesammelt (Cleanup)
            delete collectedCardsData[setId][cardId];
          }
        }
      }

      setsProcessed++;
      Logger.log(`[rebuildPersistentDataFromSheets] "${setId}": ${Object.keys(collectedCardsData[setId]).length} gesammelte Karten`);

    } catch (err) {
      Logger.log(`[rebuildPersistentDataFromSheets] FEHLER bei "${sheetName}": ${err.message}`);
      setsSkipped++;
    }
  }

  setScriptPropertiesData('collectedCardsData', collectedCardsData);
  setScriptPropertiesData('importedSetsStatus', importedSetsStatus);

  ui.alert(
    '✅ Wiederherstellung abgeschlossen',
    `Sets verarbeitet:  ${setsProcessed}\n` +
    `Karten wiederhergestellt:  ${cardsCollected}\n` +
    `TCGdex-Sets migriert:  ${tcgdexMigrated}\n` +
    `Übersprungen:  ${setsSkipped}`,
    ui.ButtonSet.OK
  );
}
