/**
 * Settings UI Module
 * Renders and manages settings panel
 */

class SettingsUI {
  constructor(settings) {
    this.settings = settings;
  }

  /**
   * Create settings panel
   */
  createSettingsPanel() {
    const panel = document.createElement('div');
    panel.className = 'settings-panel';
    panel.innerHTML = `
      <div class="settings-header">
        <h2>⚙️ Einstellungen</h2>
        <button class="close-btn">✕</button>
      </div>

      <div class="settings-content">
        <!-- Language Settings -->
        <div class="settings-group">
          <h3>🌍 Sprache</h3>
          <div class="settings-row">
            <label>Spracheinstellung</label>
            <select id="language-select" class="settings-select">
              <option value="de">Deutsch</option>
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="es">Español</option>
              <option value="it">Italiano</option>
            </select>
          </div>
        </div>

        <!-- Theme Settings -->
        <div class="settings-group">
          <h3>🎨 Erscheinungsbild</h3>
          <div class="settings-row">
            <label>Design</label>
            <div class="theme-buttons">
              <button class="theme-btn" data-theme="light">☀️ Hell</button>
              <button class="theme-btn" data-theme="dark">🌙 Dunkel</button>
            </div>
          </div>
          <div class="settings-row">
            <label>
              <input type="checkbox" id="compact-mode" class="settings-checkbox">
              Kompakter Modus
            </label>
          </div>
        </div>

        <!-- Display Settings -->
        <div class="settings-group">
          <h3>👁️ Anzeige</h3>
          <div class="settings-row">
            <label>
              <input type="checkbox" id="show-card-images" class="settings-checkbox" checked>
              Kartenbilder anzeigen
            </label>
          </div>
          <div class="settings-row">
            <label>
              <input type="checkbox" id="show-prices" class="settings-checkbox">
              Preise anzeigen
            </label>
          </div>
          <div class="settings-row">
            <label>Elemente pro Seite</label>
            <input type="number" id="items-per-page" class="settings-input" 
                   min="10" max="200" value="50">
          </div>
        </div>

        <!-- Default Sort -->
        <div class="settings-group">
          <h3>📋 Standardsortierung</h3>
          <div class="settings-row">
            <label>Sortierung</label>
            <select id="sort-order" class="settings-select">
              <option value="number-asc">Nummer (aufsteigend)</option>
              <option value="number-desc">Nummer (absteigend)</option>
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
            </select>
          </div>
        </div>

        <!-- Performance Settings -->
        <div class="settings-group">
          <h3>⚡ Leistung</h3>
          <div class="settings-row">
            <label>
              <input type="checkbox" id="auto-save" class="settings-checkbox" checked>
              Automatische Speicherung
            </label>
          </div>
          <div class="settings-row">
            <label>
              <input type="checkbox" id="cache-prices" class="settings-checkbox" checked>
              Preise zwischenspeichern
            </label>
          </div>
          <div class="settings-row">
            <label>
              <input type="checkbox" id="enable-notifications" class="settings-checkbox" checked>
              Benachrichtigungen anzeigen
            </label>
          </div>
        </div>

        <!-- Data Management -->
        <div class="settings-group">
          <h3>💾 Datenverwaltung</h3>
          <div class="settings-row">
            <button class="btn-settings" data-action="backup">📤 Sicherung erstellen</button>
            <button class="btn-settings" data-action="restore">📥 Sicherung wiederherstellen</button>
          </div>
          <div class="settings-row">
            <button class="btn-settings btn-danger" data-action="clear-cache">🗑️ Cache löschen</button>
            <button class="btn-settings btn-danger" data-action="reset">↻ Zurücksetzen</button>
          </div>
        </div>

        <!-- About -->
        <div class="settings-group">
          <h3>ℹ️ Info</h3>
          <div class="settings-row">
            <p class="info-text">Pokémon TCG Tracker - Try3 Frontend</p>
            <p class="info-text small">Version 1.0.0 | Phase 2 Complete</p>
            <p class="info-text small">
              <a href="https://github.com/veraatversus/poke-tcg" target="_blank">GitHub Repository</a> |
              <a href="https://pokemontcg.io" target="_blank">Pokémon TCG API</a>
            </p>
          </div>
        </div>
      </div>

      <div class="settings-footer">
        <button class="btn-save">💾 Speichern</button>
        <button class="btn-cancel">Abbrechen</button>
      </div>
    `;

    return panel;
  }

  /**
   * Inject settings button into toolbar
   */
  injectSettingsButton(toolbarSelector) {
    const toolbar = document.querySelector(toolbarSelector);
    if (!toolbar) return;

    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.action = 'settings';
    btn.title = 'Einstellungen';
    btn.innerHTML = '⚙️ Einstellungen';
    
    toolbar.appendChild(btn);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const event = new CustomEvent('settings-action', {
        detail: { action: 'open' },
        bubbles: true
      });
      document.dispatchEvent(event);
    });
  }

  /**
   * Setup settings panel events
   */
  setupSettingsPanelEvents(panel) {
    // Language change
    const langSelect = panel.querySelector('#language-select');
    if (langSelect) {
      langSelect.addEventListener('change', (e) => {
        this.settings.applyLanguage(e.target.value);
      });
    }

    // Theme buttons
    const themeButtons = panel.querySelectorAll('.theme-btn');
    themeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        themeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.settings.applyTheme(btn.dataset.theme);
      });
    });

    // Compact mode
    const compactMode = panel.querySelector('#compact-mode');
    if (compactMode) {
      compactMode.addEventListener('change', (e) => {
        this.settings.applyCompactMode(e.target.checked);
      });
    }

    // Display checkboxes
    const displayCheckboxes = panel.querySelectorAll('.settings-checkbox');
    displayCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const settingName = e.target.id
          .replace('-', '_')
          .replace('_select', '')
          .replace('_input', '');
        this.settings.set(settingName, e.target.checked);
      });
    });

    // Items per page
    const itemsPerPage = panel.querySelector('#items-per-page');
    if (itemsPerPage) {
      itemsPerPage.addEventListener('change', (e) => {
        const value = Math.max(10, Math.min(200, parseInt(e.target.value)));
        this.settings.set('itemsPerPage', value);
      });
    }

    // Sort order
    const sortSelect = panel.querySelector('#sort-order');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.settings.set('sortOrder', e.target.value);
      });
    }

    // Action buttons
    const actionButtons = panel.querySelectorAll('[data-action]');
    actionButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleAction(btn.dataset.action);
      });
    });

    // Save and cancel buttons
    const saveBtn = panel.querySelector('.btn-save');
    const cancelBtn = panel.querySelector('.btn-cancel');
    const closeBtn = panel.querySelector('.close-btn');

    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.showNotification('✅ Einstellungen gespeichert', 'success');
      });
    }

    if (cancelBtn || closeBtn) {
      const closeHandler = (e) => {
        e.preventDefault();
        this.closeSettings();
      };
      if (cancelBtn) cancelBtn.addEventListener('click', closeHandler);
      if (closeBtn) closeBtn.addEventListener('click', closeHandler);
    }
  }

  /**
   * Handle settings actions
   */
  async handleAction(action) {
    const event = new CustomEvent('settings-data-action', {
      detail: { action },
      bubbles: true
    });
    document.dispatchEvent(event);
  }

  /**
   * Load current settings into form
   */
  loadSettingsIntoForm(panel) {
    const currentSettings = this.settings.getAll();

    // Language
    const langSelect = panel.querySelector('#language-select');
    if (langSelect) {
      langSelect.value = currentSettings.language;
    }

    // Theme
    const themeButtons = panel.querySelectorAll('.theme-btn');
    themeButtons.forEach(btn => {
      if (btn.dataset.theme === currentSettings.theme) {
        btn.classList.add('active');
      }
    });

    // Checkboxes
    const checkboxes = {
      'compact-mode': 'compactMode',
      'show-card-images': 'showCardImages',
      'show-prices': 'showPrices',
      'auto-save': 'autoSave',
      'cache-prices': 'cachePrices',
      'enable-notifications': 'enableNotifications'
    };

    Object.entries(checkboxes).forEach(([id, key]) => {
      const checkbox = panel.querySelector(`#${id}`);
      if (checkbox) {
        checkbox.checked = currentSettings[key];
      }
    });

    // Items per page
    const itemsPerPage = panel.querySelector('#items-per-page');
    if (itemsPerPage) {
      itemsPerPage.value = currentSettings.itemsPerPage;
    }

    // Sort order
    const sortSelect = panel.querySelector('#sort-order');
    if (sortSelect) {
      sortSelect.value = currentSettings.sortOrder;
    }
  }

  /**
   * Close settings panel
   */
  closeSettings() {
    const panel = document.querySelector('.settings-panel');
    if (panel) {
      panel.classList.add('fade-out');
      setTimeout(() => panel.remove(), 300);
    }
  }

  /**
   * Show notification
   */
  showNotification(message, type = 'info') {
    const notif = document.createElement('div');
    notif.className = `settings-notification ${type}`;
    notif.textContent = message;
    document.body.appendChild(notif);

    setTimeout(() => {
      notif.classList.add('fade-out');
      setTimeout(() => notif.remove(), 300);
    }, 3000);
  }
}

// Global instance
let globalSettingsUI = null;

/**
 * Initialize global Settings UI
 */
function initializeSettingsUI(settings) {
  if (!globalSettingsUI) {
    globalSettingsUI = new SettingsUI(settings);
  }
  return globalSettingsUI;
}

/**
 * Get global Settings UI instance
 */
function getGlobalSettingsUI() {
  if (!globalSettingsUI) {
    globalSettingsUI = new SettingsUI(getGlobalSettings?.() || new Settings());
  }
  return globalSettingsUI;
}

export { SettingsUI, initializeSettingsUI, getGlobalSettingsUI };
