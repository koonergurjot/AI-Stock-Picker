import { WATCHLIST } from '../../../lib/watchlist.js';
import { analyzeSymbol, volumeMomentum, linearForecast, buyScore } from '../../../lib/analyze.js';

export default {
  async fetch(request, env, ctx) {
    const cacheKey = 'top-picks-cache';
    const cached = await env.TOP_PICKS_KV?.get(cacheKey, {type: 'json'});
    if (cached && Date.now() - cached.timestamp < 900000) {  // 15min
      return Response.json(cached.top10);
    }

    const analyses = await Promise.all(
      WATCHLIST.map(async (symbol) => {
        try {
          const data = await analyzeSymbol(symbol);
          return {
            symbol,
            ...data,
            volumeMomentum: volumeMomentum(data.historical),
            forecastGainPct: linearForecast(data.historical, data.currentPrice),
            buyScore: buyScore(data)
          };
        } catch {
          return null;  // Skip errors
        }
      })
    );

    const valid = analyses.filter(Boolean);
    const top10 = valid
      .map(a => ({
        symbol: a.symbol,
        score: a.buyScore,
        signal: a.buyScore > 60 ? 'BUY' : 'HOLD',
        priceChart: a.historical.slice(-10).map(h => h.close),
        forecastGainPct: a.forecastGainPct,
        currentPrice: a.currentPrice,
        rsi: a.rsi,
        sma50: a.sma50
      }))
      .sort((a,b) => b.score - a.score)
      .slice(0,10);

    const responseData = { top10, timestamp: Date.now() };
    await env.TOP_PICKS_KV?.put(cacheKey, JSON.stringify(responseData), { expirationTtl: 900 });
    return Response.json(top10);
  }
};