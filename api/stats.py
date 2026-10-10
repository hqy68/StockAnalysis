"""POST /api/stats  -- Python serverless function on Vercel.

Body: {"prices": [{"date": "2024-01-02", "close": 101.5}, ...]}
Returns summary analytics (returns, volatility, drawdown, moving averages, MACD).
Uses only the standard library, so no native dependencies are needed.
"""

import json
import math
from http.server import BaseHTTPRequestHandler
from statistics import mean, stdev

TRADING_DAYS = 252


def moving_average(values, window):
    out = []
    running = 0.0
    for i, v in enumerate(values):
        running += v
        if i >= window:
            running -= values[i - window]
        out.append(round(running / window, 4) if i >= window - 1 else None)
    return out


def ema(values, span):
    alpha = 2 / (span + 1)
    out = []
    for i, v in enumerate(values):
        out.append(v if i == 0 else alpha * v + (1 - alpha) * out[-1])
    return out


def macd(values, fast=12, slow=26, signal=9):
    """MACD line (EMA fast - EMA slow), its signal EMA, and the histogram.

    Points before the slow EMA (and then the signal EMA) has warmed up are None.
    """
    line = [f - s for f, s in zip(ema(values, fast), ema(values, slow))]
    sig = ema(line, signal)
    start_line, start_sig = slow - 1, slow + signal - 2

    def trim(series, start):
        return [round(v, 4) if i >= start else None for i, v in enumerate(series)]

    return {
        "macd": trim(line, start_line),
        "signal": trim(sig, start_sig),
        "hist": trim([m - s for m, s in zip(line, sig)], start_sig),
    }


def compute_stats(prices):
    points = []
    for p in prices:
        try:
            close = float(p["close"])
        except (KeyError, TypeError, ValueError):
            continue
        if math.isfinite(close) and close > 0:
            points.append((str(p.get("date", ""))[:10], close))

    points.sort(key=lambda x: x[0])
    if len(points) < 2:
        raise ValueError("Need at least two valid price points")

    dates = [d for d, _ in points]
    closes = [c for _, c in points]
    daily = [closes[i] / closes[i - 1] - 1 for i in range(1, len(closes))]

    peak, max_dd = closes[0], 0.0
    for c in closes:
        peak = max(peak, c)
        max_dd = min(max_dd, c / peak - 1)

    vol = stdev(daily) * math.sqrt(TRADING_DAYS) if len(daily) > 1 else 0.0
    avg = mean(daily)

    return {
        "count": len(closes),
        "start": dates[0],
        "end": dates[-1],
        "firstClose": closes[0],
        "lastClose": closes[-1],
        "high": max(closes),
        "low": min(closes),
        "totalReturn": closes[-1] / closes[0] - 1,
        "avgDailyReturn": avg,
        "annualizedVolatility": vol,
        "sharpe": (avg * TRADING_DAYS) / vol if vol else None,
        "maxDrawdown": max_dd,
        "series": {
            "dates": dates,
            "close": closes,
            "sma20": moving_average(closes, 20),
            "sma50": moving_average(closes, 50),
            **macd(closes),
        },
    }


class handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            data = json.loads(self.rfile.read(length) or b"{}")
            self._send(200, compute_stats(data.get("prices", [])))
        except (ValueError, json.JSONDecodeError) as e:
            self._send(400, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            self._send(500, {"error": str(e)})

    def do_GET(self):
        self._send(405, {"error": "Use POST with {\"prices\": [...]}"})
