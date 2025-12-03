const request = require('supertest');

// Shared mock instance
const mockYahooFinanceInstance = {
  quote: jest.fn(),
  historical: jest.fn()
};

// Mock the yahoo-finance2 module to return shared mock instance
jest.mock('yahoo-finance2', () => ({
  default: jest.fn(() => mockYahooFinanceInstance)
}));

 // const app = require('../src/server.js');

describe.skip('Stock Analysis Endpoint /analyze/:symbol', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const generateHistoricalData = (closes) => closes.map((close, index) => ({
    date: new Date(Date.now() - (closes.length - 1 - index) * 86400000).toISOString().split('T')[0],
    close: close.toString()
  }));

  it('should return 200 with buy signal (RSI < 30)', async () => {
    mockYahooFinanceInstance.quote.mockResolvedValue({ regularMarketPrice: 150 });
    // Strong downtrend for low RSI
    const closes = [170, 165, 160, 155, 150, 145, 140, 135, 130, 125, 120, 115, 110, 105, 100];
    mockYahooFinanceInstance.historical.mockResolvedValue(generateHistoricalData(closes));

    const res = await request(app).get('/analyze/AAPL').expect(200);

    expect(res.body.currentPrice).toBe(150);
    expect(res.body.rsi).toBeLessThan(30);
    expect(res.body.signal).toBe('buy');
  });

  it('should return 200 with sell signal (RSI > 70)', async () => {
    mockYahooFinanceInstance.quote.mockResolvedValue({ regularMarketPrice: 200 });
    // Strong uptrend for high RSI
    const closes = [100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170];
    mockYahooFinanceInstance.historical.mockResolvedValue(generateHistoricalData(closes));

    const res = await request(app).get('/analyze/TSLA').expect(200);

    expect(res.body.currentPrice).toBe(200);
    expect(res.body.rsi).toBeGreaterThan(70);
    expect(res.body.signal).toBe('sell');
  });

  it('should return 200 with hold signal (30 <= RSI <= 70)', async () => {
    mockYahooFinanceInstance.quote.mockResolvedValue({ regularMarketPrice: 100 });
    // Balanced: 7 gains of 1, 7 losses of 1
    const changes = Array(7).fill(1).concat(Array(7).fill(-1));
    let closes = [100];
    changes.forEach((change) => closes.push(closes[closes.length - 1] + change));
    const historicalData = generateHistoricalData(closes.slice(-20));

    mockYahooFinanceInstance.historical.mockResolvedValue(historicalData);

    const res = await request(app).get('/analyze/MSFT').expect(200);

    expect(res.body.currentPrice).toBe(100);
    expect(res.body.rsi).toBeCloseTo(50, 1);
    expect(res.body.signal).toBe('hold');
  });

  it('should return 404 for invalid symbol (no price)', async () => {
    mockYahooFinanceInstance.quote.mockResolvedValue({});

    const res = await request(app).get('/analyze/INVALID').expect(404);

    expect(res.body.error).toBe('Invalid symbol or no data available');
  });

  it('should return 404 for insufficient historical data', async () => {
    mockYahooFinanceInstance.quote.mockResolvedValue({ regularMarketPrice: 150 });
    mockYahooFinanceInstance.historical.mockResolvedValue([]);

    const res = await request(app).get('/analyze/EMPTY').expect(404);

    expect(res.body.error).toBe('Insufficient historical data');
  });

  it('should return 404 for insufficient data for RSI (<15 days)', async () => {
    mockYahooFinanceInstance.quote.mockResolvedValue({ regularMarketPrice: 150 });
    const shortCloses = Array(14).fill(150); // 14 closes = 13 changes < 15 needed
    mockYahooFinanceInstance.historical.mockResolvedValue(generateHistoricalData(shortCloses));

    const res = await request(app).get('/analyze/SHORT').expect(404);

    expect(res.body.error).toBe('Insufficient data for RSI calculation (need at least 15 days)');
  });
});