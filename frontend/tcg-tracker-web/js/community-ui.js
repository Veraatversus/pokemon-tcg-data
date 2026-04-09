// ══════════════════════════════════════════════════════════════════════════
// COMMUNITY UI COMPONENTS
// ══════════════════════════════════════════════════════════════════════════

import {
  createUserProfile,
  getUserProfile,
  updateUserProfile,
  createPublicShare,
  getSharedCollection,
  followUser,
  unfollowUser,
  isFollowing,
  getFollowers,
  addReview,
  getReviewsForShare,
  getAverageRating,
  getTrendingCollections,
  searchPublicCollections,
  getCollectionsByUser,
  checkCollectionBadges,
  getCommunityStats,
  likeShare
} from './community-features.js';

// ══════════════════════════════════════════════════════════════════════════
// USER PROFILE CARD
// ══════════════════════════════════════════════════════════════════════════

export function createUserProfileCard(userId, currentUserId) {
  const profile = getUserProfile(userId);
  if (!profile) return null;

  const container = document.createElement('div');
  container.className = 'user-profile-card';
  container.style.cssText = `
    background: var(--color-surface);
    border-radius: 12px;
    padding: 20px;
    text-align: center;
    border: 1px solid var(--color-border);
  `;

  const isFollowingUser = currentUserId ? isFollowing(currentUserId, userId) : false;
  const followers = getFollowers(userId);

  const avatarEl = document.createElement('div');
  avatarEl.style.cssText = `
    width: 60px;
    height: 60px;
    background: ${profile.avatar.color};
    border-radius: 50%;
    margin: 0 auto 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: bold;
    color: white;
  `;
  avatarEl.textContent = profile.avatar.initials;

  const nameEl = document.createElement('h3');
  nameEl.textContent = profile.displayName;
  nameEl.style.cssText = 'margin: 0 0 4px 0; font-size: 16px;';

  const usernameEl = document.createElement('p');
  usernameEl.textContent = `@${profile.username}`;
  usernameEl.style.cssText = 'margin: 0 0 12px 0; font-size: 12px; color: var(--color-muted);';

  const bioEl = document.createElement('p');
  bioEl.textContent = profile.bio || 'Pokémon TCG Sammler';
  bioEl.style.cssText = 'margin: 0 0 16px 0; font-size: 13px; line-height: 1.4;';

  const statsEl = document.createElement('div');
  statsEl.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;';
  statsEl.innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 18px; font-weight: bold; color: var(--color-primary);">${profile.collectionsCount || 0}</div>
      <div style="font-size: 11px; color: var(--color-muted);">Collections</div>
    </div>
    <div style="text-align: center;">
      <div style="font-size: 18px; font-weight: bold; color: var(--color-primary);">${followers.length}</div>
      <div style="font-size: 11px; color: var(--color-muted);">Followers</div>
    </div>
    <div style="text-align: center;">
      <div style="font-size: 18px; font-weight: bold; color: var(--color-primary);">${profile.followingCount || 0}</div>
      <div style="font-size: 11px; color: var(--color-muted);">Following</div>
    </div>
  `;

  if (currentUserId && currentUserId !== userId) {
    const followBtn = document.createElement('button');
    followBtn.textContent = isFollowingUser ? '✅ Following' : '➕ Follow';
    followBtn.style.cssText = `
      width: 100%;
      padding: 10px;
      background: ${isFollowingUser ? 'var(--color-success)' : 'var(--color-primary)'};
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
      transition: all 0.2s;
    `;

    followBtn.addEventListener('click', () => {
      if (isFollowingUser) {
        unfollowUser(currentUserId, userId);
        followBtn.textContent = '➕ Follow';
        followBtn.style.background = 'var(--color-primary)';
      } else {
        followUser(currentUserId, userId);
        followBtn.textContent = '✅ Following';
        followBtn.style.background = 'var(--color-success)';
      }
    });

    container.append(avatarEl, nameEl, usernameEl, bioEl, statsEl, followBtn);
  } else {
    container.append(avatarEl, nameEl, usernameEl, bioEl, statsEl);
  }

  return container;
}

// ══════════════════════════════════════════════════════════════════════════
// SHARED COLLECTION CARD
// ══════════════════════════════════════════════════════════════════════════

export function createSharedCollectionCard(share) {
  const container = document.createElement('div');
  container.className = 'shared-collection-card';
  container.style.cssText = `
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.3s;
  `;

  container.addEventListener('mouseenter', () => {
    container.style.transform = 'translateY(-4px)';
    container.style.boxShadow = '0 12px 24px rgba(0,0,0,0.15)';
  });

  container.addEventListener('mouseleave', () => {
    container.style.transform = 'translateY(0)';
    container.style.boxShadow = 'none';
  });

  const profile = getUserProfile(share.userId);
  const avgRating = getAverageRating(share.shareId);
  const reviews = getReviewsForShare(share.shareId);
  const badges = checkCollectionBadges(share);

  const header = document.createElement('div');
  header.style.cssText = 'padding: 16px; border-bottom: 1px solid var(--color-border);';

  if (profile) {
    const userEl = document.createElement('div');
    userEl.style.cssText = 'display: flex; align-items: center; gap: 12px; margin-bottom: 12px;';
    userEl.innerHTML = `
      <div style="
        width: 32px;
        height: 32px;
        background: ${profile.avatar.color};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: bold;
        color: white;
      ">
        ${profile.avatar.initials}
      </div>
      <div>
        <div style="font-weight: bold; font-size: 12px;">${profile.displayName}</div>
        <div style="font-size: 11px; color: var(--color-muted);">@${profile.username}</div>
      </div>
    `;
    header.appendChild(userEl);
  }

  const titleEl = document.createElement('h3');
  titleEl.textContent = share.title;
  titleEl.style.cssText = 'margin: 0 0 8px 0; font-size: 16px;';
  header.appendChild(titleEl);

  if (share.description) {
    const descEl = document.createElement('p');
    descEl.textContent = share.description.substring(0, 100) + (share.description.length > 100 ? '...' : '');
    descEl.style.cssText = 'margin: 0; font-size: 13px; color: var(--color-muted); line-height: 1.4;';
    header.appendChild(descEl);
  }

  const content = document.createElement('div');
  content.style.cssText = 'padding: 16px;';

  const badgesEl = document.createElement('div');
  if (badges.length > 0) {
    badgesEl.style.cssText = 'display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;';
    badges.forEach((badge) => {
      const badgeEl = document.createElement('span');
      badgeEl.style.cssText = `
        padding: 4px 8px;
        background: var(--color-primary);
        color: white;
        border-radius: 4px;
        font-size: 11px;
        font-weight: bold;
      `;
      badgeEl.textContent = badge.icon + ' ' + badge.name;
      badgesEl.appendChild(badgeEl);
    });
    content.appendChild(badgesEl);
  }

  const statsEl = document.createElement('div');
  statsEl.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;';
  statsEl.innerHTML = `
    <div style="text-align: center; font-size: 12px;">
      <div style="font-weight: bold; color: var(--color-primary);">${share.sets?.length || 0}</div>
      <div style="color: var(--color-muted); font-size: 10px;">Sets</div>
    </div>
    <div style="text-align: center; font-size: 12px;">
      <div style="font-weight: bold; color: var(--color-primary);">${share.views || 0}</div>
      <div style="color: var(--color-muted); font-size: 10px;">Views</div>
    </div>
    <div style="text-align: center; font-size: 12px;">
      <div style="font-weight: bold; color: var(--color-primary);">${avgRating}⭐</div>
      <div style="color: var(--color-muted); font-size: 10px;">${reviews.length} Reviews</div>
    </div>
  `;
  content.appendChild(statsEl);

  const actionsEl = document.createElement('div');
  actionsEl.style.cssText = 'display: flex; gap: 8px;';

  const viewBtn = document.createElement('button');
  viewBtn.textContent = '👁️ View';
  viewBtn.style.cssText = `
    flex: 1;
    padding: 8px;
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: bold;
  `;

  const likeBtn = document.createElement('button');
  likeBtn.textContent = `❤️ ${share.likes || 0}`;
  likeBtn.style.cssText = `
    flex: 1;
    padding: 8px;
    background: var(--color-border);
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
  `;

  likeBtn.addEventListener('click', () => {
    likeShare(share.shareId);
    likeBtn.textContent = `❤️ ${(share.likes || 0) + 1}`;
  });

  actionsEl.appendChild(viewBtn);
  actionsEl.appendChild(likeBtn);
  content.appendChild(actionsEl);

  container.appendChild(header);
  container.appendChild(content);

  return container;
}

// ══════════════════════════════════════════════════════════════════════════
// COMMUNITY TRENDING PANEL
// ══════════════════════════════════════════════════════════════════════════

export function createCommunityTrendingPanel() {
  const container = document.createElement('div');
  container.style.cssText = 'background: var(--color-surface); padding: 20px; border-radius: 12px;';

  const title = document.createElement('h3');
  title.textContent = '🔥 Trending Collections';
  title.style.cssText = 'margin: 0 0 16px 0; font-size: 16px;';
  container.appendChild(title);

  const trending = getTrendingCollections(5);

  if (trending.length === 0) {
    container.innerHTML += '<p style="color: var(--color-muted); text-align: center;">Keine Sammlungen gefunden</p>';
    return container;
  }

  const listEl = document.createElement('div');
  listEl.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

  trending.forEach((share, idx) => {
    const itemEl = document.createElement('div');
    itemEl.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: var(--color-bg);
      border-radius: 8px;
      cursor: pointer;
    `;

    const rankEl = document.createElement('div');
    rankEl.style.cssText = `
      width: 32px;
      height: 32px;
      background: var(--color-primary);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
      flex-shrink: 0;
    `;
    rankEl.textContent = (idx + 1).toString();

    const contentEl = document.createElement('div');
    contentEl.style.cssText = 'flex: 1; overflow: hidden;';
    contentEl.innerHTML = `
      <div style="font-weight: bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        ${share.title}
      </div>
      <div style="font-size: 11px; color: var(--color-muted);">
        👁️ ${share.views} views • 📊 ${share.sets?.length || 0} sets
      </div>
    `;

    itemEl.appendChild(rankEl);
    itemEl.appendChild(contentEl);
    listEl.appendChild(itemEl);
  });

  container.appendChild(listEl);
  return container;
}

// ══════════════════════════════════════════════════════════════════════════
// COLLECTION REVIEWS PANEL
// ══════════════════════════════════════════════════════════════════════════

export function createReviewsPanel(shareId, currentUserId) {
  const container = document.createElement('div');
  container.style.cssText = 'background: var(--color-surface); padding: 20px; border-radius: 12px;';

  const title = document.createElement('h3');
  title.textContent = '⭐ Reviews';
  title.style.cssText = 'margin: 0 0 16px 0; font-size: 16px;';
  container.appendChild(title);

  const reviews = getReviewsForShare(shareId);
  const avgRating = getAverageRating(shareId);

  const ratingEl = document.createElement('div');
  ratingEl.style.cssText = 'text-align: center; margin-bottom: 16px;';
  ratingEl.innerHTML = `
    <div style="font-size: 28px; font-weight: bold; color: var(--color-primary);">${avgRating}⭐</div>
    <div style="font-size: 12px; color: var(--color-muted);">${reviews.length} reviews</div>
  `;
  container.appendChild(ratingEl);

  if (currentUserId) {
    const addReviewEl = document.createElement('div');
    addReviewEl.style.cssText = 'margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--color-border);';

    const starsContainer = document.createElement('div');
    starsContainer.style.cssText = 'display: flex; gap: 8px; margin-bottom: 12px;';
    let tempRating = 0;

    for (let i = 1; i <= 5; i++) {
      const starBtn = document.createElement('button');
      starBtn.textContent = '☆';
      starBtn.style.cssText = `
        font-size: 24px;
        background: none;
        border: none;
        cursor: pointer;
        opacity: 0.3;
      `;

      starBtn.addEventListener('click', () => {
        tempRating = i;
        updateStars(i);
      });

      starBtn.addEventListener('mouseover', () => updateStars(i));
      starsContainer.appendChild(starBtn);
    }

    function updateStars(count) {
      Array.from(starsContainer.children).forEach((star, idx) => {
        star.textContent = idx < count ? '⭐' : '☆';
        star.style.opacity = idx < count ? '1' : '0.3';
      });
    }

    const commentEl = document.createElement('textarea');
    commentEl.placeholder = 'Schreibe eine Bewertung...';
    commentEl.style.cssText = `
      width: 100%;
      padding: 10px;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      font-family: inherit;
      font-size: 13px;
      resize: vertical;
      min-height: 60px;
      margin-bottom: 12px;
    `;

    const submitBtn = document.createElement('button');
    submitBtn.textContent = '💬 Bewertung posten';
    submitBtn.style.cssText = `
      width: 100%;
      padding: 10px;
      background: var(--color-primary);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
    `;

    submitBtn.addEventListener('click', () => {
      if (tempRating === 0) {
        alert('Bitte mindestens einen Stern vergeben');
        return;
      }

      addReview(shareId, currentUserId, tempRating, commentEl.value);
      submitBtn.textContent = '✅ Gepostet!';
      setTimeout(() => {
        location.reload();
      }, 1500);
    });

    addReviewEl.appendChild(starsContainer);
    addReviewEl.appendChild(commentEl);
    addReviewEl.appendChild(submitBtn);
    container.appendChild(addReviewEl);
  }

  if (reviews.length > 0) {
    const reviewsList = document.createElement('div');
    reviewsList.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

    reviews.slice(0, 5).forEach((review) => {
      const reviewEl = document.createElement('div');
      reviewEl.style.cssText = `
        padding: 12px;
        background: var(--color-bg);
        border-radius: 8px;
        border-left: 4px solid var(--color-primary);
      `;

      const ratingEl = document.createElement('div');
      ratingEl.style.cssText = 'margin-bottom: 8px; font-weight: bold;';
      ratingEl.textContent = '⭐'.repeat(review.rating);

      const commentEl = document.createElement('p');
      commentEl.textContent = review.comment;
      commentEl.style.cssText = 'margin: 8px 0; font-size: 13px;';

      const metaEl = document.createElement('div');
      metaEl.style.cssText = 'font-size: 11px; color: var(--color-muted);';
      metaEl.textContent = new Date(review.createdAt).toLocaleDateString('de-DE');

      reviewEl.appendChild(ratingEl);
      if (review.comment) reviewEl.appendChild(commentEl);
      reviewEl.appendChild(metaEl);
      reviewsList.appendChild(reviewEl);
    });

    container.appendChild(reviewsList);
  }

  return container;
}

// ══════════════════════════════════════════════════════════════════════════
// COMMUNITY SEARCH & DISCOVER
// ══════════════════════════════════════════════════════════════════════════

export function createCommunitySearchPanel() {
  const container = document.createElement('div');
  container.style.cssText = 'background: var(--color-surface); padding: 20px; border-radius: 12px;';

  const title = document.createElement('h3');
  title.textContent = '🔍 Collections erkunden';
  title.style.cssText = 'margin: 0 0 16px 0; font-size: 16px;';
  container.appendChild(title);

  const searchEl = document.createElement('input');
  searchEl.type = 'text';
  searchEl.placeholder = 'Nach Collections suchen...';
  searchEl.style.cssText = `
    width: 100%;
    padding: 10px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    margin-bottom: 16px;
    font-size: 13px;
  `;

  const resultsEl = document.createElement('div');
  resultsEl.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px;';

  searchEl.addEventListener('input', (e) => {
    const query = e.target.value;
    if (query.length < 2) {
      resultsEl.innerHTML = '';
      return;
    }

    const results = searchPublicCollections(query);
    resultsEl.innerHTML = '';

    if (results.length === 0) {
      resultsEl.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--color-muted);">Keine Ergebnisse</p>';
      return;
    }

    results.slice(0, 9).forEach((share) => {
      const card = createSharedCollectionCard(share);
      resultsEl.appendChild(card);
    });
  });

  container.appendChild(searchEl);
  container.appendChild(resultsEl);

  return container;
}

// ══════════════════════════════════════════════════════════════════════════
// COMMUNITY STATS BANNER
// ══════════════════════════════════════════════════════════════════════════

export function createCommunityStatsBanner() {
  const container = document.createElement('div');
  container.style.cssText = `
    background: linear-gradient(135deg, var(--color-primary), #5a67d8);
    color: white;
    padding: 24px;
    border-radius: 12px;
    margin-bottom: 20px;
  `;

  const stats = getCommunityStats();

  const title = document.createElement('h2');
  title.textContent = '🌍 Community Stats';
  title.style.cssText = 'margin: 0 0 16px 0; font-size: 18px;';
  container.appendChild(title);

  const statsGrid = document.createElement('div');
  statsGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 16px;';
  statsGrid.innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 24px; font-weight: bold;">${stats.totalUsers || 0}</div>
      <div style="font-size: 12px; opacity: 0.9;">Users</div>
    </div>
    <div style="text-align: center;">
      <div style="font-size: 24px; font-weight: bold;">${stats.totalCollections || 0}</div>
      <div style="font-size: 12px; opacity: 0.9;">Collections</div>
    </div>
    <div style="text-align: center;">
      <div style="font-size: 24px; font-weight: bold;">${stats.totalViews || 0}</div>
      <div style="font-size: 12px; opacity: 0.9;">Total Views</div>
    </div>
    <div style="text-align: center;">
      <div style="font-size: 24px; font-weight: bold;">${stats.totalFollows || 0}</div>
      <div style="font-size: 12px; opacity: 0.9;">Follows</div>
    </div>
  `;

  container.appendChild(statsGrid);
  return container;
}
