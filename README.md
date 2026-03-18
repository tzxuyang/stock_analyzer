# Stock Dashboard With Tushare Pro

This is a mobile-responsive stock dashboard using React on the frontend and a Python API proxy for live Tushare Pro data.

## Run locally

1) Get a Tushare Pro token from https://tushare.pro and copy it.

2) Export your token and run the app server:

```bash
cd /home/yang/MyRepos/vibe_coding
export TUSHARE_TOKEN="your_tushare_token_here"
python3 server.py
```

Then open:

http://localhost:5173

The frontend calls:

http://localhost:5173/api/stock?ts_code=000001.SZ

## Files

- `server.py`: static file server + Tushare API proxy
- `index.html`: app shell and script entrypoint
- `src/main.js`: React root mounting
- `src/App.js`: dashboard UI and live fetch logic
- `styles.css`: responsive styles
- `data/nvda.json`: fallback sample payload for local testing

## Next step ideas

- Add caching and rate-limit handling in the backend.
- Add market tabs (A-share, ETF, index).
- Add a real chart component for longer price history.
