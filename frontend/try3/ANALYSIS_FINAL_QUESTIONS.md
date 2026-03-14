# 🔍 Sheets-Struktur Analyse - FINAL

**Basierend auf**: Code-Analyse von Try3 + deinen Sheets-Screenshots  
**Date**: 03.02.2026

---

## ✅ Was ich herausgefunden habe

### **Spreadsheet-ID (aus config.js):**
```
1RepZ5n-45tou-9vu20l8ffErT4TfBaLDdyY8BwxQDsI
```
✅ Die ID ist konfiguriert und gültig.

---

## 📊 **AKTUELLE STRUKTUR (aus Code)**

### **Sheet 1: "Sets Overview"**

**Range**: `A3:Z1000`  
**Daten ab**: Row 3 (Row 1-2 sind Header)

**Current Code Mappings:**
```javascript
row[0] = Set ID          (z.B. "me2pio", "me2", "m1")
row[1] = Set Name        (z.B. "Eifbaiene Heiden")
row[2] = Series          // ← PROBLEM: Das sollte eigentlich nicht Series sein!
row[3] = Total Cards     (Integer)
row[4] = Release Date    (Date)
```

**Aus deinen Screenshots sichtbar:**
```
A: Set ID
B: Set Name
C: Set Logo (IMAGE-Formula!)
D: Set Symbol (?)
E: Serie
F: Erscheinungsdatum
G: Gesamtzahl Karten
H: Kai Abkürzung
I: Off Importiert
J: Neu importieren
```

**FRAGE 1**: Sind die echten Spalten `A-J` oder weiter? Und in dieser exakten Reihenfolge?

---

### **Sheet 2+: Einzelne Set-Sheets** 

**Beispiel aus Screenshot**: "SVP Black Star Promos"

**Current Code Mappings:**
```javascript
// Parse von Grid-Layout:
BLOCK_HEIGHT = 4  // Rows pro Karte
BLOCK_WIDTH = 3   // Cols pro Karte
CARDS_PER_ROW = 5 // 5 Karten pro Reihe

// Für jede Karte:
Row 0: Karten-Nummer (Col 0), Name (Col 1), ? (Col 2)
Row 1: Bild-URL (Col 0-2, probably IMAGE formula)
Row 2: Checkbox Normal (Col 0), Checkbox RH (Col 1), ? (Col 2)
Row 3: ? (Row für nächste Karte)
```

**Aus deinen Screenshots:**
```
Row 1: "Gesamtzahl Karten: 165 | Gesammelte Karten: 0 | Abschluss-Prozentsatz: 0%"
Row 2: (?)
Row 3: Nummer | Name | Bild | ? | Checkbox "CM" | (weitere Cols)
Row 4: Nummer | Name | Bild | ? | Checkbox | ?
...
```

**FRAGE 2**: 
- Startet die Karten-Daten in Row 3 oder Row 4?
- Sind die Checkboxes in Spalten E (Normal) und F (Reverse Holo)?
- Gibt es eine "CM" (Clear Marker?) Spalte auch?

---

## 🖼️ **IMAGE-Formula Parsing**

**Aus deinem Screenshot erkannt:**
```
=IMAGE("https://assets.tcgdex.net/sv/svp/005/low.jpg"; 1)
```

**Code-Status:**
- ✅ URL liegt in angeführten Anführungszeichen
- ❓ Aber Code extrahiert derzeit nicht die URL!

**Aktuell:**
```javascript
const imageUrl = data[imageRow][baseCol];  // Das ist die IMAGE-Formula, nicht die URL!
```

**Sollte sein:**
```javascript
const imageUrl = extractImageURL(data[imageRow][baseCol]);

function extractImageURL(formulaOrValue) {
  if (!formulaOrValue) return null;
  if (typeof formulaOrValue !== 'string') return null;
  
  // Wenn es eine IMAGE-Formula ist: =IMAGE("URL"; 1)
  const match = formulaOrValue.match(/IMAGE\("([^"]+)"/);
  if (match) return match[1];
  
  // Wenn es bereits eine URL ist
  if (formulaOrValue.startsWith('http')) return formulaOrValue;
  
  return null;
}
```

**FRAGE 3**: Liegen die Bilder in den Sheets als `=IMAGE("URL"; 1)` oder als direkte URLs vor?

---

## ☑️ **Checkbox-Status**

**Code-Status:**
```javascript
const normalChecked = data[checkboxRow][baseCol] === 'TRUE' || data[checkboxRow][baseCol] === true;
const reverseHoloChecked = data[checkboxRow][baseCol + 1] === 'TRUE' || data[checkboxRow][baseCol + 1] === true;
```

**Das bedeutet:**
- Code erwartet: `TRUE` (String) oder `true` (Boolean)
- Code ignoriert: `"✓"`, `"☑"`, oder andere Formate

**Aus deinem Screenshot:**
- Ich sehe "CM" als Checkbox-Label
- Aber kann nicht sehen, wie die Checkboxes selbst dargestellt sind

**FRAGE 4**: 
- Checkboxes: TRUE/FALSE oder ☑/☐ oder leer/✓?
- Spalte Mapping: Welche ist "Normal collected"? Welche ist "Reverse Holo"?
- Gibt es eine "CM" (Clear Marker) als dritte Checkbox-Art?

---

## 📍 **Spalten-Mapping: EXAKTE FRAGEN**

### **Sets Overview Sheet:**

**FRAGE 5 - Sets Sheet Spalten:**

Welche Spalte ist was?
```
A = ? 
B = ?
C = ?
D = ?
E = ?
F = ?
G = ?
H = ?
I = ?
J = ?
```

Oder einfacher - kannst du mir die Header-Reihe kopieren?

---

### **Individual Set Sheets (z.B. SVP):**

**FRAGE 6 - Set Sheet Spalten:**

```
Col A = ?  (Ist es Nummer oder Name?)
Col B = ?
Col C = ?
Col D = ?
Col E = ?  (Ist das der Normal-Checkbox?)
Col F = ?  (Ist das der RH-Checkbox?)
...
```

Oder: Wie ist die Header-Reihe?

---

### **FRAGE 7 - Karten-Grid Struktur:**

```
Wie ist eine einzelne Karte angeordnet?

Option A (Aktuell im Code):
┌─────────┬─────────┬─────────┐
│ Nummer  │  Name   │  ???    │  Row 1
├─────────┼─────────┼─────────┤
│      Bild-URL (IMAGE-Formula)  │  Row 2
├─────────┼─────────┼─────────┤
│ Normal  │   RH    │  ???    │  Row 3
└─────────┴─────────┴─────────┘

Option B (Alternativ - Horizontal):
│ Nummer │ Name │ Bild │ Normal ☑ │ RH ☑ │ CM ☑ │ ...

Option C (Alternativ - Was auch immer):
?
```

**FRAGE 8**: Wie sieht die physische Anordnung aus?

---

## 🔢 **Zusammenfassung der FEHLENDEN INFOS**

Ich brauche Antwort auf **8 Fragen**:

1. **Sets Overview - Spalten-Order:** A-J sind `[ID, Name, Logo, Symbol, Serie, Datum, Total, Code, Imp, NeuImp]`? (Bestätigung)

2. **Set Sheets - Start-Row:** Karten-Daten ab Row 3 oder Row 4?

3. **Checkboxes - Spalten:** E=Normal, F=ReverseHolo? Gibt es CM?

4. **Checkbox-Format:** TRUE/FALSE oder ☑/☐ oder leer/✓?

5. **Sets Übersicht Header:** Exakte Spalten-Namen (Header-Reihe kopieren)

6. **Set Sheets Header:** Exakte Spalten-Namen (Header-Reihe kopieren)

7. **Karten-Grid Layout:** Wie ist eine Karte räumlich angeordnet? (Bild: Horizontal oder Vertikal?)

8. **IMAGE-URLs:** Stehen in den Sheets als `=IMAGE("URL"; 1)` oder als reine URLs?

---

## 🎯 **SCHNELLE ANTWORT**

Falls du nur die **kritischsten 3** beantworten möchtest:

1. **Sets Overview Spalten exakt:** Header kopieren (oder "A=ID, B=Name, C=Logo, D=Symbol, E=Serie..." etc.)

2. **Set Sheets Spalten exakt:** Header kopieren

3. **Karten-Grid:** Wie sieht eine Karte räumlich aus? (Screenshot oder Beschreibung)

---

## ✅ **Was dann passiert:**

**Sobald ich diese Infos habe**, kann ich in **30-60 Minuten**:
- ✅ sheets-api.js updaten (URL-Extraktion, Checkbox-Parsing)
- ✅ app.js fixieren (korrekte Spalten-Mappings)
- ✅ ui.js updaten (Bilder anzeigen)

**Dann Phase A + B zusammen deployen → Live! 🚀**

---

**Status:** 🔍 Warte auf deine Antworten  
**Timeline:** Nach Antwort: 2-3 Stunden bis Production Live

Welche Infos kannst du mir geben? 🎯
