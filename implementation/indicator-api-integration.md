# Indicator API Integration Guide

## Overview

This guide details how to integrate the new modular indicator library with the existing API endpoints, including enhanced data fetching, caching strategies, and response formatting.

## Enhanced Data Requirements

### Historical Data Fetching

The new indicators require 100+ days of historical data for accurate calculations:

```javascript
// lib/indicators/DataProvider.js
export class DataProvider {
  constructor(databaseService, yahooFinance) {
    this.db = databaseService;
    this.yahooFinance = yahooFinance;
  }

  async getHistoricalData(symbol, days = 150) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    // 1. Check database cache first
    const cached = await this.db.getOHLCV(symbol, startDate, endDate);
    if (cached && cached.length >= days * 0.8) { // 80% completeness threshold
      return this.normalizeData(cached);
    }

    // 2. Fetch from API if insufficient cached data
    const rawData = await this.yahooFinance.historical(symbol, {
      period1: Math.floor(startDate.getTime() / 1000),
      period2: Math.floor(endDate.getTime() / 1000),
      interval: '1d'
    });

    if (!rawData || rawData.length < days * 0.5) { // 50% minimum threshold
      throw new Error(`Insufficient data for ${symbol}. Required: ${days}, Got: ${rawData?.length || 0}`);
    }

    const normalizedData = this.normalizeData(rawData);

    // 3. Save to database for future use
    await this.db.saveOHLCV(symbol, normalizedData);

    return normalizedData;
  }

  normalizeData(rawData) {
    return rawData
      .map(day => ({
        date: new Date(day.date),
        open: parseFloat(day.open),
        high: parseFloat(day.high),
        low: parseFloat(day.low),
        close: parseFloat(day.close),
        volume: parseInt(day.volume),
        adjustedClose: parseFloat(day.close), // Will be updated by DataNormalizer
        splitRatio: 1.0,
        dividend: 0.0
      }))
      .filter(day => 
        !isNaN(day.open) && !isNaN(day.high) && !isNaN(day.low) && 
        !isNaN(day.close) && !isNaN(day.volume) &&
        day.high >= day.low && day.close >= day.low && day.close <= day.high
      )
      .sort((a, b) => a.date - b.date);
  }

  validateDataCompleteness(data, requiredDays) {
    if (data.length < requiredDays * 0.8) {
      return { valid: false, reason: `Insufficient data points: ${data.length}/${requiredDays}` };
    }

    // Check for gaps in data
    const dates = data.map(d => d.date.toDateString());
    const expectedDates = new Set();
    const endDate = data[data.length - 1].date;
    const startDate = data[0].date;

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0 && d.getDay() !== 6) { // Exclude weekends
        expectedDates.add(d.toDateString());
      }
    }

    const missingDates = [...expectedDates].filter(date => !dates.includes(date));
    
    if (missingDates.length > requiredDays * 0.1) { // More than 10% gaps
      return { valid: false, reason: `Too many missing dates: ${missingDates.length}` };
    }

    return { valid: true, missingDates };
  }
}
```

## Enhanced Analysis Endpoint

### Updated Server Implementation

```javascript
// src/server.js - Enhanced analyze endpoint
app.get('/api/analyze/:symbol', async (req, res) => {
  let symbol = req.params.symbol.toUpperCase();

  if (!/^[A-Z0-9.-]{1,10}$/.test(symbol)) {
    return res.status(400).json({ 
      error: 'Invalid symbol format. Use 1-10 alphanumeric chars, dots, hyphens.' 
    });
  }

  const cacheKey = `analyze:${symbol}`;
  
  try {
    // Parse query parameters
    const {
      indicators = 'RSI,SMA,MACD,BollingerBands,Stochastic,Volume',
      days = 150,
      scoring = 'weighted',
      includeHistorical = 'false'
    } = req.query;

    const indicatorList = indicators.split(',').map(i => i.trim());
    const daysNum = parseInt(days);
    const scoringMethod = scoring;
    const includeHistoricalBool = includeHistorical === 'true';

    // 1. Check cache first
    if (cacheManager) {
      const cached = await cacheManager.get(cacheKey);
      if (cached) {
        logger.info(`[CACHE HIT] ${symbol}`);
        return res.json(cached);
      }
    }

    // 2. Initialize indicator system
    const { IndicatorRegistry } = await import('./lib/indicators/IndicatorRegistry.js');
    const { DataProvider } = await import('./lib/indicators/DataProvider.js');
    const { ScoringEngine } = await import('./lib/indicators/ScoringEngine.js');

    const registry = new IndicatorRegistry();
    const dataProvider = new DataProvider(dbService, YahooFinance);
    const scoringEngine = new ScoringEngine();

    // 3. Fetch and validate historical data
    let historicalData;
    try {
      historicalData = await dataProvider.getHistoricalData(symbol, daysNum);
      
      const validation = dataProvider.validateDataCompleteness(historicalData, daysNum);
      if (!validation.valid) {
        logger.warn(`Data validation failed for ${symbol}: ${validation.reason}`);
      }
    } catch (error) {
      logger.error(`Failed to fetch data for ${symbol}:`, error.message);
      
      // Fallback to legacy analysis
      const { analyzeSymbol } = await import('./lib/analyze.js');
      const legacyResult = await analyzeSymbol(symbol);
      
      // Cache and return legacy result
      if (cacheManager) {
        await cacheManager.set(cacheKey, legacyResult, 60, 'ANALYSIS');
      }
      
      return res.json({
        ...legacyResult,
        warning: 'Using legacy analysis due to data fetch failure',
        indicators: null,
        composite: null
      });
    }

    // 4. Calculate indicators
    const calculationStart = Date.now();
    const indicatorResults = registry.calculateAll(historicalData, indicatorList);
    const calculationTime = Date.now() - calculationStart;

    // 5. Calculate composite score
    const composite = scoringMethod === 'weighted' 
      ? scoringEngine.calculateCompositeScore(indicatorResults)
      : this.calculateSimpleScore(indicatorResults);

    // 6. Get current price and metadata
    const currentPrice = historicalData[historicalData.length - 1].close;
    const currency = historicalData[0]?.currency || 'USD';

    // 7. Format response
    const response = {
      symbol: symbol,
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      currency: currency,
      indicators: this.formatIndicatorResponse(indicatorResults),
      composite: composite,
      metadata: {
        dataPoints: historicalData.length,
        calculationTime: calculationTime,
        indicatorsCalculated: indicatorResults.size,
        scoringMethod: scoringMethod,
        timestamp: new Date().toISOString()
      }
    };

    // Include historical data if requested
    if (includeHistoricalBool) {
      response.historical = historicalData.slice(-Math.min(100, historicalData.length)).map(h => ({
        date: h.date.toISOString().split('T')[0],
        close: parseFloat(h.close.toFixed(2)),
        volume: h.volume
      }));
    }

    // 8. Cache result
    if (cacheManager) {
      await cacheManager.set(cacheKey, response, 60, 'ANALYSIS'); // 1 hour TTL
    }

    logger.info(`Enhanced analysis complete for ${symbol}`, {
      indicators: Array.from(indicatorResults.keys()),
      compositeScore: composite.score,
      calculationTime: calculationTime
    });

    res.json(response);
  } catch (error) {
    logger.error(`Error in enhanced analysis for ${symbol}`, { 
      error: error.message, 
      stack: error.stack 
    });
    
    // Fallback to legacy analysis
    try {
      const { analyzeSymbol } = await import('./lib/analyze.js');
      const legacyResult = await analyzeSymbol(symbol);
      
      return res.json({
        ...legacyResult,
        error: 'Enhanced analysis failed, using legacy analysis',
        indicators: null,
        composite: null
      });
    } catch (legacyError) {
      return res.status(500).json({ 
        error: 'Analysis failed completely', 
        details: error.message 
      });
    }
  }
});

// Helper methods for response formatting
function formatIndicatorResponse(indicatorResults) {
  const formatted = {};
  
  for (const [name, result] of indicatorResults) {
    formatted[name] = {
      value: result.value,
      signal: result.signal,
      confidence: parseFloat(result.confidence.toFixed(2)),
      parameters: result.metadata.parameters,
      calculationTime: result.metadata.calculationTime
    };
  }
  
  return formatted;
}

function calculateSimpleScore(indicatorResults) {
  // Simple average of signal values
  const signals = Array.from(indicatorResults.values()).map(r => r.signal);
  const buyCount = signals.filter(s => s === 'BUY' || s === 'STRONG_BUY').length;
  const sellCount = signals.filter(s => s === 'SELL' || s === 'STRONG_SELL').length;
  const holdCount = signals.filter(s => s === 'HOLD').length;

  let score = 50; // Base neutral score
  score += (buyCount * 15); // +15 per buy signal
  score -= (sellCount * 15); // -15 per sell signal
  // Hold signals don't change score

  const signal = this.deriveSimpleSignal(score);
  const confidence = Math.min(1, (Math.max(buyCount, sellCount) / signals.length) * 1.2);

  return {
    score: Math.max(0, Math.min(100, score)),
    signal: signal,
    confidence: confidence,
    breakdown: signals
  };
}

function deriveSimpleSignal(score) {
  if (score >= 80) return 'STRONG_BUY';
  if (score >= 60) return 'BUY';
  if (score >= 40) return 'HOLD';
  if (score >= 20) return 'SELL';
  return 'STRONG_SELL';
}
```

## Enhanced Top Picks Endpoint

```javascript
// functions/api/top-picks/index.js - Enhanced version
import { WATCHLIST } from '../../../lib/watchlist.js';
import { IndicatorRegistry } from '../../../lib/indicators/IndicatorRegistry.js';
import { DataProvider } from '../../../lib/indicators/DataProvider.js';
import { ScoringEngine } from '../../../lib/indicators/ScoringEngine.js';
import { YahooFinance } from 'yahoo-finance2';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const scoringMethod = url.searchParams.get('scoring') || 'weighted';
    const indicators = url.searchParams.get('indicators');
    
    const cacheKey = `top-picks:${scoringMethod}:${indicators || 'all'}`;
    
    // 1. Check KV cache first
    const cached = await env.TOP_PICKS_KV?.get(cacheKey, {type: 'json'});
    if (cached && Date.now() - cached.timestamp < 900000) {  // 15min
      return Response.json(cached.top10);
    }

    try {
      // 2. Initialize indicator system
      const registry = new IndicatorRegistry();
      const yahooFinance = new YahooFinance();
      const dataProvider = new DataProvider(env.DB, yahooFinance);
      const scoringEngine = new ScoringEngine();

      const indicatorList = indicators ? indicators.split(',') : null;

      // 3. Batch fetch data for all symbols
      const dataPromises = WATCHLIST.map(async (symbol) => {
        try {
          const data = await dataProvider.getHistoricalData(symbol, 150);
          return { symbol, data };
        } catch (error) {
          logger.error(`Failed to fetch data for ${symbol}`, { error: error.message });
          return null;
        }
      });

      const symbolDataMap = new Map();
      const dataResults = await Promise.all(dataPromises);
      
      dataResults.forEach(result => {
        if (result) {
          symbolDataMap.set(result.symbol, result.data);
        }
      });

      // 4. Batch calculate indicators
      const calculationStart = Date.now();
      const indicatorResults = registry.calculateBatch(
        WATCHLIST,
        symbolDataMap,
        indicatorList
      );
      const calculationTime = Date.now() - calculationStart;

      // 5. Calculate composite scores and create results
      const analyses = Array.from(indicatorResults.entries()).map(([symbol, results]) => {
        if (results.size === 0) return null;

        const composite = scoringMethod === 'weighted' 
          ? scoringEngine.calculateCompositeScore(results)
          : calculateSimpleScore(results);

        const currentPrice = symbolDataMap.get(symbol)?.[symbolDataMap.get(symbol).length - 1]?.close;

        return {
          symbol,
          compositeScore: composite.score,
          signal: composite.signal,
          confidence: composite.confidence,
          indicators: Object.fromEntries(
            results.entries().map(([name, result]) => [
              name, 
              { value: result.value, signal: result.signal, confidence: result.confidence }
            ])
          ),
          currentPrice: currentPrice ? parseFloat(currentPrice.toFixed(2)) : null,
          calculationTime: composite.calculationTime
        };
      }).filter(Boolean);

      // 6. Sort and format top 10
      const top10 = analyses
        .sort((a, b) => b.compositeScore - a.compositeScore)
        .slice(0, 10)
        .map(stock => ({
          symbol: stock.symbol,
          compositeScore: Math.round(stock.compositeScore),
          signal: stock.signal,
          confidence: parseFloat(stock.confidence.toFixed(2)),
          price: stock.currentPrice,
          indicators: stock.indicators
        }));

      // 7. Cache results
      const responseData = { 
        top10, 
        timestamp: Date.now(),
        metadata: {
          scoringMethod,
          indicators: indicatorList || 'all',
          symbolsProcessed: analyses.length,
          calculationTime: calculationTime,
          totalSymbols: WATCHLIST.length
        }
      };

      await env.TOP_PICKS_KV?.put(cacheKey, JSON.stringify(responseData), { expirationTtl: 900 });

      return Response.json(responseData);
    } catch (error) {
      logger.error('Top picks calculation failed', { error: error.message });
      
      // Fallback to legacy implementation
      return this.fallbackTopPicks(request, env, ctx);
    }
  },

  async fallbackTopPicks(request, env, ctx) {
    // Legacy implementation using existing analyze.js
    const { WATCHLIST } = await import('../../../lib/watchlist.js');
    const { analyzeSymbol } = await import('../../../lib/analyze.js');

    const analyses = await Promise.all(
      WATCHLIST.map(async (symbol) => {
        try {
          const data = await analyzeSymbol(symbol);
          return {
            symbol,
            compositeScore: data.buyScore || 50,
            signal: data.signal,
            price: data.currentPrice,
            rsi: data.rsi,
            sma50: data.sma50
          };
        } catch {
          return null;
        }
      })
    );

    const valid = analyses.filter(Boolean);
    const top10 = valid
      .sort((a,b) => b.compositeScore - a.compositeScore)
      .slice(0,10);

    return Response.json({ top10, fallback: true });
  }
};
```

## Caching Strategy

### Multi-Level Cache Implementation

```javascript
// lib/indicators/IndicatorCache.js
export class IndicatorCache {
  constructor(databaseService, memoryCache) {
    this.db = databaseService;
    this.memoryCache = memoryCache || new Map();
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'indicator-cache' }
    });
  }

  async get(symbol, indicators, days) {
    const key = this.generateKey(symbol, indicators, days);
    
    // 1. Check memory cache
    if (this.memoryCache.has(key)) {
      const entry = this.memoryCache.get(key);
      if (!this.isExpired(entry)) {
        this.logger.debug('Memory cache hit', { key });
        return entry.data;
      }
      this.memoryCache.delete(key);
    }

    // 2. Check database cache
    const cached = await this.db.getIndicators(symbol, indicators.join(','), 
      new Date(Date.now() - days * 24 * 60 * 60 * 1000));
    
    if (cached && cached.length > 0) {
      // Store in memory cache for faster access
      this.memoryCache.set(key, {
        data: cached,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
      });
      
      this.logger.debug('Database cache hit', { key });
      return cached;
    }

    return null;
  }

  async set(symbol, indicators, days, data) {
    const key = this.generateKey(symbol, indicators, days);
    
    // Store in memory
    this.memoryCache.set(key, {
      data,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    });

    // Store in database
    await this.db.saveIndicators(symbol, data);

    // Update cache metadata
    await this.db.updateCacheMetadata(key, 'INDICATORS', 60);
  }

  generateKey(symbol, indicators, days) {
    return `indicators:${symbol}:${indicators.sort().join(',')}:${days}`;
  }

  isExpired(entry) {
    return new Date() >= entry.expiresAt;
  }

  async cleanup() {
    // Clean expired memory entries
    const now = new Date();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now >= entry.expiresAt) {
        this.memoryCache.delete(key);
      }
    }

    // Clean expired database entries
    const cleaned = await this.db.cleanupExpiredCache();
    this.logger.info('Cache cleanup completed', { 
      memoryEntries: this.memoryCache.size,
      databaseEntriesCleaned: cleaned 
    });
  }
}
```

## Database Schema Updates

### Enhanced Indicators Table

```sql
-- Enhanced indicators table with JSON support
CREATE TABLE IF NOT EXISTS indicators_enhanced (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL,
    indicator_type TEXT NOT NULL,
    value JSON NOT NULL, -- Store complex indicator values as JSON
    signal TEXT NOT NULL,
    confidence REAL NOT NULL,
    parameters JSON NOT NULL, -- Store indicator parameters
    date DATE NOT NULL,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_points INTEGER NOT NULL,
    calculation_time INTEGER NOT NULL, -- Milliseconds
    FOREIGN KEY (stock_id) REFERENCES stocks(id),
    UNIQUE(stock_id, indicator_type, date, parameters)
);

-- Composite scores table
CREATE TABLE IF NOT EXISTS composite_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL,
    score REAL NOT NULL CHECK(score >= 0 AND score <= 100),
    signal TEXT NOT NULL,
    confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
    breakdown JSON NOT NULL, -- Detailed breakdown of indicator contributions
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_points INTEGER NOT NULL,
    indicators_used TEXT NOT NULL, -- Comma-separated list of indicators
    scoring_method TEXT NOT NULL,
    FOREIGN KEY (stock_id) REFERENCES stocks(id),
    UNIQUE(stock_id, scoring_method, date('now', 'localtime'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_indicators_enhanced_stock_date 
ON indicators_enhanced(stock_id, date);

CREATE INDEX IF NOT EXISTS idx_indicators_enhanced_type_date 
ON indicators_enhanced(indicator_type, date);

CREATE INDEX IF NOT EXISTS idx_composite_scores_stock_date 
ON composite_scores(stock_id, calculated_at);

-- View for easy access to latest indicators
CREATE VIEW IF NOT EXISTS latest_indicators AS
SELECT 
    i.stock_id,
    s.symbol,
    i.indicator_type,
    i.value,
    i.signal,
    i.confidence,
    i.parameters,
    i.date,
    i.calculated_at
FROM indicators_enhanced i
JOIN stocks s ON i.stock_id = s.id
WHERE i.calculated_at = (
    SELECT MAX(calculated_at) 
    FROM indicators_enhanced 
    WHERE stock_id = i.stock_id 
    AND indicator_type = i.indicator_type
);
```

## Performance Monitoring

### Metrics Collection

```javascript
// lib/indicators/Metrics.js
export class IndicatorMetrics {
  constructor() {
    this.metrics = {
      calculations: {
        total: 0,
        byIndicator: {},
        averageTime: 0,
        totalTime: 0
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0
      },
      errors: {
        total: 0,
        byType: {}
      }
    };
  }

  recordCalculation(indicatorName, calculationTime) {
    this.metrics.calculations.total++;
    this.metrics.calculations.totalTime += calculationTime;
    this.metrics.calculations.averageTime = 
      this.metrics.calculations.totalTime / this.metrics.calculations.total;
    
    if (!this.metrics.calculations.byIndicator[indicatorName]) {
      this.metrics.calculations.byIndicator[indicatorName] = {
        count: 0,
        totalTime: 0,
        averageTime: 0
      };
    }
    
    this.metrics.calculations.byIndicator[indicatorName].count++;
    this.metrics.calculations.byIndicator[indicatorName].totalTime += calculationTime;
    this.metrics.calculations.byIndicator[indicatorName].averageTime = 
      this.metrics.calculations.byIndicator[indicatorName].totalTime /
      this.metrics.calculations.byIndicator[indicatorName].count;
  }

  recordCacheHit() {
    this.metrics.cache.hits++;
    this.updateHitRate();
  }

  recordCacheMiss() {
    this.metrics.cache.misses++;
    this.updateHitRate();
  }

  recordError(errorType) {
    this.metrics.errors.total++;
    this.metrics.errors.byType[errorType] = 
      (this.metrics.errors.byType[errorType] || 0) + 1;
  }

  updateHitRate() {
    const total = this.metrics.cache.hits + this.metrics.cache.misses;
    this.metrics.cache.hitRate = total > 0 ? this.metrics.cache.hits / total : 0;
  }

  getReport() {
    return {
      calculations: this.metrics.calculations,
      cache: this.metrics.cache,
      errors: this.metrics.errors,
      timestamp: new Date().toISOString()
    };
  }

  reset() {
    this.metrics = {
      calculations: {
        total: 0,
        byIndicator: {},
        averageTime: 0,
        totalTime: 0
      },
      cache: {
        hits: 0,
        misses: 0,
        hitRate: 0
      },
      errors: {
        total: 0,
        byType: {}
      }
    };
  }
}
```

This comprehensive API integration guide ensures seamless integration of the new indicator system with robust error handling, caching, and performance monitoring.