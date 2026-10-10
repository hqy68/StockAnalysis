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
  'CLOSE_COLUMN',
  'VERCEL_ENV',
];

module.exports = (req, res) => {
  try {
    const env = {};
    for (const name of NAMES) env[name] = process.env[name] ?? null;
    env.AZURE_SQL_PASSWORD = process.env.AZURE_SQL_PASSWORD ? '(set, hidden)' : null;

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ env });
  } catch (err) {
    sendError(res, err);
  }
};
