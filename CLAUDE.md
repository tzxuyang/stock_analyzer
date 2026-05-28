# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run the dev server (serves frontend + API proxy on port 5174)
export TUSHARE_TOKEN="your_token"
uv run python server.py

# Run the standalone test script (direct Tushare call, no server)
uv run python test.py
```

There is no build step, bundler, or package.json. The frontend is plain HTML/CSS/JS served as static files. React and htm are loaded at runtime from esm.sh CDN.

## Architecture

**Server** (`server.py`) — A single-file Python HTTP server using `ThreadingHTTPServer` + `SimpleHTTPRequestHandler`. It does two things:
1. Serves static files (index.html, src/*.js, styles.css) from the project root.
2. Proxies `/api/stock?ts_code=...` to the Tushare Pro API, returning a normalized JSON payload with OHLCV data, 52-week range, company name, and recent candles.

The Tushare integration tries three API endpoints in order (`daily`, `fund_daily`, `index_daily`) to handle stocks, funds, and indices. Company name resolution maps the successful API to a corresponding `*_basic` endpoint.

**Frontend** — No transpilation or bundling. `index.html` loads `src/main.js` as an ES module. `main.js` mounts the React app. `src/App.js` uses React 18 with `htm` (tagged template literals instead of JSX). All state management is local `useState`/`useEffect` in the single `App` component. The candlestick chart is hand-drawn SVG — no charting library.

**Data flow**: User enters a ts_code → `App` fetches `/api/stock?ts_code=...` → `server.py` calls Tushare → transforms rows into a structured payload → React renders metrics, 52-week range bar, and SVG candlestick chart.

**Key files**:
- `server.py` — static server + `/api/stock` proxy
- `index.html` — shell, fonts, CSS/JS entry points
- `src/main.js` — React root mount
- `src/App.js` — entire dashboard UI (single component)
- `styles.css` — all styles, mobile-responsive with 760px breakpoint
- `data/nvda.json` — fallback sample payload for offline testing
- `test.py` — standalone Tushare smoke test (not part of the app)

## Tushare tokens

The token in `test.py` is hardcoded. The server reads `TUSHARE_TOKEN` from the environment. Never commit real tokens.
