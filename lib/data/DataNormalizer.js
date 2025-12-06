// lib/data/DataNormalizer.js
// Data normalization service for handling stock splits and dividends

import winston from 'winston';

export class DataNormalizer {
  constructor(databaseService) {
    this.db = databaseService;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'data-normalizer' }
    });
  }

  /**
   * Normalize OHLCV data for splits and dividends
   * @param {string} symbol - Stock symbol
   * @param {Array} rawData - Raw OHLCV data
   * @returns {Promise<Array>} Normalized OHLCV data
   */
  async normalizeOHLCV(symbol, rawData) {
    if (!rawData || rawData.length === 0) {
      return [];
    }

    try {
      // Get corporate actions for the symbol
      const corporateActions = await this.getCorporateActions(symbol);
      
      if (corporateActions.length === 0) {
        // No corporate actions, return data with default adjustments
        return rawData.map(day => ({
          ...day,
          adjusted_close: day.close,
          split_ratio: 1.0,
          dividend: 0.0
        }));
      }

      // Apply adjustments to each day
      const normalizedData = rawData.map(day => {
        const action = this.findActionForDate(corporateActions, day.date);
        
        if (!action) {
          return {
            ...day,
            adjusted_close: day.close,
            split_ratio: 1.0,
            dividend: 0.0
          };
        }

        const adjustmentFactor = action.adjustmentFactor;
        
        return {
          ...day,
          open: this.roundToPrecision(day.open / adjustmentFactor, 4),
          high: this.roundToPrecision(day.high / adjustmentFactor, 4),
          low: this.roundToPrecision(day.low / adjustmentFactor, 4),
          close: this.roundToPrecision(day.close / adjustmentFactor, 4),
          adjusted_close: this.roundToPrecision(day.close, 4), // Original close
          split_ratio: action.splitRatio || 1.0,
          dividend: action.dividendAmount || 0.0,
          volume: day.volume * (action.splitRatio || 1.0) // Adjust volume for splits
        };
      });

      this.logger.info('Data normalization completed', {
        symbol,
        recordsProcessed: normalizedData.length,
        actionsApplied: corporateActions.length
      });

      return normalizedData;
    } catch (error) {
      this.logger.error('Error normalizing OHLCV data', {
        symbol,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get corporate actions for a symbol
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Array>} Array of corporate actions
   */
  async getCorporateActions(symbol) {
    try {
      // Try to get from database first
      const cachedActions = await this.getCachedCorporateActions(symbol);
      if (cachedActions.length > 0) {
        return cachedActions;
      }

      // Fetch from API if not cached
      const actions = await this.fetchCorporateActionsFromAPI(symbol);
      
      if (actions.length > 0) {
        // Cache the actions
        await this.cacheCorporateActions(symbol, actions);
      }

      return actions;
    } catch (error) {
      this.logger.error('Error getting corporate actions', {
        symbol,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get cached corporate actions from database
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Array>} Array of cached actions
   */
  async getCachedCorporateActions(symbol) {
    try {
      // We'll store corporate actions in a separate table or use fundamentals table
      // For now, return empty array - this would be implemented based on schema
      const query = `
        SELECT * FROM corporate_actions
        WHERE symbol = ? AND action_date <= date('now')
        ORDER BY action_date DESC
      `;

      const result = await this.db.getDatabase().executeQuery(
        query, [symbol], 'getCachedCorporateActions'
      );

      return result?.results || [];
    } catch (error) {
      this.logger.debug('No cached corporate actions found', {
        symbol,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Fetch corporate actions from external API
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Array>} Array of corporate actions
   */
  async fetchCorporateActionsFromAPI(symbol) {
    try {
      // Try multiple sources for corporate actions
      const sources = [
        () => this.fetchFromAlphaVantage(symbol),
        () => this.fetchFromYahooFinance(symbol)
      ];

      for (const source of sources) {
        try {
          const actions = await source();
          if (actions && actions.length > 0) {
            return actions;
          }
        } catch (error) {
          this.logger.debug('Corporate actions API source failed', {
            symbol,
            error: error.message
          });
        }
      }

      return [];
    } catch (error) {
      this.logger.error('Error fetching corporate actions from API', {
        symbol,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Fetch corporate actions from Alpha Vantage
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Array>} Array of actions
   */
  async fetchFromAlphaVantage(symbol) {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error('Alpha Vantage API key not configured');
    }

    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&apikey=${apiKey}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data['Time Series (Daily)']) {
      // Extract split and dividend data
      const timeSeries = data['Time Series (Daily)'];
      const actions = [];

      Object.entries(timeSeries).forEach(([date, values]) => {
        const splitFactor = values['8. split coefficient'];
        const dividend = values['7. dividend amount'];

        if (splitFactor && splitFactor !== '1.0000') {
          actions.push({
            symbol,
            action_date: date,
            action_type: 'SPLIT',
            split_ratio: parseFloat(splitFactor),
            dividend_amount: 0.0,
            adjustment_factor: 1.0 / parseFloat(splitFactor)
          });
        }

        if (dividend && parseFloat(dividend) > 0) {
          actions.push({
            symbol,
            action_date: date,
            action_type: 'DIVIDEND',
            split_ratio: 1.0,
            dividend_amount: parseFloat(dividend),
            adjustment_factor: 1.0
          });
        }
      });

      return actions.sort((a, b) => new Date(a.action_date) - new Date(b.action_date));
    }

    throw new Error('No time series data available');
  }

  /**
   * Fetch corporate actions from Yahoo Finance
   * @param {string} symbol - Stock symbol
   * @returns {Promise<Array>} Array of actions
   */
  async fetchFromYahooFinance(symbol) {
    // Yahoo Finance doesn't have a direct corporate actions API
    // This would require web scraping or using a different approach
    // For now, return empty array
    return [];
  }

  /**
   * Cache corporate actions in database
   * @param {string} symbol - Stock symbol
   * @param {Array} actions - Corporate actions
   * @returns {Promise<void>}
   */
  async cacheCorporateActions(symbol, actions) {
    try {
      // This would insert into a corporate_actions table
      // Implementation depends on the final schema
      for (const action of actions) {
        const query = `
          INSERT OR REPLACE INTO corporate_actions (
            symbol, action_date, action_type, split_ratio, dividend_amount, adjustment_factor
          ) VALUES (?, ?, ?, ?, ?, ?)
        `;

        await this.db.getDatabase().executeNonQuery(query, [
          action.symbol,
          action.action_date,
          action.action_type,
          action.split_ratio,
          action.dividend_amount,
          action.adjustment_factor
        ], 'cacheCorporateAction');
      }

      this.logger.info('Cached corporate actions', {
        symbol,
        actionsCount: actions.length
      });
    } catch (error) {
      this.logger.error('Error caching corporate actions', {
        symbol,
        error: error.message
      });
    }
  }

  /**
   * Find the most recent corporate action for a given date
   * @param {Array} actions - Array of corporate actions
   * @param {Date|string} date - Date to find action for
   * @returns {Object|null} Corporate action or null
   */
  findActionForDate(actions, date) {
    const dateObj = new Date(date);
    
    // Find the most recent action on or before this date
    for (let i = actions.length - 1; i >= 0; i--) {
      const actionDate = new Date(actions[i].action_date);
      if (actionDate <= dateObj) {
        return actions[i];
      }
    }

    return null;
  }

  /**
   * Calculate cumulative adjustment factor for a date range
   * @param {Array} actions - Array of corporate actions
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {number} Cumulative adjustment factor
   */
  calculateCumulativeAdjustment(actions, startDate, endDate) {
    let factor = 1.0;
    
    for (const action of actions) {
      constactionDate = new Date(action.action_date);
      if (actionDate >= startDate &&actionDate <= endDate) {
        factor *= action.adjustment_factor || 1.0;
      }
    }

    return factor;
  }

  /**
   * Normalize a single OHLCV record
   * @param {Object} record - OHLCV record
   * @param {Object} action - Corporate action
   * @returns {Object} Normalized record
   */
  normalizeRecord(record, action) {
    if (!action) {
      return {
        ...record,
        adjusted_close: record.close,
        split_ratio: 1.0,
        dividend: 0.0
      };
    }

    const adjustmentFactor = action.adjustmentFactor || 1.0;
    
    return {
      ...record,
      open: this.roundToPrecision(record.open / adjustmentFactor, 4),
      high: this.roundToPrecision(record.high / adjustmentFactor, 4),
      low: this.roundToPrecision(record.low / adjustmentFactor, 4),
      close: this.roundToPrecision(record.close / adjustmentFactor, 4),
      adjusted_close: this.roundToPrecision(record.close, 4),
      split_ratio: action.split_ratio || 1.0,
      dividend: action.dividend_amount || 0.0,
      volume: record.volume * (action.split_ratio || 1.0)
    };
  }

  /**
   * Round number to specified precision
   * @param {number} value - Value to round
   * @param {number} precision - Decimal places
   * @returns {number} Rounded value
   */
  roundToPrecision(value, precision) {
    const factor = Math.pow(10, precision);
    return Math.round(value * factor) / factor;
  }

  /**
   * Validate normalized data
   * @param {Array} normalizedData - Normalized OHLCV data
   * @returns {Object} Validation results
   */
  validateNormalizedData(normalizedData) {
    const errors = [];
    const warnings = [];

    for (let i = 0; i < normalizedData.length; i++) {
      const day = normalizedData[i];

      // Check price relationships
      if (day.low > day.high) {
        errors.push(`Invalid price range at ${day.date}: low > high`);
      }

      if (day.close < day.low || day.close > day.high) {
        warnings.push(`Close price outside range at ${day.date}`);
      }

      // Check for negative values
      if (day.open < 0 || day.high < 0 || day.low < 0 || day.close < 0) {
        errors.push(`Negative price detected at ${day.date}`);
      }

      if (day.volume < 0) {
        errors.push(`Negative volume at ${day.date}`);
      }

      // Check adjustment consistency
      if (day.split_ratio <= 0) {
        errors.push(`Invalid split ratio at ${day.date}: ${day.split_ratio}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      recordCount: normalizedData.length
    };
  }

  /**
   * Get normalization statistics
   * @param {Array} originalData - Original OHLCV data
   * @param {Array} normalizedData - Normalized OHLCV data
   * @returns {Object} Statistics
   */
  getNormalizationStats(originalData, normalizedData) {
    if (originalData.length !== normalizedData.length) {
      return { error: 'Data length mismatch' };
    }

    const stats = {
      recordsProcessed: originalData.length,
      priceChanges: {
        open: [],
        high: [],
        low: [],
        close: []
      },
      adjustments: {
        minSplitRatio: Infinity,
        maxSplitRatio: 0,
        totalDividends: 0
      }
    };

    for (let i = 0; i < originalData.length; i++) {
      const original = originalData[i];
      const normalized = normalizedData[i];

      // Calculate price changes
      stats.priceChanges.open.push({
        date: original.date,
        change: ((normalized.open - original.open) / original.open) * 100
      });

      stats.priceChanges.close.push({
        date: original.date,
        change: ((normalized.close - original.close) / original.close) * 100
      });

      // Track adjustments
      stats.adjustments.minSplitRatio = Math.min(stats.adjustments.minSplitRatio, normalized.split_ratio);
      stats.adjustments.maxSplitRatio = Math.max(stats.adjustments.maxSplitRatio, normalized.split_ratio);
      stats.adjustments.totalDividends += normalized.dividend;
    }

    return stats;
  }

  /**
   * Update corporate actions cache
   * @param {string} symbol - Stock symbol
   * @returns {Promise<boolean>} True if updated successfully
   */
  async updateCorporateActions(symbol) {
    try {
      const actions = await this.fetchCorporateActionsFromAPI(symbol);
      
      if (actions.length > 0) {
        await this.cacheCorporateActions(symbol, actions);
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error('Error updating corporate actions', {
        symbol,
        error: error.message
      });
      return false;
    }
  }
}