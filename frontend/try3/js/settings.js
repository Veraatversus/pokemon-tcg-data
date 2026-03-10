/**
 * Settings Module
 * Manages user preferences and settings
 */

class Settings {
  constructor() {
    this.defaults = {
      language: 'de',
      theme: 'light',
      sortOrder: 'number-asc',
      itemsPerPage: 50,
      autoSave: true,
      showCardImages: true,
      showPrices: false,
      compactMode: false,
      enableNotifications: true,
      cachePrices: true
    };

    this.currentSettings = this.loadSettings();
    this.observers = new Map();
  }

  /**
   * Load settings from localStorage
   */
  loadSettings() {
    try {
      const stored = localStorage.getItem('app_settings');
      if (stored) {
        return { ...this.defaults, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
    return { ...this.defaults };
  }

  /**
   * Save settings to localStorage
   */
  saveSettings() {
    try {
      localStorage.setItem('app_settings', JSON.stringify(this.currentSettings));
      this.notifyObservers();
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  /**
   * Get setting value
   */
  get(key) {
    return this.currentSettings[key] ?? this.defaults[key];
  }

  /**
   * Set setting value
   */
  set(key, value) {
    if (this.currentSettings[key] !== value) {
      this.currentSettings[key] = value;
      this.saveSettings();
      this.emit(key, value);
    }
  }

  /**
   * Set multiple settings at once
   */
  setMultiple(settings) {
    Object.entries(settings).forEach(([key, value]) => {
      this.currentSettings[key] = value;
    });
    this.saveSettings();
  }

  /**
   * Subscribe to setting changes
   */
  subscribe(key, callback) {
    if (!this.observers.has(key)) {
      this.observers.set(key, []);
    }
    this.observers.get(key).push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.observers.get(key);
      const idx = callbacks.indexOf(callback);
      if (idx > -1) callbacks.splice(idx, 1);
    };
  }

  /**
   * Emit setting change
   */
  emit(key, value) {
    if (this.observers.has(key)) {
      this.observers.get(key).forEach(callback => {
        try {
          callback(value);
        } catch (e) {
          console.error('Setting observer error:', e);
        }
      });
    }
  }

  /**
   * Notify all observers
   */
  notifyObservers() {
    const event = new CustomEvent('settings-changed', {
      detail: { settings: this.currentSettings },
      bubbles: true
    });
    document.dispatchEvent(event);
  }

  /**
   * Reset to defaults
   */
  resetToDefaults() {
    this.currentSettings = { ...this.defaults };
    this.saveSettings();
  }

  /**
   * Export settings
   */
  export() {
    return JSON.stringify(this.currentSettings, null, 2);
  }

  /**
   * Import settings
   */
  import(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      this.currentSettings = { ...this.defaults, ...imported };
      this.saveSettings();
      return true;
    } catch (e) {
      console.error('Failed to import settings:', e);
      return false;
    }
  }

  /**
   * Get all settings
   */
  getAll() {
    return { ...this.currentSettings };
  }

  /**
   * Apply theme
   */
  applyTheme(theme) {
    const root = document.documentElement;
    
    if (theme === 'dark') {
      root.style.setProperty('--bg-color', '#1a1a1a');
      root.style.setProperty('--text-color', '#ffffff');
      root.style.setProperty('--border-color', '#333333');
      root.style.setProperty('--card-bg', '#2a2a2a');
    } else {
      root.style.setProperty('--bg-color', '#ffffff');
      root.style.setProperty('--text-color', '#000000');
      root.style.setProperty('--border-color', '#cccccc');
      root.style.setProperty('--card-bg', '#f5f5f5');
    }

    document.body.className = `theme-${theme}`;
    this.set('theme', theme);
  }

  /**
   * Apply language
   */
  applyLanguage(lang) {
    document.documentElement.lang = lang;
    this.set('language', lang);
    
    // Trigger language change event
    const event = new CustomEvent('language-changed', {
      detail: { language: lang },
      bubbles: true
    });
    document.dispatchEvent(event);
  }

  /**
   * Apply compact mode
   */
  applyCompactMode(enabled) {
    if (enabled) {
      document.body.classList.add('compact-mode');
    } else {
      document.body.classList.remove('compact-mode');
    }
    this.set('compactMode', enabled);
  }

  /**
   * Validate settings
   */
  validate() {
    const errors = [];
    
    const validLanguages = ['de', 'en', 'fr', 'es', 'it'];
    if (!validLanguages.includes(this.currentSettings.language)) {
      errors.push('Invalid language setting');
    }

    const validThemes = ['light', 'dark'];
    if (!validThemes.includes(this.currentSettings.theme)) {
      errors.push('Invalid theme setting');
    }

    if (this.currentSettings.itemsPerPage < 10 || this.currentSettings.itemsPerPage > 200) {
      errors.push('Items per page must be between 10 and 200');
    }

    return errors.length === 0 ? true : errors;
  }
}

// Global singleton
let globalSettings = null;

/**
 * Initialize global Settings
 */
function initializeSettings() {
  if (!globalSettings) {
    globalSettings = new Settings();
  }
  return globalSettings;
}

/**
 * Get global Settings instance
 */
function getGlobalSettings() {
  if (!globalSettings) {
    globalSettings = new Settings();
  }
  return globalSettings;
}

export { Settings, initializeSettings, getGlobalSettings };
