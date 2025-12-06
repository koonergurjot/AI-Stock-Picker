// scripts/migrate.js
// Database migration script for setting up the schema

import { createDatabaseService } from '../lib/database/DatabaseService.js';
import winston from 'winston';

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'migration' },
  transports: [
    new winston.transports.File({ filename: 'migration.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Migration SQL scripts
const migrations = [
  {
    id: '001_initial_schema',
    description: 'Initial database schema',
    sql: `
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
          adjusted_close REAL,
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

      -- Indicators table - Computed technical indicators
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

      -- Currency rates table - FX conversion rates
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

      -- Cache metadata table - TTL and cache management
      CREATE TABLE IF NOT EXISTS cache_metadata (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cache_key TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMP NOT NULL,
          data_type TEXT,
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
    `
  },
  {
    id: '002_performance_optimization',
    description: 'Performance optimization and statistics tables',
    sql: `
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

      -- Add indexes for better query performance
      CREATE INDEX IF NOT EXISTS idx_ohlcv_stock_date_volume ON ohlcv_data(stock_id, date, volume);
      CREATE INDEX IF NOT EXISTS idx_currency_expires ON currency_rates(expires_at);
      CREATE INDEX IF NOT EXISTS idx_indicators_stock_date_type ON indicators(stock_id, date, indicator_type);
    `
  },
  {
    id: '003_advanced_features',
    description: 'Advanced features - user preferences and alerts',
    sql: `
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
          alert_type TEXT NOT NULL,
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
          notification_method TEXT NOT NULL,
          status TEXT DEFAULT 'PENDING',
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
    `
  }
];

/**
 * Run migrations
 * @param {DatabaseService} dbService - Database service instance
 */
async function runMigrations(dbService) {
  logger.info('Starting database migrations...');

  for (const migration of migrations) {
    try {
      logger.info(`Running migration: ${migration.id} - ${migration.description}`);

      // Execute the migration SQL
      if (dbService.isProduction()) {
        // For D1, execute each statement separately
        const statements = migration.sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
        
        for (const statement of statements) {
          try {
            await dbService.getDatabase().executeNonQuery(statement, [], `migration_${migration.id}`);
          } catch (error) {
            logger.warn(`Migration statement warning`, { 
              migration: migration.id, 
              statement: statement.substring(0, 100), 
              error: error.message 
            });
          }
        }
      } else {
        // For SQLite, execute the full script
        await dbService.getDatabase().executeNonQuery(migration.sql, [], `migration_${migration.id}`);
      }

      logger.info(`Migration completed: ${migration.id}`);
    } catch (error) {
      logger.error(`Migration failed: ${migration.id}`, { error: error.message });
      throw error;
    }
  }

  logger.info('All migrations completed successfully!');
}

/**
 * Validate database schema
 * @param {DatabaseService} dbService - Database service instance
 */
async function validateSchema(dbService) {
  logger.info('Validating database schema...');

  try {
    // Check table existence
    const tables = ['stocks', 'ohlcv_data', 'fundamentals', 'indicators', 'currency_rates', 'cache_metadata'];
    
    for (const table of tables) {
      const result = await dbService.getDatabase().executeSingleRow(
        `SELECT COUNT(*) as count FROM ${table}`,
        [],
        `validate_${table}`
      );
      
      logger.info(`Table ${table}: ${result?.count || 0} records`);
    }

    // Check foreign key constraints
    if (!dbService.isProduction()) {
      const fkCheck = await dbService.getDatabase().executeQuery(
        'PRAGMA foreign_key_check',
        [],
        'validate_foreign_keys'
      );
      
      if (fkCheck?.results?.length > 0) {
        logger.warn('Foreign key constraint violations found', { violations: fkCheck.results });
      } else {
        logger.info('Foreign key constraints: OK');
      }
    }

    // Check indexes
    const indexChecks = [
      'idx_ohlcv_stock_date',
      'idx_ohlcv_date',
      'idx_fundamentals_stock_type',
      'idx_indicators_stock_type',
      'idx_cache_expires'
    ];

    for (const index of indexChecks) {
      try {
        await dbService.getDatabase().executeQuery(`SELECT 1 FROM ${index} LIMIT 1`, [], `validate_${index}`);
        logger.info(`Index ${index}: OK`);
      } catch (error) {
        logger.warn(`Index ${index}: Not found or invalid`, { error: error.message });
      }
    }

    logger.info('Schema validation completed');
  } catch (error) {
    logger.error('Schema validation failed', { error: error.message });
    throw error;
  }
}

/**
 * Main migration function
 */
async function main() {
  const environment = process.env.ENVIRONMENT || 'development';
  logger.info(`Starting migrations for environment: ${environment}`);

  try {
    // Initialize database service
    const dbService = createDatabaseService(null, environment);
    
    if (environment === 'development') {
      // Initialize SQLite database
      await dbService.getDatabase().init();
    }

    // Run migrations
    await runMigrations(dbService);

    // Validate schema
    await validateSchema(dbService);

    // Get final health status
    const health = await dbService.getHealthStatus();
    logger.info('Database health check', { health });

    logger.info('Migration process completed successfully!');
  } catch (error) {
    logger.error('Migration process failed', { error: error.message });
    process.exit(1);
  }
}

// Run migrations if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { runMigrations, validateSchema };