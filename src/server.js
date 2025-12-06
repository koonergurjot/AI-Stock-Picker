import express from 'express';
import cors from 'cors';
import 'dotenv/config';

import YahooFinance from 'yahoo-finance2';
import winston from 'winston';
import NodeCache from 'node-cache';

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

app.get('/api/stock/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { provider = 'yahoo' } = req.query;

  try {
    const backendResponse = await fetch(`http://localhost:${PORT}/api/stock?symbol=${symbol}&provider=${provider}`);
    const data = await backendResponse.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/analyze/:symbol', async (req, res) => {
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
    const { analyzeSymbol } = await import('./lib/analyze.js');
    const result = await analyzeSymbol(symbol);
    logger.info(`Analysis complete for ${symbol}`, result);
    logger.debug(`Returning analysis for ${symbol}`, result);
    res.json(result);
    cache.set(cacheKey, result);
  } catch (error) {
    logger.error(`Error analyzing ${symbol}`, { error: error.message, stack: error.stack });
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

export default app;