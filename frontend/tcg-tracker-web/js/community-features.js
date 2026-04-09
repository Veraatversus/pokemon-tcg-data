// ══════════════════════════════════════════════════════════════════════════
// COMMUNITY & PUBLIC SHARING FEATURES
// ══════════════════════════════════════════════════════════════════════════

import { scopedStorageKey } from './config.js';

const STORAGE_KEYS = {
  shared_collections: scopedStorageKey('shared-collections'),
  user_profiles: scopedStorageKey('user-profiles'),
  community_follows: scopedStorageKey('community-follows'),
  community_reviews: scopedStorageKey('community-reviews'),
  trending_cache: scopedStorageKey('trending-cache')
};

// ══════════════════════════════════════════════════════════════════════════
// USER PROFILE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════

export function createUserProfile(username, displayName, bio = '') {
  try {
    const profile = {
      userId: Date.now().toString(),
      username: username.toLowerCase().replace(/\s+/g, '-'),
      displayName,
      bio: bio.substring(0, 500),
      avatar: generateDefaultAvatar(username),
      createdAt: new Date().toISOString(),
      collectionsCount: 0,
      followersCount: 0,
      followingCount: 0,
      badges: [],
      verified: false
    };

    const profiles = getUserProfiles();
    profiles[profile.userId] = profile;
    localStorage.setItem(STORAGE_KEYS.user_profiles, JSON.stringify(profiles));
    return profile;
  } catch (err) {
    console.warn('Failed to create user profile:', err);
    return null;
  }
}

export function getUserProfile(userId) {
  try {
    const profiles = getUserProfiles();
    return profiles[userId] || null;
  } catch (err) {
    console.warn('Failed to get user profile:', err);
    return null;
  }
}

export function getUserProfiles() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.user_profiles);
    return data ? JSON.parse(data) : {};
  } catch (err) {
    console.warn('Failed to load user profiles:', err);
    return {};
  }
}

export function updateUserProfile(userId, updates) {
  try {
    const profiles = getUserProfiles();
    if (!profiles[userId]) return false;

    profiles[userId] = {
      ...profiles[userId],
      ...updates,
      userId: profiles[userId].userId,
      createdAt: profiles[userId].createdAt
    };

    localStorage.setItem(STORAGE_KEYS.user_profiles, JSON.stringify(profiles));
    return true;
  } catch (err) {
    console.warn('Failed to update user profile:', err);
    return false;
  }
}

export function generateDefaultAvatar(username) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'];
  const colorIndex = username.charCodeAt(0) % colors.length;
  const initials = username
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  return {
    type: 'initials',
    initials,
    color: colors[colorIndex],
    emoji: '🎮'
  };
}

// ══════════════════════════════════════════════════════════════════════════
// SHARED COLLECTION MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════

export function createPublicShare(userId, collectionData, sets, title, description = '') {
  try {
    const shareId = 'share_' + Date.now();
    const share = {
      shareId,
      userId,
      title: title || 'Meine Sammlung',
      description: description.substring(0, 1000),
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      collectionData,
      sets: sets.map((s) => ({
        setId: s.setId,
        setName: s.setName,
        series: s.series
      })),
      views: 0,
      likes: 0,
      comments: 0,
      accessibility: 'public', // public, private, unlisted
      shareUrl: generateShareUrl(shareId),
      expiresAt: null, // null = never expires
      password: null // optional password protection
    };

    const shares = getSharedCollections();
    shares[shareId] = share;
    localStorage.setItem(STORAGE_KEYS.shared_collections, JSON.stringify(shares));
    return share;
  } catch (err) {
    console.error('Failed to create public share:', err);
    return null;
  }
}

export function getSharedCollection(shareId) {
  try {
    const shares = getSharedCollections();
    const share = shares[shareId];
    if (share) {
      // Increment view count
      share.views = (share.views || 0) + 1;
      localStorage.setItem(STORAGE_KEYS.shared_collections, JSON.stringify(shares));
    }
    return share || null;
  } catch (err) {
    console.warn('Failed to get shared collection:', err);
    return null;
  }
}

export function getSharedCollections() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.shared_collections);
    return data ? JSON.parse(data) : {};
  } catch (err) {
    console.warn('Failed to load shared collections:', err);
    return {};
  }
}

export function updateShare(shareId, updates) {
  try {
    const shares = getSharedCollections();
    if (!shares[shareId]) return false;

    shares[shareId] = {
      ...shares[shareId],
      ...updates,
      lastUpdated: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEYS.shared_collections, JSON.stringify(shares));
    return true;
  } catch (err) {
    console.warn('Failed to update share:', err);
    return false;
  }
}

export function deleteShare(shareId) {
  try {
    const shares = getSharedCollections();
    delete shares[shareId];
    localStorage.setItem(STORAGE_KEYS.shared_collections, JSON.stringify(shares));
    return true;
  } catch (err) {
    console.warn('Failed to delete share:', err);
    return false;
  }
}

export function generateShareUrl(shareId) {
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?share=${shareId}`;
}

export function getUsersSharedCollections(userId) {
  try {
    const shares = getSharedCollections();
    return Object.values(shares).filter((s) => s.userId === userId);
  } catch (err) {
    console.warn('Failed to get user collections:', err);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════════════
// FOLLOW SYSTEM
// ══════════════════════════════════════════════════════════════════════════

export function followUser(currentUserId, targetUserId) {
  try {
    if (currentUserId === targetUserId) return false;

    const follows = getFollows();
    const key = `${currentUserId}_${targetUserId}`;

    if (!follows[key]) {
      follows[key] = {
        from: currentUserId,
        to: targetUserId,
        followedAt: new Date().toISOString()
      };

      // Update follower/following counts
      const profiles = getUserProfiles();
      if (profiles[targetUserId]) profiles[targetUserId].followersCount = (profiles[targetUserId].followersCount || 0) + 1;
      if (profiles[currentUserId]) profiles[currentUserId].followingCount = (profiles[currentUserId].followingCount || 0) + 1;

      localStorage.setItem(STORAGE_KEYS.community_follows, JSON.stringify(follows));
      localStorage.setItem(STORAGE_KEYS.user_profiles, JSON.stringify(profiles));
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Failed to follow user:', err);
    return false;
  }
}

export function unfollowUser(currentUserId, targetUserId) {
  try {
    const follows = getFollows();
    const key = `${currentUserId}_${targetUserId}`;

    if (follows[key]) {
      delete follows[key];

      // Update counts
      const profiles = getUserProfiles();
      if (profiles[targetUserId]) profiles[targetUserId].followersCount = Math.max(0, (profiles[targetUserId].followersCount || 0) - 1);
      if (profiles[currentUserId]) profiles[currentUserId].followingCount = Math.max(0, (profiles[currentUserId].followingCount || 0) - 1);

      localStorage.setItem(STORAGE_KEYS.community_follows, JSON.stringify(follows));
      localStorage.setItem(STORAGE_KEYS.user_profiles, JSON.stringify(profiles));
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Failed to unfollow user:', err);
    return false;
  }
}

export function isFollowing(currentUserId, targetUserId) {
  try {
    const follows = getFollows();
    return Boolean(follows[`${currentUserId}_${targetUserId}`]);
  } catch (err) {
    console.warn('Failed to check following status:', err);
    return false;
  }
}

export function getFollowers(userId) {
  try {
    const follows = getFollows();
    return Object.values(follows)
      .filter((f) => f.to === userId)
      .map((f) => f.from);
  } catch (err) {
    console.warn('Failed to get followers:', err);
    return [];
  }
}

export function getFollowing(userId) {
  try {
    const follows = getFollows();
    return Object.values(follows)
      .filter((f) => f.from === userId)
      .map((f) => f.to);
  } catch (err) {
    console.warn('Failed to get following:', err);
    return [];
  }
}

function getFollows() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.community_follows);
    return data ? JSON.parse(data) : {};
  } catch (err) {
    console.warn('Failed to load follows:', err);
    return {};
  }
}

// ══════════════════════════════════════════════════════════════════════════
// COMMUNITY REVIEWS & RATINGS
// ══════════════════════════════════════════════════════════════════════════

export function addReview(shareId, userId, rating, comment = '') {
  try {
    const reviews = getCommunityReviews();
    const reviewId = Date.now().toString();

    reviews[reviewId] = {
      reviewId,
      shareId,
      userId,
      rating: Math.min(5, Math.max(1, rating)),
      comment: comment.substring(0, 500),
      createdAt: new Date().toISOString(),
      likes: 0,
      helpful: 0
    };

    localStorage.setItem(STORAGE_KEYS.community_reviews, JSON.stringify(reviews));

    // Update share stats
    const share = getSharedCollection(shareId);
    if (share) {
      updateShare(shareId, { comments: (share.comments || 0) + 1 });
    }

    return reviews[reviewId];
  } catch (err) {
    console.warn('Failed to add review:', err);
    return null;
  }
}

export function getReviewsForShare(shareId) {
  try {
    const reviews = getCommunityReviews();
    return Object.values(reviews)
      .filter((r) => r.shareId === shareId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (err) {
    console.warn('Failed to get reviews:', err);
    return [];
  }
}

export function getAverageRating(shareId) {
  try {
    const reviews = getReviewsForShare(shareId);
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return (sum / reviews.length).toFixed(1);
  } catch (err) {
    console.warn('Failed to get average rating:', err);
    return 0;
  }
}

function getCommunityReviews() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.community_reviews);
    return data ? JSON.parse(data) : {};
  } catch (err) {
    console.warn('Failed to load reviews:', err);
    return {};
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TRENDING & FEATURED COLLECTIONS
// ══════════════════════════════════════════════════════════════════════════

export function getTrendingCollections(limit = 10) {
  try {
    const shares = getSharedCollections();
    const now = Date.now();

    const scoring = Object.values(shares)
      .filter((s) => s.accessibility === 'public' && !s.expiresAt || new Date(s.expiresAt) > new Date())
      .map((s) => {
        // Trending score based on recent views and engagement
        const ageInDays = (now - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        const viewsPerDay = s.views / Math.max(1, ageInDays);
        const engagement = (s.likes || 0) * 2 + (s.comments || 0) * 3;
        const score = viewsPerDay * 10 + engagement;

        return { ...s, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scoring.map(({ score, ...rest }) => rest);
  } catch (err) {
    console.warn('Failed to get trending collections:', err);
    return [];
  }
}

export function getFeaturedCollections(limit = 5) {
  try {
    const shares = getSharedCollections();
    return Object.values(shares)
      .filter((s) => s.accessibility === 'public' && s.featured)
      .sort((a, b) => (b.likes || 0) - (a.likes || 0))
      .slice(0, limit);
  } catch (err) {
    console.warn('Failed to get featured collections:', err);
    return [];
  }
}

export function likeShare(shareId) {
  try {
    const shares = getSharedCollections();
    if (shares[shareId]) {
      shares[shareId].likes = (shares[shareId].likes || 0) + 1;
      localStorage.setItem(STORAGE_KEYS.shared_collections, JSON.stringify(shares));
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Failed to like share:', err);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SEARCH & DISCOVERY
// ══════════════════════════════════════════════════════════════════════════

export function searchPublicCollections(query, filters = {}) {
  try {
    const shares = getSharedCollections();
    const lowerQuery = query.toLowerCase();

    let results = Object.values(shares).filter((s) => {
      if (s.accessibility !== 'public') return false;
      if (s.expiresAt && new Date(s.expiresAt) < new Date()) return false;

      const matchesQuery =
        s.title.toLowerCase().includes(lowerQuery) || s.description.toLowerCase().includes(lowerQuery);

      if (!matchesQuery) return false;

      // Apply filters
      if (filters.minRating) {
        const rating = getAverageRating(s.shareId);
        if (parseFloat(rating) < filters.minRating) return false;
      }

      if (filters.seriesFilter) {
        const hasSeries = s.sets.some((set) => set.series === filters.seriesFilter);
        if (!hasSeries) return false;
      }

      return true;
    });

    // Sort by relevance
    results.sort((a, b) => {
      const aTitle = a.title.toLowerCase();
      const bTitle = b.title.toLowerCase();
      const aExact = aTitle === lowerQuery ? 1 : 0;
      const bExact = bTitle === lowerQuery ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;

      return (b.views || 0) - (a.views || 0);
    });

    return results;
  } catch (err) {
    console.warn('Failed to search collections:', err);
    return [];
  }
}

export function getCollectionsByUser(userId) {
  try {
    const shares = getSharedCollections();
    return Object.values(shares)
      .filter((s) => s.userId === userId && s.accessibility === 'public')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (err) {
    console.warn('Failed to get user collections:', err);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════════════
// COLLECTION BADGES & ACHIEVEMENTS
// ══════════════════════════════════════════════════════════════════════════

export function checkCollectionBadges(share) {
  try {
    const badges = [];

    // Completionist badge
    if (share.sets) {
      const completedSets = share.sets.filter((s) => share.collectionData[s.setName]?.completed).length;
      if (completedSets > 0) {
        badges.push({
          id: 'completionist',
          name: 'Completionist',
          icon: '✨',
          description: `${completedSets} komplette Sets`
        });
      }
    }

    // Popular badge (100+ views)
    if ((share.views || 0) >= 100) {
      badges.push({
        id: 'popular',
        name: 'Beliebte Collection',
        icon: '🔥',
        description: `${share.views} Aufrufe`
      });
    }

    // Well-reviewed (4+ stars, 5+ reviews)
    const reviews = getReviewsForShare(share.shareId);
    if (reviews.length >= 5) {
      const avgRating = getAverageRating(share.shareId);
      if (parseFloat(avgRating) >= 4) {
        badges.push({
          id: 'wellreviewed',
          name: 'Gut bewertet',
          icon: '⭐',
          description: `${avgRating} Sterne`
        });
      }
    }

    return badges;
  } catch (err) {
    console.warn('Failed to check badges:', err);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════════════
// COMMUNITY STATS
// ══════════════════════════════════════════════════════════════════════════

export function getCommunityStats() {
  try {
    const shares = getSharedCollections();
    const profiles = getUserProfiles();
    const follows = Object.values(JSON.parse(localStorage.getItem(STORAGE_KEYS.community_follows) || '{}'));

    const totalCollections = Object.keys(shares).length;
    const totalUsers = Object.keys(profiles).length;
    const totalViews = Object.values(shares).reduce((sum, s) => sum + (s.views || 0), 0);
    const totalFollows = follows.length;

    return {
      totalCollections,
      totalUsers,
      totalViews,
      totalFollows,
      avgViewsPerCollection: totalCollections > 0 ? (totalViews / totalCollections).toFixed(1) : 0
    };
  } catch (err) {
    console.warn('Failed to get community stats:', err);
    return {};
  }
}

export function exportCommunityData() {
  try {
    return {
      profiles: getUserProfiles(),
      collections: getSharedCollections(),
      follows: JSON.parse(localStorage.getItem(STORAGE_KEYS.community_follows) || '{}'),
      reviews: JSON.parse(localStorage.getItem(STORAGE_KEYS.community_reviews) || '{}'),
      exportedAt: new Date().toISOString()
    };
  } catch (err) {
    console.warn('Failed to export data:', err);
    return null;
  }
}
