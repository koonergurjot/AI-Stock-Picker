import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '../database/data/ai-stock-picker.db');

console.log('Checking database at:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    return;
  }
  console.log('Connected to SQLite database');
  
  // Check if tables exist
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
      console.error('Error checking tables:', err.message);
      return;
    }
    
    console.log('Tables found:', tables.map(t => t.name));
    
    if (tables.length === 0) {
      console.log('No tables found. Running migration...');
      
      // Run the migration SQL
      const migrationSQL = `
        PRAGMA foreign_keys = ON;

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

        CREATE TABLE IF NOT EXISTS ohlcv_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stock_id INTEGER NOT NULL,
            date DATE NOT NULL,
            open REAL,
            high REAL,
            low REAL,
            close REAL,
            volume INTEGER,
            adjusted_close REAL,
            split_ratio REAL DEFAULT 1.0,
            dividend REAL DEFAULT 0.0,
            currency TEXT DEFAULT 'USD',
            data_source TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (stock_id) REFERENCES stocks(id),
            UNIQUE(stock_id, date) ON CONFLICT REPLACE
        );

        CREATE TABLE IF NOT EXISTS fundamentals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stock_id INTEGER NOT NULL,
            metric_type TEXT NOT NULL,
            value REAL NOT NULL,
            currency TEXT DEFAULT 'USD',
            period_ending DATE,
            reported_date DATE,
            data_source TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (stock_id) REFERENCES stocks(id),
            UNIQUE(stock_id, metric_type, period_ending) ON CONFLICT REPLACE
        );

        CREATE TABLE IF NOT EXISTS indicators (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stock_id INTEGER NOT NULL,
            indicator_type TEXT NOT NULL,
            value REAL NOT NULL,
            date DATE NOT NULL,
            parameters TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (stock_id) REFERENCES stocks(id),
            UNIQUE(stock_id, indicator_type, date, parameters) ON CONFLICT REPLACE
        );

        CREATE TABLE IF NOT EXISTS currency_rates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_currency TEXT NOT NULL,
            to_currency TEXT NOT NULL,
            rate REAL NOT NULL,
            source_rate REAL,
            expires_at TIMESTAMP NOT NULL,
            data_source TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(from_currency, to_currency) ON CONFLICT REPLACE
        );

        CREATE TABLE IF NOT EXISTS cache_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cache_key TEXT NOT NULL UNIQUE,
            expires_at TIMESTAMP NOT NULL,
            data_type TEXT,
            access_count INTEGER DEFAULT 0,
            last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_ohlcv_stock_date ON ohlcv_data(stock_id, date);
        CREATE INDEX IF NOT EXISTS idx_ohlcv_date ON ohlcv_data(date);
        CREATE INDEX IF NOT EXISTS idx_fundamentals_stock_type ON fundamentals(stock_id, metric_type);
        CREATE INDEX IF NOT EXISTS idx_indicators_stock_type ON indicators(stock_id, indicator_type);
        CREATE INDEX IF NOT EXISTS idx_indicators_date ON indicators(date);
        CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_metadata(expires_at);
        CREATE INDEX IF NOT EXISTS idx_currency_pair ON currency_rates(from_currency, to_currency);
      `;
      
      db.exec(migrationSQL, (err) => {
        if (err) {
          console.error('Error running migration:', err.message);
          return;
        }
        
        console.log('Migration completed successfully!');
        
        // Check tables again
        db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
          if (err) {
            console.error('Error checking tables after migration:', err.message);
            return;
          }
          
          console.log('Tables after migration:', tables.map(t => t.name));
          db.close();
        });
      });
    } else {
      console.log('Database already has tables');
      db.close();
    }
  });
});