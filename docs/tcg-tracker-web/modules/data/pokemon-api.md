# data/pokemon-api.js

← [../../README.md](../../README.md) | [sheets-db.md](sheets-db.md) | [../core/config.md](../core/config.md)

---

## Zweck

Adapter für Karten-/Setdaten aus `api/v3` (vorberechnet, EN + `i18n.de`) und `api/registry` (Set-Aliase). Keine Laufzeit-Aufrufe an pokemontcg.io oder TCGdex.

## Öffentliche API

| Export | Beschreibung |
|---|---|
| `fetchMergedCards(setId, { signal })` | Display-Karten eines Sets (`setId` darf ein Alias sein) |
| `fetchMergedCardsWithSetMeta(setId, { signal })` | `{ cards, setMetaPatch }`; jede Karte trägt `collectionKey`, `cardId`, `number`, `i18n_de` |
| `fetchAllAvailableSets()` | Set-Liste für die Overview (ohne Alias-Sets, mit `aliases`) |
| `V3_UNREACHABLE_MESSAGE` | Fehlermeldung „Kartendaten (api/v3) nicht erreichbar“ (`err.code = 'V3_UNREACHABLE'`) |

## Abhängigkeiten

- `data/v3-api.js`, `data/v3-collection-keys.js`, `data/v3-records.js`
- `data/schema-contract.js` (Resolver-Matrix)

## Datenfluss

`api/v3` → `toSetRecord`/`toCardRecord` → `resolveDisplaySet`/`resolveDisplayCard`. Cardmarket-Links kommen aus den v3-Produkt-IDs. Ist `api/v3` nicht erreichbar, nutzen die Aufrufer `db_cards` als Fallback.

## Verwandte Seiten

- [sheets-db.md](sheets-db.md)
- [../../data-flow.md](../../data-flow.md)
- [../../architecture.md](../../architecture.md)
