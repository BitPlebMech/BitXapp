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
│       └── ember.css
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
| Text-input prompt | `App.Shell.promptAction(title, icon, default, btnLabel, fn)` — replaces `window.prompt()` |
| HTML-escape | `App.Utils.escHtml(str)` — always use before `innerHTML` interpolation |
| Module shorthand | `P()` for Portfolio, `HD()` for Habits.Data |
| No cross-module calls | Modules never call each other — only `App.State` + `App.Shell` |

---

## Sign-In Flow

On first open (no credentials in `localStorage`), the credentials popup is shown. Two paths:

- **Sign In** — enter token + Gist ID → `saveCredentials()` → `App.Shell.triggerGistLoadSilent()` loads all three Gist files (portfolio, ember, habits) silently, no confirm dialog
- **Demo** — `enterDemoMode()` → clears credentials → portfolio seed data + habits mock data loaded; Ember stays empty (no mock data exists)

## Email Automation

Daily Ember highlights email is sent **only** by GitHub Actions cron (`.github/workflows/ember-email.yml`, 06:00 UTC). The browser never sends email. `checkAndSendEmail()` has been removed from `ember.js init()` to prevent duplicates when the app is opened on multiple sessions.

---

## Key Algorithms

- **FIFO lot matching** — BUY before SELL on same date, then chronological
- **XIRR** — Newton-Raphson, 7 seed points, 300 max iterations, returns `null` on no convergence
- **Habits streak** — walks back from today (or yesterday if not checked); each loop iteration = one confirmed day
- **Ember spaced repetition** — SM-2 variant; correct → ease factor up; wrong → reset to 1 day
- **Ember daily review** — date-seeded LCG shuffle (same 10 highlights all day, different each day)

---

## What Is Not Built Yet

| Feature | Notes |
|---------|-------|
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
- **Phase 7:** Sign-in UX overhaul (Sign In + Demo buttons, silent auto-load), email exclusively via GitHub Actions cron (duplicate email fix)
- **Code Review Phase 1–3 (May 2026):** 20 fixes — XSS hardening (`escHtml`), duplicate Gist save path removed, `computePositions()` memoized, FX 24h TTL guard, `promptAction()` added to Shell, ember script load order corrected, `_listenersAttached` guards, single-pass `computeSummary()`, MutationObserver stored, doc sync protocol established
