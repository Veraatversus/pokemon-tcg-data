/**
 * Export/Import UI Module
 * Handles UI for export and import operations
 */

class ExportImportUI {
  constructor() {
    this.exportImport = null;
  }

  /**
   * Create export dialog
   */
  createExportDialog(cards, setName) {
    const dialog = document.createElement('div');
    dialog.className = 'export-dialog';
    dialog.innerHTML = `
      <div class="export-modal">
        <div class="export-header">
          <h2>📤 Sammlung exportieren</h2>
          <button class="close-btn">✕</button>
        </div>

        <div class="export-content">
          <div class="export-options">
            <div class="export-option">
              <input type="radio" id="export-csv" name="export-format" value="csv" checked>
              <label for="export-csv">
                <strong>CSV (Excel/Spreadsheet)</strong>
                <small>Kompatibel mit Excel, Google Sheets, etc.</small>
              </label>
            </div>

            <div class="export-option">
              <input type="radio" id="export-json" name="export-format" value="json">
              <label for="export-json">
                <strong>JSON (Datensicherung)</strong>
                <small>Vollständige Sicherung mit Metadaten</small>
              </label>
            </div>

            <div class="export-option">
              <input type="radio" id="export-backup" name="export-format" value="backup">
              <label for="export-backup">
                <strong>Sicherungsdatei</strong>
                <small>Komplette Sammlung mit allen Sets</small>
              </label>
            </div>
          </div>

          <div class="export-scope">
            <h3>Umfang</h3>
            <div class="scope-option">
              <input type="radio" id="scope-all" name="export-scope" value="all" checked>
              <label for="scope-all">Alle Karten (${cards.length})</label>
            </div>

            <div class="scope-option">
              <input type="radio" id="scope-collected" name="export-scope" value="collected">
              <label for="scope-collected">
                Nur gesammelt (${cards.filter(c => c.collected || c.reverseHolo).length})
              </label>
            </div>

            <div class="scope-option">
              <input type="radio" id="scope-missing" name="export-scope" value="missing">
              <label for="scope-missing">
                Nur fehlend (${cards.filter(c => !c.collected && !c.reverseHolo).length})
              </label>
            </div>
          </div>

          <div class="export-columns" id="csv-columns" style="display:none;">
            <h3>Spalten wählen</h3>
            <div class="columns-list">
              <label><input type="checkbox" class="column-toggle" value="number" checked> Nummer</label>
              <label><input type="checkbox" class="column-toggle" value="name" checked> Name</label>
              <label><input type="checkbox" class="column-toggle" value="set" checked> Set</label>
              <label><input type="checkbox" class="column-toggle" value="rarity" checked> Seltenheit</label>
              <label><input type="checkbox" class="column-toggle" value="collected" checked> Gesammelt</label>
              <label><input type="checkbox" class="column-toggle" value="reverseHolo" checked> Reverse Holo</label>
              <label><input type="checkbox" class="column-toggle" value="cardmarketLink"> Cardmarket Link</label>
              <label><input type="checkbox" class="column-toggle" value="imageUrl"> Bild-URL</label>
            </div>
          </div>

          <div class="export-preview">
            <h3>Vorschau</h3>
            <p class="preview-text" id="export-preview">
              ${cards.length} Karten werden exportiert
            </p>
          </div>
        </div>

        <div class="export-footer">
          <button class="btn-cancel">Abbrechen</button>
          <button class="btn-export">Exportieren</button>
        </div>
      </div>
    `;

    // Setup format toggle
    const formatOptions = dialog.querySelectorAll('input[name="export-format"]');
    const csvColumnsDiv = dialog.getElementById('csv-columns');
    
    formatOptions.forEach(option => {
      option.addEventListener('change', () => {
        csvColumnsDiv.style.display = option.value === 'csv' ? 'block' : 'none';
      });
    });

    return dialog;
  }

  /**
   * Create import dialog
   */
  createImportDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'import-dialog';
    dialog.innerHTML = `
      <div class="import-modal">
        <div class="import-header">
          <h2>📥 Sammlung importieren</h2>
          <button class="close-btn">✕</button>
        </div>

        <div class="import-content">
          <div class="import-dropzone" id="import-dropzone">
            <div class="dropzone-content">
              <div class="dropzone-icon">📁</div>
              <h3>Datei hierher ziehen oder klicken</h3>
              <p>Unterstützte Formate: CSV, JSON</p>
            </div>
            <input type="file" id="import-file" accept=".csv,.json" style="display:none;">
          </div>

          <div class="import-options" style="display:none;">
            <h3>Importoptionen</h3>
            
            <div class="merge-strategy">
              <label>
                <input type="radio" name="merge-strategy" value="update" checked>
                <strong>Aktualisieren</strong>
                <small>Existierende Daten aktualisieren</small>
              </label>
              <label>
                <input type="radio" name="merge-strategy" value="skip">
                <strong>Überspringen</strong>
                <small>Existierende Daten behalten</small>
              </label>
              <label>
                <input type="radio" name="merge-strategy" value="overwrite">
                <strong>Überschreiben</strong>
                <small>Vollständig ersetzen</small>
              </label>
            </div>
          </div>

          <div class="import-preview" style="display:none;">
            <h3>Vorschau</h3>
            <div class="preview-stats" id="import-preview-stats">
              <!-- Preview content -->
            </div>
          </div>

          <div class="import-status" style="display:none;">
            <div class="status-message" id="import-status-message"></div>
            <div class="status-progress" id="import-progress">
              <div class="progress-bar"></div>
            </div>
          </div>
        </div>

        <div class="import-footer">
          <button class="btn-cancel">Abbrechen</button>
          <button class="btn-import" style="display:none;">Importieren</button>
        </div>
      </div>
    `;

    // Setup drag & drop
    const dropzone = dialog.getElementById('import-dropzone');
    const fileInput = dialog.getElementById('import-file');

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFileSelect(dialog, files[0]);
      }
    });

    dropzone.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFileSelect(dialog, e.target.files[0]);
      }
    });

    return dialog;
  }

  /**
   * Handle file selection
   */
  async handleFileSelect(dialog, file) {
    const preview = dialog.querySelector('.import-preview');
    const previewStats = dialog.getElementById('import-preview-stats');
    const options = dialog.querySelector('.import-options');
    const importBtn = dialog.querySelector('.btn-import');
    const dropzone = dialog.getElementById('import-dropzone');

    try {
      // Parse file
      let data;
      if (file.name.endsWith('.csv')) {
        const cards = await this.exportImport.importFromCSV(file);
        data = { cards, format: 'csv' };
      } else if (file.name.endsWith('.json')) {
        data = await this.exportImport.importFromJSON(file);
      } else {
        throw new Error('Dateiformat wird nicht unterstützt');
      }

      // Show preview
      const stats = data.statistics || this.exportImport.generateStatistics(data.cards);
      previewStats.innerHTML = `
        <div class="stat-row">
          <span>Datei:</span>
          <strong>${file.name}</strong>
        </div>
        <div class="stat-row">
          <span>Karten:</span>
          <strong>${data.cards.length}</strong>
        </div>
        <div class="stat-row">
          <span>Gesammelt:</span>
          <strong>${stats.collectedCards || 0}</strong>
        </div>
        <div class="stat-row">
          <span>Vollständigkeit:</span>
          <strong>${stats.completionPercent || 0}%</strong>
        </div>
      `;

      // Show options
      dropzone.style.display = 'none';
      options.style.display = 'block';
      preview.style.display = 'block';
      importBtn.style.display = 'block';

      // Store parsed data for import
      dialog._importData = data;

    } catch (error) {
      console.error('Import error:', error);
      previewStats.innerHTML = `<div class="error-message">❌ Fehler: ${error.message}</div>`;
      preview.style.display = 'block';
    }
  }

  /**
   * Inject export/import buttons into toolbar
   */
  injectExportImportControls(toolbarSelector) {
    const toolbar = document.querySelector(toolbarSelector);
    if (!toolbar) return;

    const controls = document.createElement('div');
    controls.className = 'export-import-controls';
    controls.innerHTML = `
      <button class="filter-btn" data-action="export" title="Sammlung exportieren">📤 Export</button>
      <button class="filter-btn" data-action="import" title="Sammlung importieren">📥 Import</button>
    `;

    toolbar.appendChild(controls);

    // Bind events
    controls.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleExportImportAction(btn.dataset.action);
      });
    });
  }

  /**
   * Handle export/import action
   */
  handleExportImportAction(action) {
    const event = new CustomEvent('export-import-action', {
      detail: { action },
      bubbles: true
    });
    document.dispatchEvent(event);
  }

  /**
   * Show success message
   */
  showSuccessMessage(message, duration = 3000) {
    const notification = document.createElement('div');
    notification.className = 'export-notification success';
    notification.innerHTML = `<span>✅ ${message}</span>`;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }

  /**
   * Show error message
   */
  showErrorMessage(message, duration = 5000) {
    const notification = document.createElement('div');
    notification.className = 'export-notification error';
    notification.innerHTML = `<span>❌ ${message}</span>`;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }

  /**
   * Format file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}

// Global instance
let globalExportImportUI = null;

/**
 * Initialize global Export/Import UI
 */
function initializeExportImportUI() {
  if (!globalExportImportUI) {
    globalExportImportUI = new ExportImportUI();
  }
  return globalExportImportUI;
}

/**
 * Get global Export/Import UI instance
 */
function getGlobalExportImportUI() {
  if (!globalExportImportUI) {
    globalExportImportUI = new ExportImportUI();
  }
  return globalExportImportUI;
}

export { ExportImportUI, initializeExportImportUI, getGlobalExportImportUI };
