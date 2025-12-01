const express = require('express');
const cors = require('cors');
require('dotenv').config();

const YahooFinance = require('yahoo-finance2').default;
const winston = require('winston');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 3000;

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

// NodeCache setup (15 min TTL)
const cache = new NodeCache({ stdTTL: 900, checkperiod: 120 });

app.use(cors());
app.use(express.static('public'));

// Health endpoint for deployment platforms
app.get('/health', (req, res) => res.json({status: 'ok'}));

// Wilder RSI calculation function
function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) {
    return null;
  }

  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // Initial simple averages over first 'period' changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const change = changes[i];
    avgGain += Math.max(0, change);
    avgLoss += Math.abs(Math.min(0, change));
  }
  avgGain /= period;
  avgLoss /= period;

  // Smooth (Wilder's EMA) for remaining changes
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    avgGain = (avgGain * (period - 1) + Math.max(0, change)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.abs(Math.min(0, change))) / period;
  }

  if (avgLoss === 0) {
    return 100;
  }
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

app.get('/analyze/:symbol', async (req, res) => {
  let symbol = req.params.symbol.toUpperCase();

  if (!/^[A-Z0-9.-]{1,10}$/.test(symbol)) {
    return res.status(400).json({ error: 'Invalid symbol format. Use 1-10 alphanumeric chars, dots, hyphens.' });
  }

  const cacheKey = `analyze_${symbol}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.info(`[CACHE HIT] ${symbol}`);
    return res.json(cached);
  }
  try {
    // Fetch current quote
    const yahooFinance = new YahooFinance();
    const quote = await yahooFinance.quote(symbol);
    logger.debug(`Quote for ${symbol}`, { currentPrice: quote.regularMarketPrice });
    const currentPrice = quote.regularMarketPrice;
    
    if (!currentPrice) {
      return res.status(404).json({ error: 'Invalid symbol or no data available' });
    }
    
    // Fetch historical data for last 50 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 50);
    
    const historical = await yahooFinance.historical(symbol, {
      period1: Math.floor(startDate.getTime() / 1000),
      period2: Math.floor(endDate.getTime() / 1000),
      interval: '1d'
    });
    logger.debug(`Historical for ${symbol}`, { length: historical.length, sample: historical.slice(-3) });
    
    if (!historical || historical.length === 0) {
      return res.status(404).json({ error: 'Insufficient historical data' });
    }
    
    const closes = historical.map(h => parseFloat(h.close)).filter(c => !isNaN(c));
    logger.debug(`Closes for ${symbol}`, { count: closes.length, last5: closes.slice(-5) });
    
    if (closes.length === 0) {
      return res.status(404).json({ error: 'No valid closing prices found' });
    }
    
    // Calculate 50-day SMA (or available data)
    const smaPeriod = Math.min(50, closes.length);
    const sma50 = closes.slice(-smaPeriod).reduce((sum, price) => sum + price, 0) / smaPeriod;
    logger.debug(`SMA for ${symbol}`, { period: smaPeriod, sma50: parseFloat(sma50.toFixed(2)) });
    
    // Calculate RSI using Wilder's method
    const rsi = calculateRSI(closes);
    if (rsi === null) {
      logger.warn(`Insufficient data for RSI (${closes.length} closes) for ${symbol}`);
      return res.status(404).json({ error: 'Insufficient data for RSI calculation (need at least 15 days)' });
    }
    logger.debug(`RSI for ${symbol}`, { rsi: parseFloat(rsi.toFixed(2)) });
    
    // Determine signal
    let signal;
    if (rsi < 30) {
      signal = 'buy';
    } else if (rsi > 70) {
      signal = 'sell';
    } else {
      signal = 'hold';
    }
    logger.info(`Analysis complete for ${symbol}`, { signal, rsi: parseFloat(rsi.toFixed(2)), currentPrice: parseFloat(currentPrice.toFixed(2)), sma50: parseFloat(sma50.toFixed(2)) });
    
    const result = {
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      sma50: parseFloat(sma50.toFixed(2)),
      rsi: parseFloat(rsi.toFixed(2)),
      signal
    };
    logger.debug(`Returning analysis for ${symbol}`, result);
    res.json(result);
    cache.set(cacheKey, result);
    
  } catch (error) {
    logger.error(`Error analyzing ${symbol}`, { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

if (require.main === module) {
  const server = app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    logger.error(`Server failed to start: ${err.message}`);
    if (err.code === 'EADDRINUSE') {
      logger.error(`Port ${PORT} is already in use. Try killing the process or set a different PORT env var.`);
    }
    process.exit(1);
  });
}

module.exports = app;