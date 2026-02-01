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
  "swsh45": "swsh4.5"
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

/** @const {number} Spalte für "Alle Sets sortieren" Header-Checkbox (Spalte G) */
const SUMMARY_SORT_CHECKBOX_COL = 7;

// ============================================================================
// GLOBALE VARIABLEN - Skript-Status
// ============================================================================

/** @var {number} Timeout für LockService in Millisekunden (30 Sekunden) */
var USER_LOCK_TIMEOUT_MS = 30 * 1000;

/** @var {boolean} Flag zur Verhinderung rekursiver Trigger */
var isScriptEditing = false;

/**
 * @fileoverview Dieses Skript verwaltet Pokémon-Kartensammlungen in Google Sheets.
 * Es verwendet externe APIs (pokemontcg.io und TCGDex), um Kartendaten abzurufen und anzuzeigen.
 * Funktionen umfassen:
 * - Abrufen und Speichern von Set-Informationen.
 * - Suchen und Anzeigen von Karten für ein ausgewähltes Set.
 * - Aktualisieren des Sammlungsstatus von Karten.
 * - Generierung von UI-Elementen (Menüs, Checkboxen, Links).
 * - Debugging-Funktionen.
 */

/**
 * Erstellt das benutzerdefinierte Menü in der Google Tabelle, wenn diese geöffnet wird.
 * Dieses Menü bietet Zugriff auf alle Hauptfunktionen des Pokémon TCG Trackers.
 */

/*
function onOpen() {
  const ui = SpreadsheetApp.getUi(); // Holt die Benutzeroberfläche der Tabelle.
  ui.createMenu('Pokémon TCG Tracker') // Erstellt ein neues Menü mit dem Namen 'Pokémon TCG Tracker'.
    .addItem('▶️ Funktionen Sidebar öffnen', 'openCustomSidebar') // Menüpunkt zum Öffnen des Sidebars.
    .addSeparator() // Fügt eine Trennlinie im Menü hinzu.
    .addItem('1. Setup & Sets importieren', 'setupAndImportAllSets') // Menüpunkt zum Einrichten und Importieren aller Sets.
    .addItem('2. Karten für Set importieren (Raster)', 'promptAndPopulateCardsForSet') // Menüpunkt zum Importieren von Karten für ein spezifisches Set.
    .addItem('3. Sammlungsübersicht aktualisieren', 'updateCollectionSummary') // Menüpunkt zum manuellen Aktualisieren der Sammlungsübersicht.
    .addItem('4. Alle Karten aktualisieren (Raster)', 'updateAllCardSheets') // Menüpunkt zum Aktualisieren aller Kartenblätter.
    .addSeparator() // Fügt eine Trennlinie im Menü hinzu.
    .addItem('5. Sortier-Trigger installieren', 'installSortTrigger') // Menüpunkt zum Installieren eines automatischen Sortier-Triggers.
    .addItem('6. Alle Set-Blätter manuell sortieren', 'manualSortAllSheets') // Menüpunkt zum manuellen Sortieren aller Set-Blätter.
    .addItem('7. Aktuelles Set-Blatt sortieren', 'manualSortCurrentSheet') // Menüpunkt zum manuellen Sortieren des aktuell geöffneten Set-Blattes.
    .addSeparator() // Fügt eine Trennlinie im Menü hinzu.
    .addItem('8. Aktuelles Set löschen', 'deleteCurrentSet') // Menüpunkt zum Löschen des aktuell geöffneten Sets und seiner Daten.
    .addItem('9. Sortier-Trigger deinstallieren', 'uninstallSortTrigger') // Menüpunkt zum Deinstallieren des automatischen Sortier-Triggers.
    .addItem('10. Alle persistenten Daten löschen', 'deleteAllPersistentData') // Menüpunkt zum unwiderruflich Löschen aller gespeicherten Daten.
    .addItem('Debug: onEdit() ausführen', 'debugOnEdit') // Debug-Menüpunkt zum Simulieren eines onEdit-Events.
    .addToUi(); // Zeigt das Menü in der Tabelle an.
}
*/
function onOpen() {
  const ui = SpreadsheetApp.getUi(); // Holt die Benutzeroberfläche der Tabelle.

  ui.createMenu('Pokémon TCG Tracker')
    // --- Hauptnavigation ---
    //.addItem('▶️ Sidebar öffnen', 'openCustomSidebar')
    //.addSeparator()

    // --- Import & Daten (Schritt 1 & 2) ---
    .addItem('1. Sets-Liste laden (Setup)', 'setupAndImportAllSets')
    .addItem('2. Einzelnes Set hinzufügen', 'promptAndPopulateCardsForSet')
    .addSeparator()

    // --- Aktualisierung & Statistik ---
    .addItem('📊 Sammlungs-Statistik aktualisieren', 'updateCollectionSummary')
    .addItem('🔄 Alle Sets neu laden (Langsam!)', 'updateAllCardSheets')
    .addSeparator()

    // --- Sortierung ---
    .addItem('🗂️ Aktuelles Set sortieren', 'manualSortCurrentSheet')
    .addItem('🗂️ Alle Sets sortieren', 'manualSortAllSheets')
    // Trigger in ein Untermenü, da man sie selten ändert
    .addSubMenu(ui.createMenu('⚙️ Auto-Sortierung')
      .addItem('Aktivieren (Trigger installieren)', 'installSortTrigger')
      .addItem('Deaktivieren (Trigger entfernen)', 'uninstallSortTrigger'))
    .addSeparator()

    // --- Verwaltung / Gefahr ---
    .addItem('🗑️ Aktuelles Set löschen', 'deleteCurrentSet')
    .addItem('⚠️ Komplett-Reset (Alle Daten löschen)', 'deleteAllPersistentData')
    .addSeparator()

    // --- Entwicklung ---
    .addItem('🐞 Debug: onEdit testen', 'debugOnEdit')
    .addToUi();
}

/**
 * Normalisiert einen String, indem er in Kleinbuchstaben umgewandelt und Leerzeichen sowie Sonderzeichen entfernt werden.
 * Dies ist nützlich für den Abgleich von Set-Namen aus verschiedenen APIs.
 * @param {string} str Der zu normalisierende String.
 * @returns {string} Der normalisierte String.
 */
function normalizeString(str) {
  if (str === null || typeof str === 'undefined') {
    return "";
  }
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Normalisiert eine Set-ID für den Abgleich zwischen verschiedenen APIs.
 * Entfernt führende Nullen in numerischen Teilen und ersetzt '.' durch 'pt', falls nicht bereits geschehen.
 * Außerdem ersetzt es ' ' durch '-' und entfernt andere Sonderzeichen.
 * Beispiel: "sv08.5" wird zu "sv8pt5", "Base Set" wird zu "baseset".
 * @param {string} setId Die zu normalisierende Set-ID.
 * @returns {string} Die normalisierte Set-ID.
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
 * Normalisiert eine Kartennummer, indem führende Nullen aus dem numerischen Teil entfernt werden.
 * Dies ist entscheidend, um Konsistenz zwischen TCGDex (die oft führende Nullen hat) und
 * pokemontcg.io (die oft keine hat) herzustellen und korrekte Lookups in gespeicherten Daten zu ermöglichen.
 * Beispiel: "sv10-001" wird zu "sv10-1", "XY005" wird zu "XY5".
 * @param {string} cardNumber Die zu normalisierende Kartennummer.
 * @returns {string} Die normalisierte Kartennummer.
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


/**
 * Ruft Daten von einer externen API ab.
 * Implementiert eine einfache Ratenbegrenzung, um Überlastung zu vermeiden.
 * @param {string} url Die URL der API-Anfrage.
 * @returns {Object|null} Das geparste JSON-Antwortobjekt oder null bei einem Fehler.
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
 * Hilfsfunktion zum Abrufen von Daten von einer externen API.
 * Behandelt HTTP-Fehler und JSON-Parsing-Fehler.
 * @param {string} url Der URL des API-Endpunkts.
 * @param {string} errorMessagePrefix Der Präfix für Fehlermeldungen, die im UI angezeigt werden.
 * @returns {object|null} Das geparste JSON-Objekt oder null im Fehlerfall.
 */
function fetchApiData(url, errorMessagePrefix) {
  const ui = SpreadsheetApp.getUi(); // Holt die Benutzeroberfläche der Tabelle.
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
 * Hilfsfunktion zum Laden der Kartendaten für ein Set (TCGDex oder pokemontcg.io).
 * @param {string} setId Die Set-ID (pokemontcg.io ID oder TCGDex-only ID).
 * @param {string} setName Der Name des Sets für Logging.
 * @param {Array<object>} tcgdexAllSets Liste aller TCGDex Sets für Matching.
 * @returns {{allCards: Array, cardmarketData: Object, tcgdexDetailedSet: Object|null, pokemontcgDetailedSet: Object|null}} Objekt mit Kartendaten.
 */
function loadCardsForSet(setId, setName, tcgdexAllSets) {
  let allCards = [];
  let cardmarketData = {};
  let tcgdexDetailedSet = null;
  let pokemontcgDetailedSet = null;

  const isTcgdexOnlySet = setId.startsWith('TCGDEX-');

  if (isTcgdexOnlySet) {
    const tcgdexActualSetId = setId.substring('TCGDEX-'.length);
    tcgdexDetailedSet = fetchApiData(`${TCGDEX_BASE_URL}sets/${tcgdexActualSetId}`, `Fehler beim Laden der TCGDex Karten für ${setName}`);
    
    if (tcgdexDetailedSet && tcgdexDetailedSet.cards) {
      allCards = tcgdexDetailedSet.cards.map(card => ({
        number: normalizeCardNumber(card.localId || card.id),
        name: card.name,
        images: { small: card.image ? `${card.image}/low.jpg` : null },
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
        if (tcgdexCard.image) mergedCard.images = { small: `${tcgdexCard.image}/low.jpg` };
        if (tcgdexCard.description) {
          mergedCard.rules = [tcgdexCard.description];
          mergedCard.flavorText = tcgdexCard.description;
        }
      }
      return mergedCard;
    });

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
 * Hilfsfunktion zum Finden eines passenden TCGDex-Sets basierend auf pokemontcg.io Set-Daten.
 * Verwendet eine mehrstufige Strategie für eine robuste Zuordnung.
 * @param {object} pokemontcgIoSet Das pokemontcg.io Set-Objekt.
 * @param {Array<object>} allTcgdexSets Eine Liste aller TCGDex Set-Objekte.
 * @returns {object|null} Das passende TCGDex Set-Objekt oder null, wenn keines gefunden wird.
 */
function findMatchingTcgdexSet(pokemontcgIoSet, allTcgdexSets) {
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


/**
 * Ruft die gespeicherten Set-Daten aus den Skripteigenschaften ab.
 * @returns {Array<Object>} Eine Liste von Set-Objekten.
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

/**
 * Initialisiert die grundlegende Struktur der Google Tabelle.
 * Diese Funktion erstellt die Blätter "Sets Overview" und "Collection Summary" falls sie nicht existieren,
 * setzt deren Kopfzeilen, friert die erste Zeile ein und passt Spaltenbreiten an.
 * Sie löscht KEINE bestehenden Daten in diesen Blättern.
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

  // "Alle Sets sortieren" Checkbox in "Collection Summary" (Zeile 1, Spalte G)
  const sortAllCheckboxRange = summarySheet.getRange(SUMMARY_TITLE_ROW, SUMMARY_SORT_CHECKBOX_COL);
  sortAllCheckboxRange.setValue(false);
  sortAllCheckboxRange.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  sortAllCheckboxRange.setHorizontalAlignment("center").setVerticalAlignment("middle").setBackground("#D9D9D9"); // Gleicher Hintergrund wie Titel
  sortAllCheckboxRange.setNote("Klicken Sie hier, um die Sammlungsübersicht zu aktualisieren."); // ANPASSUNG: Notiz aktualisiert

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
 * Hilfsfunktion zum sicheren Parsen von JSON-Daten aus ScriptProperties.
 * @param {string} key Der Schlüssel der Eigenschaft.
 * @param {object} defaultValue Der Standardwert, wenn die Eigenschaft nicht existiert oder ungültig ist.
 * @returns {object} Das geparste Objekt oder der Standardwert.
 */
function getScriptPropertiesData(key, defaultValue = {}) {
  const scriptProperties = PropertiesService.getScriptProperties(); // Holt den PropertiesService.
  const data = scriptProperties.getProperty(key); // Holt die Eigenschaft anhand des Schlüssels.
  try {
    return data ? JSON.parse(data) : defaultValue; // Parst JSON oder gibt Standardwert zurück.
  } catch (e) {
    Logger.log(`Fehler beim Parsen der Eigenschaft '${key}': ${e.message}. Verwende Standardwert.`);
    return defaultValue;
  }
}

/**
 * Hilfsfunktion zum sicheren Speichern von JSON-Daten in ScriptProperties.
 * @param {string} key Der Schlüssel der Eigenschaft.
 * @param {object} data Das zu speichernde Objekt.
 */
function setScriptPropertiesData(key, data) {
  const scriptProperties = PropertiesService.getScriptProperties(); // Holt den PropertiesService.
  scriptProperties.setProperty(key, JSON.stringify(data)); // Speichert das Objekt als JSON-String.
}


/**
 * Implementiert eine natürliche Sortierung für Strings, die Zahlen enthalten (z.B. "GG2" vor "GG10").
 * Dies ist wichtig für die korrekte Sortierung von Kartennummern, die alphanumerische Teile haben.
 * @param {string} a Erster zu vergleichender String.
 * @param {string} b Zweiter zu vergleichender String.
 * @returns {number} Vergleichsergebnis (-1, 0, 1).
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
    let cardSheet = ss.getSheetByName(finalSetName); // Name des Blattes
    if (cardSheet && cardSheet.getRange(1, 1).getNote() === `Set ID: ${actualSetIdForSheetNote}`) {
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
 * Hauptfunktion für die Erstkonfiguration und den Import aller Sets.
 * Ruft `setupSheets` auf, um die grundlegende Tabellenstruktur zu erstellen,
 * und `populateSetsOverview`, um die Set-Liste zu füllen.
 */
function setupAndImportAllSets() {
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

/**
 * Ruft alle Karten für ein gegebenes pokemontcg.io Set ab und berücksichtigt dabei die Paginierung.
 * @param {string} pokemontcgSetId Die pokemontcg.io Set ID.
 * @param {string} setName Der Name des Sets (für Logging).
 * @returns {Array<Object>} Eine Liste aller Karten des Sets.
 * @throws {Error} Wenn keine Karten abgerufen werden können.
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
 * Importiert Karten für ein spezifisches Set, wobei pokemontcg.io die Grundlage bildet
 * und TCGDex zur Ergänzung deutscher Werte verwendet wird.
 * Speichert die gemergten Daten im PropertiesService zwischen und rendert sie dann im entsprechenden Blatt.
 * Diese Funktion behandelt nun auch den Import von TCGDex-Only Sets.
 * @param {string} setIdFromOverview Die Set-ID aus der "Sets Overview" (pokemontcg.io set.id oder TCGDex-only ID).
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
    const sheetNote = cardSheet.getRange(1, 1).getNote();
    if (sheetNote !== `Set ID: ${setIdFromOverview}`) {
      // Wenn Blatt existiert, aber nicht zu diesem Set gehört
      const errorMessage = `Das Tabellenblatt mit dem Namen "${setNameInSheet}" existiert bereits, ist aber nicht dem Set mit der ID "${setIdFromOverview}" zugeordnet. Bitte löschen oder benennen Sie das Blatt "${setNameInSheet}" um, bevor Sie fortfahren, oder stellen Sie sicher, dass die Notiz in A1 des Blattes korrekt ist ("Set ID: ${setIdFromOverview}").`;
      // KEIN UI.ALERT HIER, da die aufrufende Funktion den Alert übernimmt.
      Logger.log(errorMessage);
      throw new Error(errorMessage); // Fehler werfen für korrekten Abbruch
    }
    // Wenn cardSheet existiert und die Notiz übereinstimmt, wird es wiederverwendet.
  } else {
    // Wenn cardSheet nicht existiert, wird ein neues Blatt eingefügt.
    cardSheet = ss.insertSheet(setNameInSheet);
    ss.moveActiveSheet(ss.getSheets().length);
  }

  SpreadsheetApp.getActive().toast(`Lade Daten für Set "${setNameInSheet}"...`, "🔄 In Bearbeitung", 5);

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

  // Update Collection Summary
  updateCollectionSummary();

  SpreadsheetApp.getActive().toast(`${allCards.length} Karten für Set "${setNameInSheet}" im Raster angeordnet.`, `✅ Raster erstellt`, 8);
}


/**
 * Rendert und sortiert Karten im angegebenen Blatt basierend auf den übergebenen Daten.
 * Dieser Algorithmus ist der zentrale Punkt für die Anzeige und Sortierung von Karten.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} cardSheet Das Blatt, in dem die Karten gerendert werden sollen.
 * @param {string} setId Die Set-ID (pokemontcg.io ID oder TCGDex-only ID).
 * @param {Array<Object>} allCards Die Liste der zusammengeführten Kartendaten.
 * @param {Object} pokemontcgIoCardData Die Map der Cardmarket- und Image-URLs von pokemontcg.io (leer für TCGDex-only Sets).
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
  const currentSetCollectedData = collectedCardsData[setId] || {};

  const customImageUrls = getScriptPropertiesData('customImageUrls');
  const currentSetCustomImageUrls = customImageUrls[setId] || {};

  // Schritt 1: Karten mit ihrem gesammelten Status für die Sortierung erweitern.
  const cardsForSorting = allCards.map(card => {
    // Verwende card.number für pokemontcg.io Sets, und card.localId/card.id für TCGDex-only Sets, die zu 'number' gemappt wurden.
    const cardNumberOrId = normalizeCardNumber(card.number || card.id);
    const status = currentSetCollectedData[cardNumberOrId] || { g: false, rh: false };
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

  // Löscht überschüssige Zeilen, falls vorhanden.
  if (cardSheet.getMaxRows() > totalRowsNeeded) {
    cardSheet.deleteRows(totalRowsNeeded + 1, cardSheet.getMaxRows() - totalRowsNeeded);
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
 * Hilfsfunktion zum Abrufen der offiziellen Abkürzung eines Sets aus der Sets Overview.
 * @param {string} setId Die Set-ID (pokemontcg.io ID oder TCGDex-only ID).
 * @returns {string} Die offizielle Abkürzung oder ein leerer String, wenn nicht gefunden.
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
 * Aktualisiert die Sammlungsstatistiken im Blatt "Collection Summary".
 * Liest die Zusammenfassungsdaten aus den Kopfzeilen der einzelnen Set-Blätter.
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
  summarySheet.getRange(SUMMARY_SUMMARY_ROW, 1).setValue(
    `Gesamtzahl Karten (alle Sets): ${totalCardsAcrossAllSets} | Gesammelte Karten: ${totalCollectedCardsAllSets} | Gesammelte RH Karten: ${totalCollectedRHCardsAllSets} | Gesamtabschluss: ${overallCompletion.toLocaleString(undefined, { style: 'percent', minimumFractionDigits: 0 })}`
  );
}

/**
 * Aktualisiert alle Kartenblätter (Rasterdarstellung) in der Tabelle.
 * Dieser Vorgang kann bei vielen Sets lange dauern und erfordert eine Bestätigung des Benutzers.
 */
function updateAllCardSheets() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert("Alle Kartenblätter aktualisieren (Raster)", "Dieser Vorgang kann sehr lange dauern! Bestehende Checkbox-Markierungen in den Sets bleiben erhalten.\n\nMöchten Sie wirklich fortfahren?", ui.ButtonSet.YES_NO);
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
  SpreadsheetApp.getActive().toast(`Starte Aktualisierung für ${setsData.length} Sets...`, "🔄 In Arbeit", 10);

  for (let i = 0; i < setsData.length; i++) {
    const setIdFromOverview = extractIdFromHyperlink(setsData[i][0]); // This is the pokemontcg.io Set ID or TCGDex-only ID
    const setName = setsData[i][1]; // Name des Blattes

    if (!setIdFromOverview || !setName) {
      Logger.log(`Überspringe Zeile ${i + OVERVIEW_DATA_START_ROW + 1} in Sets Overview: Fehlende Set ID oder Name.`);
      continue;
    }
    SpreadsheetApp.getActive().toast(`Aktualisiere Set ${i + 1}/${setsData.length}: ${setName}`, "🔄 In Arbeit", 5);
    try {
      populateCardsForSet(setIdFromOverview); // Übergibt pokemontcg.io Set ID oder TCGDex-only ID
      processedCount++;
      if (i < setsData.length - 1) Utilities.sleep(API_DELAY_MS + 1000);
    } catch (e) {
      Logger.log(`Kritischer Fehler beim Aktualisieren von Set ${setName} (ID: ${setIdFromOverview}): ${e.message} \nStack: ${e.stack}`);
      SpreadsheetApp.getUi().alert(`Fehler bei Set ${setName}`, `Fehler: ${e.message}. Details im Log. Das Update wird mit dem nächsten Set fortgesetzt.`);
    }
  }

  populateSetsOverview();
  updateCollectionSummary();
  SpreadsheetApp.getActive().toast(`Alle Kartenblätter aktualisiert. Sammlungsübersicht wurde aktualisiert.`, "✅ Fertig", 10);
  ui.alert("Aktualisierung abgeschlossen", `${processedCount}/${setsData.length} Sets verarbeitet.`, ui.ButtonSet.OK);
}

/**
 * Wird bei jeder Zellbearbeitung ausgeführt.
 * Speichert den Status von Checkboxen, aktualisiert die Formatierung und die Kopfzeile des Set-Blattes.
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e Das Ereignisobjekt, das die Bearbeitungsinformationen enthält.
 */
function handleOnEdit(e) {
  // 1. Check if this is a script-initiated edit (recursive call)
  if (isScriptEditing) {
    Logger.log("[handleOnEdit] Script is already performing an edit. Ignoring this recursive trigger.");
    return;
  }

  // 2. Acquire a lock to prevent concurrent user operations
  var lock = LockService.getUserLock();
  try {
    lock.waitLock(USER_LOCK_TIMEOUT_MS);
  } catch (err) {
    // Show user-friendly message for lock contention
    SpreadsheetApp.getUi().alert("Operation blockiert", "Eine andere Operation wird gerade ausgeführt. Bitte versuchen Sie es gleich noch einmal.", SpreadsheetApp.getUi().ButtonSet.OK);
    Logger.log("Could not obtain lock after %s seconds. Aborting handleOnEdit. Error: %s", USER_LOCK_TIMEOUT_MS / 1000, err.message);
    return;
  }

  // 3. Persistent check for duplicate user-initiated events (using PropertiesService)
  try {
    const properties = PropertiesService.getScriptProperties();
    const range = e.range;
    const value = e.value; // Store the original value from event

    // Robust check for user-initiated check (true from false)
    const isUserInitiatedCheckActual = isUserInitiatedCheck(value, e.oldValue);

    // Only apply duplicate check for user-initiated checkbox activations
    if (isUserInitiatedCheckActual) {
      const lastProcessedEditStr = properties.getProperty('lastProcessedEdit');
      if (lastProcessedEditStr) {
        const lastProcessedEdit = JSON.parse(lastProcessedEditStr);
        const currentTime = Date.now();
        // Check if same cell, same value, and within a short time frame (e.g., 500 ms)
        // Corrected typo here: getA1notation -> getA1Notation
        if (lastProcessedEdit.range === range.getA1Notation() &&
          (lastProcessedEdit.value === true || (typeof lastProcessedEdit.value === 'string' && lastProcessedEdit.value.toLowerCase() === 'true')) && // Ensure old one was also 'true' activation
          (currentTime - lastProcessedEdit.timestamp < 1000)) { // 1 second threshold
          Logger.log("[handleOnEdit] Duplicate user-initiated trigger detected based on PropertiesService (same cell, same true value, recent). Ignoring.");
          // Clear the flag to prevent future legitimate clicks from being blocked by a stale duplicate entry
          properties.deleteProperty('lastProcessedEdit');
          return; // Exit early
        }
      }
      // If not a duplicate, store this user-initiated activation
      properties.setProperty('lastProcessedEdit', JSON.stringify({ range: range.getA1Notation(), value: e.value, timestamp: Date.now() }));
    } else {
      // If it's not a user-initiated activation (e.g. script resetting, or user unchecking), clear the flag
      // This is important so the NEXT user-initiated activation is not blocked by a stale flag.
      properties.deleteProperty('lastProcessedEdit');
    }

    // 4. Proceed with main logic. All sheet modifications must be wrapped by try/finally with isScriptEditing = true/false
    const sheet = range.getSheet();
    const sheetName = sheet.getName();

    Logger.log(`[handleOnEdit] Triggered on sheet: ${sheetName}, range: ${range.getA1Notation()}, value: ${e.value} (type: ${typeof e.value}), oldValue: ${e.oldValue} (type: ${typeof e.oldValue})`);
    Logger.log(`[handleOnEdit] isNewValueTrueActual: ${isNewValueTrueActual}, wasOldValueTrueActual: ${wasOldValueTrueActual}, isUserInitiatedCheckActual: ${isUserInitiatedCheckActual}`);

    // Set `isScriptEditing` before calling any sub-function that might modify the sheet.
    // The sub-functions should then NOT set/reset this flag themselves.
    isScriptEditing = true; // IMPORTANT: Set here for all subsequent calls within this execution.

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
      isScriptEditing = false; // Ensure the flag is reset after this execution path.
    }
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
 * Hilfsfunktion: Behandelt Änderungen an der G-Checkbox
 * @param {Object} cardData Das Kartenobjekt mit g/rh Status
 * @param {boolean} isChecked Der neue Checkbox-Status
 * @param {GoogleAppsScript.Spreadsheet.Range} rhCheckboxCell Die RH-Checkbox-Zelle
 * @returns {boolean} True wenn Daten geändert wurden
 */
function handleGCheckboxChange(cardData, isChecked, rhCheckboxCell) {
  if (cardData.g === isChecked) return false;
  
  cardData.g = isChecked;
  
  if (!isChecked) {
    // Wenn G deaktiviert wird, deaktiviere auch RH
    if (cardData.rh) {
      cardData.rh = false;
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
 * Hilfsfunktion: Behandelt Änderungen an der RH-Checkbox
 * @param {Object} cardData Das Kartenobjekt mit g/rh Status
 * @param {boolean} isChecked Der neue Checkbox-Status
 * @param {GoogleAppsScript.Spreadsheet.Range} rhCheckboxCell Die RH-Checkbox-Zelle
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
 * Verarbeitet die Bearbeitung von G-/RH-Checkboxen oder Bildzellen auf einem Set-Blatt.
 * Aktualisiert den Status im PropertiesService und die UI des betroffenen Kartenblocks.
 * Die `SpreadsheetApp.flush()`-Aufrufe wurden konsolidiert, um die Leistung zu verbessern.
 *
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e Das Ereignisobjekt.
 * @param {string} rawCardId Der rohe Wert der Karten-ID-Zelle (wird intern normalisiert).
 * @param {string} setId Die Set-ID des aktuellen Blattes.
 * @param {boolean} isGCheckbox True, wenn die G-Checkbox bearbeitet wurde.
 * @param {boolean} isRHCheckbox True, wenn die RH-Checkbox bearbeitet wurde.
 * @param {boolean} isImageCell True, wenn die Bildzelle bearbeitet wurde.
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
    
    setScriptPropertiesData('collectedCardsData', collectedCardsData);
  }

  // UI-Updates nur wenn nötig
  if (dataModified || uiNeedsUpdate) {
    const { collectedCount, reverseHoloCount } = countCollectedCards(collectedCardsData[setId]);
    updateSetSheetHeaderSummary(sheet, setId, collectedCount, reverseHoloCount);
    Logger.log(`[processCardDataEdit] Header summary for set ${setId} updated.`);

    // Wende Hintergrundfarbe an
    const blockColor = collectedCardsData[setId][cardId].rh ? REVERSE_HOL_COLLECTED_COLOR : 
                       (collectedCardsData[setId][cardId].g ? COLLECTED_COLOR : null);
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
    SpreadsheetApp.flush();
    ui.alert("Fehler", "Konnte Set-ID nicht finden. Import abgebrochen.", ui.ButtonSet.OK);
    return;
  }

  let importedSetsStatus = getScriptPropertiesData('importedSetsStatus', {});

  if (isUserInitiatedCheck) {
    Logger.log(`[onImportCheckboxEdit] User explicitly checked the box. Proceeding with import logic.`);
    range.setValue(false);
    range.clearDataValidations();
    SpreadsheetApp.flush();

    try {
      SpreadsheetApp.getActive().toast(`Importiere Set "${setName}"...`, "🔄 Import", 5);
      Logger.log(`[onImportCheckboxEdit] Calling populateCardsForSet(${setId})`);
      populateCardsForSet(setId);
      importedSetsStatus[setId] = true;
      setScriptPropertiesData('importedSetsStatus', importedSetsStatus);

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
      SpreadsheetApp.flush();
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
      SpreadsheetApp.flush();
    } else {
      Logger.log(`[onImportCheckboxEdit] Set sheet for ${setId} does not exist or note mismatch. Allowing unchecking.`);
      importedSetsStatus[setId] = false;
      setScriptPropertiesData('importedSetsStatus', importedSetsStatus);
      range.setValue(false);
      range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      SpreadsheetApp.getActive().toast(`Set "${setId}" als nicht importiert markiert.`, 'ℹ️ Status aktualisiert', 3);
      SpreadsheetApp.flush();
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
    SpreadsheetApp.flush();
    ui.alert("Fehler", "Konnte Set-ID nicht finden. Re-Import abgebrochen.", ui.ButtonSet.OK);
    return;
  }

  if (isUserInitiatedCheck) {
    Logger.log(`[onReimportCheckboxEdit] User explicitly checked the box. Proceeding with re-import logic.`);
    range.setValue(false);
    range.clearDataValidations();
    SpreadsheetApp.flush();

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
    } finally {
      // isScriptEditing is managed by handleOnEdit's try/finally block
      range.setValue(false);
      range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
      SpreadsheetApp.flush();
      Logger.log(`[onReimportCheckboxEdit] Finally block executed.`);
    }
  } else if (!isUserInitiatedCheck && (e.value === false || (typeof e.value === 'string' && e.value.toLowerCase() === 'false')) &&
    (e.oldValue === true || (typeof e.oldValue === 'string' && e.oldValue.toLowerCase() === 'true'))) {
    Logger.log(`[onReimportCheckboxEdit] User attempted to uncheck the box. Reverting to checked state.`);
    range.setValue(true);
    ui.alert("Aktion nicht erlaubt", "Diese Checkbox kann nicht manuell deaktiviert werden. Sie dient zum Auslösen eines Re-Imports und wird automatisch zurückgesetzt.", ui.ButtonSet.OK);
    SpreadsheetApp.flush();
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
    SpreadsheetApp.getActive().toast("Alle Sets sortieren...", "🔄 Sortieren", 10);
    Logger.log(`[onSortAllSetsCheckboxEdit] Calling manualSortAllSheets().`);
    manualSortAllSheets();
    SpreadsheetApp.getActive().toast("Alle Sets sortiert.", "✅ Fertig", 8);
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
 * @param {GoogleAppsScript.Spreadsheet.Range} range Die Checkbox-Zelle
 */
function resetCheckbox(range) {
  range.setValue(false);
  range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  SpreadsheetApp.flush();
}

/**
 * Hilfsfunktion: Allgemeine Checkbox-Handler-Logik für Header-Checkboxen
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
    Logger.log(`[${actionName}] Not a user-initiated check. Resetting checkbox.`);
    resetCheckbox(range);
    return;
  }

  Logger.log(`[${actionName}] User explicitly checked the box. Proceeding with action.`);
  range.setValue(false);
  range.clearDataValidations();
  SpreadsheetApp.flush();

  try {
    actionFunction();
    Logger.log(`[${actionName}] Action completed successfully.`);
  } catch (error) {
    Logger.log(`[${actionName}] ERROR: ${error.message}\nStack: ${error.stack}`);
    ui.alert("Fehler", `Fehler bei ${actionName}: ${error.message}.`, ui.ButtonSet.OK);
  } finally {
    range.setValue(false);
    range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
    SpreadsheetApp.flush();
    Logger.log(`[${actionName}] Finally block executed.`);
  }
}


/**
 * Hilfsfunktion: Setzt den Checkbox-Status und die Data Validation in einem Range
 * @param {GoogleAppsScript.Spreadsheet.Range} range Der zu setzende Bereich
 * @param {boolean} value Der Wert für die Checkbox
 * @param {boolean} isReadonly Wenn true, wird die Checkbox auf readonly gesetzt
 */
function setCheckboxState(range, value, isReadonly = false) {
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
    return { allCards, cardmarketData: storedCardmarketData };
  }
  
  return { allCards, cardmarketData };
}

/**
 * Hilfsfunktion zum Installieren eines Zeit-Triggers mit den gegebenen Parametern
 * @param {string} intervalType Art des Intervalls ('minütlich', 'täglich', 'stündlich', 'wöchentlich')
 * @param {number} frequency Frequenz des Triggers
 * @param {number|null} hour Stunde für tägliche/wöchentliche Trigger
 */
function createTimeTrigger(intervalType, frequency, hour) {
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
  
  let confirmationMessage = `Der Sortier-Trigger wurde erfolgreich installiert: ${intervalType}`;
  if (frequency > 1) {
    confirmationMessage += ` (alle ${frequency} ${intervalType.slice(0, -2)}en)`;
  }
  if (hour !== null && (intervalType === 'täglich' || intervalType === 'wöchentlich')) {
    confirmationMessage += ` um ${hour}:00 Uhr`;
  }
  
  return confirmationMessage;
}

/**
 * Installiert einen Zeit-Trigger, der die Funktion `sortAllSheetsTrigger` mit wählbarer Frequenz ausführt.
 * Der Benutzer kann zwischen minütlichen, täglichen, stündlichen oder wöchentlichen Intervallen wählen.
 */
function installSortTrigger() {
  const ui = SpreadsheetApp.getUi();

  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "sortAllSheetsTrigger") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

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
 * Diese Funktion wird durch einen Zeit-Trigger ausgeführt.
 * Sie durchläuft alle importierten Set-Blätter, sortiert deren Karten neu
 * und aktualisiert anschließend die Sammlungsübersicht.
 */
function sortAllSheetsTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setsSheet = ss.getSheetByName("Sets Overview");
  if (!setsSheet || setsSheet.getLastRow() < OVERVIEW_DATA_START_ROW) {
    Logger.log("sortAllSheetsTrigger: Keine Sets im 'Sets Overview' gefunden. Überspringe Sortierung.");
    return;
  }

  const lastExistingOverviewRow = setsSheet.getLastRow();
  const numExistingOverviewDataRows = Math.max(0, lastExistingOverviewRow - OVERVIEW_DATA_START_ROW);
  const setsData = numExistingOverviewDataRows > 0 ?
    setsSheet.getRange(OVERVIEW_DATA_START_ROW + 1, 1, numExistingOverviewDataRows, 2).getValues() : [];

  Logger.log(`Starte automatische Sortierung für ${setsData.length} Sets...`);

  const tcgdexAllSets = fetchApiData(`${TCGDEX_BASE_URL}sets`, "Fehler beim Laden der TCGDex Sets für automatische Sortierung");

  setsData.forEach(([setIdRaw, setName]) => {
    const setId = extractIdFromHyperlink(setIdRaw); // Dies ist die pokemontcg.io Set ID oder TCGDex-only ID

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
}

/**
 * Sortiert alle vorhandenen Set-Blätter manuell neu.
 * Erfordert eine Bestätigung des Benutzers und aktualisiert anschließend die Sammlungsübersicht.
 */
function manualSortAllSheets() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setsSheet = ss.getSheetByName("Sets Overview");

  if (!setsSheet || setsSheet.getLastRow() < OVERVIEW_DATA_START_ROW) {
    ui.alert("Error", "Keine Sets im 'Sets Overview' gefunden. Bitte importieren Sie zuerst Sets.", ui.ButtonSet.OK);
    return;
  }

  const lastExistingOverviewRow = setsSheet.getLastRow();
  const numExistingOverviewDataRows = Math.max(0, lastExistingOverviewRow - OVERVIEW_DATA_START_ROW);
  const setsData = numExistingOverviewDataRows > 0 ?
    setsSheet.getRange(OVERVIEW_DATA_START_ROW + 1, 1, numExistingOverviewDataRows, 2).getValues() : [];

  let processedCount = 0;
  SpreadsheetApp.getActive().toast(`Starte manuelle Sortierung für ${setsData.length} Sets...`, "🔄 In Arbeit", 10);

  const tcgdexAllSets = fetchApiData(`${TCGDEX_BASE_URL}sets`, "Fehler beim Laden der TCGDex Sets für manuelle Sortierung");

  for (let i = 0; i < setsData.length; i++) {
    const setId = extractIdFromHyperlink(setsData[i][0]);
    const setName = setsData[i][1];

    if (!setId || !setName) {
      Logger.log(`Überspringe Zeile ${i + OVERVIEW_DATA_START_ROW + 1} in Sets Overview: Fehlende Set ID oder Name.`);
      continue;
    }

    const sheet = ss.getSheetByName(setName);
    if (sheet && sheet.getRange(1, 1).getNote() === `Set ID: ${setId}`) {
      SpreadsheetApp.getActive().toast(`Sortiere Set ${i + 1}/${setsData.length}: ${setName}`, "🔄 In Arbeit", 5);
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

  SpreadsheetApp.getActive().toast(`Manuelle Sortierung abgeschlossen. ${processedCount}/${setsData.length} Sets verarbeitet.`, "✅ Fertig", 10);
  ui.alert("Manuelle Sortierung abgeschlossen", `${processedCount}/${setsData.length} Sets wurden sortiert.`, ui.ButtonSet.OK);
}

/**
 * Sortiert das aktuell geöffnete Set-Blatt manuell neu.
 * Prüft, ob es sich um ein Set-Blatt handelt und aktualisiert anschließend die Sammlungsübersicht.
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

/**
 * Löscht das aktuell geöffnete Set-Blatt und alle zugehörigen persistenten Daten
 * (gesammelte Daten, benutzerdefinierte Bild-URLs und Cardmarket-URLs).
 * Erfordert eine Bestätigung des Benutzers und aktualisiert anschließend die Sammlungsübersicht.
 * Diese Funktion behandelt nun auch das Löschen von TCGDex-Only Set-Blättern.
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
 * Deinstalliert alle Zeit-Trigger, die mit der Funktion `sortAllSheetsTrigger` verbunden sind.
 * Erfordert eine Bestätigung des Benutzers.
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
 * Löscht alle persistenten Daten (im PropertiesService gespeichert) und leert die Übersichtsblätter.
 * Dieser Vorgang ist unwiderruflich und erfordert eine doppelte Bestätigung des Benutzers.
 */
function deleteAllPersistentData() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scriptProperties = PropertiesService.getScriptProperties();

  const firstResponse = ui.alert(
    "ALLE DATEN LÖSCHEN BESTÄTIGEN",
    "Möchten Sie wirklich ALLE persistenten Daten (gesammelte Karten, benutzerdefinierte Bilder, gecachte Set-Daten) unwiderruflich löschen? Dies kann NICHT rückgängig gemacht werden.",
    ui.ButtonSet.YES_NO
  );

  if (firstResponse !== ui.Button.YES) {
    SpreadsheetApp.getActive().toast("Löschvorgang abgebrochen.", "ℹ️ Abgebrochen", 2);
    return;
  }

  const secondResponse = ui.alert(
    "LETZTE BESTÄTIGUNG: ALLE DATEN LÖSCHEN",
    "Sind Sie ABSOLUT SICHER? Alle Daten werden unwiderruflich gelöscht.",
    ui.ButtonSet.YES_NO
  );

  if (secondResponse !== ui.Button.YES) {
    SpreadsheetApp.getActive().toast("Löschvorgang abgebrochen.", "ℹ️ Abgebrochen", 2);
    return;
  }

  try {
    SpreadsheetApp.getActive().toast("Lösche alle persistenten Daten...", "🔄 In Arbeit", 5);
    Logger.log("Starte Löschen aller persistenten Daten.");

    uninstallAllTriggers();
    uninstallSortTrigger();

    const allKeys = scriptProperties.getKeys();
    allKeys.forEach(key => {
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
    Logger.log(`Fehler beim Löschen aller persistenten Daten: ${error.message} \nStack: ${e.stack}`);
    ui.alert("Error", `Fehler beim Löschen aller persistenten Daten: ${error.message}. Details im Log.`, SpreadsheetApp.getUi().ButtonSet.OK);
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
