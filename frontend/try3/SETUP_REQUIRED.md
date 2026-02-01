# ⚠️ GOOGLE CLOUD SETUP ERFORDERLICH

## 🎯 Nächste Schritte

Die Implementierung ist fast fertig! Jetzt musst du noch **Google Cloud einrichten**.

### Was wurde bereits erstellt?

✅ Alle HTML/CSS/JavaScript Dateien
✅ Vollständige Frontend-Implementierung
✅ Responsive Design
✅ OAuth 2.0 Integration (Code bereit)
✅ Google Sheets API Integration (Code bereit)
✅ Dokumentation

### Was fehlt noch?

🔴 **Google Cloud Credentials** (benötigt für OAuth)

Du musst folgende Werte in `config/config.js` eintragen:
- `CLIENT_ID` - Deine OAuth Client-ID
- `SPREADSHEET_ID` - ID deiner Google Sheets Tabelle

## 🚀 Setup durchführen

### Detaillierte Anleitung

Öffne: [`docs/GOOGLE_CLOUD_SETUP.md`](./docs/GOOGLE_CLOUD_SETUP.md)

Diese Datei enthält eine **Schritt-für-Schritt Anleitung** mit:
- Screenshots-Referenzen
- Alle benötigten URLs
- Troubleshooting Tipps

### Schnellanleitung (15-30 Minuten)

1. **Google Cloud Console öffnen**
   - https://console.cloud.google.com/

2. **Projekt erstellen**
   - Name: `pokemon-tcg-frontend-try3`

3. **Google Sheets API aktivieren**
   - APIs & Services → Library → "Google Sheets API"

4. **OAuth Consent Screen**
   - External App
   - Scope: `spreadsheets`

5. **OAuth Client ID erstellen**
   - Web Application
   - Authorized Origins: `https://veraatversus.github.io` + `http://localhost:8000`
   - Kopiere die **Client-ID**

6. **Credentials eintragen**
   ```bash
   # Öffne config/config.js
   # Ersetze:
   CLIENT_ID: 'YOUR_CLIENT_ID...' → 'DEINE_ECHTE_CLIENT_ID'
   SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID' → 'DEINE_ECHTE_SPREADSHEET_ID'
   ```

7. **Lokal testen**
   ```bash
   python3 -m http.server 8000
   # Öffne: http://localhost:8000/frontend/try3/
   ```

8. **Deployen**
   ```bash
   git add .
   git commit -m "feat: Configure Google Cloud credentials"
   git push
   ```

## 📁 Projektstruktur

```
frontend/try3/
├── index.html           ✅ Fertig
├── config/
│   └── config.js        🔴 Credentials eintragen!
├── js/
│   ├── app.js          ✅ Fertig
│   ├── auth.js         ✅ Fertig
│   ├── sheets-api.js   ✅ Fertig
│   ├── ui.js           ✅ Fertig
│   ├── models.js       ✅ Fertig
│   └── cache.js        ✅ Fertig
├── css/
│   ├── main.css        ✅ Fertig
│   ├── grid.css        ✅ Fertig
│   ├── auth.css        ✅ Fertig
│   └── responsive.css  ✅ Fertig
└── docs/
    ├── GOOGLE_CLOUD_SETUP.md   ✅ Anleitung
    └── DEPLOYMENT.md           ✅ Deployment-Guide
```

## 🎉 Nach dem Setup

Sobald die Credentials eingetragen sind, kannst du:

1. **Lokal testen**: http://localhost:8000/frontend/try3/
2. **Auf GitHub Pages deployen**: Automatisch nach Merge
3. **Live nutzen**: https://veraatversus.github.io/pokemon-tcg-data/frontend/try3/

## 💡 Tipps

- Die Einrichtung dauert ca. 15-30 Minuten
- Folge der Anleitung Schritt für Schritt
- Bei Problemen: Siehe `docs/GOOGLE_CLOUD_SETUP.md` Troubleshooting

## 📞 Bei Fragen

Öffne ein Issue oder prüfe die Dokumentation in `docs/`.

---

**Status**: 🟡 Implementation Complete - Credentials Required
**Nächster Schritt**: Google Cloud Setup (siehe docs/GOOGLE_CLOUD_SETUP.md)
