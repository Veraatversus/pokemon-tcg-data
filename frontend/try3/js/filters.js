/**
 * Filter, Search & Sort Module
 * Handles card searching, filtering, and sorting logic
 * 
 * Features:
 * - Live search by name/ID/number
 * - Filter by collection status (collected, reverse holo, missing)
 * - Filter by cardmarket availability
 * - Natural number sorting
 * - Case-insensitive searching
 */

export class CardFilter {
  constructor(cards = []) {
    this.originalCards = cards;
    this.filteredCards = [...cards];
    this.searchTerm = '';
    this.filters = {
      collectionStatus: 'all', // all, collected, reverseHolo, missing
      cardmarketAvailable: null, // null = all, true = only with links, false = only without
      collected: null, // null = all, true = only collected, false = only not collected
      reverseHolo: null // null = all, true = only RH, false = only non-RH
    };
    this.sortOrder = {
      by: 'number', // number, name, collected, reverseHolo
      direction: 'asc' // asc, desc
    };
  }

  /**
   * Update cards to filter
   * @param {Array} cards - Array of card objects
   */
  setCards(cards) {
    this.originalCards = cards;
    this.applyFilters();
  }

  /**
   * Live search across name, ID, and number
   * @param {string} term - Search term
   */
  search(term) {
    this.searchTerm = term.toLowerCase().trim();
    this.applyFilters();
  }

  /**
   * Filter by collection status
   * @param {string} status - 'all', 'collected', 'reverseHolo', 'missing'
   */
  filterByCollectionStatus(status) {
    this.filters.collectionStatus = status;
    this.applyFilters();
  }

  /**
   * Filter by cardmarket availability
   * @param {boolean|null} available - true/false/null
   */
  filterByCardmarket(available) {
    this.filters.cardmarketAvailable = available;
    this.applyFilters();
  }

  /**
   * Filter by collected status
   * @param {boolean|null} isCollected - true/false/null
   */
  filterByCollected(isCollected) {
    this.filters.collected = isCollected;
    this.applyFilters();
  }

  /**
   * Filter by reverse holo status
   * @param {boolean|null} isReverseHolo - true/false/null
   */
  filterByReverseHolo(isReverseHolo) {
    this.filters.reverseHolo = isReverseHolo;
    this.applyFilters();
  }

  /**
   * Sort cards
   * @param {string} by - 'number', 'name', 'collected', 'reverseHolo'
   * @param {string} direction - 'asc' or 'desc'
   */
  sort(by = 'number', direction = 'asc') {
    this.sortOrder = { by, direction };
    this.applyFilters();
  }

  /**
   * Clear all filters and search
   */
  clearFilters() {
    this.searchTerm = '';
    this.filters = {
      collectionStatus: 'all',
      cardmarketAvailable: null,
      collected: null,
      reverseHolo: null
    };
    this.sortOrder = { by: 'number', direction: 'asc' };
    this.applyFilters();
  }

  /**
   * Apply all active filters and sorting
   * @private
   */
  applyFilters() {
    let cards = [...this.originalCards];

    // 1. Search filter
    if (this.searchTerm) {
      cards = cards.filter(card => this.matchesSearch(card));
    }

    // 2. Collection status filter
    if (this.filters.collectionStatus !== 'all') {
      cards = cards.filter(card => this.matchesCollectionStatus(card));
    }

    // 3. Collected filter
    if (this.filters.collected !== null) {
      cards = cards.filter(card => card.g === this.filters.collected);
    }

    // 4. Reverse Holo filter
    if (this.filters.reverseHolo !== null) {
      cards = cards.filter(card => card.rh === this.filters.reverseHolo);
    }

    // 5. Cardmarket availability filter
    if (this.filters.cardmarketAvailable !== null) {
      const hasLink = this.filters.cardmarketAvailable;
      cards = cards.filter(card => {
        const hasCardmarketLink = !!card.cardmarketLink;
        return hasCardmarketLink === hasLink;
      });
    }

    // 6. Sort
    cards = this.sortCards(cards);

    this.filteredCards = cards;
    return cards;
  }

  /**
   * Check if card matches search term
   * @private
   */
  matchesSearch(card) {
    const term = this.searchTerm;
    return (
      card.number?.toString().toLowerCase().includes(term) ||
      card.name?.toLowerCase().includes(term) ||
      card.id?.toLowerCase().includes(term)
    );
  }

  /**
   * Check if card matches collection status
   * @private
   */
  matchesCollectionStatus(card) {
    switch (this.filters.collectionStatus) {
      case 'collected':
        return card.g === true;
      case 'reverseHolo':
        return card.rh === true;
      case 'missing':
        return card.g === false;
      default:
        return true;
    }
  }

  /**
   * Sort cards by selected criteria
   * @private
   */
  sortCards(cards) {
    const { by, direction } = this.sortOrder;
    const sorted = [...cards];

    sorted.sort((a, b) => {
      let compareValue = 0;

      switch (by) {
        case 'number':
          compareValue = this.naturalSort(a.number || '', b.number || '');
          break;
        case 'name':
          compareValue = (a.name || '').localeCompare(b.name || '', 'de', { numeric: true });
          break;
        case 'collected':
          compareValue = (a.g === b.g) ? 0 : (a.g ? -1 : 1);
          break;
        case 'reverseHolo':
          compareValue = (a.rh === b.rh) ? 0 : (a.rh ? -1 : 1);
          break;
        default:
          compareValue = 0;
      }

      return direction === 'desc' ? -compareValue : compareValue;
    });

    return sorted;
  }

  /**
   * Natural sort for alphanumeric strings
   * @private
   */
  naturalSort(a, b) {
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  }

  /**
   * Get current filtered cards
   */
  getFiltered() {
    return this.filteredCards;
  }

  /**
   * Get filter statistics
   */
  getStats() {
    const total = this.originalCards.length;
    const filtered = this.filteredCards.length;
    const collected = this.originalCards.filter(c => c.g).length;
    const reverseHolo = this.originalCards.filter(c => c.rh).length;
    const missing = this.originalCards.filter(c => !c.g).length;
    const withCardmarket = this.originalCards.filter(c => c.cardmarketLink).length;

    return {
      total,
      filtered,
      collected,
      reverseHolo,
      missing,
      withCardmarket,
      completionPercent: total > 0 ? Math.round((collected / total) * 100) : 0
    };
  }

  /**
   * Get active filter summary for UI display
   */
  getActiveSummary() {
    const parts = [];

    if (this.searchTerm) {
      parts.push(`Suche: "${this.searchTerm}"`);
    }

    if (this.filters.collectionStatus !== 'all') {
      const statusMap = {
        collected: 'Gesammelt',
        reverseHolo: 'Reverse Holo',
        missing: 'Fehlend'
      };
      parts.push(`Status: ${statusMap[this.filters.collectionStatus]}`);
    }

    if (this.filters.collected !== null) {
      parts.push(`Normal: ${this.filters.collected ? 'Ja' : 'Nein'}`);
    }

    if (this.filters.reverseHolo !== null) {
      parts.push(`RH: ${this.filters.reverseHolo ? 'Ja' : 'Nein'}`);
    }

    if (this.filters.cardmarketAvailable !== null) {
      parts.push(`CM-Link: ${this.filters.cardmarketAvailable ? 'Vorhanden' : 'Fehlt'}`);
    }

    return parts.length > 0 ? parts.join(' | ') : 'Keine Filter aktiv';
  }
}

/**
 * Global filter instance
 */
let globalFilter = null;

export function initializeGlobalFilter(cards) {
  globalFilter = new CardFilter(cards);
  return globalFilter;
}

export function getGlobalFilter() {
  if (!globalFilter) {
    globalFilter = new CardFilter();
  }
  return globalFilter;
}
