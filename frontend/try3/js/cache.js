import { CONFIG } from '../config/config.js';

/**
 * Cache Manager
 */
class CacheManager {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Set cache entry
   */
  set(key, value, duration = CONFIG.CACHE_DURATION) {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      duration
    });
    console.log(`Cache set: ${key}`);
  }

  /**
   * Get cache entry (returns null if expired or not found)
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() - item.timestamp > item.duration) {
      this.cache.delete(key);
      console.log(`Cache expired: ${key}`);
      return null;
    }

    console.log(`Cache hit: ${key}`);
    return item.value;
  }

  /**
   * Check if cache has valid entry
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Clear cache entry or all cache
   */
  clear(key) {
    if (key) {
      this.cache.delete(key);
      console.log(`Cache cleared: ${key}`);
    } else {
      this.cache.clear();
      console.log('Cache cleared: all');
    }
  }

  /**
   * Clear all expired entries
   */
  clearExpired() {
    const now = Date.now();
    let clearedCount = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.duration) {
        this.cache.delete(key);
        clearedCount++;
      }
    }
    
    if (clearedCount > 0) {
      console.log(`Cleared ${clearedCount} expired cache entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

export const cache = new CacheManager();

// Clear expired cache every 5 minutes
setInterval(() => cache.clearExpired(), 5 * 60 * 1000);
