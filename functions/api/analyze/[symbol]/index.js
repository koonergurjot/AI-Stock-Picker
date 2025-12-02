import YahooFinance from 'yahoo-finance2';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 900, checkperiod: 120 });

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

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);
    let symbol = decodeURIComponent(url.pathname.split('/').pop()).toUpperCase();

    if (!/^[A-Z0-9.-]{1,10}$/.test(symbol)) {
      return new Response(JSON.stringify({ error: 'Invalid symbol format. Use 1-10 alphanumeric chars, dots, hyphens.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cacheKey = `analyze_${symbol}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[CACHE HIT] ${symbol}`);
      return new Response(JSON.stringify(cached), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      const yahooFinance = new YahooFinance();
      const quote = await yahooFinance.quote(symbol);
      console.log(`Quote for ${symbol}`, { currentPrice: quote.regularMarketPrice });
      const currentPrice = quote.regularMarketPrice;

      if (!currentPrice) {
        return new Response(JSON.stringify({ error: 'Invalid symbol or no data available' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 50);

      const historical = await yahooFinance.historical(symbol, {
        period1: Math.floor(startDate.getTime() / 1000),
        period2: Math.floor(endDate.getTime() / 1000),
        interval: '1d'
      });
      console.log(`Historical for ${symbol}`, { length: historical.length });

      if (!historical || historical.length === 0) {
        return new Response(JSON.stringify({ error: 'Insufficient historical data' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const closes = historical.map(h => parseFloat(h.close)).filter(c => !isNaN(c));
      console.log(`Closes for ${symbol}`, { count: closes.length });

      if (closes.length === 0) {
        return new Response(JSON.stringify({ error: 'No valid closing prices found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const smaPeriod = Math.min(50, closes.length);
      const sma50 = closes.slice(-smaPeriod).reduce((sum, price) => sum + price, 0) / smaPeriod;
      console.log(`SMA for ${symbol}`, { period: smaPeriod, sma50: parseFloat(sma50.toFixed(2)) });

      const rsi = calculateRSI(closes);
      if (rsi === null) {
        console.log(`Insufficient data for RSI (${closes.length} closes) for ${symbol}`);
        return new Response(JSON.stringify({ error: 'Insufficient data for RSI calculation (need at least 15 days)' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      console.log(`RSI for ${symbol}`, { rsi: parseFloat(rsi.toFixed(2)) });

      let signal;
      if (rsi < 30) {
        signal = 'buy';
      } else if (rsi > 70) {
        signal = 'sell';
      } else {
        signal = 'hold';
      }
      console.log(`Analysis complete for ${symbol}`, { signal, rsi: parseFloat(rsi.toFixed(2)), currentPrice: parseFloat(currentPrice.toFixed(2)), sma50: parseFloat(sma50.toFixed(2)) });

      const result = {
        currentPrice: parseFloat(currentPrice.toFixed(2)),
        sma50: parseFloat(sma50.toFixed(2)),
        rsi: parseFloat(rsi.toFixed(2)),
        signal
      };

      cache.set(cacheKey, result);

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error(`Error analyzing ${symbol}`, { error: error.message, stack: error.stack });
      return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};