# 🚀 Deployment Guide

## Übersicht

Das Frontend wird auf GitHub Pages deployed. Der Deployment-Prozess ist vollständig automatisiert durch GitHub Workflows.

## Branches & Workflow

```
feature/try3-google-sheets-frontend (Development)
           ↓ (Pull Request)
           main (Release Branch)
           ↓ (Auto-Merge)
           release (Deployment Branch)
           ↓ (Auto-Deploy)
        GitHub Pages
  https://veraatversus.github.io/pokemon-tcg-data/frontend/try3/
```

## Lokales Testing

### 1. Lokalen Server starten

```bash
cd frontend/try3/
python3 -m http.server 8000
```

### 2. Browser öffnen

Öffne: http://localhost:8000

### 3. Testen

- [ ] Login funktioniert
- [ ] Sets werden geladen
- [ ] Karten werden angezeigt
- [ ] Checkboxen funktionieren
- [ ] Änderungen werden in Google Sheets gespeichert
- [ ] Responsive Design auf verschiedenen Größen
- [ ] Alle Features funktionieren (siehe [TESTING.md](../TESTING.md))

## Pre-Deployment Checklist

Bevor du einen Pull Request erstellst:

### ✅ Code Quality

- [ ] Alle Tests bestanden (siehe [TESTING.md](../TESTING.md))
- [ ] Keine JavaScript Errors in Console
- [ ] Code folgt Konventionen
- [ ] Keine Secrets/Credentials im Code

### ✅ Funktionalität

- [ ] Authentication funktioniert
- [ ] Sets & Karten laden
- [ ] Checkboxes funktionieren
- [ ] Export funktioniert
- [ ] Analytics funktioniert
- [ ] Responsive Design OK

### ✅ Configuration

- [ ] `config/config.js` hat nur Demo-Werte
- [ ] CLIENT_ID und SPREADSHEET_ID nicht committed
- [ ] URLs sind relativ

## Deployment auf GitHub Pages

### Voraussetzungen

- [ ] Google Cloud Setup abgeschlossen
- [ ] Client-ID in `config/config.js` eingetragen
- [ ] Spreadsheet-ID in `config/config.js` eingetragen
- [ ] Lokales Testing erfolgreich
- [ ] Pre-Deployment Checklist abgehakt

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

1. Gehe zu GitHub: https://github.com/veraatversus/poke-tcg
2. Klicke auf "Pull requests" → "New pull request"
3. Base: `main` ← Compare: `feature/try3-google-sheets-frontend`
4. Klicke auf "Create pull request"

**PR-Vorlage:**
```markdown
## Description
Vollständiges Try3 Frontend mit Google Sheets API Integration

## Features
- ✅ OAuth 2.0 Authentication
- ✅ Set & Card Management  
- ✅ Search, Filter & Sort
- ✅ Analytics Dashboard
- ✅ Export Funktionen
- ✅ Responsive Design
- ✅ Robuste Fehlerbehandlung

## Testing
- ✅ Lokales Testing durchgeführt
- ✅ Alle Browser getestet
- ✅ Mobile Responsive OK

## Checklist
- [x] Code Quality
- [x] Tests bestanden
- [x] Dokumentation aktualisiert
- [x] Keine Secrets committed
```

#### 4. Auto-Merge & Deployment

Nach dem Merge zu `main`:

1. **Auto-Merge zu `release`**
   - Workflow `merge-to-release.yml` wird ausgelöst
   - ~ 1-2 Minuten

2. **GitHub Pages Deployment**
   - Workflow `deploy-pages.yml` wird ausgelöst
   - ~ 2-3 Minuten

#### 5. Verifikation

Öffne: https://veraatversus.github.io/pokemon-tcg-data/frontend/try3/

Teste:
- [ ] Login funktioniert
- [ ] Sets laden
- [ ] Karten anzeigen
- [ ] Checkboxen speichern
- [ ] Mobile Ansicht funktioniert

### Nach erfolgreichem Deployment

#### 1. Production URLs aktualisieren

Falls noch nicht geschehen, füge Production-URL in Google Cloud hinzu:

1. Gehe zu [Google Cloud Console](https://console.cloud.google.com)
2. Wähle dein Projekt → "APIs & Services" → "Credentials"
3. Klicke auf deine OAuth Client ID
4. Authorized JavaScript origins - hinzufügen:
   ```
   https://veraatversus.github.io
   ```
5. Authorized redirect URIs - hinzufügen:
   ```
   https://veraatversus.github.io/pokemon-tcg-data/frontend/try3/
   ```
6. Speichern

#### 2. Cleanup

```bash
# Nach erfolgreichem Merge kann der Feature-Branch gelöscht werden
git push origin --delete feature/try3-google-sheets-frontend

# Lokal auch löschen
git branch -D feature/try3-google-sheets-frontend
```

## Fehlerbehandlung

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
