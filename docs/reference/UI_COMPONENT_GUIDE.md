# UI Component Guide — BiT PleB Dashboard

> **How to use this document**
> Find the component or feature you want to change. The "Files to provide" column tells you exactly which files to upload to Claude. The more specific you are about what's broken or what you want, the faster it gets fixed.

---

## File Map at a Glance

| File | Size | What lives here |
|------|------|-----------------|
| `index.html` | ~804 lines | All HTML structure, overlays, modals, script load order |
| **CSS** | | |
| `css/bitxapp-base.css` | ~2,031 lines | **All design tokens** (single source of truth), reset, layout, KPI cards, tables, drawers, modals, toasts |
| `css/components.css` | ~608 lines | Generic overlays — modal, settings panel, drawer, confirm dialog, toasts, forms |
| `css/main.css` | ~501 lines | Core shell layout, topbar, sidebar, typography, animations |
| `css/modules/portfolio.css` | ~476 lines | Portfolio-specific: KPI grid, position cards, overview charts, analytics tables |
| `css/modules/habits.css` | ~279 lines | Habit cards, heatmap grid, archive section |
| `css/modules/ember.css` | ~2,016 lines | Book spines, library cards, daily review, import wizard |
| **JS — Core** | | |
| `js/core/state.js` | ~365 lines | localStorage read/write, all namespaces (`super_app_v1`) |
| `js/core/gist.js` | ~148 lines | GitHub Gist API — save and load only |
| `js/core/app-shell.js` | ~339 lines | Sidebar, module registry, lazy-init module switching |
| **JS — Portfolio** | | |
| `js/modules/portfolio/portfolio.js` | ~1,467 lines | All business logic, calculations, price engine, CRUD, Gist |
| `js/modules/portfolio/portfolio-ui.js` | ~1,847 lines | All rendering — every tab, drawer, modal, charts |
| `js/modules/portfolio/portfolio-data.js` | ~325 lines | CSV import wizard, column alias detection, sample data seeding |
| **JS — Habits** | | |
| `js/modules/habits/habits.js` | ~307 lines | Streak calc, check-in toggle, CRUD |
| `js/modules/habits/habits-ui.js` | ~312 lines | Habit cards, heatmap, add form rendering |
| `js/modules/habits/habits-data.js` | ~124 lines | Data shapes, default seed data |
| **JS — Ember** | | |
| `js/modules/ember/ember.js` | ~360 lines | Source/highlight CRUD, daily review shuffle, Gist sync |
| `js/modules/ember/ember-ui.js` | ~745 lines | Books tab, library tab, daily review tab, import modal |
| `js/modules/ember/ember-data.js` | ~282 lines | Kindle TXT/HTML parsers, deduplication by hash |

---

## Script Load Order (Critical)

The following order in `index.html` must be maintained or modules will fail:

```
1. js/core/state.js          — all modules depend on this
2. js/core/gist.js
3. js/core/app-shell.js      — must exist before any registerModule() call

4. js/modules/habits/habits-data.js
5. js/modules/habits/habits.js
6. js/modules/habits/habits-ui.js

7. js/modules/ember/ember-data.js
8. js/modules/ember/ember.js
9. js/modules/ember/ember-ui.js

10. js/modules/portfolio/portfolio-data.js
11. js/modules/portfolio/portfolio.js
12. js/modules/portfolio/portfolio-ui.js

13. Inline <script>: App.State.init() → App.Shell.init('portfolio')
```

---

## Topbar

```
[ BiT PleB logo ]  BiT PleB          [ Sign Out ] [ ☀️ Theme ]
```

| Component | What it does | Files to provide |
|-----------|-------------|-----------------|
| Logo + title | Static branding | `index.html` |
| Sign Out button `#h-signout-btn` | Clears Gist credentials → opens credentials popup | `index.html` + `portfolio.js` |
| Theme toggle `#theme-toggle` | Dark / light mode (`toggleTheme`) | `index.html` + `portfolio.js` |

**Bug in topbar?** → Provide `index.html` + `portfolio.js`

---

## Sidebar

```
[ 📊 Portfolio ]
[ 🔁 Habits    ]
[ 📖 Ember     ]
[ 🧮 Calc      ]
─────────────────
[ Gist save ↑  ]
```

| Component | What it does | Files to provide |
|-----------|-------------|-----------------|
| Module buttons | Rendered by `App.Shell._renderSidebar()` from registered modules | `js/core/app-shell.js` |
| Active module highlight | CSS `.sb-btn.active` | `css/bitxapp-base.css` or `css/main.css` |
| Gist save shortcut `#sb-gist-save` | Calls the active module's Gist save | `js/core/app-shell.js` + `portfolio.js` |

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
| Save to Gist button | `#h-gist-save` | `portfolio.js` (`triggerGistSave`) |
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
| 11 KPI cards | `renderOverview()` | `portfolio-ui.js` |
| KPI sparklines | `miniSpark()` inline in `renderOverview` | `portfolio-ui.js` |
| Allocation donut (By Asset) | `drawSVGDonut('donut-asset-svg', ...)` | `portfolio-ui.js` |
| Allocation donut (By Class) | `drawSVGDonut('donut-class-svg', ...)` | `portfolio-ui.js` |
| Invested vs Market bar chart | `renderBarChart()` | `portfolio-ui.js` |
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
│  CAGR: +12.4% p.a.  XIRR: +14.2%       │
│  [Details] [+] [Rename] [×]             │
└─────────────────────────────────────────┘
─── Liquidated Positions ───
```

| Component | Function | Files to provide |
|-----------|----------|-----------------|
| Position count `#pos-count` | Updated in `renderPositions()` | `portfolio-ui.js` |
| Class filter buttons | `clf-all/Stock/ETF/Crypto/Bond/MF` | `portfolio-ui.js` + `portfolio.js` |
| Position card layout | `buildCard()` in `renderPositions()` | `portfolio-ui.js` |
| Details button | `App.Portfolio.openDrawer(ticker)` | `portfolio-ui.js` + `portfolio.js` |
| Add (+) button | `App.PortfolioUI.openEditModal(null, ticker)` | `portfolio-ui.js` |
| Rename button | `App.Portfolio.renameTicker(ticker)` | `portfolio.js` |
| Delete (×) button | `App.Portfolio.confirmDeletePos(ticker)` | `portfolio.js` |
| Liquidated section | Cards with `.pos-section-divider` | `portfolio-ui.js` |
| Export CSV button | `App.Portfolio.exportPortfolioCSV()` | `portfolio.js` |
| Import CSV button | Opens CSV wizard | `portfolio-data.js` |

**Bug in position cards?** → Provide `portfolio-ui.js`
**Wrong values (calc)?** → Provide `portfolio.js` (`computePositions`)
**Delete/rename not working?** → Provide `portfolio.js`

---

## Portfolio — History Tab

```
[Search ticker…]  [All] [Buy] [Sell]  [Sort ▾]  [Date from…] [Date to…]

 #  Date         Type   Ticker  Class   Qty    Price    Total     P&L      [×]
```

| Component | Function | Files to provide |
|-----------|----------|-----------------|
| Search filter `#hist-search` | Filters by ticker | `portfolio-ui.js` |
| All/Buy/Sell filter | `#f-all/buy/sell` | `portfolio-ui.js` + `portfolio.js` |
| Date range filters | `#hist-date-from`, `#hist-date-to` | `portfolio-ui.js` |
| Sort selector `#hist-sort` | Sort by date/ticker/total | `portfolio-ui.js` |
| Table rows | `renderHistory()` — 10 columns | `portfolio-ui.js` |
| P&L column | BUY = unrealised vs current; SELL = realised | `portfolio-ui.js` |
| Delete button | `App.Portfolio.confirmDelTx(id, ticker, qty)` | `portfolio.js` |

**Bug in history table?** → Provide `portfolio-ui.js`
**P&L calculation wrong?** → Provide `portfolio-ui.js` + `portfolio.js`

---

## Position Detail Drawer

```
[ ●AAPL ]  Apple Inc. [Stock]  · Live · Yahoo Finance
           CAGR: +12.4%   XIRR: +14.2%

[ Current Price ][ Total Shares ][ Current Value ][ Unrealised P&L ][ Realised P&L ][ Fees·Taxes ]

Total Gain: +€720 · CAGR: +12.4% · XIRR: +14.2% · Avg hold: 1.8 yr · FX: EUR ✓

[ Lot distribution bar ]

[ Dumbbell Canvas Chart — Buy price vs Current price per lot ]

All Transactions
 #  Type  Date  Qty  Price  Total  Fees  P&L  P&L%  [×]
Open Lots (FIFO)
 #  Date  Qty  Buy Price  Cost  Value  Gain  Gain%  CAGR  XIRR
```

| Component | Function | Files to provide |
|-----------|----------|-----------------|
| Drawer open/close | `openDrawer(ticker)` / `closeDrawer()` | `portfolio-ui.js` |
| Header icon | Styled initials with ticker color | `portfolio-ui.js` |
| CAGR/XIRR pills | `#drw-pills` | `portfolio-ui.js` |
| KPI row | `#drw-kpis` — 5–6 cards | `portfolio-ui.js` |
| Summary bar | `#drw-summary` | `portfolio-ui.js` |
| Lot distribution bar | `#drw-lot-dist`, `#drw-dist-track` | `portfolio-ui.js` |
| Dumbbell chart | `drawDumbbell()` — canvas element | `portfolio-ui.js` |
| Transactions table | `#drw-txs` tbody | `portfolio-ui.js` |
| FIFO lots table | `#drw-fifo-body` tbody | `portfolio-ui.js` |
| Per-lot XIRR | `lotXIRR()` helper | `portfolio-ui.js` |

**Bug in drawer layout or data?** → Provide `portfolio-ui.js`
**Dumbbell chart wrong?** → Provide `portfolio-ui.js` (search `drawDumbbell`)
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
| Quick ticker buttons | `.qt-btn` → `_setTickerInModal()` | `portfolio-ui.js` |
| BUY/SELL toggle | `setType()` | `portfolio-ui.js` |
| Ticker verify | `#f-verify` → ticker lookup | `portfolio-ui.js` |
| Auto-fill price | `_setTickerInModal()` reads price cache | `portfolio-ui.js` + `portfolio.js` |
| Total auto-calc | Live qty × price multiply | `portfolio-ui.js` |
| Submit (add) | `submitForm()` → `App.Portfolio.addTransaction()` | `portfolio-ui.js` + `portfolio.js` |
| Submit (edit) | `submitForm()` → `App.Portfolio.editTransaction()` | `portfolio-ui.js` + `portfolio.js` |
| HTML structure | Modal markup | `index.html` |

**Bug in modal form?** → Provide `portfolio-ui.js` + `index.html`
**Transaction not saving correctly?** → Provide `portfolio.js` (`addTransaction`, `editTransaction`)

---

## CSV Import Wizard

```
Step 1: Upload CSV
Step 2: Resolve column mapping  (auto-detects 20+ header variants)
Step 3: Preview & confirm import
```

| Component | Function | Files to provide |
|-----------|----------|-----------------|
| Wizard flow | `openCsvModal()`, step navigation | `portfolio-data.js` |
| Column resolver | Maps CSV headers → app fields (case-insensitive) | `portfolio-data.js` |
| Preview table | Shows parsed transactions before import | `portfolio-data.js` |
| Deduplication | Skips rows already in state | `portfolio-data.js` |
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
  EUR→USD: 1.0912   EUR→INR: ₹91.2   Last ECB date

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
| Price Sources section | `#cfg-api-key`, `#cfg-cache-ttl` | `portfolio-ui.js` + `portfolio.js` |
| FX chips `#sp-fx-chips` | Updated by `updateFXUI()` | `portfolio.js` |
| Export JSON | `App.Portfolio.exportData()` | `portfolio.js` |
| Export CSV | `App.Portfolio.exportPortfolioCSV()` | `portfolio.js` |
| Import JSON | `App.Portfolio.triggerImport()` + `importData()` | `portfolio.js` |
| Clear Price Cache | `App.Portfolio.clearPriceCache()` | `portfolio.js` |
| Undo Last Delete | `App.Portfolio.undoDelete()` | `portfolio.js` |
| Factory Reset | Confirm → `localStorage.clear()` + reload | `portfolio-ui.js` |
| Gist token field `#cfg-gist-token` | Saved via `App.State.setGistCredentials()` | `index.html` + `portfolio.js` |
| Save to Gist | `App.Portfolio.triggerGistSave()` | `portfolio.js` |
| Load from Gist | `App.Portfolio.gistLoad()` | `portfolio.js` |
| Clear Credentials | `App.Portfolio.gistClearCredentials()` | `portfolio.js` |
| Gist status line `#gist-status` | `setGistStatus()` | `portfolio.js` |

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
      Remove all 3 transaction(s)…
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
| Show toast | `toast(message, type)` — types: success / error / info / warn | `portfolio.js` |
| Container | `#toast-wrap` | `index.html` |
| Styles | `.toast`, `.toast-success`, `.toast-error`, etc. | `css/bitxapp-base.css` |

---

## Habits Module

```
[ 🔁 Habits ]
  ┌─────────────────────────────┐
  │ 🏃 Exercise  Streak: 5d     │
  │ ██████████████░░░░░░ 80%    │
  │ [heatmap grid — 35 days]    │
  └─────────────────────────────┘
  [ + Add Habit ]
  ─── Archived ───
```

| Component | Function | Files to provide |
|-----------|----------|-----------------|
| All rendering | `App.HabitsUI.render()` | `habits-ui.js` |
| Habit cards | `renderHabitCard()` — name, icon, streak, rate | `habits-ui.js` |
| Heatmap grid | `renderHeatmap()` — 35-day calendar grid | `habits-ui.js` |
| Check-in toggle | `App.Habits.checkIn(habitId)` | `habits.js` |
| Streak calc | `getStreakInfo(habitId)` | `habits.js` |
| Completion rate | `getCompletionRate(habitId, days)` | `habits.js` |
| Add habit form | `openAddForm()` modal with icon picker | `habits-ui.js` |
| Archive / delete | `App.Habits.archiveHabit()` / `deleteHabit()` | `habits.js` |
| Gist sync | `App.Habits.triggerGistSave()` | `habits.js` |
| Default seed data | 4 habits, 30 days of logs | `habits-data.js` |
| HTML container | `#mod-habits` → `#habits-content` | `index.html` |
| Styles | `.habit-card`, `.heatmap-cell` | `css/modules/habits.css` |

**Bug in habits?** → Provide `habits-ui.js` + `habits.js`
**Streak / completion rate wrong?** → Provide `habits.js`

---

## Ember Module (Reading Highlights)

```
[ 📖 Ember ]
  Tabs: [ Books ] [ Library ] [ Daily Review ]

  Books tab:
  ┌───────────────────────┐
  │ ▌ Atomic Habits       │   (spine color)
  │   James Clear         │
  │   248 highlights      │
  │                   [×] │
  └───────────────────────┘

  Library tab: Searchable/filterable highlight cards
  Daily Review tab: 5 highlights for today (same each day)
```

| Component | Function | Files to provide |
|-----------|----------|-----------------|
| All rendering | `App.EmberUI.render()` | `ember-ui.js` |
| Books tab | `renderBooksTab()` — source list with spine colors | `ember-ui.js` |
| Library tab | `renderLibraryTab()` — searchable highlights | `ember-ui.js` |
| Daily Review tab | `renderReviewTab()` — 5 daily highlights | `ember-ui.js` |
| Daily review logic | `App.Ember.getDailyReview()` — date-seeded shuffle | `ember.js` |
| Import modal (3-step wizard) | `openImportModal()` | `ember-ui.js` |
| Kindle TXT parser | `parseKindleTxt()` | `ember-data.js` |
| Kindle HTML parser | `parseKindleHtml()` | `ember-data.js` |
| Deduplication | Hash-based, skips duplicates on re-import | `ember-data.js` |
| Source CRUD | `getSources()`, `deleteSource()` | `ember.js` |
| Highlight CRUD | `getHighlights()`, `deleteHighlight()` | `ember.js` |
| Gist sync | `App.Ember.triggerGistSave()` | `ember.js` |
| Spine colors | 10-color CSS palette auto-assigned | `ember.js` + `css/modules/ember.css` |
| HTML container | `#mod-ember` | `index.html` |

**Bug in Ember?** → Provide `ember-ui.js` + `ember.js`
**Import not parsing correctly?** → Provide `ember-data.js`
**Daily review showing wrong highlights?** → Provide `ember.js` (`getDailyReview`)

---

## Core Layer

| Feature | File | Notes |
|---------|------|-------|
| localStorage read/write | `js/core/state.js` | Key: `super_app_v1`. Namespaces: `portfolio`, `habits`, `ember`, `gist`, `app` |
| GitHub Gist save | `js/core/gist.js` | `App.Gist.save(payload, token, id)` → strips tokens before write |
| GitHub Gist load | `js/core/gist.js` | `App.Gist.load(token, id)` |
| Module registration | `js/core/app-shell.js` | `App.Shell.registerModule({id, label, icon, init})` |
| Module switching | `js/core/app-shell.js` | `App.Shell.switchModule(id)` — lazy-init on first visit |
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
| XIRR solver | `calcXIRR(cashflows, dates)` — Newton-Raphson | `portfolio.js` |
| CAGR | `calcCagr(cost, value, years)` — 12-month guard | `portfolio.js` |
| Per-lot XIRR | `lotXIRR(lot, currentPriceD)` | `portfolio-ui.js` |
| FX rates (ECB) | `fetchFX()`, `getFxRate()` | `portfolio.js` |
| Live prices (Yahoo) | `fetchYahoo(ticker)` | `portfolio.js` |
| Live prices (CoinGecko) | `fetchCoinGeckoBatch(tickers)` | `portfolio.js` |
| Live prices (Alpha Vantage) | `fetchAlphaVantage(ticker, key)` | `portfolio.js` |
| Mock prices (fallback) | `getMockPrice(ticker)` | `portfolio.js` |
| Number formatting | `fmtValue`, `fmtCompact`, `fmtPct`, `fmtXIRR`, `fmtCAGR` | `portfolio.js` |

**Wrong calculation result?** → Provide `portfolio.js`

---

## State / Storage Schema

The single localStorage key `super_app_v1` stores:

```js
{
  portfolio: {
    transactions: [{id, date, ticker, type, qty, price, fees, taxes, notes}],
    deletedTransactions: [],        // for undo
    priceCache: {ticker: {ts, price, source}},
    tickerMeta: {ticker: {name, class}},
    lastRefreshTS: timestamp,
    fxDaily: {USD: {date: rate}, INR: {...}},
    fxLastFetch: timestamp,
    settings: {currency, apiKey, cacheTTL, theme}
  },
  habits: {
    habits: [{id, name, icon, color, createdAt, archivedAt}],
    logs: [{id, habitId, date}]
  },
  ember: {
    sources: [{id, title, author, format, importedAt, highlightCount, spineColor}],
    highlights: [{id, sourceId, text, chapter, location, page, color, hash, addedAt}]
  },
  gist: { token: '', id: '', lastSync: '' },
  app: { theme: 'dark' }
}
```

**Migration:** On Gist load, old `portfolio_v3` format is auto-detected and wrapped into `super_app_v1` structure.

---

## Visual Styles

| What you want to change | Where it lives | Files to provide |
|------------------------|----------------|-----------------|
| Colours, fonts, spacing | CSS variables at top of each file | `css/bitxapp-base.css` |
| Dark / light theme | `[data-theme="dark"]` / `[data-theme="light"]` selectors | `css/bitxapp-base.css` |
| App shell (topbar, sidebar) | Layout rules | `css/main.css` |
| Generic overlays (modals, drawers, toasts) | Component rules | `css/components.css` |
| KPI card style | `.kpi-card`, `.kpi-spark`, `.kpi-delta` | `css/modules/portfolio.css` |
| Position card style | `.pos-card`, `.pos-card-foot`, `.pos-btn` | `css/modules/portfolio.css` |
| Drawer style | `.drw`, `.drw-kpi`, `.drw-pill`, `.drw-summary` | `css/modules/portfolio.css` |
| Table style | `.htbl`, `.ltbl`, `.an-tbl` | `css/modules/portfolio.css` |
| Habits-specific styles | `.habit-card`, `.heatmap-cell` | `css/modules/habits.css` |
| Ember-specific styles | `.ember-book`, `.highlight-card`, `.review-card` | `css/modules/ember.css` |

**Visual/layout bug?** → Provide the relevant `css/modules/` file
**Works but looks wrong?** → Provide `css/bitxapp-base.css` + the relevant `.js` file

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

**Overlay not showing / wrong z-index?** → Provide `index.html` + `css/components.css`

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
| Habits module (any part) | `habits-ui.js` + `habits.js` |
| Habits streak / rate calc | `habits.js` |
| Ember books or library tab | `ember-ui.js` + `ember.js` |
| Ember import / parsing | `ember-data.js` |
| Ember daily review | `ember.js` + `ember-ui.js` |
| Sidebar or module switching | `js/core/app-shell.js` + `index.html` |
| Data not persisting | `js/core/state.js` |
| Any visual style | relevant `css/modules/*.css` + `css/bitxapp-base.css` |
| Topbar layout | `index.html` + `portfolio.js` |
| Adding a new module | `js/core/app-shell.js` + `index.html` + new `js/modules/<name>/` files |

---

*Last updated: April 2026 — after full modularization (Portfolio + Habits + Ember), CSS split into 7 files, Ember module added, unified state layer, Gist cross-module sync confirmed.*
