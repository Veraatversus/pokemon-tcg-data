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

let currentSet = null;
let allSets = [];
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
    // Setup global error handlers
    Errors.setupGlobalErrorHandlers();

    // Initialize spreadsheet selector
    SpreadsheetSelector.initSpreadsheetSelector();

    // Validate configuration
    Errors.validateConfig();

    // Set callbacks first
    Auth.setAuthCallbacks(onSignIn, onSignOut);
    UI.setCheckboxCallback(handleCheckboxChange);

    // Initialize Google APIs and check for existing session
    const autoLoggedIn = await Auth.initAuth();
    
    // Only initialize GIS if not auto-logged in
    if (!autoLoggedIn) {
      Auth.initializeGis(handleAuthSuccess);
    }

    // Setup event listeners
    setupEventListeners();

    console.log('✅ App initialized successfully');
  } catch (error) {
    console.error('❌ Initialization error:', error);
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
      .map(row => new Set({
        id: row[0],                  // Col A: Set ID
        name: row[1],                // Col B: Set Name
        series: row[4] || '',        // Col E: Serie
        total: parseInt(row[6]) || 0, // Col G: Gesamtzahl Karten
        releaseDate: row[5] || '',   // Col F: Erscheinungsdatum
        sheetName: row[1]            // Col B: Set Name ist der Tab-Name in Sheets!
      }));

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
  // Auth buttons
  document.getElementById('authorize-button').addEventListener('click', () => {
    Auth.handleAuthClick();
  });

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
    const currentId = SpreadsheetSelector.getCurrentSpreadsheetId();
    SpreadsheetSelector.showSpreadsheetSelector(currentId);
  });

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
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterState.filter = btn.dataset.filter || 'all';
      applyFiltersAndRender();
    });
  });
}

// Start app when page loads
window.addEventListener('load', init);
