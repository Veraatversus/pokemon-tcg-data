// ============================================================================
// POKÉMON TCG COLLECTION TRACKER - Google Sheets App Script
// ============================================================================
// Version: 2.0
// Beschreibung: Verwaltung von Pokémon-Kartensammlungen mit API-Integration
// APIs: pokemontcg.io (Primär) + TCGDex (Ergänzung für deutsche Inhalte)
// ============================================================================

// ============================================================================
// SECTION 1: GLOBALE KONSTANTEN UND KONFIGURATION
// ============================================================================

// --- API-Konfiguration ---
const UseVeraApi = true;
const VeraApiLanguage = "en";
const VTCG_BASE_URL = "https://veraatversus.github.io/pokemon-tcg-data/";
const TCGDEX_BASE_URL = "https://api.tcgdex.net/v2/de/";
const PTCG_BASE_URL = "https://api.pokemontcg.io/v2/";
const API_DELAY_MS = 50; // Verzögerung zwischen API-Aufrufen

// --- Spreadsheet-Konfiguration ---
const spreadsheetId = SpreadsheetApp.getActiveSpreadsheet().getId();

// --- Set-ID-Mappings für Inkonsistenzen zwischen APIs ---
const CUSTOM_SET_ID_MAPPINGS = {
  "swsh3.5": "swsh35",
  "sm2.5": "sm25",
  "sm3.5": "sm35",
  "sm7.5": "sm75",
  "swsh4.5": "swsh45",
  "sm35": "sm3.5",
  "sm75": "sm7.5",
  "swsh35": "swsh3.5",
  "swsh45": "swsh4.5"
};

// --- Grid-Layout-Konstanten ---
const CARDS_PER_ROW_IN_GRID = 5;
const CARD_BLOCK_WIDTH_COLS = 3;
const CARD_BLOCK_HEIGHT_ROWS = 4;

// Zeilenhöhen für Kartenblöcke
const ROW_HEIGHT_ID_NAME = 25;
const ROW_HEIGHT_IMAGE = 240;
const ROW_HEIGHT_CHECKS_LINK = 30;
const ROW_HEIGHT_SPACER = 10;

// Spaltenbreiten für Kartenblöcke
const COLUMN_WIDTH_CARD_COL1 = 40;
const COLUMN_WIDTH_CARD_COL2 = 40;
const COLUMN_WIDTH_CARD_COL3 = 100;

// Farben für Sammlungsstatus
const COLLECTED_COLOR = "#D9EAD3";
const REVERSE_HOL_COLLECTED_COLOR = "#D0E0F0";

// --- Header-Layout-Konstanten ---
const SET_SHEET_HEADER_ROWS = 2;
const SET_SHEET_HEADER_ROW_HEIGHT = 25;
const IMPORTED_CHECKBOX_COL_INDEX = 9;
const SORT_SET_CHECKBOX_ROW = 1;
const SORT_SET_CHECKBOX_COL_OFFSET = CARDS_PER_ROW_IN_GRID * CARD_BLOCK_WIDTH_COLS;

// Overview Sheet
const OVERVIEW_HEADER_ROWS = 2;
const OVERVIEW_TITLE_ROW = 1;
const OVERVIEW_SUMMARY_ROW = 2;
const REIMPORT_CHECKBOX_COL_INDEX = 10;
const OVERVIEW_REFRESH_CHECKBOX_COL = 10;
const OVERVIEW_DATA_START_ROW = OVERVIEW_HEADER_ROWS + 1;

// Summary Sheet
const SUMMARY_HEADER_ROWS = 2;
const SUMMARY_TITLE_ROW = 1;
const SUMMARY_SUMMARY_ROW = 2;
const COLLECTION_SUMMARY_DATA_COLS = 6;
const SUMMARY_SORT_CHECKBOX_COL = 7;
const SUMMARY_DATA_START_ROW = SUMMARY_HEADER_ROWS + 1;

// --- Systemkonstanten ---
const USER_LOCK_TIMEOUT_MS = 30 * 1000;
var isScriptEditing = false;


// ============================================================================
// SECTION 2: INITIALISIERUNG UND MENÜ
// ============================================================================

/**
 * Erstellt das Hauptmenü beim Öffnen der Tabelle.
 * Organisiert alle Funktionen in logische Kategorien.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('Pokémon TCG Tracker')
    // Import & Daten
    .addItem('1. Sets-Liste laden (Setup)', 'setupAndImportAllSets')
    .addItem('2. Einzelnes Set hinzufügen', 'promptAndPopulateCardsForSet')
    .addSeparator()

    // Aktualisierung & Statistik
    .addItem('📊 Sammlungs-Statistik aktualisieren', 'updateCollectionSummary')
    .addItem('🔄 Alle Sets neu laden (Langsam!)', 'updateAllCardSheets')
    .addSeparator()

    // Sortierung
    .addItem('🗂️ Aktuelles Set sortieren', 'manualSortCurrentSheet')
    .addItem('🗂️ Alle Sets sortieren', 'manualSortAllSheets')
    .addSubMenu(ui.createMenu('⚙️ Auto-Sortierung')
      .addItem('Aktivieren (Trigger installieren)', 'installSortTrigger')
      .addItem('Deaktivieren (Trigger entfernen)', 'uninstallSortTrigger'))
    .addSeparator()

    // Verwaltung
    .addItem('🗑️ Aktuelles Set löschen', 'deleteCurrentSet')
    .addItem('⚠️ Komplett-Reset (Alle Daten löschen)', 'deleteAllPersistentData')
    .addSeparator()

    // Entwicklung
    .addItem('🐞 Debug: onEdit testen', 'debugOnEdit')
    .addToUi();
}


// ============================================================================
// SECTION 3: HILFSFUNKTIONEN - STRING & ID-NORMALISIERUNG
// ============================================================================

/**
 * Normalisiert einen String für Vergleichsoperationen.
 * Entfernt Sonderzeichen, Leerzeichen und wandelt in Kleinbuchstaben um.
 * 
 * @param {string} str - Zu normalisierender String
 * @returns {string} Normalisierter String
 */
function normalizeString(str) {
  if (str === null || typeof str === 'undefined') return "";
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Normalisiert eine Set-ID für API-Abgleiche.
 * Behandelt Punkte in Versionsnummern (8.5 -> 8pt5) und führende Nullen.
 * 
 * Beispiele:
 * - "sv08.5" -> "sv8pt5"
 * - "Base Set" -> "baseset"
 * - "base 01" -> "base1"
 * 
 * @param {string} setId - Zu normalisierende Set-ID
 * @returns {string} Normalisierte Set-ID
 */
function normalizeSetId(setId) {
  if (!setId) return "";
  let normalized = String(setId).toLowerCase().trim();

  // Punkte in Versionsnummern ersetzen: 8.5 -> 8pt5
  normalized = normalized.replace(/(\d+)\.(\d+)/g, (match, p1, p2) => 
    `${parseInt(p1, 10)}pt${parseInt(p2, 10)}`
  );

  // Leerzeichen durch Bindestriche ersetzen
  normalized = normalized.replace(/\s+/g, '-');

  // Alle nicht-alphanumerischen Zeichen außer Bindestriche entfernen
  normalized = normalized.replace(/[^a-z0-9-]/g, "");

  // Führende Nullen in numerischen Segmenten entfernen
  normalized = normalized.replace(/([a-z-]+)(\d+)/g, (match, p1, p2) => 
    p1 + parseInt(p2, 10)
  );

  return normalized;
}

/**
 * Normalisiert eine Kartennummer durch Entfernen führender Nullen.
 * Essentiell für konsistente Lookups zwischen TCGDex und pokemontcg.io.
 * 
 * Beispiele:
 * - "sv10-001" -> "sv10-1"
 * - "XY005" -> "XY5"
 * - "007a" -> "7a"
 * 
 * @param {string} cardNumber - Zu normalisierende Kartennummer
 * @returns {string} Normalisierte Kartennummer
 */
function normalizeCardNumber(cardNumber) {
  if (!cardNumber) return "";
  const normalized = String(cardNumber).trim();

  // Regex: Präfix (optional), numerischer Teil, Suffix (optional)
  const match = normalized.match(/^([a-zA-Z._-]*?)(\d+)([a-zA-Z._-]*)$/);

  if (match) {
    const [, prefix, numericPart, suffix] = match;
    const cleanedNumeric = parseInt(numericPart, 10).toString();
    return `${prefix}${cleanedNumeric}${suffix}`;
  }

  return normalized;
}


// ============================================================================
// SECTION 4: API-KOMMUNIKATION
// ============================================================================

/**
 * Führt einen HTTP-Request mit Fehlerbehandlung und Rate-Limiting aus.
 * 
 * @param {string} url - URL des API-Endpunkts
 * @param {string} errorMessagePrefix - Präfix für Fehlermeldungen
 * @returns {Object|null} Geparste JSON-Antwort oder null bei Fehler
 */
function fetchApiData(url, errorMessagePrefix) {
  try {
    const options = { 'muteHttpExceptions': true };
    const response = UrlFetchApp.fetch(url, options);

    if (response.getResponseCode() !== 200) {
      Logger.log(`${errorMessagePrefix} API Fehler ${response.getResponseCode()}: ${response.getContentText()}`);
      return null;
    }

    const content = response.getContentText();
    
    // Zusätzliches Logging für TCGDex-Antworten
    if (url.includes(TCGDEX_BASE_URL)) {
      Logger.log(`TCGDex API Response from ${url}: ${content.substring(0, Math.min(content.length, 500))}...`);
    }

    Utilities.sleep(API_DELAY_MS); // Rate Limiting
    return JSON.parse(content);
  } catch (e) {
    Logger.log(`${errorMessagePrefix} Fehler: ${e.message} \nStack: ${e.stack}`);
    return null;
  }
}

/**
 * Lädt alle Karten eines Sets von pokemontcg.io mit automatischer Paginierung.
 * 
 * @param {string} pokemontcgSetId - Set-ID für pokemontcg.io
 * @param {string} setName - Name des Sets (für Logging)
 * @returns {Array<Object>} Array aller Karten des Sets
 */
function fetchAllPokemontcgIoCards(pokemontcgSetId, setName) {
  Logger.log(`[fetchAllPokemontcgIoCards] Starting fetch for Set ID: ${pokemontcgSetId}, Name: ${setName}`);
  
  const allPokemontcgCards = [];
  const pageSize = 250;
  let page = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    const pokemontcgIoApiUrl = UseVeraApi
      ? `${VTCG_BASE_URL}cards/${VeraApiLanguage}/${pokemontcgSetId}.json`
      : `${PTCG_BASE_URL}cards?q=set.id:${pokemontcgSetId}&pageSize=${pageSize}&page=${page}`;

    const pokemontcgCardsResponse = fetchApiData(pokemontcgIoApiUrl, `Fehler beim Laden der pokemontcg.io Karten von Set ${setName}`);

    if (!pokemontcgCardsResponse) {
      Logger.log(`[fetchAllPokemontcgIoCards] Keine Antwort von pokemontcg.io für Seite ${page}. Stoppe Paginierung.`);
      break;
    }

    // Verarbeite basierend auf API-Typ
    if (UseVeraApi && Array.isArray(pokemontcgCardsResponse)) {
      allPokemontcgCards.push(...pokemontcgCardsResponse);
      Logger.log(`[fetchAllPokemontcgIoCards] Fetched ${pokemontcgCardsResponse.length} cards from page ${page}. Total: ${allPokemontcgCards.length}`);
      hasMorePages = false; // Vera API gibt alle Karten auf einmal zurück
    } else if (pokemontcgCardsResponse.data && Array.isArray(pokemontcgCardsResponse.data)) {
      allPokemontcgCards.push(...pokemontcgCardsResponse.data);
      Logger.log(`[fetchAllPokemontcgIoCards] Fetched ${pokemontcgCardsResponse.data.length} cards from page ${page}. Total: ${allPokemontcgCards.length}`);
      
      if (pokemontcgCardsResponse.data.length < pageSize) {
        Logger.log(`[fetchAllPokemontcgIoCards] Weniger als ${pageSize} Karten auf Seite ${page}. Stoppe Paginierung.`);
        hasMorePages = false;
      } else {
        page++;
      }
    } else {
      Logger.log(`[fetchAllPokemontcgIoCards] Unerwartetes Response-Format auf Seite ${page}.`);
      break;
    }

    if (page > 50) {
      Logger.log(`[fetchAllPokemontcgIoCards] Sicherheitsabbruch nach 50 Seiten für Set ${pokemontcgSetId}`);
      break;
    }
  }

  Logger.log(`[fetchAllPokemontcgIoCards] Finished: ${allPokemontcgCards.length} Karten für Set ${pokemontcgSetId}`);
  return allPokemontcgCards;
}


// ============================================================================
// SECTION 5: SET-MATCHING-LOGIK
// ============================================================================

/**
 * Findet das passende TCGDex-Set für ein pokemontcg.io-Set.
 * Verwendet eine mehrstufige Matching-Strategie für maximale Robustheit.
 * 
 * Matching-Priorität:
 * 1. Custom Mappings
 * 2. Direkte ID-Übereinstimmung
 * 3. Normalisierte ID-Übereinstimmung
 * 4. PTCGO-Code-Übereinstimmung
 * 5. Name-Übereinstimmung (exakt/partiell)
 * 
 * @param {Object} pokemontcgIoSet - Set-Objekt von pokemontcg.io
 * @param {Array<Object>} allTcgdexSets - Array aller TCGDex-Sets
 * @returns {Object|null} Passendes TCGDex-Set oder null
 */
function findMatchingTcgdexSet(pokemontcgIoSet, allTcgdexSets) {
  if (!pokemontcgIoSet || !allTcgdexSets) return null;

  // Indexierung vorbereiten für schnelle Lookups
  const tcgdexIndices = buildTcgdexIndices(allTcgdexSets);

  // 1. Priorität: Custom Mappings
  const customMappedId = CUSTOM_SET_ID_MAPPINGS[pokemontcgIoSet.id.toLowerCase()];
  if (customMappedId) {
    const match = lookupInIndices(tcgdexIndices, customMappedId);
    if (match) {
      Logger.log(`[findMatchingTcgdexSet] Match via Custom Mapping: ${pokemontcgIoSet.id} -> ${customMappedId}`);
      return match;
    }
  }

  // 2. Priorität: Direkte ID-Übereinstimmung
  const directMatch = tcgdexIndices.byId.get(pokemontcgIoSet.id.toLowerCase());
  if (directMatch) {
    Logger.log(`[findMatchingTcgdexSet] Match via direkter ID: ${pokemontcgIoSet.id}`);
    return directMatch;
  }

  // 3. Priorität: Normalisierte ID
  const normalizedId = normalizeSetId(pokemontcgIoSet.id);
  const normalizedMatch = tcgdexIndices.byNormalizedId.get(normalizedId);
  if (normalizedMatch) {
    Logger.log(`[findMatchingTcgdexSet] Match via normalisierter ID: ${pokemontcgIoSet.id} (${normalizedId})`);
    return normalizedMatch;
  }

  // 4. Priorität: PTCGO Code
  if (pokemontcgIoSet.ptcgoCode) {
    const ptcgoMatch = tcgdexIndices.byAbbreviation.get(pokemontcgIoSet.ptcgoCode.toLowerCase());
    if (ptcgoMatch) {
      Logger.log(`[findMatchingTcgdexSet] Match via PTCGO Code: ${pokemontcgIoSet.ptcgoCode}`);
      return ptcgoMatch;
    }
  }

  // 5. Priorität: Name-Matching (exakt und partiell)
  const nameMatch = findByName(pokemontcgIoSet.name, tcgdexIndices.byName, allTcgdexSets);
  if (nameMatch) {
    return nameMatch;
  }

  Logger.log(`[findMatchingTcgdexSet] KEIN Match für: ID=${pokemontcgIoSet.id}, Name='${pokemontcgIoSet.name}', PTCGO='${pokemontcgIoSet.ptcgoCode}'`);
  return null;
}

/**
 * Erstellt Such-Indizes für TCGDex-Sets zur Performance-Optimierung.
 * 
 * @param {Array<Object>} allTcgdexSets - Array aller TCGDex-Sets
 * @returns {Object} Objekt mit verschiedenen Map-Indizes
 * @private
 */
function buildTcgdexIndices(allTcgdexSets) {
  const indices = {
    byAbbreviation: new Map(),
    byName: new Map(),
    byId: new Map(),
    byNormalizedId: new Map()
  };

  allTcgdexSets.forEach(set => {
    if (set.abbreviation?.official) {
      indices.byAbbreviation.set(set.abbreviation.official.toLowerCase(), set);
    }
    if (set.name) {
      indices.byName.set(normalizeString(set.name), set);
    }
    if (set.en?.name) {
      indices.byName.set(normalizeString(set.en.name), set);
    }
    if (set.id) {
      indices.byId.set(set.id.toLowerCase(), set);
      indices.byNormalizedId.set(normalizeSetId(set.id), set);
    }
  });

  return indices;
}

/**
 * Sucht in den vorbereiteten Indizes nach einer Set-ID.
 * 
 * @param {Object} indices - Index-Objekt von buildTcgdexIndices
 * @param {string} id - Zu suchende ID
 * @returns {Object|null} Gefundenes Set oder null
 * @private
 */
function lookupInIndices(indices, id) {
  const lowerCaseId = id.toLowerCase();
  return indices.byId.get(lowerCaseId) || 
         indices.byNormalizedId.get(normalizeSetId(id)) ||
         null;
}

/**
 * Sucht ein Set anhand des Namens (exakt oder partiell).
 * 
 * @param {string} searchName - Name zum Suchen
 * @param {Map} nameIndex - Name-Index-Map
 * @param {Array<Object>} allSets - Alle Sets für partielles Matching
 * @returns {Object|null} Gefundenes Set oder null
 * @private
 */
function findByName(searchName, nameIndex, allSets) {
  if (!searchName) return null;

  const normalizedSearchName = normalizeString(searchName);
  
  // Exakter Match
  const exactMatch = nameIndex.get(normalizedSearchName);
  if (exactMatch) {
    Logger.log(`[findMatchingTcgdexSet] Match via exaktem Namen: ${searchName}`);
    return exactMatch;
  }

  // Partieller Match
  for (const set of allSets) {
    const normalizedSetName = set.name ? normalizeString(set.name) : '';
    const normalizedEnName = set.en?.name ? normalizeString(set.en.name) : '';

    if ((normalizedSetName && normalizedSearchName.includes(normalizedSetName)) ||
        (normalizedSetName && normalizedSetName.includes(normalizedSearchName)) ||
        (normalizedEnName && normalizedSearchName.includes(normalizedEnName)) ||
        (normalizedEnName && normalizedEnName.includes(normalizedSearchName))) {
      Logger.log(`[findMatchingTcgdexSet] Match via partiellem Namen: '${searchName}' <-> '${set.name}'`);
      return set;
    }
  }

  return null;
}


// ============================================================================
// SECTION 6: PERSISTENTE DATENVERWALTUNG
// ============================================================================

/**
 * Lädt Daten aus dem PropertiesService mit Error-Handling.
 * 
 * @param {string} key - Schlüssel der zu ladenden Eigenschaft
 * @param {*} defaultValue - Standardwert bei Fehler oder fehlenden Daten
 * @returns {*} Geparste Daten oder Standardwert
 */
function getScriptPropertiesData(key, defaultValue = {}) {
  try {
    const scriptProperties = PropertiesService.getScriptProperties();
    const data = scriptProperties.getProperty(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch (e) {
    Logger.log(`Fehler beim Parsen der Eigenschaft '${key}': ${e.message}. Verwende Standardwert.`);
    return defaultValue;
  }
}

/**
 * Speichert Daten im PropertiesService als JSON-String.
 * 
 * @param {string} key - Schlüssel zum Speichern
 * @param {*} data - Zu speichernde Daten (werden als JSON serialisiert)
 */
function setScriptPropertiesData(key, data) {
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty(key, JSON.stringify(data));
}


// ============================================================================
// SECTION 7: CHECKBOX-VERWALTUNG (HILFSFUNKTIONEN)
// ============================================================================

/**
 * Setzt eine Checkbox auf FALSE und stellt die Standard-Validierung wieder her.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Range} range - Zellbereich der Checkbox
 */
function resetCheckboxToDefault(range) {
  range.setValue(false);
  applyCheckboxValidation(range);
}

/**
 * Setzt eine Checkbox auf TRUE mit Lock-Validierung.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Range} range - Zellbereich der Checkbox
 */
function setCheckboxChecked(range) {
  range.setValue(true);
  range.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox(true).build());
}

/**
 * Bereitet eine Checkbox für eine Aktion vor (verhindert Re-Triggering).
 * 
 * @param {GoogleAppsScript.Spreadsheet.Range} range - Zellbereich der Checkbox
 */
function prepareCheckboxAction(range) {
  range.setValue(false);
  range.clearDataValidations();
  SpreadsheetApp.flush();
}

/**
 * Stellt Checkbox-Status nach einer Aktion wieder her.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Range} range - Zellbereich der Checkbox
 */
function finalizeCheckboxAction(range) {
  resetCheckboxToDefault(range);
  SpreadsheetApp.flush();
}

/**
 * Wendet Standard-Checkbox-Validierung auf einen Bereich an.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Range} range - Zellbereich für Validierung
 */
function applyCheckboxValidation(range) {
  const rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  range.setDataValidation(rule);
}

/**
 * Prüft, ob ein OnEdit-Event einem Nutzer-Uncheck entspricht.
 * 
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e - Event-Objekt
 * @param {boolean} isUserInitiatedCheck - Ob Änderung vom Nutzer kam
 * @returns {boolean} True wenn Nutzer-Uncheck, sonst false
 */
function isUserUncheckEvent(e, isUserInitiatedCheck) {
  return !isUserInitiatedCheck && isCheckboxValueFalse(e.value) && isCheckboxValueTrue(e.oldValue);
}

/**
 * Prüft, ob ein Wert TRUE ist (boolean oder String).
 * 
 * @param {*} value - Zu prüfender Wert
 * @returns {boolean} True wenn Wert TRUE repräsentiert
 */
function isCheckboxValueTrue(value) {
  return value === true || (typeof value === 'string' && value.toLowerCase() === 'true');
}

/**
 * Prüft, ob ein Wert FALSE ist (boolean oder String).
 * 
 * @param {*} value - Zu prüfender Wert
 * @returns {boolean} True wenn Wert FALSE repräsentiert
 */
function isCheckboxValueFalse(value) {
  return value === false || (typeof value === 'string' && value.toLowerCase() === 'false');
}


// ============================================================================
// SECTION 8: KARTEN-DATEN-VERARBEITUNG
// ============================================================================

/**
 * Lädt Kartendaten für ein Set basierend auf dem Typ (TCGDex-only oder pokemontcg.io).
 * Zentralisierte Logik für alle Sortier-Funktionen.
 * 
 * @param {string} setId - Set-ID (mit oder ohne TCGDEX- Präfix)
 * @param {string} setName - Name des Sets
 * @param {Array<Object>} tcgdexAllSets - Alle TCGDex Sets (für Matching)
 * @returns {Object} Objekt mit { cards: Array, cardmarketData: Object }
 */
function loadCardsForSet(setId, setName, tcgdexAllSets) {
  let allCards = [];
  let pokemontcgIoCardmarketData = {};

  // TCGDex-only Set
  if (setId.startsWith('TCGDEX-')) {
    allCards = loadTcgdexOnlyCards(setId, setName);
  }
  // pokemontcg.io-basiertes Set
  else {
    const result = loadAndMergePokemontcgIoCards(setId, setName, tcgdexAllSets);
    allCards = result.cards;
    pokemontcgIoCardmarketData = result.cardmarketData;
  }

  return {
    cards: allCards,
    cardmarketData: pokemontcgIoCardmarketData
  };
}

/**
 * Lädt Karten für ein TCGDex-only Set.
 * 
 * @param {string} setId - Set-ID mit TCGDEX- Präfix
 * @param {string} setName - Name des Sets
 * @returns {Array<Object>} Array von Kartenobjekten
 * @private
 */
function loadTcgdexOnlyCards(setId, setName) {
  const tcgdexActualSetId = setId.substring('TCGDEX-'.length);
  const tcgdexSetDetails = fetchApiData(
    `${TCGDEX_BASE_URL}sets/${tcgdexActualSetId}`,
    `Fehler beim Laden der TCGDex Karten für Set ${setName}`
  );

  if (!tcgdexSetDetails || !tcgdexSetDetails.cards) {
    Logger.log(`Konnte TCGDex Karten für Set ${setId} nicht laden.`);
    return [];
  }

  // Transformiere TCGDex Karten in einheitliches Format
  const cards = tcgdexSetDetails.cards.map(card => ({
    number: normalizeCardNumber(card.localId || card.id),
    name: card.name,
    images: { small: card.image ? `${card.image}/low.jpg` : null },
    cardmarket: { url: card.links?.cardmarket }
  }));

  // Sortiere nach natürlicher Reihenfolge
  cards.sort((a, b) => naturalSort(a.number || "", b.number || ""));
  
  return cards;
}

/**
 * Lädt und merged Kartendaten von pokemontcg.io mit TCGDex.
 * 
 * @param {string} pokemontcgSetId - Set-ID für pokemontcg.io
 * @param {string} setName - Name des Sets
 * @param {Array<Object>} tcgdexAllSets - Alle TCGDex Sets
 * @returns {Object} { cards: Array, cardmarketData: Object }
 * @private
 */
function loadAndMergePokemontcgIoCards(pokemontcgSetId, setName, tcgdexAllSets) {
  // Lade pokemontcg.io Karten
  const pokemontcgCards = fetchAllPokemontcgIoCards(pokemontcgSetId, setName);

  // Finde passendes TCGDex Set
  const pokemontcgSetInfo = {
    id: pokemontcgSetId,
    name: setName,
    ptcgoCode: getOfficialAbbreviationFromOverview(pokemontcgSetId)
  };

  const matchingTcgdexSet = findMatchingTcgdexSet(pokemontcgSetInfo, tcgdexAllSets || []);

  // Lade TCGDex Karten wenn Match vorhanden
  const tcgdexCardsMap = new Map();
  if (matchingTcgdexSet) {
    const tcgdexSetDetails = fetchApiData(
      `${TCGDEX_BASE_URL}sets/${matchingTcgdexSet.id}`,
      `Fehler beim Laden der TCGDex Karten für Set ${setName}`
    );

    if (tcgdexSetDetails?.cards) {
      tcgdexSetDetails.cards.forEach(card => {
        tcgdexCardsMap.set(normalizeCardNumber(card.localId || card.id), card);
      });
    }
  } else {
    Logger.log(`Kein TCGDex Match für pokemontcg.io Set ${pokemontcgSetId}. Deutsche Daten fehlen.`);
  }

  // Merge Kartendaten
  const mergedCards = pokemontcgCards.map(pokemontcgCard => {
    const mergedCard = { ...pokemontcgCard };
    const tcgdexCard = tcgdexCardsMap.get(normalizeCardNumber(pokemontcgCard.number));

    if (tcgdexCard) {
      // Überschreibe mit deutschen Daten
      if (tcgdexCard.name) mergedCard.name = tcgdexCard.name;
      if (tcgdexCard.image) {
        mergedCard.images = { small: `${tcgdexCard.image}/low.jpg` };
      }
      if (tcgdexCard.description) {
        mergedCard.rules = [tcgdexCard.description];
        mergedCard.flavorText = tcgdexCard.description;
      }
    }

    return mergedCard;
  });

  // Lade Cardmarket-URLs
  const cardmarketData = getScriptPropertiesData(`pokemontcgIoCardmarketUrls_${pokemontcgSetId}`, {});

  return {
    cards: mergedCards,
    cardmarketData: cardmarketData
  };
}

/**
 * Natürliche Sortierung für Kartennummern (behandelt Zahlen korrekt).
 * Beispiel: "1" < "2" < "10" < "100a"
 * 
 * @param {string} a - Erste Kartennummer
 * @param {string} b - Zweite Kartennummer
 * @returns {number} Sortier-Ergebnis (-1, 0, 1)
 */
function naturalSort(a, b) {
  const ax = [];
  const bx = [];

  a.replace(/(\d+)|(\D+)/g, (_, num, str) => {
    ax.push([num || 0, str || '']);
  });
  b.replace(/(\d+)|(\D+)/g, (_, num, str) => {
    bx.push([num || 0, str || '']);
  });

  while (ax.length && bx.length) {
    const an = ax.shift();
    const bn = bx.shift();
    const nn = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
    if (nn) return nn;
  }

  return ax.length - bx.length;
}


// ============================================================================
// SECTION 9: SORTIER-FUNKTIONEN
// ============================================================================

/**
 * Sortiert alle importierten Set-Blätter (ausgelöst durch Zeit-Trigger).
 * Aktualisiert anschließend die Sammlungsübersicht.
 */
function sortAllSheetsTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setsSheet = ss.getSheetByName("Sets Overview");
  
  if (!setsSheet || setsSheet.getLastRow() < OVERVIEW_DATA_START_ROW) {
    Logger.log("sortAllSheetsTrigger: Keine Sets im 'Sets Overview' gefunden.");
    return;
  }

  const setsData = getSetsOverviewData(setsSheet);
  Logger.log(`Starte automatische Sortierung für ${setsData.length} Sets...`);

  const tcgdexAllSets = fetchApiData(`${TCGDEX_BASE_URL}sets`, "Fehler beim Laden der TCGDex Sets");

  processSheetSorting(setsData, tcgdexAllSets, false); // false = kein UI-Feedback

  Logger.log("Automatische Sortierung abgeschlossen.");
  updateCollectionSummary();
  Logger.log("Sammlungsübersicht nach Trigger-Sortierung aktualisiert.");
}

/**
 * Sortiert alle Set-Blätter manuell (mit UI-Feedback).
 * Erfordert Benutzerbestätigung.
 */
function manualSortAllSheets() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setsSheet = ss.getSheetByName("Sets Overview");

  if (!setsSheet || setsSheet.getLastRow() < OVERVIEW_DATA_START_ROW) {
    ui.alert("Error", "Keine Sets im 'Sets Overview' gefunden. Bitte importieren Sie zuerst Sets.", ui.ButtonSet.OK);
    return;
  }

  const setsData = getSetsOverviewData(setsSheet);
  SpreadsheetApp.getActive().toast(`Starte manuelle Sortierung für ${setsData.length} Sets...`, "🔄 In Arbeit", 10);

  const tcgdexAllSets = fetchApiData(`${TCGDEX_BASE_URL}sets`, "Fehler beim Laden der TCGDex Sets");
  const processedCount = processSheetSorting(setsData, tcgdexAllSets, true); // true = UI-Feedback

  updateCollectionSummary();
  Logger.log("Sammlungsübersicht nach manueller Sortierung aktualisiert.");

  SpreadsheetApp.getActive().toast(`Manuelle Sortierung abgeschlossen. ${processedCount}/${setsData.length} Sets verarbeitet.`, "✅ Fertig", 10);
  ui.alert("Manuelle Sortierung abgeschlossen", `${processedCount}/${setsData.length} Sets wurden sortiert.`, ui.ButtonSet.OK);
}

/**
 * Sortiert das aktuell geöffnete Set-Blatt.
 */
function manualSortCurrentSheet() {
  const ui = SpreadsheetApp.getUi();
  const currentSetInfo = getSetSheetAndIdForCurrentSheet();
  if (!currentSetInfo) return;

  const { setId, setName, sheet } = currentSetInfo;
  SpreadsheetApp.getActive().toast(`Sortiere aktuelles Set "${setName}" neu...`, "🔄 Sortieren", 3);

  try {
    const tcgdexAllSets = fetchApiData(`${TCGDEX_BASE_URL}sets`, "Fehler beim Laden der TCGDex Sets");
    const { cards, cardmarketData } = loadCardsForSet(setId, setName, tcgdexAllSets);

    if (cards.length === 0) {
      ui.alert("Fehler", `Konnte Karten für Set "${setName}" nicht laden.`, ui.ButtonSet.OK);
      return;
    }

    renderAndSortCardsInSheet(sheet, setId, cards, cardmarketData);
    PropertiesService.getScriptProperties().setProperty(`lastSortTime_${setId}`, new Date().getTime().toString());

    updateCollectionSummary();
    Logger.log(`Sammlungsübersicht nach Sortierung von "${setName}" aktualisiert.`);

    SpreadsheetApp.getActive().toast(`Sortierung für Set "${setName}" abgeschlossen.`, "✅ Fertig", 3);
  } catch (error) {
    Logger.log(`Fehler beim Sortieren von ${setName}: ${error.message} \nStack: ${error.stack}`);
    ui.alert("Error", `Fehler beim Sortieren: ${error.message}. Details im Log.`, ui.ButtonSet.OK);
  }
}

/**
 * Hilfsfunktion: Extrahiert Set-Daten aus der Sets Overview.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} setsSheet - Sets Overview Sheet
 * @returns {Array<Array>} 2D-Array mit Set-Daten
 * @private
 */
function getSetsOverviewData(setsSheet) {
  const lastRow = setsSheet.getLastRow();
  const numDataRows = Math.max(0, lastRow - OVERVIEW_DATA_START_ROW);
  
  return numDataRows > 0
    ? setsSheet.getRange(OVERVIEW_DATA_START_ROW + 1, 1, numDataRows, 2).getValues()
    : [];
}

/**
 * Verarbeitet die Sortierung mehrerer Set-Blätter.
 * 
 * @param {Array<Array>} setsData - Set-Daten aus Overview
 * @param {Array<Object>} tcgdexAllSets - Alle TCGDex Sets
 * @param {boolean} showUIFeedback - Ob UI-Toasts angezeigt werden sollen
 * @returns {number} Anzahl erfolgreich verarbeiteter Sets
 * @private
 */
function processSheetSorting(setsData, tcgdexAllSets, showUIFeedback) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let processedCount = 0;

  setsData.forEach(([setIdRaw, setName], index) => {
    const setId = extractIdFromHyperlink(setIdRaw);
    const sheet = ss.getSheetByName(setName);

    if (!sheet || sheet.getRange(1, 1).getNote() !== `Set ID: ${setId}`) {
      Logger.log(`Blatt "${setName}" für Set ID ${setId} nicht gefunden oder Notiz stimmt nicht überein.`);
      return;
    }

    if (showUIFeedback) {
      SpreadsheetApp.getActive().toast(`Sortiere Set ${index + 1}/${setsData.length}: ${setName}`, "🔄 In Arbeit", 5);
    }

    try {
      Logger.log(`Sortiere Blatt: ${setName} (Set ID: ${setId})`);
      
      const { cards, cardmarketData } = loadCardsForSet(setId, setName, tcgdexAllSets);
      
      if (cards.length === 0) {
        Logger.log(`Keine Karten für Set ${setId} geladen. Überspringe.`);
        return;
      }

      renderAndSortCardsInSheet(sheet, setId, cards, cardmarketData);
      PropertiesService.getScriptProperties().setProperty(`lastSortTime_${setId}`, new Date().getTime().toString());
      
      processedCount++;
    } catch (e) {
      Logger.log(`Fehler bei Sortierung von Set ${setName} (ID: ${setId}): ${e.message} \nStack: ${e.stack}`);
      if (showUIFeedback) {
        SpreadsheetApp.getUi().alert(`Fehler bei Set ${setName}`, `Fehler: ${e.message}. Sortierung wird fortgesetzt.`, SpreadsheetApp.getUi().ButtonSet.OK);
      }
    }

    Utilities.sleep(100);
  });

  return processedCount;
}


// ============================================================================
// SECTION 10: HILFSFUNKTIONEN FÜR SHEETS
// ============================================================================

/**
 * Extrahiert eine ID aus einem HYPERLINK-Formelstring.
 * Beispiel: '=HYPERLINK("url";"sv1")' -> "sv1"
 * 
 * @param {string|Object} cellValue - Zellwert (kann Formel oder Objekt sein)
 * @returns {string} Extrahierte ID oder leerer String
 */
function extractIdFromHyperlink(cellValue) {
  if (typeof cellValue !== 'string') return "";
  
  // Regex für HYPERLINK-Formel: =HYPERLINK("url";"id")
  const match = cellValue.match(/HYPERLINK\([^;]+;\s*"([^"]+)"\)/);
  return match ? match[1] : cellValue;
}

/**
 * Ermittelt Set-ID, Name und Sheet für das aktuell aktive Set-Blatt.
 * Validiert, dass es sich um ein gültiges Set-Blatt handelt.
 * 
 * @returns {{setId: string, setName: string, sheet: GoogleAppsScript.Spreadsheet.Sheet}|null}
 */
function getSetSheetAndIdForCurrentSheet() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const currentSheet = ss.getActiveSheet();
  const sheetName = currentSheet.getName();

  // Validierung: Ist es ein Set-Blatt?
  if (sheetName === "Sets Overview" || sheetName === "Collection Summary") {
    ui.alert("Error", "Dies ist kein Karten-Set-Blatt. Bitte wechseln Sie zu einem Set-Blatt.", ui.ButtonSet.OK);
    return null;
  }

  // Set-ID aus Notiz extrahieren
  const setIdNote = currentSheet.getRange(1, 1).getNote();
  let setId = null;
  
  if (setIdNote && setIdNote.startsWith('Set ID: ')) {
    setId = setIdNote.substring('Set ID: '.length);
  }

  if (!setId) {
    ui.alert("Error", `Konnte Set-ID für "${sheetName}" nicht finden. Bitte Set neu importieren.`, ui.ButtonSet.OK);
    return null;
  }

  return { setId, setName: sheetName, sheet: currentSheet };
}

/**
 * Holt die offizielle Abkürzung eines Sets aus der Sets Overview.
 * 
 * @param {string} setId - Set-ID (pokemontcg.io oder TCGDex)
 * @returns {string} Offizielle Abkürzung oder leerer String
 */
function getOfficialAbbreviationFromOverview(setId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setsSheet = ss.getSheetByName("Sets Overview");
  
  if (!setsSheet || setsSheet.getLastRow() < OVERVIEW_DATA_START_ROW) {
    return "";
  }

  const setsData = getSetsOverviewData(setsSheet);
  const currentSetRow = setsData.find(r => extractIdFromHyperlink(r[0]) === setId);
  
  return currentSetRow ? currentSetRow[7] : ""; // Abkürzung ist in Spalte H (Index 7)
}


// ============================================================================
// SECTION 11: SETUP & SHEET-INITIALISIERUNG
// ============================================================================

/**
 * Hauptfunktion für Setup: Erstellt Grundstruktur und importiert alle Sets.
 * Kombiniert Sheet-Setup, Sets-Import und Trigger-Installation.
 */
function setupAndImportAllSets() {
  setupSheets();
  populateSetsOverview();
  installAllTriggers();
  SpreadsheetApp.getActive().toast('Setup abgeschlossen und Sets importiert.', '✅ Fertig', 5);
}

/**
 * Initialisiert die Grundstruktur: Sets Overview und Collection Summary.
 * Erstellt Sheets, Header, Checkboxen und formatiert alles konsistent.
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  setupSetsOverviewSheet(ss);
  setupCollectionSummarySheet(ss);
  
  // Positionierung der Sheets
  arrangeSheets(ss);
}

/**
 * Richtet das "Sets Overview" Sheet ein.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Aktives Spreadsheet
 * @private
 */
function setupSetsOverviewSheet(ss) {
  let setsSheet = ss.getSheetByName("Sets Overview");
  if (!setsSheet) {
    setsSheet = ss.insertSheet("Sets Overview", 0);
  }

  // Stelle sicher, dass genug Zeilen vorhanden sind
  if (setsSheet.getMaxRows() < OVERVIEW_HEADER_ROWS) {
    setsSheet.insertRows(1, OVERVIEW_HEADER_ROWS - setsSheet.getMaxRows());
  }

  // Header Zeile 1: Titel + Refresh-Checkbox
  const titleRange = setsSheet.getRange(OVERVIEW_TITLE_ROW, 1, 1, OVERVIEW_REFRESH_CHECKBOX_COL - 1);
  titleRange.merge()
    .setValue("Pokémon TCG Sets Übersicht")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setFontWeight("bold")
    .setBackground("#D9D9D9");

  const refreshCheckbox = setsSheet.getRange(OVERVIEW_TITLE_ROW, OVERVIEW_REFRESH_CHECKBOX_COL);
  refreshCheckbox.setValue(false)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build())
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setBackground("#D9D9D9")
    .setNote("Klicken zum Neu-Laden der Sets-Übersicht.");

  // Header Zeile 2: Zusammenfassung
  const summaryRange = setsSheet.getRange(OVERVIEW_SUMMARY_ROW, 1, 1, OVERVIEW_REFRESH_CHECKBOX_COL);
  summaryRange.merge()
    .setValue("Lade Sets-Statistiken...")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setFontWeight("bold")
    .setBackground("#EFEFEF");

  // Daten-Header (Zeile 3)
  const dataHeaders = setsSheet.getRange(OVERVIEW_DATA_START_ROW, 1, 1, OVERVIEW_REFRESH_CHECKBOX_COL);
  dataHeaders.setValues([[
    "Set ID", "Set Name", "Set Logo", "Set Symbol", "Serie", 
    "Erscheinungsdatum", "Gesamtzahl Karten", "Abkürzung (Official)", 
    "Importiert", "Neu importieren"
  ]])
    .setBackground("#C9DAF8")
    .setFontWeight("bold")
    .setBorder(true, true, true, true, true, true, "#888888", SpreadsheetApp.BorderStyle.SOLID);

  // Spaltenbreiten
  setsSheet.setFrozenRows(OVERVIEW_HEADER_ROWS);
  setsSheet.setColumnWidth(3, 50);  // Logo
  setsSheet.setColumnWidth(4, 50);  // Symbol
  setsSheet.setColumnWidth(8, 100); // Abkürzung
  setsSheet.setColumnWidth(9, 70);  // Importiert
  setsSheet.setColumnWidth(10, 100); // Neu importieren
}

/**
 * Richtet das "Collection Summary" Sheet ein.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Aktives Spreadsheet
 * @private
 */
function setupCollectionSummarySheet(ss) {
  let summarySheet = ss.getSheetByName("Collection Summary");
  if (!summarySheet) {
    summarySheet = ss.insertSheet("Collection Summary");
  }

  if (summarySheet.getMaxRows() < SUMMARY_HEADER_ROWS) {
    summarySheet.insertRows(1, SUMMARY_HEADER_ROWS - summarySheet.getMaxRows());
  }

  // Header Zeile 1: Titel + Sortier-Checkbox
  const titleRange = summarySheet.getRange(SUMMARY_TITLE_ROW, 1, 1, SUMMARY_SORT_CHECKBOX_COL - 1);
  titleRange.merge()
    .setValue("Pokémon TCG Sammlungsübersicht")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setFontWeight("bold")
    .setBackground("#D9D9D9");

  const sortCheckbox = summarySheet.getRange(SUMMARY_TITLE_ROW, SUMMARY_SORT_CHECKBOX_COL);
  sortCheckbox.setValue(false)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build())
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setBackground("#D9D9D9")
    .setNote("Klicken zum Sortieren aller Sets.");

  // Header Zeile 2: Zusammenfassung
  const summaryRange = summarySheet.getRange(SUMMARY_SUMMARY_ROW, 1, 1, SUMMARY_SORT_CHECKBOX_COL);
  summaryRange.merge()
    .setValue("Lade Sammlungsstatistiken...")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setFontWeight("bold")
    .setBackground("#EFEFEF");

  // Daten-Header (Zeile 3)
  const dataHeaders = summarySheet.getRange(SUMMARY_DATA_START_ROW, 1, 1, SUMMARY_SORT_CHECKBOX_COL);
  dataHeaders.setValues([[
    "Set Name", "Gesamtzahl Karten", "Gesammelte Karten", 
    "Gesammelte RH Karten", "Abschluss-Prozentsatz", "Abkürzung (Official)", ""
  ]])
    .setBackground("#C9DAF8")
    .setFontWeight("bold")
    .setBorder(true, true, true, true, true, true, "#888888", SpreadsheetApp.BorderStyle.SOLID);

  summarySheet.setFrozenRows(SUMMARY_HEADER_ROWS);
  summarySheet.setColumnWidth(SUMMARY_SORT_CHECKBOX_COL, 70);
}

/**
 * Positioniert die Overview- und Summary-Sheets korrekt.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Aktives Spreadsheet
 * @private
 */
function arrangeSheets(ss) {
  const setsSheet = ss.getSheetByName("Sets Overview");
  const summarySheet = ss.getSheetByName("Collection Summary");

  if (setsSheet && setsSheet.getIndex() !== 1) {
    ss.setActiveSheet(setsSheet);
    ss.moveActiveSheet(1);
  }

  if (summarySheet && summarySheet.getIndex() !== 2) {
    ss.setActiveSheet(summarySheet);
    ss.moveActiveSheet(2);
  }
}


// ============================================================================
// SECTION 12: SETS-IMPORT UND OVERVIEW-VERWALTUNG
// ============================================================================

/**
 * Importiert alle Sets und merged Daten von pokemontcg.io mit TCGDex.
 * Bewahrt Benutzer-Bearbeitungen und aktualisiert Import-Status.
 */
function populateSetsOverview() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setsSheet = ss.getSheetByName("Sets Overview");

  // Bestehende Daten lesen für Erhalt von Benutzer-Bearbeitungen
  const existingSetMap = readExistingSetsData(setsSheet);

  // Sets von beiden APIs laden
  const pokemontcgIoSets = fetchPokemontcgIoSets();
  const tcgdexAllSets = fetchApiData(`${TCGDEX_BASE_URL}sets`, "Beim Laden der TCGDex Sets") || [];

  // Sets mergen und verarbeiten
  const combinedSets = mergeSetsData(pokemontcgIoSets, tcgdexAllSets);
  const sortedSets = sortSetsForOverview(combinedSets);

  // Overview-Daten generieren
  const overviewData = generateOverviewData(sortedSets, existingSetMap, ss);

  // Sheet aktualisieren
  updateOverviewSheet(setsSheet, overviewData);

  // Import-Status speichern
  saveImportStatus(overviewData);

  // Zusammenfassung aktualisieren
  updateOverviewSummary(setsSheet, pokemontcgIoSets.length, overviewData);
}

/**
 * Liest bestehende Sets-Daten für Erhalt von Benutzer-Bearbeitungen.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} setsSheet - Sets Overview Sheet
 * @returns {Map} Map mit Set-ID als Key und Benutzer-Daten als Value
 * @private
 */
function readExistingSetsData(setsSheet) {
  const existingSetMap = new Map();
  const lastRow = setsSheet.getLastRow();
  const numDataRows = Math.max(0, lastRow - OVERVIEW_DATA_START_ROW);

  if (numDataRows === 0) return existingSetMap;

  const existingData = setsSheet.getRange(
    OVERVIEW_DATA_START_ROW + 1, 1, numDataRows, setsSheet.getMaxColumns()
  ).getValues();

  existingData.forEach(row => {
    const setId = extractIdFromHyperlink(row[0]);
    existingSetMap.set(setId, {
      serie: row[4],
      releaseDate: row[5],
      abbreviation: row[7],
      logo: row[2],
      symbol: row[3]
    });
  });

  return existingSetMap;
}

/**
 * Lädt Sets von pokemontcg.io (Vera API oder offizielle API).
 * 
 * @returns {Array<Object>} Array von Set-Objekten
 * @private
 */
function fetchPokemontcgIoSets() {
  if (UseVeraApi) {
    const response = fetchApiData(
      `${VTCG_BASE_URL}sets/${VeraApiLanguage}.json`,
      "Beim Laden der pokemontcg.io Sets"
    );
    return response || [];
  } else {
    const response = fetchApiData(
      `${PTCG_BASE_URL}sets`,
      "Beim Laden der pokemontcg.io Sets"
    );
    return response?.data || [];
  }
}

/**
 * Merged Sets von pokemontcg.io und TCGDex in eine kombinierte Struktur.
 * 
 * @param {Array<Object>} pokemontcgSets - Sets von pokemontcg.io
 * @param {Array<Object>} tcgdexSets - Sets von TCGDex
 * @returns {Map} Map mit merged Set-Daten
 * @private
 */
function mergeSetsData(pokemontcgSets, tcgdexSets) {
  const combinedMap = new Map();

  // Pokemontcg.io Sets mit TCGDex-Matches mergen
  pokemontcgSets.forEach(pokemontcgSet => {
    const tcgdexMatch = findMatchingTcgdexSet(pokemontcgSet, tcgdexSets);
    combinedMap.set(pokemontcgSet.id, {
      pokemontcgData: pokemontcgSet,
      tcgdexData: tcgdexMatch,
      isOnlyTcgdex: false
    });
  });

  // TCGDex-only Sets hinzufügen
  tcgdexSets.forEach(tcgdexSet => {
    const alreadyMapped = Array.from(combinedMap.values())
      .some(merged => merged.tcgdexData?.id === tcgdexSet.id);

    if (!alreadyMapped) {
      combinedMap.set(`TCGDEX-${tcgdexSet.id}`, {
        pokemontcgData: null,
        tcgdexData: tcgdexSet,
        isOnlyTcgdex: true
      });
    }
  });

  return combinedMap;
}

/**
 * Sortiert Sets für die Overview-Anzeige.
 * Pokemontcg.io Sets zuerst (nach Datum), dann TCGDex-only.
 * 
 * @param {Map} combinedSets - Merged Sets
 * @returns {Array} Sortierte Sets
 * @private
 */
function sortSetsForOverview(combinedSets) {
  const setsArray = Array.from(combinedSets.values());

  setsArray.sort((a, b) => {
    // Pokemontcg.io Sets bevorzugen
    if (a.pokemontcgData && !b.pokemontcgData) return -1;
    if (!a.pokemontcgData && b.pokemontcgData) return 1;

    // Beide pokemontcg.io: Nach Datum sortieren
    if (a.pokemontcgData && b.pokemontcgData) {
      const dateA = new Date(a.pokemontcgData.releaseDate || 0);
      const dateB = new Date(b.pokemontcgData.releaseDate || 0);
      return dateB - dateA; // Neueste zuerst
    }

    // Beide TCGDex-only: Nach Datum sortieren
    if (a.tcgdexData && b.tcgdexData) {
      const dateA = new Date(a.tcgdexData.releaseDate || 0);
      const dateB = new Date(b.tcgdexData.releaseDate || 0);
      return dateB - dateA;
    }

    return 0;
  });

  return setsArray;
}

/**
 * Generiert Overview-Daten-Array aus merged Sets.
 * 
 * @param {Array} sortedSets - Sortierte merged Sets
 * @param {Map} existingSetMap - Bestehende Benutzer-Daten
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Spreadsheet
 * @returns {Array<Array>} 2D-Array für Sheet-Werte
 * @private
 */
function generateOverviewData(sortedSets, existingSetMap, ss) {
  const importedStatus = getScriptPropertiesData('importedSetsStatus', {});
  const overviewData = [];

  sortedSets.forEach(setEntry => {
    const rowData = buildOverviewRow(setEntry, existingSetMap, importedStatus, ss);
    if (rowData) {
      overviewData.push(rowData);
    }
  });

  return overviewData;
}

/**
 * Erstellt eine einzelne Zeile für die Overview-Tabelle.
 * 
 * @param {Object} setEntry - Merged Set-Entry
 * @param {Map} existingSetMap - Bestehende Benutzer-Daten
 * @param {Object} importedStatus - Import-Status-Map
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Spreadsheet
 * @returns {Array|null} Array mit Zeilendaten oder null
 * @private
 */
function buildOverviewRow(setEntry, existingSetMap, importedStatus, ss) {
  const { pokemontcgData, tcgdexData, isOnlyTcgdex } = setEntry;

  if (!pokemontcgData && !tcgdexData) {
    Logger.log("Ungültiger Set-Entry ohne Daten. Überspringe.");
    return null;
  }

  // Basis-ID bestimmen
  const setId = pokemontcgData ? pokemontcgData.id : `TCGDEX-${tcgdexData.id}`;

  // Metadaten extrahieren
  const metadata = extractSetMetadata(pokemontcgData, tcgdexData, isOnlyTcgdex);

  // Bestehende Benutzer-Bearbeitungen anwenden
  applyExistingUserData(metadata, existingSetMap.get(setId));

  // Prüfe Import-Status und erstelle ggf. Hyperlink
  let displayId = setId;
  let isImported = false;

  const cardSheet = ss.getSheetByName(metadata.name);
  if (cardSheet && cardSheet.getRange(1, 1).getNote() === `Set ID: ${setId}`) {
    const sheetId = cardSheet.getSheetId();
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
    displayId = `=HYPERLINK("${sheetUrl}"; "${setId}")`;
    isImported = true;
  }

  importedStatus[setId] = isImported;

  return [
    displayId,
    metadata.name,
    metadata.logo,
    metadata.symbol,
    metadata.serie,
    metadata.releaseDate,
    metadata.totalCards,
    metadata.abbreviation,
    isImported,
    false // Neu importieren Checkbox
  ];
}

/**
 * Extrahiert Metadaten aus Set-Objekten.
 * 
 * @param {Object|null} pokemontcgData - Pokemontcg.io Daten
 * @param {Object|null} tcgdexData - TCGDex Daten
 * @param {boolean} isOnlyTcgdex - Ob es ein TCGDex-only Set ist
 * @returns {Object} Metadaten-Objekt
 * @private
 */
function extractSetMetadata(pokemontcgData, tcgdexData, isOnlyTcgdex) {
  const metadata = {
    name: "",
    serie: "",
    releaseDate: "",
    totalCards: 0,
    abbreviation: "",
    logo: "",
    symbol: ""
  };

  if (pokemontcgData) {
    metadata.name = pokemontcgData.name;
    metadata.serie = pokemontcgData.series || "";
    metadata.releaseDate = pokemontcgData.releaseDate || "";
    metadata.totalCards = pokemontcgData.total || 0;
    metadata.abbreviation = pokemontcgData.ptcgoCode || pokemontcgData.id || "";
    metadata.logo = pokemontcgData.images?.logo ? `=IMAGE("${pokemontcgData.images.logo}"; 1)` : "";
    metadata.symbol = pokemontcgData.images?.symbol ? `=IMAGE("${pokemontcgData.images.symbol}"; 1)` : "";

    // TCGDex-Daten bevorzugen (deutsche Werte)
    if (tcgdexData) {
      if (tcgdexData.name) metadata.name = tcgdexData.name;
      if (tcgdexData.serie?.name) metadata.serie = tcgdexData.serie.name;
      if (tcgdexData.cardCount?.official) metadata.totalCards = tcgdexData.cardCount.official;
      if (tcgdexData.releaseDate) metadata.releaseDate = tcgdexData.releaseDate;
    }
  } else if (isOnlyTcgdex && tcgdexData) {
    // Nur TCGDex-Daten verwenden
    metadata.name = tcgdexData.name || "Unbekannter Name";
    metadata.serie = tcgdexData.serie?.name || "";
    metadata.releaseDate = tcgdexData.releaseDate || "";
    metadata.totalCards = tcgdexData.cardCount?.official || tcgdexData.cardCount?.total || 0;
    metadata.abbreviation = tcgdexData.abbreviation?.official || "";
    metadata.logo = tcgdexData.logo ? `=IMAGE("${tcgdexData.logo}"; 1)` : "";
    metadata.symbol = tcgdexData.symbol ? `=IMAGE("${tcgdexData.symbol}"; 1)` : "";
  }

  return metadata;
}

/**
 * Wendet bestehende Benutzer-Bearbeitungen auf Metadaten an.
 * 
 * @param {Object} metadata - Metadaten-Objekt (wird modifiziert)
 * @param {Object|undefined} existingData - Bestehende Benutzer-Daten
 * @private
 */
function applyExistingUserData(metadata, existingData) {
  if (!existingData) return;

  if (existingData.serie) metadata.serie = existingData.serie;
  if (existingData.releaseDate) metadata.releaseDate = existingData.releaseDate;
  if (existingData.abbreviation) metadata.abbreviation = existingData.abbreviation;
  
  // Bilder beibehalten wenn sie IMAGE-Formeln sind
  if (existingData.logo && existingData.logo.toString().startsWith("=IMAGE(")) {
    metadata.logo = existingData.logo;
  }
  if (existingData.symbol && existingData.symbol.toString().startsWith("=IMAGE(")) {
    metadata.symbol = existingData.symbol;
  }
}

/**
 * Aktualisiert das Overview-Sheet mit neuen Daten.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} setsSheet - Sets Overview Sheet
 * @param {Array<Array>} overviewData - 2D-Array mit Daten
 * @private
 */
function updateOverviewSheet(setsSheet, overviewData) {
  // Alte Daten löschen
  if (setsSheet.getLastRow() > OVERVIEW_DATA_START_ROW) {
    setsSheet.getRange(
      OVERVIEW_DATA_START_ROW + 1, 1,
      setsSheet.getLastRow() - OVERVIEW_DATA_START_ROW,
      setsSheet.getMaxColumns()
    ).clearContent();
  }

  if (overviewData.length === 0) return;

  // Neue Daten schreiben
  setsSheet.getRange(
    OVERVIEW_DATA_START_ROW + 1, 1,
    overviewData.length, overviewData[0].length
  ).setValues(overviewData);

  // Checkboxen konfigurieren
  configureOverviewCheckboxes(setsSheet, overviewData);
}

/**
 * Konfiguriert Checkboxen in der Overview-Tabelle.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} setsSheet - Sets Overview Sheet
 * @param {Array<Array>} overviewData - Overview-Daten
 * @private
 */
function configureOverviewCheckboxes(setsSheet, overviewData) {
  overviewData.forEach((rowData, index) => {
    const row = index + OVERVIEW_DATA_START_ROW + 1;
    const isImported = rowData[8];

    const importedCheckbox = setsSheet.getRange(row, IMPORTED_CHECKBOX_COL_INDEX);
    const reimportCheckbox = setsSheet.getRange(row, REIMPORT_CHECKBOX_COL_INDEX);

    // Imported-Checkbox: Locked wenn importiert
    if (isImported) {
      importedCheckbox.setDataValidation(
        SpreadsheetApp.newDataValidation().requireCheckbox(true).build()
      );
    } else {
      importedCheckbox.setDataValidation(
        SpreadsheetApp.newDataValidation().requireCheckbox().build()
      );
    }

    // Reimport-Checkbox: Immer normal
    reimportCheckbox.setDataValidation(
      SpreadsheetApp.newDataValidation().requireCheckbox().build()
    );
  });
}

/**
 * Speichert den Import-Status im PropertiesService.
 * 
 * @param {Array<Array>} overviewData - Overview-Daten
 * @private
 */
function saveImportStatus(overviewData) {
  const importedStatus = getScriptPropertiesData('importedSetsStatus', {});
  
  overviewData.forEach(rowData => {
    const setId = extractIdFromHyperlink(rowData[0]);
    importedStatus[setId] = rowData[8]; // Imported-Status
  });

  setScriptPropertiesData('importedSetsStatus', importedStatus);
}

/**
 * Aktualisiert die Zusammenfassungszeile im Overview-Header.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} setsSheet - Sets Overview Sheet
 * @param {number} totalPokemontcgSets - Anzahl pokemontcg.io Sets
 * @param {Array<Array>} overviewData - Overview-Daten
 * @private
 */
function updateOverviewSummary(setsSheet, totalPokemontcgSets, overviewData) {
  const importedCount = overviewData.filter(row => row[8]).length;
  const tcgdexOnlyCount = overviewData.filter(row => {
    const id = extractIdFromHyperlink(row[0]);
    return id.startsWith('TCGDEX-');
  }).length;
  const notImportedCount = overviewData.length - importedCount;

  setsSheet.getRange(OVERVIEW_SUMMARY_ROW, 1).setValue(
    `Gesamtzahl pokemontcg.io Sets: ${totalPokemontcgSets} | ` +
    `Gesamtzahl TCGDex-Only Sets: ${tcgdexOnlyCount} | ` +
    `Importiert: ${importedCount} | ` +
    `Nicht importiert: ${notImportedCount}`
  );
}


// ============================================================================
// SECTION 13: KARTEN-IMPORT
// ============================================================================

/**
 * Fordert Benutzer zur Eingabe einer Set-ID und importiert das Set.
 */
function promptAndPopulateCardsForSet() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setsSheet = ss.getSheetByName("Sets Overview");

  if (!setsSheet || setsSheet.getLastRow() < OVERVIEW_DATA_START_ROW) {
    ui.alert("Error", "Bitte führen Sie zuerst '1. Setup & Sets importieren' aus!", ui.ButtonSet.OK);
    return;
  }

  const response = ui.prompt(
    'Karten für Set importieren (Raster)',
    'Geben Sie die Set-ID ein (aus Spalte A von "Sets Overview"):',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() === ui.Button.OK) {
    const setId = response.getResponseText().trim();
    
    if (!setId) {
      ui.alert("Error", "Die Set-ID darf nicht leer sein!", ui.ButtonSet.OK);
      return;
    }

    try {
      populateCardsForSet(setId);
    } catch (e) {
      Logger.log(`Fehler beim manuellen Import von Set ${setId}: ${e.message}`);
      ui.alert("Importfehler", `Fehler: ${e.message}`, ui.ButtonSet.OK);
    }
  }
}

/**
 * Importiert Karten für ein spezifisches Set.
 * Hauptfunktion für den Karten-Import mit Fehlerbehandlung.
 * 
 * @param {string} setIdFromOverview - Set-ID aus Overview (pokemontcg.io oder TCGDEX-)
 */
function populateCardsForSet(setIdFromOverview) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setsSheet = ss.getSheetByName("Sets Overview");

  // Validiere Set-ID
  if (!validateSetIdInOverview(setIdFromOverview, setsSheet)) {
    throw new Error(`Set mit ID "${setIdFromOverview}" nicht in Sets Overview gefunden!`);
  }

  // Ermittle Set-Namen
  const setNameInSheet = getSetNameFromOverview(setIdFromOverview, setsSheet);
  if (!setNameInSheet) {
    throw new Error(`Set-Name für ID "${setIdFromOverview}" nicht gefunden!`);
  }

  // Sheet erstellen oder wiederverwenden
  let cardSheet = ss.getSheetByName(setNameInSheet);
  cardSheet = prepareCardSheet(cardSheet, setNameInSheet, setIdFromOverview, ss);

  SpreadsheetApp.getActive().toast(`Lade Daten für Set "${setNameInSheet}"...`, "🔄 In Bearbeitung", 5);

  // Karten laden basierend auf Set-Typ
  const tcgdexAllSets = fetchApiData(`${TCGDEX_BASE_URL}sets`, "Fehler beim Laden der TCGDex Sets");
  const { cards, cardmarketData } = loadCardsForSet(setIdFromOverview, setNameInSheet, tcgdexAllSets);

  if (cards.length === 0) {
    throw new Error(`Keine Karten für Set "${setNameInSheet}" gefunden!`);
  }

  // Karten im Sheet rendern
  renderAndSortCardsInSheet(cardSheet, setIdFromOverview, cards, cardmarketData);

  // Overview aktualisieren
  updateSetsOverviewAfterImport(setIdFromOverview, cardSheet);

  SpreadsheetApp.getActive().toast(
    `${cards.length} Karten für Set "${setNameInSheet}" im Raster angeordnet.`,
    `✅ Raster erstellt`, 8
  );
}

/**
 * Validiert, ob eine Set-ID in der Overview existiert.
 * 
 * @param {string} setId - Zu validierende Set-ID
 * @param {GoogleAppsScript.Spreadsheet.Sheet} setsSheet - Sets Overview Sheet
 * @returns {boolean} True wenn Set existiert
 * @private
 */
function validateSetIdInOverview(setId, setsSheet) {
  const setsData = getSetsOverviewData(setsSheet);
  return setsData.some(row => extractIdFromHyperlink(row[0]) === setId);
}

/**
 * Holt den Set-Namen aus der Overview.
 * 
 * @param {string} setId - Set-ID
 * @param {GoogleAppsScript.Spreadsheet.Sheet} setsSheet - Sets Overview Sheet
 * @returns {string|null} Set-Name oder null
 * @private
 */
function getSetNameFromOverview(setId, setsSheet) {
  const setsData = getSetsOverviewData(setsSheet);
  const row = setsData.find(r => extractIdFromHyperlink(r[0]) === setId);
  return row ? row[1] : null;
}

/**
 * Bereitet ein Card-Sheet vor (erstellt oder validiert bestehendes).
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet|null} existingSheet - Bestehendes Sheet oder null
 * @param {string} setName - Name des Sets
 * @param {string} setId - Set-ID
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Spreadsheet
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} Vorbereitetes Sheet
 * @private
 */
function prepareCardSheet(existingSheet, setName, setId, ss) {
  if (existingSheet) {
    const note = existingSheet.getRange(1, 1).getNote();
    if (note !== `Set ID: ${setId}`) {
      const errorMsg = `Blatt "${setName}" existiert bereits, gehört aber zu einem anderen Set!`;
      Logger.log(errorMsg);
      throw new Error(errorMsg);
    }
    return existingSheet;
  }

  // Neues Sheet erstellen
  const newSheet = ss.insertSheet(setName);
  ss.moveActiveSheet(ss.getSheets().length);
  return newSheet;
}

/**
 * Aktualisiert die Sets Overview nach erfolgreichem Import.
 * 
 * @param {string} setId - Set-ID
 * @param {GoogleAppsScript.Spreadsheet.Sheet} cardSheet - Card-Sheet
 * @private
 */
function updateSetsOverviewAfterImport(setId, cardSheet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setsSheet = ss.getSheetByName("Sets Overview");
  const setsData = getSetsOverviewData(setsSheet);

  const rowIndex = setsData.findIndex(row => extractIdFromHyperlink(row[0]) === setId);
  if (rowIndex === -1) return;

  const sheetRow = rowIndex + OVERVIEW_DATA_START_ROW + 1;
  const sheetId = cardSheet.getSheetId();
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;

  // Hyperlink setzen
  setsSheet.getRange(sheetRow, 1).setFormula(`=HYPERLINK("${sheetUrl}"; "${setId}")`);

  // Imported-Checkbox auf true setzen
  const importedCheckbox = setsSheet.getRange(sheetRow, IMPORTED_CHECKBOX_COL_INDEX);
  importedCheckbox.setValue(true);
  importedCheckbox.setDataValidation(
    SpreadsheetApp.newDataValidation().requireCheckbox(true).build()
  );

  // Status speichern
  const importedStatus = getScriptPropertiesData('importedSetsStatus', {});
  importedStatus[setId] = true;
  setScriptPropertiesData('importedSetsStatus', importedStatus);
}

/**
 * Aktualisiert alle Kartenblätter (Rasterdarstellung).
 * Erfordert Benutzerbestätigung wegen langer Laufzeit.
 */
function updateAllCardSheets() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    "Alle Kartenblätter aktualisieren (Raster)",
    "Dieser Vorgang kann sehr lange dauern! Bestehende Checkbox-Markierungen bleiben erhalten.\n\nFortfahren?",
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const setsSheet = ss.getSheetByName("Sets Overview");

  if (!setsSheet || setsSheet.getLastRow() < OVERVIEW_DATA_START_ROW) {
    ui.alert("Error", "Keine Sets in 'Sets Overview' gefunden.", ui.ButtonSet.OK);
    return;
  }

  const setsData = getSetsOverviewData(setsSheet);
  let processedCount = 0;

  SpreadsheetApp.getActive().toast(`Starte Aktualisierung für ${setsData.length} Sets...`, "🔄 In Arbeit", 10);

  for (let i = 0; i < setsData.length; i++) {
    const setId = extractIdFromHyperlink(setsData[i][0]);
    const setName = setsData[i][1];

    if (!setId || !setName) {
      Logger.log(`Überspringe Zeile ${i + OVERVIEW_DATA_START_ROW + 1}: Fehlende Set ID oder Name.`);
      continue;
    }

    SpreadsheetApp.getActive().toast(`Aktualisiere Set ${i + 1}/${setsData.length}: ${setName}`, "🔄 In Arbeit", 5);

    try {
      populateCardsForSet(setId);
      processedCount++;
      if (i < setsData.length - 1) Utilities.sleep(API_DELAY_MS + 1000);
    } catch (e) {
      Logger.log(`Kritischer Fehler bei Set ${setName} (ID: ${setId}): ${e.message} \nStack: ${e.stack}`);
    }
  }

  updateCollectionSummary();
  SpreadsheetApp.getActive().toast(`Alle Kartenblätter aktualisiert.`, "✅ Fertig", 10);
  ui.alert("Aktualisierung abgeschlossen", `${processedCount}/${setsData.length} Sets verarbeitet.`, ui.ButtonSet.OK);
}


// ============================================================================
// SECTION 14: RENDERING-LOGIK
// ============================================================================

/**
 * Rendert und sortiert Karten im Grid-Layout.
 * Hauptfunktion für die visuelle Darstellung der Kartensammlung.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} cardSheet - Ziel-Sheet
 * @param {string} setId - Set-ID (pokemontcg.io oder TCGDEX-)
 * @param {Array<Object>} allCards - Kartendaten
 * @param {Object} pokemontcgIoCardData - Cardmarket-URLs (nur für pokemontcg.io)
 */
function renderAndSortCardsInSheet(cardSheet, setId, allCards, pokemontcgIoCardData) {
  if (!allCards || allCards.length === 0) {
    clearCardSheetData(cardSheet);
    updateCardSheetHeader(cardSheet, setId, 0, 0, 0);
    return;
  }

  const collectedCardsData = getScriptPropertiesData('collectedCardsData');
  const currentSetCollectedData = collectedCardsData[setId] || {};
  const customImageUrls = getScriptPropertiesData('customImageUrls');
  const currentSetCustomImageUrls = customImageUrls[setId] || {};

  // Karten mit Sammeldaten anreichern
  const cardsForSorting = enrichCardsWithCollectionStatus(allCards, currentSetCollectedData);

  // Karten sortieren
  const sortedCards = sortCardsForDisplay(cardsForSorting);

  // Sheet vorbereiten
  clearCardSheetData(cardSheet);

  // Statistiken berechnen
  const stats = calculateCollectionStats(currentSetCollectedData, sortedCards.length);

  // Header erstellen
  setupCardSheetHeader(cardSheet, setId, stats);

  // Grid-Struktur vorbereiten
  const gridData = prepareGridData(sortedCards, currentSetCollectedData, currentSetCustomImageUrls, pokemontcgIoCardData, setId);

  // Grid rendern
  renderGrid(cardSheet, gridData);

  // Merges anwenden
  applyCardBlockMerges(cardSheet, sortedCards.length);

  // Rahmen zeichnen
  applyCardBlockBorders(cardSheet, sortedCards.length);
}

/**
 * Reichert Karten mit Sammelstatus an.
 * 
 * @param {Array<Object>} cards - Kartendaten
 * @param {Object} collectedData - Sammel-Status-Map
 * @returns {Array<Object>} Angereicherte Karten
 * @private
 */
function enrichCardsWithCollectionStatus(cards, collectedData) {
  return cards.map(card => {
    const cardNumberOrId = normalizeCardNumber(card.number || card.id);
    const status = collectedData[cardNumberOrId] || { g: false, rh: false };
    return { ...card, g: status.g, rh: status.rh, displayId: cardNumberOrId };
  });
}

/**
 * Sortiert Karten für Anzeige: Ungesammelt → Gesammelt, dann nach Nummer.
 * 
 * @param {Array<Object>} cards - Karten mit Sammelstatus
 * @returns {Array<Object>} Sortierte Karten
 * @private
 */
function sortCardsForDisplay(cards) {
  return cards.sort((a, b) => {
    if (a.g !== b.g) return a.g ? 1 : -1;
    if (a.rh !== b.rh) return a.rh ? 1 : -1;
    return naturalSort(a.displayId, b.displayId);
  });
}

/**
 * Löscht Kartendaten-Bereich im Sheet.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Card-Sheet
 * @private
 */
function clearCardSheetData(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow > SET_SHEET_HEADER_ROWS) {
    sheet.getRange(
      SET_SHEET_HEADER_ROWS + 1, 1,
      lastRow - SET_SHEET_HEADER_ROWS,
      sheet.getMaxColumns()
    ).clear();
  }
}

/**
 * Berechnet Sammlungsstatistiken.
 * 
 * @param {Object} collectedData - Sammel-Status-Map
 * @param {number} totalCards - Gesamtzahl Karten
 * @returns {Object} Statistik-Objekt
 * @private
 */
function calculateCollectionStats(collectedData, totalCards) {
  let collected = 0, reverseHolo = 0;
  
  for (const cardId in collectedData) {
    if (collectedData[cardId].g) collected++;
    if (collectedData[cardId].rh) reverseHolo++;
  }

  const completion = totalCards > 0 ? collected / totalCards : 0;

  return { totalCards, collected, reverseHolo, completion };
}

/**
 * Richtet Header des Card-Sheets ein.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Card-Sheet
 * @param {string} setId - Set-ID
 * @param {Object} stats - Statistik-Objekt
 * @private
 */
function setupCardSheetHeader(sheet, setId, stats) {
  const officialAbbreviation = getOfficialAbbreviationFromOverview(setId);

  // Zeilenhöhen
  for (let i = 1; i <= SET_SHEET_HEADER_ROWS; i++) {
    sheet.setRowHeight(i, SET_SHEET_HEADER_ROW_HEIGHT);
  }

  // Titel (Zeile 1)
  const titleRange = sheet.getRange(1, 1, 1, SORT_SET_CHECKBOX_COL_OFFSET - 1);
  titleRange.merge()
    .setValue(`${sheet.getName()} (Set-ID: ${extractIdFromHyperlink(setId)})`)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setFontWeight("bold")
    .setBackground("#E0E0E0");

  // Sortier-Checkbox
  const sortCheckbox = sheet.getRange(SORT_SET_CHECKBOX_ROW, SORT_SET_CHECKBOX_COL_OFFSET);
  sortCheckbox.setValue(false)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build())
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setBackground("#E0E0E0");

  // Zusammenfassung (Zeile 2)
  updateCardSheetHeader(sheet, setId, stats.totalCards, stats.collected, stats.reverseHolo);

  // Set-ID in Notiz speichern
  sheet.getRange(1, 1).setNote(`Set ID: ${setId}`);

  // Spaltenbreiten
  setupCardSheetColumns(sheet);
}

/**
 * Aktualisiert Header-Zusammenfassung.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Card-Sheet
 * @param {string} setId - Set-ID
 * @param {number} totalCards - Gesamtzahl Karten
 * @param {number} collected - Gesammelte Karten
 * @param {number} reverseHolo - RH Karten
 * @private
 */
function updateCardSheetHeader(sheet, setId, totalCards, collected, reverseHolo) {
  const completion = totalCards > 0 ? collected / totalCards : 0;
  const officialAbbreviation = getOfficialAbbreviationFromOverview(setId);

  const summaryRange = sheet.getRange(2, 1, 1, SORT_SET_CHECKBOX_COL_OFFSET);
  summaryRange.merge()
    .setValue(
      `Gesamtzahl Karten: ${totalCards} | ` +
      `Gesammelte Karten: ${collected} | ` +
      `Gesammelte RH Karten: ${reverseHolo} | ` +
      `Abschluss-Prozentsatz: ${completion.toLocaleString(undefined, { style: 'percent', minimumFractionDigits: 0 })} | ` +
      `Abkürzung: ${officialAbbreviation}`
    )
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setFontWeight("bold")
    .setBackground("#EFEFEF");
}

/**
 * Konfiguriert Spaltenbreiten für Grid-Layout.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Card-Sheet
 * @private
 */
function setupCardSheetColumns(sheet) {
  const totalColsNeeded = CARDS_PER_ROW_IN_GRID * CARD_BLOCK_WIDTH_COLS;

  for (let i = 0; i < CARDS_PER_ROW_IN_GRID; i++) {
    const baseCol = 1 + i * CARD_BLOCK_WIDTH_COLS;
    sheet.setColumnWidth(baseCol, COLUMN_WIDTH_CARD_COL1);
    sheet.setColumnWidth(baseCol + 1, COLUMN_WIDTH_CARD_COL2);
    sheet.setColumnWidth(baseCol + 2, COLUMN_WIDTH_CARD_COL3);
  }

  // Überschüssige Spalten löschen
  if (sheet.getMaxColumns() > totalColsNeeded) {
    sheet.deleteColumns(totalColsNeeded + 1, sheet.getMaxColumns() - totalColsNeeded);
  }
}

/**
 * Bereitet Grid-Daten vor (2D-Arrays für Batch-Update).
 * 
 * @param {Array<Object>} cards - Sortierte Karten
 * @param {Object} collectedData - Sammel-Status-Map
 * @param {Object} customImages - Benutzerdefinierte Bilder
 * @param {Object} cardmarketData - Cardmarket-URLs
 * @param {string} setId - Set-ID
 * @returns {Object} Grid-Daten-Objekt
 * @private
 */
function prepareGridData(cards, collectedData, customImages, cardmarketData, setId) {
  const totalRowsForCards = Math.ceil(cards.length / CARDS_PER_ROW_IN_GRID) * CARD_BLOCK_HEIGHT_ROWS;
  const totalColsNeeded = CARDS_PER_ROW_IN_GRID * CARD_BLOCK_WIDTH_COLS;

  const gridData = {
    values: createEmptyGrid(totalRowsForCards, totalColsNeeded, ''),
    backgrounds: createEmptyGrid(totalRowsForCards, totalColsNeeded, null),
    numberFormats: createEmptyGrid(totalRowsForCards, totalColsNeeded, ''),
    horizontalAlignments: createEmptyGrid(totalRowsForCards, totalColsNeeded, null),
    verticalAlignments: createEmptyGrid(totalRowsForCards, totalColsNeeded, null),
    fontWeights: createEmptyGrid(totalRowsForCards, totalColsNeeded, null),
    wrapStrategies: createEmptyGrid(totalRowsForCards, totalColsNeeded, SpreadsheetApp.WrapStrategy.OVERFLOW),
    formulas: createEmptyGrid(totalRowsForCards, totalColsNeeded, null),
    fontColors: createEmptyGrid(totalRowsForCards, totalColsNeeded, ''),
    dataValidations: createEmptyGrid(totalRowsForCards, totalColsNeeded, null)
  };

  const officialAbbreviation = getOfficialAbbreviationFromOverview(setId);

  cards.forEach((card, index) => {
    populateCardBlock(gridData, card, index, collectedData, customImages, cardmarketData, officialAbbreviation, setId);
  });

  return gridData;
}

/**
 * Erzeugt leeres 2D-Array.
 * 
 * @param {number} rows - Anzahl Zeilen
 * @param {number} cols - Anzahl Spalten
 * @param {any} fillValue - Füllwert
 * @returns {Array<Array>} 2D-Array
 * @private
 */
function createEmptyGrid(rows, cols, fillValue) {
  return Array(rows).fill(0).map(() => Array(cols).fill(fillValue));
}

/**
 * Füllt einen Kartenblock in Grid-Daten.
 * 
 * @param {Object} gridData - Grid-Daten-Objekt
 * @param {Object} card - Kartendaten
 * @param {number} index - Kartenindex
 * @param {Object} collectedData - Sammel-Status
 * @param {Object} customImages - Benutzerdefinierte Bilder
 * @param {Object} cardmarketData - Cardmarket-URLs
 * @param {string} abbreviation - Set-Abkürzung
 * @param {string} setId - Set-ID
 * @private
 */
function populateCardBlock(gridData, card, index, collectedData, customImages, cardmarketData, abbreviation, setId) {
  const gridRowIndex = Math.floor(index / CARDS_PER_ROW_IN_GRID);
  const gridColIndex = index % CARDS_PER_ROW_IN_GRID;
  const startRow = gridRowIndex * CARD_BLOCK_HEIGHT_ROWS;
  const startCol = gridColIndex * CARD_BLOCK_WIDTH_COLS;

  const cardId = card.displayId;
  const status = collectedData[cardId] || { g: false, rh: false };

  // Zeile 1: ID und Name
  gridData.values[startRow][startCol] = cardId;
  gridData.numberFormats[startRow][startCol] = '@';
  gridData.horizontalAlignments[startRow][startCol] = "center";
  gridData.verticalAlignments[startRow][startCol] = "middle";
  gridData.fontWeights[startRow][startCol] = "bold";

  gridData.values[startRow][startCol + 1] = card.name || "Unbekannt";
  gridData.horizontalAlignments[startRow][startCol + 1] = "left";
  gridData.verticalAlignments[startRow][startCol + 1] = "middle";
  gridData.fontWeights[startRow][startCol + 1] = "bold";
  gridData.wrapStrategies[startRow][startCol + 1] = SpreadsheetApp.WrapStrategy.WRAP;

  // Zeile 2: Bild
  const imageRow = startRow + 1;
  const imageFormula = determineImageFormula(cardId, card, customImages);
  
  if (imageFormula.startsWith("=IMAGE(")) {
    gridData.formulas[imageRow][startCol] = imageFormula;
  } else {
    gridData.values[imageRow][startCol] = imageFormula;
  }
  gridData.horizontalAlignments[imageRow][startCol] = "center";
  gridData.verticalAlignments[imageRow][startCol] = "middle";

  // Zeile 3: Checkboxen und Link
  const checkRow = startRow + 2;
  
  // G-Checkbox
  gridData.values[checkRow][startCol] = status.g;
  gridData.dataValidations[checkRow][startCol] = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  gridData.horizontalAlignments[checkRow][startCol] = "center";
  gridData.verticalAlignments[checkRow][startCol] = "middle";

  // RH-Checkbox
  gridData.values[checkRow][startCol + 1] = status.rh;
  gridData.horizontalAlignments[checkRow][startCol + 1] = "center";
  gridData.verticalAlignments[checkRow][startCol + 1] = "middle";

  if (status.g) {
    gridData.dataValidations[checkRow][startCol + 1] = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    gridData.fontColors[checkRow][startCol + 1] = '';
    if (status.rh) {
      gridData.backgrounds[checkRow][startCol + 1] = REVERSE_HOL_COLLECTED_COLOR;
    }
  } else {
    gridData.values[checkRow][startCol + 1] = false;
    gridData.dataValidations[checkRow][startCol + 1] = null;
    gridData.fontColors[checkRow][startCol + 1] = '#FFFFFF';
  }

  // Cardmarket-Link
  const cardmarketUrl = cardmarketData?.[cardId]?.cardmarketUrl || card.cardmarket?.url;
  if (cardmarketUrl) {
    gridData.formulas[checkRow][startCol + 2] = `=HYPERLINK("${cardmarketUrl}"; "CM")`;
  } else if (card.id && !setId.startsWith('TCGDEX-')) {
    const searchUrl = `https://www.cardmarket.com/de/Pokemon/Products/Search?searchMode=v2&searchString=${abbreviation}+${card.number}`;
    gridData.formulas[checkRow][startCol + 2] = `=HYPERLINK("${searchUrl}"; "CM")`;
  } else {
    gridData.values[checkRow][startCol + 2] = "CM (Link fehlt)";
  }
  gridData.horizontalAlignments[checkRow][startCol + 2] = "center";
  gridData.verticalAlignments[checkRow][startCol + 2] = "middle";
  gridData.fontColors[checkRow][startCol + 2] = "blue";

  // Block-Farbe
  const blockColor = status.rh ? REVERSE_HOL_COLLECTED_COLOR : (status.g ? COLLECTED_COLOR : null);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < CARD_BLOCK_WIDTH_COLS; c++) {
      gridData.backgrounds[startRow + r][startCol + c] = blockColor;
    }
  }
}

/**
 * Bestimmt IMAGE-Formel für Karte.
 * 
 * @param {string} cardId - Karten-ID
 * @param {Object} card - Kartendaten
 * @param {Object} customImages - Benutzerdefinierte Bilder
 * @returns {string} IMAGE-Formel oder Fallback-Text
 * @private
 */
function determineImageFormula(cardId, card, customImages) {
  const customImage = customImages[cardId];
  if (customImage) return customImage;
  if (card.images?.small) return `=IMAGE("${card.images.small}"; 1)`;
  return "Kein Bild";
}

/**
 * Rendert Grid-Daten in Sheet (Batch-Update).
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Card-Sheet
 * @param {Object} gridData - Grid-Daten
 * @private
 */
function renderGrid(sheet, gridData) {
  const totalRowsForCards = gridData.values.length;
  const totalColsNeeded = gridData.values[0].length;

  if (totalRowsForCards === 0) return;

  // Zeilenhöhen setzen
  for (let i = 0; i < totalRowsForCards / CARD_BLOCK_HEIGHT_ROWS; i++) {
    const startRow = SET_SHEET_HEADER_ROWS + 1 + i * CARD_BLOCK_HEIGHT_ROWS;
    sheet.setRowHeight(startRow, ROW_HEIGHT_ID_NAME);
    sheet.setRowHeight(startRow + 1, ROW_HEIGHT_IMAGE);
    sheet.setRowHeight(startRow + 2, ROW_HEIGHT_CHECKS_LINK);
    sheet.setRowHeight(startRow + 3, ROW_HEIGHT_SPACER);
  }

  // Batch-Update aller Werte und Formatierungen
  const fullRange = sheet.getRange(SET_SHEET_HEADER_ROWS + 1, 1, totalRowsForCards, totalColsNeeded);
  fullRange.setValues(gridData.values);
  fullRange.setBackgrounds(gridData.backgrounds);
  fullRange.setNumberFormats(gridData.numberFormats);
  fullRange.setHorizontalAlignments(gridData.horizontalAlignments);
  fullRange.setVerticalAlignments(gridData.verticalAlignments);
  fullRange.setFontWeights(gridData.fontWeights);
  fullRange.setWrapStrategies(gridData.wrapStrategies);
  fullRange.setFontColors(gridData.fontColors);

  // Formeln setzen
  for (let r = 0; r < totalRowsForCards; r++) {
    for (let c = 0; c < totalColsNeeded; c++) {
      if (gridData.formulas[r][c] !== null) {
        sheet.getRange(SET_SHEET_HEADER_ROWS + r + 1, c + 1).setFormula(gridData.formulas[r][c]);
      }
    }
  }

  // Datenvalidierungen setzen
  for (let r = 0; r < totalRowsForCards; r++) {
    for (let c = 0; c < totalColsNeeded; c++) {
      if (gridData.dataValidations[r][c] !== null) {
        sheet.getRange(SET_SHEET_HEADER_ROWS + r + 1, c + 1).setDataValidation(gridData.dataValidations[r][c]);
      }
    }
  }
}

/**
 * Wendet Merges auf Kartenblöcke an.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Card-Sheet
 * @param {number} numCards - Anzahl Karten
 * @private
 */
function applyCardBlockMerges(sheet, numCards) {
  for (let index = 0; index < numCards; index++) {
    const gridRowIndex = Math.floor(index / CARDS_PER_ROW_IN_GRID);
    const gridColIndex = index % CARDS_PER_ROW_IN_GRID;
    const startRow = SET_SHEET_HEADER_ROWS + 1 + gridRowIndex * CARD_BLOCK_HEIGHT_ROWS;
    const startCol = 1 + gridColIndex * CARD_BLOCK_WIDTH_COLS;

    // Name mergen (Spalte 2+3)
    sheet.getRange(startRow, startCol + 1, 1, CARD_BLOCK_WIDTH_COLS - 1).merge();
    
    // Bild mergen (Spalte 1+2+3)
    sheet.getRange(startRow + 1, startCol, 1, CARD_BLOCK_WIDTH_COLS).merge();
  }
}

/**
 * Zeichnet Rahmen um Kartenblöcke.
 * 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Card-Sheet
 * @param {number} numCards - Anzahl Karten
 * @private
 */
function applyCardBlockBorders(sheet, numCards) {
  const ranges = [];
  
  for (let index = 0; index < numCards; index++) {
    const gridRowIndex = Math.floor(index / CARDS_PER_ROW_IN_GRID);
    const gridColIndex = index % CARDS_PER_ROW_IN_GRID;
    const startRow = SET_SHEET_HEADER_ROWS + 1 + gridRowIndex * CARD_BLOCK_HEIGHT_ROWS;
    const startCol = 1 + gridColIndex * CARD_BLOCK_WIDTH_COLS;

    ranges.push(sheet.getRange(startRow, startCol, 3, CARD_BLOCK_WIDTH_COLS));
  }

  ranges.forEach(range => {
    range.setBorder(true, true, true, true, true, true, "#BDBDBD", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  });
}


// ============================================================================
// SECTION 15: EVENT-HANDLER (onEdit)
// ============================================================================

/**
 * Hauptfunktion für onEdit-Events.
 * Behandelt alle Checkbox-Klicks und Zell-Bearbeitungen mit Lock-Mechanismus.
 * 
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e - Event-Objekt
 */
function handleOnEdit(e) {
  // Verhindere rekursive Trigger
  if (isScriptEditing) {
    Logger.log("[handleOnEdit] Script führt bereits eine Bearbeitung durch. Ignoriere rekursiven Trigger.");
    return;
  }

  // Lock für parallele Operationen
  const lock = LockService.getUserLock();
  try {
    lock.waitLock(USER_LOCK_TIMEOUT_MS);
  } catch (err) {
    SpreadsheetApp.getUi().alert(
      "Operation blockiert",
      "Eine andere Operation wird gerade ausgeführt. Bitte versuchen Sie es gleich noch einmal.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    Logger.log(`Lock konnte nicht erworben werden nach ${USER_LOCK_TIMEOUT_MS / 1000} Sekunden. Fehler: ${err.message}`);
    return;
  }

  // Duplikat-Check mittels PropertiesService
  try {
    const properties = PropertiesService.getScriptProperties();
    const range = e.range;
    const value = e.value;

    const isNewValueTrue = (value === true || (typeof value === 'string' && value.toLowerCase() === 'true'));
    const wasOldValueTrue = (e.oldValue === true || (typeof e.oldValue === 'string' && e.oldValue.toLowerCase() === 'true'));
    const isUserInitiatedCheck = (isNewValueTrue && !wasOldValueTrue);

    // Duplikat-Check nur für User-Checkbox-Aktivierungen
    if (isUserInitiatedCheck) {
      const lastProcessedEditStr = properties.getProperty('lastProcessedEdit');
      if (lastProcessedEditStr) {
        const lastProcessedEdit = JSON.parse(lastProcessedEditStr);
        const currentTime = Date.now();
        
        if (lastProcessedEdit.range === range.getA1Notation() &&
            (lastProcessedEdit.value === true || (typeof lastProcessedEdit.value === 'string' && lastProcessedEdit.value.toLowerCase() === 'true')) &&
            (currentTime - lastProcessedEdit.timestamp < 1000)) {
          Logger.log("[handleOnEdit] Duplikat-Trigger erkannt. Ignoriere.");
          properties.deleteProperty('lastProcessedEdit');
          return;
        }
      }
      properties.setProperty('lastProcessedEdit', JSON.stringify({ range: range.getA1Notation(), value: e.value, timestamp: Date.now() }));
    } else {
      properties.deleteProperty('lastProcessedEdit');
    }

    const sheet = range.getSheet();
    const sheetName = sheet.getName();

    Logger.log(`[handleOnEdit] Ausgelöst in Sheet: ${sheetName}, Bereich: ${range.getA1Notation()}, Wert: ${e.value}, AltWert: ${e.oldValue}`);

    isScriptEditing = true;

    try {
      // Header-Checkboxen in Overview und Summary
      if (sheetName === "Sets Overview" && range.getColumn() === OVERVIEW_REFRESH_CHECKBOX_COL && range.getRow() === OVERVIEW_TITLE_ROW) {
        onRefreshOverviewCheckboxEdit(e, isUserInitiatedCheck);
        return;
      }
      if (sheetName === "Collection Summary" && range.getColumn() === SUMMARY_SORT_CHECKBOX_COL && range.getRow() === SUMMARY_TITLE_ROW) {
        onSortAllSetsCheckboxEdit(e, isUserInitiatedCheck);
        return;
      }

      // Checkboxen in Sets Overview Datenzeilen
      if (sheetName === "Sets Overview" && range.getRow() > OVERVIEW_HEADER_ROWS) {
        if (range.getColumn() === IMPORTED_CHECKBOX_COL_INDEX) {
          onImportCheckboxEdit(e, isUserInitiatedCheck);
        } else if (range.getColumn() === REIMPORT_CHECKBOX_COL_INDEX) {
          onReimportCheckboxEdit(e, isUserInitiatedCheck);
        }
        return;
      }

      // Sortier-Checkbox in einzelnen Set-Sheets
      if (range.getRow() === SORT_SET_CHECKBOX_ROW && range.getColumn() === SORT_SET_CHECKBOX_COL_OFFSET) {
        onSortSetCheckboxEdit(e, isUserInitiatedCheck);
        return;
      }

      // Karten-Checkboxen (G/RH) und Bildzellen
      if (sheetName !== "Sets Overview" && sheetName !== "Collection Summary" && range.getRow() > SET_SHEET_HEADER_ROWS) {
        const col = range.getColumn();
        const row = range.getRow();

        const cardBlockStartCol = Math.floor((col - 1) / CARD_BLOCK_WIDTH_COLS) * CARD_BLOCK_WIDTH_COLS + 1;
        const cardBlockStartRow = SET_SHEET_HEADER_ROWS + Math.floor((row - (SET_SHEET_HEADER_ROWS + 1)) / CARD_BLOCK_HEIGHT_ROWS) * CARD_BLOCK_HEIGHT_ROWS + 1;

        const isGCheckbox = (col === cardBlockStartCol) && (row === cardBlockStartRow + 2);
        const isRHCheckbox = (col === cardBlockStartCol + 1) && (row === cardBlockStartRow + 2);
        const isImageCell = (col >= cardBlockStartCol && col < cardBlockStartCol + CARD_BLOCK_WIDTH_COLS) && (row === cardBlockStartRow + 1);

        if (isGCheckbox || isRHCheckbox || isImageCell) {
          const cardIdCell = sheet.getRange(cardBlockStartRow, cardBlockStartCol);
          const rawCardId = cardIdCell.getValue();

          const setIdNote = sheet.getRange(1, 1).getNote();
          let setId = null;
          if (setIdNote && setIdNote.startsWith('Set ID: ')) {
            setId = setIdNote.substring('Set ID: '.length);
          }

          if (!setId || !rawCardId) {
            Logger.log(`[handleOnEdit] FEHLER: Ungültige Karten-ID "${rawCardId}" oder Set-ID "${setId}". Abbruch.`);
            return;
          }

          processCardDataEdit(e, rawCardId, setId, isGCheckbox, isRHCheckbox, isImageCell);
        }
      }
    } finally {
      isScriptEditing = false;
    }
  } finally {
    if (lock && lock.hasLock()) {
      lock.releaseLock();
      Logger.log("[handleOnEdit] Lock freigegeben.");
    }
  }
}

/**
 * Verarbeitet Bearbeitung von G-/RH-Checkboxen oder Bildzellen.
 * 
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e - Event-Objekt
 * @param {string} rawCardId - Rohe Karten-ID
 * @param {string} setId - Set-ID
 * @param {boolean} isGCheckbox - G-Checkbox bearbeitet
 * @param {boolean} isRHCheckbox - RH-Checkbox bearbeitet
 * @param {boolean} isImageCell - Bildzelle bearbeitet
 * @private
 */
function processCardDataEdit(e, rawCardId, setId, isGCheckbox, isRHCheckbox, isImageCell) {
  const range = e.range;
  const sheet = range.getSheet();
  const cardId = normalizeCardNumber(String(rawCardId));

  let collectedCardsData = getScriptPropertiesData('collectedCardsData');
  let customImageUrls = getScriptPropertiesData('customImageUrls');

  let dataModified = false;
  let uiNeedsUpdate = false;

  // Initialisierung
  if (!collectedCardsData[setId]) collectedCardsData[setId] = {};
  if (!collectedCardsData[setId][cardId]) collectedCardsData[setId][cardId] = { g: false, rh: false };
  if (!customImageUrls[setId]) customImageUrls[setId] = {};

  const cardBlockStartCol = Math.floor((range.getColumn() - 1) / CARD_BLOCK_WIDTH_COLS) * CARD_BLOCK_WIDTH_COLS + 1;
  const cardBlockStartRow = SET_SHEET_HEADER_ROWS + Math.floor((range.getRow() - (SET_SHEET_HEADER_ROWS + 1)) / CARD_BLOCK_HEIGHT_ROWS) * CARD_BLOCK_HEIGHT_ROWS + 1;
  const actualRhCheckboxCell = sheet.getRange(cardBlockStartRow + 2, cardBlockStartCol + 1);
  const cardBlockRange = sheet.getRange(cardBlockStartRow, cardBlockStartCol, 3, CARD_BLOCK_WIDTH_COLS);

  // Bildzellen-Logik
  if (isImageCell) {
    const newFormula = range.getFormula();
    if (newFormula && newFormula.startsWith('=IMAGE(') && newFormula.endsWith(')')) {
      if (customImageUrls[setId][cardId] !== newFormula) {
        customImageUrls[setId][cardId] = newFormula;
        dataModified = true;
        uiNeedsUpdate = true;
      }
    } else {
      if (customImageUrls[setId].hasOwnProperty(cardId)) {
        delete customImageUrls[setId][cardId];
        dataModified = true;
        uiNeedsUpdate = true;
        if (Object.keys(customImageUrls[setId]).length === 0) {
          delete customImageUrls[setId];
        }
      }
    }
    setScriptPropertiesData('customImageUrls', customImageUrls);
  }

  // Checkbox-Logik
  if (isGCheckbox || isRHCheckbox) {
    const isChecked = (e.value === true || (typeof e.value === 'string' && e.value.toLowerCase() === 'true'));

    if (isGCheckbox) {
      if (collectedCardsData[setId][cardId].g !== isChecked) {
        collectedCardsData[setId][cardId].g = isChecked;
        dataModified = true;
        uiNeedsUpdate = true;

        if (!isChecked) {
          if (collectedCardsData[setId][cardId].rh) {
            collectedCardsData[setId][cardId].rh = false;
            actualRhCheckboxCell.setValue(false);
          }
          actualRhCheckboxCell.clearDataValidations();
          actualRhCheckboxCell.setFontColor('#FFFFFF');
        } else {
          actualRhCheckboxCell.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
          actualRhCheckboxCell.setFontColor(null);
        }
      }
    } else if (isRHCheckbox) {
      const gChecked = collectedCardsData[setId][cardId].g;
      if (!gChecked && isChecked) {
        actualRhCheckboxCell.setValue(false);
        collectedCardsData[setId][cardId].rh = false;
      } else {
        if (collectedCardsData[setId][cardId].rh !== isChecked) {
          collectedCardsData[setId][cardId].rh = isChecked;
          dataModified = true;
          uiNeedsUpdate = true;
        }
      }
    }
    setScriptPropertiesData('collectedCardsData', collectedCardsData);
  }

  // UI-Update
  if (dataModified || uiNeedsUpdate) {
    let collectedCount = 0, reverseHoloCount = 0;
    for (const cId in collectedCardsData[setId]) {
      if (collectedCardsData[setId][cId].g) collectedCount++;
      if (collectedCardsData[setId][cId].rh) reverseHoloCount++;
    }

    const headerSummaryText = sheet.getRange(2, 1).getValue();
    const totalMatch = headerSummaryText.match(/Gesamtzahl Karten:\s*(\d+)/);
    const currentTotalCardsInSet = totalMatch ? parseInt(totalMatch[1]) : 0;

    updateCardSheetHeader(sheet, setId, currentTotalCardsInSet, collectedCount, reverseHoloCount);

    const blockColor = collectedCardsData[setId][cardId].rh ? REVERSE_HOL_COLLECTED_COLOR : (collectedCardsData[setId][cardId].g ? COLLECTED_COLOR : null);
    cardBlockRange.setBackground(blockColor);
  }

  SpreadsheetApp.flush();
}

/**
 * Behandelt "Importiert"-Checkbox in Sets Overview.
 * 
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e - Event-Objekt
 * @param {boolean} isUserInitiatedCheck - User-initiiert?
 * @private
 */
function onImportCheckboxEdit(e, isUserInitiatedCheck) {
  const range = e.range;
  const sheet = range.getSheet();
  const ui = SpreadsheetApp.getUi();

  const setId = extractIdFromHyperlink(sheet.getRange(e.range.getRow(), 1).getValue());
  const setName = sheet.getRange(e.range.getRow(), 2).getValue();

  if (!setId) {
    resetCheckboxToDefault(range);
    SpreadsheetApp.flush();
    ui.alert("Fehler", "Konnte Set-ID nicht finden. Import abgebrochen.", ui.ButtonSet.OK);
    return;
  }

  let importedSetsStatus = getScriptPropertiesData('importedSetsStatus', {});

  if (isUserInitiatedCheck) {
    prepareCheckboxAction(range);

    try {
      SpreadsheetApp.getActive().toast(`Importiere Set "${setName}"...`, "🔄 Import", 5);
      populateCardsForSet(setId);
      importedSetsStatus[setId] = true;
      setScriptPropertiesData('importedSetsStatus', importedSetsStatus);

      setCheckboxChecked(range);
      SpreadsheetApp.getActive().toast(`Set "${setId}" erfolgreich importiert.`, '✅ Importiert', 3);
    } catch (error) {
      Logger.log(`[onImportCheckboxEdit] Fehler: ${error.message}`);
      importedSetsStatus[setId] = false;
      setScriptPropertiesData('importedSetsStatus', importedSetsStatus);
      resetCheckboxToDefault(range);
      ui.alert("Importfehler", `Fehler beim Importieren von Set "${setName}": ${error.message}.`, ui.ButtonSet.OK);
    } finally {
      SpreadsheetApp.flush();
    }
  } else if (isUserUncheckEvent(e, isUserInitiatedCheck)) {
    const setSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(setName);

    if (setSheet && setSheet.getRange(1, 1).getNote() === `Set ID: ${setId}`) {
      setCheckboxChecked(range);
      ui.alert("Aktion nicht erlaubt", "Diese Checkbox kann nicht manuell deaktiviert werden. Löschen Sie das Set über das Menü.", ui.ButtonSet.OK);
      SpreadsheetApp.flush();
    } else {
      importedSetsStatus[setId] = false;
      setScriptPropertiesData('importedSetsStatus', importedSetsStatus);
      resetCheckboxToDefault(range);
      SpreadsheetApp.flush();
    }
  }
}

/**
 * Behandelt Sortier-Checkbox in einzelnen Set-Sheets.
 * 
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e - Event-Objekt
 * @param {boolean} isUserInitiatedCheck - User-initiiert?
 * @private
 */
function onSortSetCheckboxEdit(e, isUserInitiatedCheck) {
  if (!isUserInitiatedCheck) {
    resetCheckboxToDefault(e.range);
    SpreadsheetApp.flush();
    return;
  }

  prepareCheckboxAction(e.range);

  try {
    SpreadsheetApp.getActive().toast("Sortiere Set...", "🔄 Sortieren", 5);
    manualSortCurrentSheet();
    SpreadsheetApp.getActive().toast("Sortierung abgeschlossen.", "✅ Fertig", 3);
  } catch (error) {
    Logger.log(`[onSortSetCheckboxEdit] Fehler: ${error.message}`);
    SpreadsheetApp.getUi().alert("Sortierfehler", `Fehler: ${error.message}.`, SpreadsheetApp.getUi().ButtonSet.OK);
  } finally {
    finalizeCheckboxAction(e.range);
  }
}

/**
 * Behandelt "Neu importieren"-Checkbox in Sets Overview.
 * 
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e - Event-Objekt
 * @param {boolean} isUserInitiatedCheck - User-initiiert?
 * @private
 */
function onReimportCheckboxEdit(e, isUserInitiatedCheck) {
  const range = e.range;
  const ui = SpreadsheetApp.getUi();

  const setId = extractIdFromHyperlink(e.range.getSheet().getRange(e.range.getRow(), 1).getValue());
  const setName = e.range.getSheet().getRange(e.range.getRow(), 2).getValue();

  if (!setId) {
    resetCheckboxToDefault(range);
    SpreadsheetApp.flush();
    ui.alert("Fehler", "Konnte Set-ID nicht finden.", ui.ButtonSet.OK);
    return;
  }

  if (isUserInitiatedCheck) {
    prepareCheckboxAction(range);

    try {
      SpreadsheetApp.getActive().toast(`Importiere Set "${setName}" neu...`, "🔄 Re-Import", 5);
      populateCardsForSet(setId);
      populateSetsOverview();
      SpreadsheetApp.getActive().toast("Re-Import abgeschlossen.", "✅ Fertig", 3);
    } catch (error) {
      Logger.log(`[onReimportCheckboxEdit] Fehler: ${error.message}`);
      ui.alert("Re-Import Fehler", `Fehler: ${error.message}.`, ui.ButtonSet.OK);
    } finally {
      finalizeCheckboxAction(range);
    }
  } else if (isUserUncheckEvent(e, isUserInitiatedCheck)) {
    setCheckboxChecked(range);
    ui.alert("Aktion nicht erlaubt", "Diese Checkbox kann nicht manuell deaktiviert werden.", ui.ButtonSet.OK);
    SpreadsheetApp.flush();
  }
}

/**
 * Behandelt "Übersicht aktualisieren"-Checkbox in Sets Overview.
 * 
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e - Event-Objekt
 * @param {boolean} isUserInitiatedCheck - User-initiiert?
 * @private
 */
function onRefreshOverviewCheckboxEdit(e, isUserInitiatedCheck) {
  if (isUserInitiatedCheck) {
    prepareCheckboxAction(e.range);

    try {
      SpreadsheetApp.getActive().toast("Aktualisiere Sets Overview...", "🔄 Aktualisieren", 5);
      setupAndImportAllSets();
      SpreadsheetApp.getActive().toast("Sets Overview aktualisiert.", "✅ Fertig", 3);
    } catch (error) {
      Logger.log(`[onRefreshOverviewCheckboxEdit] Fehler: ${error.message}`);
      SpreadsheetApp.getUi().alert("Aktualisierungsfehler", `Fehler: ${error.message}.`, SpreadsheetApp.getUi().ButtonSet.OK);
    } finally {
      finalizeCheckboxAction(e.range);
    }
  } else if (isUserUncheckEvent(e, isUserInitiatedCheck)) {
    setCheckboxChecked(e.range);
    SpreadsheetApp.getUi().alert("Aktion nicht erlaubt", "Diese Checkbox kann nicht manuell deaktiviert werden.", SpreadsheetApp.getUi().ButtonSet.OK);
    SpreadsheetApp.flush();
  }
}

/**
 * Behandelt "Alle Sets sortieren"-Checkbox in Collection Summary.
 * 
 * @param {GoogleAppsScript.Events.Sheets.SheetChangeEvent} e - Event-Objekt
 * @param {boolean} isUserInitiatedCheck - User-initiiert?
 * @private
 */
function onSortAllSetsCheckboxEdit(e, isUserInitiatedCheck) {
  if (isUserInitiatedCheck) {
    prepareCheckboxAction(e.range);

    try {
      SpreadsheetApp.getActive().toast("Alle Sets sortieren...", "🔄 Sortieren", 10);
      manualSortAllSheets();
      SpreadsheetApp.getActive().toast("Alle Sets sortiert.", "✅ Fertig", 8);
    } catch (error) {
      Logger.log(`[onSortAllSetsCheckboxEdit] Fehler: ${error.message}`);
      SpreadsheetApp.getUi().alert("Sortierfehler", `Fehler: ${error.message}.`, SpreadsheetApp.getUi().ButtonSet.OK);
    } finally {
      finalizeCheckboxAction(e.range);
    }
  } else if (isUserUncheckEvent(e, isUserInitiatedCheck)) {
    setCheckboxChecked(e.range);
    SpreadsheetApp.getUi().alert("Aktion nicht erlaubt", "Diese Checkbox kann nicht manuell deaktiviert werden.", SpreadsheetApp.getUi().ButtonSet.OK);
    SpreadsheetApp.flush();
  }
}


// ============================================================================
// SECTION 16: TRIGGER-VERWALTUNG
// ============================================================================

/**
 * Installiert alle notwendigen onEdit-Trigger.
 */
function installAllTriggers() {
  const ui = SpreadsheetApp.getUi();
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;

  // Lösche alte onEdit-Trigger
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getEventType() === ScriptApp.EventType.ON_EDIT) {
      ScriptApp.deleteTrigger(triggers[i]);
      deletedCount++;
    }
  }

  try {
    ScriptApp.newTrigger("handleOnEdit")
      .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
      .onEdit()
      .create();
    Logger.log("Installierbarer onEdit-Trigger erfolgreich erstellt.");
  } catch (e) {
    ui.alert("Fehler bei Trigger-Installation", `Fehler: ${e.message}. Bitte Berechtigungen prüfen.`, ui.ButtonSet.OK);
    Logger.log(`Fehler beim Erstellen des handleOnEdit-Triggers: ${e.message}`);
  }
}

/**
 * Deinstalliert alle onEdit-Trigger.
 */
function uninstallAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let triggersDeleted = 0;

  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getEventType() === ScriptApp.EventType.ON_EDIT && triggers[i].getHandlerFunction() === "handleOnEdit") {
      ScriptApp.deleteTrigger(triggers[i]);
      triggersDeleted++;
    }
  }

  Logger.log(`${triggersDeleted} onEdit-Trigger deinstalliert.`);
}

/**
 * Installiert Zeit-Trigger für automatisches Sortieren.
 */
function installSortTrigger() {
  const ui = SpreadsheetApp.getUi();

  // Alte Trigger löschen
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === "sortAllSheetsTrigger") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  const typeResponse = ui.prompt(
    'Sortier-Trigger installieren',
    'Intervall-Typ? ("minütlich", "täglich", "stündlich", "wöchentlich")',
    ui.ButtonSet.OK_CANCEL
  );

  if (typeResponse.getSelectedButton() !== ui.Button.OK) return;

  const intervalType = typeResponse.getResponseText().trim().toLowerCase();
  if (!['minütlich', 'täglich', 'stündlich', 'wöchentlich'].includes(intervalType)) {
    ui.alert("Error", "Ungültiger Intervalltyp.", ui.ButtonSet.OK);
    return;
  }

  const frequencyResponse = ui.prompt(
    'Sortier-Trigger installieren',
    'Frequenz? (Positive Ganzzahl, z.B. "1" oder "3")',
    ui.ButtonSet.OK_CANCEL
  );

  if (frequencyResponse.getSelectedButton() !== ui.Button.OK) return;

  const frequency = parseInt(frequencyResponse.getResponseText().trim(), 10);
  if (isNaN(frequency) || frequency <= 0) {
    ui.alert("Error", "Ungültige Frequenz.", ui.ButtonSet.OK);
    return;
  }

  let triggerBuilder = ScriptApp.newTrigger("sortAllSheetsTrigger").timeBased();

  switch (intervalType) {
    case 'minütlich':
      triggerBuilder = triggerBuilder.everyMinutes(frequency);
      break;
    case 'täglich':
      triggerBuilder = triggerBuilder.everyDays(frequency).atHour(0);
      break;
    case 'stündlich':
      triggerBuilder = triggerBuilder.everyHours(frequency);
      break;
    case 'wöchentlich':
      triggerBuilder = triggerBuilder.everyWeeks(frequency).atHour(0);
      break;
  }

  triggerBuilder.create();
  ui.alert('Sortier-Trigger installiert', `Erfolgreich konfiguriert: ${intervalType} (Frequenz: ${frequency})`, ui.ButtonSet.OK);
}

/**
 * Deinstalliert Zeit-Trigger für automatisches Sortieren.
 */
function uninstallSortTrigger() {
  const ui = SpreadsheetApp.getUi();
  const triggers = ScriptApp.getProjectTriggers();
  let triggersDeleted = 0;

  const response = ui.alert(
    "Trigger deinstallieren",
    "Sortier-Trigger wirklich deinstallieren?",
    ui.ButtonSet.YES_NO
  );

  if (response === ui.Button.YES) {
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === "sortAllSheetsTrigger") {
        ScriptApp.deleteTrigger(trigger);
        triggersDeleted++;
      }
    });

    if (triggersDeleted > 0) {
      ui.alert('Trigger deinstalliert', `${triggersDeleted} Sortier-Trigger deinstalliert.`, ui.ButtonSet.OK);
    } else {
      ui.alert('Kein Trigger gefunden', 'Kein aktiver Sortier-Trigger vorhanden.', ui.ButtonSet.OK);
    }
  }
}

/**
 * Zeit-Trigger-Funktion: Sortiert alle Sets automatisch.
 */
function sortAllSheetsTrigger() {
  processSheetSorting('auto');
  updateCollectionSummary();
  Logger.log("Automatische Sortierung abgeschlossen.");
}

/**
 * Manuelle Sortierung aller Sets.
 */
function manualSortAllSheets() {
  const ui = SpreadsheetApp.getUi();
  
  SpreadsheetApp.getActive().toast("Starte manuelle Sortierung...", "🔄 In Arbeit", 10);
  const processedCount = processSheetSorting('manual');
  updateCollectionSummary();
  
  SpreadsheetApp.getActive().toast("Manuelle Sortierung abgeschlossen.", "✅ Fertig", 10);
  ui.alert("Sortierung abgeschlossen", `${processedCount} Sets sortiert.`, ui.ButtonSet.OK);
}

/**
 * Manuelle Sortierung des aktuellen Sets.
 */
function manualSortCurrentSheet() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const currentSheet = ss.getActiveSheet();
  const sheetName = currentSheet.getName();

  if (sheetName === "Sets Overview" || sheetName === "Collection Summary") {
    ui.alert("Error", "Dies ist kein Karten-Set-Blatt.", ui.ButtonSet.OK);
    return;
  }

  const setIdNote = currentSheet.getRange(1, 1).getNote();
  let setId = null;
  if (setIdNote && setIdNote.startsWith('Set ID: ')) {
    setId = setIdNote.substring('Set ID: '.length);
  }

  if (!setId) {
    ui.alert("Error", `Konnte Set-ID für "${sheetName}" nicht finden.`, ui.ButtonSet.OK);
    return;
  }

  SpreadsheetApp.getActive().toast(`Sortiere Set "${sheetName}"...`, "🔄 Sortieren", 3);

  try {
    const tcgdexAllSets = fetchApiData(`${TCGDEX_BASE_URL}sets`, "Fehler beim Laden der TCGDex Sets");
    const { cards, cardmarketData } = loadCardsForSet(setId, sheetName, tcgdexAllSets);
    renderAndSortCardsInSheet(currentSheet, setId, cards, cardmarketData);

    PropertiesService.getScriptProperties().setProperty(`lastSortTime_${setId}`, new Date().getTime().toString());

    updateCollectionSummary();
    SpreadsheetApp.getActive().toast("Sortierung abgeschlossen.", "✅ Fertig", 3);
  } catch (error) {
    Logger.log(`Fehler beim Sortieren von Set ${sheetName}: ${error.message}`);
    ui.alert("Error", `Fehler: ${error.message}.`, ui.ButtonSet.OK);
  }
}


// ============================================================================
// SECTION 17: DATEN-LÖSCHUNG
// ============================================================================

/**
 * Löscht das aktuell geöffnete Set-Blatt und alle Daten.
 */
function deleteCurrentSet() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const currentSetInfo = getSetSheetAndIdForCurrentSheet();
  if (!currentSetInfo) return;

  const { setId, setName, sheet } = currentSetInfo;

  const response = ui.alert(
    "Set löschen bestätigen",
    `Wirklich Set "${setName}" und ALLE Daten unwiderruflich löschen?`,
    ui.ButtonSet.YES_NO
  );

  if (response === ui.Button.YES) {
    try {
      ss.deleteSheet(sheet);
      SpreadsheetApp.getActive().toast(`Blatt "${setName}" gelöscht.`, "✅ Gelöscht", 3);

      // Persistente Daten löschen
      let collectedCardsData = getScriptPropertiesData('collectedCardsData');
      if (collectedCardsData[setId]) {
        delete collectedCardsData[setId];
        setScriptPropertiesData('collectedCardsData', collectedCardsData);
      }

      let customImageUrls = getScriptPropertiesData('customImageUrls');
      if (customImageUrls[setId]) {
        delete customImageUrls[setId];
        setScriptPropertiesData('customImageUrls', customImageUrls);
      }

      PropertiesService.getScriptProperties().deleteProperty(`pokemontcgIoCardmarketUrls_${setId}`);

      let importedSetsStatus = getScriptPropertiesData('importedSetsStatus');
      if (importedSetsStatus[setId]) {
        importedSetsStatus[setId] = false;
        setScriptPropertiesData('importedSetsStatus', importedSetsStatus);
      }

      populateSetsOverview();
      updateCollectionSummary();

      ui.alert("Set gelöscht", `Set "${setName}" und alle Daten erfolgreich gelöscht.`, ui.ButtonSet.OK);
    } catch (error) {
      Logger.log(`Fehler beim Löschen: ${error.message}`);
      ui.alert("Error", `Fehler: ${error.message}.`, ui.ButtonSet.OK);
    }
  }
}

/**
 * Löscht ALLE persistenten Daten unwiderruflich.
 * Erfordert doppelte Bestätigung.
 */
function deleteAllPersistentData() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const firstResponse = ui.alert(
    "ALLE DATEN LÖSCHEN BESTÄTIGEN",
    "Wirklich ALLE Daten unwiderruflich löschen?",
    ui.ButtonSet.YES_NO
  );

  if (firstResponse !== ui.Button.YES) return;

  const secondResponse = ui.alert(
    "LETZTE BESTÄTIGUNG",
    "ABSOLUT SICHER? Alle Daten werden gelöscht!",
    ui.ButtonSet.YES_NO
  );

  if (secondResponse !== ui.Button.YES) return;

  try {
    SpreadsheetApp.getActive().toast("Lösche alle Daten...", "🔄 In Arbeit", 5);

    uninstallAllTriggers();
    uninstallSortTrigger();

    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.getKeys().forEach(key => {
      scriptProperties.deleteProperty(key);
      Logger.log(`Property gelöscht: ${key}`);
    });

    // Alle Set-Blätter löschen
    ss.getSheets().forEach(sheet => {
      const sheetName = sheet.getName();
      if (sheetName !== "Sets Overview" && sheetName !== "Collection Summary") {
        ss.deleteSheet(sheet);
      }
    });

    // Übersichtsblätter leeren
    const setsSheet = ss.getSheetByName("Sets Overview");
    const summarySheet = ss.getSheetByName("Collection Summary");
    if (setsSheet) setsSheet.clearContents();
    if (summarySheet) summarySheet.clearContents();

    setupSheets();

    SpreadsheetApp.getActive().toast("Alle Daten erfolgreich gelöscht.", '✅ Fertig', 5);
  } catch (error) {
    Logger.log(`Fehler beim Löschen aller Daten: ${error.message}`);
    ui.alert("Error", `Fehler: ${error.message}.`, ui.ButtonSet.OK);
  }
}


// ============================================================================
// SECTION 18: DEBUG-FUNKTIONEN
// ============================================================================

/**
 * Simuliert ein onEdit-Event für Testzwecke.
 */
function debugOnEdit() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const ui = SpreadsheetApp.getUi();

  const cellResponse = ui.prompt(
    'Debug: handleOnEdit()',
    'Zelle zum Simulieren (z.B. "A1"):',
    ui.ButtonSet.OK_CANCEL
  );

  if (cellResponse.getSelectedButton() !== ui.Button.OK) return;

  const cellAddress = cellResponse.getResponseText().trim();
  let rangeToSimulate;
  
  try {
    rangeToSimulate = sheet.getRange(cellAddress);
  } catch (e) {
    ui.alert("Fehler", `Ungültige Zellenadresse: ${cellAddress}`, ui.ButtonSet.OK);
    return;
  }

  const valueResponse = ui.prompt(
    'Debug: handleOnEdit()',
    `Wert für Zelle ${cellAddress} (z.B. "TRUE", "FALSE"):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (valueResponse.getSelectedButton() !== ui.Button.OK) return;

  let simulatedValue = valueResponse.getResponseText();
  let simulatedOldValue = rangeToSimulate.getValue();

  // String "TRUE"/"FALSE" zu boolean konvertieren
  if (typeof simulatedValue === 'string') {
    if (simulatedValue.toLowerCase() === 'true') simulatedValue = true;
    else if (simulatedValue.toLowerCase() === 'false') simulatedValue = false;
  }

  if (typeof simulatedOldValue === 'string') {
    if (simulatedOldValue.toLowerCase() === 'true') simulatedOldValue = true;
    else if (simulatedOldValue.toLowerCase() === 'false') simulatedOldValue = false;
  }

  const dummyEvent = {
    range: rangeToSimulate,
    value: simulatedValue,
    oldValue: simulatedOldValue,
    source: ss
  };

  try {
    Logger.log(`[debugOnEdit] Simuliere für ${cellAddress}, Wert: ${simulatedValue}, AltWert: ${simulatedOldValue}`);
    handleOnEdit(dummyEvent);
    ui.alert("Debug: handleOnEdit()", `Erfolgreich für Zelle ${cellAddress} ausgeführt.`, ui.ButtonSet.OK);
  } catch (error) {
    Logger.log(`[debugOnEdit] Fehler: ${error.message}`);
    ui.alert("Fehler", `Fehler: ${error.message}.`, ui.ButtonSet.OK);
  }
}
