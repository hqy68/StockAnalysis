// GET /api/config -> the app's environment variables, for checking a deployment.
// The password is never returned; only whether it is set.
const { sendError } = require('./_db');

const NAMES = [
  'AZURE_SQL_SERVER',
  'AZURE_SQL_DATABASE',
  'AZURE_SQL_USER',
  'AZURE_SQL_PORT',
  'STOCK_TABLE',
  'SYMBOL_COLUMN',
  'DATE_COLUMN',
  'OPEN_COLUMN',
  'HIGH_COLUMN',
  'LOW_COLUMN',
  'CLOSE_COLUMN',
  'VOLUME_COLUMN',
  'VERCEL_ENV',
];

module.exports = (req, res) => {
  try {
    const env = {};
    for (const name of NAMES) env[name] = process.env[name] ?? null;
    env.AZURE_SQL_PASSWORD = process.env.AZURE_SQL_PASSWORD ? '(set, hidden)' : null;

    // The same settings api/_db.js connects with, as an ADO.NET-style string.
    const server = env.AZURE_SQL_SERVER || '(not set)';
    const database = env.AZURE_SQL_DATABASE || '(not set)';
    const port = Number(env.AZURE_SQL_PORT || 1433);
    const connectionString = [
      `Server=tcp:${server},${port}`,
      `Initial Catalog=${database}`,
      `User ID=${env.AZURE_SQL_USER || '(not set)'}`,
      `Password=${env.AZURE_SQL_PASSWORD ? '********' : '(not set)'}`,
      'Encrypt=True',
      'TrustServerCertificate=False',
      'Connection Timeout=30',
    ].join(';') + ';';

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ connection: { server, database, port, connectionString }, env });
  } catch (err) {
    sendError(res, err);
  }
};
