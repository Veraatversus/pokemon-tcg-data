/**
 * Internationalization (i18n) Module
 * Handles multi-language support
 */

class I18n {
  constructor() {
    this.currentLanguage = this.detectLanguage();
    this.translations = {};
    this.loadedLanguages = new Set();
  }

  /**
   * Detect user's preferred language
   */
  detectLanguage() {
    // Check localStorage
    const saved = localStorage.getItem('app_language');
    if (saved) return saved;

    // Check browser language
    const browserLang = navigator.language.split('-')[0];
    const supported = ['de', 'en', 'fr', 'es', 'it'];
    
    return supported.includes(browserLang) ? browserLang : 'de';
  }

  /**
   * Set current language
   */
  setLanguage(lang) {
    this.currentLanguage = lang;
    localStorage.setItem('app_language', lang);
    document.documentElement.lang = lang;
    
    // Trigger language change event
    const event = new CustomEvent('language-changed', {
      detail: { language: lang },
      bubbles: true
    });
    document.dispatchEvent(event);
  }

  /**
   * Get current language
   */
  getLanguage() {
    return this.currentLanguage;
  }

  /**
   * Load translations for a language
   */
  async loadLanguage(lang) {
    if (this.loadedLanguages.has(lang)) {
      return this.translations[lang];
    }

    // For now, use inline translations
    // In production, would load from JSON files
    this.translations[lang] = this.getInlineTranslations(lang);
    this.loadedLanguages.add(lang);
    
    return this.translations[lang];
  }

  /**
   * Get inline translations
   */
  getInlineTranslations(lang) {
    const translations = {
      de: {
        // Navigation
        'nav.home': 'Startseite',
        'nav.collection': 'Sammlung',
        'nav.analytics': 'Analytics',
        'nav.settings': 'Einstellungen',

        // Auth
        'auth.signin': 'Mit Google anmelden',
        'auth.signout': 'Abmelden',
        'auth.welcome': 'Willkommen',

        // Toolbar
        'toolbar.search': 'Suche...',
        'toolbar.filter': 'Filter',
        'toolbar.sort': 'Sortierung',
        'toolbar.all': 'Alle',
        'toolbar.collected': 'Gesammelt',
        'toolbar.missing': 'Fehlend',
        'toolbar.reverseHolo': 'Reverse Holo',
        'toolbar.selectAll': 'Alle wählen',
        'toolbar.deselectAll': 'Alle abwählen',
        'toolbar.prices': 'Preise',
        'toolbar.export': 'Export',
        'toolbar.import': 'Import',
        'toolbar.settings': 'Einstellungen',
        'toolbar.analytics': 'Analytics',

        // Stats
        'stats.total': 'Gesamt',
        'stats.collected': 'Gesammelt',
        'stats.missing': 'Fehlend',
        'stats.reverseHolo': 'Reverse Holo',
        'stats.completion': 'Vollständigkeit',

        // Cards
        'cards.number': 'Nummer',
        'cards.name': 'Name',
        'cards.rarity': 'Seltenheit',
        'cards.set': 'Set',
        'cards.collected': 'Gesammelt',
        'cards.notCollected': 'Nicht gesammelt',

        // Export
        'export.title': 'Sammlung exportieren',
        'export.csv': 'CSV (Excel/Spreadsheet)',
        'export.json': 'JSON (Datensicherung)',
        'export.backup': 'Vollständige Sicherung',
        'export.scope.all': 'Alle Karten',
        'export.scope.collected': 'Nur gesammelt',
        'export.scope.missing': 'Nur fehlend',
        'export.columns': 'Spalten wählen',
        'export.preview': 'Vorschau',
        'export.button': 'Exportieren',
        'export.cancel': 'Abbrechen',

        // Import
        'import.title': 'Sammlung importieren',
        'import.dropzone': 'Datei hierher ziehen oder klicken',
        'import.formats': 'Unterstützte Formate: CSV, JSON',
        'import.button': 'Importieren',
        'import.cancel': 'Abbrechen',

        // Settings
        'settings.title': 'Einstellungen',
        'settings.language': 'Sprache',
        'settings.theme': 'Design',
        'settings.theme.light': 'Hell',
        'settings.theme.dark': 'Dunkel',
        'settings.display': 'Anzeige',
        'settings.autoSave': 'Automatische Speicherung',
        'settings.save': 'Speichern',
        'settings.cancel': 'Abbrechen',

        // Analytics
        'analytics.title': 'Analytics Dashboard',
        'analytics.growth': 'Wachstum',
        'analytics.avgPerDay': 'Ø pro Tag',
        'analytics.streak': 'Streak',
        'analytics.completionIn': 'Fertig in',
        'analytics.days': 'Tagen',
        'analytics.progress': 'Sammlungsfortschritt',
        'analytics.velocity': 'Sammlungsgeschwindigkeit',
        'analytics.mostImproved': 'Am meisten verbesserte Sets',

        // Messages
        'msg.success': 'Erfolgreich',
        'msg.error': 'Fehler',
        'msg.loading': 'Lade...',
        'msg.noData': 'Keine Daten verfügbar',
        'msg.saved': 'Gespeichert!',
        'msg.failed': 'Fehler beim Speichern'
      },

      en: {
        // Navigation
        'nav.home': 'Home',
        'nav.collection': 'Collection',
        'nav.analytics': 'Analytics',
        'nav.settings': 'Settings',

        // Auth
        'auth.signin': 'Sign in with Google',
        'auth.signout': 'Sign out',
        'auth.welcome': 'Welcome',

        // Toolbar
        'toolbar.search': 'Search...',
        'toolbar.filter': 'Filter',
        'toolbar.sort': 'Sort',
        'toolbar.all': 'All',
        'toolbar.collected': 'Collected',
        'toolbar.missing': 'Missing',
        'toolbar.reverseHolo': 'Reverse Holo',
        'toolbar.selectAll': 'Select All',
        'toolbar.deselectAll': 'Deselect All',
        'toolbar.prices': 'Prices',
        'toolbar.export': 'Export',
        'toolbar.import': 'Import',
        'toolbar.settings': 'Settings',
        'toolbar.analytics': 'Analytics',

        // Stats
        'stats.total': 'Total',
        'stats.collected': 'Collected',
        'stats.missing': 'Missing',
        'stats.reverseHolo': 'Reverse Holo',
        'stats.completion': 'Completion',

        // Cards
        'cards.number': 'Number',
        'cards.name': 'Name',
        'cards.rarity': 'Rarity',
        'cards.set': 'Set',
        'cards.collected': 'Collected',
        'cards.notCollected': 'Not Collected',

        // Export
        'export.title': 'Export Collection',
        'export.csv': 'CSV (Excel/Spreadsheet)',
        'export.json': 'JSON (Data Backup)',
        'export.backup': 'Full Backup',
        'export.scope.all': 'All Cards',
        'export.scope.collected': 'Collected Only',
        'export.scope.missing': 'Missing Only',
        'export.columns': 'Choose Columns',
        'export.preview': 'Preview',
        'export.button': 'Export',
        'export.cancel': 'Cancel',

        // Import
        'import.title': 'Import Collection',
        'import.dropzone': 'Drag file here or click',
        'import.formats': 'Supported formats: CSV, JSON',
        'import.button': 'Import',
        'import.cancel': 'Cancel',

        // Settings
        'settings.title': 'Settings',
        'settings.language': 'Language',
        'settings.theme': 'Theme',
        'settings.theme.light': 'Light',
        'settings.theme.dark': 'Dark',
        'settings.display': 'Display',
        'settings.autoSave': 'Auto Save',
        'settings.save': 'Save',
        'settings.cancel': 'Cancel',

        // Analytics
        'analytics.title': 'Analytics Dashboard',
        'analytics.growth': 'Growth',
        'analytics.avgPerDay': 'Avg per Day',
        'analytics.streak': 'Streak',
        'analytics.completionIn': 'Complete in',
        'analytics.days': 'days',
        'analytics.progress': 'Collection Progress',
        'analytics.velocity': 'Collection Velocity',
        'analytics.mostImproved': 'Most Improved Sets',

        // Messages
        'msg.success': 'Success',
        'msg.error': 'Error',
        'msg.loading': 'Loading...',
        'msg.noData': 'No data available',
        'msg.saved': 'Saved!',
        'msg.failed': 'Save failed'
      },

      fr: {
        'nav.home': 'Accueil',
        'nav.collection': 'Collection',
        'nav.analytics': 'Analytiques',
        'nav.settings': 'Paramètres',
        'auth.signin': 'Se connecter avec Google',
        'auth.signout': 'Se déconnecter',
        'toolbar.search': 'Rechercher...',
        'toolbar.all': 'Tout',
        'toolbar.collected': 'Collecté',
        'toolbar.missing': 'Manquant',
        'stats.total': 'Total',
        'stats.collected': 'Collecté',
        'stats.missing': 'Manquant'
      },

      es: {
        'nav.home': 'Inicio',
        'nav.collection': 'Colección',
        'nav.analytics': 'Analíticas',
        'nav.settings': 'Configuración',
        'auth.signin': 'Iniciar sesión con Google',
        'auth.signout': 'Cerrar sesión',
        'toolbar.search': 'Buscar...',
        'toolbar.all': 'Todos',
        'toolbar.collected': 'Recopilado',
        'toolbar.missing': 'Faltante',
        'stats.total': 'Total',
        'stats.collected': 'Recopilado',
        'stats.missing': 'Faltante'
      },

      it: {
        'nav.home': 'Home',
        'nav.collection': 'Collezione',
        'nav.analytics': 'Analytics',
        'nav.settings': 'Impostazioni',
        'auth.signin': 'Accedi con Google',
        'auth.signout': 'Disconnetti',
        'toolbar.search': 'Cerca...',
        'toolbar.all': 'Tutti',
        'toolbar.collected': 'Raccolte',
        'toolbar.missing': 'Mancante',
        'stats.total': 'Totale',
        'stats.collected': 'Raccolte',
        'stats.missing': 'Mancante'
      }
    };

    return translations[lang] || translations['de'];
  }

  /**
   * Translate a key
   */
  t(key, fallback = null) {
    const lang = this.translations[this.currentLanguage];
    if (!lang) return fallback || key;
    
    return lang[key] || fallback || key;
  }

  /**
   * Translate with variables
   */
  translate(key, vars = {}) {
    let text = this.t(key);
    
    Object.entries(vars).forEach(([varKey, value]) => {
      text = text.replace(`{{${varKey}}}`, value);
    });
    
    return text;
  }

  /**
   * Update all elements with data-i18n attribute
   */
  updateDOM() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.dataset.i18n;
      el.textContent = this.t(key);
    });

    // Update placeholders
    const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      el.placeholder = this.t(key);
    });

    // Update titles
    const titles = document.querySelectorAll('[data-i18n-title]');
    titles.forEach(el => {
      const key = el.dataset.i18nTitle;
      el.title = this.t(key);
    });
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages() {
    return [
      { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
      { code: 'en', name: 'English', flag: '🇬🇧' },
      { code: 'fr', name: 'Français', flag: '🇫🇷' },
      { code: 'es', name: 'Español', flag: '🇪🇸' },
      { code: 'it', name: 'Italiano', flag: '🇮🇹' }
    ];
  }
}

// Global singleton
let globalI18n = null;

/**
 * Initialize global i18n
 */
function initializeI18n() {
  if (!globalI18n) {
    globalI18n = new I18n();
    globalI18n.loadLanguage(globalI18n.currentLanguage);
  }
  return globalI18n;
}

/**
 * Get global i18n instance
 */
function getGlobalI18n() {
  if (!globalI18n) {
    globalI18n = new I18n();
    globalI18n.loadLanguage(globalI18n.currentLanguage);
  }
  return globalI18n;
}

/**
 * Shorthand translate function
 */
function t(key, fallback = null) {
  return getGlobalI18n().t(key, fallback);
}

export { I18n, initializeI18n, getGlobalI18n, t };
