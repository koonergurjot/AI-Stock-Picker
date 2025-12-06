# Data Seeding and Population Strategy

## Overview

This document outlines the comprehensive strategy for seeding and populating the AI Stock Picker database with historical data, ensuring optimal user experience from day one while maintaining data quality and system performance.

## Data Seeding Requirements

### Initial Data Requirements
1. **Watchlist Stocks**: Pre-populate all 50 stocks from the existing watchlist
2. **Historical Data**: Minimum 2 years of daily OHLCV data for RSI and moving average calculations
3. **Fundamentals**: Key financial metrics for long-term analysis
4. **Currency Rates**: Initial FX rates for CAD/USD conversion
5. **Indicators**: Pre-computed technical indicators for immediate analysis

### Data Quality Standards
- **Accuracy**: 99% data integrity with source validation
- **Completeness**: No missing trading days for major indices
- **Timeliness**: Daily updates within 4 hours of market close
- **Consistency**: Standardized data formats and currency conversions

## Seeding Strategy

### Phase 1: Core Watchlist Seeding

#### Watchlist Data Structure
```javascript
// lib/watchlist.js - Enhanced with metadata
const WATCHLIST = [
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    currency: 'USD',
    exchange: 'NASDAQ',
    priority: 'high',
    sectors: ['Technology', 'Consumer Electronics']
  },
  {
    symbol: 'MSFT', 
    name: 'Microsoft Corporation',
    currency: 'USD',
    exchange: 'NASDAQ',
    priority: 'high',
    sectors: ['Technology', 'Software']
  },
  // ... existing symbols with metadata
];
```

#### Seeding Script Architecture
```javascript
// scripts/seed-database.js
import { DatabaseService } from '../lib/database/DatabaseService.js';
import { DataSeeder } from '../lib/data/DataSeeder.js';
import { WATCHLIST } from '../lib/watchlist.js';

export class DatabaseSeeder {
  constructor(dbService) {
    this.dbService = dbService;
    this.seeder = new DataSeeder();
  }

  async seedInitialData() {
    console.log('🚀 Starting database seeding process...');
    
    try {
      // 1. Seed stock metadata
      await this.seedStockMetadata();
      
      // 2. Seed historical data (batch processing)
      await this.seedHistoricalData();
      
      // 3. Seed fundamentals
      await this.seedFundamentals();
      
      // 4. Seed currency rates
      await this.seedCurrencyRates();
      
      // 5. Pre-compute indicators
      await this.seedIndicators();
      
      console.log('✅ Database seeding completed successfully!');
      
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      throw error;
    }
  }

  async seedStockMetadata() {
    console.log('📝 Seeding stock metadata...');
    
    for (const stock of WATCHLIST) {
      try {
        await this.dbService.getOrCreateStock(stock.symbol, {
          name: stock.name,
          currency: stock.currency,
          exchange: stock.exchange,
          sectors: stock.sectors
        });
        console.log(`✓ Seeded metadata for ${stock.symbol}`);
      } catch (error) {
        console.error(`✗ Failed to seed ${stock.symbol}:`, error.message);
      }
    }
  }

  async seedHistoricalData() {
    console.log('📊 Seeding historical data...');
    
    const batchSize = 10; // Process 10 stocks at a time
    const yearsOfData = 2;
    
    for (let i = 0; i < WATCHLIST.length; i += batchSize) {
      const batch = WATCHLIST.slice(i, i + batchSize);
      
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(WATCHLIST.length/batchSize)}`);
      
      await Promise.all(batch.map(async (stock) => {
        try {
          const endDate = new Date();
          const startDate = new Date();
          startDate.setFullYear(endDate.getFullYear() - yearsOfData);
          
          // Check if data already exists
          const existingData = await this.dbService.getOHLCVWithCache(
            stock.symbol, startDate, endDate, 0 // No cache check
          );
          
          if (existingData && existingData.length > 250) { // ~1 year of trading days
            console.log(`✓ ${stock.symbol} already has sufficient historical data`);
            return;
          }
          
          // Fetch and save historical data
          const historicalData = await this.seeder.fetchHistoricalData(
            stock.symbol, startDate, endDate
          );
          
          if (historicalData && historicalData.length > 0) {
            await this.dbService.saveOHLCV(stock.symbol, historicalData);
            console.log(`✓ Seeded ${historicalData.length} days of data for ${stock.symbol}`);
          } else {
            console.log(`✗ No data available for ${stock.symbol}`);
          }
          
        } catch (error) {
          console.error(`✗ Failed to seed historical data for ${stock.symbol}:`, error.message);
        }
      }));
      
      // Add delay between batches to avoid rate limiting
      if (i + batchSize < WATCHLIST.length) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  async seedFundamentals() {
    console.log('💰 Seeding fundamentals...');
    
    for (const stock of WATCHLIST) {
      try {
        const fundamentals = await this.seeder.fetchFundamentals(stock.symbol);
        
        if (fundamentals && fundamentals.length > 0) {
          await this.dbService.saveFundamentals(stock.symbol, fundamentals);
          console.log(`✓ Seeded ${fundamentals.length} fundamental metrics for ${stock.symbol}`);
        }
        
      } catch (error) {
        console.error(`✗ Failed to seed fundamentals for ${stock.symbol}:`, error.message);
      }
    }
  }

  async seedCurrencyRates() {
    console.log('💱 Seeding currency rates...');
    
    const currencyPairs = [
      { from: 'CAD', to: 'USD' },
      { from: 'USD', to: 'CAD' }
    ];
    
    for (const pair of currencyPairs) {
      try {
        const rate = await this.seeder.fetchCurrencyRate(pair.from, pair.to);
        
        if (rate) {
          await this.dbService.saveCurrencyRate(
            pair.from, pair.to, rate, 
            new Date(Date.now() + 60 * 60 * 1000) // 1 hour expiry
          );
          console.log(`✓ Seeded ${pair.from}/${pair.to} rate: ${rate}`);
        }
        
      } catch (error) {
        console.error(`✗ Failed to seed ${pair.from}/${pair.to} rate:`, error.message);
      }
    }
  }

  async seedIndicators() {
    console.log('📈 Seeding technical indicators...');
    
    for (const stock of WATCHLIST) {
      try {
        // Get recent historical data
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 100);
        
        const historical = await this.dbService.getOHLCVWithCache(
          stock.symbol, startDate, endDate, 0
        );
        
        if (!historical || historical.length < 50) {
          console.log(`✗ Insufficient data to compute indicators for ${stock.symbol}`);
          continue;
        }
        
        // Compute and save indicators
        const indicators = await this.computeIndicators(historical);
        await this.dbService.saveIndicators(stock.symbol, indicators);
        
        console.log(`✓ Computed ${indicators.length} indicators for ${stock.symbol}`);
        
      } catch (error) {
        console.error(`✗ Failed to seed indicators for ${stock.symbol}:`, error.message);
      }
    }
  }

  async computeIndicators(historical) {
    const closes = historical.map(h => h.close);
    const dates = historical.map(h => h.date);
    
    const indicators = [];
    
    // RSI (14 periods)
    for (let i = 14; i < closes.length; i++) {
      const rsi = this.calculateRSI(closes.slice(0, i + 1));
      indicators.push({
        type: 'RSI',
        value: rsi,
        date: dates[i],
        parameters: JSON.stringify({ period: 14 })
      });
    }
    
    // SMA 50
    for (let i = 49; i < closes.length; i++) {
      const sma50 = this.calculateSMA(closes.slice(i - 49, i + 1));
      indicators.push({
        type: 'SMA50',
        value: sma50,
        date: dates[i],
        parameters: JSON.stringify({ period: 50 })
      });
    }
    
    // SMA 200
    for (let i = 199; i < closes.length; i++) {
      const sma200 = this.calculateSMA(closes.slice(i - 199, i + 1));
      indicators.push({
        type: 'SMA200',
        value: sma200,
        date: dates[i],
        parameters: JSON.stringify({ period: 200 })
      });
    }
    
    return indicators;
  }
}
```

### Phase 2: Incremental Data Population

#### Background Data Updater
```javascript
// lib/data/BackgroundUpdater.js
export class BackgroundUpdater {
  constructor(dbService, updateInterval = 60 * 60 * 1000) { // 1 hour
    this.dbService = dbService;
    this.updateInterval = updateInterval;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🔄 Starting background data updater...');
    
    // Initial update
    this.performUpdate();
    
    // Schedule periodic updates
    this.timer = setInterval(() => {
      this.performUpdate();
    }, this.updateInterval);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('🛑 Stopped background data updater');
  }

  async performUpdate() {
    try {
      console.log('🔄 Performing scheduled data update...');
      
      // Update watchlist stocks
      await this.updateWatchlistData();
      
      // Update currency rates
      await this.updateCurrencyRates();
      
      // Clean up expired cache
      await this.dbService.cleanupExpiredCache();
      
      console.log('✅ Scheduled update completed');
      
    } catch (error) {
      console.error('❌ Scheduled update failed:', error);
    }
  }

  async updateWatchlistData() {
    const watchlist = WATCHLIST.filter(s => s.priority === 'high');
    
    for (const stock of watchlist) {
      try {
        // Get last update date
        const lastRecord = await this.dbService.getLastOHLCVRecord(stock.symbol);
        const lastDate = lastRecord ? new Date(lastRecord.date) : null;
        
        // Only update if data is older than 1 day
        const now = new Date();
        if (!lastDate || now - lastDate > 24 * 60 * 60 * 1000) {
          const startDate = lastDate ? new Date(lastDate) : new Date();
          startDate.setDate(startDate.getDate() - 1);
          
          const endDate = new Date();
          
          const newData = await this.seeder.fetchHistoricalData(
            stock.symbol, startDate, endDate
          );
          
          if (newData && newData.length > 0) {
            await this.dbService.saveOHLCV(stock.symbol, newData);
            console.log(`✓ Updated ${newData.length} records for ${stock.symbol}`);
          }
        }
        
      } catch (error) {
        console.error(`✗ Failed to update ${stock.symbol}:`, error.message);
      }
    }
  }

  async updateCurrencyRates() {
    const pairs = [
      { from: 'CAD', to: 'USD' },
      { from: 'USD', to: 'CAD' }
    ];
    
    for (const pair of pairs) {
      try {
        const currentRate = await this.dbService.getCurrencyRate(pair.from, pair.to);
        
        // Check if rate is expired
        if (!currentRate || this.isRateExpired(currentRate)) {
          const newRate = await this.seeder.fetchCurrencyRate(pair.from, pair.to);
          
          if (newRate) {
            await this.dbService.saveCurrencyRate(
              pair.from, pair.to, newRate,
              new Date(Date.now() + 60 * 60 * 1000)
            );
            console.log(`✓ Updated ${pair.from}/${pair.to} rate: ${newRate}`);
          }
        }
        
      } catch (error) {
        console.error(`✗ Failed to update ${pair.from}/${pair.to} rate:`, error.message);
      }
    }
  }

  isRateExpired(rate) {
    // Check if rate has expired based on TTL
    return Date.now() > new Date(rate.expires_at).getTime();
  }
}
```

### Phase 3: On-Demand Data Population

#### Lazy Loading Strategy
```javascript
// lib/data/LazyLoader.js
export class LazyLoader {
  constructor(dbService) {
    this.dbService = dbService;
  }

  async ensureStockData(symbol, requiredDays = 365) {
    // Check if stock exists
    let stock = await this.dbService.getStock(symbol);
    if (!stock) {
      // Fetch basic stock info and create record
      const stockInfo = await this.fetchStockInfo(symbol);
      stock = await this.dbService.getOrCreateStock(symbol, stockInfo);
    }

    // Check if we have enough historical data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - requiredDays);
    
    const historical = await this.dbService.getOHLCVWithCache(
      symbol, startDate, endDate, 0
    );
    
    if (!historical || historical.length < requiredDays * 0.8) {
      // Fetch missing data
      console.log(`🔄 Fetching missing data for ${symbol}...`);
      
      const fullData = await this.fetchHistoricalData(symbol, startDate, endDate);
      
      if (fullData && fullData.length > 0) {
        await this.dbService.saveOHLCV(symbol, fullData);
        
        // Compute and save indicators
        const indicators = await this.computeIndicators(fullData);
        await this.dbService.saveIndicators(symbol, indicators);
        
        console.log(`✓ Populated ${fullData.length} records for ${symbol}`);
      }
    }
    
    return stock;
  }

  async fetchStockInfo(symbol) {
    // Fetch basic stock information from API
    const yahooFinance = new YahooFinance();
    const quote = await yahooFinance.quote(symbol);
    
    return {
      name: quote.shortName || quote.longName,
      currency: quote.currency || 'USD',
      exchange: quote.exchange || 'Unknown',
      isin: quote.isin || null
    };
  }

  async fetchHistoricalData(symbol, startDate, endDate) {
    const yahooFinance = new YahooFinance();
    
    return await yahooFinance.historical(symbol, {
      period1: Math.floor(startDate.getTime() / 1000),
      period2: Math.floor(endDate.getTime() / 1000),
      interval: '1d'
    });
  }

  async computeIndicators(historical) {
    // Same indicator computation logic as in seeder
    // ...
  }
}
```

## Data Quality Assurance

### Validation Pipeline
```javascript
// lib/data/DataValidator.js
export class DataValidator {
  static validateOHLCV(data) {
    const errors = [];
    
    data.forEach((day, index) => {
      // Check for missing values
      if (!day.date || !day.open || !day.high || !day.low || !day.close || !day.volume) {
        errors.push(`Missing values at index ${index}`);
      }
      
      // Check price relationships
      if (day.low > day.high) {
        errors.push(`Invalid price range at ${day.date}: low > high`);
      }
      
      if (day.close < day.low || day.close > day.high) {
        errors.push(`Close price outside range at ${day.date}`);
      }
      
      // Check for reasonable volume
      if (day.volume < 0) {
        errors.push(`Negative volume at ${day.date}`);
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static validateFundamentals(data) {
    const errors = [];
    
    data.forEach((metric, index) => {
      if (!metric.metric_type || metric.value === null || metric.value === undefined) {
        errors.push(`Invalid fundamental at index ${index}`);
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static detectAnomalies(data, threshold = 3) {
    // Detect outliers using Z-score
    const closes = data.map(d => d.close);
    const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
    const stdDev = Math.sqrt(
      closes.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / closes.length
    );
    
    const anomalies = [];
    closes.forEach((price, index) => {
      const zScore = Math.abs((price - mean) / stdDev);
      if (zScore > threshold) {
        anomalies.push({
          index,
          date: data[index].date,
          price,
          zScore
        });
      }
    });
    
    return anomalies;
  }
}
```

## Performance Optimization

### Batch Processing Strategy
```javascript
// scripts/batch-processor.js
export class BatchProcessor {
  constructor(dbService, batchSize = 50, delay = 1000) {
    this.dbService = dbService;
    this.batchSize = batchSize;
    this.delay = delay;
  }

  async processInBatches(items, processor, description) {
    console.log(`🔄 Processing ${items.length} ${description} in batches...`);
    
    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      
      console.log(`Processing batch ${Math.floor(i/this.batchSize) + 1}/${Math.ceil(items.length/this.batchSize)}`);
      
      await Promise.all(batch.map(item => processor(item)));
      
      // Delay between batches to avoid overwhelming the system
      if (i + this.batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, this.delay));
      }
    }
    
    console.log(`✅ Completed processing ${description}`);
  }
}
```

## Monitoring and Maintenance

### Data Health Monitoring
```javascript
// lib/monitoring/DataHealthMonitor.js
export class DataHealthMonitor {
  constructor(dbService) {
    this.dbService = dbService;
  }

  async generateHealthReport() {
    const report = {
      timestamp: new Date().toISOString(),
      stocks: await this.checkStockCoverage(),
      dataFreshness: await this.checkDataFreshness(),
      dataQuality: await this.checkDataQuality(),
      cachePerformance: await this.checkCachePerformance()
    };
    
    return report;
  }

  async checkStockCoverage() {
    const totalStocks = WATCHLIST.length;
    const populatedStocks = await this.dbService.getPopulatedStockCount();
    
    return {
      total: totalStocks,
      populated: populatedStocks,
      coverage: (populatedStocks / totalStocks) * 100,
      missing: await this.dbService.getMissingStocks()
    };
  }

  async checkDataFreshness() {
    const freshness = await this.dbService.getDataFreshness();
    
    return {
      averageAge: freshness.averageAge,
      oldestRecord: freshness.oldestRecord,
      staleStocks: freshness.staleStocks
    };
  }

  async checkDataQuality() {
    const quality = await this.dbService.getDataQuality();
    
    return {
      completeness: quality.completeness,
      accuracy: quality.accuracy,
      anomalies: quality.anomalies
    };
  }

  async checkCachePerformance() {
    return await this.dbService.getCachePerformance();
  }
}
```

## Seeding Execution Plan

### Development Environment
```bash
#!/bin/bash
# seed-dev.sh

echo "🌱 Seeding development database..."

# Run migrations
sqlite3 database/data/ai-stock-picker.db < database/migrations/001_initial_schema.sql

# Seed initial data (smaller dataset for development)
node -e "
import { DatabaseService } from './lib/database/DatabaseService.js';
import { DatabaseSeeder } from './scripts/seed-database.js';

const db = new DatabaseService(process.env.DB);
const seeder = new DatabaseSeeder(db);

// Seed only high-priority stocks for development
const devWatchlist = WATCHLIST.filter(s => s.priority === 'high').slice(0, 10);
await seeder.seedInitialData(devWatchlist);

console.log('Development seeding complete!');
"
```

### Production Environment
```bash
#!/bin/bash
# seed-prod.sh

echo "🚀 Seeding production database..."

# Create backup before seeding
wrangler d1 backup create ai-stock-picker-db --name "pre-seeding-backup-$(date +%Y%m%d-%H%M%S)"

# Run migrations
wrangler d1 execute ai-stock-picker-db --file=database/migrations/001_initial_schema.sql

# Seed full dataset
node -e "
import { DatabaseService } from './lib/database/DatabaseService.js';
import { DatabaseSeeder } from './scripts/seed-database.js';

const db = new DatabaseService(process.env.DB);
const seeder = new DatabaseSeeder(db);

await seeder.seedInitialData(WATCHLIST);

console.log('Production seeding complete!');
"
```

This comprehensive data seeding strategy ensures the AI Stock Picker has rich, high-quality data from day one while maintaining system performance and enabling continuous data updates.