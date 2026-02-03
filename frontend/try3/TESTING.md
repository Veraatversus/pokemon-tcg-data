# 🚀 Lokales Testing & Development Guide

## Schnellstart

### 1. Lokalen Web-Server starten

```bash
# Im Repository-Root oder in frontend/try3/
cd frontend/try3

# Mit Python 3
python3 -m http.server 8000

# Mit Python 2
python -m SimpleHTTPServer 8000

# Mit Node.js (wenn installiert)
npx http-server -p 8000
```

Browser öffnen: **http://localhost:8000**

### 2. Google Cloud Setup durchführen

Vor dem ersten Test musst du Google Cloud konfigurieren:

1. **Google Cloud Console öffnen**
   - https://console.cloud.google.com/

2. **Neues Projekt erstellen**
   - Name: `pokemon-tcg-frontend-try3`

3. **Google Sheets API aktivieren**
   - APIs & Services → Library
   - "Google Sheets API" suchen und aktivieren

4. **OAuth Consent Screen konfigurieren**
   - External App
   - App Name: "Pokémon TCG Collection Tracker"
   - Scopes: `https://www.googleapis.com/auth/spreadsheets`

5. **OAuth Client ID erstellen**
   - Credentials → Create Credentials → OAuth Client ID
   - Application Type: Web Application
   - Authorized JavaScript origins: `http://localhost:8000`
   - Authorized redirect URIs: `http://localhost:8000/frontend/try3/`

6. **Client ID kopieren**

7. **Credentials in `config/config.js` eintragen**
   ```javascript
   CLIENT_ID: 'DEINE_CLIENT_ID.apps.googleusercontent.com',
   SPREADSHEET_ID: 'DEINE_SPREADSHEET_ID'
   ```

### 3. Google Sheets Tabelle vorbereiten

- Öffne oder erstelle eine Tabelle in Google Sheets
- Struktur muss der try1/try2 entsprechen (Sets Overview + Set-Blätter)
- Spreadsheet-ID aus URL kopieren
- In `config/config.js` eintragen

### 4. Test starten

Browser: **http://localhost:8000**

1. Google Sign-In Button klicken
2. Mit Google-Konto anmelden
3. Sets sollten geladen werden
4. Karten anzeigen und Checkboxen testen

## Testing Checklist

### ✅ Funktionalität testen

- [ ] **Authentication**
  - [ ] Sign-In funktioniert
  - [ ] Email wird angezeigt
  - [ ] Sign-Out funktioniert
  - [ ] Nach Sign-Out ist UI leer

- [ ] **Set Loading**
  - [ ] Sets werden geladen
  - [ ] Set-Selector wird gefüllt
  - [ ] Cache funktioniert (schneller beim 2. Mal)

- [ ] **Cards**
  - [ ] Karten werden angezeigt
  - [ ] Bilder laden
  - [ ] Grid-Layout ist korrekt (5 Spalten)
  - [ ] Lazy Loading funktioniert

- [ ] **Checkboxes**
  - [ ] Normal-Checkbox funktioniert
  - [ ] Reverse Holo-Checkbox funktioniert
  - [ ] Änderung wird in Google Sheets gespeichert
  - [ ] Card-State ändert sich visuell

- [ ] **Suche & Filter**
  - [ ] Suche nach Name funktioniert
  - [ ] Suche nach Nummer funktioniert
  - [ ] Filter "Gesammelt" funktioniert
  - [ ] Filter "Fehlend" funktioniert
  - [ ] Filter "Reverse Holo" funktioniert
  - [ ] Sortierung funktioniert

- [ ] **Details & Export**
  - [ ] Set-Details Modal öffnet
  - [ ] Statistiken sind korrekt
  - [ ] Export CSV funktioniert
  - [ ] Export JSON funktioniert
  - [ ] Print-Funktion funktioniert

- [ ] **Analytics**
  - [ ] Analytics Modal öffnet
  - [ ] Gesamtstatistiken stimmen
  - [ ] Serie-Statistiken stimmen
  - [ ] Set-Ranking wird angezeigt

### ✅ UI & UX testen

- [ ] **Desktop (1400px+)**
  - [ ] Layout sieht gut aus
  - [ ] Text ist lesbar
  - [ ] Buttons funktionieren
  - [ ] Navigation ist klar

- [ ] **Tablet (768px-1200px)**
  - [ ] Grid hat 3 Spalten
  - [ ] Navigation ist kompakt
  - [ ] Touch-Funktionen arbeiten

- [ ] **Mobile (< 768px)**
  - [ ] Grid hat 2 Spalten
  - [ ] Buttons sind groß genug
  - [ ] Text ist lesbar
  - [ ] Keine horizontalen Scrolls

- [ ] **Extra Small (< 480px)**
  - [ ] Grid hat 1 Spalte
  - [ ] Modals passen auf Bildschirm
  - [ ] Bedienung ist möglich

### ✅ Browser-Kompatibilität

- [ ] **Chrome/Edge (latest)**
- [ ] **Firefox (latest)**
- [ ] **Safari (latest)**
- [ ] **Mobile browsers** (Chrome, Safari)

### ✅ Fehlerbehandlung

- [ ] **Offline**
  - [ ] App zeigt Offline-Meldung
  - [ ] Änderungen sind möglich (werden gecacht)
  - [ ] Nach Reconnect synchen Änderungen

- [ ] **Auth Fehler**
  - [ ] Invalide Token werden erkannt
  - [ ] User wird zum Login geleitet

- [ ] **API Fehler**
  - [ ] 401/403 werden korrekt gehandhabt
  - [ ] Error Messages werden angezeigt
  - [ ] Retry-Logik funktioniert

### ✅ Performance

- [ ] **Initialisierung**
  - [ ] App lädt in < 3s
  - [ ] Google APIs laden

- [ ] **Set Loading**
  - [ ] Erstes Laden: < 5s
  - [ ] Cache-Hit: < 1s
  - [ ] Keine Freezes beim Laden

- [ ] **Interaktion**
  - [ ] Checkbox-Clicks sind schnell
  - [ ] Suche ist responsiv
  - [ ] Keine Lag beim Scrollen

## Debugging

### Browser Console öffnen

- **Chrome/Edge**: F12 oder Ctrl+Shift+I (Windows), Cmd+Option+I (Mac)
- **Firefox**: F12 oder Ctrl+Shift+I (Windows), Cmd+Option+I (Mac)
- **Safari**: Develop → Show Web Inspector

### Helpful Console Commands

```javascript
// Check configuration
console.log(window.CONFIG)

// Check cache
console.log(window.cache.cache)

// Check current set
console.log(window.currentSet)

// Clear cache
window.cache.clear()

// Force reload sets
window.loadSets()
```

### Common Issues

**Problem**: "API not initialized"
- Prüfe ob Google API libraries geladen sind (Network tab)
- Prüfe ob JavaScript Errors in Console sind
- Warte ein paar Sekunden und reload

**Problem**: "Authorization failed"
- Prüfe Client-ID in config/config.js
- Prüfe Authorized Origins in Google Cloud Console
- Lösche Browser Cookies und versuche erneut

**Problem**: "Failed to load sets"
- Prüfe Spreadsheet-ID
- Prüfe Freigabe-Einstellungen der Tabelle
- Prüfe Sheet-Namen in config/config.js

**Problem**: "Bilder laden nicht"
- Prüfe ob URLs in Sheets gültig sind
- Prüfe Bild-Placeholder (assets/images/card-placeholder.png)
- Öffne Bild-URL direkt im Browser

## Development Tipps

### Hot Reload (ohne Server-Neustarts)

Einfach Browser-Seite refreshen (F5) - keine Server-Neustarts nötig

### Console Logging

Alle Module verwenden console.log mit Emojis:
- ✅ = Erfolg
- ❌ = Fehler
- 📥 = Daten laden
- 🔄 = Update
- 📦 = Cache hit

### Debug Mode aktivieren

```javascript
// In Browser Console
window.__DEBUG__ = true
```

Dann wird zusätzliche Debug-Info geloggt.

## Nach Dem Testing

Wenn alles funktioniert:

1. **Änderungen committen**
   ```bash
   git add frontend/try3/
   git commit -m "feat: Complete try3 frontend with testing"
   ```

2. **Branch pushen**
   ```bash
   git push origin feature/try3-google-sheets-frontend
   ```

3. **Pull Request erstellen**
   - Base: `main`
   - Head: `feature/try3-google-sheets-frontend`
   - Description: Testing durchgeführt und verifiziert

4. **Nach Merge**: Auto-Deployment auf GitHub Pages

---

**Letzte Aktualisierung**: 03.02.2026
