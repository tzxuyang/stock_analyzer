import json
import os
from datetime import UTC, datetime, timedelta
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import parse, request

BASE_DIR = Path(__file__).resolve().parent
TUSHARE_URL = "https://api.tushare.pro"


def tushare_call(api_name, token, params=None, fields=""):
    payload = {
        "api_name": api_name,
        "token": token,
        "params": params or {},
        "fields": fields,
    }

    req = request.Request(
        TUSHARE_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with request.urlopen(req, timeout=15) as resp:
        raw = resp.read().decode("utf-8")

    data = json.loads(raw)
    if data.get("code") != 0:
        raise RuntimeError(data.get("msg") or "Tushare API error")

    block = data.get("data") or {}
    fields = block.get("fields") or []
    items = block.get("items") or []
    return fields, items


def row_to_dict(fields, row):
    return {fields[i]: row[i] for i in range(len(fields))}


def normalize_ts_code(raw):
    code = raw.strip().upper()
    if "." in code:
        return code
    if not code.isdigit():
        return code
    if code[0] == "6":
        return f"{code}.SH"
    if code[0] in ("0", "2", "3"):
        return f"{code}.SZ"
    if code[0] in ("4", "8"):
        return f"{code}.BJ"
    return code


def fetch_market_rows(ts_code, token, start_date, end_date):
    candidates = [
        ("daily", "ts_code,trade_date,open,high,low,close,pre_close,vol"),
        ("fund_daily", "ts_code,trade_date,open,high,low,close,pre_close,vol"),
        ("index_daily", "ts_code,trade_date,open,high,low,close,pre_close,vol"),
    ]

    failures = []
    for api_name, fields in candidates:
        try:
            out_fields, rows = tushare_call(
                api_name,
                token,
                params={"ts_code": ts_code, "start_date": start_date, "end_date": end_date},
                fields=fields,
            )
            if rows:
                return api_name, out_fields, rows
            failures.append(f"{api_name}: no rows")
        except Exception as exc:
            failures.append(f"{api_name}: {exc}")

    raise RuntimeError(
        f"No market data returned for {ts_code}. Tried daily/fund_daily/index_daily. Details: {' | '.join(failures)}"
    )


def resolve_company_name(ts_code, token, data_api_name):
    api_map = {
        "daily": ("stock_basic", "ts_code,name"),
        "fund_daily": ("fund_basic", "ts_code,name"),
        "index_daily": ("index_basic", "ts_code,name"),
    }
    meta = api_map.get(data_api_name)
    if not meta:
        return ts_code

    try:
        meta_fields, meta_rows = tushare_call(
            meta[0],
            token,
            params={"ts_code": ts_code},
            fields=meta[1],
        )
        if meta_rows:
            row = row_to_dict(meta_fields, meta_rows[0])
            return row.get("name") or ts_code
    except Exception:
        return ts_code

    return ts_code


def build_stock_payload(ts_code, token):
    now_utc = datetime.now(UTC)
    end_date = now_utc.strftime("%Y%m%d")
    start_date = (now_utc - timedelta(days=500)).strftime("%Y%m%d")

    source_api, fields, rows = fetch_market_rows(ts_code, token, start_date, end_date)

    records = [row_to_dict(fields, row) for row in rows]
    records.sort(key=lambda x: x["trade_date"])

    latest = records[-1]
    previous = records[-2] if len(records) > 1 else records[-1]

    close_values = [float(r["close"]) for r in records]
    week52_records = records[-252:] if len(records) >= 252 else records
    week52_values = [float(r["close"]) for r in week52_records]

    company = resolve_company_name(ts_code, token, source_api)

    recent = records[-7:]
    candles = records[-180:]

    return {
        "symbol": ts_code,
        "company": company,
        "latestPrice": float(latest["close"]),
        "previousClose": float(previous["close"]),
        "open": float(latest["open"]),
        "high": float(latest["high"]),
        "low": float(latest["low"]),
        "volume": int(float(latest["vol"]) * 100),
        "week52High": max(week52_values),
        "week52Low": min(week52_values),
        "lastUpdated": latest["trade_date"],
        "currency": "CNY",
        "sourceApi": source_api,
        "recentCandles": [
            {
                "date": r["trade_date"],
                "open": float(r["open"]),
                "high": float(r["high"]),
                "low": float(r["low"]),
                "close": float(r["close"]),
                "volume": int(float(r["vol"]) * 100),
            }
            for r in candles
        ],
        "recentCloses": [
            {"date": r["trade_date"], "close": float(r["close"])} for r in recent
        ],
        "sessionCount": len(records),
        "seriesHigh": max(close_values),
        "seriesLow": min(close_values),
    }


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def _json(self, status_code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = parse.urlparse(self.path)
        if parsed.path == "/api/stock":
            self.handle_api_stock(parsed)
            return
        super().do_GET()

    def handle_api_stock(self, parsed):
        token = os.getenv("TUSHARE_TOKEN", "").strip()
        if not token:
            self._json(
                HTTPStatus.BAD_REQUEST,
                {
                    "error": "TUSHARE_TOKEN missing",
                    "hint": "Set environment variable TUSHARE_TOKEN before starting server",
                },
            )
            return

        query = parse.parse_qs(parsed.query)
        ts_code = normalize_ts_code((query.get("ts_code") or ["000001"])[0])

        try:
            payload = build_stock_payload(ts_code, token)
            self._json(HTTPStatus.OK, payload)
        except Exception as exc:
            self._json(
                HTTPStatus.BAD_GATEWAY,
                {
                    "error": str(exc),
                    "source": "tushare",
                },
            )


def run():
    port = int(os.getenv("PORT", "5173"))
    server = ThreadingHTTPServer(("0.0.0.0", port), DashboardHandler)
    print(f"Dashboard server running at http://localhost:{port}")
    print("API endpoint: /api/stock?ts_code=000001.SZ")
    server.serve_forever()


if __name__ == "__main__":
    run()
