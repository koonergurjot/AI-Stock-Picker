export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const params = new URLSearchParams(url.search);
    const provider = params.get('provider') || 'yahoo';
    const symbol = params.get('symbol');
    
    if (!symbol) {
      return new Response(JSON.stringify({ error: 'Missing symbol parameter' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const API_KEY = env.API_KEY;
    if (!API_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    try {
      let apiUrl;
      switch(provider.toLowerCase()) {
        case 'polygon':
          apiUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${API_KEY}`;
          break;
        case 'alphavantage':
          apiUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;
          break;
        case 'yahoo':
        default:
          apiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d`;
      }

      const response = await fetch(apiUrl);
      const data = await response.json();

      // Clean sensitive data from response
      const cleanedData = cleanApiResponse(data, provider);

      return new Response(JSON.stringify(cleanedData), {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};

function cleanApiResponse(data, provider) {
  switch(provider.toLowerCase()) {
    case 'polygon':
      return {
        symbol: data.ticker,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: data.volume
      };
    case 'alphavantage':
      const quote = data['Global Quote'];
      return {
        symbol: quote['01. symbol'],
        open: quote['02. open'],
        high: quote['03. high'],
        low: quote['04. low'],
        price: quote['05. price'],
        volume: quote['06. volume']
      };
    case 'yahoo':
    default:
      const chart = data.chart.result[0];
      return {
        symbol: chart.meta.symbol,
        currency: chart.meta.currency,
        regularMarketPrice: chart.meta.regularMarketPrice,
        chartPreviousClose: chart.meta.chartPreviousClose,
        previousClose: chart.meta.previousClose,
        regularMarketVolume: chart.meta.regularMarketVolume
      };
  }
}