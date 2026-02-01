/**
 * Card Model
 */
export class Card {
  constructor(data) {
    this.id = data.id;
    this.number = data.number;
    this.name = data.name;
    this.imageUrl = data.imageUrl;
    this.collected = data.collected || false;
    this.reverseHolo = data.reverseHolo || false;
    this.row = data.row;
    this.colNormal = data.colNormal;
    this.colReverseHolo = data.colReverseHolo;
  }

  /**
   * Check if card is fully collected
   */
  isFullyCollected() {
    return this.collected && this.reverseHolo;
  }

  /**
   * Check if card is partially collected
   */
  isPartiallyCollected() {
    return this.collected || this.reverseHolo;
  }
}

/**
 * Set Model
 */
export class Set {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.series = data.series;
    this.total = data.total;
    this.releaseDate = data.releaseDate;
    this.sheetName = data.sheetName;
    this.cards = [];
  }

  /**
   * Add card to set
   */
  addCard(card) {
    this.cards.push(card);
  }

  /**
   * Get collection progress
   */
  getProgress() {
    const collected = this.cards.filter(c => c.collected).length;
    const reverseHolo = this.cards.filter(c => c.reverseHolo).length;
    const total = this.cards.length;
    
    return {
      collected,
      reverseHolo,
      total,
      percentage: total > 0 ? Math.round((collected / total) * 100) : 0,
      reversePercentage: total > 0 ? Math.round((reverseHolo / total) * 100) : 0,
    };
  }

  /**
   * Get missing cards
   */
  getMissingCards() {
    return this.cards.filter(c => !c.collected);
  }

  /**
   * Get missing reverse holos
   */
  getMissingReverseHolos() {
    return this.cards.filter(c => !c.reverseHolo);
  }
}
