import { analyzeSymbol } from '../../../lib/analyze.js';
const cache = new Map();

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);
    let symbol = decodeURIComponent(url.pathname.split('/').pop()).toUpperCase();

    console.log(`Function called for ${symbol}`);

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
      const result = await analyzeSymbol(symbol);
      console.log(`Analysis complete for ${symbol}`, result);

      cache.set(cacheKey, result);

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error(`Error analyzing ${symbol}`, { error: error.message, stack: error.stack });
      let status = 500;
      let errorMsg = error.message || 'Internal server error';

      if (errorMsg.includes('Invalid symbol') || errorMsg.includes('no data')) {
        status = 404;
      } else if (errorMsg.includes('Insufficient historical')) {
        status = 404;
      } else if (errorMsg.includes('RSI')) {
        status = 404;
      }

      return new Response(JSON.stringify({ error: errorMsg }), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};