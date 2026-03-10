/**
 * Set Management Module
 * 
 * Verwaltet die Anzeige von Sets mit Import-Status
 * Filtert zwischen "Alle Sets" und "Nur importierte"
 * Bietet UI für einzelne Set-Verwaltung
 */

export class SetManager {
  constructor() {
    this.allSets = [];
    this.importedSets = new Set(); // Set IDs der importierten Sets
    this.filterMode = 'all'; // 'all' oder 'imported'
  }

  /**
   * Lade Import-Status aus der Spreadsheet
   * Liest die "Importiert" Checkbox Spalte (I) aus Sets Overview
   */
  async loadImportStatus(spreadsheetId) {
    try {
      console.log('📥 Loading set import status from Spreadsheet...');
      
      // Use gapi.client.sheets directly
      const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: "'Sets Overview'!A:K" // Read up to column K to be safe
      });

      const values = response.result.values || [];
      console.log('📊 Sets Overview data rows:', values.length);
      
      // Log first few rows for debugging
      for (let i = 0; i < Math.min(3, values.length); i++) {
        console.log(`Row ${i}:`, values[i]);
      }

      // Spalte I ist Index 8 (0-basiert), aber wir überspringen Header (erste 2 Zeilen)
      for (let i = 2; i < values.length; i++) {
        const row = values[i];
        if (!row || row.length < 1) continue;
        
        const setId = row[0]; // Spalte A = Set ID
        if (!setId) continue;
        
        // Spalte I (Index 8) = Importiert Checkbox
        const isImported = row[8] === true || row[8] === 'TRUE' || row[8] === 'true' || row[8] === 'WAHR';
        
        if (isImported) {
          this.importedSets.add(setId);
          console.log(`✅ Set importiert: ${setId}`);
        }
      }
      
      console.log(`📊 Total importierte Sets geladen: ${this.importedSets.size}`);
    } catch (error) {
      console.error('Error loading import status:', error);
      throw error;
    }
  }

  /**
   * Setzt die Liste aller verfügbaren Sets
   */
  setAllSets(sets) {
    this.allSets = sets;
  }

  /**
   * Gibt gefilterte Sets zurück basierend auf aktuellem Filter
   */
  getFilteredSets() {
    if (this.filterMode === 'imported') {
      console.log(`🔍 Filtering for imported sets. Total in list: ${this.importedSets.size}`);
      console.log('Imported Set IDs:', Array.from(this.importedSets).slice(0, 5));
      console.log('All Set IDs (first 5):', this.allSets.slice(0, 5).map(s => s.id));
      
      const filtered = this.allSets.filter(set => {
        const isImported = this.importedSets.has(set.id);
        if (isImported) {
          console.log(`✅ Found imported set: ${set.id}`);
        }
        return isImported;
      });
      
      console.log(`📊 Filtered results: ${filtered.length} sets`);
      return filtered;
    }
    return this.allSets;
  }

  /**
   * Setzt den Filter Mode
   */
  setFilterMode(mode) {
    this.filterMode = mode; // 'all' oder 'imported'
  }

  /**
   * Gibt an ob ein Set importiert ist
   */
  isImported(setId) {
    return this.importedSets.has(setId);
  }

  /**
   * Markiert ein Set als importiert
   */
  markAsImported(setId) {
    this.importedSets.add(setId);
  }
}

/**
 * Set Management UI Component
 * 
 * Rendert eine Sidebar/Panel mit:
 * - Filter Buttons (Alle vs Importierte)
 * - Suchleiste
 * - Set-Liste mit Status-Badges
 * - Buttons pro Set (Importieren, Laden, etc)
 */
export class SetManagementUI {
  constructor(setManager) {
    this.setManager = setManager;
    this.currentSet = null;
    this.onSetSelected = null;
  }

  /**
   * Erstelle das Set Management Panel
   */
  createPanel(currentSetId = null) {
    const panel = document.createElement('div');
    panel.className = 'set-management-panel';
    panel.innerHTML = `
      <div class="set-management-header">
        <h3>📚 Set Verwaltung</h3>
        <button class="close-panel-btn" data-action="close">✕</button>
      </div>

      <div class="set-management-filters">
        <button class="filter-btn active" data-filter="all">
          📖 Alle Sets (${this.setManager.allSets.length})
        </button>
        <button class="filter-btn" data-filter="imported">
          ✅ Importiert (${this.setManager.importedSets.size})
        </button>
      </div>

      <div class="set-management-search">
        <input 
          type="text" 
          class="set-search-input" 
          placeholder="Set ID oder Name suchen..."
          autocomplete="off"
        >
      </div>

      <div class="set-management-list">
        <!-- Sets werden hier eingefügt -->
      </div>
    `;

    // Event Listeners
    const filterBtns = panel.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        filterBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.setManager.setFilterMode(e.target.dataset.filter);
        this.updateSetList(panel);
      });
    });

    const searchInput = panel.querySelector('.set-search-input');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.updateSetList(panel, e.target.value);
      }, 300);
    });

    const closeBtn = panel.querySelector('.close-panel-btn');
    closeBtn.addEventListener('click', () => {
      panel.remove();
    });

    // Initial render
    this.updateSetList(panel);

    return panel;
  }

  /**
   * Aktualisiere die Set-Liste in dem Panel
   */
  updateSetList(panel, searchQuery = '') {
    let sets = this.setManager.getFilteredSets();

    // Filter nach Suchtext
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      sets = sets.filter(set => 
        set.id.toLowerCase().includes(query) ||
        (set.name && set.name.toLowerCase().includes(query))
      );
    }

    const listContainer = panel.querySelector('.set-management-list');
    listContainer.innerHTML = '';

    if (sets.length === 0) {
      listContainer.innerHTML = '<div class="no-sets-message">Keine Sets gefunden</div>';
      return;
    }

    sets.forEach(set => {
      const setItem = this.createSetItem(set);
      listContainer.appendChild(setItem);
    });
  }

  /**
   * Erstelle einen Set-Item in der Liste
   */
  createSetItem(set) {
    const isImported = this.setManager.isImported(set.id);
    
    const item = document.createElement('div');
    item.className = `set-item ${isImported ? 'imported' : 'not-imported'}`;
    
    let releaseDate = '';
    if (set.releaseDate) {
      releaseDate = `<span class="set-date">${new Date(set.releaseDate).toLocaleDateString('de-DE')}</span>`;
    }

    item.innerHTML = `
      <div class="set-item-header">
        <div class="set-item-title">
          <span class="set-id">${set.id}</span>
          <span class="set-name">${set.name || 'Unbekannt'}</span>
          ${releaseDate}
        </div>
        <div class="set-item-status">
          ${isImported ? 
            '<span class="status-badge imported">✅ Importiert</span>' : 
            '<span class="status-badge not-imported">⬜ Nicht importiert</span>'
          }
        </div>
      </div>
      
      <div class="set-item-actions">
        ${isImported ? 
          `<button class="set-btn load-set" data-set-id="${set.id}" data-action="load">
            📂 Laden
          </button>
          <button class="set-btn reimport-set" data-set-id="${set.id}" data-action="reimport">
            🔄 Neu importieren
          </button>` :
          `<button class="set-btn import-set" data-set-id="${set.id}" data-action="import">
            ➕ Importieren
          </button>`
        }
      </div>
    `;

    // Event Listeners für Buttons
    const buttons = item.querySelectorAll('.set-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const setId = btn.dataset.setId;
        
        this.handleSetAction(action, setId, item);
      });
    });

    return item;
  }

  /**
   * Handle Set-Aktionen (Importieren, Laden, etc)
   */
  handleSetAction(action, setId, itemElement) {
    console.log(`🎯 Set action: ${action} for set ${setId}`);
    
    // Dispatch custom event für app.js
    const event = new CustomEvent('set-management-action', {
      detail: { action, setId }
    });
    document.dispatchEvent(event);

    // Visual feedback
    itemElement.classList.add('loading');
    setTimeout(() => itemElement.classList.remove('loading'), 500);
  }

  /**
   * Aktualisiere einen Set als importiert
   */
  markSetAsImported(setId) {
    this.setManager.markAsImported(setId);
    
    // Update UI für diesen Set
    const setItems = document.querySelectorAll(`[data-set-id="${setId}"]`);
    setItems.forEach(item => {
      const container = item.closest('.set-item');
      if (container) {
        container.classList.remove('not-imported');
        container.classList.add('imported');
      }
    });
  }
}

// Global instances
let globalSetManager = null;
let globalSetManagementUI = null;

/**
 * Initialize Set Management (nach dem Sets geladen werden)
 */
export function initializeSetManagement(allSets) {
  if (!globalSetManager) {
    globalSetManager = new SetManager();
    globalSetManagementUI = new SetManagementUI(globalSetManager);
  }
  
  globalSetManager.setAllSets(allSets);
  console.log('✅ Set Management initialized');
  
  return globalSetManager;
}

/**
 * Lade Import-Status async
 */
export async function loadSetImportStatus(spreadsheetId) {
  if (globalSetManager) {
    await globalSetManager.loadImportStatus(spreadsheetId);
  }
}

/**
 * Get global Set Manager
 */
export function getGlobalSetManager() {
  return globalSetManager;
}

/**
 * Get global Set Management UI
 */
export function getGlobalSetManagementUI() {
  return globalSetManagementUI;
}

/**
 * Trigger Set Import via Apps Script
 */
export async function triggerSetImport(setId) {
  try {
    console.log(`➕ Triggering import for set: ${setId}`);
    
    // Import the AppScript executor
    const { importSingleSet } = await import('./appscript-executor.js');
    
    // Call the Apps Script function directly
    const result = await importSingleSet(setId);
    
    console.log(`✅ Import triggered for ${setId}:`, result);
    return result;
  } catch (error) {
    console.error(`❌ Error triggering import: ${error.message}`);
    throw error;
  }
}

/**
 * Trigger Set Reimport via Apps Script
 */
export async function triggerSetReimport(setId) {
  try {
    console.log(`🔄 Triggering reimport for set: ${setId}`);
    
    // Import the AppScript executor
    const { reimportSet } = await import('./appscript-executor.js');
    
    // Call the Apps Script function directly
    const result = await reimportSet(setId);
    
    console.log(`✅ Reimport triggered for ${setId}:`, result);
    return result;
  } catch (error) {
    console.error(`❌ Error triggering reimport: ${error.message}`);
    throw error;
  }
}

/**
 * Öffne Set Management Panel
 */
export function openSetManagementPanel(currentSetId = null) {
  if (!globalSetManagementUI) return;
  
  // Entferne altes Panel falls vorhanden
  const existingPanel = document.querySelector('.set-management-panel');
  if (existingPanel) {
    existingPanel.remove();
  }

  const panel = globalSetManagementUI.createPanel(currentSetId);
  document.body.appendChild(panel);
  
  // Animate in
  setTimeout(() => panel.classList.add('visible'), 10);
  
  return panel;
}
