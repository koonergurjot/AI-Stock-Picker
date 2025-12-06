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
    UPDATE cache_metadata SET last_accessed = CURRENT_TIMESTAMP, access_count = access_count + 1 WHERE id = NEW.id;
END;
