// lib/database/DatabaseInterface.js
// Database interface definition for D1/SQLite compatibility

/**
 * Database Interface - Abstract base class for database operations
 * Provides a consistent API for both Cloudflare D1 and SQLite implementations
 */
export class DatabaseInterface {
  /**
   * Get stock by symbol
   * @param {string} symbol - Stock symbol (e.g., 'AAPL')
   * @returns {Promise<Object|null>} Stock object or null if not found
   */
  async getStock(symbol) {
    throw new Error('getStock method must be implemented');
  }

  /**
   * Create new stock record
   * @param {Object} stock - Stock data
   * @param {string} stock.symbol - Stock symbol
   * @param {string} stock.name - Company name
   * @param {string} stock.currency - Currency (e.g., 'USD', 'CAD')
   * @param {string} stock.exchange - Exchange (e.g., 'NASDAQ', 'NYSE')
   * @param {string} [stock.isin] - ISIN code
   * @returns {Promise<void>}
   */
  async createStock(stock) {
    throw new Error('createStock method must be implemented');
  }

  /**
   * Update stock record
   * @param {string} symbol - Stock symbol
   * @param {Object} updates - Fields to update
   * @returns {Promise<void>}
   */
  async updateStock(symbol, updates) {
    throw new Error('updateStock method must be implemented');
  }

  /**
   * Get OHLCV data for a date range
   * @param {string} symbol - Stock symbol
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Array of OHLCV records
   */
  async getOHLCV(symbol, startDate, endDate) {
    throw new Error('getOHLCV method must be implemented');
  }

  /**
   * Save OHLCV data
   * @param {string} symbol - Stock symbol
   * @param {Array} data - OHLCV data array
   * @returns {Promise<void>}
   */
  async saveOHLCV(symbol, data) {
    throw new Error('saveOHLCV method must be implemented');
  }

  /**
   * Get fundamentals for a stock
   * @param {string} symbol - Stock symbol
   * @param {string} [type] - Specific metric type (optional)
   * @returns {Promise<Array>} Array of fundamental records
   */
  async getFundamentals(symbol, type) {
    throw new Error('getFundamentals method must be implemented');
  }

  /**
   * Save fundamentals data
   * @param {string} symbol - Stock symbol
   * @param {Array} data - Fundamentals data array
   * @returns {Promise<void>}
   */
  async saveFundamentals(symbol, data) {
    throw new Error('saveFundamentals method must be implemented');
  }

  /**
   * Get technical indicators
   * @param {string} symbol - Stock symbol
   * @param {string} [type] - Indicator type (e.g., 'RSI', 'SMA50')
   * @param {Date} [startDate] - Start date for filtering
   * @returns {Promise<Array>} Array of indicator records
   */
  async getIndicators(symbol, type, startDate) {
    throw new Error('getIndicators method must be implemented');
  }

  /**
   * Save technical indicators
   * @param {string} symbol - Stock symbol
   * @param {Array} data - Indicator data array
   * @returns {Promise<void>}
   */
  async saveIndicators(symbol, data) {
    throw new Error('saveIndicators method must be implemented');
  }

  /**
   * Get currency exchange rate
   * @param {string} from - From currency (e.g., 'CAD')
   * @param {string} to - To currency (e.g., 'USD')
   * @returns {Promise<number|null>} Exchange rate or null if not found
   */
  async getCurrencyRate(from, to) {
    throw new Error('getCurrencyRate method must be implemented');
  }

  /**
   * Save currency exchange rate
   * @param {string} from - From currency
   * @param {string} to - To currency
   * @param {number} rate - Exchange rate
   * @param {Date} expiresAt - When the rate expires
   * @returns {Promise<void>}
   */
  async saveCurrencyRate(from, to, rate, expiresAt) {
    throw new Error('saveCurrencyRate method must be implemented');
  }

  /**
   * Check if cache key is still valid
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if valid, false if expired
   */
  async isCacheValid(key) {
    throw new Error('isCacheValid method must be implemented');
  }

  /**
   * Update cache metadata
   * @param {string} key - Cache key
   * @param {string} dataType - Type of data (e.g., 'OHLCV', 'FUNDAMENTALS')
   * @param {number} ttlMinutes - TTL in minutes
   * @returns {Promise<void>}
   */
  async updateCacheMetadata(key, dataType, ttlMinutes) {
    throw new Error('updateCacheMetadata method must be implemented');
  }

  /**
   * Clean up expired cache entries
   * @returns {Promise<number>} Number of entries cleaned up
   */
  async cleanupExpiredCache() {
    throw new Error('cleanupExpiredCache method must be implemented');
  }

  /**
   * Get database health status
   * @returns {Promise<Object>} Health status object
   */
  async getHealthStatus() {
    throw new Error('getHealthStatus method must be implemented');
  }

  /**
   * Get last OHLCV record for a symbol
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Object|null>} Last OHLCV record or null
   */
  async getLastOHLCVRecord(symbol) {
    throw new Error('getLastOHLCVRecord method must be implemented');
  }

  /**
   * Get populated stock count
   * @returns {Promise<number>} Number of stocks with data
   */
  async getPopulatedStockCount() {
    throw new Error('getPopulatedStockCount method must be implemented');
  }

  /**
   * Get missing stocks (without sufficient data)
   * @returns {Promise<Array>} Array of missing stock symbols
   */
  async getMissingStocks() {
    throw new Error('getMissingStocks method must be implemented');
  }

  /**
   * Get data freshness metrics
   * @returns {Promise<Object>} Freshness metrics
   */
  async getDataFreshness() {
    throw new Error('getDataFreshness method must be implemented');
  }

  /**
   * Get data quality metrics
   * @returns {Promise<Object>} Quality metrics
   */
  async getDataQuality() {
    throw new Error('getDataQuality method must be implemented');
  }

  /**
   * Get cache performance metrics
   * @returns {Promise<Object>} Cache performance metrics
   */
  async getCachePerformance() {
    throw new Error('getCachePerformance method must be implemented');
  }
}

// Export individual method signatures for TypeScript-style documentation
export const DatabaseMethods = {
  getStock: '(symbol: string) => Promise<Object|null>',
  createStock: '(stock: {symbol, name, currency, exchange, isin?}) => Promise<void>',
  updateStock: '(symbol: string, updates: Object) => Promise<void>',
  getOHLCV: '(symbol: string, startDate: Date, endDate: Date) => Promise<Array>',
  saveOHLCV: '(symbol: string, data: Array) => Promise<void>',
  getFundamentals: '(symbol: string, type?: string) => Promise<Array>',
  saveFundamentals: '(symbol: string, data: Array) => Promise<void>',
  getIndicators: '(symbol: string, type?: string, startDate?: Date) => Promise<Array>',
  saveIndicators: '(symbol: string, data: Array) => Promise<void>',
  getCurrencyRate: '(from: string, to: string) => Promise<number|null>',
  saveCurrencyRate: '(from: string, to: string, rate: number, expiresAt: Date) => Promise<void>',
  isCacheValid: '(key: string) => Promise<boolean>',
  updateCacheMetadata: '(key: string, dataType: string, ttlMinutes: number) => Promise<void>',
  cleanupExpiredCache: '() => Promise<number>',
  getHealthStatus: '() => Promise<Object>',
  getLastOHLCVRecord: '(symbol: string) => Promise<Object|null>',
  getPopulatedStockCount: '() => Promise<number>',
  getMissingStocks: '() => Promise<Array>',
  getDataFreshness: '() => Promise<Object>',
  getDataQuality: '() => Promise<Object>',
  getCachePerformance: '() => Promise<Object>'
};