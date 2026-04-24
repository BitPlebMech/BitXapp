# Portfolio Terminal - Mock Version

A single-file personal investment portfolio dashboard with live prices, multi-currency support, and per-lot analytics.

![Dark navy terminal aesthetic](https://img.shields.io/badge/theme-dark%20navy-070b12?style=flat-square)
![Vanilla JS](https://img.shields.io/badge/stack-vanilla%20HTML%2FCS%2FJS-4a8fff?style=flat-square)
![No dependencies](https://img.shields.io/badge/dependencies-none-05d98a?style=flat-square)

---

## Features

- **Live prices** — Yahoo Finance via CORS proxy (EUR-denominated), auto-refresh every 60 seconds
- **Multi-currency** — EUR / USD / INR with historically-accurate FX conversion per lot purchase date
- **Historical FX rates** — European Central Bank daily rates via [frankfurter.app](https://frankfurter.app) (free, no API key)
- **5 KPI cards** — Total Value, Gain/Loss, Portfolio CAGR, Best Performer, Total Lots
- **Holdings table** — Avg Cost, Current Price, Value, Gain €, Gain %, CAGR per asset
- **Allocation donuts** — By Asset and By Class (Stock / ETF / Crypto) with tabbed switching
- **Asset drawer** — click any row to see full lot-level detail including:
  - Mini KPI cards with per-asset colour accent bars
  - Weighted avg cost summary
  - Dumbbell chart (Canvas) — grey buy dot, orange current dot, info boxes per lot showing gain % + CAGR
  - Lot distribution bar
  - Full lots table with CAGR per lot (shown only when held ≥ 1 year)

## Portfolio

| Ticker | Name             | Class  | Lots |
|--------|-----------------|--------|------|
| AAPL   | Apple Inc.       | Stock  | 4    |
| MSFT   | Microsoft Corp.  | Stock  | 3    |
| VOO    | Vanguard S&P 500 | ETF    | 2    |
| NVDA   | NVIDIA Corp.     | Stock  | 4    |
| BTC    | Bitcoin          | Crypto | 5    |

## Usage

Open `index.html` directly in any modern browser — no build step, no server, no dependencies.

```bash
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```

## Data Sources

| Data            | Source                  | Method                        |
|-----------------|------------------------|-------------------------------|
| Stock prices    | Yahoo Finance           | CORS proxy (corsproxy.io)     |
| Crypto prices   | Yahoo Finance           | CORS proxy (corsproxy.io)     |
| FX history      | European Central Bank   | frankfurter.app (direct CORS) |

## Currency Conversion

Buy prices use the **historical ECB rate on each lot's purchase date**.  
Current values use **today's latest ECB rate**.  

This means switching to INR correctly reflects:
- Each lot's actual cost in INR at the time of purchase
- A different CAGR than EUR (INR has depreciated vs EUR since 2022)

## Tech Stack

- **HTML / CSS / JavaScript** — zero external frameworks
- **Cabinet Grotesk** — headings and UI labels (Google Fonts)
- **DM Mono** — numbers and monospaced text (Google Fonts)
- **Canvas API** — dumbbell chart drawn programmatically

## Browser Support

Any modern browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+).

---

*Prices are for personal tracking purposes only. Not financial advice.*
