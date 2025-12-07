// lib/data/CurrencyService.js
// Currency conversion service with hybrid caching strategy

import winston from 'winston';

export class CurrencyService {
  constructor(databaseService, apiKey = null) {
    this.db = databaseService;
    this.apiKey = apiKey || process.env.CURRENCY_API_KEY;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'currency-service' }
    });

    this.logger.info(`[DEBUG] CurrencyService initialized`, {
      hasApiKey: !!this.apiKey,
      apiKeyLength: this.apiKey ? this.apiKey.length : 0,
      dbExists: !!this.db
    });
  }

  /**
   * Convert amount from one currency to another
   * @param {string} fromCurrency - Source currency (e.g., 'CAD')
   * @param {string} toCurrency - Target currency (e.g., 'USD')
   * @param {number} amount - Amount to convert
   * @returns {Promise<number>} Converted amount
   */
  async convert(fromCurrency, toCurrency, amount) {
    // Same currency conversion
    if (fromCurrency === toCurrency) {
      return amount;
    }

    try {
      // Get exchange rate
      const rate = await this.getExchangeRate(fromCurrency, toCurrency);

      if (rate === null) {
        throw new Error(`Unable to get exchange rate for ${fromCurrency}/${toCurrency}`);
      }

      const convertedAmount = amount * rate;

      this.logger.debug('Currency conversion completed', {
        fromCurrency,
        toCurrency,
        amount,
        rate,
        convertedAmount
      });

      return convertedAmount;
    } catch (error) {
      this.logger.error('Currency conversion failed', {
        fromCurrency,
        toCurrency,
        amount,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get exchange rate between two currencies
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @returns {Promise<number|null>} Exchange rate or null if unavailable
   */
  async getExchangeRate(fromCurrency, toCurrency) {
    // Check cache first
    const cachedRate = await this.getCachedRate(fromCurrency, toCurrency);

    if (cachedRate && !this.isExpired(cachedRate)) {
      this.logger.debug('Using cached exchange rate', {
        fromCurrency,
        toCurrency,
        rate: cachedRate.rate,
        expiresAt: cachedRate.expiresAt
      });
      return cachedRate.rate;
    }

    // Try reverse rate (cached)
    if (cachedRate && cachedRate.rate > 0) {
      const reverseRate = await this.getCachedRate(toCurrency, fromCurrency);
      if (reverseRate && !this.isExpired(reverseRate)) {
        const invertedRate = 1 / reverseRate.rate;
        this.logger.debug('Using inverted cached rate', {
          fromCurrency,
          toCurrency,
          reverseRate: reverseRate.rate,
          invertedRate
        });
        return invertedRate;
      }
    }

    // Fetch from API
    const rate = await this.fetchFromAPI(fromCurrency, toCurrency);

    if (rate !== null) {
      // Cache the rate
      await this.cacheRate(fromCurrency, toCurrency, rate);

      this.logger.info('Fetched and cached new exchange rate', {
        fromCurrency,
        toCurrency,
        rate
      });
    }

    return rate;
  }

  /**
   * Check if cached rate is expired
   * @param {Object} cachedRate - Cached rate object
   * @returns {boolean} True if expired
   */
  isExpired(cachedRate) {
    const now = new Date();
    const expiresAt = new Date(cachedRate.expiresAt);
    return now >= expiresAt;
  }

  /**
   * Get cached rate from database
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @returns {Promise<Object|null>} Cached rate object or null
   */
  async getCachedRate(fromCurrency, toCurrency) {
    try {
      const rate = await this.db.getCurrencyRate(fromCurrency, toCurrency);

      if (rate) {
        // Get full rate record for expiration info
        const query = `
          SELECT rate, expires_at as expiresAt FROM currency_rates
          WHERE from_currency = ? AND to_currency = ?
          ORDER BY expires_at DESC
          LIMIT 1
        `;

        const result = await this.db.getDatabase().executeSingleRow(
          query, [fromCurrency, toCurrency], 'getCachedRate'
        );

        return result;
      }

      return null;
    } catch (error) {
      this.logger.error('Error getting cached rate', {
        fromCurrency,
        toCurrency,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Cache exchange rate in database
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {number} rate - Exchange rate
   * @param {number} ttlHours - TTL in hours (default: 1)
   * @returns {Promise<void>}
   */
  async cacheRate(fromCurrency, toCurrency, rate, ttlHours = 1) {
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    try {
      await this.db.saveCurrencyRate(fromCurrency, toCurrency, rate, expiresAt);
    } catch (error) {
      this.logger.error('Error caching rate', {
        fromCurrency,
        toCurrency,
        rate,
        error: error.message
      });
    }
  }

  /**
   * Fetch exchange rate from external API
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @returns {Promise<number|null>} Exchange rate or null if unavailable
   */
  async fetchFromAPI(fromCurrency, toCurrency) {
    this.logger.info(`[DEBUG] fetchFromAPI called`, {
      fromCurrency, toCurrency, hasApiKey: !!this.apiKey
    });

    if (!this.apiKey) {
      this.logger.warn('No currency API key configured, skipping API fetch');
      return null;
    }

    try {
      // Try multiple API endpoints for reliability
      const endpoints = [
        () => this.fetchFromExchangeRateAPI(fromCurrency, toCurrency),
        () => this.fetchFromFrankfurterAPI(fromCurrency, toCurrency),
        () => this.fetchFromCurrencyAPI(fromCurrency, toCurrency)
      ];

      for (const endpoint of endpoints) {
        try {
          const rate = await endpoint();
          if (rate !== null) {
            return rate;
          }
        } catch (error) {
          this.logger.debug('API endpoint failed, trying next', {
            error: error.message
          });
        }
      }

      this.logger.error('All API endpoints failed');
      return null;
    } catch (error) {
      this.logger.error('Error fetching from API', { error: error.message });
      return null;
    }
  }

  /**
   * Fetch from ExchangeRate API
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @returns {Promise<number|null>} Exchange rate
   */
  async fetchFromExchangeRateAPI(fromCurrency, toCurrency) {
    this.logger.info(`[DEBUG] fetchFromExchangeRateAPI called`, {
      fromCurrency, toCurrency, apiKey: this.apiKey ? '***' + this.apiKey.slice(-4) : 'none'
    });

    const url = `https://v6.exchangerate-api.com/v6/${this.apiKey}/pair/${fromCurrency}/${toCurrency}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.result === 'success') {
      return data.conversion_rate;
    } else {
      throw new Error(data.error_type || 'API error');
    }
  }

  /**
   * Fetch from Frankfurter API (no API key required)
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @returns {Promise<number|null>} Exchange rate
   */
  async fetchFromFrankfurterAPI(fromCurrency, toCurrency) {
    this.logger.info(`[DEBUG] fetchFromFrankfurterAPI called`, {
      fromCurrency, toCurrency
    });

    const url = `https://api.frankfurter.app/latest?from=${fromCurrency}&to=${toCurrency}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.rates && data.rates[toCurrency]) {
      return data.rates[toCurrency];
    } else {
      throw new Error('Rate not available');
    }
  }

  /**
   * Fetch from CurrencyAPI (alternative)
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @returns {Promise<number|null>} Exchange rate
   */
  async fetchFromCurrencyAPI(fromCurrency, toCurrency) {
    this.logger.info(`[DEBUG] fetchFromCurrencyAPI called`, {
      fromCurrency, toCurrency, apiKey: this.apiKey ? '***' + this.apiKey.slice(-4) : 'none'
    });

    const url = `https://api.currencyapi.com/v3/latest?currencies=${toCurrency}&base_currency=${fromCurrency}&apikey=${this.apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.data && data.data[toCurrency]) {
      return data.data[toCurrency].value;
    } else {
      throw new Error('Rate not available');
    }
  }

  /**
   * Batch convert multiple amounts
   * @param {Array} conversions - Array of conversion objects {from, to, amount}
   * @returns {Promise<Array>} Array of converted amounts
   */
  async batchConvert(conversions) {
    const results = [];

    for (const conversion of conversions) {
      try {
        const converted = await this.convert(
          conversion.from,
          conversion.to,
          conversion.amount
        );
        results.push({
          ...conversion,
          convertedAmount: converted,
          success: true
        });
      } catch (error) {
        results.push({
          ...conversion,
          convertedAmount: null,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get supported currencies
   * @returns {Promise<Array>} Array of supported currency codes
   */
  async getSupportedCurrencies() {
    // Common currencies we support
    return [
      'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'SEK', 'NZD',
      'MXN', 'SGD', 'HKD', 'NOK', 'KRW', 'TRY', 'RUB', 'INR', 'BRL', 'ZAR'
    ];
  }

  /**
   * Update all cached rates for a currency pair
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @returns {Promise<boolean>} True if updated successfully
   */
  async updateCachedRate(fromCurrency, toCurrency) {
    try {
      const rate = await this.fetchFromAPI(fromCurrency, toCurrency);

      if (rate !== null) {
        await this.cacheRate(fromCurrency, toCurrency, rate);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Error updating cached rate', {
        fromCurrency,
        toCurrency,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Clean up expired currency rates
   * @returns {Promise<number>} Number of expired rates cleaned up
   */
  async cleanupExpiredRates() {
    try {
      // This would need a custom query in the database layer
      // For now, we'll rely on the database's automatic cleanup
      const result = await this.db.cleanupExpiredCache();
      this.logger.info('Cleaned up expired currency rates', { cleaned: result });
      return result;
    } catch (error) {
      this.logger.error('Error cleaning up expired rates', { error: error.message });
      return 0;
    }
  }

  /**
   * Get currency rate history
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Array>} Array of historical rates
   */
  async getRateHistory(fromCurrency, toCurrency, startDate, endDate) {
    try {
      const query = `
        SELECT rate, created_at as createdAt FROM currency_rates
        WHERE from_currency = ? AND to_currency = ?
          AND created_at >= ?
          AND created_at <= ?
        ORDER BY created_at ASC
      `;

      const result = await this.db.getDatabase().executeQuery(
        query, [fromCurrency, toCurrency, startDate.toISOString(), endDate.toISOString()], 'getRateHistory'
      );

      return result?.results || [];
    } catch (error) {
      this.logger.error('Error getting rate history', {
        fromCurrency,
        toCurrency,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get average rate over a period
   * @param {string} fromCurrency - Source currency
   * @param {string} toCurrency - Target currency
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<number|null>} Average rate or null
   */
  async getAverageRate(fromCurrency, toCurrency, startDate, endDate) {
    const history = await this.getRateHistory(fromCurrency, toCurrency, startDate, endDate);

    if (history.length === 0) {
      return null;
    }

    const sum = history.reduce((acc, record) => acc + record.rate, 0);
    return sum / history.length;
  }
}
