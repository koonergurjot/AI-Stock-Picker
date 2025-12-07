import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import YahooFinance from 'yahoo-finance2';
import winston from 'winston';
import NodeCache from 'node-cache';

// Import new database and caching services
import { createDatabaseService } from '../lib/database/DatabaseService.js';
import { CacheManager } from '../lib/cache/CacheManager.js';
import { CurrencyService } from '../lib/data/CurrencyService.js';
import { DataNormalizer } from '../lib/data/DataNormalizer.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Check for Jest environment
const isJest = !!process.env.JEST_WORKER_ID ||
               !!process.env.JEST_JUNIT_OUTPUT_DIR ||
               typeof globalThis !== 'undefined' && globalThis.jasmine !== undefined ||
               typeof process.env.NODE_ENV === 'string' && process.env.NODE_ENV.includes('test');

// Winston logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'ai-stock-picker' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

logger.info(`[DEBUG] Environment check:`, {
  isJest,
  nodeEnv: process.env.NODE_ENV,
  jestWorkerId: process.env.JEST_WORKER_ID,
  jestJunitOutputDir: process.env.JEST_JUNIT_OUTPUT_DIR
});

// NodeCache setup (15 min TTL) - Keep for backward compatibility
const cache = new NodeCache({ stdTTL: 900, checkperiod: 120 });

// Initialize database service (will be null in local development)
let dbService = null;
let cacheManager = null;
let currencyService = null;
let dataNormalizer = null;

try {
  // Initialize services
  logger.info(`[DEBUG] Initializing services with environment: ${process.env.ENVIRONMENT || 'development'}`);
  dbService = createDatabaseService(null, process.env.ENVIRONMENT);
  logger.info(`[DEBUG] Database service created: ${dbService ? 'success' : 'failed'}`);

  cacheManager = new CacheManager(dbService);
  logger.info(`[DEBUG] Cache manager created: ${cacheManager ? 'success' : 'failed'}`);

  currencyService = new CurrencyService(dbService);
  logger.info(`[DEBUG] Currency service created: ${currencyService ? 'success' : 'failed'}`);

  dataNormalizer = new DataNormalizer(dbService);
  logger.info(`[DEBUG] Data normalizer created: ${dataNormalizer ? 'success' : 'failed'}`);

  logger.info('Database and caching services initialized');
} catch (error) {
  logger.error('Failed to initialize services', {
    error: error.message,
    stack: error.stack
  });
}

app.use(cors());
app.use(express.static('public'));

// Health endpoint for deployment platforms
app.get('/health', (req, res) => res.json({status: 'ok'}));

// Enhanced health check with database status
app.get('/health/database', async (req, res) => {
  try {
    if (!dbService) {
      return res.json({
        status: 'warning',
        message: 'Database service not initialized (development mode)',
        timestamp: new Date().toISOString()
      });
    }

    const health = await dbService.getHealthReport();
    const cacheStats = cacheManager.getStats();

    res.json({
      ...health,
      cache: {
        hitRate: cacheStats.hitRate,
        memorySize: cacheStats.memorySize,
        totalRequests: cacheStats.totalRequests
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Cache metrics endpoint
app.get('/metrics/cache', async (req, res) => {
  try {
    const stats = cacheManager.getStats();
    const health = cacheManager.getHealthStatus();

    res.json({
      cache: stats,
      health,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Cache metrics failed', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Performance metrics endpoint
app.get('/metrics/performance', async (req, res) => {
  try {
    if (!dbService) {
      return res.json({
        message: 'Performance metrics not available in development mode',
        timestamp: new Date().toISOString()
      });
    }

    const freshness = await dbService.getDataFreshness();
    const quality = await dbService.getDataQuality();
    const cachePerf = await dbService.getCachePerformance();

    res.json({
      dataFreshness: freshness,
      dataQuality: quality,
      cachePerformance: cachePerf,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Performance metrics failed', { error: error.message });
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Enhanced analyze endpoint with database integration
app.get('/api/analyze/:symbol', async (req, res) => {
  let symbol = req.params.symbol.toUpperCase();

  if (!/^[A-Z0-9.-]{1,10}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol format. Use 1-10 alphanumeric chars, dots, hyphens.' });
  }

  const cacheKey = `analyze_${symbol}`;

  try {
    logger.info(`[DEBUG] Starting analysis for ${symbol}, cacheKey: ${cacheKey}`);
    logger.info(`[DEBUG] cacheManager exists: ${!!cacheManager}, dbService exists: ${!!dbService}`);

    // 1. Check new cache manager first
    if (cacheManager) {
      logger.info(`[DEBUG] Checking cache manager for ${symbol}`);
      try {
        const cached = await cacheManager.get(cacheKey);
        if (cached) {
          logger.info(`[NEW CACHE HIT] ${symbol}`);
          return res.json(cached);
        }
      } catch (cacheError) {
        logger.error(`[DEBUG] Cache manager error for ${symbol}`, {
          error: cacheError.message
        });
      }
    } else {
      logger.warn(`[DEBUG] Cache manager not available for ${symbol}`);
    }

    // 2. Check legacy cache for backward compatibility
    const legacyCached = cache.get(cacheKey);
    if (legacyCached) {
      logger.info(`[LEGACY CACHE HIT] ${symbol}`);
      return res.json(legacyCached);
    }

    // 3. Try to get from database if available
    let result = null;
    if (dbService) {
      logger.info(`[DEBUG] Checking database service for ${symbol}`);
      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 50);

        logger.info(`[DEBUG] Calling dbService.getStockAnalysisData for ${symbol}`);
        const analysisData = await dbService.getStockAnalysisData(symbol, startDate, endDate);

        if (analysisData.ohlcv && analysisData.ohlcv.length > 0) {
          // Compute indicators from cached data
          const closes = analysisData.ohlcv.map(h => h.close);
          const rsi = calculateRSI(closes);
          const sma50 = calculateSMA50(closes);

          if (rsi !== null && !isNaN(sma50)) {
            const currentPrice = analysisData.ohlcv[analysisData.ohlcv.length - 1].close;

            result = {
              currentPrice: parseFloat(currentPrice.toFixed(2)),
              currency: analysisData.ohlcv[0]?.currency || 'USD',
              sma50: parseFloat(sma50.toFixed(2)),
              rsi: parseFloat(rsi.toFixed(2)),
              signal: getSignal(rsi),
              historical: analysisData.ohlcv.slice(-50).map(h => ({
                date: h.date,
                close: parseFloat(h.close)
              }))
            };
          }
        }
      } catch (error) {
        logger.debug(`Database lookup failed for ${symbol}`, { error: error.message });
      }
    }

    // 4. Fetch from API if no cached/database data
    if (!result) {
      logger.info(`[DEBUG] Attempting to import analyze.js for ${symbol}`);
      try {
        // Check if we're in a Jest environment that might interfere with imports
        if (isJest) {
          logger.warn(`[DEBUG] Jest environment detected, using alternative import for ${symbol}`);
          // Try to require the module instead of dynamic import
          const analyzeModule = await import('./lib/analyze.js');
          const { analyzeSymbol } = analyzeModule;
          logger.info(`[DEBUG] Successfully imported analyzeSymbol for ${symbol} in Jest`);
          result = await analyzeSymbol(symbol);
        } else {
          const { analyzeSymbol } = await import('../lib/analyze.js');
          logger.info(`[DEBUG] Successfully imported analyzeSymbol for ${symbol}`);
          result = await analyzeSymbol(symbol);
        }
      } catch (importError) {
        logger.error(`[DEBUG] Import failed for ${symbol}`, {
          error: importError.message,
          stack: importError.stack,
          isJest: isJest
        });
        throw new Error(`Failed to import analysis module: ${importError.message}`);
      }

      // 5. Save to database for future requests
      if (dbService && result.historical && result.historical.length > 0) {
        try {
          // Create stock record
          await dbService.getOrCreateStock(symbol, {
            name: `${symbol} Stock`,
            currency: result.currency || 'USD'
          });

          // Save OHLCV data
          const ohlcvData = result.historical.map(h => ({
            date: new Date(h.date),
            open: h.close * 0.995, // Approximate
            high: h.close * 1.01,  // Approximate
            low: h.close * 0.99,   // Approximate
            close: h.close,
            volume: 1000000,       // Default volume
            currency: result.currency || 'USD',
            data_source: 'YAHOO'
          }));

          await dbService.saveOHLCV(symbol, ohlcvData);

          // Save indicators
          await dbService.saveIndicators(symbol, [
            {
              type: 'RSI',
              value: result.rsi,
              date: new Date(),
              parameters: JSON.stringify({ period: 14 })
            },
            {
              type: 'SMA50',
              value: result.sma50,
              date: new Date(),
              parameters: JSON.stringify({ period: 50 })
            }
          ]);

          logger.debug(`Saved analysis data for ${symbol} to database`);
        } catch (error) {
          logger.error(`Failed to save analysis data for ${symbol}`, { error: error.message });
        }
      }
    }

    // 6. Cache the result
    if (cacheManager) {
      await cacheManager.set(cacheKey, result, 60, 'ANALYSIS'); // 1 hour TTL
    }
    cache.set(cacheKey, result);

    logger.info(`Analysis complete for ${symbol}`, {
      rsi: result.rsi,
      sma50: result.sma50,
      signal: result.signal
    });

    res.json(result);
  } catch (error) {
    logger.error(`Error analyzing ${symbol}`, {
      error: error.message,
      stack: error.stack,
      symbol: symbol,
      cacheKey: cacheKey
    });
    let status = 500;
    let errorMsg = error.message || 'Internal server error';

    if (errorMsg.includes('Invalid symbol') || errorMsg.includes('no data')) {
      status = 404;
    } else if (errorMsg.includes('Insufficient historical')) {
      status = 404;
    } else if (errorMsg.includes('RSI')) {
      status = 404;
    }

    res.status(status).json({ error: errorMsg });
  }
});

// Currency conversion endpoint
app.get('/api/currency/convert', async (req, res) => {
  const { from, to, amount } = req.query;

  if (!from || !to || !amount) {
    return res.status(400).json({ error: 'Missing parameters: from, to, amount required' });
  }

  if (!currencyService) {
    return res.status(503).json({ error: 'Currency service not available' });
  }

  try {
    const converted = await currencyService.convert(from.toUpperCase(), to.toUpperCase(), parseFloat(amount));
    res.json({
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      amount: parseFloat(amount),
      convertedAmount: converted,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Currency conversion failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Cleanup on server shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');

  if (cacheManager) {
    await cacheManager.close();
  }

  process.exit(0);
});

const server = app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  logger.info(`Environment: ${process.env.ENVIRONMENT || 'development'}`);

  if (dbService) {
    logger.info('Database service: Enabled');
  } else {
    logger.info('Database service: Disabled (development mode)');
  }

  if (cacheManager) {
    logger.info('Cache manager: Enabled');
  }
});

server.on('error', (err) => {
  logger.error(`Server failed to start: ${err.message}`);
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use. Try killing the process or set a different PORT env var.`);
  }
  process.exit(1);
});

// Helper functions (moved from analyze.js for reuse)
function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) {
    return null;
  }

  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += Math.max(0, changes[i]);
    avgLoss += Math.abs(Math.min(0, changes[i]));
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + Math.max(0, changes[i])) / period;
    avgLoss = (avgLoss * (period - 1) + Math.abs(Math.min(0, changes[i]))) / period;
  }

  if (avgLoss === 0) {
    return 100;
  }
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateSMA50(closes) {
  const period = Math.min(50, closes.length);
  const sma50 = closes.slice(-period).reduce((sum, price) => sum + price, 0) / period;
  return sma50;
}

function getSignal(rsi) {
  if (rsi < 30) return 'buy';
  if (rsi > 70) return 'sell';
  return 'hold';
}

export default app;
