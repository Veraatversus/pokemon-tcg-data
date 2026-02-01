# Google Cloud Setup Guide

## ⚠️ WICHTIG: Dieser Schritt ist erforderlich!

Um das Frontend zu verwenden, musst du ein Google Cloud Project einrichten und OAuth Credentials erstellen.

## 📋 Setup-Schritte

### 1. Google Cloud Project erstellen

1. Öffne https://console.cloud.google.com/
2. Klicke auf "Neues Projekt erstellen"
3. Projektname: `pokemon-tcg-frontend-try3`
4. Klicke auf "Erstellen"
5. Warte bis das Projekt erstellt wurde

### 2. Google Sheets API aktivieren

1. Wähle dein Projekt aus
2. Gehe zu "APIs & Services" → "Library"
3. Suche nach "Google Sheets API"
4. Klicke auf "Google Sheets API"
5. Klicke auf "AKTIVIEREN"

### 3. OAuth Consent Screen konfigurieren

1. Gehe zu "APIs & Services" → "OAuth consent screen"
2. Wähle "External" (für öffentliche Nutzung)
3. Klicke auf "ERSTELLEN"
4. Fülle die erforderlichen Felder aus:
   - **App name**: Pokémon TCG Collection Tracker
   - **User support email**: Deine E-Mail
   - **Developer contact email**: Deine E-Mail
5. Klicke auf "SPEICHERN UND FORTFAHREN"
6. Bei "Scopes" füge hinzu:
   - `https://www.googleapis.com/auth/spreadsheets`
7. Klicke auf "SPEICHERN UND FORTFAHREN"
8. Bei "Test users" füge deine E-Mail hinzu (für Testing)
9. Klicke auf "SPEICHERN UND FORTFAHREN"

### 4. OAuth Client ID erstellen

1. Gehe zu "APIs & Services" → "Credentials"
2. Klicke auf "+ CREDENTIALS ERSTELLEN"
3. Wähle "OAuth client ID"
4. Application type: "Web application"
5. Name: `Pokemon TCG Frontend`
6. **Authorized JavaScript origins**:
   ```
   https://veraatversus.github.io
   http://localhost:8000
   ```
7. **Authorized redirect URIs**:
   ```
   https://veraatversus.github.io/pokemon-tcg-data/frontend/try3/
   http://localhost:8000/frontend/try3/
   ```
8. Klicke auf "ERSTELLEN"
9. **WICHTIG**: Kopiere die **Client-ID** (z.B. `123456789-abc123def456.apps.googleusercontent.com`)

### 5. Credentials in config.js eintragen

1. Öffne `frontend/try3/config/config.js`
2. Ersetze `YOUR_CLIENT_ID.apps.googleusercontent.com` mit deiner echten Client-ID
3. Ersetze `YOUR_SPREADSHEET_ID` mit der ID deiner Google Sheets Tabelle

**Spreadsheet-ID finden**:
- Öffne deine Google Sheets Tabelle
- Die ID ist in der URL: `https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit`
- Kopiere den Teil zwischen `/d/` und `/edit`

### 6. Google Sheets Freigabe

Stelle sicher, dass deine Google Sheets Tabelle die richtigen Freigabe-Einstellungen hat:

**Option A - Privat** (empfohlen):
- Nur du kannst die Tabelle sehen
- Frontend benötigt OAuth-Authentifizierung für Zugriff

**Option B - Öffentlich lesbar**:
- "Jeder mit dem Link kann ansehen"
- Frontend benötigt nur OAuth für Schreibzugriff

## ✅ Fertig!

Nach dem Setup kannst du das Frontend lokal testen:

```bash
cd frontend/try3/
python3 -m http.server 8000
```

Öffne: http://localhost:8000/frontend/try3/

## 🔧 Troubleshooting

### "Invalid Client ID"
- Prüfe ob Client-ID korrekt in `config/config.js` eingetragen ist
- Prüfe ob keine Leerzeichen am Anfang/Ende sind

### "Redirect URI Mismatch"
- Prüfe ob Authorized redirect URIs korrekt eingetragen sind
- URL muss EXAKT übereinstimmen (inkl. trailing slash)

### "Access Denied"
- Prüfe ob Spreadsheet-ID korrekt ist
- Prüfe ob du Zugriff auf die Tabelle hast
- Prüfe Freigabe-Einstellungen der Tabelle

### "API not activated"
- Prüfe ob Google Sheets API aktiviert ist
- Warte 1-2 Minuten nach Aktivierung

## 📚 Weitere Ressourcen

- [Google Sheets API Docs](https://developers.google.com/sheets/api)
- [OAuth 2.0 for Web Apps](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow)
- [Google Cloud Console](https://console.cloud.google.com)
