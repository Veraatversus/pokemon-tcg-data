# core/utils.js

← [../../README.md](../../README.md) | [config.md](config.md) | [cache.md](cache.md)

---

## Zweck

Hilfsfunktionen für Normalisierung, Sortierung und A1-Konvertierung.

## Öffentliche API

| Export | Beschreibung |
|---|---|
| `normalizeCardNumber(cardNumber)` | Normalisiert Kartennummern für stabile Schlüssel |
| `naturalSort(arr, key)` | Natürliches Sortieren mit numerischer Semantik |
| `toBoolean(value)` | Robuste boolsche Konvertierung |
| `extractDisplayTextFromHyperlink(value)` | Liest Anzeige-Text aus Sheets-HYPERLINK |
| `colToA1(col)` | 1-basierte Spaltennummer → A1-Spalte |

## Abhängigkeiten

Keine.

## Aufrufkontext

Wird in `data/sheets-db.js`, `data/pokemon-api.js` und diversen UI-/Feature-Flows genutzt.

## Verwandte Seiten

- [../data/sheets-db.md](../data/sheets-db.md)
- [../data/pokemon-api.md](../data/pokemon-api.md)
- [../../data-flow.md](../../data-flow.md)
