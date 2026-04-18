# UI Component Guide — Portfolio Terminal Modular

> **How to use this document**
> Find the component or feature you want to change. The "Files to provide" column tells you exactly which files to upload to Claude. The more specific you are about what's broken or what you want, the faster it gets fixed.

---

## File Map at a Glance

| File | Size | What lives here |
|------|------|-----------------|
| `index.html` | 804 lines | All HTML structure, overlays, modals, script load order |
| `css/bitxapp-base.css` | 1946 lines | All visual styles — colours, layout, components |
| `js/core/state.js` | 286 lines | localStorage read/write, all namespaces |
| `js/core/gist.js` | 148 lines | GitHub Gist API — save and load only |
| `js/core/app-shell.js` | 227 lines | Sidebar, module registry, module switching |
| `js/modules/portfolio/portfolio.js` | 1387 lines | All business logic, calculations, price engine, CRUD |
| `js/modules/portfolio/portfolio-ui.js` | 1611 lines | All rendering — every tab, drawer, chart |
| `js/modules/portfolio/portfolio-data.js` | 304 lines | CSV import wizard, sample data seeding |
| `js/modules/habits/habits.js` | 320 lines | Habits business logic, streak calc, CRUD |
| `js/modules/habits/habits-ui.js` | 292 lines | Habits rendering |
| `js/modules/habits/habits-data.js` | 124 lines | Habits default data |
| `js/modules/financecalc/calc.js` | 46 lines | Finance calculator stub (coming soon) |

---

## Topbar

```
[ BiT PleB logo ]  BiT PleB          [ Sign Out ] [ ☀️ Theme ]
```

| Component | What it does | Files to provide |
|-----------|-------------|-----------------|
| Logo + title | Static branding | `index.html` |
| Sign Out button `#h-signout-btn` | Clears Gist credentials → opens credentials popup | `index.html` + `portfolio.js` |
| Theme toggle `#theme-toggle` | Dark / light mode | `index.html` + `portfolio.js` (`toggleTheme`) |

**Bug in topbar?** → Provide `index.html` + `portfolio.js`

---

## Sidebar

```
[ 📊 Portfolio ]
[ 🔁 Habits    ]
[ 🧮 Calc      ]
─────────────────
[ Gist save ↑  ]
```

| Component | What it does | Files to provide |
|-----------|-------------|-----------------|
| Module buttons | Rendered by App.Shell from registered modules | `js/core/app-shell.js` |
| Active module highlight | CSS `.sb-btn.active` state | `css/bitxapp-base.css` |
| Gist save shortcut `#sb-gist-save` | Calls `App.Portfolio.triggerGistSave()` | `index.html` + `portfolio.js` |

**Bug in sidebar?** → Provide `js/core/app-shell.js` + `index.html`

---

## Portfolio Module — Header Bar

```
Portfolio Terminal  [●] Live   [Simulated]   FX: 1€=$1.09  Currency▾  [Save to Gist]  [Refresh]  [⚙]
```

| Component | Element ID | Files to provide |
|-----------|-----------|-----------------|
| Status dot + text | `#h-dot`, `#h-status` | `portfolio.js` (`setHeaderStatus`) |
| Price source badge | `#h-src-badge` | `portfolio.js` (`updateSourceBadge`) |
| FX pill | `#h-fx`, `#h-fx-ts-combined` | `portfolio.js` (`updateFXUI`) |
| Currency selector | `#h-currency` | `index.html` + `portfolio-ui.js` |
| Save to Gist button | `#h-gist-save` | `portfolio.js` (`triggerGistSave`, `_performGistSave`) |
| Refresh button | `#h-refresh` | `portfolio.js` (`refreshPrices`) |
| Settings button | `#h-settings-btn` | `portfolio-ui.js` (`openSettings`) |

**Bug in portfolio header?** → Provide `portfolio.js` + `portfolio-ui.js`

---

## Portfolio — Overview Tab

```
[ KPI cards ×11: Total Value | Unrealised P&L | Realised | Net P&L | CAGR | XIRR | Win Rate | Best XIRR | Needs Attention | Avg Hold | Concentration ]

[ Allocation Donut: By Asset / By Class ]   [ Invested vs Market Value bar chart ]

[ Position Metrics table (By Asset / By Class toggle) ]
[ Fees & Taxes by class ]
[ Yearly Trading Costs ]
```

| Component | Function | Files to provide |
|-----------|----------|-----------------|
| 11 KPI cards | `renderOverview()` in portfolio-ui.js | `portfolio-ui.js` |
| KPI sparklines | `miniSpark()` inline in renderOverview | `portfolio-ui.js` |
| Allocation donut (By Asset) | `drawSVGDonut('donut-asset-svg', 'donut-asset-leg', ...)` | `portfolio-ui.js` |
| Allocation donut (By Class) | `drawSVGDonut('donut-class-svg', 'donut-class-leg', ...)` | `portfolio-ui.js` |
| Invested vs Market bar chart | `renderBarChart()` in portfolio-ui.js | `portfolio-ui.js` |
| Position Metrics table | `renderInlineAnalytics()` — first panel | `portfolio-ui.js` |
| By Asset / By Class toggle | `switchAnView()` + `analyticsSort()` | `portfolio-ui.js` |
| Fees & Taxes panel | `renderInlineAnalytics()` — second panel | `portfolio-ui.js` |
| Yearly Trading Costs | `renderInlineAnalytics()` — third panel | `portfolio-ui.js` |

**Bug in overview tab?** → Provide `portfolio-ui.js`
**Wrong KPI value (calculation)?** → Provide `portfolio.js` (`computeSummary`, `computePositions`)

---

## Portfolio — Positions Tab

```
[ 6 Positions ]  [All] [Stock] [ETF] [Crypto] [Bond] [MF]    [Export CSV] [Import CSV] [+ Add Transaction]

┌─────────────────────────────────────────┐
│  ●  AAPL   Apple Inc.        [Stock]    │
│  Shares: 15   Avg Cost: €168   ↑ Live   │
│  Value: €3,240   Cost: €2,520           │
│  Unrealised: +€720 (+28.5%)             │
│  Realised: +€0   Net P&L: +€720         │
│  CAGR: +12.4% p.a.  XIRR: +14.2%  ABS: +28.5% │
│  [Details] [+] [Rename] [×]             │
└─────────────────────────────────────────┘
... active positions sorted by value ...
─── Liquidated Positions ───
... exited positions sorted by ticker ...
```

| Component | Function | Files to provide |
|-----------|----------|-----------------|
| Position count | `#pos-count` updated in `renderPositions()` | `portfolio-ui.js` |
| Class filter buttons | `clf-all/Stock/ETF/Crypto/Bond/MF` | `portfolio-ui.js` + `portfolio.js` (`clsFilter`) |
| Position card layout | `buildCard()` in `renderPositions()` | `portfolio-ui.js` |
| Card metrics row | Shares, Avg Cost, Value, Unrealised P&L | `portfolio-ui.js` |
| Returns row | CAGR, XIRR, ABS % | `portfolio-ui.js` |
| Details button | `App.Portfolio.openDrawer(ticker)` | `portfolio-ui.js` + `portfolio.js` |
| Add (+) button | `App.PortfolioUI.openEditModal(null, ticker)` | `portfolio-ui.js` |
| Rename button | `App.Portfolio.renameTicker(ticker)` | `portfolio.js` (`renameTicker`) |
| Delete (×) button | `App.Portfolio.confirmDeletePos(ticker)` | `portfolio.js` (`confirmDeletePos`, `deletePosition`) |
| Liquidated section | Cards with `.pos-section-divider` | `portfolio-ui.js` |
| Export CSV button | `App.Portfolio.exportPortfolioCSV()` | `portfolio.js` |
| Import CSV button | Opens CSV wizard | `portfolio-data.js` + `portfolio-ui.js` |

**Bug in position cards?** → Provide `portfolio-ui.js`
**Wrong values in cards (calc)?** → Provide `portfolio.js` (`computePositions`)
**Delete/rename not working?** → Provide `portfolio.js`

---

## Portfolio — History Tab

```
[Search ticker…]  [All] [Buy] [Sell]  [Sort ▾]

 #  Date         Type   Ticker  Class   Qty    Price    Total     P&L      [×]
 1  15 Mar 2022  BUY    AAPL    Stock   10    €155.00  €1,550    +€6.80   [×]
```

| Component | Function | Files to provide |
|-----------|----------|-----------------|
| Search filter | `#hist-search` — filters by ticker | `portfolio-ui.js` (`renderHistory`) |
| All/Buy/Sell filter | `#f-all/buy/sell` | `portfolio-ui.js` + `portfolio.js` (`histFilter`) |
| Sort selector | `#hist-sort` | `portfolio-ui.js` |
| Table rows | `renderHistory()` — 10 columns | `portfolio-ui.js` |
| P&L column | BUY = unrealised vs current; SELL = realised | `portfolio-ui.js` |
| Delete button | `App.Portfolio.confirmDelTx(id, ticker, qty)` | `portfolio.js` (`confirmDelTx`, `deleteTransaction`) |
| Price column header | `#hist-price-hdr` — updates with currency | `portfolio-ui.js` |

**Bug in history table?** → Provide `portfolio-ui.js`
**P&L calculation wrong?** → Provide `portfolio-ui.js` + `portfolio.js`

---

## Position Detail Drawer

```
[ ●AAPL ]  Apple Inc. [Stock]  · Live · Yahoo Finance
           CAGR: +12.4%   XIRR: +14.2%

[ Current Price ][ Total Shares ][ Current Value ][ Unrealised P&L ][ Realised P&L ][ Fees·Taxes ]

Total Gain: +€720 · CAGR: +12.4% · XIRR: +14.2% · Avg hold: 1.8 yr · FX: EUR ✓ hist

[ Lot distribution bar: L1 ████░░ L2 ░░████ ]

[ Dumbbell Canvas Chart — Buy price vs Current price per lot ]

All Transactions
 #  Type  Date       Qty  Price  Total   Fees  P&L    P&L%   [×]
Open Lots (FIFO)
 #  Date  Qty  Buy Price  Cost  Value  Gain  Gain%  CAGR  XIRR
```

| Component | Function | Files to provide |
|-----------|----------|-----------------|
| Drawer open/close | `openDrawer(ticker)` / `closeDrawer()` | `portfolio-ui.js` |
| Header icon | Styled initials with ticker color | `portfolio-ui.js` |
| CAGR/XIRR pills | `drw-pills` element | `portfolio-ui.js` |
| KPI row | `drw-kpis` — 5-6 cards | `portfolio-ui.js` |
| Summary bar | `drw-summary` | `portfolio-ui.js` |
| Lot distribution bar | `drw-lot-dist`, `drw-dist-track`, `drw-dist-leg` | `portfolio-ui.js` |
| Dumbbell chart | `drawDumbbell()` — canvas | `portfolio-ui.js` |
| Transactions table | `drw-txs` tbody | `portfolio-ui.js` |
| FIFO lots table | `drw-fifo-body` tbody | `portfolio-ui.js` |
| Per-lot XIRR | `lotXIRR()` helper | `portfolio-ui.js` |

**Bug in drawer layout or data?** → Provide `portfolio-ui.js`
**Dumbbell chart wrong?** → Provide `portfolio-ui.js` (look for `drawDumbbell`)
**Per-lot CAGR/XIRR wrong?** → Provide `portfolio-ui.js` + `portfolio.js`

---

## Add / Edit Transaction Modal

```
[ Quick Select: AAPL MSFT NVDA ... ]
[ BUY ] [ SELL ]
  Ticker/ISIN/WKN  [Verify]
  Asset Class ▾    Date
  Quantity         Price (EUR)
  Total (auto)     Notes
  Broker Fees      Capital Gains Tax (SELL only)
[ Cancel ]  [ Add Transaction ]
```

| Component | Function | Files to provide |
|-----------|----------|-----------------|
| Open modal (new) | `openModal(ticker)` | `portfolio-ui.js` |
| Open modal (edit) | `openEditModal(txId, prefillTicker)` | `portfolio-ui.js` |
| Quick ticker buttons | `.qt-btn` clicks → `_setTickerInModal()` | `portfolio-ui.js` |
| BUY/SELL toggle | `setType()` in portfolio-ui.js | `portfolio-ui.js` |
| Ticker verify | `#f-verify` → lookup ticker | `portfolio-ui.js` |
| Auto-fill price | `_setTickerInModal()` reads from price cache | `portfolio-ui.js` + `portfolio.js` (`getPrice`) |
| Total calc | Live multiply qty × price | `portfolio-ui.js` |
| Submit | `submitForm()` → `App.Portfolio.addTransaction()` | `portfolio-ui.js` + `portfolio.js` |
| Edit submit | `submitForm()` → `App.Portfolio.editTransaction()` | `portfolio-ui.js` + `portfolio.js` |
| HTML structure | Modal markup in overlays section | `index.html` |

**Bug in modal form?** → Provide `portfolio-ui.js` + `index.html`
**Transaction not saving correctly?** → Provide `portfolio.js` (`addTransaction`, `editTransaction`)

---

## CSV Import Wizard

```
Step 1: Upload CSV
Step 2: Resolve column mapping
Step 3: Preview & confirm
```

| Component | Function | Files to provide |
|-----------|----------|-----------------|
| Wizard flow | `openCsvModal()`, step navigation | `portfolio-data.js` |
| Column resolver | Maps CSV headers → app fields | `portfolio-data.js` |
| Preview table | Shows parsed transactions before import | `portfolio-data.js` |
| Final import | Appends to `state.transactions` | `portfolio-data.js` + `portfolio.js` |

**Bug in CSV import?** → Provide `portfolio-data.js`

---

## Settings Panel

```
⚙ Settings
  ── Price Sources ──────────────
  Alpha Vantage API Key (optional)
  Price Cache Duration ▾
  [ Save Settings ]

  ── FX Rates ───────────────────
  EUR→USD: 1.0912   EUR→INR: ₹91.2   Last ECB date   Coverage

  ── Data Management ────────────
  [Export JSON] [Export CSV] [Import JSON]
  [Clear Price Cache] [Undo Last Delete] [Factory Reset]

  ── GitHub Gist Sync ───────────
  GitHub Personal Access Token
  Gist ID
  [Save to Gist] [Load from Gist] [Clear Credentials]
  Last saved: 14:32:01
```

| Component | Function | Files to provide |
|-----------|----------|-----------------|
| Panel open/close | `openSettings()` / `closeSettings()` | `portfolio-ui.js` |
| Price Sources section | `cfg-api-key`, `cfg-cache-ttl` | `portfolio-ui.js` + `portfolio.js` (`applySettings`) |
| FX chips | `#sp-fx-chips` — updated by `updateFXUI()` | `portfolio.js` |
| Export JSON | `App.Portfolio.exportData()` | `portfolio.js` |
| Export CSV | `App.Portfolio.exportPortfolioCSV()` | `portfolio.js` |
| Import JSON | `App.Portfolio.triggerImport()` + `importData()` | `portfolio.js` |
| Clear Price Cache | `App.Portfolio.clearPriceCache()` | `portfolio.js` |
| Undo Last Delete | `App.Portfolio.undoDelete()` | `portfolio.js` |
| Factory Reset | Confirm → `localStorage.clear()` + reload | `portfolio-ui.js` |
| Gist token field | `#cfg-gist-token` | `index.html` + `portfolio.js` |
| Gist ID field | `#cfg-gist-id` | `index.html` + `portfolio.js` |
| Save to Gist | `App.Portfolio.triggerGistSave()` | `portfolio.js` |
| Load from Gist | `App.Portfolio.gistLoad()` | `portfolio.js` |
| Clear Credentials | `App.Portfolio.gistClearCredentials()` | `portfolio.js` |
| Gist status line | `#gist-status` | `portfolio.js` (`setGistStatus`) |
| HTML structure | Settings panel markup | `index.html` |

**Bug in settings panel UI?** → Provide `portfolio-ui.js` + `index.html`
**Gist save/load not working?** → Provide `portfolio.js` + `js/core/gist.js`

---

## Credentials Popup

```
🔑 Connect to GitHub Gist
   GitHub Personal Access Token  [________]
   Gist ID                       [________]
   [ Save & Continue ]
   [ Skip for now ]
```

| Component | Function | Files to provide |
|-----------|----------|-----------------|
| Auto-show on startup | `initLockScreen()` | `portfolio.js` |
| Open popup | `openCredentialsPopup(callback)` | `portfolio.js` |
| Save credentials | `saveCredentials()` → offer Gist load | `portfolio.js` |
| Skip | `closeCredentialsPopup()` | `portfolio.js` |
| Sign out → reopen | `signOut()` → `openCredentialsPopup()` | `portfolio.js` |
| HTML structure | `#cred-ov`, `#cred-box` | `index.html` |

**Bug in credentials popup?** → Provide `portfolio.js` + `index.html`

---

## Confirm Dialog

```
  ⚠️  Are you sure?
      Remove all 3 transaction(s)...
      [ Cancel ]  [ Delete All ]
```

| Component | Function | Files to provide |
|-----------|----------|-----------------|
| Show dialog | `confirmAction(title, body, icon, label, fn)` | `portfolio.js` |
| Confirm click | `confirmDo()` | `portfolio.js` |
| Cancel click | `confirmCancel()` | `portfolio.js` |
| HTML structure | `#confirm-dialog` | `index.html` |

---

## Toast Notifications

```
  ✓ Transaction added          (green, bottom-right, auto-dismiss)
  ⚠ Gist save failed: …        (red)
  ℹ Price cache cleared        (blue)
```

| Component | Function | Files to provide |
|-----------|----------|-----------------|
| Show toast | `toast(message, type)` — types: success/error/info/warn | `portfolio.js` |
| Container | `#toast-wrap` | `index.html` |
| Styles | `.toast`, `.toast-success`, `.toast-error`, etc. | `css/bitxapp-base.css` |

---

## Habits Module

```
[ Habits module pane ]
  Streak tracking, habit cards, completion history
```

| Component | Function | Files to provide |
|-----------|----------|-----------------|
| All rendering | `App.HabitsUI.render()` | `habits-ui.js` |
| Business logic | Streak calc, CRUD | `habits.js` |
| Default habit data | Seed data on first load | `habits-data.js` |
| HTML container | `#mod-habits` → `#habits-content` | `index.html` |

**Bug in habits?** → Provide `habits-ui.js` + `habits.js`

---

## Core Layer

| Feature | File | Notes |
|---------|------|-------|
| localStorage read/write | `js/core/state.js` | Key: `super_app_v1`. Namespaces: portfolio / habits / financecalc / gist |
| GitHub Gist save | `js/core/gist.js` | `App.Gist.save(payload, token, id)` |
| GitHub Gist load | `js/core/gist.js` | `App.Gist.load(token, id)` |
| Module registration | `js/core/app-shell.js` | `App.Shell.registerModule({id, label, icon, init})` |
| Module switching | `js/core/app-shell.js` | `App.Shell.switchModule(id)` |
| Sidebar rendering | `js/core/app-shell.js` | `_renderSidebar()` |

**Bug in data persistence?** → Provide `js/core/state.js`
**Bug in Gist API?** → Provide `js/core/gist.js`
**Bug in sidebar / module switching?** → Provide `js/core/app-shell.js`

---

## Calculations & Price Engine (all in portfolio.js)

| Feature | Function | Files to provide |
|---------|----------|-----------------|
| FIFO lot matching | `computePositions()` | `portfolio.js` |
| Portfolio summary | `computeSummary(positions)` | `portfolio.js` |
| XIRR solver | `calcXIRR(cashflows, dates)` | `portfolio.js` |
| CAGR | `calcCagr(cost, value, years)` | `portfolio.js` |
| Per-lot XIRR | `lotXIRR(lot, currentPriceD)` | `portfolio-ui.js` |
| FX rates (ECB) | `fetchFX()`, `getFxRate()` | `portfolio.js` |
| Live prices (Yahoo) | `fetchYahoo(ticker)` | `portfolio.js` |
| Live prices (CoinGecko) | `fetchCoinGeckoBatch(tickers)` | `portfolio.js` |
| Live prices (Alpha Vantage) | `fetchAlphaVantage(ticker, key)` | `portfolio.js` |
| Mock prices (fallback) | `getMockPrice(ticker)` | `portfolio.js` |
| Number formatting | `fmtValue`, `fmtCompact`, `fmtPct`, `fmtXIRR`, `fmtCAGR` | `portfolio.js` |

**Wrong calculation result?** → Provide `portfolio.js`

---

## Visual Styles

| What you want to change | Where it lives | Files to provide |
|------------------------|----------------|-----------------|
| Colours, fonts, spacing | CSS variables at top of file | `css/bitxapp-base.css` |
| Dark / light theme | `[data-theme="dark"]` / `[data-theme="light"]` selectors | `css/bitxapp-base.css` |
| KPI card style | `.kpi-card`, `.kpi-spark`, `.kpi-delta` | `css/bitxapp-base.css` |
| Position card style | `.pos-card`, `.pos-card-foot`, `.pos-btn` | `css/bitxapp-base.css` |
| Drawer style | `.drw`, `.drw-kpi`, `.drw-pill`, `.drw-summary` | `css/bitxapp-base.css` |
| Table style | `.htbl`, `.ltbl`, `.an-tbl` | `css/bitxapp-base.css` |
| Habits-specific styles | `.habit-*` classes | `css/modules/habits.css` |

**Visual/layout bug?** → Provide `css/bitxapp-base.css`
**Works but looks wrong?** → Provide `css/bitxapp-base.css` + the relevant `.js` file

---

## Quick Reference: What to Provide for Common Fixes

| "I want to fix / add…" | Provide these files |
|------------------------|---------------------|
| Overview KPI cards | `portfolio-ui.js` |
| Overview charts (donut / bar) | `portfolio-ui.js` |
| Overview analytics tables | `portfolio-ui.js` |
| Position card layout or metrics | `portfolio-ui.js` |
| Position card actions (buttons) | `portfolio-ui.js` + `portfolio.js` |
| History table columns or P&L | `portfolio-ui.js` |
| Position drawer — layout or data | `portfolio-ui.js` |
| Position drawer — dumbbell chart | `portfolio-ui.js` |
| Add/Edit transaction modal | `portfolio-ui.js` + `index.html` |
| CSV import wizard | `portfolio-data.js` |
| Settings panel | `portfolio-ui.js` + `index.html` + `portfolio.js` |
| Gist save / load | `portfolio.js` + `js/core/gist.js` |
| Sign out / credentials popup | `portfolio.js` + `index.html` |
| Price fetching (Yahoo/CoinGecko) | `portfolio.js` |
| XIRR / CAGR calculations | `portfolio.js` |
| FX rate logic | `portfolio.js` |
| Sidebar or module switching | `js/core/app-shell.js` |
| Data not persisting | `js/core/state.js` |
| Any visual style | `css/bitxapp-base.css` |
| Topbar layout | `index.html` + `portfolio.js` |
| Habits module | `habits-ui.js` + `habits.js` |
| Adding a new module | `js/core/app-shell.js` + `index.html` + new module files |

---

## HTML Overlay Structure (all in index.html)

These elements sit outside the main app shell to avoid z-index issues:

| Element ID | What it is |
|------------|-----------|
| `#modal-ov` + `#modal-box` | Add/Edit Transaction modal |
| `#csv-ov` + `#csv-box` | CSV Import Wizard |
| `#sp-ov` + `#settings-panel` | Settings slide-in panel |
| `#drw-ov` + `#drw` | Position Detail Drawer |
| `#confirm-dialog` | Confirm action dialog |
| `#toast-wrap` | Toast notification container |
| `#cred-ov` + `#cred-box` | GitHub Gist credentials popup |

**Overlay not showing / wrong z-index?** → Provide `index.html` + `css/bitxapp-base.css`

---

*Last updated after: modularization, 3-pass UI parity fix, Gist/sign-out implementation, position drawer full rewrite.*
