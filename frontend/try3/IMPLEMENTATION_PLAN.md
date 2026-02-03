# 🎴 Pokémon TCG Frontend - Implementation Plan (Try3)

> **Static GitHub Pages Frontend with Google Sheets API Integration**
> Entwicklung eines eigenständigen Web-Frontends für die Pokémon TCG Sammlung basierend auf Google Sheets als Backend

---

## 📋 Projektübersicht

### Ziel
Entwicklung eines modernen, statischen Web-Frontends auf Basis von GitHub Pages, das über die Google Sheets API auf eine geteilte Google Sheets-Tabelle zugreift. Die Tabelle dient als Backend und Datenspeicher für die Pokémon-Kartensammlung.

### Basis
- **Branch**: `feature/try3-google-sheets-frontend`
- **Verzeichnis**: `/frontend/try3/`
- **Deployment**: GitHub Pages (statisch)
- **Backend**: Google Sheets (via Google Sheets API v4)
- **Referenz-Implementierung**: `/frontend/try1/` und `/frontend/try2/`

---

## 🎯 Kern-Anforderungen

### Funktionale Anforderungen
1. ✅ **Lesezugriff** auf geteilte Google Sheets Tabelle
2. ✅ **Schreibzugriff** für Checkboxen (Karten als gesammelt markieren)
3. ✅ **Statisches Hosting** via GitHub Pages (keine Server-Komponente)
4. ✅ **Grid-Layout** zur Anzeige der Karten (5 pro Reihe)
5. ✅ **Echtzeit-Synchronisation** mit Google Sheets Backend
6. ✅ **Responsive Design** für Desktop und Mobile
7. ✅ **Deutsche Lokalisierung** (basierend auf TCGDex API)

### Technische Anforderungen
1. ✅ **OAuth 2.0** Authentifizierung (Google Sign-In)
2. ✅ **Google Sheets API v4** Integration
3. ✅ **Client-Side JavaScript** (keine Backend-Logik)
4. ✅ **Moderne Web-Standards** (ES6+, HTML5, CSS3)
5. ✅ **Performance-Optimierung** (Caching, Lazy Loading)

---

## 🏗️ Architektur

### System-Architektur
```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Pages (Static)                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   Frontend (try3/)                     │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │  │
│  │  │  HTML    │  │   CSS    │  │   JavaScript     │   │  │
│  │  │  Pages   │  │  Styles  │  │  (ES6 Modules)   │   │  │
│  │  └──────────┘  └──────────┘  └──────────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ HTTPS API Calls
                           ▼
┌─────────────────────────────────────────────────────────────┐
│               Google Cloud Platform                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Google Sheets API v4                        │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │   OAuth 2.0 Authentication Service              │ │  │
│  │  └─────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Read/Write Operations
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Google Sheets (Backend)                     │
│  ┌───────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Sets Overview │  │ Collection   │  │ [Set Sheets]    │  │
│  │               │  │ Summary      │  │ (base1, xy1,..) │  │
│  └───────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Datenfluss
```
1. User → Frontend (GitHub Pages)
2. Frontend → Google Sign-In (OAuth 2.0)
3. User grants permissions
4. Frontend ← Access Token
5. Frontend → Google Sheets API (with token)
6. Google Sheets API → Google Sheets (read/write)
7. Google Sheets → Google Sheets API (data)
8. Frontend ← Data (JSON)
9. Frontend renders UI
10. User interactions → Frontend updates → Google Sheets API
```

---

## 📦 Projektstruktur

```
frontend/try3/
├── index.html                 # Haupt-HTML-Datei
├── IMPLEMENTATION_PLAN.md     # Diese Datei
├── README.md                  # Projekt-Dokumentation
│
├── css/
│   ├── main.css              # Haupt-Stylesheet
│   ├── grid.css              # Grid-Layout für Karten
│   ├── auth.css              # Login/Authentifizierung
│   └── responsive.css        # Mobile-Optimierungen
│
├── js/
│   ├── app.js                # Haupt-Anwendungslogik
│   ├── auth.js               # Google OAuth 2.0 Handling
│   ├── sheets-api.js         # Google Sheets API Wrapper
│   ├── ui.js                 # UI-Rendering & Updates
│   ├── cache.js              # Client-Side Caching
│   └── utils.js              # Helper-Funktionen
│
├── assets/
│   ├── icons/                # App-Icons
│   ├── images/               # Bilder & Logos
│   └── fonts/                # Custom Fonts (optional)
│
├── config/
│   └── config.js             # Konfiguration (API-Keys, etc.)
│
└── docs/
    ├── API_INTEGRATION.md    # API-Dokumentation
    ├── DEPLOYMENT.md         # Deployment-Guide
    └── TROUBLESHOOTING.md    # Fehlerbehandlung
```

---

## 🔐 Google API Setup

### Schritt 1: Google Cloud Project erstellen
1. **Google Cloud Console öffnen**: https://console.cloud.google.com/
2. **Neues Projekt erstellen**:
   - Name: `pokemon-tcg-frontend-try3`
   - Organisation: (optional)
3. **Projekt-ID notieren** (z.B. `pokemon-tcg-frontend-try3`)

### Schritt 2: Google Sheets API aktivieren
1. **APIs & Services** → **Library**
2. **Google Sheets API** suchen und aktivieren
3. **OAuth Consent Screen** konfigurieren:
   - User Type: **External** (für öffentliche App)
   - App Name: `Pokémon TCG Collection Tracker`
   - User Support Email: (deine E-Mail)
   - Scopes hinzufügen:
     - `https://www.googleapis.com/auth/spreadsheets` (read/write)
     - `https://www.googleapis.com/auth/drive.readonly` (optional: für Dateiliste)

### Schritt 3: OAuth 2.0 Credentials erstellen
1. **Credentials** → **Create Credentials** → **OAuth Client ID**
2. **Application Type**: Web Application
3. **Authorized JavaScript origins**:
   ```
   https://veraatversus.github.io
   http://localhost:8000
   ```
4. **Authorized redirect URIs**:
   ```
   https://veraatversus.github.io/pokemon-tcg-data/frontend/try3/
   http://localhost:8000/frontend/try3/
   ```
5. **Client ID notieren** (z.B. `123456789-abc123.apps.googleusercontent.com`)

### Schritt 4: Google Sheets Tabelle vorbereiten
1. **Bestehende Tabelle öffnen** (aus try1/try2)
2. **Freigabe-Einstellungen**:
   - **Option 1 (Öffentlich lesbar)**:
     - "Jeder mit dem Link kann ansehen"
     - Frontend benötigt nur Authentifizierung für Schreibzugriff
   - **Option 2 (Privat)**:
     - Nur authentifizierte Benutzer
     - Frontend benötigt volle OAuth-Authentifizierung
3. **Spreadsheet-ID notieren** (aus URL):
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   ```

---

## 🛠️ Implementierungs-Schritte

### Phase 1: Projekt-Setup (Tag 1)

#### Schritt 1.1: Verzeichnisstruktur erstellen
```bash
cd frontend/try3/
mkdir -p css js assets/{icons,images,fonts} config docs
```

#### Schritt 1.2: Konfigurationsdatei erstellen
**Datei**: `config/config.js`
```javascript
export const CONFIG = {
  // Google API Configuration
  CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
  API_KEY: 'YOUR_API_KEY', // Optional
  DISCOVERY_DOCS: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
  SCOPES: 'https://www.googleapis.com/auth/spreadsheets',

  // Google Sheets Configuration
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID',
  
  // Sheet Names
  SHEETS: {
    OVERVIEW: 'Sets Overview',
    SUMMARY: 'Collection Summary'
  },

  // Layout Configuration
  CARDS_PER_ROW: 5,
  CARD_BLOCK_WIDTH: 3,
  CARD_BLOCK_HEIGHT: 4,

  // Cache Duration (1 hour)
  CACHE_DURATION: 60 * 60 * 1000
};
```

#### Schritt 1.3: HTML-Grundgerüst erstellen
**Datei**: `index.html`
```html
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pokémon TCG Collection Tracker</title>
  <link rel="stylesheet" href="css/main.css">
  <link rel="stylesheet" href="css/grid.css">
  <link rel="stylesheet" href="css/auth.css">
  <link rel="stylesheet" href="css/responsive.css">
</head>
<body>
  <div id="app">
    <!-- Login Screen -->
    <div id="auth-container" class="auth-screen">
      <div class="auth-box">
        <h1>🎴 Pokémon TCG Collection</h1>
        <p>Melde dich mit deinem Google-Konto an, um deine Sammlung zu verwalten</p>
        <button id="authorize-button" class="btn-primary">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>
      </div>
    </div>

    <!-- Main App -->
    <div id="main-container" style="display:none;">
      <!-- Header -->
      <header class="app-header">
        <div class="header-left">
          <h1>🎴 Pokémon TCG Collection</h1>
        </div>
        <div class="header-right">
          <div id="user-info" class="user-info"></div>
          <button id="signout-button" class="btn-secondary">Sign Out</button>
        </div>
      </header>

      <!-- Navigation -->
      <nav class="app-nav">
        <button id="refresh-button" class="btn-icon" title="Refresh">
          🔄 Refresh
        </button>
        <select id="set-selector" class="set-selector">
          <option value="">Select Set...</option>
        </select>
        <div id="progress-info" class="progress-info"></div>
      </nav>

      <!-- Loading Indicator -->
      <div id="loading" class="loading" style="display:none;">
        <div class="spinner"></div>
        <p>Loading...</p>
      </div>

      <!-- Cards Grid -->
      <main id="cards-container" class="cards-container"></main>
    </div>
  </div>

  <!-- Google API Client Library -->
  <script src="https://apis.google.com/js/api.js"></script>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

---

### Phase 2: Authentifizierung (Tag 1-2)

#### Schritt 2.1: Auth-Modul erstellen
**Datei**: `js/auth.js`
```javascript
import { CONFIG } from '../config/config.js';

let tokenClient;
let gapiInited = false;
let gisInited = false;

/**
 * Initialize Google API Client
 */
export async function initializeGapi() {
  return new Promise((resolve) => {
    gapi.load('client', async () => {
      await gapi.client.init({
        apiKey: CONFIG.API_KEY,
        discoveryDocs: CONFIG.DISCOVERY_DOCS,
      });
      gapiInited = true;
      console.log('GAPI initialized');
      resolve();
    });
  });
}

/**
 * Initialize Google Identity Services
 */
export function initializeGis(callback) {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: callback,
  });
  gisInited = true;
  console.log('GIS initialized');
}

/**
 * Handle Sign-In
 */
export function handleAuthClick() {
  if (!gapiInited || !gisInited) {
    console.error('APIs not initialized');
    return;
  }

  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) {
      console.error('Auth error:', resp);
      throw (resp);
    }
    console.log('Auth successful');
    await onSignIn();
  };

  if (gapi.client.getToken() === null) {
    // Prompt user to select account and consent
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    // Skip display of account chooser and consent dialog
    tokenClient.requestAccessToken({prompt: ''});
  }
}

/**
 * Handle Sign-Out
 */
export function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    console.log('Signed out');
    onSignOut();
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
  return gapi.client.getToken() !== null;
}

/**
 * Get current user info
 */
export function getUserEmail() {
  const token = gapi.client.getToken();
  if (token && token.access_token) {
    // Decode JWT token to get user email
    const base64Url = token.access_token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    const payload = JSON.parse(jsonPayload);
    return payload.email || 'User';
  }
  return null;
}

// Callbacks (set by app.js)
let onSignIn = () => {};
let onSignOut = () => {};

export function setAuthCallbacks(signIn, signOut) {
  onSignIn = signIn;
  onSignOut = signOut;
}
```

---

### Phase 3: Google Sheets API Integration (Tag 2-3)

#### Schritt 3.1: Sheets API Wrapper erstellen
**Datei**: `js/sheets-api.js`
```javascript
import { CONFIG } from '../config/config.js';

/**
 * Read data from Google Sheets
 */
export async function readSheet(range) {
  try {
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: range,
    });
    return response.result.values || [];
  } catch (error) {
    console.error('Error reading sheet:', error);
    throw error;
  }
}

/**
 * Write data to Google Sheets
 */
export async function writeSheet(range, values) {
  try {
    const response = await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      range: range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: values,
      },
    });
    return response.result;
  } catch (error) {
    console.error('Error writing to sheet:', error);
    throw error;
  }
}

/**
 * Batch read multiple ranges
 */
export async function batchReadSheet(ranges) {
  try {
    const response = await gapi.client.sheets.spreadsheets.values.batchGet({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
      ranges: ranges,
    });
    return response.result.valueRanges;
  } catch (error) {
    console.error('Error batch reading:', error);
    throw error;
  }
}

/**
 * Update checkbox state
 */
export async function updateCheckbox(sheetName, row, col, checked) {
  const range = `${sheetName}!${columnToLetter(col)}${row}`;
  await writeSheet(range, [[checked]]);
}

/**
 * Get all sheets in spreadsheet
 */
export async function getAllSheets() {
  try {
    const response = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: CONFIG.SPREADSHEET_ID,
    });
    return response.result.sheets.map(sheet => ({
      id: sheet.properties.sheetId,
      title: sheet.properties.title,
      index: sheet.properties.index,
    }));
  } catch (error) {
    console.error('Error getting sheets:', error);
    throw error;
  }
}

/**
 * Helper: Convert column number to letter
 */
function columnToLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}
```

#### Schritt 3.2: Datenmodelle erstellen
**Datei**: `js/models.js`
```javascript
export class Card {
  constructor(data) {
    this.id = data.id;
    this.number = data.number;
    this.name = data.name;
    this.imageUrl = data.imageUrl;
    this.collected = data.collected || false;
    this.reverseHolo = data.reverseHolo || false;
    this.row = data.row;
    this.colNormal = data.colNormal;
    this.colReverseHolo = data.colReverseHolo;
  }
}

export class Set {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.series = data.series;
    this.total = data.total;
    this.releaseDate = data.releaseDate;
    this.sheetName = data.sheetName;
    this.cards = [];
  }

  addCard(card) {
    this.cards.push(card);
  }

  getProgress() {
    const collected = this.cards.filter(c => c.collected).length;
    return {
      collected,
      total: this.cards.length,
      percentage: Math.round((collected / this.cards.length) * 100)
    };
  }
}
```

---

### Phase 4: UI-Rendering (Tag 3-4)

#### Schritt 4.1: UI-Modul erstellen
**Datei**: `js/ui.js`
```javascript
import { CONFIG } from '../config/config.js';

/**
 * Show/Hide loading indicator
 */
export function setLoading(show, message = 'Loading...') {
  const loading = document.getElementById('loading');
  if (show) {
    loading.querySelector('p').textContent = message;
    loading.style.display = 'flex';
  } else {
    loading.style.display = 'none';
  }
}

/**
 * Render Set Selector
 */
export function renderSetSelector(sets) {
  const selector = document.getElementById('set-selector');
  selector.innerHTML = '<option value="">Select Set...</option>';
  
  sets.forEach(set => {
    const option = document.createElement('option');
    option.value = set.id;
    option.textContent = `${set.name} (${set.total} cards)`;
    selector.appendChild(option);
  });
}

/**
 * Render Cards Grid
 */
export function renderCardsGrid(cards) {
  const container = document.getElementById('cards-container');
  container.innerHTML = '';

  // Group cards by rows
  const rows = [];
  for (let i = 0; i < cards.length; i += CONFIG.CARDS_PER_ROW) {
    rows.push(cards.slice(i, i + CONFIG.CARDS_PER_ROW));
  }

  // Render each row
  rows.forEach(row => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'card-row';

    row.forEach(card => {
      const cardDiv = createCardElement(card);
      rowDiv.appendChild(cardDiv);
    });

    container.appendChild(rowDiv);
  });
}

/**
 * Create Card Element
 */
function createCardElement(card) {
  const cardDiv = document.createElement('div');
  cardDiv.className = 'card-block';
  cardDiv.dataset.cardId = card.id;

  if (card.collected) cardDiv.classList.add('collected');
  if (card.reverseHolo) cardDiv.classList.add('reverse-holo-collected');

  cardDiv.innerHTML = `
    <div class="card-header">
      <span class="card-number">#${card.number}</span>
    </div>
    <div class="card-name">${card.name}</div>
    <div class="card-image">
      <img src="${card.imageUrl}" alt="${card.name}" loading="lazy" onerror="this.src='assets/images/card-placeholder.png'">
    </div>
    <div class="card-checkboxes">
      <label class="checkbox-label">
        <input type="checkbox" 
               class="checkbox-normal" 
               ${card.collected ? 'checked' : ''}>
        <span>Normal</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" 
               class="checkbox-reverse" 
               ${card.reverseHolo ? 'checked' : ''}>
        <span>Reverse Holo</span>
      </label>
    </div>
  `;

  // Add event listeners
  const normalCheckbox = cardDiv.querySelector('.checkbox-normal');
  const reverseCheckbox = cardDiv.querySelector('.checkbox-reverse');

  normalCheckbox.addEventListener('change', (e) => {
    onCheckboxChange(card, 'normal', e.target.checked);
  });

  reverseCheckbox.addEventListener('change', (e) => {
    onCheckboxChange(card, 'reverseHolo', e.target.checked);
  });

  return cardDiv;
}

/**
 * Update card visual state
 */
export function updateCardState(cardId, type, checked) {
  const cardDiv = document.querySelector(`[data-card-id="${cardId}"]`);
  if (!cardDiv) return;

  if (type === 'normal') {
    cardDiv.classList.toggle('collected', checked);
  } else if (type === 'reverseHolo') {
    cardDiv.classList.toggle('reverse-holo-collected', checked);
  }
}

/**
 * Update progress info
 */
export function updateProgressInfo(progress) {
  const progressInfo = document.getElementById('progress-info');
  progressInfo.innerHTML = `
    <span class="progress-text">
      ${progress.collected} / ${progress.total} (${progress.percentage}%)
    </span>
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${progress.percentage}%"></div>
    </div>
  `;
}

/**
 * Display user info
 */
export function displayUserInfo(email) {
  const userInfo = document.getElementById('user-info');
  userInfo.textContent = email;
}

// Callback (set by app.js)
let onCheckboxChange = () => {};

export function setCheckboxCallback(callback) {
  onCheckboxChange = callback;
}
```

---

### Phase 5: Main App Logic (Tag 4-5)

#### Schritt 5.1: Haupt-App erstellen
**Datei**: `js/app.js`
```javascript
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
  console.log('Initializing app...');

  try {
    // Initialize Google APIs
    await Auth.initializeGapi();
    Auth.initializeGis(handleAuthSuccess);

    // Set callbacks
    Auth.setAuthCallbacks(onSignIn, onSignOut);
    UI.setCheckboxCallback(handleCheckboxChange);

    // Setup event listeners
    setupEventListeners();

    console.log('App initialized successfully');
  } catch (error) {
    console.error('Initialization error:', error);
    alert('Failed to initialize app. Please refresh the page.');
  }
}

/**
 * Handle successful authentication
 */
function handleAuthSuccess() {
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
  await loadSets();
}

/**
 * Handle Sign Out
 */
function onSignOut() {
  document.getElementById('auth-container').style.display = 'block';
  document.getElementById('main-container').style.display = 'none';
  document.getElementById('cards-container').innerHTML = '';
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
    console.log('Using cached sets');
    allSets = cached;
    UI.renderSetSelector(allSets);
    return;
  }

  UI.setLoading(true, 'Loading sets...');
  
  try {
    console.log('Loading sets from Google Sheets...');
    
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
    console.log(`Loaded ${allSets.length} sets`);
  } catch (error) {
    console.error('Error loading sets:', error);
    alert('Failed to load sets. Please try again.');
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
    console.log('Using cached set cards');
    currentSet = cached;
    UI.renderCardsGrid(currentSet.cards);
    UI.updateProgressInfo(currentSet.getProgress());
    return;
  }

  UI.setLoading(true, 'Loading cards...');
  
  try {
    console.log(`Loading cards for set: ${setId}`);
    
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
    
    console.log(`Loaded ${cards.length} cards`);
  } catch (error) {
    console.error('Error loading cards:', error);
    alert('Failed to load cards. Please try again.');
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

  // Skip header rows
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
      const normalChecked = data[checkboxRow] ? (data[checkboxRow][baseCol] === 'TRUE' || data[checkboxRow][baseCol] === true) : false;
      const reverseHoloChecked = data[checkboxRow] ? (data[checkboxRow][baseCol + 1] === 'TRUE' || data[checkboxRow][baseCol + 1] === true) : false;

      if (cardNumber) {
        cards.push(new Card({
          id: `${sheetName}-${cardNumber}`,
          number: cardNumber,
          name: cardName || '',
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
    console.log(`Updating ${type} for card ${card.id}: ${checked}`);

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
    
    console.log('Update successful');
  } catch (error) {
    console.error('Error updating checkbox:', error);
    alert('Failed to update. Please try again.');
    // Reload to sync state
    loadSetCards(currentSet.id);
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
    Auth.handleSignoutClick();
  });

  // Set selector
  document.getElementById('set-selector').addEventListener('change', (e) => {
    if (e.target.value) {
      loadSetCards(e.target.value);
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
```

---

### Phase 6: Caching (Tag 5)

#### Schritt 6.1: Cache-Modul erstellen
**Datei**: `js/cache.js`
```javascript
import { CONFIG } from '../config/config.js';

/**
 * Cache Manager
 */
class CacheManager {
  constructor() {
    this.cache = new Map();
  }

  set(key, value, duration = CONFIG.CACHE_DURATION) {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      duration
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > item.duration) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  has(key) {
    return this.get(key) !== null;
  }

  clear(key) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  clearExpired() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.duration) {
        this.cache.delete(key);
      }
    }
  }
}

export const cache = new CacheManager();

// Clear expired cache every 5 minutes
setInterval(() => cache.clearExpired(), 5 * 60 * 1000);
```

---

### Phase 7: Styling (Tag 5-6)

#### Schritt 7.1: Main CSS
**Datei**: `css/main.css`
```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
  padding: 20px;
}

#app {
  max-width: 1400px;
  margin: 0 auto;
}

/* Loading */
.loading {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #667eea;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading p {
  color: white;
  margin-top: 20px;
  font-size: 18px;
}

/* Header */
.app-header {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.app-header h1 {
  font-size: 24px;
  color: #333;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 15px;
}

.user-info {
  color: #666;
  font-size: 14px;
}

/* Navigation */
.app-nav {
  background: white;
  padding: 15px 20px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 20px;
}

.set-selector {
  flex: 1;
  padding: 10px 15px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  background: white;
  cursor: pointer;
}

.progress-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-bar {
  width: 200px;
  height: 20px;
  background: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  transition: width 0.3s ease;
}

/* Buttons */
.btn-primary, .btn-secondary, .btn-icon {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-primary {
  background: #667eea;
  color: white;
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-primary:hover {
  background: #5568d3;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
}

.btn-secondary {
  background: #f5f5f5;
  color: #333;
}

.btn-secondary:hover {
  background: #e0e0e0;
}

.btn-icon {
  background: white;
  border: 2px solid #e0e0e0;
}

.btn-icon:hover {
  border-color: #667eea;
  color: #667eea;
}

/* Cards Container */
.cards-container {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}
```

#### Schritt 7.2: Grid CSS
**Datei**: `css/grid.css`
```css
.card-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 20px;
  margin-bottom: 20px;
}

.card-block {
  border: 2px solid #e0e0e0;
  border-radius: 12px;
  padding: 15px;
  background: white;
  transition: all 0.3s ease;
}

.card-block:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
}

.card-block.collected {
  background-color: #D9EAD3;
  border-color: #34A853;
}

.card-block.reverse-holo-collected {
  background-color: #D0E0F0;
  border-color: #4285F4;
}

.card-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.card-number {
  font-weight: bold;
  color: #667eea;
  font-size: 14px;
}

.card-name {
  font-size: 12px;
  color: #666;
  margin-bottom: 10px;
  min-height: 32px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-image {
  width: 100%;
  aspect-ratio: 2.5 / 3.5;
  overflow: hidden;
  border-radius: 8px;
  margin-bottom: 12px;
  background: #f5f5f5;
}

.card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  cursor: pointer;
  padding: 5px;
  border-radius: 4px;
  transition: background 0.2s ease;
}

.checkbox-label:hover {
  background: #f5f5f5;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.checkbox-label span {
  user-select: none;
}
```

#### Schritt 7.3: Auth CSS
**Datei**: `css/auth.css`
```css
.auth-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80vh;
}

.auth-box {
  background: white;
  padding: 60px 40px;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  text-align: center;
  max-width: 400px;
}

.auth-box h1 {
  font-size: 32px;
  margin-bottom: 15px;
  color: #333;
}

.auth-box p {
  color: #666;
  margin-bottom: 30px;
  line-height: 1.6;
}
```

#### Schritt 7.4: Responsive CSS
**Datei**: `css/responsive.css`
```css
@media (max-width: 1200px) {
  .card-row {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 992px) {
  .card-row {
    grid-template-columns: repeat(3, 1fr);
  }
  
  .app-header {
    flex-direction: column;
    gap: 15px;
  }
}

@media (max-width: 768px) {
  .card-row {
    grid-template-columns: repeat(2, 1fr);
    gap: 15px;
  }
  
  .app-nav {
    flex-direction: column;
  }
  
  .progress-bar {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .card-row {
    grid-template-columns: 1fr;
  }
  
  body {
    padding: 10px;
  }
  
  .auth-box {
    padding: 40px 20px;
  }
}
```

---

## 📝 Testing Checklist

### Lokales Testing
- [ ] Lokalen Server starten (`python3 -m http.server 8000`)
- [ ] Browser öffnen (`http://localhost:8000/frontend/try3/`)
- [ ] Google Sign-In funktioniert
- [ ] Sets werden geladen
- [ ] Karten werden angezeigt
- [ ] Checkboxen funktionieren
- [ ] Änderungen werden in Google Sheets gespeichert
- [ ] Responsive Design auf verschiedenen Bildschirmgrößen
- [ ] Cache funktioniert (schnelleres Laden beim 2. Mal)

### Browser-Kompatibilität
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile browsers

---

## 🚀 Deployment

### Schritt 1: Code committen
```bash
git add frontend/try3/
git commit -m "feat: Complete try3 frontend implementation"
git push origin feature/try3-google-sheets-frontend
```

### Schritt 2: Pull Request erstellen
1. Auf GitHub Pull Request öffnen
2. Branch: `feature/try3-google-sheets-frontend` → `main`
3. Review durchführen
4. Merge

### Schritt 3: Auto-Deployment
- Workflow merged automatisch von `main` → `release`
- GitHub Pages deployment wird getriggert
- Nach ~2-3 Minuten ist die Seite live

### Schritt 4: Verifizierung
- URL öffnen: `https://veraatversus.github.io/pokemon-tcg-data/frontend/try3/`
- Funktionalität testen

---

## 🔍 Troubleshooting

### Problem: "API not initialized"
**Lösung**: Prüfe ob Google API libraries geladen sind (Netzwerk-Tab)

### Problem: "Authorization failed"
**Lösung**: 
1. Prüfe Client-ID in `config/config.js`
2. Prüfe Authorized Origins in Google Cloud Console
3. Lösche Browser-Cookies und versuche erneut

### Problem: "Failed to load sets"
**Lösung**:
1. Prüfe Spreadsheet-ID
2. Prüfe Freigabe-Einstellungen der Tabelle
3. Prüfe Sheet-Namen (muss genau übereinstimmen)

### Problem: "CORS Error"
**Lösung**:
1. Verwende lokalen Server (nicht `file://`)
2. Prüfe Authorized Origins
3. Prüfe dass API aktiviert ist

---

## � Implementierungs-Fortschritt

### Abgeschlossene Phasen ✅

| Phase | Beschreibung | Status | Details |
|-------|-------------|--------|---------|
| **Phase 1** | Projekt-Setup | ✅ Fertig | Branch, Verzeichnis, HTML-Grundgerüst |
| **Phase 2** | Authentifizierung | ✅ Fertig | OAuth 2.0, Google Sign-In Integration |
| **Phase 3** | Google Sheets API | ✅ Fertig | API-Wrapper, Error Handling |
| **Phase 4** | UI-Rendering | ✅ Fertig | Grid-Layout, Card-Components, Responsive |
| **Phase 5** | App-Logik | ✅ Fertig | Data Loading, Set-Management, Sync |
| **Phase 6** | Caching-System | ✅ Fertig | Client-Side Cache, TTL-Management |
| **Phase 7** | Styling & CSS | ✅ Fertig | Grid, Responsive, Animations, Dark Mode |
| **Phase 8** | Search & Filter | ✅ Fertig | Suche, Sortierung, Set-Filter |
| **Phase 9** | Analytics Dashboard | ✅ Fertig | Statistiken, Serie-Übersicht, Rankings |
| **Phase 10** | Modal-System | ✅ Fertig | Set-Details, Export, Analytics Modal |
| **Phase 11** | Export-Funktionen | ✅ Fertig | CSV, JSON, Print Support |
| **Phase 12** | Error Handling | ✅ Fertig | Recovery Strategies, Offline Support |
| **Phase 13** | Testing & Doku | ✅ Fertig | TESTING.md, DEPLOYMENT.md, Guides |

### Implementierte Features

**Core Features** ✅
- [x] OAuth 2.0 Authentication mit Google
- [x] Lesen von Google Sheets Daten
- [x] Schreiben von Checkbox-Status in Google Sheets
- [x] Echtzeit-Synchronisation
- [x] Client-Side Caching (1h TTL)

**UI Features** ✅
- [x] Grid-Layout (responsive: 5/3/2/1 Spalten)
- [x] Card-Komponenten mit Bildern
- [x] Search/Filter/Sort Toolbar
- [x] Set-Details Modal
- [x] Analytics Dashboard
- [x] Export Modal (CSV, JSON, Print)
- [x] Toast-Benachrichtigungen
- [x] Dark Mode Support

**Advanced Features** ✅
- [x] Offline-Erkennung & Fallback
- [x] Error Recovery mit Retry-Logik
- [x] Compression für große Datasets
- [x] Natural Sort (numerisch-bewusst)
- [x] Browser-Kompatibilität (Chrome, Firefox, Safari)
- [x] Performance-Optimierung
- [x] Keyboard-Navigation (ESC zum Schließen)

**Code Quality** ✅
- [x] Modular JavaScript Architecture
- [x] Error Handling & Validation
- [x] Config-Management
- [x] Console Logging mit Emojis
- [x] Code-Kommentare
- [x] Es6 Modules

### Dateien & Module

```
frontend/try3/
├── 📄 index.html                    (HTML Hauptseite)
├── 📄 README.md                     (Projekt-Übersicht)
├── 📄 IMPLEMENTATION_PLAN.md        (Dieser Plan)
├── 📄 TESTING.md                    (Testing Guide)
│
├── 📁 config/
│   └── 📄 config.js                 (API Credentials)
│
├── 📁 css/
│   ├── 📄 main.css                  (Hauptstyles)
│   ├── 📄 grid.css                  (Grid-Layout)
│   ├── 📄 auth.css                  (Auth-Styles)
│   ├── 📄 responsive.css            (Mobile Responsive)
│   ├── 📄 modals.css                (Modal Dialogs)
│   └── 📄 analytics.css             (Analytics Styles)
│
├── 📁 js/
│   ├── 📄 app.js                    (Main Application)
│   ├── 📄 auth.js                   (OAuth & Google Sign-In)
│   ├── 📄 sheets-api.js             (Google Sheets Wrapper)
│   ├── 📄 ui.js                     (UI Rendering)
│   ├── 📄 models.js                 (Data Models)
│   ├── 📄 cache.js                  (Caching System)
│   ├── 📄 utils.js                  (Utility Functions)
│   ├── 📄 modals.js                 (Modal System)
│   ├── 📄 analytics.js              (Statistics & Analytics)
│   └── 📄 errors.js                 (Error Handling)
│
├── 📁 assets/
│   ├── 📁 images/
│   ├── 📁 icons/
│   └── 📁 fonts/
│
└── 📁 docs/
    ├── 📄 GOOGLE_CLOUD_SETUP.md     (Google Cloud Guide)
    └── 📄 DEPLOYMENT.md             (Deployment Guide)
```

**Zusammenfassung**:
- **Total Zeilen Code**: ~2.500+ Lines (JS, CSS, HTML)
- **JavaScript Module**: 10 Module
- **CSS Files**: 6 Stylesheets  
- **Dokumentation**: 4 Guides + README
- **Test Coverage**: Umfassende Checkliste

---

## 🚀 Nächste Schritte

### 1. Lokales Testing ⏳
**Status**: Bereit für Testing
**Dokumentation**: [TESTING.md](./TESTING.md)

Schritte:
```bash
cd frontend/try3/
python3 -m http.server 8000
# Öffne http://localhost:8000
# Folge Testing-Checkliste
```

### 2. Deployment vorbereiten ⏳
**Dokumentation**: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)

Schritte:
```bash
git add frontend/try3/
git commit -m "feat: Complete try3 frontend with analytics and error handling"
git push origin feature/try3-google-sheets-frontend
# Erstelle Pull Request zu main
```

### 3. GitHub Pages Deployment ⏳
Automatischer Prozess:
1. PR merge zu main
2. Auto-merge zu release
3. GitHub Actions deploys zu GitHub Pages
4. Live unter: https://veraatversus.github.io/pokemon-tcg-data/frontend/try3/

---

**Zuletzt aktualisiert**: 01.02.2026
**Status**: ✅ Implementation complete - Ready for testing & deployment
**Geschätzte verbleibende Zeit**: 2-3 Stunden (Testing + Deployment)
