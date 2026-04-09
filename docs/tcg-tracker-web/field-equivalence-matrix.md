# Field Equivalence Matrix (Vera vs TCGDex)

Diese Matrix definiert die aktuelle Grundlage fuer den Dual-Source-Resolver.

## Ziel
- Beide Quellen bleiben roh getrennt gespeichert.
- Die Anzeige wird pro Feld ueber eine Resolver-Reihenfolge gesteuert.
- Die Matrix ist die Grundlage fuer den optionalen Expert-Modus in den App-Settings.

## Set-Felder

| Feld | Vera | TCGDex | Klasse | Hinweis |
|---|---|---|---|---|
| `setId` | `id` | `id` | semantisch aequivalent | Bei TCGDex-only ggf. praefixiert als `TCGDEX-<id>` |
| `setName` | `name` | `name`/`en.name` | semantisch aequivalent | TCGDex priorisiert fuer DE-freundliche Anzeige |
| `series` | `series` | `serie.name` | semantisch aequivalent | Unterschiedliche Feldnamen |
| `releaseDate` | `releaseDate` | `releaseDate` | identisch | - |
| `totalCards` | `total`/`printedTotal` | `cardCount.official` | semantisch aequivalent | Quelle je nach Resolver |
| `ptcgoCode` | `ptcgoCode` | `abbreviation.official` | semantisch aequivalent | Vera oft stabiler |
| `logoUrl` | `images.logo` | `logo` | semantisch aequivalent | Vera priorisiert fuer Konsistenz |
| `symbolUrl` | `images.symbol` | `symbol` | semantisch aequivalent | Vera priorisiert fuer Konsistenz |
| `legalities` | `legalities` | `legal` | semantisch aequivalent | Struktur unterscheidet sich leicht |

## Card-Felder

| Feld | Vera | TCGDex | Klasse | Hinweis |
|---|---|---|---|---|
| `cardId` | `id` | `id` | semantisch aequivalent | Bei TCGDex-only kann Local-ID abweichen |
| `number` | `number` | `localId` | semantisch aequivalent | Nummernformat normalisieren |
| `name` | `name` | `name` | identisch | TCGDex priorisiert fuer DE |
| `image` | `images.small` | `image` | semantisch aequivalent | TCGDex priorisiert fuer HD/aktuelle Assets |
| `cardmarketUrl` | `cardmarket.url` | `links.cardmarket` | semantisch aequivalent | Fallback auf Such-URL |
| `rarity` | `rarity` | `rarity` | identisch | Vera derzeit priorisiert |
| `hp` | `hp` | `hp` | identisch | Vera derzeit priorisiert |
| `types` | `types` | `types` | identisch | Vera derzeit priorisiert |
| `supertype` | `supertype` | `category` | semantisch aequivalent | Unterschiedliche Taxonomie |
| `subtypes` | `subtypes` | `stage`/`suffix` | semantisch aequivalent | Vera meist detaillierter |
| `evolvesFrom` | `evolvesFrom` | (teilweise indirekt) | nur Vera/teilweise | TCGDex nicht durchgaengig |
| `artist` | `artist` | `illustrator` | semantisch aequivalent | Vera derzeit priorisiert |
| `regulationMark` | `regulationMark` | `regulationMark` | identisch | - |
| `rules` | `rules` | `effect`/`description` | semantisch aequivalent | Vera priorisiert, TCGDex als Fallback |
| `flavorText` | `flavorText` | `description` | semantisch aequivalent | Vera priorisiert |

## Source-only Felder

### Vera-only (haeufig)
- `abilities`, `attacks`, `weaknesses`, `resistances`, `retreatCost`, `convertedRetreatCost`
- `nationalPokedexNumbers`

### TCGDex-only (haeufig)
- `variants`, `trainerType`, `energyType`, `item`, `suffix`, `stage`
- Set-Ebene: detaillierte `cardCount.*`

## Resolver-Default (MVP)
- Set: `setName/series/releaseDate/totalCards => tcgdex > vera > legacy`
- Set: `ptcgoCode/logo/symbol/legalities => vera > tcgdex > legacy`
- Card: `name/image/cardmarketUrl => tcgdex > vera > legacy`
- Card: `rarity/hp/types/supertype/subtypes/artist/rules/flavorText => vera > tcgdex > legacy`
- Card: `number => legacy > vera > tcgdex`

## Validierungsfaelle
- Namenskonflikte wie `cel25` vs `cel25c` immer ueber `setId` aufloesen.
- API-only Karten muessen in Lightbox und Importfluss stabil bleiben.
- Delete/Reimport darf keine Resolver-Inkonsistenz erzeugen.
