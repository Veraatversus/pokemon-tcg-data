# 🎴 Pokémon TCG Frontend (Try3)

> **Static GitHub Pages Frontend with Google Sheets API Integration**

## 📖 Übersicht

Dies ist eine moderne Web-Anwendung zur Verwaltung deiner Pokémon-Kartensammlung. Das Frontend läuft als statische Seite auf GitHub Pages und greift über die Google Sheets API v4 auf eine Google Sheets-Tabelle als Backend zu.

## ✨ Features

- ✅ **OAuth 2.0 Authentifizierung** mit Google Sign-In
- ✅ **Echtzeit-Synchronisation** mit Google Sheets
- ✅ **Grid-Layout** zur Anzeige der Karten (5 pro Reihe)
- ✅ **Checkbox-Tracking** für Normal & Reverse Holo
- ✅ **Responsive Design** für Desktop und Mobile
- ✅ **Client-Side Caching** für bessere Performance
- ✅ **Deutsche Lokalisierung** via TCGDex API

## 🚀 Quick Start

### Voraussetzungen
- Google-Konto
- Google Sheets Tabelle mit Pokémon-Sammlung
- Google Cloud Project mit aktivierter Sheets API

### 1. Google API Setup
Folge den Anweisungen in [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) Abschnitt "Google API Setup".

### 2. Konfiguration
Trage deine Credentials in `config/config.js` ein:
```javascript
export const CONFIG = {
  CLIENT_ID: 'DEINE_CLIENT_ID.apps.googleusercontent.com',
  SPREADSHEET_ID: 'DEINE_SPREADSHEET_ID',
  // ...
};
```

### 3. Lokales Testing
```bash
# Lokalen Server starten
python3 -m http.server 8000

# Browser öffnen
# http://localhost:8000/frontend/try3/
```

### 4. Deployment
```bash
# Änderungen committen
git add frontend/try3/
git commit -m "feat: Configure try3 frontend"

# Branch pushen
git push origin feature/try3-google-sheets-frontend

# Pull Request erstellen und mergen
```

Nach dem Merge nach `release` wird die Seite automatisch auf GitHub Pages deployed:
`https://veraatversus.github.io/pokemon-tcg-data/frontend/try3/`

## 📁 Projektstruktur

```
frontend/try3/
├── index.html              # Haupt-HTML-Datei
├── README.md               # Diese Datei
├── IMPLEMENTATION_PLAN.md  # Detaillierter Implementierungsplan
├── css/                    # Stylesheets
├── js/                     # JavaScript-Module
├── assets/                 # Bilder, Icons, Fonts
├── config/                 # Konfigurationsdateien
└── docs/                   # Zusätzliche Dokumentation
```

## 📚 Dokumentation

- **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** - Vollständiger Implementierungsplan mit:
  - Architektur-Diagrammen
  - Schritt-für-Schritt Anleitung
  - Code-Beispielen für alle Module
  - Testing & Deployment Guide

## 🔧 Technologie-Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **API**: Google Sheets API v4
- **Auth**: Google OAuth 2.0
- **Hosting**: GitHub Pages (Static)
- **Backend**: Google Sheets

## 🎯 Entwicklungsstatus

### Phase 1: Planning ✅
- [x] Branch erstellt
- [x] Implementierungsplan dokumentiert
- [x] Projektstruktur definiert

### Phase 2: Setup ⏳
- [ ] Google Cloud Project erstellt
- [ ] OAuth Credentials konfiguriert
- [ ] Spreadsheet-ID eingetragen

### Phase 3: Implementation ⏳
- [ ] HTML-Grundgerüst erstellt
- [ ] Auth-Modul implementiert
- [ ] Sheets API Wrapper implementiert
- [ ] UI-Rendering implementiert
- [ ] Main App Logic implementiert

### Phase 4: Testing & Deployment ⏳
- [ ] Lokales Testing durchgeführt
- [ ] Auf GitHub Pages deployed
- [ ] Funktionalität verifiziert

## 🆘 Support

Bei Problemen siehe:
- **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** - Abschnitt "Troubleshooting"
- **Google Sheets API Docs**: https://developers.google.com/sheets/api
- **OAuth 2.0 Docs**: https://developers.google.com/identity/protocols/oauth2

## 📜 Lizenz

**MIT License** - Siehe Root-Verzeichnis für Details.

---

**Status**: 🚧 In Entwicklung
**Branch**: `feature/try3-google-sheets-frontend`
**Zuletzt aktualisiert**: 01.02.2026
