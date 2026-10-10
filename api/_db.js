// Shared Azure SQL helpers. Files prefixed with "_" are not exposed as Vercel routes.
const sql = require('mssql');

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Quote a (possibly schema-qualified) identifier, e.g. dbo.StockHistory -> [dbo].[StockHistory]
function quoteIdent(name) {
  const parts = String(name).split('.');
  if (!parts.every((p) => IDENT.test(p))) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return parts.map((p) => `[${p}]`).join('.');
}

const schema = {
  table: process.env.STOCK_TABLE || 'dbo.StockHistory',
  symbolColumn: process.env.SYMBOL_COLUMN || 'Symbol',
  dateColumn: process.env.DATE_COLUMN || 'Date',
  closeColumn: process.env.CLOSE_COLUMN || 'Close',
};

const config = {
  server: process.env.AZURE_SQL_SERVER,
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  port: Number(process.env.AZURE_SQL_PORT || 1433),
  options: { encrypt: true, trustServerCertificate: false },
  // Azure SQL serverless can take a while to resume from auto-pause.
  connectionTimeout: 30000,
  requestTimeout: 30000,
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

// Reuse the pool across warm invocations of the same function instance.
let poolPromise = globalThis.__azureSqlPool;

function getPool() {
  if (!config.server || !config.database || !config.user || !config.password) {
    throw new Error('Missing AZURE_SQL_* environment variables');
  }
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect().catch((err) => {
      poolPromise = globalThis.__azureSqlPool = undefined;
      throw err;
    });
    globalThis.__azureSqlPool = poolPromise;
  }
  return poolPromise;
}

function sendError(res, err) {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal error' });
}

module.exports = { sql, getPool, quoteIdent, schema, sendError };
