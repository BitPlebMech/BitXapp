# Portfolio Terminal — Phase 2 Kickoff Brief

> **Purpose:** This document summarizes everything built in Phase 1 so the next project can pick up cleanly. Hand this to Claude (or any developer) at the start of the next session.

---

## What This App Is

**BiT PleB Portfolio Terminal** — a zero-dependency, browser-based personal finance dashboard. No backend, no build step, no npm. Pure HTML + CSS + vanilla JavaScript served from a folder. Data lives in `localStorage` and optionally syncs to a private GitHub Gist.

**Modules built:**

| Module | Status | Purpose |
|--------|--------|---------|
| Portfolio | ✅ Complete | Investment tracking — FIFO, XIRR, CAGR, multi-asset, CSV import, Gist sync |
| Habits | ✅ Complete | Daily habit tracking with streaks, heatmap, completion rate |
| Ember | ✅ Complete | Kindle highlight import, searchable library, daily review |
| Finance Calc | 🔲 Stub | Registered but empty — compound interest, SIP, loan amortization planned |

---

## What Was Built in Phase 1

### 1. Monolith → Modular Architecture

Started from a single-file `BitXappMod.js` (~5,000 lines). Broke it into:

```
js/
├── core/
│   ├── state.js        ← Single localStorage API (no UI, no logic)
│   ├── gist.js         ← Pure GitHub Gist wrapper (save/load only)
│   └── app-shell.js    ← Module registry + sidebar + lazy-init router
└── modules/
    ├── portfolio/       ← portfolio-data.js · portfolio.js · portfolio-ui.js
    ├── habits/          ← habits-data.js · habits.js · habits-ui.js
    ├── ember/           ← ember-data.js · ember.js · ember-ui.js
    └── financecalc/     ← calc.js (stub)
```

CSS was also split from one blob into:
```
css/
├── bitxapp-base.css    ← Design tokens, KPI cards, tables, drawers
├── components.css      ← Generic overlays (modal, settings panel, toast)
├── main.css            ← App shell (topbar, sidebar)
└── modules/
    ├── portfolio.css
    ├── habits.css
    ├── ember.css
    └── financecalc.css
```

### 2. Core Infrastructure

**state.js** — All data goes through a single `App.State` API. One localStorage key: `super_app_v1`. Namespaces: `portfolio`, `habits`, `ember`, `financecalc`, `gist`. No module touches localStorage directly.

**gist.js** — Stateless GitHub Gist API wrapper. Credentials are never written to the Gist payload (GitHub auto-revokes exposed tokens). Any module can trigger a full sync by calling `App.Gist.save(App.State.getAll(), token, id)`.

**app-shell.js** — Modules register themselves with `App.Shell.registerModule({id, label, icon, init})`. The shell renders the sidebar and lazy-inits each module on first visit. No module knows about other modules.

### 3. Module Pattern (all 3 full modules follow this)

```
data layer   (*-data.js)  → shapes, parsers, seed data
logic layer  (*.js)       → CRUD, calculations, state I/O
UI layer     (*-ui.js)    → DOM rendering, event listeners
```

Data only flows: `UI → Logic → State → UI`. No cross-module dependencies.

### 4. Portfolio Module (most complex)

- **FIFO lot matching** with BUY-before-SELL on same date
- **XIRR** via Newton-Raphson solver (multiple seed points)
- **CAGR** with 12-month minimum guard (shows "—" under 1 year)
- **Live prices:** Yahoo Finance → CoinGecko → Alpha Vantage → mock fallback
- **FX:** ECB via frankfurter.app with cache + fallback chain
- **CSV import wizard** — auto-detects 20+ column header variants (case-insensitive)
- **11 KPI cards** on Overview: Total Value, Unrealised P&L, Realised, Net P&L, CAGR, XIRR, Win Rate, Best XIRR, Needs Attention, Avg Hold, Concentration
- **Position Drawer** — per-position KPIs, FIFO open lots, dumbbell chart (Canvas API), lot distribution bar
- **Gist cloud sync** — full bidirectional, backward-compatible with old `portfolio_v3` format
- **Settings panel** — price sources, FX display, data export/import/undo/reset, Gist credentials

### 5. Habits Module

- Streak tracking (current + longest consecutive days)
- Completion rate over configurable window
- 35-day heatmap grid
- Add/archive/delete habits with icon + color picker
- Seeds 4 default habits with 30 days of realistic history on first open
- Gist sync (proves cross-module sync works end-to-end)

### 6. Ember Module (Kindle Highlights)

- Parses Kindle `My Clippings.txt` format and Kindle HTML notebook exports
- Deduplicates by text hash (safe to re-import same file)
- Extracts chapter, location, page metadata
- 10-color spine palette auto-assigned to books
- Searchable/filterable library tab
- Daily Review: 5 highlights per day, deterministic date-seeded shuffle (same 5 every time you open on a given day)

---

## Key Architecture Decisions (rationale in REFACTOR_LOG.md)

| Decision | What was chosen | Why |
|----------|----------------|-----|
| State storage | Single `super_app_v1` key, all modules share | Atomic persistence, easy Gist sync |
| Gist credential safety | Strip `ghp_` tokens before writing | GitHub auto-revokes exposed tokens |
| Module init | Lazy — only called on first sidebar click | Faster initial load |
| CSS split | Base tokens + generic components + per-module | Scoped overrides, easier to fix bugs |
| FIFO ordering | BUY before SELL on same date | Correct lot matching |
| CAGR guard | Show "—" if holding period < 12 months | Avoids misleading annualized figures |
| Ember review | Date-seeded shuffle (not pure random) | Reproducible — same 5 highlights all day |
| No build tools | Zero dependencies, serve as-is | No setup friction, runs anywhere |

---

## File Structure (as handed off)

```
Portfolio-Terminal-Modular/
├── index.html                    ← Entry point, all HTML, script load order
├── UI_Component_Guide.md         ← Component → file mapping reference
├── REFACTOR_LOG.md               ← Architecture decisions log
├── PHASE2_KICKOFF.md             ← This document
├── logos/
│   └── logo.png
├── css/
│   ├── bitxapp-base.css          ← Design tokens, shared component styles
│   ├── components.css            ← Generic overlays
│   ├── main.css                  ← Shell layout
│   └── modules/
│       ├── portfolio.css
│       ├── habits.css
│       ├── ember.css
│       └── financecalc.css
└── js/
    ├── core/
    │   ├── state.js
    │   ├── gist.js
    │   └── app-shell.js
    └── modules/
        ├── portfolio/
        │   ├── portfolio-data.js
        │   ├── portfolio.js
        │   └── portfolio-ui.js
        ├── habits/
        │   ├── habits-data.js
        │   ├── habits.js
        │   └── habits-ui.js
        ├── ember/
        │   ├── ember-data.js
        │   ├── ember.js
        │   └── ember-ui.js
        └── financecalc/
            └── calc.js
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Language | Vanilla JavaScript (ES6+) |
| Styling | Pure CSS (custom properties, Grid, Flexbox) |
| Build | None — files served as static assets |
| Storage | `localStorage` (`super_app_v1`) |
| Cloud sync | GitHub Gist REST API |
| Price data | Yahoo Finance, CoinGecko, Alpha Vantage (optional), Frankfurter (FX) |
| Runtime | Modern browsers — Chrome 90+, Firefox 88+, Safari 14+ |

---

## What Is NOT Built Yet (Phase 2 Candidates)

| Feature | Notes |
|---------|-------|
| Finance Calculator | Stub registered; no UI or logic yet. SIP, compound interest, loan EMI |
| Return Comparator | Original monolith had this as a placeholder pane; never implemented |
| PDF highlight import | Ember currently supports Kindle only; PDF OCR planned |
| Mobile-optimized views | Responsive breakpoints exist but not fully tested on touch devices |
| Multi-currency portfolio view | FX conversion exists but currency switching UX could be smoother |
| Benchmarking (vs index) | Compare portfolio CAGR/XIRR vs S&P 500, Nifty, etc. |
| Tax lot optimization | Suggest which lot to sell to minimize tax |
| Recurring transactions | Auto-log DCA (Dollar Cost Averaging) schedules |

---

## How to Continue Development

### Starting a new session with Claude

Paste this into Claude at the start:

> "I'm continuing development of BiT PleB Portfolio Terminal. This is a zero-dependency vanilla JS + CSS app with no build step. The architecture uses a core layer (state.js, gist.js, app-shell.js) and per-module data/logic/UI files. All state lives in localStorage under `super_app_v1`. Modules register with App.Shell and are lazy-inited. Read PHASE2_KICKOFF.md and UI_Component_Guide.md before starting."

### Adding a new module

1. Create `js/modules/<name>/` with `<name>-data.js`, `<name>.js`, `<name>-ui.js`
2. Create `css/modules/<name>.css`
3. In `<name>.js`, call `App.Shell.registerModule({id, label, icon, init})`
4. In `index.html`, add the module's container div and load scripts in order
5. Follow the data → logic → UI pattern; access state only via `App.State`

### Running locally

Just open `index.html` in a browser. No server needed for basic use. For price APIs (Yahoo Finance), a local HTTP server avoids CORS issues:

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .
```

---

## Known Patterns & Conventions

| Pattern | Example |
|---------|---------|
| Private functions | `_functionName()` |
| State accessor aliases | `_state()`, `_save()`, `_data()` |
| Module shorthand | `P()` for Portfolio, `HD()` for Habits.Data |
| DOM helper | `el(id)` → `document.getElementById(id)` |
| CSS naming | BEM-style `.component__element--modifier` |
| Toast feedback | `toast(message, 'success'|'error'|'info'|'warn')` |
| Confirm dialog | `confirmAction(title, body, icon, btnLabel, callbackFn)` |
| Gist save pattern | `App.Gist.save(App.State.getAll(), token, id)` |

---

*Phase 1 completed: April 2026. Modularization, 3-pass UI parity, Ember module, CSS split, Gist cross-module sync.*
