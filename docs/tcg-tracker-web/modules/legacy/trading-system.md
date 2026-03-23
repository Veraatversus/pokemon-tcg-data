# legacy/trading-system.js

← [../../README.md](../../README.md)

---

## Zweck

Legacy-Handelslogik für Wanted-Cards, Trade-Offers, Matches und Trade-History.

## Öffentliche API (Kurz)

- Konstante: `TRADE_STATUS`
- Wanted: `addWantedCard`, `removeWantedCard`, `getWantedCards`, `isCardWanted`, `getWantedCardsByPriority`
- Offers: `createTradeOffer`, `getTradeOffers`, `updateTradeOffer`, `acceptTradeOffer`, `deleteTradeOffer`
- Matching/History: `findMatchingTrades`, `recordTradeCompletion`, `getTradeHistory`, `getUserTradeStats`, `generateTradeSuggestions`, `getTradePlaceSummary`

## Migrationsstatus

- Kandidat für Quarantäne bzw. dediziertes Trading-Feature

## Verwandte Seiten

- [trading-ui.md](trading-ui.md)
- [../../changelog/removed-code.md](../../changelog/removed-code.md)
