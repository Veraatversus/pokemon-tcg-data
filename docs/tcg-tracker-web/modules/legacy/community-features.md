# legacy/community-features.js

← [../../README.md](../../README.md)

---

## Zweck

Community-Datenmodell (Profile, Shares, Reviews, Follower, Trends, Suche).

## Öffentliche API (Gruppiert)

- Profile: `createUserProfile`, `getUserProfile`, `getUserProfiles`, `updateUserProfile`, `generateDefaultAvatar`
- Shares: `createPublicShare`, `getSharedCollection`, `getSharedCollections`, `updateShare`, `deleteShare`, `generateShareUrl`, `getUsersSharedCollections`
- Social Graph: `followUser`, `unfollowUser`, `isFollowing`, `getFollowers`, `getFollowing`
- Reviews: `addReview`, `getReviewsForShare`, `getAverageRating`
- Discovery: `getTrendingCollections`, `getFeaturedCollections`, `likeShare`, `searchPublicCollections`, `getCollectionsByUser`
- Utility: `checkCollectionBadges`, `getCommunityStats`, `exportCommunityData`

## Migrationsstatus

- Aktiv in Teilen
- Ziel: Aufteilung nach `features/community/*`

## Verwandte Seiten

- [../features/community/index.md](../features/community/index.md)
- [community-ui.md](community-ui.md)
