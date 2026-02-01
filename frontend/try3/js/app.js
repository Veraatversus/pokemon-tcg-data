import { CONFIG } from '../config/config.js';
import * as Auth from './auth.js';
import * as SheetsAPI from './sheets-api.js';
import * as UI from './ui.js';
import { Set, Card } from './models.js';
import { cache } from './cache.js';

let currentSet = null;
let allSets = [];

/**
 * Initialize Application
 */
async function init() {
  console.log('🎴 Pokémon TCG Tracker - Initializing...');
  console.log('Version: Try3 - Google Sheets API Frontend');

  try {
    // Initialize Google APIs
    await Auth.initializeGapi();
    Auth.initializeGis(handleAuthSuccess);

    // Set callbacks
    Auth.setAuthCallbacks(onSignIn, onSignOut);
    UI.setCheckboxCallback(handleCheckboxChange);

    // Setup event listeners
    setupEventListeners();

    console.log('✅ App initialized successfully');
  } catch (error) {
    console.error('❌ Initialization error:', error);
    UI.showError('Initialisierung fehlgeschlagen. Bitte Seite neu laden.');
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
  await loadSets();
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
    return;
  }

  UI.setLoading(true, 'Loading sets...');
  
  try {
    console.log('📥 Loading sets from Google Sheets...');
    
    // Read Sets Overview sheet
    const data = await SheetsAPI.readSheet(`${CONFIG.SHEETS.OVERVIEW}!A3:Z1000`);
    
    allSets = data
      .filter(row => row[0]) // Filter empty rows
      .map(row => new Set({
        id: row[0],
        name: row[1],
        series: row[2],
        total: parseInt(row[3]) || 0,
        releaseDate: row[4],
        sheetName: row[1]
      }));

    // Cache the sets
    cache.set('allSets', allSets);

    UI.renderSetSelector(allSets);
    console.log(`✅ Loaded ${allSets.length} sets`);
  } catch (error) {
    console.error('❌ Error loading sets:', error);
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
    UI.renderCardsGrid(currentSet.cards);
    UI.updateProgressInfo(currentSet.getProgress());
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

    UI.renderCardsGrid(set.cards);
    UI.updateProgressInfo(set.getProgress());
    
    console.log(`✅ Loaded ${cards.length} cards`);
    UI.showSuccess(`${cards.length} Karten geladen`);
  } catch (error) {
    console.error('❌ Error loading cards:', error);
    UI.showError('Fehler beim Laden der Karten. Bitte versuche es erneut.');
  } finally {
    UI.setLoading(false);
  }
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
      const numberRow = row;
      const imageRow = row + 1;
      const checkboxRow = row + 2;

      if (numberRow >= data.length || !data[numberRow]) break;

      const cardNumber = data[numberRow][baseCol];
      const cardName = data[numberRow][baseCol + 1];
      const imageUrl = data[imageRow] ? data[imageRow][baseCol] : '';
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
    
    // Invalidate cache
    cache.clear(`set_${currentSet.id}`);
    
    console.log('✅ Update successful');
    UI.showSuccess('Gespeichert!');
  } catch (error) {
    console.error('❌ Error updating checkbox:', error);
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
    } else {
      document.getElementById('cards-container').innerHTML = '';
      UI.setEmptyState(true);
      currentSet = null;
    }
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
}

// Start app when page loads
window.addEventListener('load', init);
