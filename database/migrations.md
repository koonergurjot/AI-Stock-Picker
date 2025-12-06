# Database Migration Scripts

## Migration 001: Initial Schema

```sql
-- Initial database schema for AI Stock Picker
-- Supports both Cloudflare D1 and SQLite

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Stocks table - Master stock information
CREATE TABLE IF NOT EXISTS stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL UNIQUE,
    name TEXT,
    currency TEXT DEFAULT 'USD',
    exchange TEXT,
    isin TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OHLCV data table - Historical price data
CREATE TABLE IF NOT EXISTS ohlcv_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL,
    date DATE NOT NULL,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    volume INTEGER,
    adjusted_close REAL, -- Post-split/dividend adjustment
    split_ratio REAL DEFAULT 1.0,
    dividend REAL DEFAULT 0.0,
    currency TEXT DEFAULT 'USD',
    data_source TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stock_id) REFERENCES stocks(id),
    UNIQUE(stock_id, date) ON CONFLICT REPLACE
);

-- Fundamentals table - Company financial data
CREATE TABLE IF NOT EXISTS fundamentals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL,
    metric_type TEXT NOT NULL, -- 'PE', 'EPS', 'MarketCap', etc.
    value REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    period_ending DATE,
    reported_date DATE,
    data_source TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stock_id) REFERENCES stocks(id),
    UNIQUE(stock_id, metric_type, period_ending) ON CONFLICT REPLACE
);

-- Indicators table - Computed technical indicators
CREATE TABLE IF NOT EXISTS indicators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER NOT NULL,
    indicator_type TEXT NOT NULL, -- 'RSI', 'SMA50', 'MACD', etc.
    value REAL NOT NULL,
    date DATE NOT NULL,
    parameters TEXT, -- JSON string of calculation parameters
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stock_id) REFERENCES stocks(id),
    UNIQUE(stock_id, indicator_type, date, parameters) ON CONFLICT REPLACE
);

-- Currency rates table - FX conversion rates
CREATE TABLE IF NOT EXISTS currency_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    rate REAL NOT NULL,
    source_rate REAL, -- Original API rate before caching
    expires_at TIMESTAMP NOT NULL,
    data_source TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_currency, to_currency) ON CONFLICT REPLACE
);

-- Cache metadata table - TTL and cache management
CREATE TABLE IF NOT EXISTS cache_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    data_type TEXT, -- 'OHLCV', 'FUNDAMENTALS', 'INDICATORS'
    access_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_ohlcv_stock_date ON ohlcv_data(stock_id, date);
CREATE INDEX IF NOT EXISTS idx_ohlcv_date ON ohlcv_data(date);
CREATE INDEX IF NOT EXISTS idx_fundamentals_stock_type ON fundamentals(stock_id, metric_type);
CREATE INDEX IF NOT EXISTS idx_indicators_stock_type ON indicators(stock_id, indicator_type);
CREATE INDEX IF NOT EXISTS idx_indicators_date ON indicators(date);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_metadata(expires_at);
CREATE INDEX IF NOT EXISTS idx_currency_pair ON currency_rates(from_currency, to_currency);

-- Triggers for automatic timestamp updates
CREATE TRIGGER IF NOT EXISTS update_stocks_timestamp 
AFTER UPDATE ON stocks
FOR EACH ROW 
BEGIN
    UPDATE stocks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_cache_access 
AFTER UPDATE ON cache_metadata
FOR EACH ROW 
BEGIN
    UPDATE cache_metadata SET last_accessed = CURRENT_TIMESTAMP, access_count = access_count + 1 WHERE id = NEW.id;
END;
```

## Migration 002: Performance Optimization

```sql
-- Performance optimization migration
-- Add composite indexes for common query patterns

-- Index for RSI calculations (date range queries)
CREATE INDEX IF NOT EXISTS idx_ohlcv_stock_date_volume ON ohlcv_data(stock_id, date, volume);

-- Index for currency conversion queries
CREATE INDEX IF NOT EXISTS idx_currency_expires ON currency_rates(expires_at);

-- Index for indicator date range queries
CREATE INDEX IF NOT EXISTS idx_indicators_stock_date_type ON indicators(stock_id, date, indicator_type);

-- Add statistics table for cache performance monitoring
CREATE TABLE IF NOT EXISTS cache_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    cache_hits INTEGER DEFAULT 0,
    cache_misses INTEGER DEFAULT 0,
    total_requests INTEGER DEFAULT 0,
    hit_rate REAL DEFAULT 0.0,
    avg_response_time REAL DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date)
);

-- Add data quality tracking table
CREATE TABLE IF NOT EXISTS data_quality (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_count INTEGER DEFAULT 0,
    missing_values INTEGER DEFAULT 0,
    invalid_records INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Migration 003: Advanced Features

```sql
-- Advanced features migration
-- Add support for user preferences and alerts

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    preference_key TEXT NOT NULL,
    preference_value TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, preference_key)
);

-- Stock alerts table
CREATE TABLE IF NOT EXISTS stock_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    stock_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL, -- 'PRICE_ABOVE', 'PRICE_BELOW', 'RSI_OVERBOUGHT', 'RSI_OVERSOLD'
    threshold_value REAL NOT NULL,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    triggered_at TIMESTAMP,
    FOREIGN KEY (stock_id) REFERENCES stocks(id)
);

-- Alert notifications table
CREATE TABLE IF NOT EXISTS alert_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id INTEGER NOT NULL,
    notification_time TIMESTAMP NOT NULL,
    notification_method TEXT NOT NULL, -- 'EMAIL', 'PUSH', 'SMS'
    status TEXT DEFAULT 'PENDING', -- 'SENT', 'FAILED', 'DELIVERED'
    message TEXT,
    FOREIGN KEY (alert_id) REFERENCES stock_alerts(id)
);

-- Portfolio tracking table
CREATE TABLE IF NOT EXISTS portfolios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    portfolio_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Portfolio holdings table
CREATE TABLE IF NOT EXISTS portfolio_holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id INTEGER NOT NULL,
    stock_id INTEGER NOT NULL,
    quantity REAL NOT NULL,
    average_cost REAL NOT NULL,
    purchase_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id),
    FOREIGN KEY (stock_id) REFERENCES stocks(id),
    UNIQUE(portfolio_id, stock_id)
);

-- Create indexes for new tables
CREATE INDEX IF NOT EXISTS idx_alerts_user_active ON stock_alerts(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_portfolio_user ON portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_holdings_portfolio ON portfolio_holdings(portfolio_id);
```

## Migration Execution Scripts

### Development (SQLite)

```bash
#!/bin/bash
# migrate-dev.sh

echo "Running database migrations for development..."

# Create database directory if it doesn't exist
mkdir -p database/data

# Run migrations
sqlite3 database/data/ai-stock-picker.db << 'EOF'
.read database/migrations/001_initial_schema.sql
.read database/migrations/002_performance.sql
.read database/migrations/003_advanced_features.sql
EOF

echo "Development migrations completed!"
```

### Production (Cloudflare D1)

```bash
#!/bin/bash
# migrate-prod.sh

echo "Running database migrations for production..."

# Check if database exists
wrangler d1 list

# Execute migrations
wrangler d1 execute ai-stock-picker-db --file=database/migrations/001_initial_schema.sql
wrangler d1 execute ai-stock-picker-db --file=database/migrations/002_performance.sql
wrangler d1 execute ai-stock-picker-db --file=database/migrations/003_advanced_features.sql

echo "Production migrations completed!"
```

## Rollback Procedures

### Rollback Script

```bash
#!/bin/bash
# rollback.sh

ENVIRONMENT=${1:-development}
STEP=${2:-1}

echo "Rolling back migration step $STEP for $ENVIRONMENT environment..."

if [ "$ENVIRONMENT" = "production" ]; then
    echo "⚠️  Production rollback requires manual approval!"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Rollback cancelled."
        exit 1
    fi
    
    case $STEP in
        1)
            wrangler d1 execute ai-stock-picker-db --command="DROP TABLE IF EXISTS portfolio_holdings;"
            wrangler d1 execute ai-stock-picker-db --command="DROP TABLE IF EXISTS portfolios;"
            wrangler d1 execute ai-stock-picker-db --command="DROP TABLE IF EXISTS alert_notifications;"
            wrangler d1 execute ai-stock-picker-db --command="DROP TABLE IF EXISTS stock_alerts;"
            wrangler d1 execute ai-stock-picker-db --command="DROP TABLE IF EXISTS user_preferences;"
            ;;
        2)
            wrangler d1 execute ai-stock-picker-db --command="DROP TABLE IF EXISTS data_quality;"
            wrangler d1 execute ai-stock-picker-db --command="DROP TABLE IF EXISTS cache_statistics;"
            ;;
        3)
            wrangler d1 execute ai-stock-picker-db --command="DROP TRIGGER IF EXISTS update_cache_access;"
            wrangler d1 execute ai-stock-picker-db --command="DROP TRIGGER IF EXISTS update_stocks_timestamp;"
            wrangler d1 execute ai-stock-picker-db --command="DROP INDEX IF EXISTS idx_currency_pair;"
            wrangler d1 execute ai-stock-picker-db --command="DROP INDEX IF EXISTS idx_cache_expires;"
            wrangler d1 execute ai-stock-picker-db --command="DROP INDEX IF EXISTS idx_indicators_date;"
            wrangler d1 execute ai-stock-picker-db --command="DROP INDEX IF EXISTS idx_indicators_stock_type;"
            wrangler d1 execute ai-stock-picker-db --command="DROP INDEX IF EXISTS idx_fundamentals_stock_type;"
            wrangler d1 execute ai-stock-picker-db --command="DROP INDEX IF EXISTS idx_ohlcv_date;"
            wrangler d1 execute ai-stock-picker-db --command="DROP INDEX IF EXISTS idx_ohlcv_stock_date;"
            ;;
        *)
            echo "Invalid rollback step"
            exit 1
            ;;
    esac
else
    case $STEP in
        1)
            sqlite3 database/data/ai-stock-picker.db "DROP TABLE IF EXISTS portfolio_holdings;"
            sqlite3 database/data/ai-stock-picker.db "DROP TABLE IF EXISTS portfolios;"
            sqlite3 database/data/ai-stock-picker.db "DROP TABLE IF EXISTS alert_notifications;"
            sqlite3 database/data/ai-stock-picker.db "DROP TABLE IF EXISTS stock_alerts;"
            sqlite3 database/data/ai-stock-picker.db "DROP TABLE IF EXISTS user_preferences;"
            ;;
        2)
            sqlite3 database/data/ai-stock-picker.db "DROP TABLE IF EXISTS data_quality;"
            sqlite3 database/data/ai-stock-picker.db "DROP TABLE IF EXISTS cache_statistics;"
            ;;
        3)
            sqlite3 database/data/ai-stock-picker.db "DROP TRIGGER IF EXISTS update_cache_access;"
            sqlite3 database/data/ai-stock-picker.db "DROP TRIGGER IF EXISTS update_stocks_timestamp;"
            sqlite3 database/data/ai-stock-picker.db "DROP INDEX IF EXISTS idx_currency_pair;"
            sqlite3 database/data/ai-stock-picker.db "DROP INDEX IF EXISTS idx_cache_expires;"
            sqlite3 database/data/ai-stock-picker.db "DROP INDEX IF EXISTS idx_indicators_date;"
            sqlite3 database/data/ai-stock-picker.db "DROP INDEX IF EXISTS idx_indicators_stock_type;"
            sqlite3 database/data/ai-stock-picker.db "DROP INDEX IF EXISTS idx_fundamentals_stock_type;"
            sqlite3 database/data/ai-stock-picker.db "DROP INDEX IF EXISTS idx_ohlcv_date;"
            sqlite3 database/data/ai-stock-picker.db "DROP INDEX IF EXISTS idx_ohlcv_stock_date;"
            ;;
        *)
            echo "Invalid rollback step"
            exit 1
            ;;
    esac
fi

echo "Rollback completed for step $STEP!"
```

## Migration Validation

### Health Check Script

```sql
-- health-check.sql
-- Validate database integrity after migrations

-- Check table existence
SELECT 'stocks' as table_name, COUNT(*) as record_count FROM stocks
UNION ALL
SELECT 'ohlcv_data' as table_name, COUNT(*) as record_count FROM ohlcv_data
UNION ALL
SELECT 'fundamentals' as table_name, COUNT(*) as record_count FROM fundamentals
UNION ALL
SELECT 'indicators' as table_name, COUNT(*) as record_count FROM indicators
UNION ALL
SELECT 'currency_rates' as table_name, COUNT(*) as record_count FROM currency_rates
UNION ALL
SELECT 'cache_metadata' as table_name, COUNT(*) as record_count FROM cache_metadata;

-- Check foreign key constraints
PRAGMA foreign_key_check;

-- Check index existence
SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%';

-- Validate data integrity
SELECT 
    s.symbol,
    COUNT(od.id) as ohlcv_records,
    COUNT(f.id) as fundamentals_records,
    COUNT(i.id) as indicators_records
FROM stocks s
LEFT JOIN ohlcv_data od ON s.id = od.stock_id
LEFT JOIN fundamentals f ON s.id = f.stock_id
LEFT JOIN indicators i ON s.id = i.stock_id
GROUP BY s.id, s.symbol
ORDER BY ohlcv_records DESC
LIMIT 10;
```

## Migration Best Practices

1. **Backup Before Migration**: Always backup the database before running migrations
2. **Test in Development**: Test all migrations in a development environment first
3. **Rollback Plan**: Always have a rollback plan for each migration
4. **Monitor Performance**: Monitor query performance after adding indexes
5. **Data Validation**: Validate data integrity after each migration step
6. **Documentation**: Document all migration steps and their purposes

## Migration Timeline

- **Week 1**: Run migration 001 (Initial Schema)
- **Week 2**: Run migration 002 (Performance Optimization)
- **Week 3**: Run migration 003 (Advanced Features)
- **Ongoing**: Add new migrations as features are developed