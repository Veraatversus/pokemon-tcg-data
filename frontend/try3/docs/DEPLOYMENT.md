# 🚀 Deployment Guide

## Lokales Testing

### 1. Lokalen Server starten

```bash
cd frontend/try3/
python3 -m http.server 8000
```

### 2. Browser öffnen

Öffne: http://localhost:8000/frontend/try3/

### 3. Testen

- [ ] Login funktioniert
- [ ] Sets werden geladen
- [ ] Karten werden angezeigt
- [ ] Checkboxen funktionieren
- [ ] Änderungen werden in Google Sheets gespeichert
- [ ] Responsive Design auf verschiedenen Größen

## Deployment auf GitHub Pages

### Voraussetzungen

- [ ] Google Cloud Setup abgeschlossen
- [ ] Client-ID in `config/config.js` eingetragen
- [ ] Spreadsheet-ID in `config/config.js` eingetragen
- [ ] Lokales Testing erfolgreich

### Deployment-Schritte

#### 1. Änderungen committen

```bash
git add frontend/try3/
git commit -m "feat: Complete try3 frontend implementation"
```

#### 2. Branch pushen

```bash
git push origin feature/try3-google-sheets-frontend
```

#### 3. Pull Request erstellen

1. Gehe zu GitHub Repository
2. Klicke auf "Pull requests"
3. Klicke auf "New pull request"
4. Base: `main` ← Compare: `feature/try3-google-sheets-frontend`
5. Klicke auf "Create pull request"
6. Titel: "feat: Add try3 Google Sheets frontend"
7. Beschreibung: "Adds static frontend with Google Sheets API integration"
8. Klicke auf "Create pull request"

#### 4. Review & Merge

1. Review den Code
2. Prüfe dass alle Files korrekt sind
3. Klicke auf "Merge pull request"
4. Klicke auf "Confirm merge"

#### 5. Auto-Deployment

Der Workflow merged automatisch von `main` → `release` und deployed auf GitHub Pages.

Warte 2-3 Minuten, dann ist die Seite live unter:
```
https://veraatversus.github.io/pokemon-tcg-data/frontend/try3/
```

### Nach dem Deployment

#### 1. URL in Google Cloud eintragen

Falls noch nicht geschehen, füge die Production-URL zu Authorized JavaScript origins hinzu:

1. Gehe zu [Google Cloud Console](https://console.cloud.google.com)
2. Wähle dein Projekt
3. Gehe zu "APIs & Services" → "Credentials"
4. Klicke auf deine OAuth Client ID
5. Füge hinzu zu "Authorized JavaScript origins":
   ```
   https://veraatversus.github.io
   ```
6. Füge hinzu zu "Authorized redirect URIs":
   ```
   https://veraatversus.github.io/pokemon-tcg-data/frontend/try3/
   ```
7. Klicke auf "SPEICHERN"

#### 2. Testen

Öffne: https://veraatversus.github.io/pokemon-tcg-data/frontend/try3/

Teste alle Funktionen:
- [ ] Login funktioniert
- [ ] Sets laden
- [ ] Karten anzeigen
- [ ] Checkboxen speichern
- [ ] Mobile Ansicht

## Updates deployen

Für zukünftige Updates:

```bash
# Änderungen machen
git add frontend/try3/
git commit -m "fix: Update XYZ"
git push origin feature/try3-google-sheets-frontend

# Pull Request → Merge → Auto-Deploy
```

## Rollback

Falls etwas nicht funktioniert:

```bash
# Revert commit
git revert HEAD
git push origin main

# Warte auf Auto-Deploy
```

## Monitoring

### Logs prüfen

1. Browser Console öffnen (F12)
2. Prüfe auf Errors
3. Prüfe Network-Tab für API-Calls

### GitHub Actions

1. Gehe zu GitHub Repository
2. Klicke auf "Actions"
3. Prüfe den Status des Deployment-Workflows

## Support

Bei Problemen siehe:
- [GOOGLE_CLOUD_SETUP.md](./GOOGLE_CLOUD_SETUP.md)
- [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)
- GitHub Issues
