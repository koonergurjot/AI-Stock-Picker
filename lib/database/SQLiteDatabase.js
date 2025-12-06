// lib/database/SQLiteDatabase.js
// SQLite implementation of DatabaseInterface for development

import { DatabaseInterface } from './DatabaseInterface.js';
import sqlite3 from 'sqlite3';
import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SQLiteDatabase extends DatabaseInterface {
  constructor(dbPath = path.join(__dirname, '../../database/data/ai-stock-picker.db')) {
    super();
    this.dbPath = dbPath;
    this.db = null;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'sqlite-database' }
    });
  }

  /**
   * Initialize the database connection
   */
  async init() {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      // Ensure directory exists
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          this.logger.error('Failed to open database', { error: err.message });
          reject(err);
        } else {
          this.logger.info('Connected to SQLite database');
          this.db.run('PRAGMA foreign_keys = ON', (err) => {
            if (err) {
              this.logger.error('Failed to enable foreign keys', { error: err.message });
            } else {
              this.logger.info('Foreign key constraints enabled');
            }
          });
          resolve();
        }
      });
    });
  }

  /**
   * Execute a query with error handling and logging
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @param {string} operation - Operation description
   * @returns {Promise} Query result
   */
  async executeQuery(query, params = [], operation = 'query') {
    await this.init();
    
    return new Promise((resolve, reject) => {
      this.logger.debug(`Executing ${operation}: ${query}`, { params });
      
      this.db.all(query, params, (err, rows) => {
        if (err) {
          this.logger.error(`Error executing ${operation}`, { 
            error: err.message, 
            query, 
            params 
          });
          reject(err);
        } else {
          this.logger.debug(`${operation} completed`, { rowCount: rows.length });
          resolve({ results: rows });
        }
      });
    });
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
    await this.init();
    
    return new Promise((resolve, reject) => {
      this.logger.debug(`Executing ${operation}: ${query}`, { params });
      
      this.db.run(query, params, function(err) {
        if (err) {
          this.logger.error(`Error executing ${operation}`, { 
            error: err.message, 
            query, 
            params 
          });
          reject(err);
        } else {
          this.logger.debug(`${operation} completed`, { 
            success: true, 
            changes: this.changes,
            lastID: this.lastID 
          });
          resolve({ 
            meta: { 
              changes: this.changes, 
              lastID: this.lastID 
            } 
          });
        }
      });
    });
  }

  async getStock(symbol) {
    const query = `
      SELECT * FROM stocks 
      WHERE symbol = ?
    `;
    return this.executeSingleRow(query, [symbol], 'getStock');
  }

  async createStock(stock) {
    const query = `
      INSERT OR REPLACE INTO stocks (symbol, name, currency, exchange, isin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 
              COALESCE((SELECT created_at FROM stocks WHERE symbol = ?), CURRENT_TIMESTAMP),
              CURRENT_TIMESTAMP)
    `;
    await this.executeNonQuery(query, [
      stock.symbol,
      stock.name,
      stock.currency || 'USD',
      stock.exchange,
      stock.isin,
      stock.symbol // For the COALESCE subquery
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
      WHERE symbol = ?
    `;
    
    await this.executeNonQuery(query, [...values, symbol], 'updateStock');
  }

  async getOHLCV(symbol, startDate, endDate) {
    const query = `
      SELECT od.* FROM ohlcv_data od
      JOIN stocks s ON od.stock_id = s.id
      WHERE s.symbol = ?
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

    // Use transaction for better performance
    await this.executeNonQuery('BEGIN TRANSACTION', [], 'beginTransaction');

    try {
      for (const record of data) {
        const query = `
          INSERT OR REPLACE INTO ohlcv_data (
            stock_id, date, open, high, low, close, volume, 
            adjusted_close, split_ratio, dividend, currency, data_source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        await this.executeNonQuery(query, [
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
        ], 'saveOHLCVRecord');
      }

      await this.executeNonQuery('COMMIT', [], 'commitTransaction');
    } catch (error) {
      await this.executeNonQuery('ROLLBACK', [], 'rollbackTransaction');
      throw error;
    }
  }

  async getFundamentals(symbol, type) {
    const baseQuery = `
      SELECT f.* FROM fundamentals f
      JOIN stocks s ON f.stock_id = s.id
      WHERE s.symbol = ?
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

    // Use transaction for better performance
    await this.executeNonQuery('BEGIN TRANSACTION', [], 'beginTransaction');

    try {
      for (const record of data) {
        const query = `
          INSERT OR REPLACE INTO fundamentals (
            stock_id, metric_type, value, currency, period_ending, reported_date, data_source
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        
        await this.executeNonQuery(query, [
          stock.id,
          record.metric_type,
          record.value,
          record.currency || 'USD',
          record.period_ending,
          record.reported_date,
          record.data_source || 'YAHOO'
        ], 'saveFundamentalsRecord');
      }

      await this.executeNonQuery('COMMIT', [], 'commitTransaction');
    } catch (error) {
      await this.executeNonQuery('ROLLBACK', [], 'rollbackTransaction');
      throw error;
    }
  }

  async getIndicators(symbol, type, startDate) {
    const baseQuery = `
      SELECT i.* FROM indicators i
      JOIN stocks s ON i.stock_id = s.id
      WHERE s.symbol = ?
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

    // Use transaction for better performance
    await this.executeNonQuery('BEGIN TRANSACTION', [], 'beginTransaction');

    try {
      for (const record of data) {
        const query = `
          INSERT OR REPLACE INTO indicators (
            stock_id, indicator_type, value, date, parameters
          ) VALUES (?, ?, ?, ?, ?)
        `;
        
        await this.executeNonQuery(query, [
          stock.id,
          record.type || record.indicator_type,
          record.value,
          record.date.toISOString().split('T')[0],
          JSON.stringify(record.parameters || {})
        ], 'saveIndicatorsRecord');
      }

      await this.executeNonQuery('COMMIT', [], 'commitTransaction');
    } catch (error) {
      await this.executeNonQuery('ROLLBACK', [], 'rollbackTransaction');
      throw error;
    }
  }

  async getCurrencyRate(from, to) {
    const query = `
      SELECT rate FROM currency_rates
      WHERE from_currency = ? AND to_currency = ?
        AND datetime(expires_at) > datetime('now')
      ORDER BY datetime(expires_at) DESC
      LIMIT 1
    `;
    
    const result = await this.executeSingleRow(query, [from, to], 'getCurrencyRate');
    return result ? result.rate : null;
  }

  async saveCurrencyRate(from, to, rate, expiresAt) {
    const query = `
      INSERT OR REPLACE INTO currency_rates (
        from_currency, to_currency, rate, source_rate, expires_at, data_source, created_at
      ) VALUES (?, ?, ?, ?, ?, 'EXCHANGE_API', CURRENT_TIMESTAMP)
    `;
    
    await this.executeNonQuery(query, [
      from, to, rate, rate, expiresAt.toISOString()
    ], 'saveCurrencyRate');
  }

  async isCacheValid(key) {
    const query = `
      SELECT 1 FROM cache_metadata
      WHERE cache_key = ? AND datetime(expires_at) > datetime('now')
      LIMIT 1
    `;
    
    const result = await this.executeSingleRow(query, [key], 'isCacheValid');
    return !!result;
  }

  async updateCacheMetadata(key, dataType, ttlMinutes) {
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    
    const query = `
      INSERT OR REPLACE INTO cache_metadata (
        cache_key, expires_at, data_type, access_count, last_accessed
      ) VALUES (?, ?, ?, 
                COALESCE((SELECT access_count FROM cache_metadata WHERE cache_key = ?), 0) + 1,
                CURRENT_TIMESTAMP)
    `;
    
    await this.executeNonQuery(query, [key, expiresAt.toISOString(), dataType, key], 'updateCacheMetadata');
  }

  async cleanupExpiredCache() {
    const query = `
      DELETE FROM cache_metadata
      WHERE datetime(expires_at) <= datetime('now')
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
      WHERE s.symbol = ?
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
      WHERE datetime(expires_at) <= datetime('now')
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

  /**
   * Close the database connection
   */
  close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            this.logger.error('Error closing database', { error: err.message });
            reject(err);
          } else {
            this.logger.info('Database connection closed');
            this.db = null;
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}