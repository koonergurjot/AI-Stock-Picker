import YahooFinance from 'yahoo-finance2';

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

export async function analyzeSymbol(symbol) {
  const yahooFinance = new YahooFinance();

  // Fetch current quote
  const quote = await yahooFinance.quote(symbol);
  const currentPrice = quote.regularMarketPrice;
  if (!currentPrice) {
    throw new Error('Invalid symbol or no data available');
  }

  // Fetch historical data for last ~50 days
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 50);

  const historical = await yahooFinance.historical(symbol, {
    period1: Math.floor(startDate.getTime() / 1000),
    period2: Math.floor(endDate.getTime() / 1000),
    interval: '1d'
  });

  if (!historical || historical.length === 0) {
    throw new Error('Insufficient historical data');
  }

  const closes = historical.map(h => parseFloat(h.close)).filter(c => !isNaN(c));

  if (closes.length === 0) {
    throw new Error('No valid closing prices found');
  }

  // Calculate 50-day SMA (or available data)
  const smaPeriod = Math.min(50, closes.length);
  const sma50 = closes.slice(-smaPeriod).reduce((sum, price) => sum + price, 0) / smaPeriod;

  // Calculate RSI using Wilder's method
  const rsi = calculateRSI(closes);
  if (rsi === null) {
    throw new Error('Insufficient data for RSI calculation (need at least 15 days)');
  }

  // Determine signal
  let signal;
  if (rsi < 30) {
    signal = 'buy';
  } else if (rsi > 70) {
    signal = 'sell';
  } else {
    signal = 'hold';
  }

  return {
    currentPrice: parseFloat(currentPrice.toFixed(2)),
    sma50: parseFloat(sma50.toFixed(2)),
    rsi: parseFloat(rsi.toFixed(2)),
    signal,
    historical: historical.slice(-50).map(h => ({
      date: h.date,
      close: parseFloat(h.close)
    }))
  };
}
export function volumeMomentum(historical) {
  const volumes = historical.slice(-11).map(h => h.volume).filter(v => v > 0);
  if (volumes.length < 11) return 0;
  const latestVol = volumes[volumes.length - 1];
  const avgPrev10 = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / 10;
  const ratio = latestVol / avgPrev10;
  return Math.max(0, Math.min(100, (ratio - 0.5) * 200));
}

export function linearForecast(historical, currentPrice) {
  const last10 = historical.slice(-10).map(h => h.close);
  if (last10.length < 10) return 0;
  const n = 10;
  const x = Array.from({length: n}, (_, i) => i);
  const y = last10;
  const sumX = x.reduce((a,b)=>a+b,0);
  const sumY = y.reduce((a,b)=>a+b,0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi*xi, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return Math.max(-50, Math.min(50, (slope * 7 / currentPrice) * 100));
}

export function buyScore(analysis) {
  const { rsi, currentPrice, sma50, historical } = analysis;
  const rsiOversold = Math.max(0, Math.min(100, (70 - rsi) / 40 * 100));
  const priceVsSma = Math.max(0, (currentPrice / sma50 - 1) * 100);
  const volMom = volumeMomentum(historical);
  return Math.min(100, rsiOversold * 0.5 + priceVsSma * 0.3 + volMom * 0.2);
}