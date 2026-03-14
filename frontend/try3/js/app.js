console.log('🚀 app.js module START');
import { CONFIG } from '../config/config.js';
import * as Auth from './auth.js';
import * as SheetsAPI from './sheets-api.js';
import * as UI from './ui.js';
import * as Modals from './modals.js';
import * as Analytics from './analytics.js';
import * as Errors from './errors.js';
import { Set, Card } from './models.js';
import { cache } from './cache.js';
import { extractImageURL, extractCardmarketLink } from './sheets-api.js';
import { initZoom } from './zoom.js';
import * as SpreadsheetSelector from './spreadsheet-selector.js';
// Set Management
import { initializeSetManagement, loadSetImportStatus, getGlobalSetManager, openSetManagementPanel, triggerSetImport, triggerSetReimport } from './set-management.js';
// Setup
import { spreadsheetSetup } from './spreadsheet-setup.js';
// Script Selector
import { scriptSelector } from './script-selector.js';
// Phase 1 Imports
import { CardFilter, initializeGlobalFilter } from './filters.js';
import { BulkOperations, initializeBulkOperations } from './bulk-operations.js';
import { CollectionStats, initializeStats } from './statistics.js';
import { SearchFilterUI, injectSearchFilterUI } from './search-filter-ui.js';
import { StatsDashboardUI, initializeStatsDashboard } from './stats-dashboard-ui.js';

// Phase 2 Imports
import { CardmarketIntegration, initializeCardmarket } from './cardmarket-integration.js';
import { CardmarketUI, initializeCardmarketUI } from './cardmarket-ui.js';
import { ExportImport, initializeExportImport } from './export-import.js';
import { ExportImportUI, initializeExportImportUI } from './export-ui.js';
import { Settings, initializeSettings } from './settings.js';
import { SettingsUI, initializeSettingsUI } from './settings-ui.js';

// Phase 3 Imports - TEMPORARILY DISABLED FOR DEBUGGING
// import { AnalyticsAdvanced, initializeAnalytics } from './analytics-advanced.js';
// import { AnalyticsUI, initializeAnalyticsUI } from './analytics-ui.js';
// import { I18n, initializeI18n, getGlobalI18n } from './i18n.js';

let currentSet = null;
let allSets = [];
let currentFilter = null;
let currentStats = null;
let cardsWithStatus = [];
let searchDebounce = null;

const filterState = {
  search: '',
  filter: 'all',
  sort: 'number-asc'
};

/**
 * Initialize Application
 */
async function init() {
  console.log('🎴 Pokémon TCG Tracker - Initializing...');
  console.log('Version: Try3 - Google Sheets API Frontend');

  try {
    console.log('Step 1: Setting up error handlers...');
    // Setup global error handlers
    Errors.setupGlobalErrorHandlers();

    console.log('Step 2: Initializing i18n...');
    // Initialize i18n system (Phase 3)
    try {
      await initializeI18nSystem();
    } catch (e) {
      console.warn('i18n initialization failed (non-critical):', e);
    }

    console.log('Step 3: Initializing spreadsheet selector...');
    // Initialize spreadsheet selector
    SpreadsheetSelector.initSpreadsheetSelector();

    console.log('Step 4: Validating configuration...');
    // Validate configuration
    Errors.validateConfig();

    console.log('Step 5: Setting callbacks...');
    // Set callbacks first
    Auth.setAuthCallbacks(onSignIn, onSignOut);
    UI.setCheckboxCallback(handleCheckboxChange);

    console.log('Step 6: Initializing Google Auth...');
    // Initialize Google APIs and check for existing session
    const autoLoggedIn = await Auth.initAuth();
    console.log('Auth initialized. Auto-logged in:', autoLoggedIn);
    
    console.log('Step 7: Setting up GIS...');
    // Only initialize GIS if not auto-logged in
    if (!autoLoggedIn) {
      Auth.initializeGis(handleAuthSuccess);
    } else {
      // If auto-logged in, show the Script Selector
      console.log('Step 7b: Auto-logged in, checking for Script Selection...');
      await initializeScriptSelection();
    }

    console.log('Step 8: Setting up event listeners...');
    // Setup event listeners
    setupEventListeners();

    console.log('Step 9: Initializing Apps Script API...');
    // Load the Apps Script Execution API
    try {
      const { initializeAppsScriptAPI } = await import('./appscript-executor.js');
      await initializeAppsScriptAPI();
      console.log('✅ Apps Script API initialized');
    } catch (error) {
      console.warn('⚠️ Apps Script API initialization skipped:', error.message);
    }

    console.log('✅ App initialized successfully');
  } catch (error) {
    console.error('❌ Initialization error:', error);
    console.error('Error stack:', error.stack);
    Errors.handleError(error, 'init');
    UI.showError(error.message || 'Initialisierung fehlgeschlagen. Bitte Seite neu laden.');
  }
}

/**
 * Handle successful authentication
 */
function handleAuthSuccess() {
  console.log('✅ Authentication successful');
  
  document.getElementById('auth-container').style.display = 'none';
  document.getElementById('main-container').style.display = 'block';
  
  const email = Auth.getUserEmail();
  if (email) {
    UI.displayUserInfo(email);
  }
  
  loadSets();
}

/**
 * Handle Sign In
 */
async function onSignIn() {
  console.log('User signed in');
  
  // Show main container and hide auth screen
  document.getElementById('auth-container').style.display = 'none';
  document.getElementById('main-container').style.display = 'block';
  
  const email = Auth.getUserEmail();
  if (email) {
    UI.displayUserInfo(email);
  }
  
  // Check Script Selection if not already initialized
  const savedSelection = scriptSelector.loadSelection();
  if (!savedSelection || !savedSelection.spreadsheetId || !savedSelection.webAppUrl) {
    console.log('📋 No complete selection found, showing Script Selection Menu...');
    const selection = await scriptSelector.showSelectionMenu();
    
    if (selection) {
      spreadsheetSetup.setWebAppUrl(selection.webAppUrl);
      spreadsheetSetup.setSpreadsheetId(selection.spreadsheetId);
    } else {
      console.warn('⚠️ Script selection cancelled');
      return;
    }
  } else {
    // Auch bei vorhandener Selection muss spreadsheetSetup aktualisiert werden
    spreadsheetSetup.setWebAppUrl(savedSelection.webAppUrl);
    spreadsheetSetup.setSpreadsheetId(savedSelection.spreadsheetId);
    console.log('✅ Using saved selection from cookies');
  }
  
  await loadSets();
  
  // Zoom will be initialized when cards are loaded
}

/**
 * Handle Sign Out
 */
function onSignOut() {
  console.log('User signed out');
  
  document.getElementById('auth-container').style.display = 'block';
  document.getElementById('main-container').style.display = 'none';
  document.getElementById('cards-container').innerHTML = '';
  document.getElementById('set-selector').selectedIndex = 0;
  
  allSets = [];
  currentSet = null;
  cache.clear();
}

/**
 * Extract Set ID from HYPERLINK formula or plain text
 * Handles: =HYPERLINK("url"; "id") or just "id"
 */
function extractSetId(cellValue) {
  if (!cellValue) return '';
  
  const str = cellValue.toString();
  
  // Check if it's a HYPERLINK formula
  if (str.includes('HYPERLINK')) {
    // Extract the ID from HYPERLINK("..."; "ID")
    const match = str.match(/HYPERLINK\([^;]*;\s*"([^"]*)"\)/);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return str;
}

/**
 * Load all sets from Google Sheets
 */
async function loadSets() {
  // Check cache first
  const cached = cache.get('allSets');
  if (cached) {
    console.log('📦 Using cached sets');
    allSets = cached;
    UI.renderSetSelector(allSets);
    UI.setEmptyState(true);
    UI.updateStatsBar({
      visible: 0,
      total: 0,
      collected: 0,
      reverseHolo: 0,
      missing: 0
    });
    return;
  }

  UI.setLoading(true, 'Loading sets...');
  
  try {
    console.log('📥 Loading sets from Google Sheets...');
    
    // Read Sets Overview sheet (data starts at row 4, row 3 is header)
    const data = await SheetsAPI.readSheet(`${CONFIG.SHEETS.OVERVIEW}!A4:Z1000`);
    
    allSets = data
      .filter(row => row[0]) // Filter empty rows
      .map(row => {
        const setId = extractSetId(row[0]); // Extract from HYPERLINK if needed
        return new Set({
          id: setId,                   // Col A: Set ID (cleaned)
          name: row[1],                // Col B: Set Name
          series: row[4] || '',        // Col E: Serie
          total: parseInt(row[6]) || 0, // Col G: Gesamtzahl Karten
          releaseDate: row[5] || '',   // Col F: Erscheinungsdatum
          sheetName: row[1]            // Col B: Set Name ist der Tab-Name in Sheets!
        });
      });

    // Cache the sets
    cache.set('allSets', allSets);

    UI.renderSetSelector(allSets);
    UI.setEmptyState(true);
    UI.updateStatsBar({
      visible: 0,
      total: 0,
      collected: 0,
      reverseHolo: 0,
      missing: 0
    });
    console.log(`✅ Loaded ${allSets.length} sets`);

    // Initialize Set Management after sets are loaded
    console.log('🎯 Initializing Set Management...');
    initializeSetManagement(allSets);
    
    // Load import status from spreadsheet async (non-blocking)
    loadSetImportStatus(CONFIG.SPREADSHEET_ID).catch(error => {
      console.warn('⚠️ Could not load set import status:', error);
    });
  } catch (error) {
    console.error('❌ Error loading sets:', error);
    Errors.handleError(error, 'loadSets');
    UI.showError('Fehler beim Laden der Sets. Bitte versuche es erneut.');
  } finally {
    UI.setLoading(false);
  }
}

/**
 * Load cards for selected set
 */
async function loadSetCards(setId) {
  const cacheKey = `set_${setId}`;
  const cached = cache.get(cacheKey);
  
  if (cached) {
    console.log(`📦 Using cached cards for set: ${setId}`);
    currentSet = cached;
    applyFiltersAndRender();
    return;
  }

  UI.setLoading(true, 'Loading cards...');
  
  try {
    console.log(`📥 Loading cards for set: ${setId}`);
    
    const set = allSets.find(s => s.id === setId);
    if (!set) {
      throw new Error('Set not found');
    }

    // Read set sheet data
    const sheetName = set.sheetName;
    const data = await SheetsAPI.readSheet(`${sheetName}!A1:Z1000`);

    // Parse cards from grid layout
    const cards = parseCardsFromGrid(data, sheetName);
    cards.forEach(card => set.addCard(card));

    currentSet = set;
    
    // Cache the set
    cache.set(cacheKey, currentSet);

    applyFiltersAndRender();
    
    // Initialize zoom controls after first cards are loaded
    if (!window._zoomInitialized) {
      initZoom('cards-container');
      window._zoomInitialized = true;
    }
    
    console.log(`✅ Loaded ${cards.length} cards`);
    UI.showSuccess(`${cards.length} Karten geladen`);
    
    // Initialize Phase 1 features
    cardsWithStatus = cards;
    initPhase1Features();
  } catch (error) {
    console.error('❌ Error loading cards:', error);
    Errors.handleError(error, 'loadSetCards');
    UI.showError('Fehler beim Laden der Karten. Bitte versuche es erneut.');
  } finally {
    UI.setLoading(false);
  }
}

/**
 * Apply filters, sorting, and render
 */
function applyFiltersAndRender() {
  if (!currentSet) {
    UI.setEmptyState(true);
    UI.updateStatsBar({
      visible: 0,
      total: 0,
      collected: 0,
      reverseHolo: 0,
      missing: 0
    });
    return;
  }

  const filtered = getFilteredCards(currentSet.cards);
  UI.renderCardsGrid(filtered, 'Keine Karten für den aktuellen Filter gefunden');
  UI.updateProgressInfo(currentSet.getProgress());
  UI.updateStatsBar(getStats(currentSet.cards, filtered));
}

/**
 * Filter and sort cards
 */
function getFilteredCards(cards) {
  const search = filterState.search.trim().toLowerCase();
  let result = cards;

  if (search) {
    result = result.filter(card => {
      const numberMatch = String(card.number).toLowerCase().includes(search);
      const nameMatch = String(card.name).toLowerCase().includes(search);
      return numberMatch || nameMatch;
    });
  }

  switch (filterState.filter) {
    case 'collected':
      result = result.filter(card => card.collected || card.reverseHolo);
      break;
    case 'missing':
      result = result.filter(card => !card.collected && !card.reverseHolo);
      break;
    case 'reverse':
      result = result.filter(card => card.reverseHolo);
      break;
    default:
      break;
  }

  const sorted = [...result];
  switch (filterState.sort) {
    case 'number-desc':
      sorted.sort((a, b) => compareNumbers(b.number, a.number));
      break;
    case 'name-asc':
      sorted.sort((a, b) => String(a.name).localeCompare(String(b.name), 'de', { numeric: true }));
      break;
    case 'name-desc':
      sorted.sort((a, b) => String(b.name).localeCompare(String(a.name), 'de', { numeric: true }));
      break;
    case 'number-asc':
    default:
      sorted.sort((a, b) => compareNumbers(a.number, b.number));
      break;
  }

  return sorted;
}

function compareNumbers(a, b) {
  return String(a).localeCompare(String(b), 'de', { numeric: true, sensitivity: 'base' });
}

function getStats(allCards, visibleCards) {
  const collected = allCards.filter(card => card.collected).length;
  const reverseHolo = allCards.filter(card => card.reverseHolo).length;
  const missing = allCards.filter(card => !card.collected && !card.reverseHolo).length;

  return {
    visible: visibleCards.length,
    total: allCards.length,
    collected,
    reverseHolo,
    missing
  };
}

/**
 * Parse cards from grid layout
 */
function parseCardsFromGrid(data, sheetName) {
  const cards = [];
  const BLOCK_HEIGHT = CONFIG.CARD_BLOCK_HEIGHT;
  const BLOCK_WIDTH = CONFIG.CARD_BLOCK_WIDTH;
  const CARDS_PER_ROW = CONFIG.CARDS_PER_ROW;

  // Skip header rows (first 2 rows)
  for (let row = 2; row < data.length; row += BLOCK_HEIGHT) {
    for (let col = 0; col < CARDS_PER_ROW; col++) {
      const baseCol = col * BLOCK_WIDTH;
      
      // Extract card data from grid
      // Row 0: Col 1 = Card ID, Col 2 = Card Name, Col 3 = Card Name
      const numberRow = row;
      const imageRow = row + 1;
      const checkboxRow = row + 2;

      if (numberRow >= data.length || !data[numberRow]) break;

      const cardNumber = data[numberRow][baseCol];  // Col 1: Card ID
      const cardName = data[numberRow][baseCol + 1] || data[numberRow][baseCol + 2];  // Col 2 or Col 3: Card Name
      
      // Extract image URL from IMAGE formula
      const imageFormula = data[imageRow] ? data[imageRow][baseCol] : '';
      const imageUrl = extractImageURL(imageFormula);
      
      // Cardmarket Link in Col 3 of checkbox row - extract from HYPERLINK formula
      const cardmarketFormula = data[checkboxRow] ? data[checkboxRow][baseCol + 2] : '';
      const cardmarketLink = extractCardmarketLink(cardmarketFormula);
      
      // Checkboxes: Col 1 = Normal (always visible), Col 2 = RH (conditional)
      const normalChecked = data[checkboxRow] ? 
        (data[checkboxRow][baseCol] === 'TRUE' || data[checkboxRow][baseCol] === true) : false;
      const reverseHoloChecked = data[checkboxRow] ? 
        (data[checkboxRow][baseCol + 1] === 'TRUE' || data[checkboxRow][baseCol + 1] === true) : false;

      if (cardNumber) {
        cards.push(new Card({
          id: `${sheetName}-${cardNumber}`,
          number: cardNumber,
          name: cardName || 'Unknown Card',
          imageUrl: imageUrl || '',
          cardmarketLink: cardmarketLink || '',
          collected: normalChecked,
          reverseHolo: reverseHoloChecked,
          row: checkboxRow + 1, // 1-indexed
          colNormal: baseCol + 1, // 1-indexed
          colReverseHolo: baseCol + 2
        }));
      }
    }
  }

  return cards;
}

/**
 * Handle checkbox change
 */
async function handleCheckboxChange(card, type, checked) {
  try {
    console.log(`🔄 Updating ${type} for card ${card.id}: ${checked}`);

    const sheetName = currentSet.sheetName;
    const col = type === 'normal' ? card.colNormal : card.colReverseHolo;

    // Update in Google Sheets
    await SheetsAPI.updateCheckbox(sheetName, card.row, col, checked);
    
    // Update local state
    if (type === 'normal') {
      card.collected = checked;
    } else {
      card.reverseHolo = checked;
    }

    // Update UI
    UI.updateCardState(card.id, type, checked);
    UI.updateProgressInfo(currentSet.getProgress());
    
    // Update Phase 1 statistics
    updatePhase1Stats();
    
    applyFiltersAndRender();
    
    // Invalidate cache
    cache.clear(`set_${currentSet.id}`);
    
    console.log('✅ Update successful');
    UI.showSuccess('Gespeichert!');
  } catch (error) {
    console.error('❌ Error updating checkbox:', error);
    Errors.handleError(error, 'handleCheckboxChange');
    UI.showError('Fehler beim Speichern. Bitte versuche es erneut.');
    
    // Reload to sync state
    setTimeout(() => {
      loadSetCards(currentSet.id);
    }, 1000);
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  console.log('📌 Setting up event listeners...');
  
  // Auth buttons
  const authBtn = document.getElementById('authorize-button');
  console.log('Auth button found:', !!authBtn);
  
  if (authBtn) {
    authBtn.addEventListener('click', () => {
      console.log('🖱️ Auth button clicked!');
      Auth.handleAuthClick();
    });
  } else {
    console.error('❌ Auth button not found!');
  }

  document.getElementById('signout-button').addEventListener('click', () => {
    if (confirm('Möchtest du dich wirklich abmelden?')) {
      Auth.handleSignoutClick();
    }
  });

  // Set selector
  document.getElementById('set-selector').addEventListener('change', (e) => {
    if (e.target.value) {
      loadSetCards(e.target.value);
      document.getElementById('set-details-btn').style.display = 'block';
    } else {
      document.getElementById('cards-container').innerHTML = '';
      UI.setEmptyState(true);
      currentSet = null;
      document.getElementById('set-details-btn').style.display = 'none';
      UI.updateStatsBar({
        visible: 0,
        total: 0,
        collected: 0,
        reverseHolo: 0,
        missing: 0
      });
    }
  });

  // Change spreadsheet button
  document.getElementById('change-spreadsheet-btn').addEventListener('click', () => {
    console.log('🎯 Change Spreadsheet button clicked!');
    changeScript();
  });

  // Setup button
  const setupBtn = document.getElementById('setup-btn');
  if (setupBtn) {
    console.log('✅ Setup button found');
    setupBtn.addEventListener('click', async () => {
      console.log('🎯 Setup button clicked!');
      await spreadsheetSetup.openSetupDialog();
    });
  } else {
    console.warn('⚠️ Setup button not found');
  }

  // Set Management button
  const manageSetBtn = document.getElementById('manage-sets-btn');
  if (manageSetBtn) {
    console.log('✅ Manage Sets button found');
    manageSetBtn.addEventListener('click', () => {
      console.log('🎯 Manage Sets button clicked!');
      openSetManagementPanel(currentSet?.id);
    });
  } else {
    console.warn('⚠️ Manage Sets button not found');
  }

  // Refresh button
  document.getElementById('refresh-button').addEventListener('click', () => {
    if (currentSet) {
      cache.clear(`set_${currentSet.id}`);
      loadSetCards(currentSet.id);
    } else {
      cache.clear('allSets');
      loadSets();
    }
  });

  // Analytics button
  const analyticsBtn = document.getElementById('analytics-btn');
  if (analyticsBtn) {
    analyticsBtn.addEventListener('click', () => {
      const analyticsContent = Analytics.createAnalyticsModal(allSets);
      Modals.showModal('📈 Sammlungs-Statistiken', analyticsContent);
    });
  }

  // Set Details button
  const setDetailsBtn = document.getElementById('set-details-btn');
  if (setDetailsBtn) {
    setDetailsBtn.addEventListener('click', () => {
      if (currentSet) {
        Modals.showSetDetailsModal(currentSet);
      }
    });
  }

  // Search input
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      filterState.search = e.target.value;
      searchDebounce = setTimeout(() => applyFiltersAndRender(), 200);
    });
  }

  // Sort selector
  const sortSelector = document.getElementById('sort-selector');
  if (sortSelector) {
    sortSelector.addEventListener('change', (e) => {
      filterState.sort = e.target.value;
      applyFiltersAndRender();
    });
  }

  // Filter buttons
  const filterButtons = document.querySelectorAll('.filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Handle bulk operations
      if (btn.dataset.bulk) {
        handleBulkOperation(btn.dataset.bulk);
        return;
      }

      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterState.filter = btn.dataset.filter || 'all';
      applyFiltersAndRender();
    });
  });
}

// ============================================================================
// SET MANAGEMENT EVENT HANDLERS
// ============================================================================

/**
 * Handle Set Management actions (import, load, reimport)
 */
document.addEventListener('set-management-action', async (e) => {
  const { action, setId } = e.detail;
  console.log(`🎯 Set management action: ${action} for set ${setId}`);
  
  try {
    switch (action) {
      case 'load':
        console.log(`📂 Loading set: ${setId}`);
        loadSetCards(setId);
        
        // Close the panel after loading
        setTimeout(() => {
          const panel = document.querySelector('.set-management-panel');
          if (panel) panel.remove();
        }, 500);
        break;
        
      case 'import':
        console.log(`➕ Import set: ${setId}`);
        try {
          UI.setLoading(true, `Importiere Set ${setId}...`);
          await triggerSetImport(setId);
          UI.showSuccess(`✅ Import für "${setId}" wurde gestartet!`);
          
          // Mark as imported in UI
          setTimeout(() => {
            const setMgr = getGlobalSetManager();
            if (setMgr) {
              setMgr.markAsImported(setId);
            }
          }, 2000);
        } catch (error) {
          console.error('Import error:', error);
          UI.showError(`Fehler beim Import von "${setId}": ${error.message}`);
        } finally {
          UI.setLoading(false);
        }
        break;
        
      case 'reimport':
        console.log(`🔄 Reimport set: ${setId}`);
        try {
          UI.setLoading(true, `Reimportiere Set ${setId}...`);
          await triggerSetReimport(setId);
          UI.showSuccess(`✅ Reimport für "${setId}" wurde gestartet!`);
        } catch (error) {
          console.error('Reimport error:', error);
          UI.showError(`Fehler beim Reimport von "${setId}": ${error.message}`);
        } finally {
          UI.setLoading(false);
        }
        break;
        
      default:
        console.warn(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error(`Error handling set action: ${action}`, error);
    UI.showError(`Fehler bei Aktion "${action}": ${error.message}`);
  }
});

// ============================================================================
// PHASE 1: BULK OPERATIONS & ADVANCED FILTERING
// ============================================================================

/**
 * Handle bulk operations (select all, deselect all, etc.)
 */
function handleBulkOperation(operation) {
  if (!currentSet) return;

  const bulkOps = initializeBulkOperations();
  
  switch (operation) {
    case 'selectAll':
      bulkOps.selectAll(cardsWithStatus);
      UI.showSuccess('✅ Alle Karten gewählt');
      break;
    case 'deselectAll':
      bulkOps.deselectAll();
      UI.showSuccess('❌ Auswahl aufgehoben');
      break;
  }
}

/**
 * Initialize Phase 1 features after cards load
 */
function initPhase1Features() {
  if (!currentSet) return;

  // Initialize global filter with current cards
  currentFilter = initializeGlobalFilter(cardsWithStatus);
  currentStats = initializeStats();

  // Calculate statistics for current set
  const setStats = currentStats.calculateSetStats(cardsWithStatus, currentSet.id);
  
  // Render statistics dashboard
  const statsUI = initializeStatsDashboard();
  const statsBar = document.getElementById('stats-bar');
  if (statsBar) {
    statsBar.innerHTML = statsUI.createStatsBar(setStats);
  }

  // Log Phase 1 features ready
  console.log('✅ Phase 1 features initialized (Filters, Stats, Bulk Ops)');
}

/**
 * Update Phase 1 statistics after card state change
 */
function updatePhase1Stats() {
  if (!currentSet || !currentStats) return;

  const setStats = currentStats.calculateSetStats(cardsWithStatus, currentSet.id);
  const statsUI = initializeStatsDashboard();
  statsUI.updateStats(setStats);
}

// ============================================================================
// PHASE 2: CARDMARKET, EXPORT/IMPORT, SETTINGS EVENT HANDLERS
// ============================================================================

/**
 * Handle Cardmarket price action
 */
document.addEventListener('cardmarket-action', async (e) => {
  const action = e.detail.action;
  
  if (!currentSet || !cardsWithStatus) {
    UI.showError('Bitte lade zuerst eine Kartensammlung');
    return;
  }

  const cardmarket = initializeCardmarket();
  const cardmarketUI = initializeCardmarketUI();

  switch (action) {
    case 'prices':
      // Show price information panel
      const prices = await cardmarket.getPrices(cardsWithStatus);
      const pricePanel = cardmarketUI.createPriceTrendInfo(prices);
      
      // Insert into DOM
      let container = document.querySelector('.price-info-container');
      if (!container) {
        container = document.createElement('div');
        container.className = 'price-info-container';
        document.querySelector('main').parentElement.insertBefore(container, document.querySelector('main'));
      }
      container.innerHTML = '';
      container.appendChild(pricePanel);
      UI.showSuccess('💰 Preise geladen');
      break;

    case 'value':
      // Show collection value panel
      const collectionValue = await cardmarket.calculateCollectionValue(cardsWithStatus);
      const valuePanel = cardmarketUI.createCollectionValuePanel(collectionValue);
      
      let valueContainer = document.querySelector('.collection-value-container');
      if (!valueContainer) {
        valueContainer = document.createElement('div');
        valueContainer.className = 'collection-value-container';
        document.querySelector('main').parentElement.insertBefore(valueContainer, document.querySelector('main'));
      }
      valueContainer.innerHTML = '';
      valueContainer.appendChild(valuePanel);
      UI.showSuccess('📊 Sammlungswert berechnet');
      break;

    case 'wishlist':
      // Show wishlist
      const wishlistPrices = await cardmarket.getPrices(cardsWithStatus);
      const wishlistPanel = cardmarketUI.createWishlistPanel(cardsWithStatus, wishlistPrices);
      
      let wishlistContainer = document.querySelector('.wishlist-container');
      if (!wishlistContainer) {
        wishlistContainer = document.createElement('div');
        wishlistContainer.className = 'wishlist-container';
        document.querySelector('main').parentElement.insertBefore(wishlistContainer, document.querySelector('main'));
      }
      wishlistContainer.innerHTML = '';
      wishlistContainer.appendChild(wishlistPanel);
      UI.showSuccess('⭐ Top 10 fehlende Karten geladen');
      break;
  }
});

/**
 * Handle Export/Import action
 */
document.addEventListener('export-import-action', async (e) => {
  const action = e.detail.action;
  const exportImport = initializeExportImport();
  const exportImportUI = initializeExportImportUI();
  exportImportUI.exportImport = exportImport;

  if (action === 'export') {
    const dialog = exportImportUI.createExportDialog(cardsWithStatus, currentSet?.id || 'collection');
    document.body.appendChild(dialog);

    // Setup export button
    const exportBtn = dialog.querySelector('.btn-export');
    exportBtn.addEventListener('click', (e) => {
      e.preventDefault();

      const format = dialog.querySelector('input[name="export-format"]:checked').value;
      const scope = dialog.querySelector('input[name="export-scope"]:checked').value;
      
      let cardsToExport = cardsWithStatus;

      // Filter by scope
      if (scope === 'collected') {
        cardsToExport = cardsWithStatus.filter(c => c.collected || c.reverseHolo);
      } else if (scope === 'missing') {
        cardsToExport = cardsWithStatus.filter(c => !c.collected && !c.reverseHolo);
      }

      // Get selected columns for CSV
      let columns = ['number', 'name', 'set', 'rarity', 'collected', 'reverseHolo'];
      if (format === 'csv') {
        const checkboxes = dialog.querySelectorAll('.column-toggle:checked');
        columns = Array.from(checkboxes).map(cb => cb.value);
      }

      try {
        if (format === 'csv') {
          exportImport.exportToCSV(cardsToExport, currentSet?.id || 'collection', columns);
        } else if (format === 'json') {
          exportImport.exportToJSON(cardsToExport, currentSet?.id || 'collection');
        } else if (format === 'backup') {
          exportImport.exportFullBackup([currentSet], []);
        }
        
        exportImportUI.showSuccessMessage(`✅ ${cardsToExport.length} Karten exportiert`);
        dialog.remove();
      } catch (error) {
        exportImportUI.showErrorMessage(error.message);
      }
    });

    // Setup cancel button
    const cancelBtn = dialog.querySelector('.btn-cancel');
    cancelBtn.addEventListener('click', () => dialog.remove());
    dialog.querySelector('.close-btn').addEventListener('click', () => dialog.remove());

  } else if (action === 'import') {
    const dialog = exportImportUI.createImportDialog();
    document.body.appendChild(dialog);

    // Setup cancel button
    const cancelBtn = dialog.querySelector('.btn-cancel');
    cancelBtn.addEventListener('click', () => dialog.remove());
    dialog.querySelector('.close-btn').addEventListener('click', () => dialog.remove());

    // Setup import button
    const importBtn = dialog.querySelector('.btn-import');
    if (importBtn) {
      importBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        if (!dialog._importData) {
          exportImportUI.showErrorMessage('Keine Datei ausgewählt');
          return;
        }

        try {
          const strategy = dialog.querySelector('input[name="merge-strategy"]:checked').value;
          const merged = exportImport.mergeImportedData(cardsWithStatus, dialog._importData.cards, strategy);
          
          // Update local state
          cardsWithStatus = merged;
          
          // Sync with Google Sheets (batch update)
          // This would require implementing batch update functionality
          
          exportImportUI.showSuccessMessage(`✅ ${dialog._importData.cards.length} Karten importiert`);
          dialog.remove();
        } catch (error) {
          exportImportUI.showErrorMessage(error.message);
        }
      });
    }
  }
});

/**
 * Handle Settings action
 */
document.addEventListener('settings-action', (e) => {
  if (e.detail.action === 'open') {
    const settings = initializeSettings();
    const settingsUI = initializeSettingsUI(settings);
    
    const panel = settingsUI.createSettingsPanel();
    document.body.appendChild(panel);

    // Load current settings into form
    settingsUI.loadSettingsIntoForm(panel);

    // Setup events
    settingsUI.setupSettingsPanelEvents(panel);

    // Close button
    panel.querySelector('.settings-modal .close-btn').addEventListener('click', () => {
      panel.classList.add('fade-out');
      setTimeout(() => panel.remove(), 300);
    });
  }
});

/**
 * Handle Settings data actions
 */
document.addEventListener('settings-data-action', async (e) => {
  const action = e.detail.action;
  const settings = initializeSettings();
  const settingsUI = initializeSettingsUI(settings);

  switch (action) {
    case 'backup':
      const backup = JSON.stringify(settings.getAll(), null, 2);
      const blob = new Blob([backup], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `settings-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      settingsUI.showNotification('✅ Sicherung erstellt', 'success');
      break;

    case 'restore':
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const data = evt.target.result;
            if (settings.import(data)) {
              settingsUI.showNotification('✅ Sicherung wiederhergestellt', 'success');
              window.location.reload();
            } else {
              settingsUI.showNotification('❌ Fehler beim Importieren', 'error');
            }
          } catch (error) {
            settingsUI.showNotification('❌ ' + error.message, 'error');
          }
        };
        reader.readAsText(file);
      });
      input.click();
      break;

    case 'clear-cache':
      const cardmarket = initializeCardmarket();
      cardmarket.clearCache();
      settingsUI.showNotification('✅ Cache geleert', 'success');
      break;

    case 'reset':
      if (confirm('Alle Einstellungen auf Standard zurücksetzen?')) {
        settings.resetToDefaults();
        settingsUI.showNotification('✅ Auf Standard zurückgesetzt', 'success');
        window.location.reload();
      }
      break;
  }
});

// ============================================================================
// PHASE 3: ANALYTICS & I18N EVENT HANDLERS
// ============================================================================

/**
 * Handle Analytics action
 */
document.addEventListener('analytics-action', async (e) => {
  console.log('⚠️ Analytics feature temporarily disabled for debugging');
  UI.showError('Analytics ist vorübergehend deaktiviert (Debugging)');
  return;
  /*
  if (e.detail.action === 'open') {
    if (!currentSet || !cardsWithStatus) {
      UI.showError('Bitte lade zuerst eine Kartensammlung');
      return;
    }

    const analytics = initializeAnalytics();
    const analyticsUI = initializeAnalyticsUI(analytics);

    // Calculate current stats
    const statsData = {
      totalCards: cardsWithStatus.length,
      collectedCards: cardsWithStatus.filter(c => c.collected || c.reverseHolo).length,
      reverseHoloCards: cardsWithStatus.filter(c => c.reverseHolo).length,
      completionPercent: cardsWithStatus.length > 0
        ? ((cardsWithStatus.filter(c => c.collected || c.reverseHolo).length / cardsWithStatus.length) * 100).toFixed(1)
        : 0
    };

    analytics.recordSnapshot([currentSet], statsData);

    // Create and show dashboard
    const dashboard = analyticsUI.createDashboard(statsData, [currentSet]);
    document.body.appendChild(dashboard);

    // Setup close button
    dashboard.querySelector('.close-btn').addEventListener('click', () => {
      dashboard.classList.add('fade-out');
      setTimeout(() => dashboard.remove(), 300);
    });

    // Setup export button
    dashboard.querySelector('.btn-export-analytics').addEventListener('click', () => {
      const data = analytics.exportData();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      UI.showSuccess('✅ Analytics exportiert');
    });

    // Setup clear history button
    dashboard.querySelector('.btn-clear-history').addEventListener('click', () => {
      if (confirm('Analytics-Verlauf wirklich löschen?')) {
        analytics.clearHistory();
        dashboard.remove();
        UI.showSuccess('✅ Verlauf gelöscht');
      }
    });

    // Draw charts after dashboard is added to DOM
    setTimeout(() => {
      const progressData = analytics.getProgressOverTime(30);
      const velocityData = analytics.getVelocity(4);
      analyticsUI.drawProgressChart('progress-chart', progressData);
      analyticsUI.drawVelocityChart('velocity-chart', velocityData);
    }, 100);
  }
  */
});

/**
 * Initialize Script Selection
 * Called after successful authentication
 */
async function initializeScriptSelection() {
  console.log('🎯 Initializing Script Selection...');
  
  try {
    // Check if user already has a saved selection
    const savedSelection = scriptSelector.loadSelection();
    
    if (savedSelection && savedSelection.spreadsheetId && savedSelection.webAppUrl) {
      console.log(`✅ Using saved selection: ${savedSelection.scriptName}`);
      
      // Update spreadsheet setup with saved values
      spreadsheetSetup.setWebAppUrl(savedSelection.webAppUrl);
      spreadsheetSetup.setSpreadsheetId(savedSelection.spreadsheetId);
      
      // Proceed to load app
      handleAuthSuccess();
    } else {
      console.log('📋 No complete selection found. Showing Script Selection Menu...');
      
      // Show selection menu
      const selection = await scriptSelector.showSelectionMenu();
      
      if (selection) {
        // Update spreadsheet setup with selected values
        spreadsheetSetup.setWebAppUrl(selection.webAppUrl);
        spreadsheetSetup.setSpreadsheetId(selection.spreadsheetId);
        
        // Proceed to load app
        handleAuthSuccess();
      } else {
        console.log('⚠️ Script selection cancelled');
        UI.showError('Keine Auswahl getroffen. Bitte versuche es erneut.');
      }
    }
  } catch (error) {
    console.error('❌ Script selection error:', error);
    UI.showError('Fehler bei der Script-Auswahl: ' + error.message);
  }
}

/**
 * Show Script Change Menu (for later use with "Change Spreadsheet" button)
 */
async function changeScript() {
  console.log('🔄 Changing Script Selection...');
  
  try {
    // Clear current selection to force menu
    scriptSelector.clearSelection();
    
    // Show selection menu
    const selection = await scriptSelector.showSelectionMenu();
    
    if (selection) {
      // Update spreadsheet setup
      spreadsheetSetup.setWebAppUrl(selection.webAppUrl);
      spreadsheetSetup.setSpreadsheetId(selection.spreadsheetId);
      
      // Clear cache and reload
      cache.clear();
      UI.showSuccess(`✅ Wechsel zu: ${selection.scriptName}`);
      
      // Reload the app
      setTimeout(() => location.reload(), 500);
    } else {
      console.log('⚠️ Script change cancelled');
    }
  } catch (error) {
    console.error('❌ Script change error:', error);
    UI.showError('Fehler beim Wechsel: ' + error.message);
  }
}

/**
 * Initialize i18n on app start
 */
async function initializeI18nSystem() {
  console.log('⚠️ i18n disabled for debugging');
  return; // Temporarily disabled
  /*
  const i18n = initializeI18n();
  console.log(`✅ i18n initialized (Language: ${i18n.getLanguage()})`);

  // Listen for language changes
  document.addEventListener('language-changed', (e) => {
    console.log(`🌍 Language changed to: ${e.detail.language}`);
    i18n.updateDOM();
  });

  // Initial DOM update
  i18n.updateDOM();
  */
}

// Initialize app when DOM is ready
window.addEventListener('load', init);

// Export functions for global access
window.changeScript = changeScript;
window.initializeScriptSelection = initializeScriptSelection;

