# legacy/social-features.js

← [../../README.md](../../README.md)

---

## Zweck

Legacy-Social-Funktionen (Wishlists, Trading-Log, CSV-Import/Export, Achievements, Ratings).

## Öffentliche API (Gruppiert)

- Wishlists: `loadWishlists`, `createWishlist`, `addToWishlist`, `removeFromWishlist`, `deleteWishlist`, `getWishlistsCount`
- Sharing: `generateShareableCollectionUrl`, `parseSharedCollection`
- Trading-Log: `addTradeLog`, `getTradingLog`, `getTradingStats`
- Backup-Schedule: `scheduleBackup`, `getBackupSchedule`, `updateBackupSchedule`
- Achievements: `ACHIEVEMENTS`, `unlockAchievement`, `getUnlockedAchievements`, `checkAchievementsProgress`
- CSV: `exportCollectionAsCSV`, `importCollectionFromCSV`
- Gestures/Ratings: `GestureController`, `rateSet`, `getSetRating`, `getAllRatings`

## Migrationsstatus

- Teilweise ungenutzt
- Ziel: Aufteilen in klare Feature-Module, Rest in `deprecated/`

## Verwandte Seiten

- [social-ui.md](social-ui.md)
- [trading-system.md](trading-system.md)
- [../../changelog/removed-code.md](../../changelog/removed-code.md)
