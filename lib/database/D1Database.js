// lib/database/D1Database.js
// Cloudflare D1 implementation of DatabaseInterface

import { DatabaseInterface } from './DatabaseInterface.js';
import winston from 'winston';

export class D1Database extends DatabaseInterface {
  constructor(d1Binding) {
    super();
    this.db = d1Binding;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'd1-database' }
    });
  }

  /**
   * Execute a query with error handling and logging
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @param {string} operation - Operation description for logging
   * @returns {Promise} Query result
   */
  async executeQuery(query, params = [], operation = 'query') {
    try {
      this.logger.debug(`Executing ${operation}: ${query}`, { params });
      const result = await this.db.prepare(query).bind(...params).all();
      this.logger.debug(`${operation} completed`, { rowCount: result?.results?.length || 0 });
      return result;
    } catch (error) {
      this.logger.error(`Error executing ${operation}`, { 
        error: error.message, 
        query, 
        params 
      });
      throw error;
    }
  }

  /**
   * Execute a single row query
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @param {string} operation - Operation description
   * @returns {Promise<Object|null>} Single row result
   */
  async executeSingleRow(query, params = [], operation = 'query') {
    const result = await this.executeQuery(query, params, operation);
    return result?.results?.[0] || null;
  }

  /**
   * Execute an insert/update/delete operation
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @param {string} operation - Operation description
   * @returns {Promise} Operation result
   */
  async executeNonQuery(query, params = [], operation = 'operation') {
    try {
      this.logger.debug(`Executing ${operation}: ${query}`, { params });
      const result = await this.db.prepare(query).bind(...params).run();
      this.logger.debug(`${operation} completed`, { success: true });
      return result;
    } catch (error) {
      this.logger.error(`Error executing ${operation}`, { 
        error: error.message, 
        query, 
        params 
      });
      throw error;
    }
  }

  async getStock(symbol) {
    const query = `
      SELECT * FROM stocks 
      WHERE symbol = ? COLLATE NOCASE
    `;
    return this.executeSingleRow(query, [symbol], 'getStock');
  }

  async createStock(stock) {
    const query = `
      INSERT INTO stocks (symbol, name, currency, exchange, isin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(symbol) DO UPDATE SET
        name = excluded.name,
        currency = excluded.currency,
        exchange = excluded.exchange,
        isin = excluded.isin,
        updated_at = CURRENT_TIMESTAMP
    `;
    await this.executeNonQuery(query, [
      stock.symbol,
      stock.name,
      stock.currency || 'USD',
      stock.exchange,
      stock.isin
    ], 'createStock');
  }

  async updateStock(symbol, updates) {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    
    if (fields.length === 0) return;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const query = `
      UPDATE stocks 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE symbol = ? COLLATE NOCASE
    `;
    
    await this.executeNonQuery(query, [...values, symbol], 'updateStock');
  }

  async getOHLCV(symbol, startDate, endDate) {
    const query = `
      SELECT od.* FROM ohlcv_data od
      JOIN stocks s ON od.stock_id = s.id
      WHERE s.symbol = ? COLLATE NOCASE
        AND od.date >= ?
        AND od.date <= ?
      ORDER BY od.date ASC
    `;
    
    const result = await this.executeQuery(query, [
      symbol,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    ], 'getOHLCV');
    
    return result?.results || [];
  }

  async saveOHLCV(symbol, data) {
    if (!data || data.length === 0) return;

    // Get or create stock
    let stock = await this.getStock(symbol);
    if (!stock) {
      throw new Error(`Stock ${symbol} not found in database`);
    }

    // Prepare batch insert
    const values = data.map(record => [
      stock.id,
      record.date.toISOString().split('T')[0],
      record.open,
      record.high,
      record.low,
      record.close,
      record.volume,
      record.adjusted_close || record.close,
      record.split_ratio || 1.0,
      record.dividend || 0.0,
      record.currency || 'USD',
      record.data_source || 'YAHOO'
    ]);

    // Use transaction for better performance
    const insertQuery = `
      INSERT INTO ohlcv_data (
        stock_id, date, open, high, low, close, volume, 
        adjusted_close, split_ratio, dividend, currency, data_source
      ) VALUES 
      ${values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}
      ON CONFLICT(stock_id, date) DO UPDATE SET
        open = excluded.open,
        high = excluded.high,
        low = excluded.low,
        close = excluded.close,
        volume = excluded.volume,
        adjusted_close = excluded.adjusted_close,
        split_ratio = excluded.split_ratio,
        dividend = excluded.dividend,
        currency = excluded.currency,
        data_source = excluded.data_source
    `;

    const params = values.flat();
    await this.executeNonQuery(insertQuery, params, 'saveOHLCV');
  }

  async getFundamentals(symbol, type) {
    const baseQuery = `
      SELECT f.* FROM fundamentals f
      JOIN stocks s ON f.stock_id = s.id
      WHERE s.symbol = ? COLLATE NOCASE
    `;
    
    const query = type 
      ? baseQuery + ' AND f.metric_type = ? ORDER BY f.period_ending DESC'
      : baseQuery + ' ORDER BY f.period_ending DESC, f.metric_type ASC';
    
    const params = type ? [symbol, type] : [symbol];
    
    const result = await this.executeQuery(query, params, 'getFundamentals');
    return result?.results || [];
  }

  async saveFundamentals(symbol, data) {
    if (!data || data.length === 0) return;

    // Get or create stock
    let stock = await this.getStock(symbol);
    if (!stock) {
      throw new Error(`Stock ${symbol} not found in database`);
    }

    // Prepare batch insert
    const values = data.map(record => [
      stock.id,
      record.metric_type,
      record.value,
      record.currency || 'USD',
      record.period_ending,
      record.reported_date,
      record.data_source || 'YAHOO'
    ]);

    const insertQuery = `
      INSERT INTO fundamentals (
        stock_id, metric_type, value, currency, period_ending, reported_date, data_source
      ) VALUES 
      ${values.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ')}
      ON CONFLICT(stock_id, metric_type, period_ending) DO UPDATE SET
        value = excluded.value,
        currency = excluded.currency,
        reported_date = excluded.reported_date,
        data_source = excluded.data_source
    `;

    const params = values.flat();
    await this.executeNonQuery(insertQuery, params, 'saveFundamentals');
  }

  async getIndicators(symbol, type, startDate) {
    const baseQuery = `
      SELECT i.* FROM indicators i
      JOIN stocks s ON i.stock_id = s.id
      WHERE s.symbol = ? COLLATE NOCASE
    `;
    
    let query = baseQuery;
    const params = [symbol];
    
    if (type) {
      query += ' AND i.indicator_type = ?';
      params.push(type);
    }
    
    if (startDate) {
      query += ' AND i.date >= ?';
      params.push(startDate.toISOString().split('T')[0]);
    }
    
    query += ' ORDER BY i.date DESC, i.indicator_type ASC';
    
    const result = await this.executeQuery(query, params, 'getIndicators');
    return result?.results || [];
  }

  async saveIndicators(symbol, data) {
    if (!data || data.length === 0) return;

    // Get or create stock
    let stock = await this.getStock(symbol);
    if (!stock) {
      throw new Error(`Stock ${symbol} not found in database`);
    }

    // Prepare batch insert
    const values = data.map(record => [
      stock.id,
      record.type || record.indicator_type,
      record.value,
      record.date.toISOString().split('T')[0],
      JSON.stringify(record.parameters || {})
    ]);

    const insertQuery = `
      INSERT INTO indicators (
        stock_id, indicator_type, value, date, parameters
      ) VALUES 
      ${values.map(() => '(?, ?, ?, ?, ?)').join(', ')}
      ON CONFLICT(stock_id, indicator_type, date, parameters) DO UPDATE SET
        value = excluded.value
    `;

    const params = values.flat();
    await this.executeNonQuery(insertQuery, params, 'saveIndicators');
  }

  async getCurrencyRate(from, to) {
    const query = `
      SELECT rate FROM currency_rates
      WHERE from_currency = ? AND to_currency = ?
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY expires_at DESC
      LIMIT 1
    `;
    
    const result = await this.executeSingleRow(query, [from, to], 'getCurrencyRate');
    return result ? result.rate : null;
  }

  async saveCurrencyRate(from, to, rate, expiresAt) {
    const query = `
      INSERT INTO currency_rates (
        from_currency, to_currency, rate, source_rate, expires_at, data_source, created_at
      ) VALUES (?, ?, ?, ?, ?, 'EXCHANGE_API', CURRENT_TIMESTAMP)
      ON CONFLICT(from_currency, to_currency) DO UPDATE SET
        rate = excluded.rate,
        source_rate = excluded.source_rate,
        expires_at = excluded.expires_at,
        data_source = excluded.data_source,
        created_at = excluded.created_at
    `;
    
    await this.executeNonQuery(query, [
      from, to, rate, rate, expiresAt.toISOString()
    ], 'saveCurrencyRate');
  }

  async isCacheValid(key) {
    const query = `
      SELECT 1 FROM cache_metadata
      WHERE cache_key = ? AND expires_at > CURRENT_TIMESTAMP
      LIMIT 1
    `;
    
    const result = await this.executeSingleRow(query, [key], 'isCacheValid');
    return !!result;
  }

  async updateCacheMetadata(key, dataType, ttlMinutes) {
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    
    const query = `
      INSERT INTO cache_metadata (
        cache_key, expires_at, data_type, access_count, last_accessed
      ) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(cache_key) DO UPDATE SET
        expires_at = excluded.expires_at,
        data_type = excluded.data_type,
        access_count = access_count + 1,
        last_accessed = CURRENT_TIMESTAMP
    `;
    
    await this.executeNonQuery(query, [key, expiresAt.toISOString(), dataType], 'updateCacheMetadata');
  }

  async cleanupExpiredCache() {
    const query = `
      DELETE FROM cache_metadata
      WHERE expires_at <= CURRENT_TIMESTAMP
    `;
    
    const result = await this.executeNonQuery(query, [], 'cleanupExpiredCache');
    return result.meta?.changes || 0;
  }

  async getHealthStatus() {
    try {
      // Test database connection
      await this.executeQuery('SELECT 1 as test', [], 'healthCheck');
      
      // Get basic stats
      const stockCount = await this.executeSingleRow(
        'SELECT COUNT(*) as count FROM stocks', 
        [], 
        'getStockCount'
      );
      
      const ohlcvCount = await this.executeSingleRow(
        'SELECT COUNT(*) as count FROM ohlcv_data', 
        [], 
        'getOHLCVCount'
      );
      
      const lastUpdated = await this.executeSingleRow(
        'SELECT MAX(updated_at) as last_updated FROM stocks', 
        [], 
        'getLastUpdated'
      );

      return {
        healthy: true,
        connection: 'connected',
        stats: {
          stocks: stockCount?.count || 0,
          ohlcvRecords: ohlcvCount?.count || 0
        },
        lastUpdated: lastUpdated?.last_updated || null,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        connection: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async getLastOHLCVRecord(symbol) {
    const query = `
      SELECT od.* FROM ohlcv_data od
      JOIN stocks s ON od.stock_id = s.id
      WHERE s.symbol = ? COLLATE NOCASE
      ORDER BY od.date DESC
      LIMIT 1
    `;
    
    return this.executeSingleRow(query, [symbol], 'getLastOHLCVRecord');
  }

  async getPopulatedStockCount() {
    const query = `
      SELECT COUNT(DISTINCT stock_id) as count FROM ohlcv_data
      WHERE date >= date('now', '-1 year')
    `;
    
    const result = await this.executeSingleRow(query, [], 'getPopulatedStockCount');
    return result?.count || 0;
  }

  async getMissingStocks() {
    const query = `
      SELECT s.symbol FROM stocks s
      LEFT JOIN ohlcv_data od ON s.id = od.stock_id
      WHERE od.id IS NULL
      ORDER BY s.symbol
    `;
    
    const result = await this.executeQuery(query, [], 'getMissingStocks');
    return result?.results?.map(row => row.symbol) || [];
  }

  async getDataFreshness() {
    const oldestRecord = await this.executeSingleRow(
      'SELECT MIN(date) as oldest_date FROM ohlcv_data',
      [],
      'getOldestRecord'
    );
    
    const averageAge = await this.executeSingleRow(`
      SELECT AVG(julianday('now') - julianday(date)) as avg_days_old 
      FROM ohlcv_data 
      WHERE date >= date('now', '-1 year')
    `, [], 'getAverageAge');
    
    const staleStocks = await this.executeQuery(`
      SELECT s.symbol, MAX(od.date) as last_date 
      FROM stocks s
      JOIN ohlcv_data od ON s.id = od.stock_id
      WHERE od.date < date('now', '-7 days')
      GROUP BY s.symbol
      ORDER BY last_date ASC
    `, [], 'getStaleStocks');

    return {
      oldestRecord: oldestRecord?.oldest_date || null,
      averageAge: averageAge?.avg_days_old || 0,
      staleStocks: staleStocks?.results || []
    };
  }

  async getDataQuality() {
    const completeness = await this.executeSingleRow(`
      SELECT 
        (SELECT COUNT(*) FROM ohlcv_data WHERE close IS NOT NULL) * 100.0 / 
        (SELECT COUNT(*) FROM ohlcv_data) as completeness_percent
    `, [], 'getCompleteness');
    
    const accuracy = await this.executeSingleRow(`
      SELECT 
        (SELECT COUNT(*) FROM ohlcv_data 
         WHERE low <= high AND close >= low AND close <= high) * 100.0 / 
        (SELECT COUNT(*) FROM ohlcv_data) as accuracy_percent
    `, [], 'getAccuracy');
    
    const anomalies = await this.executeSingleRow(`
      SELECT COUNT(*) as count FROM ohlcv_data 
      WHERE volume < 0 OR close <= 0
    `, [], 'getAnomalies');

    return {
      completeness: completeness?.completeness_percent || 100,
      accuracy: accuracy?.accuracy_percent || 100,
      anomalies: anomalies?.count || 0
    };
  }

  async getCachePerformance() {
    const totalEntries = await this.executeSingleRow(
      'SELECT COUNT(*) as count FROM cache_metadata',
      [],
      'getTotalCacheEntries'
    );
    
    const expiredEntries = await this.executeSingleRow(`
      SELECT COUNT(*) as count FROM cache_metadata 
      WHERE expires_at <= CURRENT_TIMESTAMP
    `, [], 'getExpiredCacheEntries');
    
    const avgAccessCount = await this.executeSingleRow(
      'SELECT AVG(access_count) as avg FROM cache_metadata',
      [],
      'getAverageAccessCount'
    );

    return {
      totalEntries: totalEntries?.count || 0,
      expiredEntries: expiredEntries?.count || 0,
      avgAccessCount: avgAccessCount?.avg || 0,
      hitRate: 0 // Would need additional tracking for actual hit rate
    };
  }
}