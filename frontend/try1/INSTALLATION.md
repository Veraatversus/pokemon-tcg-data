# 🎴 Pokémon TCG Tracker - Installation & Update auf v3.0.0

## 📋 Inhaltsverzeichnis
1. [Neue Features in v3.0.0](#neue-features)
2. [Installations-Schritte](#installation)
3. [Sidebar einrichten](#sidebar-einrichten)
4. [Erste Schritte](#erste-schritte)
5. [Troubleshooting](#troubleshooting)

---

## 🎉 Neue Features in v3.0.0

### ✨ Highlights
- **📤 CSV-Export**: Komplette Sammlung exportieren
- **💾 Backup-System**: Automatisches Backup vor Reset
- **📦 Batch-Import**: Mehrere Sets gleichzeitig importieren
- **⏱️ Fortschrittsanzeigen**: ETA für alle Operationen
- **📊 Erweiterte Statistiken**: Detaillierte Übersichten
- **🎨 Custom Sidebar**: Schnellzugriff mit Live-Stats
- **🔄 API Retry**: Robuste Fehlerbehandlung
- **⚡ TCGDex Caching**: 90% weniger API-Calls

---

## 🚀 Installation

### Schritt 1: Code aktualisieren

1. **Google Sheets öffnen**
   - Öffne deine Pokémon TCG Tracker Tabelle

2. **Apps Script Editor öffnen**
   - Menü: `Erweiterungen` → `Apps Script`

3. **Code ersetzen**
   - Lösche den kompletten Inhalt von `Code.gs`
   - Kopiere den kompletten Inhalt aus `pokecode.js`
   - Füge ihn in `Code.gs` ein
   - Klicke auf `Speichern` (💾)

### Schritt 2: Sidebar einrichten (Optional aber empfohlen)

#### 2.1 HTML-Datei erstellen

1. **Neue HTML-Datei anlegen**
   - Im Apps Script Editor: `Datei` → `Neu` → `HTML`
   - Eine neue Datei namens `Untitled.html` erscheint

2. **Datei umbenennen**
   - Rechtsklick auf `Untitled.html`
   - `Umbenennen` wählen
   - Neuer Name: **`sidebar`** (ohne .html)
   - Enter drücken

3. **HTML-Code einfügen**
   - Öffne die Datei `sidebar.html` (aus dem Download)
   - Kopiere den **kompletten Inhalt**
   - Füge ihn in die `sidebar` Datei im Apps Script Editor ein
   - Klicke auf `Speichern` (💾)

#### 2.2 Struktur prüfen

Nach dem Hinzufügen solltest du sehen:
```
📁 Projekt
  ├── 📄 Code.gs (pokecode.js)
  └── 🌐 sidebar.html
```

### Schritt 3: Berechtigungen erneuern

1. **Funktion ausführen**
   - Im Apps Script Editor oben: Funktion auswählen → `onOpen`
   - Klicke auf `Ausführen` (▶️)

2. **Berechtigungen erteilen**
   - Dialog erscheint: "Autorisierung erforderlich"
   - Klicke auf `Berechtigungen prüfen`
   - Wähle dein Google-Konto
   - Klicke auf `Erweitert`
   - Klicke auf `Zu [Projektname] wechseln (unsicher)`
   - Klicke auf `Zulassen`

3. **Zurück zur Tabelle**
   - Schließe den Apps Script Editor
   - Lade die Tabelle neu (F5)
   - Das Menü `Pokémon TCG Tracker` sollte erscheinen

---

## 🎨 Sidebar einrichten

### Sidebar öffnen

1. **Menü nutzen**
   - Klicke auf `Pokémon TCG Tracker` (in der Menüleiste)
   - Wähle `▶️ Sidebar öffnen`

2. **Sidebar erscheint**
   - Rechts im Fenster
   - Zeigt Live-Statistiken
   - Buttons für häufige Aktionen

### Sidebar-Features

- **📊 Live-Statistiken**
  - Gesamtkarten
  - Gesammelte Karten
  - RH Karten
  - Visueller Fortschrittsbalken
  - Anzahl Sets

- **⚡ Schnellzugriff**
  - 📥 Sets-Liste laden
  - ➕ Set hinzufügen
  - 📊 Statistik aktualisieren
  - 📤 CSV exportieren
  - 🗂️ Aktuelles Set sortieren

---

## 🏁 Erste Schritte

### 1. Setup durchführen (Falls neu)

```
Menü → 📥 Sets-Liste laden (Setup)
```

- Lädt alle verfügbaren Sets
- Erstellt Übersichtsblätter
- Installiert Trigger
- **Dauer**: ~5-10 Minuten

### 2. Einzelnes Set importieren

```
Menü → ➕ Einzelnes Set hinzufügen
```

- Eingabe: Set-ID (z.B. `base1`)
- Lädt alle Karten des Sets
- Erstellt Grid-Layout

### 3. Batch-Import (NEU!)

```
Menü → 📦 Mehrere Sets importieren (Batch)
```

- Eingabe: `base1, base2, base3`
- Importiert alle Sets nacheinander
- Zeigt ETA an

### 4. Sammlung exportieren (NEU!)

```
Menü → 📤 Sammlung exportieren (CSV)
```

- Erstellt CSV-Datei
- Upload zu Google Drive
- Download-Link im Dialog

### 5. Backup erstellen

```
Menü → ⚠️ Komplett-Reset (Alle Daten löschen)
```

- **Achtung**: Erstellt automatisch Backup!
- Backup wird vor Löschung angelegt
- Wiederherstellung über `💾 Backup wiederherstellen`

---

## 🔧 Troubleshooting

### Sidebar wird nicht angezeigt

**Problem**: Menü zeigt "▶️ Sidebar öffnen" aber nichts passiert

**Lösung**:
1. Prüfe ob `sidebar.html` Datei existiert
2. Name muss **exakt** `sidebar` sein (ohne .html)
3. Apps Script Editor → Speichern
4. Tabelle neu laden (F5)

### CSV-Export funktioniert nicht

**Problem**: Fehler beim Exportieren

**Lösung**:
1. Prüfe Google Drive Berechtigungen
2. Apps Script → Berechtigungen prüfen
3. "Google Drive API" muss aktiviert sein

### API-Fehler bei Import

**Problem**: "API Fehler 429" oder Timeout

**Lösung**:
- **NEU in v3.0.0**: Automatisches Retry!
- Wartet automatisch und versucht erneut (3x)
- Bei weiterem Fehler: 1 Minute warten

### TCGDex Sets werden nicht gefunden

**Problem**: Deutsche Karten fehlen

**Lösung**:
1. Cache leeren: `Menü → 📥 Sets-Liste laden`
2. Cache wird automatisch erneuert
3. **NEU**: 1-Stunden Cache reduziert Fehler

### Backup wiederherstellen

**Schritt-für-Schritt**:
1. `Menü → 💾 Backup wiederherstellen`
2. Liste der Backups erscheint
3. Zeitstempel eingeben (z.B. `20260201_143055`)
4. Backup wird wiederhergestellt

---

## 📊 Performance-Tipps

### Für große Sammlungen (100+ Sets)

1. **Batch-Import nutzen**
   - Schneller als einzelne Imports
   - Bessere Fortschrittsanzeige

2. **Cache nutzen**
   - Setup nur einmal täglich
   - TCGDex Cache: 1 Stunde gültig

3. **Sidebar für Schnellzugriff**
   - Keine Menü-Navigation nötig
   - Live-Statistiken ohne Aktualisierung

### API-Rate Limits vermeiden

- **Delay zwischen Imports**: 2-3 Sekunden (automatisch)
- **Retry-Logik**: Automatisch bei Fehlern
- **Cache nutzen**: TCGDex Sets werden gecached

---

## 📝 Konstanten anpassen (Optional)

### API-Konfiguration

```javascript
// In Code.gs (Zeile ~170)

// Cache-Dauer ändern (Standard: 1 Stunde)
const API_CACHE_DURATION_MS = 3600000; // in Millisekunden

// Retry-Versuche ändern (Standard: 3)
const API_MAX_RETRIES = 3;

// Delay zwischen API-Calls (Standard: 2000ms)
const API_DELAY_MS = 2000;
```

**Nach Änderungen**: Speichern und Tabelle neu laden!

---

## 🆘 Support

### Logs prüfen

1. Apps Script Editor öffnen
2. `Ansicht` → `Logs`
3. Suche nach Fehlern oder Warnungen

### Häufige Fehler

| Fehler | Ursache | Lösung |
|--------|---------|--------|
| "isScriptEditing is not defined" | Alte Version | Code komplett ersetzen |
| "sidebar.html not found" | Datei fehlt | Sidebar-HTML hinzufügen |
| "API Fehler 429" | Rate Limit | Wartet automatisch, Retry aktiv |
| "Property value too large" | Zu viele Daten | Backup erstellen, alte Daten löschen |

---

## ✅ Checkliste nach Installation

- [ ] Code in `Code.gs` eingefügt
- [ ] `sidebar.html` erstellt und Code eingefügt
- [ ] Berechtigungen erteilt (`onOpen` ausgeführt)
- [ ] Tabelle neu geladen
- [ ] Menü `Pokémon TCG Tracker` erscheint
- [ ] Sidebar öffnet sich
- [ ] Statistiken werden angezeigt
- [ ] CSV-Export getestet (optional)
- [ ] Backup-System getestet (optional)

---

## 🎉 Viel Erfolg!

Bei Problemen:
1. Logs prüfen (Apps Script → Ansicht → Logs)
2. Berechtigungen prüfen
3. Tabelle neu laden

**Happy Collecting! 🎴**
