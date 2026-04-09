# tcg-tracker-web – Pokémon TCG Collection Manager SPA

**Vollständige, produktionsreife Web-App** zum Verwalten deiner Pokémon-Kartensammlung in Google Sheets.

---

## 🚀 Quick Start

### 1. App Starten
```bash
cd frontend/tcg-tracker-web
npx serve . --listen 8080
# Browser: http://localhost:8080
```

### 2. Google Login
- **Button**: `"Anmelden"` in der Topbar
- **Zustimmung**: Google OAuth Fenster akzeptieren

### 3. Spreadsheet-ID eingeben
- Dialog erscheint automatisch
- Format: URL `https://docs.google.com/spreadsheets/d/ABC123/edit` oder nur `ABC123`
- **Speichern** → App lädt Sets

### 4. Set öffnen
- Dashboard: Set-Karte anklicken
- Oder: Set-Selector in der Sidebar + "Laden" Button

---

## 📱 Navigation

| Seite | URL | Beschreibung |
|---|---|---|
| **Dashboard** | `#dashboard` | Alle Sets, Serien-Filter, Sortierung |
| **Set-Detail** | `#set/sv08` | Kartengitter, Stats, Filter, Bulk-Edit |
| **Statistiken** | `#stats` | Gesamt-Progress, Serien-Breakdown |
| **Suche** | `#search` | Cross-Set Kartensuche |

---

## ⌨️ Tastaturkürzel

**In Set-Ansicht (wenn keine Checkbox fokussiert):**
- `↑↓←→` – Karten navigieren (Grid)
- `Space` / `Enter` – G-Checkbox markieren
- `i` – Lightbox öffnen
- `Esc` – Dialog/Lightbox schließen

**In Lightbox (Zoom):**
- `←` / `→` – Vorherige / nächste Karte
- `Space` – G-Checkbox
- `Esc` – Schließen

---

## 🎨 Features Details

### **Dashboard**
```
┌─ Alle Sets mit Serien-Gruppen ──┐
│ Pokémon TCG Live                 │
│ ├─ Scarlet & Violet              │
│ │  ├─ SV04 (80%) ████░            │
│ │  ├─ SV05 (45%) ██░░░            │
│ │  └─ SV06 (20%) █░░░░            │
│ ├─ Base Set                       │
│ │  └─ Base 1 (100%) █████         │
└─────────────────────────────────┘
```

### **Set-Ansicht**
```
┌─────────────────────┬────────────────────────┐
│ SIDEBAR             │ MAIN                   │
├─────────────────────┼────────────────────────┤
│ Set: SV04           │ [Filter][Sort][Export] │
│ Cards: 178          │ ┌──┐ ┌──┐ ┌──┐ ┌──┐  │
│ ████░░░░░ 72%      │ │  │ │  │ │  │ │  │  │
│                     │ └──┘ └──┘ └──┘ └──┘  │
│ Filter:             │ ┌──┐ ┌──┐ ┌──┐ ┌──┐  │
│ ◉ Alle              │ │  │ │  │ │  │ │  │  │
│ ○ Gesammelt         │ └──┘ └──┘ └──┘ └──┘  │
│ ○ Fehlend           │                        │
│                     │ [⇧ Prev][Lightbox]    │
│ Sortierung:         │ [Next ⇩]              │
│ • Nummer             │                        │
│ • Name              │                        │
│ • Status            │                        │
└─────────────────────┴────────────────────────┘
```

### **Lightbox Zoom**
```
┌─ Pokémon SV04/178 ────────────┐
│ [✕]                  [←] [→]  │
│                                 │
│         [CARD IMAGE]            │
│                                 │
│ Articuno ex            1/178    │
│ ☑ G    ☑ RH                    │
│                                 │
│ [🛒 Cardmarket]                │
└─────────────────────────────────┘
```

### **Bulk-Edit**
```
1. "☑ Mehrfach-Auswahl" klicken
2. Karten anklicken → auswählen
3. Toolbar unten:
   [3 ausgewählt] [✓ G] [✓ RH] [✗ Entfernen] [⊗ Abbruch]
```

### **CSV Export**
```
Fehlende Karten als UTF-8 mit BOM:
───────────────────────────────
Nummer,Name,Set
"001","Bulbasaur","SV04"
"002","Ivysaur","SV04"
...
```

---

## 🌙 Standard-Theme

- **Modus**: Einheitlicher Dark Mode (Standard)
- **Umschalter**: entfernt

---

## 📊 Statistiken-Seite

```
┌─ Gesamt-Übersicht ──────┐
│ 4,200 Karten            │
│ 2,100 Normal (50%)      │
│ 350    Reverse Holo     │
│ 87%    Gesamtfortschritt│
│ 12     Vollständige Sets│
│ 48     Importierte Sets │
└─────────────────────────┘

Serien-Breakdown:
Scarlet & Violet: 87% (3 Sets) ████████░
Sword & Shield:   65% (2 Sets) ██████░░░
...

Top 5 vollständigste Sets:
1. Base Set – 100%
2. SV04 – 98%
3. XY – 95%
...
```

---

## 🔍 Suche

**Beispiele:**
- `pikachu` → Alle Pikachu-Karten in allen Sets
- `001` → Alle Karten mit "001" in der Nummer
- Set-Filter: `sv04` → Nur in SV04 suchen

**Ergebnis:** Karten-Karten mit Set-Tag, Status (G/RH/Fehlend)

---

## 💾 Datenbank-Struktur (Google Sheets)

### **Sets Overview**
```
A: Set ID (z.B. "sv04")
B: Set Name (z.B. "Scarlet & Violet")
C: Series (z.B. "Scarlet & Violet")
D: Logo URL
E: Symbol URL
... weitere Meta
```

### **Collection Summary**
```
A: Set Name
B: Total Cards
C: Collected
D: Reverse Holos
E: Percent
F: PTCGO Code
G: Last Updated
```

### **{SetName} Sheet** (z.B. "SV04")
```
Grid: 5 Blocks × 3 Spalten × 4 Reihen = 60 Karten/Block
└─ Block 1 (Zeile 3-6):
   │ Karte 1 (A3) │ Karte 2 (D3) │ Karte 3 (G3) │
   │ G (A4) RH (B4) │ ... │ ...
   └─ Block 2 (Zeile 7-10): ...
```

---

## 🐛 Häufig Probleme

| Problem | Lösung |
|---|---|
| "Ungültige Spreadsheet-ID" | Format prüfen: lange URL oder `ABC123`-ID |
| "API-Fehler beim Laden" | Browser-Konsole prüfen (F12), Credentials prüfen |
| "Timeout" | Netzwerk / API-Rate-Limit, Seite aktualisieren |
| "Checkboxen nicht gespeichert" | Spreadsheet-Berechtigungen prüfen |
| Theme wirkt veraltet | Browser-Cache leeren (Ctrl+Shift+Del) |

---

## 🎯 Kommandos (Dev)

```bash
# Entwicklungs-Server
npx serve frontend/tcg-tracker-web --listen 8080

# Production Build (optional)
# (Derzeit: SPA lädt direkt von Quelle)

# Errors prüfen
# Browser: F12 → Console Tab

# Reset (localStorage löschen)
// Im Browser-Console:
localStorage.clear();
location.reload();
```

---

## ✅ Tested Auf

| Browser | Status |
|---|---|
| Chrome 120+ | ✅ |
| Firefox 121+ | ✅ |
| Safari 17+ | ✅ |
| Edge 120+ | ✅ |

| Gerät | Status |
|---|---|
| Desktop (1920×1080) | ✅ |
| Laptop (1366×768) | ✅ |
| Tablet (768×1024) | ✅ |
| Mobile (375×667) | ✅ |

---

## 📝 Commits

- `c3d53ee` – Full SPA (Dashboard, Lightbox, Stats, Search, Bulk-Edit, Keyboard Nav, CSV Export)
- `04e65c0` – Fix: doppelter Import
- `7027acf` – Polish: Error-Handling, Logging, Keyboard Nav Refinement

---

**Viel Spaß mit deiner Collection! 🎮✨**
