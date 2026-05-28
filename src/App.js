import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.3.1";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(React.createElement);
const whole = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

function getPct(current, previous) {
  if (!previous) return "0.00";
  return (((current - previous) / previous) * 100).toFixed(2);
}

function formatTradeDate(raw) {
  if (!raw || raw.length !== 8) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

export default function App() {
  const [stock, setStock] = useState(null);
  const [status, setStatus] = useState("loading");
  const [codeInput, setCodeInput] = useState("");
  const [activeCode, setActiveCode] = useState("000001.SZ");
  const [errorText, setErrorText] = useState("");
  const [rangeDays, setRangeDays] = useState(60);
  const [hoveredCandle, setHoveredCandle] = useState(null);

  const money = useMemo(() => {
    const currency = stock?.currency || "USD";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });
  }, [stock?.currency]);

  useEffect(() => {
    async function loadStock() {
      setStatus("loading");
      setErrorText("");
      try {
        const response = await fetch(`/api/stock?ts_code=${encodeURIComponent(activeCode)}`);
        if (!response.ok) {
          let detail = "Could not load live stock data.";
          try {
            const errPayload = await response.json();
            detail = errPayload.error || errPayload.hint || detail;
          } catch (_err) {
            detail = `HTTP ${response.status}`;
          }
          throw new Error(detail);
        }
        const payload = await response.json();
        setStock(payload);
        setHoveredCandle(null);
        setStatus("success");
      } catch (error) {
        console.error(error);
        setErrorText(error.message || "Unknown error");
        setStatus("error");
      }
    }

    loadStock();
  }, [activeCode]);

  function handleSubmit(event) {
    event.preventDefault();
    const cleanCode = codeInput.trim().toUpperCase();
    if (!cleanCode) {
      return;
    }
    setActiveCode(cleanCode);
    setCodeInput("");
  }

  const pctChange = useMemo(() => {
    if (!stock) return "0.00";
    return getPct(stock.latestPrice, stock.previousClose);
  }, [stock]);

  const candleChart = useMemo(() => {
    const candles = stock?.recentCandles || [];
    const visibleCandles = candles.slice(-rangeDays);
    if (!visibleCandles.length) {
      return null;
    }

    const chartHeight = 300;
    const topPad = 12;
    const priceBottom = 188;
    const volumeTop = 206;
    const bottomPad = 20;
    const sidePad = 10;
    const candleStep = 14;
    const bodyWidth = 10;
    const pricePlotHeight = priceBottom - topPad;
    const volumePlotHeight = chartHeight - volumeTop - bottomPad;

    const highs = visibleCandles.map((item) => item.high);
    const lows = visibleCandles.map((item) => item.low);
    const volumes = visibleCandles.map((item) => item.volume || 0);
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);
    const maxVolume = Math.max(...volumes, 1);
    const spread = maxHigh - minLow || 1;

    const toPriceY = (price) => topPad + ((maxHigh - price) / spread) * pricePlotHeight;
    const toVolumeY = (volume) => {
      const ratio = volume / maxVolume;
      return volumeTop + (1 - ratio) * volumePlotHeight;
    };
    const viewWidth = visibleCandles.length * candleStep + sidePad * 2;

    const nodes = visibleCandles.map((item, idx) => {
      const xMid = sidePad + idx * candleStep + candleStep / 2;
      const yHigh = toPriceY(item.high);
      const yLow = toPriceY(item.low);
      const yOpen = toPriceY(item.open);
      const yClose = toPriceY(item.close);
      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(2, Math.abs(yOpen - yClose));
      const bodyLeft = xMid - bodyWidth / 2;
      const isUp = item.close >= item.open;
      const volY = toVolumeY(item.volume || 0);
      const volHeight = Math.max(1, chartHeight - bottomPad - volY);
      const hitX = sidePad + idx * candleStep;

      return html`
        <g
          key=${item.date}
          onMouseEnter=${() => setHoveredCandle(item)}
          onMouseLeave=${() => setHoveredCandle(null)}
        >
          <rect x=${hitX} y=${topPad} width=${candleStep} height=${chartHeight - topPad - bottomPad} className="candleHit"></rect>
          <rect
            x=${bodyLeft}
            y=${volY}
            width=${bodyWidth}
            height=${volHeight}
            className=${isUp ? "volumeBarUp" : "volumeBarDown"}
          ></rect>
          <line x1=${xMid} y1=${yHigh} x2=${xMid} y2=${yLow} className="candleWick"></line>
          <rect
            x=${bodyLeft}
            y=${bodyTop}
            width=${bodyWidth}
            height=${bodyHeight}
            className=${isUp ? "candleBodyUp" : "candleBodyDown"}
          ></rect>
        </g>
      `;
    });

    return {
      nodes,
      maxHigh,
      minLow,
      maxVolume,
      viewWidth,
      chartHeight,
      firstDate: visibleCandles[0].date,
      lastDate: visibleCandles[visibleCandles.length - 1].date,
    };
  }, [stock, rangeDays]);

  if (status === "loading") {
    return html`
      <main className="page">
        <section className="panel loading">Loading live stock dashboard for ${activeCode}...</section>
      </main>
    `;
  }

  if (status === "error") {
    return html`
      <main className="page">
        <section className="panel error">
          Failed to load live data for ${activeCode}. ${errorText}
        </section>
        <section className="panel">
          <p className="sub">Hint: set TUSHARE_TOKEN and restart server.</p>
          <form className="tickerForm" onSubmit=${handleSubmit}>
            <input
              value=${codeInput}
              onInput=${(event) => setCodeInput(event.target.value)}
              placeholder="Try ts_code e.g. 000001.SZ"
              aria-label="ts_code"
            />
            <button type="submit">Retry</button>
          </form>
        </section>
      </main>
    `;
  }

  const isUp = Number(pctChange) >= 0;
  const spread = stock.week52High - stock.week52Low;
  const rangePercent = spread > 0 ? ((stock.latestPrice - stock.week52Low) / spread) * 100 : 0;
  const titleText = stock.company && stock.company !== stock.symbol
    ? `${stock.symbol} · ${stock.company}`
    : stock.symbol;

  return html`
    <main className="page">
      <section className="hero panel">
        <div>
          <p className="eyebrow">Stock Snapshot</p>
          <h1>${titleText}</h1>
          <p className="sub">${stock.lastUpdated}</p>
          <form className="tickerForm" onSubmit=${handleSubmit}>
            <input
              value=${codeInput}
              onInput=${(event) => setCodeInput(event.target.value)}
              placeholder="Enter ts_code"
              aria-label="ts_code"
            />
            <button type="submit">Load</button>
          </form>
        </div>
        <div className="priceBlock">
          <p className="price">${money.format(stock.latestPrice)}</p>
          <p className=${isUp ? "change up" : "change down"}>
            ${isUp ? "+" : ""}${pctChange}%
          </p>
        </div>
      </section>

      <section className="cards">
        <article className="panel metric">
          <span>Open</span>
          <strong>${money.format(stock.open)}</strong>
        </article>
        <article className="panel metric">
          <span>Day High</span>
          <strong>${money.format(stock.high)}</strong>
        </article>
        <article className="panel metric">
          <span>Day Low</span>
          <strong>${money.format(stock.low)}</strong>
        </article>
        <article className="panel metric">
          <span>Volume</span>
          <strong>${whole.format(stock.volume)}</strong>
        </article>
      </section>

      <section className="panel rangeWrap">
        <div className="rangeHeader">
          <h2>52 Week Range</h2>
          <p>${rangePercent.toFixed(1)}% from low</p>
        </div>
        <div className="rangeTrack">
          <div
            className="rangeFill"
            style=${{ width: `${Math.max(0, Math.min(100, rangePercent))}%` }}
          ></div>
        </div>
        <div className="rangeLabels">
          <span>${money.format(stock.week52Low)}</span>
          <span>${money.format(stock.week52High)}</span>
        </div>
      </section>

      <section className="panel">
        <div className="candleHeader">
          <h2>Candlestick</h2>
          <div className="rangeSwitch" role="group" aria-label="candle range">
            <label className="rangeLabel" htmlFor="rangeInput">Days</label>
            <input
              id="rangeInput"
              type="number"
              className="rangeInput"
              value=${rangeDays}
              onChange=${(e) => {
                const v = e.target.value;
                if (v === "") {
                  setRangeDays("");
                  return;
                }
                const n = Number(v);
                if (Number.isFinite(n)) {
                  setRangeDays(Math.max(1, Math.min(1000, Math.round(n))));
                }
              }}
              onBlur=${(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n) || n < 1) {
                  setRangeDays(60);
                }
              }}
              min="1"
              max="1000"
              aria-label="Candlestick chart range in days"
            />
          </div>
        </div>
        ${candleChart
          ? html`
              <div className="candleTooltip" aria-live="polite">
                ${hoveredCandle
                  ? html`
                      <span>${formatTradeDate(hoveredCandle.date)}</span>
                      <span>O ${money.format(hoveredCandle.open)}</span>
                      <span>H ${money.format(hoveredCandle.high)}</span>
                      <span>L ${money.format(hoveredCandle.low)}</span>
                      <span>C ${money.format(hoveredCandle.close)}</span>
                      <span>V ${whole.format(hoveredCandle.volume || 0)}</span>
                    `
                  : html`<span>Hover a candle to see OHLC + volume</span>`}
              </div>
              <div className="candleMeta">
                <span>High ${money.format(candleChart.maxHigh)}</span>
                <span>Max Vol ${whole.format(candleChart.maxVolume)}</span>
                <span>Low ${money.format(candleChart.minLow)}</span>
              </div>
              <div className="candleScroll">
                <svg
                  className="candleSvg"
                  viewBox=${`0 0 ${candleChart.viewWidth} ${candleChart.chartHeight}`}
                  preserveAspectRatio="none"
                  role="img"
                  aria-label=${`${rangeDays} day candlestick chart`}
                >
                  ${candleChart.nodes}
                </svg>
              </div>
              <div className="candleAxis">
                <span>${candleChart.firstDate}</span>
                <span>${candleChart.lastDate}</span>
              </div>
            `
          : html`<p className="sub">No candle data available for this symbol.</p>`}
      </section>
    </main>
  `;
}
