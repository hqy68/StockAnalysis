# Stock History (Azure SQL → Vercel)

A small website that reads a stock history table from Azure SQL and shows it as a table, chart and summary stats.

| Path | Runtime | Purpose |
|---|---|---|
| `public/` | static | Frontend (HTML/CSS/JS + Chart.js) |
| `api/history.js` | Node.js | `GET /api/history?symbol=&from=&to=&limit=`: rows from Azure SQL |
| `api/symbols.js` | Node.js | `GET /api/symbols`: distinct ticker symbols |
| `api/stats.py` | Python | `POST /api/stats`: returns, volatility, Sharpe, drawdown, SMA20/50 |
| `api/_db.js` | — | Shared connection pool (not a route) |

## Expected table

By default the app expects a table like this one. Override the names with environment variables:

```sql
CREATE TABLE dbo.StockHistory (
  Symbol NVARCHAR(16) NOT NULL,
  [Date] DATE NOT NULL,
  [Open] DECIMAL(18,4), High DECIMAL(18,4), Low DECIMAL(18,4),
  [Close] DECIMAL(18,4), Volume BIGINT,
  PRIMARY KEY (Symbol, [Date])
);
```

The API returns all columns (`SELECT *`), and the table view renders whatever columns come back.

## Environment variables

See `.env.example`. Required: `AZURE_SQL_SERVER`, `AZURE_SQL_DATABASE`, `AZURE_SQL_USER`, `AZURE_SQL_PASSWORD`.
Optional: `STOCK_TABLE`, `SYMBOL_COLUMN`, `DATE_COLUMN`, `CLOSE_COLUMN`.

## Azure SQL firewall

Vercel functions don't use fixed outbound IPs. In the Azure Portal, open your SQL server, go to **Networking**, and enable
**"Allow Azure services and resources to access this server"**. If that doesn't work, add a firewall rule that allows
`0.0.0.0 – 255.255.255.255`, and use a SQL login with **read-only** permissions (`db_datareader`).

## Run locally

```bash
npm install
npm i -g vercel
cp .env.example .env   # fill in your values
vercel dev             # http://localhost:3000
```

## Deploy

```bash
vercel                 # link/create the project
vercel env add AZURE_SQL_SERVER      # repeat for each variable
vercel --prod
```

Or push to GitHub, import the repository in the Vercel dashboard, and add the environment variables under Project Settings.
