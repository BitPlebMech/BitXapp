# BiT PleB Dashboard — Session Context Brief

> **How to use:** Paste this to Claude at the start of any new session.
> Say: *"Read docs/reference/CONTEXT_BRIEF.md before we start."*

---

## What This App Is

**BiT PleB Dashboard** — a zero-dependency, browser-based personal finance dashboard. No backend, no build step, no framework. Pure HTML + CSS + vanilla JavaScript served from a folder. Data lives in `localStorage` (`super_app_v1`) and optionally syncs to a private GitHub Gist.

**Open it:** just open `index.html` in a browser. For live prices, run a local server to avoid CORS:
```bash
python3 -m http.server 8080
# or: npx serve .
```

---

## Modules

| Module | Status | Purpose |
|--------|--------|---------|
| Portfolio | ✅ Complete | Investment tracking — FIFO, XIRR, CAGR, multi-asset, CSV import, live prices, Gist sync |
| Habits | ✅ Complete | Daily habit tracking — streaks, heatmap, completion rate, Gist sync |
| Ember | ✅ Complete | Kindle highlight import — searchable library, spaced repetition, daily digest email |
| Finance Calc | 🔲 Stub | Registered in shell, no UI yet — SIP, compound interest, loan EMI planned |

---

## File Structure

```
DashBoard/
├── index.html                    ← Entry point, all HTML, script load order
├── package.json                  ← Vitest dev dependency only
├── vitest.config.js
├── .gitignore
│
├── css/
│   ├── bitxapp-base.css          ← Design tokens (CSS vars), dark/light theme
│   ├── components.css            ← Generic overlays: modal, drawer, toast, forms
│   ├── main.css                  ← App shell: topbar, sidebar, layout
│   └── modules/
│       ├── portfolio.css
│       ├── habits.css
│       ├── ember.css
│       └── financecalc.css
│
├── js/
│   ├── core/
│   │   ├── constants.js          ← Magic numbers, no deps
│   │   ├── utils.js              ← Pure helpers (trySafe, generateId)
│   │   ├── formatters.js         ← Date/currency/number formatters
│   │   ├── pagination.js         ← List pagination helper
│   │   ├── filters.js            ← textSearch, dateRange, sortBy
│   │   ├── theme-tokens.js       ← Colour palette constants
│   │   ├── state.js              ← Single localStorage CRUD layer
│   │   ├── gist.js               ← Pure GitHub Gist API wrapper
│   │   └── app-shell.js          ← Module registry, sidebar, lazy-init router
│   └── modules/
│       ├── portfolio/            ← portfolio-data · portfolio · portfolio-ui
│       ├── habits/               ← habits-data · habits · habits-ui
│       ├── ember/                ← ember-data · ember-ui · ember
│       ├── financecalc/          ← calc (stub)
│       └── settings/             ← settings
│
├── tests/
│   ├── unit/                     ← 172 Vitest unit tests
│   └── integration/
│
├── logos/                        ← SVG + PNG app icons
│
└── docs/
    ├── ARCHITECTURE.md           ← Full architecture, algorithms, data flow
    ├── MODULE_RULES.md           ← Hard rules — read before adding any module
    ├── API.md                    ← Public API surface of every module
    ├── TESTING.md                ← How to run tests
    ├── TROUBLESHOOTING.md        ← Debug guide
    └── reference/
        ├── CONTEXT_BRIEF.md      ← This file
        ├── CODE_REVIEW.md        ← How to request a code review + checklist
        ├── UI_COMPONENT_GUIDE.md ← Component → file mapping
        ├── UI_TWEAKS.md          ← Safe-to-touch colours, fonts, spacing (file + line refs)
        ├── FUTURE_IPAD_SYNC.md   ← Multi-device sync analysis
        └── MACOS_APP.md          ← Native macOS app prerequisites
```

---

## The One Rule That Matters Most

Every module owns **one state namespace** and **one Gist file**. Never mix them.

```
Module       localStorage namespace    Gist file
──────────   ──────────────────────    ──────────────────────
portfolio    state.portfolio           portfolio-data.json
habits       state.habits              habits-data.json
ember        state.ember               ember-highlights.json
financecalc  state.financecalc         (no Gist yet)
```

Read `docs/MODULE_RULES.md` before touching anything. It lists every past bug caused by breaking this rule.

---

## Core Patterns

| Pattern | Example |
|---------|---------|
| Private functions | `_functionName()` |
| State read/write | `_data()` / `_save(d)` inside every module |
| DOM helper | `el(id)` → `document.getElementById(id)` |
| Toast | `App.Shell.toast(msg, 'success'|'error'|'info'|'warn')` |
| Confirm dialog | `App.Shell.confirmAction(title, body, icon, btnLabel, fn)` |
| Module shorthand | `P()` for Portfolio, `HD()` for Habits.Data |
| No cross-module calls | Modules never call each other — only `App.State` + `App.Shell` |

---

## Key Algorithms

- **FIFO lot matching** — BUY before SELL on same date, then chronological
- **XIRR** — Newton-Raphson, 7 seed points, 300 max iterations, returns `null` on no convergence
- **Habits streak** — walks back from today (or yesterday if not checked); each loop iteration = one confirmed day
- **Ember spaced repetition** — SM-2 variant; correct → ease factor up; wrong → reset to 1 day
- **Ember daily review** — date-seeded shuffle (same 5 highlights all day, different each day)

---

## What Is Not Built Yet

| Feature | Notes |
|---------|-------|
| Finance Calculator | Stub registered; SIP, compound interest, loan EMI planned |
| PDF highlight import | Ember supports Kindle only; PDF OCR planned |
| Benchmarking | Compare portfolio vs S&P 500, Nifty, etc. |
| Tax lot optimization | Suggest which lot to sell to minimize tax |
| Recurring transactions | Auto-log DCA schedules |
| Return Comparator | Placeholder pane exists; no logic yet |

---

## History

- **Monolith phase:** Single `BitXappMod.js` (~5,000 lines) + `BitXappMod.css` (~1,900 lines), storage key `portfolio_v3`
- **Modular refactor:** Split into core + per-module data/logic/UI files, storage key migrated to `super_app_v1`
- **Phase 2:** Added Ember module, CSS split, Gist cross-module sync, spaced repetition, daily email
- **Phase 3–6:** Core utilities (`constants`, `utils`, `formatters`, `pagination`, `filters`), 172-test Vitest suite, per-module Gist save/load buttons, Habits Gist file, books-tab Gist load fix
