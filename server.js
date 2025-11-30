const express = require('express');
const cors = require('cors');
require('dotenv').config();

const YahooFinance = require('yahoo-finance2').default;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('.'));

app.get('/analyze/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  
  try {
    // Fetch current quote
    const yahooFinance = new YahooFinance();
    const quote = await yahooFinance.quote(symbol);
    console.log(`[DEBUG] Quote response:`, JSON.stringify(quote, null, 2));
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
    console.log(`[DEBUG] Historical data length: ${historical.length}`);
    console.log(`[DEBUG] Sample historical:`, JSON.stringify(historical.slice(-3), null, 2));
    
    if (!historical || historical.length === 0) {
      return res.status(404).json({ error: 'Insufficient historical data' });
    }
    
    const closes = historical.map(h => parseFloat(h.close)).filter(c => !isNaN(c));
    console.log(`[DEBUG] Valid closes count: ${closes.length}`);
    console.log(`[DEBUG] Last 5 closes:`, closes.slice(-5));
    
    if (closes.length === 0) {
      return res.status(404).json({ error: 'No valid closing prices found' });
    }
    
    // Calculate 50-day SMA (or available data)
    const smaPeriod = Math.min(50, closes.length);
    const sma50 = closes.slice(-smaPeriod).reduce((sum, price) => sum + price, 0) / smaPeriod;
    console.log(`[DEBUG] SMA period: ${smaPeriod}, SMA50: ${sma50.toFixed(2)}`);
    
    // Calculate 14-day RSI
    const rsiPeriod = 14;
    let rsi = 0;
    
    if (closes.length >= rsiPeriod + 1) {
      const changes = [];
      for (let i = 1; i < closes.length; i++) {
        changes.push(closes[i] - closes[i - 1]);
      }
      
      const recentChanges = changes.slice(-rsiPeriod);
      const avgGain = recentChanges.reduce((sum, change) => sum + Math.max(change, 0), 0) / rsiPeriod;
      const avgLoss = recentChanges.reduce((sum, change) => sum + Math.abs(Math.min(change, 0)), 0) / rsiPeriod;
      console.log(`[DEBUG] Avg Gain: ${avgGain.toFixed(4)}, Avg Loss: ${avgLoss.toFixed(4)}`);
      
      if (avgLoss === 0) {
        rsi = 100;
      } else {
        const rs = avgGain / avgLoss;
        rsi = 100 - (100 / (1 + rs));
      }
    console.log(`[DEBUG] Calculated RSI: ${rsi.toFixed(2)}`);
  } else {
    // Not enough data for RSI
    return res.status(404).json({ error: 'Insufficient data for RSI calculation (need at least 15 days)' });
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
    console.log(`[DEBUG] Final signal: ${signal}`);
    
    console.log(`[DEBUG] Response:`, { currentPrice: parseFloat(currentPrice.toFixed(2)), sma50: parseFloat(sma50.toFixed(2)), rsi: parseFloat(rsi.toFixed(2)), signal });
    res.json({
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      sma50: parseFloat(sma50.toFixed(2)),
      rsi: parseFloat(rsi.toFixed(2)),
      signal
    });
    
  } catch (error) {
    console.error('[DEBUG ERROR] Full error:', error);
    console.error('[DEBUG ERROR] Error message:', error.message);
    console.error('[DEBUG ERROR] Error stack:', error.stack);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;