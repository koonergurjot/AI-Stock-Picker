// lib/cache/CacheManager.js
// TTL-based cache manager with multi-layer caching

import winston from 'winston';

export class CacheManager {
  constructor(databaseService, memoryCache = null) {
    this.db = databaseService;
    this.memoryCache = memoryCache || new Map();
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'cache-manager' }
    });

    // Cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      memoryHits: 0,
      dbHits: 0,
      sets: 0,
      evictions: 0
    };

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 60 * 60 * 1000); // Run every hour
  }

  /**
   * Get data from cache (multi-layer)
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} Cached data or null
   */
  async get(key) {
    try {
      // 1. Check memory cache first (fastest)
      if (this.memoryCache.has(key)) {
        const memoryEntry = this.memoryCache.get(key);
        
        if (!this.isExpired(memoryEntry)) {
          this.stats.hits++;
          this.stats.memoryHits++;
          
          this.logger.debug('Memory cache hit', { key });
          return memoryEntry.data;
        } else {
          // Remove expired entry
          this.memoryCache.delete(key);
          this.stats.evictions++;
        }
      }

      // 2. Check database cache
      const isCached = await this.db.isCacheValid(key);
      if (isCached) {
        // For now, we'll mark as DB hit but return null
        // In a full implementation, we'd have a separate cache table
        this.stats.hits++;
        this.stats.dbHits++;
        
        this.logger.debug('Database cache hit', { key });
        return null; // Would return actual cached data
      }

      // Cache miss
      this.stats.misses++;
      this.logger.debug('Cache miss', { key });
      return null;
    } catch (error) {
      this.logger.error('Error getting from cache', { key, error: error.message });
      return null;
    }
  }

  /**
   * Set data in cache with TTL
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   * @param {number} ttlMinutes - TTL in minutes
   * @param {string} dataType - Type of data for metadata
   * @returns {Promise<void>}
   */
  async set(key, data, ttlMinutes = 60, dataType = 'UNKNOWN') {
    try {
      // 1. Set in memory cache
      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
      this.memoryCache.set(key, {
        data,
        expiresAt,
        dataType,
        createdAt: new Date()
      });

      // 2. Set in database cache metadata
      await this.db.updateCacheMetadata(key, dataType, ttlMinutes);

      this.stats.sets++;
      
      this.logger.debug('Cache set', { 
        key, 
        ttlMinutes, 
        dataType,
        memorySize: this.memoryCache.size 
      });
    } catch (error) {
      this.logger.error('Error setting cache', { key, error: error.message });
    }
  }

  /**
   * Check if cache entry is expired
   * @param {Object} entry - Cache entry
   * @returns {boolean} True if expired
   */
  isExpired(entry) {
    const now = new Date();
    return now >= entry.expiresAt;
  }

  /**
   * Delete cache entry
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(key) {
    try {
      // Remove from memory
      const memoryDeleted = this.memoryCache.delete(key);
      
      // Remove from database metadata
      await this.db.getDatabase().executeNonQuery(
        'DELETE FROM cache_metadata WHERE cache_key = ?',
        [key],
        'deleteCacheEntry'
      );

      this.logger.debug('Cache entry deleted', { key });
      return memoryDeleted;
    } catch (error) {
      this.logger.error('Error deleting cache entry', { key, error: error.message });
      return false;
    }
  }

  /**
   * Clear all cache entries
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      // Clear memory cache
      this.memoryCache.clear();
      
      // Clear database cache metadata
      await this.db.getDatabase().executeNonQuery(
        'DELETE FROM cache_metadata',
        [],
        'clearCache'
      );

      this.logger.info('Cache cleared completely');
    } catch (error) {
      this.logger.error('Error clearing cache', { error: error.message });
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

    return {
      ...this.stats,
      hitRate: parseFloat(hitRate.toFixed(2)),
      memorySize: this.memoryCache.size,
      totalRequests
    };
  }

  /**
   * Get memory cache size
   * @returns {number} Number of entries in memory cache
   */
  getMemorySize() {
    return this.memoryCache.size;
  }

  /**
   * Get memory cache usage in bytes (approximate)
   * @returns {number} Approximate memory usage
   */
  getMemoryUsage() {
    try {
      const serialized = JSON.stringify(Array.from(this.memoryCache.entries()));
      return serialized.length * 2; // Rough estimate (UTF-16)
    } catch {
      return 0;
    }
  }

  /**
   * Perform cleanup of expired entries
   * @returns {Promise<void>}
   */
  async performCleanup() {
    try {
      // Clean up memory cache
      const now = new Date();
      let memoryEvictions = 0;
      
      for (const [key, entry] of this.memoryCache.entries()) {
        if (now >= entry.expiresAt) {
          this.memoryCache.delete(key);
          memoryEvictions++;
          this.stats.evictions++;
        }
      }

      // Clean up database cache metadata
      const dbEvictions = await this.db.cleanupExpiredCache();

      this.logger.info('Cache cleanup completed', {
        memoryEvictions,
        dbEvictions,
        remainingMemoryEntries: this.memoryCache.size
      });
    } catch (error) {
      this.logger.error('Error during cache cleanup', { error: error.message });
    }
  }

  /**
   * LRU eviction for memory cache
   * @param {number} maxSize - Maximum number of entries
   * @returns {void}
   */
  evictLRU(maxSize) {
    if (this.memoryCache.size <= maxSize) return;

    const entries = Array.from(this.memoryCache.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    const toDelete = entries.slice(0, this.memoryCache.size - maxSize);
    toDelete.forEach(([key]) => {
      this.memoryCache.delete(key);
      this.stats.evictions++;
    });

    this.logger.debug('LRU eviction completed', {
      evictedCount: toDelete.length,
      remainingCount: this.memoryCache.size
    });
  }

  /**
   * Preload cache with data
   * @param {Object} data - Object with key-value pairs to preload
   * @param {number} ttlMinutes - TTL in minutes
   * @param {string} dataType - Type of data
   * @returns {Promise<void>}
   */
  async preload(data, ttlMinutes = 60, dataType = 'PRELOADED') {
    const keys = Object.keys(data);
    this.logger.info('Preloading cache', { entryCount: keys.length });

    for (const key of keys) {
      await this.set(key, data[key], ttlMinutes, dataType);
    }
  }

  /**
   * Warm cache with frequently accessed data
   * @param {Array} keys - Array of keys to warm
   * @returns {Promise<void>}
   */
  async warmCache(keys) {
    this.logger.info('Warming cache', { keyCount: keys.length });
    
    for (const key of keys) {
      try {
        // Trigger a get to potentially load into memory cache
        await this.get(key);
      } catch (error) {
        this.logger.debug('Warm cache miss', { key, error: error.message });
      }
    }
  }

  /**
   * Get cache entry details
   * @param {string} key - Cache key
   * @returns {Promise<Object|null>} Entry details or null
   */
  async getEntryDetails(key) {
    // Check memory cache
    if (this.memoryCache.has(key)) {
      const entry = this.memoryCache.get(key);
      return {
        source: 'memory',
        key,
        dataType: entry.dataType,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt,
        isExpired: this.isExpired(entry),
        size: JSON.stringify(entry.data).length
      };
    }

    // Check database
    const isCached = await this.db.isCacheValid(key);
    if (isCached) {
      return {
        source: 'database',
        key,
        isExpired: false
      };
    }

    return null;
  }

  /**
   * Set maximum memory cache size with LRU eviction
   * @param {number} maxSize - Maximum number of entries
   * @returns {void}
   */
  setMaxMemorySize(maxSize) {
    this.maxMemorySize = maxSize;
    this.evictLRU(maxSize);
  }

  /**
   * Get cache health status
   * @returns {Object} Health status
   */
  getHealthStatus() {
    const stats = this.getStats();
    const memoryUsage = this.getMemoryUsage();
    const memoryUsageMB = memoryUsage / (1024 * 1024);

    return {
      healthy: stats.hitRate >= 50, // Consider healthy if hit rate >= 50%
      stats,
      memory: {
        size: this.getMemorySize(),
        usageBytes: memoryUsage,
        usageMB: parseFloat(memoryUsageMB.toFixed(2)),
        maxSize: this.maxMemorySize || 'unlimited'
      },
      lastCleanup: new Date().toISOString()
    };
  }

  /**
   * Export cache data for backup
   * @returns {Object} Exported cache data
   */
  exportCache() {
    const exported = {
      timestamp: new Date().toISOString(),
      memoryCache: Array.from(this.memoryCache.entries()).map(([key, entry]) => ({
        key,
        data: entry.data,
        expiresAt: entry.expiresAt.toISOString(),
        dataType: entry.dataType,
        createdAt: entry.createdAt.toISOString()
      })),
      stats: this.stats
    };

    return exported;
  }

  /**
   * Import cache data from backup
   * @param {Object} imported - Imported cache data
   * @returns {void}
   */
  importCache(imported) {
    if (!imported.memoryCache || !Array.isArray(imported.memoryCache)) {
      this.logger.warn('Invalid cache import data');
      return;
    }

    let importedCount = 0;
    const now = new Date();

    for (const entry of imported.memoryCache) {
      try {
        const expiresAt = new Date(entry.expiresAt);
        
        // Only import non-expired entries
        if (now < expiresAt) {
          this.memoryCache.set(entry.key, {
            data: entry.data,
            expiresAt,
            dataType: entry.dataType,
            createdAt: new Date(entry.createdAt)
          });
          importedCount++;
        }
      } catch (error) {
        this.logger.debug('Skipping invalid cache entry during import', { error: error.message });
      }
    }

    if (imported.stats) {
      this.stats = imported.stats;
    }

    this.logger.info('Cache import completed', { importedCount });
  }

  /**
   * Close cache manager and cleanup resources
   * @returns {Promise<void>}
   */
  async close() {
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Clear memory cache
    this.memoryCache.clear();

    this.logger.info('Cache manager closed');
  }
}