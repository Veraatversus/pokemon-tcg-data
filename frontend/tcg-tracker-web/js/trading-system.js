// ══════════════════════════════════════════════════════════════════════════
// TRADING MARKETPLACE & EXCHANGE SYSTEM
// ══════════════════════════════════════════════════════════════════════════

import { scopedStorageKey } from './config.js';

const STORAGE_KEYS = {
  trades: scopedStorageKey('trades'),
  trade_offers: scopedStorageKey('trade-offers'),
  trade_history: scopedStorageKey('trade-history'),
  wanted_cards: scopedStorageKey('wanted-cards')
};

export const TRADE_STATUS = {
  OPEN: 'open',
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// ══════════════════════════════════════════════════════════════════════════
// WANTED CARDS MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════

export function addWantedCard(setId, cardNumber, priority = 'medium') {
  try {
    const wanted = getWantedCards();
    const cardId = `${setId}_${cardNumber}`;

    wanted[cardId] = {
      cardId,
      setId,
      cardNumber,
      priority, // low, medium, high, urgent
      addedAt: new Date().toISOString(),
      notes: '',
      tradeStatus: 'open'
    };

    localStorage.setItem(STORAGE_KEYS.wanted_cards, JSON.stringify(wanted));
    return wanted[cardId];
  } catch (err) {
    console.warn('Failed to add wanted card:', err);
    return null;
  }
}

export function removeWantedCard(setId, cardNumber) {
  try {
    const wanted = getWantedCards();
    const cardId = `${setId}_${cardNumber}`;
    delete wanted[cardId];
    localStorage.setItem(STORAGE_KEYS.wanted_cards, JSON.stringify(wanted));
    return true;
  } catch (err) {
    console.warn('Failed to remove wanted card:', err);
    return false;
  }
}

export function getWantedCards() {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.wanted_cards);
    return data ? JSON.parse(data) : {};
  } catch (err) {
    console.warn('Failed to load wanted cards:', err);
    return {};
  }
}

export function isCardWanted(setId, cardNumber) {
  const wanted = getWantedCards();
  return Boolean(wanted[`${setId}_${cardNumber}`]);
}

export function getWantedCardsByPriority() {
  const wanted = Object.values(getWantedCards());
  const priorities = { urgent: 0, high: 1, medium: 2, low: 3 };

  return wanted.sort((a, b) => priorities[a.priority] - priorities[b.priority]);
}

// ══════════════════════════════════════════════════════════════════════════
// TRADE OFFERS MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════

export function createTradeOffer(offeredCards, wantedCards, userId, description = '') {
  try {
    const offerId = 'offer_' + Date.now();

    const offer = {
      offerId,
      userId,
      status: TRADE_STATUS.OPEN,
      offeredCards: offeredCards, // Array of {setId, cardNumber, condition}
      wantedCards: wantedCards,   // Array of {setId, cardNumber}
      description: description.substring(0, 500),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      views: 0,
      interests: 0,
      acceptedBy: null
    };

    const offers = getTradeOffers();
    offers[offerId] = offer;
    localStorage.setItem(STORAGE_KEYS.trade_offers, JSON.stringify(offers));
    return offer;
  } catch (err) {
    console.error('Failed to create trade offer:', err);
    return null;
  }
}

export function getTradeOffers(filter = {}) {
  try {
    const offers = JSON.parse(localStorage.getItem(STORAGE_KEYS.trade_offers) || '{}');

    if (filter.status) {
      return Object.values(offers).filter((o) => o.status === filter.status);
    }

    if (filter.userId) {
      return Object.values(offers).filter((o) => o.userId === filter.userId);
    }

    return Object.values(offers).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (err) {
    console.warn('Failed to load trade offers:', err);
    return [];
  }
}

export function updateTradeOffer(offerId, updates) {
  try {
    const offers = JSON.parse(localStorage.getItem(STORAGE_KEYS.trade_offers) || '{}');
    if (!offers[offerId]) return false;

    offers[offerId] = { ...offers[offerId], ...updates };
    localStorage.setItem(STORAGE_KEYS.trade_offers, JSON.stringify(offers));
    return true;
  } catch (err) {
    console.warn('Failed to update trade offer:', err);
    return false;
  }
}

export function acceptTradeOffer(offerId, acceptedBy) {
  return updateTradeOffer(offerId, {
    status: TRADE_STATUS.COMPLETED,
    acceptedBy,
    completedAt: new Date().toISOString()
  });
}

export function deleteTradeOffer(offerId) {
  try {
    const offers = JSON.parse(localStorage.getItem(STORAGE_KEYS.trade_offers) || '{}');
    delete offers[offerId];
    localStorage.setItem(STORAGE_KEYS.trade_offers, JSON.stringify(offers));
    return true;
  } catch (err) {
    console.warn('Failed to delete trade offer:', err);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TRADE MATCHING ENGINE
// ══════════════════════════════════════════════════════════════════════════

export function findMatchingTrades(userId, cards, wanted) {
  try {
    const allOffers = getTradeOffers({ status: TRADE_STATUS.OPEN });

    const matches = allOffers
      .filter((offer) => offer.userId !== userId) // Don't match with own offers
      .map((offer) => {
        let matchScore = 0;
        let matchedCards = [];
        let unmatchedWanted = [...offer.wantedCards];

        // Check if we have cards they want
        offer.wantedCards.forEach((wantedCard) => {
          const hasCard = cards.some(
            (c) => c.setId === wantedCard.setId && c.cardNumber === wantedCard.cardNumber
          );
          if (hasCard) {
            matchScore += 2;
            matchedCards.push(wantedCard);
            unmatchedWanted = unmatchedWanted.filter(
              (w) => !(w.setId === wantedCard.setId && w.cardNumber === wantedCard.cardNumber)
            );
          }
        });

        // Check if they have cards we want
        wanted.forEach((wantedCard) => {
          const hasCard = offer.offeredCards.some(
            (c) => c.setId === wantedCard.setId && c.cardNumber === wantedCard.cardNumber
          );
          if (hasCard) {
            matchScore += 2;
          }
        });

        return {
          offerId: offer.offerId,
          offer,
          matchScore,
          matchedCards,
          matchPercentage: offer.wantedCards.length > 0 ? (matchedCards.length / offer.wantedCards.length) * 100 : 0
        };
      })
      .filter((m) => m.matchScore > 0)
      .sort((a, b) => b.matchPercentage - a.matchPercentage);

    return matches;
  } catch (err) {
    console.warn('Failed to find matching trades:', err);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TRADE HISTORY
// ══════════════════════════════════════════════════════════════════════════

export function recordTradeCompletion(offererId, accepterId, offeredCards, receivedCards) {
  try {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.trade_history) || '[]');

    history.push({
      tradeId: 'trade_' + Date.now(),
      offererId,
      accepterId,
      offeredCards,
      receivedCards,
      completedAt: new Date().toISOString(),
      rating: null,
      review: ''
    });

    localStorage.setItem(STORAGE_KEYS.trade_history, JSON.stringify(history));
    return history[history.length - 1];
  } catch (err) {
    console.warn('Failed to record trade:', err);
    return null;
  }
}

export function getTradeHistory(userId) {
  try {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.trade_history) || '[]');
    return history.filter((t) => t.offererId === userId || t.accepterId === userId);
  } catch (err) {
    console.warn('Failed to get trade history:', err);
    return [];
  }
}

export function getUserTradeStats(userId) {
  try {
    const history = getTradeHistory(userId);
    const offers = getTradeOffers({ userId });

    const completed = history.length;
    const pending = offers.filter((o) => o.status === TRADE_STATUS.PENDING).length;
    const active = offers.filter((o) => o.status === TRADE_STATUS.OPEN).length;

    const avgRating = history.length > 0
      ? (history.reduce((sum, t) => sum + (t.rating || 0), 0) / history.length).toFixed(1)
      : 0;

    return {
      completedTrades: completed,
      pendingTrades: pending,
      activeOffers: active,
      averageRating: avgRating,
      tradePartners: new Set(
        history.map((t) => (t.offererId === userId ? t.accepterId : t.offererId))
      ).size
    };
  } catch (err) {
    console.warn('Failed to get trade stats:', err);
    return {};
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TRADE SUGGESTIONS ENGINE
// ══════════════════════════════════════════════════════════════════════════

export function generateTradeSuggestions(userId, userCards, wantedCards) {
  try {
    const suggestions = [];

    // 1. Find users who have cards you want
    const allOffers = getTradeOffers({ status: TRADE_STATUS.OPEN });

    allOffers
      .filter((o) => o.userId !== userId)
      .forEach((offer) => {
        const userHasWanted = wantedCards.filter((w) =>
          offer.offeredCards.some((c) => c.setId === w.setId && c.cardNumber === w.cardNumber)
        );

        const offerWantsOurs = offer.wantedCards.filter((w) =>
          userCards.some((c) => c.setId === w.setId && c.cardNumber === w.cardNumber)
        );

        if (userHasWanted.length > 0 && offerWantsOurs.length > 0) {
          suggestions.push({
            type: 'mutual_match',
            offerId: offer.offerId,
            user: offer.userId,
            theyHave: userHasWanted,
            theyWant: offerWantsOurs,
            score: (userHasWanted.length * offerWantsOurs.length) / Math.max(userHasWanted.length, offerWantsOurs.length)
          });
        }
      });

    return suggestions.sort((a, b) => b.score - a.score);
  } catch (err) {
    console.warn('Failed to generate trade suggestions:', err);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════════════
// EXPORT NEEDED UTILITIES
// ══════════════════════════════════════════════════════════════════════════

export function getTradePlaceSummary() {
  try {
    const offers = getTradeOffers();
    const wantedCards = getWantedCards();

    return {
      activeOffers: offers.filter((o) => o.status === TRADE_STATUS.OPEN).length,
      totalWantedCards: Object.keys(wantedCards).length,
      recentTrades: getTradeOffers().slice(0, 5),
      topMatches: []
    };
  } catch (err) {
    console.warn('Failed to get marketplace summary:', err);
    return {};
  }
}
