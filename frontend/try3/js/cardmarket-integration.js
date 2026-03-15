/**
 * Cardmarket Integration Module
 * Fetches and caches Pokémon card prices from Cardmarket
 * 
 * Rate Limiting: 10 requests/min for free tier
 * Cache: 24 hours
 */

class CardmarketIntegration {
  constructor() {
    this.baseURL = 'https://api.cardmarket.com/v2/products';
    this.cache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
    this.requestQueue = [];
    this.isProcessing = false;
    this.requestTimestamps = [];
    this.rateLimitPerMinute = 10;
    this.priceCache = this.loadPriceCache();
  }

  /**
   * Load price cache from localStorage
   */
  loadPriceCache() {
    try {
      const cached = localStorage.getItem('cardmarket_price_cache');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.warn('Failed to load price cache:', e);
    }
    return {};
  }

  /**
   * Save price cache to localStorage
   */
  savePriceCache() {
    try {
      localStorage.setItem('cardmarket_price_cache', JSON.stringify(this.priceCache));
    } catch (e) {
      console.warn('Failed to save price cache:', e);
    }
  }

  /**
   * Generate Cardmarket product ID from card data
   * Format: SetID + CardNumber (e.g., "bw1-12" → "bw112")
   */
  generateProductId(card) {
    if (!card.id) return null;
    const parts = card.id.split('-');
    if (parts.length < 2) return null;
    return `${parts[0]}${parts[1]}`;
  }

  /**
   * Get price for single card
   */
  async getPrice(card) {
    if (!card) return null;

    const cacheKey = card.id;
    
    // Check in-memory cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.data;
      }
      this.cache.delete(cacheKey);
    }

    // Check localStorage cache
    if (this.priceCache[cacheKey]) {
      const cached = this.priceCache[cacheKey];
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        this.cache.set(cacheKey, cached);
        return cached.data;
      }
      delete this.priceCache[cacheKey];
    }

    // Queue for API request
    return new Promise((resolve) => {
      this.requestQueue.push({ card, resolve });
      this.processQueue();
    });
  }

  /**
   * Process request queue with rate limiting
   */
  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) return;
    
    this.isProcessing = true;

    while (this.requestQueue.length > 0) {
      // Rate limiting: 10 requests per minute
      const now = Date.now();
      this.requestTimestamps = this.requestTimestamps.filter(ts => now - ts < 60000);
      
      if (this.requestTimestamps.length >= this.rateLimitPerMinute) {
        // Wait before processing next request
        const oldestRequest = this.requestTimestamps[0];
        const waitTime = 60000 - (now - oldestRequest);
        await this.sleep(waitTime);
        continue;
      }

      const { card, resolve } = this.requestQueue.shift();
      this.requestTimestamps.push(Date.now());

      try {
        const priceData = await this.fetchPriceFromAPI(card);
        
        // Cache the result
        const cacheData = {
          data: priceData,
          timestamp: Date.now()
        };
        this.cache.set(card.id, cacheData);
        this.priceCache[card.id] = cacheData;
        this.savePriceCache();

        resolve(priceData);
      } catch (error) {
        console.error(`Failed to fetch price for ${card.id}:`, error);
        resolve(this.getDefaultPriceData());
      }

      // Small delay between requests
      if (this.requestQueue.length > 0) {
        await this.sleep(100);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Fetch price from Cardmarket API
   * Uses mock data for development (API requires authentication)
   */
  async fetchPriceFromAPI(card) {
    try {
      // In production, would use real Cardmarket API
      // For now, return mock data
      return this.getMockPriceData(card);
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }

  /**
   * Get mock price data for development
   */
  getMockPriceData(card) {
    // Generate realistic price based on card properties
    const basePrice = 0.50;
    const rarityMultiplier = this.getRarityMultiplier(card.rarity || 'common');
    const ageMultiplier = this.getAgeMultiplier(card.set);
    
    const averagePrice = basePrice * rarityMultiplier * ageMultiplier;
    const trend = (Math.random() - 0.5) * 0.3; // Random trend ±15%

    return {
      id: card.id,
      product_id: this.generateProductId(card),
      name: card.name,
      price_low: parseFloat((averagePrice * 0.8).toFixed(2)),
      price_avg: parseFloat((averagePrice * (1 + trend)).toFixed(2)),
      price_high: parseFloat((averagePrice * 1.5).toFixed(2)),
      trend: trend > 0 ? 'up' : trend < 0 ? 'down' : 'stable',
      available: Math.floor(Math.random() * 100),
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Get rarity price multiplier
   */
  getRarityMultiplier(rarity) {
    const multipliers = {
      'common': 1.0,
      'uncommon': 1.2,
      'rare': 1.8,
      'holo-rare': 2.5,
      'ex': 4.0,
      'ex-full-art': 5.0,
      'secret-rare': 3.0,
      'rainbow-rare': 6.0,
      'v': 3.5,
      'vmax': 5.0,
      'vstar': 4.5
    };
    return multipliers[rarity?.toLowerCase()] || 1.0;
  }

  /**
   * Get age-based price multiplier (older sets are more expensive)
   */
  getAgeMultiplier(setId) {
    // Base sets and early expansions worth more
    const baseSetMultipliers = {
      'base1': 3.0, 'base2': 2.8, 'base3': 2.5, 'base4': 2.0, 'base5': 1.8, 'base6': 1.5,
      'col1': 2.5, 'dc1': 2.8,
      'ecard1': 2.2, 'ecard2': 2.0, 'ecard3': 1.8,
      'ex1': 1.5, 'ex2': 1.4, 'ex3': 1.3,
      'dp1': 1.2, 'dp2': 1.15, 'dp3': 1.1,
      'bw1': 1.0, 'bw2': 0.95, 'bw3': 0.9,
      'xy1': 0.9, 'xy2': 0.85, 'xy3': 0.8
    };
    return baseSetMultipliers[setId?.toLowerCase()] || 0.8;
  }

  /**
   * Get default empty price data
   */
  getDefaultPriceData() {
    return {
      price_low: null,
      price_avg: null,
      price_high: null,
      trend: 'unknown',
      available: null,
      error: true
    };
  }

  /**
   * Get prices for multiple cards
   */
  async getPrices(cards) {
    return Promise.all(cards.map(card => this.getPrice(card)));
  }

  /**
   * Calculate total collection value
   */
  async calculateCollectionValue(cards) {
    const prices = await this.getPrices(cards);
    
    const result = {
      total_avg: 0,
      total_low: 0,
      total_high: 0,
      collected_avg: 0,
      collected_low: 0,
      collected_high: 0,
      missing_avg: 0,
      missing_low: 0,
      missing_high: 0,
      byRarity: {}
    };

    cards.forEach((card, idx) => {
      const price = prices[idx];
      if (!price || price.error) return;

      const isCollected = card.collected || card.reverseHolo;
      const avg = price.price_avg || 0;
      const low = price.price_low || 0;
      const high = price.price_high || 0;

      // Total
      result.total_avg += avg;
      result.total_low += low;
      result.total_high += high;

      // Collected/Missing
      if (isCollected) {
        result.collected_avg += avg;
        result.collected_low += low;
        result.collected_high += high;
      } else {
        result.missing_avg += avg;
        result.missing_low += low;
        result.missing_high += high;
      }

      // By rarity
      const rarity = card.rarity || 'unknown';
      if (!result.byRarity[rarity]) {
        result.byRarity[rarity] = { count: 0, value: 0 };
      }
      result.byRarity[rarity].count++;
      result.byRarity[rarity].value += avg;
    });

    // Round to 2 decimals
    Object.keys(result).forEach(key => {
      if (typeof result[key] === 'number') {
        result[key] = parseFloat(result[key].toFixed(2));
      }
    });

    return result;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.priceCache = {};
    localStorage.removeItem('cardmarket_price_cache');
  }

  /**
   * Export cache stats
   */
  getCacheStats() {
    return {
      cached_items: Object.keys(this.priceCache).length,
      total_cache_size: new Blob([JSON.stringify(this.priceCache)]).size,
      oldest_entry: this.getOldestCacheEntry(),
      newest_entry: this.getNewestCacheEntry()
    };
  }

  /**
   * Get oldest cache entry timestamp
   */
  getOldestCacheEntry() {
    let oldest = Infinity;
    Object.values(this.priceCache).forEach(item => {
      if (item.timestamp < oldest) {
        oldest = item.timestamp;
      }
    });
    return oldest === Infinity ? null : new Date(oldest).toISOString();
  }

  /**
   * Get newest cache entry timestamp
   */
  getNewestCacheEntry() {
    let newest = 0;
    Object.values(this.priceCache).forEach(item => {
      if (item.timestamp > newest) {
        newest = item.timestamp;
      }
    });
    return newest === 0 ? null : new Date(newest).toISOString();
  }
}

// Global singleton
let globalCardmarket = null;

/**
 * Initialize global Cardmarket integration
 */
function initializeCardmarket() {
  if (!globalCardmarket) {
    globalCardmarket = new CardmarketIntegration();
  }
  return globalCardmarket;
}

/**
 * Get global Cardmarket instance
 */
function getGlobalCardmarket() {
  if (!globalCardmarket) {
    globalCardmarket = new CardmarketIntegration();
  }
  return globalCardmarket;
}

export { CardmarketIntegration, initializeCardmarket, getGlobalCardmarket };
