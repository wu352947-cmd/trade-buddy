# TradingView UI reference screenshots

Captured 2026-11-26 from the signed-in Basic account (wu352947) on https://www.tradingview.com/chart/6JYoEwe0/ (NVDA, 1D, existing drawings preserved). Full-window PNGs are 1920×1072 page captures of the chart UI (browser chrome excluded). No purchases, no orders, no deleted drawings/scripts, and no saved account or chart-setting changes.

## Required shots

| File | Caption |
|---|---|
| `main-workspace.png` | Full chart page: left drawing toolbar, top symbol/timeframe/indicator bar, NVDA candlesticks with existing drawings, RSI + MACD, right watchlist/details sidebar, and collapsed Paper Trading bar at the bottom. |
| `drawing-toolbar.png` | Left drawing toolbar with Geometric shapes flyout expanded, showing Brush/Highlighter, arrows, Rectangle (and other shapes), plus the default Trendline, Fib retracement, and Text tool-group buttons. |
| `timeframe-bar.png` | Top interval picker open: ticks, seconds, minutes (1/3/5/15/30/45), hours (1/2/3/4), days (1 day selected), 1 week, 1 month, 3 months, 6 months, and “Add custom interval”. |
| `indicator-dialog.png` | “Indicators, metrics, and strategies” dialog open (search, Personal/Built-in/Community sections, Indicators/Strategies/Profiles/Patterns/Options tabs). Dialog was closed without adding an indicator (chart already had Volume, RSI, MACD). |
| `symbol-search.png` | Symbol search overlay (Symbol, ISIN, or CUSIP) with market tabs All / Stocks / Funds / Futures / Forex / Crypto / Indices / Bonds / Economy / Options, listing a mix such as XAUUSD, NVDA, Nasdaq futures, SPY, ES, QQQ, BTCUSDT, GOLD, BTCUSD. |
| `watchlist.png` | Right-side watchlist (自选表) showing the list UI with grouped global symbols: CN/HK/US indices (000001, 399106, HSI, SPX, DXY), stocks (700, 9988, 600519, AAPL, TSLA), and commodities (GOLD, SILVER). |
| `right-sidebar.png` | Symbol Financials overlay (NVIDIA Corporation · Financials) with Overview / Statements / Statistics / Estimates / Dividends / Earnings / Segments, plus the still-visible watchlist and income-statement/performance widgets on the right rail. |
| `news-or-calendar.png` | Economic Calendar panel (week of Nov 23–29, 2026) with Economic / Earnings / Dividends / IPO tabs and a Thursday event list (times, country flags, event names, Actual / Forecast / Prior). |
| `multi-layout.png` | Layout/grid picker: 1–16 chart arrangements (2h/2v, 4-grid, etc.) and “Sync in layout” toggles (Symbol, Interval, Crosshair, Time, Date range). Same image as `multi-layout-picker.png`. |
| `market-overview-or-screener.png` | Stock Screener panel on Basic: presets (All stocks, Most capitalized, …), filter chips (US, AI, Watchlist, Index, Price, Mkt cap, P/E, etc.), and a live table of large-cap names (AAPL, MSFT, NVDA, GOOGL, …). |
| `chart-settings.png` | Chart Settings dialog open on the Symbol tab (hollow-candle Body/Borders/Wick colors, dividend adjustment, precision, timezone UTC+8 Shanghai). Closed with Cancel — no changes saved. |
| `bottom-panel.png` | Expanded Paper Trading panel (look only; no orders): account summary, and tabs Positions / Orders / Order history / Balance history / Activity log / Trade history / Analytics. |

## Supplementary shots

| File | Caption |
|---|---|
| `chart-type-menu.png` | Chart-type menu open from the top bar: Bars, Candles, Hollow candles (selected), Volume candles, Line, Line with markers, Step line, Area, and other types including Renko / Kagi / Range (some are plan-gated in the product). |
| `chart-settings-symbol.png` | Close-up of the Settings dialog Symbol tab only (750×562). |
| `chart-settings-scales.png` | Settings → Scales and lines: price-scale options, labels, symbol/indicator colors, pre/post/night market, high/low, bid/ask, and time-scale date format. Closed with Cancel. |
| `chart-settings-canvas.png` | Settings → Canvas / appearance: background, vertical/horizontal grid lines, pane separators, crosshair, watermark, scale text/lines, navigation buttons, and margins. Closed with Cancel. |
| `multi-layout-picker.png` | Duplicate of `multi-layout.png` (layout/grid picker). |
| `multi-layout-basic-limit.png` | Paywall shown after choosing a 2-chart layout: “Several charts per tab — Your plan has 1 chart per tab limit.” Current plan Basic = 1; Essential recommended = 2. Dialog was closed; nothing was purchased or applied. Layout remained single-chart. |
| `news-flow.png` | News Flow panel filtered to “Same as chart” (NVDA), with a live headline feed from Reuters, Seeking Alpha, GuruFocus, Dow Jones, MarketWatch, etc. |
| `object-tree.png` | Right-side Object tree tab listing the existing NVDA chart objects (texts, Fib retracement, Trendline, Rectangles, Horizontal lines) plus Vol / RSI / MACD. Nothing was removed. |
| `data-window.png` | Right-side Data window tab showing date, OHLC, change, volume, and current RSI / MACD values for NVDA 1D. |

## Could not capture

- **2-chart (or any multi-chart) workspace:** Basic plan enforces a 1-chart-per-tab limit. Applying a 2-chart grid only opened the upgrade paywall (`multi-layout-basic-limit.png`). No upgrade was made; the original single-chart NVDA layout was left in place.
- **Standalone Market Overview / Heatmap page:** Not opened as a separate product. The in-chart Products menu (right-rail grid) showed Copilot, Screeners, Pine Screener, Pine Editor, Calendars, News Flow, Portfolio, Yield Curves, Options, Macro Maps (lower items may have been clipped). The Stock Screener panel was available on Basic and is captured above.

## Session notes

- Login remained valid throughout (account wu352947, Basic plan, layout name 未命名).
- Left signed in on the original NVDA 1D chart with drawings, RSI, and MACD intact.
- Chart settings were cancelled; no layout was saved; Paper Trading was only viewed and then collapsed again.
