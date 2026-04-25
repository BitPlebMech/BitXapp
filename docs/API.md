# BiT PleB Dashboard — Public API Reference

All modules expose their API on the `window.App` namespace. This document covers every public method across core and module layers.

---

## Core Layer

### `App.Constants`

Frozen object. All values are read-only.

```javascript
App.Constants.CACHE_TTL_MS          // number  — 14400000 (4 hours)
App.Constants.QTY_EPSILON           // number  — 0.00001
App.Constants.MIN_CAGR_YEARS        // number  — 1.0
App.Constants.TOAST_TIMEOUT_MS      // number  — 3500
App.Constants.TOAST_SHOW_DELAY_MS   // number  — 10
App.Constants.TOAST_FADE_OUT_MS     // number  — 300
App.Constants.FETCH_TIMEOUT_MS      // { quick: 4000, standard: 5000, slow: 10000, bulk: 25000 }
App.Constants.MAX_DELETED_HISTORY   // number  — 10
App.Constants.MAX_STREAK_DAYS       // number  — 365
App.Constants.CORS_PROXY            // string  — 'https://corsproxy.io/?'
```

---

### `App.Utils`

```javascript
App.Utils.trySafe(fn, fallback?, context?)
// Runs fn(). On exception, logs [context] error and returns fallback.
// @param fn        {Function}  function to attempt
// @param fallback  {*}         returned on failure (default null)
// @param context   {string}    label for console.error (default 'Operation')
// @returns {*}

App.Utils.generateId(prefix?)
// Returns a unique ID: "<prefix>_<base36 ts>_<4-char rand>"
// @param prefix  {string}  (default 'id')
// @returns {string}  e.g. "id_lxk2f4a0_8d3z"

App.Utils.clamp(value, min, max)
// @returns {number}  value clamped to [min, max]

App.Utils.debounce(fn, ms?)
// @param ms  {number}  delay in ms (default 300)
// @returns {Function}  debounced version of fn
```

---

### `App.ThemeTokens`

Frozen object with all chart colour palettes.

```javascript
App.ThemeTokens.PALETTE        // string[14]  — 14-hue stride-7 chart palette
App.ThemeTokens.LOT_COLORS     // string[10]  — FIFO lot colours
App.ThemeTokens.CLASS_COLORS   // { Stock, ETF, Crypto, Bond, MF }
App.ThemeTokens.CLS_CSS        // { Stock, ETF, Crypto, Bond, MF }  — CSS class names
App.ThemeTokens.CUR_SYMBOLS    // { EUR: '€', USD: '$', INR: '₹' }
App.ThemeTokens.SPINE_PALETTE  // string[10]  — Ember book-spine colours
```

---

### `App.Formatters`

```javascript
App.Formatters.fmtDate(s)
// "01 Jan 2025"
// @param s  {string}  ISO date "YYYY-MM-DD"
// @returns  {string}

App.Formatters.fmtDateShort(s)
// "Jan '25"
// @param s  {string}  ISO date "YYYY-MM-DD"
// @returns  {string}

App.Formatters.fmtDateLong(s)
// "Wednesday, 1 January 2025"
// @param s  {string}  ISO date "YYYY-MM-DD"
// @returns  {string}

App.Formatters.todayISO()
// @returns  {string}  current date as "YYYY-MM-DD" in local time

App.Formatters.daysAgoISO(n)
// @param n  {number}  days to subtract (0 = today)
// @returns  {string}  "YYYY-MM-DD" in local time

App.Formatters.timeAgo(ts)
// "just now" | "5m ago" | "3h ago" | "2d ago"
// @param ts  {number|string}  Unix ms or ISO timestamp string
// @returns   {string}

App.Formatters.fmtNum(n, places?)
// Locale number with thousands separator. Returns '—' for null/NaN/Infinity.
// @param places  {number}  decimal places (default 2)
// @returns  {string}

App.Formatters.fmtPct(n, places?, alreadyPct?)
// "+12.34 %" with sign. Returns '—' for null/NaN.
// @param alreadyPct  {boolean}  true if n is already in percent (e.g. 12.34)
// @returns  {string}
```

---

### `App.Pagination`

```javascript
App.Pagination.paginate(items, pageSize?)
// @param items     {Array}   full list
// @param pageSize  {number}  items per page (default 25)
// @returns {object} with:
//   .items        {Array}   original array
//   .totalPages   {number}
//   .pageSize     {number}
//   .getPage(n)            → Array   items for 1-indexed page n
//   .hasNext(n)            → boolean
//   .hasPrev(n)            → boolean
//   .slice(n)              → { items, from, to, total }

App.Pagination.renderControls(currentPage, totalPages, onPage?)
// Returns HTML string for a prev/next/page-info bar.
// @param onPage  {Function}  optional callback(pageNumber) — wires button clicks
// @returns  {string}  HTML

App.Pagination.DEFAULT_PAGE_SIZE  // number — 25
```

---

### `App.Filters`

```javascript
App.Filters.textSearch(items, query, fields)
// Case-insensitive search across specified fields. Empty query returns all items.
// Supports dot-notation fields: ['source.title'].
// @param items   {Array}     array of objects
// @param query   {string}    search string
// @param fields  {string[]}  object keys to search
// @returns {Array}

App.Filters.dateRange(items, startDate, endDate, dateField?)
// @param startDate  {string|null}  ISO "YYYY-MM-DD" inclusive start
// @param endDate    {string|null}  ISO "YYYY-MM-DD" inclusive end
// @param dateField  {string}       key on items (default 'date')
// @returns {Array}

App.Filters.byField(items, field, value)
// Exact-match filter. Returns all items if value is null/undefined.
// @returns {Array}

App.Filters.combine(fns, items)
// Applies filter functions sequentially: combine([textFn, dateFn], items).
// @param fns  {Function[]}  each receives (items) → filteredItems
// @returns {Array}

App.Filters.sortBy(items, field, direction?)
// @param direction  {'asc'|'desc'}  (default 'asc')
// @returns {Array}  new sorted array (does not mutate)
```

---

### `App.State`

```javascript
App.State.init()
// Load state from localStorage. Must be called once before any other method.

App.State.getAll()          → object   // Full state (do not mutate directly)
App.State.setAll(newState)             // Replace full state (use only for Gist load)
App.State.mergeAll(incoming)           // Safe merge from Gist load

// Portfolio
App.State.getPortfolioData()           → object
App.State.setPortfolioData(obj)
App.State.getPortfolioSettings()       → object
App.State.setPortfolioSettings(obj)

// Habits
App.State.getHabitsData()              → { habits: [], logs: [] }
App.State.setHabitsData(obj)

// FinanceCalc
App.State.getFinanceCalcData()         → { saved: [], history: [] }
App.State.setFinanceCalcData(obj)

// Ember
App.State.getEmberData()               → { sources: [], highlights: [], settings: {}, streak: {} }
App.State.setEmberData(obj)
App.State.getEmberSettings()           → object
App.State.setEmberSettings(obj)
App.State.getEmberStreak()             → { currentStreak, longestStreak, lastReviewDate, totalReviewDays, reviewHistory }
App.State.setEmberStreak(obj)

// Gist credentials
App.State.getGistCredentials()         → { token, id, lastSync }
App.State.setGistCredentials({ token?, id?, lastSync? })  // partial update OK
App.State.clearGistCredentials()       // wipes token + id + legacy fields

// Utility
App.State.storageInfo()                → string  // "12.3 KB / 5 MB"
App.State.resetAll()                             // factory reset — wipes localStorage
```

---

### `App.Gist`

```javascript
App.Gist.savePortfolioData(payload, token, id?)
// @param payload  {{ portfolio, gist }}
// @param token    {string}  GitHub PAT
// @param id       {string}  existing Gist ID; omit to create new
// @returns Promise<{ id: string, url: string }>

App.Gist.loadPortfolioData(token, id)
// @returns Promise<object>  parsed JSON payload

App.Gist.saveEmberData(payload, token, id)
// @param payload  {{ highlights, settings, streak }}
// @returns Promise<{ id: string, url: string }>

App.Gist.loadEmberData(token, id)
// @returns Promise<object|null>  null if ember-highlights.json not in Gist yet

App.Gist.save(payload, token, id?)
// Generic save — writes full payload to 'portfolio-data.json'
// @returns Promise<{ id: string, url: string }>

App.Gist.load(token, id)
// Generic load
// @returns Promise<object>
```

---

### `App.Shell`

```javascript
App.Shell.init(defaultModule?)
// Bootstrap the shell: renders sidebar, applies theme, switches to defaultModule.
// @param defaultModule  {string}  module id (default 'portfolio')

App.Shell.registerModule({ id, label, icon, init })
// Register a module before App.Shell.init() is called.
// @param id     {string}    unique module identifier
// @param label  {string}    sidebar display name
// @param icon   {string}    SVG HTML string
// @param init   {Function}  called once on first module visit

App.Shell.switchModule(modId)
// Navigate to a module. Lazy-inits it if first visit.

App.Shell.toast(msg, type?)
// Show a toast notification.
// @param type  {'info'|'success'|'error'|'warn'}  (default 'info')

App.Shell.confirmAction(title, body, icon, confirmLabel, onConfirm)
// Show the global confirm dialog.
// @param onConfirm  {Function}  called if user clicks confirm

App.Shell.confirmDo()     // Executes the confirm callback and closes dialog
App.Shell.confirmCancel() // Closes dialog without executing

App.Shell.applyTheme()    // Re-reads saved theme and applies data-theme attribute

App.Shell.triggerGistSave()
// Race-condition-safe Gist save for all modules.

App.Shell.active  // getter — returns currently active module id
```

---

## Module Layer

### `App.Habits`

```javascript
// ── Streak & stats ───────────────────────────────────────────────

App.Habits.getStreakInfo(habitId)
// @returns {{ current: number, longest: number, checkedToday: boolean }}

App.Habits.getCompletionRate(habitId, days?)
// @param days  {number}  look-back window (default 7)
// @returns {number}  0..100

App.Habits.getRecentDays(habitId, days?)
// @param days  {number}  (default 28)
// @returns Array<{ date: string, done: boolean }>

App.Habits.getTotalCheckIns(habitId)
// @returns {number}

// ── Actions ──────────────────────────────────────────────────────

App.Habits.toggleCheckIn(habitId)
// Toggle today's check-in for a habit. Triggers re-render.
// @returns {{ checkedIn: boolean }}

App.Habits.addHabit({ name, icon?, color? })
// @param icon   {string}  emoji (default '⭐')
// @param color  {string}  hex colour (default '#5b9cff')
// @returns {string}  new habit id

App.Habits.editHabit(habitId, { name?, icon?, color? })

App.Habits.archiveHabit(habitId)

App.Habits.deleteHabit(habitId)

// ── Module interface ─────────────────────────────────────────────

App.Habits.init()
App.Habits.triggerGistSave()
App.Habits.getData()    // → raw habits state object
App.Habits.today()      // → "YYYY-MM-DD"
```

---

### `App.Ember`

```javascript
// ── Sources ──────────────────────────────────────────────────────

App.Ember.getSources()
// @returns Array<{ id, title, author, format, importedAt, highlightCount }>

App.Ember.getSource(sourceId)
// @returns source object | undefined

App.Ember.deleteSource(sourceId)
// Deletes source and all its highlights.

// ── Highlights ───────────────────────────────────────────────────

App.Ember.getHighlights(sourceId?)
// @param sourceId  {string|null}  omit for all highlights
// @returns Array<highlight>

App.Ember.deleteHighlight(highlightId)

// ── Import ───────────────────────────────────────────────────────

App.Ember.importParsed(parsedSources, category?)
// @param parsedSources  output from App.Ember.Data.parse()
// @param category       {string}  (default 'general')
// @returns {{ imported: number, skipped: number, sourceNames: string[] }}

// ── Spaced Repetition ────────────────────────────────────────────

App.Ember.getReviewQueue()
// @returns Array<highlight>  sorted by nextReview asc

App.Ember.submitReview(highlightId, quality)
// @param quality  {0|1|2|3|4|5}  SM-2 quality score
// Updates srData and streak.

App.Ember.getIntervalPreview(srData, quality)
// @returns {{ interval: number, nextReview: string }}

// ── Streak ───────────────────────────────────────────────────────

App.Ember.getStreak()
// @returns {{ currentStreak, longestStreak, lastReviewDate, totalReviewDays }}

App.Ember.resetStreak()

// ── Settings ─────────────────────────────────────────────────────

App.Ember.getSettings()
// @returns {{ email, emailEnabled, emailFrequency, emailTime, dailyGoal, emailJSConfig }}

App.Ember.saveSettings(settings)

// ── Email ────────────────────────────────────────────────────────

App.Ember.generateDailyDigest()
// @returns Array<highlight>  highlights selected for today's email

App.Ember.sendDailyEmail(isTest?)
// @param isTest  {boolean}  send a test email immediately (default false)
// @returns Promise<void>

// ── Stats ────────────────────────────────────────────────────────

App.Ember.getStats()
// @returns {{ totalSources, totalHighlights, reviewedToday, avgInterval, ... }}

// ── Module interface ─────────────────────────────────────────────

App.Ember.init()
App.Ember.triggerGistSave()
App.Ember.Data   // sub-module: App.Ember.Data.parse(), .parseTxt(), .parseHtml()
```

---

### `App.Portfolio`

Key public methods (full list in `portfolio.js` exports block):

```javascript
// ── Calculations (called by portfolio-ui.js) ──────────────────────

App.Portfolio.computePositions()
// @returns Array<position>  FIFO-matched positions with XIRR, CAGR, P&L

App.Portfolio.computeSummary(positions)
// @returns summary object with totals, portfolio XIRR, best/worst

// ── Formatting ───────────────────────────────────────────────────

App.Portfolio.fmtDate(s)          // "01 Jan 2025"
App.Portfolio.fmtDateShort(s)     // "Jan '25"
App.Portfolio.fmtNum(n, places?)  // locale number
App.Portfolio.fmtCurrency(n, decimals?)
App.Portfolio.fmtValue(n)         // compact currency, 0 decimals
App.Portfolio.fmtCompact(v)       // "1.2 M €" / "45 L ₹"
App.Portfolio.fmtPct(n, places?)  // "+12.34 %"
App.Portfolio.fmtXIRR(v)          // "+8.3 % XIRR" | "—"
App.Portfolio.fmtCAGR(v)          // "+5.1 % p.a." | "< 1yr"
App.Portfolio.fmtQty(qty)         // integer or up-to-15dp float
App.Portfolio.fmtInputNum(n, places?)
App.Portfolio.parseLocaleFloat(s)

// ── FX ───────────────────────────────────────────────────────────

App.Portfolio.eurToDisplay(eurAmount, dateStr?)
// Convert EUR amount to display currency using historical or latest FX rate.

App.Portfolio.usdToEur(usdPrice, dateStr?)

// ── Transactions ─────────────────────────────────────────────────

App.Portfolio.addTransaction(tx)
App.Portfolio.editTransaction(id, updates)
App.Portfolio.deleteTransaction(id)    // soft delete
App.Portfolio.restoreTransaction(id)
App.Portfolio.undoDelete()             // restore most recent deleted tx
App.Portfolio.deletePosition(ticker)   // delete all transactions for ticker

// ── Price management ─────────────────────────────────────────────

App.Portfolio.refreshPrices(force?)
// @param force  {boolean}  bypass cache (default false)

App.Portfolio.clearPriceCache()

// ── Import / Export ───────────────────────────────────────────────

App.Portfolio.exportData()         // download JSON backup
App.Portfolio.exportPortfolioCSV()
App.Portfolio.exportPositionCSV(ticker)
App.Portfolio.triggerImport()      // opens CSV import wizard

// ── Gist ──────────────────────────────────────────────────────────

App.Portfolio.triggerGistSave()
App.Portfolio.gistLoad()

// ── Module interface ──────────────────────────────────────────────

App.Portfolio.init()
App.Portfolio.render()
App.Portfolio.openDrawer(ticker)

// ── Constants (read-only refs) ────────────────────────────────────

App.Portfolio.PALETTE
App.Portfolio.LOT_COLORS
App.Portfolio.CLASS_COLORS
App.Portfolio.CLS_CSS
App.Portfolio.CUR_SYMBOLS
```

---

## Sub-modules

### `App.Ember.Data`

```javascript
App.Ember.Data.parse(content, filename)
// Auto-detect format and parse. Returns parsed sources array.

App.Ember.Data.parseTxt(content)
// Parse Kindle "My Clippings.txt" format.

App.Ember.Data.parseHtml(content)
// Parse Kindle HTML export format.

App.Ember.Data.detect(content, filename)
// @returns {'txt'|'html'|'unknown'}

App.Ember.Data.genId(prefix?)
// Unique ID generator (delegates to App.Utils.generateId).
```

### `App.Habits.Data`  (via `HD()` inside habits.js)

```javascript
// Accessed internally as App.Habits.Data — exposed via habits-data.js
App.Habits.Data.buildSeedData()
App.Habits.Data.today()       // → "YYYY-MM-DD"
App.Habits.Data.daysAgo(n)    // → "YYYY-MM-DD"
App.Habits.Data.genId()       // Delegates to App.Utils.generateId
```

### `App.Portfolio.Data`  (via `portfolio-data.js`)

```javascript
App.Portfolio.Data.parseCsvText(text)
// Parse raw CSV text from brokerage export.
// @returns Array<transaction>

App.Portfolio.Data.buildPreviewRows()
// @returns Array<previewRow>  for CSV import wizard preview table
```
