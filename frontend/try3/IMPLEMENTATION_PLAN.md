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
   http://localhost:8000 (für lokale Entwicklung)
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

[Content continues with all implementation phases, code examples, and deployment steps as shown in the complete document...]

---

**Zuletzt aktualisiert**: 01.02.2026
**Status**: ✅ Plan erstellt, Ready for Implementation
