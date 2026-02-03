# 📊 Sheets-Struktur Analyse für Try3 Integration

**Date**: 03.02.2026  
**Status**: Analysiert & Ready für Integration

---

## 📋 Aktuelle Sheets-Struktur (aus Original)

### **Sheet 1: "Pokémon TCG Sets Übersicht"**

**Funktion**: Master-Übersicht aller Sets

**Spalten** (aus Attachment sichtbar):
```
A: Set ID          (z.B. "me2pio", "me2", "m1")
B: Set Name        (z.B. "Eifbaiene Heiden", "Fatale Flammen")
C: Set Log         (Set-Logo als IMAGE-Formula)
D: Set Syn          (? - zu überprüfen)
E: Serie            (z.B. "Mega-Entwicklung", "Scarlet & Violet")
F: Erscheinungsdatum (z.B. "2026-01-30")
G: Gesamtzahl Karten (z.B. 217, 132)
H: Kai Abkürzung   (z.B. "ASC", "MEG", "PFL")
I: Off Importiert   (Checkbox TRUE/FALSE)
J: Neu importieren (Checkbox)
```

**Datentypen**:
- TEXT: Set ID, Name, Serie
- NUMBERS: Gesamtzahl, Kai Abkürzung
- DATE: Erscheinungsdatum
- IMAGE: Set-Logo (C Spalte)
- CHECKBOX: Importiert Status

---

### **Sheet 2+: Einzelne Set-Sheets**

**Beispiel**: "SVP Black Star Promos" (aus Attachment)

**Struktur**:
```
Header (Row 1):
"Gesamtzahl Karten: 165 | Gesammelte Karten: 0 | Gesammelte RH Karten: 0 | 
Abschluss-Prozentsatz: 0% | Abkürzung: ..."

Karten-Daten (ab Row 3):
Spalte A: Nummer          (1, 2, 3, 4, 5 ... oder "6", "7" etc.)
Spalte B: Name            (z.B. "Felori", "Krokel", "Kwaks")
Spalte C-D: Bild          (IMAGE-Formula: =IMAGE("https://assets.tcgdex.net/sv/svp/005/low.jpg"; 1))
Spalte E: Checkbox (CM)   (Empty oder Checked ☑)
Spalte F: Checkbox Info   (?)
...
```

**Checkbox-Spalten**:
- Eine Spalte pro Checkbox-Zustand
- Verwendet vermutlich TRUE/FALSE oder ☑/☐

---

## 🎯 Daten-Mappings für Try3

### **Was Try3 derzeit liest:**

```javascript
// Sets Overview (A3:Z1000)
row[0] = Set ID
row[1] = Set Name
row[2] = Series        // ABER: row[2] sollte Set Log sein!
row[3] = Total Cards
row[4] = Release Date
row[5] = ?
```

**ISSUE GEFUNDEN**: Die Spalten-Mappings stimmen nicht!

---

## ⚠️ **Korrekte Spalten-Mappings**

### **Sets Overview Sheet (Pokémon TCG Sets Übersicht)**

```javascript
// Row 3 = Header
// Data starts Row 4

columns = {
  A: 'Set ID',              // row[0]
  B: 'Set Name',            // row[1]
  C: 'Set Logo URL',        // row[2] - Extract from IMAGE formula
  D: 'Set Symbol',          // row[3]
  E: 'Series',              // row[4]
  F: 'Release Date',        // row[5]
  G: 'Total Cards',         // row[6]
  H: 'Kai Code',            // row[7]
  I: 'Already Imported',    // row[8]
  J: 'Needs Import',        // row[9]
}
```

### **Set Sheets (z.B. SVP Black Star Promos)**

```javascript
// Row 1 = Stats Header
// Row 2 = Column Names (?)
// Row 3+ = Card Data

columns = {
  A: 'Card Number',         // row[0]
  B: 'Card Name',           // row[1]
  C-D: 'Card Image URL',    // row[2] - Extract from IMAGE formula
  E: 'Collected Checkbox',  // row[3]
  F: 'CM Checkbox',         // row[4]
  G+: 'Other Checkboxes',   // row[5+]
}
```

---

## 🔧 **IMAGE-Formula Parsing**

### **Format in Sheets:**
```
=IMAGE("https://assets.tcgdex.net/sv/svp/001/low.jpg"; 1)
=IMAGE("https://assets.tcgdex.net/sv/svp/005/low.jpg"; 1)
```

### **Was wir extrahieren müssen:**
```javascript
// FROM: =IMAGE("https://assets.tcgdex.net/sv/svp/001/low.jpg"; 1)
// TO:   https://assets.tcgdex.net/sv/svp/001/low.jpg

function extractImageURL(formulaOrValue) {
  if (!formulaOrValue) return null;
  
  // Check if it's an IMAGE formula
  if (formulaOrValue.includes('IMAGE')) {
    // Extract URL from =IMAGE("URL"; 1)
    const match = formulaOrValue.match(/IMAGE\("([^"]+)"/);
    return match ? match[1] : null;
  }
  
  // Check if it's already a direct URL
  if (formulaOrValue.startsWith('http')) {
    return formulaOrValue;
  }
  
  return null;
}
```

---

## 📊 **Checkbox-Status Handling**

### **Mögliche Checkbox-Formate:**

**Option 1: Text-based**
```
"" = Unchecked
"✓" / "☑" = Checked
```

**Option 2: Boolean**
```
TRUE = Checked
FALSE = Unchecked
```

**Option 3: Empty vs Value**
```
(empty) = Unchecked
Any value = Checked
```

### **Erkennung in Try3:**
```javascript
function isCheckboxChecked(value) {
  if (!value) return false;
  if (value === true) return true;
  if (value === 'TRUE' || value === 'true') return true;
  if (value === '✓' || value === '☑') return true;
  return value.toString().trim() !== '';
}
```

---

## 🔄 **Datenfluss für Phase B**

```
Sheets (Original Data)
  ├─ Set Overview Sheet
  │  └─ Sets mit Logo-URLs
  │     └─ Lesen via readSheet() 
  │        └─ Extract IMAGE URLs
  │           └ Display in UI
  │
  └─ Individual Set Sheets
     ├─ Card Data mit Bild-URLs
     │  └─ Lesen via readSheet()
     │     └─ Extract IMAGE URLs
     │        └─ Display in Card Grid
     │
     └─ Checkboxes
        └─ Lesen/Schreiben via readSheet() + writeSheet()
           └─ Sync mit Sheets
```

---

## 📝 **Implementation TODOs für Try3**

### **Schritt 1: Sheets-API erweitern** (30 min)
```javascript
// sheets-api.js
export function extractImageURL(value) { }
export function isCheckboxChecked(value) { }
export async function readSheetWithImages(range) { }
```

### **Schritt 2: App.js Daten-Parsing updaten** (30 min)
```javascript
// app.js loadSets()
// Correct column mappings
// Extract logo URLs
// Create Set objects with images

// app.js loadSetCards()
// Correct column mappings
// Extract card image URLs
// Parse checkbox statuses
```

### **Schritt 3: Card-Rendering mit Bildern** (1 hour)
```javascript
// ui.js renderCards()
// Display card images
// Show card details on hover
// Update checkbox display
```

### **Schritt 4: Modal für Karten-Details** (1 hour)
```javascript
// modals.js showCardDetailsModal()
// Display full card info
// Show collected status
// Option to update checkbox
```

---

## 🔍 **Daten-Validierung**

### **Was wir überprüfen müssen:**

1. **Sets Overview Sheet**
   - [ ] Spalten-Reihenfolge korrekt?
   - [ ] Alle Sets haben Set IDs?
   - [ ] Logo URLs extrahierbar?
   - [ ] Gesamtzahl Karten korrekt?

2. **Individual Set Sheets**
   - [ ] Spalten-Reihenfolge konsistent?
   - [ ] Alle Karten haben Nummern?
   - [ ] Bild-URLs extrahierbar?
   - [ ] Checkboxes korrekt?

3. **Datentypen**
   - [ ] Zahlen sind Numbers (nicht Strings)?
   - [ ] Daten sind valides Datum?
   - [ ] URLs sind gültig?

---

## 📌 **Offene Fragen**

1. **Sets Overview Sheet**
   - Welche Spalte exakt ist "Serie"?
   - Was ist "Set Syn" (Spalte D)?
   - Reihenfolge A-J oder A-Z?

2. **Set Sheets**
   - Sind alle Sets im gleichen Format?
   - Unterschiedliche Checkbox-Spalten pro Set?
   - Header immer in Row 3?

3. **Checkbox-Status**
   - Welche Spalte = "Collected"?
   - Welche Spalte = "Reverse Holo"?
   - Weitere Status vorhanden?

4. **Image-URLs**
   - Alle URLs funktional?
   - Fallback wenn URL fehlschlägt?
   - Hochauflösungs-Versionen verfügbar?

---

## ✅ **Nächste Schritte**

### **Schritt 1: Bestätigung (5 min)**
- User bestätigt Sheets-Struktur
- Antwortet auf offene Fragen

### **Schritt 2: Anpassung (1-2 Stunden)**
- Update sheets-api.js mit Helpers
- Fix app.js Spalten-Mappings
- Update ui.js für Bilder

### **Schritt 3: Testing (1-2 Stunden)**
- Lokales Testing mit echten Daten
- Verify Bilder werden angezeigt
- Check Checkboxes funktionieren

### **Schritt 4: Deployment**
- Phase A + B zusammen deployen
- Live auf GitHub Pages!

---

## 🎯 **Was ich jetzt brauche:**

1. **Sheets-Struktur bestätigen**
   - Sind die Spalten-Mappings korrekt?
   - Unterschiedliche Sets im gleichen Format?

2. **Beispiel-Daten sehen**
   - IMAGE-Formula exact Format
   - Checkbox exact Format
   - Checkbox-Spalten exakt identifizieren

3. **Spreadsheet-ID** (falls anders als in config)
   - Zur Verifikation der echten Daten

---

**Status**: 🔍 **Analyse Complete**  
**Nächst**: Bestätigung + Anpassung  
**Timeline**: 2-3 Stunden bis Phase A+B Live

Sollen wir starten? 🚀
