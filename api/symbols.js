// GET /api/symbols -> distinct ticker symbols in the history table
const { getPool, quoteIdent, schema, sendError } = require('./_db');

module.exports = async (req, res) => {
  try {
    const table = quoteIdent(schema.table);
    const symbolCol = quoteIdent(schema.symbolColumn);

    const pool = await getPool();
    const result = await pool
      .request()
      .query(`SELECT DISTINCT ${symbolCol} AS symbol FROM ${table} ORDER BY ${symbolCol}`);

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    res.status(200).json({ symbols: result.recordset.map((r) => r.symbol) });
  } catch (err) {
    sendError(res, err);
  }
};
