export default {
  async fetch(request, env, ctx, data) {
    let symbol = data.params.symbol.toUpperCase();

    if (!/^[A-Z0-9.-]{1,10}$/.test(symbol)) {
      return new Response(JSON.stringify({ error: 'Invalid symbol format. Use 1-10 alphanumeric chars, dots, hyphens.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      // Fetch current quote
      const quoteResponse = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`);
      const quoteData = await quoteResponse.json();
      const quote = quoteData.quoteResponse.result[0];
      if (!quote || quote.regularMarketPrice === undefined) {
        return new Response(JSON.stringify({ error: 'Invalid symbol or no data available' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const currentPrice = quote.regularMarketPrice;

      // Fetch historical data (2mo for ~50 days)
      const histResponse = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=2mo&interval=1d`);
      const histData = await histResponse.json();
      if (!histData.chart || !histData.chart.result[0]) {
        return new Response(JSON.stringify({ error: 'Insufficient historical data' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const closesRaw = histData.chart.result[0].indicators.quote[0].close || [];
      const closes = closesRaw.filter(c => c !== null && c !== undefined).map(c => parseFloat(c));

      if (closes.length === 0) {
        return new Response(JSON.stringify({ error: 'No valid closing prices found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (closes.length < 15) {
        return new Response(JSON.stringify({ error: 'Insufficient data for RSI (need at least 15 days)' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 50-day SMA (or available data)
      const smaPeriod = Math.min(50, closes.length);
      const sma50 = closes.slice(-smaPeriod).reduce((sum, price) => sum + price, 0) / smaPeriod;

      // Wilder RSI
      const rsi = calculateRSI(closes);

      // Signal
      let signal;
      if (rsi < 30) {
        signal = 'buy';
      } else if (rsi > 70) {
        signal = 'sell';
      } else {
        signal = 'hold';
      }

      const result = {
        currentPrice: parseFloat(currentPrice.toFixed(2)),
        sma50: parseFloat(sma50.toFixed(2)),
        rsi: parseFloat(rsi.toFixed(2)),
        signal
      };

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error(`Error analyzing ${symbol}:`, error);
      return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) {
    return null;
  }

  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // Initial averages
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    const change = changes[i];
    avgGain += Math.max(0, change);
    avgLoss += Math.abs(Math.min(0, change));
  }
  avgGain /= period;
  avgLoss /= period;

  // Smooth for remaining
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