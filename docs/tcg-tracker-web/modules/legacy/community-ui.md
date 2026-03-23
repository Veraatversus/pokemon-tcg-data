# legacy/community-ui.js

← [../../README.md](../../README.md)

---

## Zweck

Legacy-UI-Renderer für Community-Ansichten und Karten.

## Öffentliche API

- `createUserProfileCard(userId, currentUserId)`
- `createSharedCollectionCard(share)`
- `createCommunityTrendingPanel()`
- `createReviewsPanel(shareId, currentUserId)`
- `createCommunitySearchPanel()`
- `createCommunityStatsBanner()`

## Migrationsstatus

- Kandidat für Quarantäne/Refactor
- Ziel: Konsolidierung in `ui/panels.js` und `features/community`

## Verwandte Seiten

- [community-features.md](community-features.md)
- [../ui/panels.md](../ui/panels.md)
