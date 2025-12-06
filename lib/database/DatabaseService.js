// lib/database/DatabaseService.js
// Database service factory and wrapper

import { D1Database } from './D1Database.js';
import { SQLiteDatabase } from './SQLiteDatabase.js';
import winston from 'winston';

/**
 * Database Service Factory
 * Automatically detects environment and creates appropriate database instance
 */
export class DatabaseService {
  constructor(dbBinding = null, environment = null) {
    this.db = null;
    this.environment = environment || process.env.ENVIRONMENT || 'development';
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'database-service' }
    });

    this.initializeDatabase(dbBinding);
  }

  /**
   * Initialize the appropriate database based on environment
   * @param {Object|null} dbBinding - D1 binding (for Cloudflare Workers)
   */
  initializeDatabase(dbBinding) {
    if (this.environment === 'production' || dbBinding) {
      // Production environment with D1
      this.db = new D1Database(dbBinding);
      this.logger.info('Initialized D1 database for production');
    } else {
      // Development environment with SQLite
      try {
        this.db = new SQLiteDatabase();
        this.logger.info('Initialized SQLite database for development');
      } catch (error) {
        this.logger.error('Failed to initialize SQLite database', { error: error.message });
        throw error;
      }
    }
  }

  /**
   * Get the underlying database instance
   * @returns {DatabaseInterface} Database instance
   */
  getDatabase() {
    return this.db;
  }

  /**
   * Check if running in production environment
   * @returns {boolean} True if production
   */
  isProduction() {
    return this.environment === 'production';
  }

  /**
   * Check if running in development environment
   * @returns {boolean} True if development
   */
  isDevelopment() {
    return this.environment === 'development';
  }

  // Delegate all database methods to the underlying implementation
  async getStock(symbol) {
    return this.db.getStock(symbol);
  }

  async createStock(stock) {
    return this.db.createStock(stock);
  }

  async updateStock(symbol, updates) {
    return this.db.updateStock(symbol, updates);
  }

  async getOHLCV(symbol, startDate, endDate) {
    return this.db.getOHLCV(symbol, startDate, endDate);
  }

  async saveOHLCV(symbol, data) {
    return this.db.saveOHLCV(symbol, data);
  }

  async getFundamentals(symbol, type) {
    return this.db.getFundamentals(symbol, type);
  }

  async saveFundamentals(symbol, data) {
    return this.db.saveFundamentals(symbol, data);
  }

  async getIndicators(symbol, type, startDate) {
    return this.db.getIndicators(symbol, type, startDate);
  }

  async saveIndicators(symbol, data) {
    return this.db.saveIndicators(symbol, data);
  }

  async getCurrencyRate(from, to) {
    return this.db.getCurrencyRate(from, to);
  }

  async saveCurrencyRate(from, to, rate, expiresAt) {
    return this.db.saveCurrencyRate(from, to, rate, expiresAt);
  }

  async isCacheValid(key) {
    return this.db.isCacheValid(key);
  }

  async updateCacheMetadata(key, dataType, ttlMinutes) {
    return this.db.updateCacheMetadata(key, dataType, ttlMinutes);
  }

  async cleanupExpiredCache() {
    return this.db.cleanupExpiredCache();
  }

  async getHealthStatus() {
    return this.db.getHealthStatus();
  }

  async getLastOHLCVRecord(symbol) {
    return this.db.getLastOHLCVRecord(symbol);
  }

  async getPopulatedStockCount() {
    return this.db.getPopulatedStockCount();
  }

  async getMissingStocks() {
    return this.db.getMissingStocks();
  }

  async getDataFreshness() {
    return this.db.getDataFreshness();
  }

  async getDataQuality() {
    return this.db.getDataQuality();
  }

  async getCachePerformance() {
    return this.db.getCachePerformance();
  }

  /**
   * Enhanced method: Get or create stock with metadata
   * @param {string} symbol - Stock symbol
   * @param {Object} metadata - Additional stock metadata
   * @returns {Promise<Object>} Stock object
   */
  async getOrCreateStock(symbol, metadata = {}) {
    let stock = await this.getStock(symbol);
    if (!stock) {
      stock = await this.createStock({
        symbol,
        name: metadata.name,
        currency: metadata.currency || 'USD',
        exchange: metadata.exchange,
        isin: metadata.isin
      });
    }
    return stock;
  }

  /**
   * Enhanced method: Get OHLCV with caching layer
   * @param {string} symbol - Stock symbol
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {number} ttlMinutes - TTL in minutes for cache
   * @returns {Promise<Array|null>} OHLCV data or null
   */
  async getOHLCVWithCache(symbol, startDate, endDate, ttlMinutes = 15) {
    const cacheKey = `ohlcv:${symbol}:${startDate.toISOString()}:${endDate.toISOString()}`;
    
    // Check cache first
    const isCached = await this.isCacheValid(cacheKey);
    if (isCached) {
      // For now, we'll re-fetch from database since we don't have a separate cache layer
      // In a full implementation, this would check Redis or in-memory cache
      this.logger.debug(`Cache hit for ${cacheKey}`);
    }
    
    const dbData = await this.getOHLCV(symbol, startDate, endDate);
    if (dbData.length > 0) {
      await this.updateCacheMetadata(cacheKey, 'OHLCV', ttlMinutes);
      return dbData;
    }

    return null;
  }

  /**
   * Enhanced method: Get indicators with caching
   * @param {string} symbol - Stock symbol
   * @param {Array} indicatorTypes - Array of indicator types
   * @param {Date} date - Date for filtering
   * @param {number} ttlMinutes - TTL in minutes
   * @returns {Promise<Array|null>} Indicators data or null
   */
  async getIndicatorsWithCache(symbol, indicatorTypes, date, ttlMinutes = 60) {
    const cacheKey = `indicators:${symbol}:${date.toISOString()}:${indicatorTypes.join(',')}`;
    
    const isCached = await this.isCacheValid(cacheKey);
    if (isCached) {
      this.logger.debug(`Cache hit for ${cacheKey}`);
    }

    const indicators = await this.getIndicators(symbol, null, date);
    if (indicators.length > 0) {
      await this.updateCacheMetadata(cacheKey, 'INDICATORS', ttlMinutes);
      return indicators;
    }

    return null;
  }

  /**
   * Enhanced method: Batch get indicators for multiple symbols
   * @param {Array} symbols - Array of stock symbols
   * @param {Array} indicatorTypes - Array of indicator types
   * @param {Date} date - Date for filtering
   * @returns {Promise<Object>} Object with symbol as key and indicators as value
   */
  async getBatchIndicators(symbols, indicatorTypes, date) {
    const results = {};
    
    for (const symbol of symbols) {
      try {
        const indicators = await this.getIndicatorsWithCache(symbol, indicatorTypes, date, 60);
        if (indicators) {
          results[symbol] = indicators;
        }
      } catch (error) {
        this.logger.error(`Error getting indicators for ${symbol}`, { error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Enhanced method: Save multiple OHLCV records efficiently
   * @param {string} symbol - Stock symbol
   * @param {Array} data - Array of OHLCV records
   * @returns {Promise<void>}
   */
  async saveOHLCVBatch(symbol, data) {
    if (!data || data.length === 0) return;

    // Validate data
    const validatedData = data.filter(record => 
      record.date && 
      record.open != null && 
      record.high != null && 
      record.low != null && 
      record.close != null && 
      record.volume != null
    );

    if (validatedData.length === 0) {
      this.logger.warn(`No valid OHLCV data for ${symbol}`);
      return;
    }

    await this.saveOHLCV(symbol, validatedData);
    this.logger.debug(`Saved ${validatedData.length} OHLCV records for ${symbol}`);
  }

  /**
   * Enhanced method: Get comprehensive stock analysis data
   * @param {string} symbol - Stock symbol
   * @param {Date} startDate - Start date for historical data
   * @param {Date} endDate - End date for historical data
   * @returns {Promise<Object>} Comprehensive stock data
   */
  async getStockAnalysisData(symbol, startDate, endDate) {
    const [stock, ohlcv, indicators, fundamentals] = await Promise.all([
      this.getStock(symbol),
      this.getOHLCV(symbol, startDate, endDate),
      this.getIndicators(symbol, null, startDate),
      this.getFundamentals(symbol)
    ]);

    return {
      stock,
      ohlcv,
      indicators,
      fundamentals,
      metadata: {
        symbol,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        retrievedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Health check with detailed diagnostics
   * @returns {Promise<Object>} Detailed health report
   */
  async getHealthReport() {
    const health = await this.getHealthStatus();
    
    if (!health.healthy) {
      return health;
    }

    const [freshness, quality, cachePerf, populatedCount, missingStocks] = await Promise.all([
      this.getDataFreshness(),
      this.getDataQuality(),
      this.getCachePerformance(),
      this.getPopulatedStockCount(),
      this.getMissingStocks()
    ]);

    return {
      ...health,
      detailed: {
        freshness,
        quality,
        cache: cachePerf,
        population: {
          populatedCount,
          missingStocks,
          totalStocks: health.stats.stocks
        }
      }
    };
  }

  /**
   * Cleanup expired data and optimize database
   * @returns {Promise<Object>} Cleanup results
   */
  async performCleanup() {
    const startTime = Date.now();
    
    try {
      const [cacheCleaned, health] = await Promise.all([
        this.cleanupExpiredCache(),
        this.getHealthStatus()
      ]);

      const duration = Date.now() - startTime;

      return {
        success: true,
        duration,
        results: {
          cacheEntriesCleaned: cacheCleaned,
          health
        }
      };
    } catch (error) {
      this.logger.error('Cleanup failed', { error: error.message });
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }
}

// Export factory function for convenience
export function createDatabaseService(dbBinding = null, environment = null) {
  return new DatabaseService(dbBinding, environment);
}