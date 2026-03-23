# legacy/card-filters.js

← [../../README.md](../../README.md)

---

## Zweck

Legacy-Filter- und Bewertungslogik für Karten (Rarity/Type/Value).

## Öffentliche API

- `detectCardRarity(card)`
- `detectCardType(card)`
- `getCardEstimatedValue(card, isHolographic)`
- `calculateCollectionValue(collectionData, cards)`
- `applyCardFilters(cards, filters)`
- `getCardsByRarity(cards, rarity)`
- `getCardsByType(cards, type)`
- `getRareCards(cards)`
- `getCollectionValueStats(collectionData, sets, cards)`
- `getAvailableRarities()`
- `getAvailableTypes()`

## Migrationsstatus

- Teilweise aktiv
- Ziel: Wertlogik nach `features/collection/value.js`

## Verwandte Seiten

- [../features/collection/index.md](../features/collection/index.md)
- [../ui/tools.md](../ui/tools.md)
