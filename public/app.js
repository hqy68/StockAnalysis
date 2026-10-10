const $ = (id) => document.getElementById(id);
let chart;

function setStatus(msg, isError = false) {
  $('status').textContent = msg;
  $('status').className = isError ? 'error' : '';
}

async function getJSON(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return body;
}

function formatCell(value) {
  if (value == null) return '';
  if (typeof value === 'number') return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  return String(value);
}

function renderTable(columns, rows) {
  const thead = $('table').querySelector('thead');
  const tbody = $('table').querySelector('tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const headRow = document.createElement('tr');
  for (const col of columns) {
    const th = document.createElement('th');
    th.textContent = col;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);

  const frag = document.createDocumentFragment();
  for (const row of rows) {
    const tr = document.createElement('tr');
    for (const col of columns) {
      const td = document.createElement('td');
      td.textContent = formatCell(row[col]);
      tr.appendChild(td);
    }
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
}

const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(2)}%`);
const num = (x) => (x == null ? '—' : x.toLocaleString(undefined, { maximumFractionDigits: 2 }));

function renderStats(s) {
  const items = [
    ['Last close', num(s.lastClose)],
    ['Total return', pct(s.totalReturn), s.totalReturn >= 0 ? 'up' : 'down'],
    ['High / Low', `${num(s.high)} / ${num(s.low)}`],
    ['Ann. volatility', pct(s.annualizedVolatility)],
    ['Sharpe (rf=0)', s.sharpe == null ? '—' : s.sharpe.toFixed(2)],
    ['Max drawdown', pct(s.maxDrawdown), 'down'],
  ];
  $('stats').innerHTML = '';
  for (const [k, v, cls] of items) {
    const div = document.createElement('div');
    div.className = 'stat';
    div.innerHTML = `<div class="k"></div><div class="v ${cls || ''}"></div>`;
    div.querySelector('.k').textContent = k;
    div.querySelector('.v').textContent = v;
    $('stats').appendChild(div);
  }
  $('stats').hidden = false;
}

// Daily candlestick (K) chart with volume bars, drawn with TradingView Lightweight Charts.
function renderKChart(rows, meta, symbol) {
  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();
  const [up, down, muted, border] = ['--up', '--down', '--muted', '--border'].map(color);

  const bars = rows
    .map((r) => ({
      time: String(r[meta.dateColumn]).slice(0, 10),
      open: Number(r[meta.openColumn]),
      high: Number(r[meta.highColumn]),
      low: Number(r[meta.lowColumn]),
      close: Number(r[meta.closeColumn]),
      volume: Number(r[meta.volumeColumn]),
    }))
    .filter((b) => [b.open, b.high, b.low, b.close].every(Number.isFinite))
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));

  if (chart) chart.remove();
  chart = null;
  if (bars.length === 0) return null;

  $('chart-wrap').hidden = false;
  chart = LightweightCharts.createChart($('chart'), {
    autoSize: true,
    layout: { background: { color: 'transparent' }, textColor: muted },
    grid: { vertLines: { color: border }, horzLines: { color: border } },
    rightPriceScale: { borderColor: border },
    timeScale: { borderColor: border },
    watermark: { visible: true, text: symbol, color: border, fontSize: 48 },
  });

  const candles = chart.addCandlestickSeries({
    upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false,
  });
  candles.setData(bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
  // Stacked panes on one time scale: candles on top, then volume, then MACD.
  candles.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.42 } });

  if (bars.some((b) => Number.isFinite(b.volume))) {
    const volume = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.6, bottom: 0.3 } });
    volume.setData(bars.filter((b) => Number.isFinite(b.volume)).map((b) => ({
      time: b.time, value: b.volume, color: `${b.close >= b.open ? up : down}66`,
    })));
  }

  chart.timeScale().fitContent();
  return chart;
}

// Overlay the moving averages computed by /api/stats on the K chart.
function addMovingAverages(series) {
  if (!chart) return;
  for (const [key, color] of [['sma20', '#f59e0b'], ['sma50', '#a855f7']]) {
    const line = chart.addLineSeries({
      color, lineWidth: 1.5, title: key.toUpperCase(), priceLineVisible: false, lastValueVisible: false,
    });
    line.setData(series.dates
      .map((time, i) => ({ time, value: series[key][i] }))
      .filter((p) => p.value != null));
  }
}

// MACD (12, 26, 9) from /api/stats, drawn in the bottom pane of the K chart.
function addMacd(series) {
  if (!chart || !series.macd) return;
  const css = getComputedStyle(document.documentElement);
  const [up, down, accent] = ['--up', '--down', '--accent'].map((n) => css.getPropertyValue(n).trim());
  const points = (key) => series.dates
    .map((time, i) => ({ time, value: series[key][i] }))
    .filter((p) => p.value != null);

  const hist = chart.addHistogramSeries({
    priceScaleId: 'macd', title: 'MACD hist', priceLineVisible: false, lastValueVisible: false,
  });
  hist.priceScale().applyOptions({ scaleMargins: { top: 0.74, bottom: 0.02 } });
  hist.setData(points('hist').map((p) => ({ ...p, color: `${p.value >= 0 ? up : down}99` })));

  for (const [key, color, title] of [['macd', accent, 'MACD'], ['signal', '#f59e0b', 'Signal']]) {
    const line = chart.addLineSeries({
      priceScaleId: 'macd', color, lineWidth: 1.5, title, priceLineVisible: false, lastValueVisible: false,
    });
    line.setData(points(key));
  }
}

async function loadSymbols() {
  try {
    const { symbols } = await getJSON('/api/symbols');
    if (!symbols.length) setStatus('No symbols found in the table.', true);
    for (const s of symbols) {
      const opt = document.createElement('option');
      opt.value = opt.textContent = s;
      $('symbol').appendChild(opt);
    }
  } catch (err) {
    setStatus(`Could not load symbols: ${err.message}`, true);
  }
}

async function loadConfig() {
  const tbody = $('config').querySelector('tbody');
  try {
    const { connection, env } = await getJSON('/api/config');
    $('conn-server').textContent = `${connection.server} (port ${connection.port})`;
    $('conn-database').textContent = connection.database;
    $('conn-string').textContent = connection.connectionString;
    for (const [name, value] of Object.entries(env)) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td></td><td></td>';
      tr.cells[0].textContent = name;
      tr.cells[1].textContent = value ?? '(not set)';
      if (value == null) tr.cells[1].className = 'down';
      tbody.appendChild(tr);
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td class="down"></td></tr>';
    tbody.querySelector('td').textContent = `Could not load config: ${err.message}`;
  }
}

async function loadHistory(e) {
  e?.preventDefault();
  const btn = document.querySelector('button[type=submit]');
  btn.disabled = true;
  setStatus('Loading…');

  const symbol = $('symbol').value;
  if (!symbol) {
    btn.disabled = false;
    return;
  }
  const params = new URLSearchParams({ symbol, limit: $('limit').value || '500' });
  if ($('from').value) params.set('from', $('from').value);
  if ($('to').value) params.set('to', $('to').value);

  try {
    const { columns, rows, meta } = await getJSON(`/api/history?${params}`);
    renderTable(columns.length ? columns : Object.keys(rows[0] || {}), rows);
    setStatus(`${rows.length} rows loaded.`);

    $('stats').hidden = true;
    $('chart-wrap').hidden = true;
    if (!renderKChart(rows, meta, symbol) && rows.length) {
      setStatus(`${rows.length} rows loaded, but no ${meta.openColumn}/${meta.highColumn}/${meta.lowColumn}/${meta.closeColumn} values to chart.`, true);
    }

    if (rows.length > 1 && meta.closeColumn in rows[0]) {
      const prices = rows.map((r) => ({ date: r[meta.dateColumn], close: r[meta.closeColumn] }));
      const stats = await getJSON('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prices }),
      });
      renderStats(stats);
      addMovingAverages(stats.series);
      addMacd(stats.series);
    }
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

$('filters').addEventListener('submit', loadHistory);
$('symbol').addEventListener('change', loadHistory);
loadConfig();
// The dropdown is filled from the table's symbol column; chart the first symbol.
loadSymbols().then(loadHistory);
