// GET /api/history?symbol=MSFT&from=2024-01-01&to=2024-12-31&limit=500
const { sql, getPool, quoteIdent, schema, sendError } = require('./_db');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

module.exports = async (req, res) => {
  try {
    const { symbol, from, to } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 5000);

    const table = quoteIdent(schema.table);
    const symbolCol = quoteIdent(schema.symbolColumn);
    const dateCol = quoteIdent(schema.dateColumn);

    const pool = await getPool();
    const request = pool.request().input('limit', sql.Int, limit);
    const where = [];

    if (symbol) {
      request.input('symbol', sql.NVarChar(32), String(symbol).trim());
      where.push(`${symbolCol} = @symbol`);
    }
    if (from) {
      if (!DATE_RE.test(from)) return res.status(400).json({ error: 'from must be YYYY-MM-DD' });
      request.input('from', sql.Date, from);
      where.push(`${dateCol} >= @from`);
    }
    if (to) {
      if (!DATE_RE.test(to)) return res.status(400).json({ error: 'to must be YYYY-MM-DD' });
      request.input('to', sql.Date, to);
      where.push(`${dateCol} <= @to`);
    }

    const query = `
      SELECT TOP (@limit) *
      FROM ${table}
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ${dateCol} DESC`;

    const result = await request.query(query);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({
      columns: Object.keys(result.recordset.columns || {}),
      meta: {
        symbolColumn: schema.symbolColumn,
        dateColumn: schema.dateColumn,
        closeColumn: schema.closeColumn,
      },
      rows: result.recordset,
    });
  } catch (err) {
    sendError(res, err);
  }
};
