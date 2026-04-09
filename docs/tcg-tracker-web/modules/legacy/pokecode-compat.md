# legacy/pokecode-compat.js

← [../../README.md](../../README.md)

---

## Zweck

Kompatibilitätslayer zwischen alter pokecode-basierten Datenlogik und neuer Adapter-Struktur.

## Öffentliche API

- `normalizeString(str)`
- `normalizeSetId(setId)`
- `buildSetIdAliasCandidates(setId, customMappings)`
- `findMatchingTcgdexSet(pokemontcgIoSet, allTcgdexSets, customMappings)`
- `resolveTcgdexImageUrl(tcgdexSetId, tcgdexCard)`
- `fetchAllPrimaryCardsForSet(...)`
- `loadCardsForSetCompat(...)`
- `combineSetsForOverviewCompat(...)`

## Migrationsstatus

- Übergangsmodul
- Langfristig Ziel: Entfernen nach Abschluss der API-Migration

## Verwandte Seiten

- [../data/pokemon-api.md](../data/pokemon-api.md)
- [../../changelog/removed-code.md](../../changelog/removed-code.md)
