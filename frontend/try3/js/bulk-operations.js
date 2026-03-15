/**
 * Bulk Operations Module
 * Handle select all, deselect all, invert selection, and other bulk operations
 */

export class BulkOperations {
  constructor(cardsContainer = null) {
    this.cardsContainer = cardsContainer;
    this.selectedCardIds = new Set();
  }

  /**
   * Select all cards currently displayed
   * @param {Array} cards - Cards to select
   */
  selectAll(cards) {
    this.selectedCardIds.clear();
    cards.forEach(card => {
      this.selectedCardIds.add(card.id);
    });
    this.updateUI();
    return this.selectedCardIds.size;
  }

  /**
   * Deselect all cards
   */
  deselectAll() {
    this.selectedCardIds.clear();
    this.updateUI();
    return 0;
  }

  /**
   * Invert selection (select unchecked, uncheck selected)
   * @param {Array} cards - All available cards
   */
  invertSelection(cards) {
    cards.forEach(card => {
      if (this.selectedCardIds.has(card.id)) {
        this.selectedCardIds.delete(card.id);
      } else {
        this.selectedCardIds.add(card.id);
      }
    });
    this.updateUI();
    return this.selectedCardIds.size;
  }

  /**
   * Toggle a single card selection
   * @param {string} cardId - Card ID to toggle
   */
  toggle(cardId) {
    if (this.selectedCardIds.has(cardId)) {
      this.selectedCardIds.delete(cardId);
    } else {
      this.selectedCardIds.add(cardId);
    }
    this.updateUI();
    return this.selectedCardIds.has(cardId);
  }

  /**
   * Select only cards with specific status
   * @param {Array} cards - Cards to filter
   * @param {string} type - 'collected', 'uncollected', 'reverseHolo', 'missing'
   */
  selectByStatus(cards, type) {
    this.selectedCardIds.clear();
    
    cards.forEach(card => {
      let shouldSelect = false;
      
      switch (type) {
        case 'collected':
          shouldSelect = card.g === true;
          break;
        case 'uncollected':
          shouldSelect = card.g === false;
          break;
        case 'reverseHolo':
          shouldSelect = card.rh === true;
          break;
        case 'missing':
          shouldSelect = card.g === false && card.rh === false;
          break;
      }
      
      if (shouldSelect) {
        this.selectedCardIds.add(card.id);
      }
    });
    
    this.updateUI();
    return this.selectedCardIds.size;
  }

  /**
   * Check multiple cards as collected (Normal)
   * @param {Object} cardData - Object to update with checkbox status
   * @param {Array} cardIds - IDs of cards to update
   * @param {boolean} collected - Set collected status
   */
  bulkCheckCollected(cardData, cardIds, collected = true) {
    let updatedCount = 0;
    
    cardIds.forEach(cardId => {
      if (cardData[cardId]) {
        cardData[cardId].g = collected;
        updatedCount++;
      }
    });
    
    return updatedCount;
  }

  /**
   * Check multiple cards as reverse holo
   * @param {Object} cardData - Object to update with checkbox status
   * @param {Array} cardIds - IDs of cards to update
   * @param {boolean} reverseHolo - Set reverse holo status
   */
  bulkCheckReverseHolo(cardData, cardIds, reverseHolo = true) {
    let updatedCount = 0;
    
    cardIds.forEach(cardId => {
      if (cardData[cardId]) {
        // RH can only be set if normal is already collected
        if (cardData[cardId].g) {
          cardData[cardId].rh = reverseHolo;
          updatedCount++;
        }
      }
    });
    
    return updatedCount;
  }

  /**
   * Copy checkbox status from one card to multiple cards
   * @param {Object} cardData - Card data object
   * @param {string} sourceCardId - Source card to copy from
   * @param {Array} targetCardIds - Target cards to copy to
   * @param {string} type - 'normal' or 'reverseHolo'
   */
  copyCheckboxStatus(cardData, sourceCardId, targetCardIds, type = 'normal') {
    if (!cardData[sourceCardId]) {
      return 0;
    }

    const sourceStatus = type === 'normal' ? cardData[sourceCardId].g : cardData[sourceCardId].rh;
    let copiedCount = 0;

    targetCardIds.forEach(cardId => {
      if (cardData[cardId]) {
        if (type === 'normal') {
          cardData[cardId].g = sourceStatus;
        } else if (type === 'reverseHolo' && cardData[cardId].g) {
          cardData[cardId].rh = sourceStatus;
        }
        copiedCount++;
      }
    });

    return copiedCount;
  }

  /**
   * Get selected card IDs
   */
  getSelected() {
    return Array.from(this.selectedCardIds);
  }

  /**
   * Get selection count
   */
  getCount() {
    return this.selectedCardIds.size;
  }

  /**
   * Check if card is selected
   */
  isSelected(cardId) {
    return this.selectedCardIds.has(cardId);
  }

  /**
   * Clear selection
   */
  clear() {
    this.selectedCardIds.clear();
    this.updateUI();
  }

  /**
   * Update UI to reflect selection
   * @private
   */
  updateUI() {
    if (!this.cardsContainer) return;

    const cards = this.cardsContainer.querySelectorAll('[data-card-id]');
    cards.forEach(card => {
      const cardId = card.getAttribute('data-card-id');
      if (this.selectedCardIds.has(cardId)) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });
  }

  /**
   * Get bulk action menu items
   */
  getMenuItems() {
    return [
      { id: 'selectAll', label: '✅ Alle wählen', action: 'selectAll' },
      { id: 'deselectAll', label: '❌ Alle abwählen', action: 'deselectAll' },
      { id: 'invertSelection', label: '🔄 Auswahl invertieren', action: 'invertSelection' },
      { separator: true },
      { id: 'selectCollected', label: '📦 Nur gesammelte', action: 'selectCollected' },
      { id: 'selectUncollected', label: '📍 Nur fehlende', action: 'selectUncollected' },
      { id: 'selectReverseHolo', label: '✨ Nur RH', action: 'selectReverseHolo' },
      { separator: true },
      { id: 'checkSelected', label: '☑️ Gewählte als gesammelt', action: 'checkSelected' },
      { id: 'uncheckSelected', label: '☐ Gewählte als fehlend', action: 'uncheckSelected' },
      { id: 'markRH', label: '✨ Gewählte als RH', action: 'markRH' }
    ];
  }
}

/**
 * Global bulk operations instance
 */
let globalBulkOps = null;

export function initializeBulkOperations(container = null) {
  globalBulkOps = new BulkOperations(container);
  return globalBulkOps;
}

export function getGlobalBulkOps() {
  if (!globalBulkOps) {
    globalBulkOps = new BulkOperations();
  }
  return globalBulkOps;
}
