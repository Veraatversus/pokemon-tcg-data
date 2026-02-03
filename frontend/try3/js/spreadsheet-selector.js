/**
 * Spreadsheet Selector Module
 * Allows switching between different spreadsheets (own or shared)
 */
import { CONFIG } from '../config/config.js';

let currentSpreadsheetId = null;

/**
 * Initialize spreadsheet selector
 */
export function initSpreadsheetSelector() {
  const savedId = localStorage.getItem('selectedSpreadsheetId');
  if (savedId) {
    currentSpreadsheetId = savedId;
  }
}

/**
 * Get current spreadsheet ID
 */
export function getCurrentSpreadsheetId() {
  return currentSpreadsheetId || CONFIG.SPREADSHEET_ID;
}

/**
 * Set spreadsheet ID
 */
export function setSpreadsheetId(id) {
  currentSpreadsheetId = id;
  localStorage.setItem('selectedSpreadsheetId', id);
}

/**
 * Show spreadsheet selector modal
 */
export function showSpreadsheetSelector(currentId) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal spreadsheet-selector-modal">
      <div class="modal-header">
        <h2>📊 Google Sheets Tabelle wählen</h2>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body">
        <p class="info-text">Gib die Spreadsheet-ID der Tabelle ein, auf die du zugreifen möchtest:</p>
        
        <div class="input-group">
          <label for="spreadsheet-id-input">Spreadsheet ID:</label>
          <input 
            type="text" 
            id="spreadsheet-id-input" 
            class="text-input" 
            placeholder="z.B. 1RepZ5n-45tou-9vu20l8ffErT4TfBaLDdyY8BwxQDsI"
            value="${currentId || ''}"
          >
          <small class="help-text">
            Die ID findest du in der URL der Google Sheets Tabelle:<br>
            <code>https://docs.google.com/spreadsheets/d/<strong>SPREADSHEET_ID</strong>/edit</code>
          </small>
        </div>

        <div class="quick-select">
          <p><strong>Schnellauswahl:</strong></p>
          <button class="btn-secondary" onclick="document.getElementById('spreadsheet-id-input').value='1RepZ5n-45tou-9vu20l8ffErT4TfBaLDdyY8BwxQDsI'">
            Standard Tabelle
          </button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">
          Abbrechen
        </button>
        <button class="btn-primary" id="save-spreadsheet-btn">
          Tabelle laden
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Handle save
  document.getElementById('save-spreadsheet-btn').addEventListener('click', () => {
    const input = document.getElementById('spreadsheet-id-input');
    const id = input.value.trim();
    
    if (!id) {
      alert('Bitte gib eine Spreadsheet-ID ein');
      return;
    }

    // Validate ID format (basic check)
    if (id.length < 20 || id.includes(' ')) {
      alert('Die Spreadsheet-ID scheint ungültig zu sein');
      return;
    }

    setSpreadsheetId(id);
    modal.remove();
    
    // Reload page to apply new spreadsheet
    window.location.reload();
  });

  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// Make functions available globally
window.showSpreadsheetSelector = showSpreadsheetSelector;
window.getCurrentSpreadsheetId = getCurrentSpreadsheetId;
