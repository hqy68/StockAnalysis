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

function renderChart(series, symbol) {
  $('chart-wrap').hidden = false;
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim();
  const muted = css.getPropertyValue('--muted').trim();
  const border = css.getPropertyValue('--border').trim();

  if (chart) chart.destroy();
  chart = new Chart($('chart'), {
    type: 'line',
    data: {
      labels: series.dates,
      datasets: [
        { label: `${symbol} close`, data: series.close, borderColor: accent, borderWidth: 2, pointRadius: 0 },
        { label: 'SMA 20', data: series.sma20, borderColor: '#f59e0b', borderWidth: 1.5, pointRadius: 0 },
        { label: 'SMA 50', data: series.sma50, borderColor: '#a855f7', borderWidth: 1.5, pointRadius: 0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { color: muted, maxTicksLimit: 8 }, grid: { color: border } },
        y: { ticks: { color: muted }, grid: { color: border } },
      },
      plugins: { legend: { labels: { color: muted } } },
    },
  });
}

async function loadSymbols() {
  try {
    const { symbols } = await getJSON('/api/symbols');
    for (const s of symbols) {
      const opt = document.createElement('option');
      opt.value = opt.textContent = s;
      $('symbol').appendChild(opt);
    }
  } catch (err) {
    setStatus(`Could not load symbols: ${err.message}`, true);
  }
}

async function loadHistory(e) {
  e?.preventDefault();
  const btn = document.querySelector('button[type=submit]');
  btn.disabled = true;
  setStatus('Loading…');

  const symbol = $('symbol').value;
  const params = new URLSearchParams({ limit: $('limit').value || '500' });
  if (symbol) params.set('symbol', symbol);
  if ($('from').value) params.set('from', $('from').value);
  if ($('to').value) params.set('to', $('to').value);

  try {
    const { columns, rows, meta } = await getJSON(`/api/history?${params}`);
    renderTable(columns.length ? columns : Object.keys(rows[0] || {}), rows);
    setStatus(`${rows.length} rows loaded.`);

    // Analytics only make sense for a single symbol's price series.
    $('stats').hidden = true;
    $('chart-wrap').hidden = true;
    if (symbol && rows.length > 1 && meta.closeColumn in rows[0]) {
      const prices = rows.map((r) => ({ date: r[meta.dateColumn], close: r[meta.closeColumn] }));
      const stats = await getJSON('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prices }),
      });
      renderStats(stats);
      renderChart(stats.series, symbol);
    }
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

$('filters').addEventListener('submit', loadHistory);
loadSymbols();
loadHistory();
