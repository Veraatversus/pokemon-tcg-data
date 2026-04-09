# data/pokemon-api.js

← [../../README.md](../../README.md) | [sheets-db.md](sheets-db.md) | [../core/config.md](../core/config.md)

---

## Zweck

API-Adapter für Pokémon-Karten-/Set-Daten inkl. Vera-API, PokemonTCG-Fallback und TCGDex-Merge.

## Öffentliche API

| Export | Beschreibung |
|---|---|
| `fetchMergedCards(setId, { signal })` | Lädt/merged Karten für ein Set |
| `fetchAllAvailableSets()` | Liefert vollständige Set-Liste für Overview |
| `runPokecodeParityCheck({ setIds, maxSets })` | Konsistenzcheck Adapter vs Compat |

## Abhängigkeiten

- `core/config.js`
- `core/utils.js`
- `pokecode-compat.js` (Legacy-Kompatibilitätslayer)

## Datenfluss

Primärquelle ist Vera-API (`USE_VERA_API=true`), fallback auf PokemonTCG. Zusätzliche TCGDex-Daten werden für DE-Namen/Bilder gemerged.

## Verwandte Seiten

- [sheets-db.md](sheets-db.md)
- [../../data-flow.md](../../data-flow.md)
- [../../architecture.md](../../architecture.md)
