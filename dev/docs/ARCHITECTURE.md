# BiT PleB Dashboard — Architecture Guide

**Last updated:** April 2026 | **Codebase:** ~14,000 LOC | **Grade: A**

---

## Overview

BiT PleB Dashboard is a fully client-side, single-page application. There is no build step, no server, no framework — just vanilla JS modules loaded in a specific order from `index.html`. All persistence is via `localStorage` (key `super_app_v1`), with optional cloud sync via GitHub Gist.

```
Browser
  └── index.html
        ├── css/                     Design tokens, reset, component styles
        └── js/
              ├── core/              Shared infrastructure (no business logic)
              │     ├── constants.js
              │     ├── utils.js
              │     ├── theme-tokens.js
              │     ├── formatters.js
              │     ├── pagination.js
              │     ├── filters.js
              │     ├── state.js      ← Single localStorage CRUD layer
              │     ├── gist.js       ← Pure GitHub Gist API wrapper
              │     └── app-shell.js  ← Module registry + routing + shell UI
              └── modules/
                    ├── habits/       habits-data · habits · habits-ui
                    ├── ember/        ember-data · ember-ui · ember
                    ├── portfolio/    portfolio-data · portfolio · portfolio-ui
                    └── settings/     settings
```

---

## Core Design Principles

### 1. Single Source of Truth — `App.State`

Every module reads and writes **only** through `js/core/state.js`. No module touches `localStorage` directly. The single storage key `super_app_v1` holds a namespaced object:

```json
{
  "portfolio": { "transactions": [], "priceCache": {}, "settings": {} },
  "habits":    { "habits": [], "logs": [] },
  "ember":     { "sources": [], "highlights": [], "settings": {}, "streak": {} },
  "gist":      { "token": "", "id": "", "lastSync": "" }
}
```

**Why:** Prevents key collisions as modules are added. One Gist save captures everything. No scattered `localStorage.getItem` calls in module code.

### 2. Zero Cross-Module Coupling

Each module is completely independent:

- `habits.js` never imports from `portfolio.js`
- `ember.js` never imports from `habits.js`
- All inter-module communication goes through `App.State` (data) or `App.Shell` (UI services)

**Why:** Adding or removing a module requires touching only `index.html`. No refactoring cascade.

### 3. Lazy Module Initialisation

`App.Shell` keeps a `Set` of initialised module IDs. The first time a user clicks a sidebar item, `mod.init()` is called once and the ID is added to `_initialised`. Subsequent visits skip init.

**Why:** `habits.js init()` seeds sample data. Calling it eagerly on page load before the user opens Habits would pollute `localStorage`.

### 4. Error Isolation

If a module's `init()` throws, the ID is **not** added to `_initialised`. The user can retry by navigating away and back. Other modules are unaffected.

---

## Script Load Order

Scripts must load in this exact order — each file depends on everything above it:

```
1. constants.js       — magic numbers, no deps
2. utils.js           — pure helpers, no deps
3. theme-tokens.js    — colour palettes, no deps
4. formatters.js      — date/number formatters, no deps
5. pagination.js      — list pagination, no deps
6. filters.js         — textSearch/dateRange/sortBy, no deps
7. state.js           — localStorage CRUD, no deps
8. gist.js            — GitHub API wrapper, no deps
9. app-shell.js       — module registry + shell UI, depends on state.js

10. habits-data.js    — seed data & data utilities for habits.js
11. habits.js         — business logic, calls App.Shell.registerModule()
12. habits-ui.js      — DOM rendering, called by habits.js

13. ember-data.js     — Kindle/book parsers for ember.js
14. ember-ui.js       — DOM rendering, called by ember.js
15. ember.js          — business logic, calls App.Shell.registerModule()

16. portfolio-data.js — CSV parser, called by portfolio.js
17. portfolio.js      — business logic (FIFO, XIRR, CAGR), registerModule()
18. portfolio-ui.js   — DOM rendering, called by portfolio.js

19. settings.js       — cross-module settings UI

20. <inline script>   — DOMContentLoaded → App.State.init() → App.Shell.init()
```

---

## Module Dependency Graph

```
App.Constants ──────────────────────────────────────┐
App.Utils ──────────────────────────────────────────┤
App.ThemeTokens ────────────────────────────────────┤
App.Formatters ─────────────────────────────────────┤  (no deps, loaded first)
App.Pagination ─────────────────────────────────────┤
App.Filters ────────────────────────────────────────┘
        │
        ▼
App.State ──────── localStorage (super_app_v1)
        │
        ├──── App.Gist ──── GitHub REST API
        │
        └──── App.Shell
                  │
          ┌───────┼───────┐
          ▼       ▼       ▼
      Habits   Ember  Portfolio
      (init)  (init)   (init)
          │       │       │
      HabitsUI EmberUI PortfolioUI
```

All modules call upward to `App.State` and `App.Shell` — never sideways to each other.

---

## Initialisation Flow

```
DOMContentLoaded
    │
    ├── App.State.init()
    │     └── _load() → localStorage.getItem('super_app_v1')
    │           ├── Parse + deep-merge with DEFAULT_STATE
    │           └── One-time migration: legacy gistToken/Id → gist namespace
    │
    └── App.Shell.init('portfolio')
          ├── _renderSidebar()   — builds nav from registered modules
          ├── _setupKeyboard()   — Alt+1..9 shortcuts
          ├── applyTheme()       — reads saved theme, sets data-theme attr
          └── switchModule('portfolio')
                └── portfolio.init()  ← first module lazy-init
                      ├── seedSampleData()
                      ├── applyTheme()
                      ├── syncSettingsUI()
                      ├── _syncCurrencyUI()   ← Phase 1 fix
                      ├── setupEventListeners()
                      ├── render()
                      ├── fetchFxLatest()     — non-blocking async
                      ├── fetchFX()           — non-blocking async
                      └── refreshPrices()     — non-blocking async
```

---

## State Lifecycle

```
Module action (e.g. addTransaction)
    │
    ├── App.State.getPortfolioData()    → returns _state.portfolio (mutable ref)
    ├── mutate the object
    └── App.State.setPortfolioData(obj)
              └── _state.portfolio = obj
              └── _save()  → localStorage.setItem('super_app_v1', JSON.stringify(_state))
```

State is **not** reactive — modules must call `render()` after mutations. There is no pub/sub or observer pattern by design (keeps the stack simple).

---

## Gist Sync Architecture

```
triggerGistSave()  (app-shell.js or portfolio.js)
    │
    ├── _gistSaveInProgress check   ← race-condition lock (Phase 1 fix)
    ├── check creds → toast if missing
    │
    └── _doGistSave(token, id)
          ├── portfolioPayload = { portfolio: App.State.getPortfolioData(), gist: creds }
          ├── emberPayload     = { highlights, settings, streak }
          ├── App.Gist.savePortfolioData(portfolioPayload, token, id) → POST/PATCH
          ├── App.Gist.saveEmberData(emberPayload, token, id)         → PATCH
          └── App.State.setGistCredentials({ lastSync: now })
```

**Three Gist files per Gist:**

| File | Contents |
|------|----------|
| `portfolio-data.json` | portfolio transactions, price cache, settings, gist credentials |
| `ember-highlights.json` | highlights, sources, spaced-repetition settings, streak |
| `habits-data.json` | habit definitions and completion log entries |

**Credential scrubbing:** `_scrubToken()` strips any `ghp_` GitHub PAT from the payload before writing. GitHub auto-revokes tokens it detects in Gist content.

---

## Sign-In Flow

The credentials popup (`#cred-ov`) is shown on first load when no token+Gist ID are stored.

```
User opens app (no credentials in localStorage)
  └── portfolio.js initLockScreen() → openCredentialsPopup()

Option A — Sign In:
  User enters token + Gist ID → clicks "Sign In"
  └── saveCredentials()
        ├── validation (both fields required)
        ├── App.State.setGistCredentials({ token, id })
        ├── close popup
        └── App.Shell.triggerGistLoadSilent()   ← loads all 3 Gist files silently
              ├── loadPortfolioData()
              ├── loadEmberData()      (null = skip, first save)
              ├── loadHabitsData()     (null = skip, first save)
              ├── mergeAll() + setEmberData() + setHabitsData()
              └── re-render active module + toast "Signed in ✓"

Option B — Demo:
  User clicks "Demo"
  └── enterDemoMode()
        ├── clearGistCredentials()
        ├── _clearToSampleData()        ← portfolio seed data
        ├── App.State.setHabitsData(buildSeedData())  ← habits mock data
        ├── App.State.setEmberData({ sources:[], highlights:[] })  ← empty (no mock)
        └── close popup + toast "Demo mode"
```

**Security:** GitHub token and Gist ID are never hardcoded in source. They are entered at runtime, stored only in `localStorage → super_app_v1 → gist`, and scrubbed from Gist content before every write.

---

## Email Automation

Ember daily-highlights email is sent **exclusively** via GitHub Actions cron — not from the browser.

```
.github/workflows/ember-email.yml
  schedule: '0 6 * * *'  (06:00 UTC = 08:00 Germany summer / CEST)
  │
  └── Python script
        ├── Fetch ember-highlights.json from Gist (uses EMBER_GIST_TOKEN secret)
        ├── Check emailEnabled + frequency (daily/weekdays/weekly)
        ├── Run same LCG shuffle + day-window as browser ember.js
        └── POST to EmailJS REST API (uses EMAILJS_* secrets)
```

**Why not the browser:** `checkAndSendEmail()` was previously called from `ember.js init()` on every first Ember tab click. Opening the app on two different browsers/sessions in the same day would bypass the `lastEmailSentDate` guard and send duplicate emails. The GitHub Actions cron runs exactly once per day regardless of whether the app is open.

**Required GitHub Secrets:** `EMBER_GIST_TOKEN`, `EMBER_GIST_ID`, `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`.

---

## CSS Architecture

| File | Scope |
|------|-------|
| `css/bitxapp-base.css` | **Single source of truth for all design tokens** (`--bg`, `--blue`, spacing, radius, fonts, etc.), dark/light theme overrides, CSS reset, keyframe animations, global accessibility styles |
| `css/main.css` | App shell layout: sidebar, panes, header, scrollbars, shared utility classes. No design tokens — all `var(--)` values come from `bitxapp-base.css`. |
| `css/components.css` | Reusable UI overlays: modal, drawer, confirm dialog, toast, form inputs, CSV wizard, credentials popup |
| `css/modules/portfolio.css` | KPI cards, overview charts, positions grid, history table, lot details, analytics |
| `css/modules/habits.css` | Habit cards, heatmap, check-in button, add form, streak display |
| `css/modules/ember.css` | Book spine shelf, highlight cards, review interface, spaced-repetition UI |

**Theme system:** All colours are CSS custom properties in `:root` (dark, default). The `[data-theme="light"]` block overrides only the tokens that differ. No hardcoded colours in component CSS.

---

## Adding a New Module

1. Create `js/modules/mymodule/mymodule.js`
2. At the bottom, call:
   ```javascript
   window.App.Shell?.registerModule({
     id: 'mymodule',
     label: 'My Module',
     icon: '<svg>…</svg>',
     init: init,
   });
   ```
3. Add a state namespace to `js/core/state.js` (`DEFAULT_STATE.mymodule`, getter/setter)
4. Add a pane `<div id="mod-mymodule" class="module-pane">` in `index.html`
5. Add `<script src="js/modules/mymodule/mymodule.js">` in `index.html` before `settings.js`

That's it. The shell auto-generates the sidebar button. No other files need to change.

---

## Key Algorithms

### FIFO Lot Matching (portfolio.js)

Transactions are sorted by date ascending, with BUY before SELL on the same date:

```javascript
.sort((a, b) => {
  const d = a.date.localeCompare(b.date);
  if (d !== 0) return d;
  return (a.type === 'BUY' ? 0 : 1) - (b.type === 'BUY' ? 0 : 1);
});
```

This ensures same-day BUY/SELL pairs are matched correctly (buy first, then sell from the new lot).

### XIRR (portfolio.js — `calcXIRR`)

Newton-Raphson solver with 7 seed points `[0.1, 0.0, -0.05, 0.5, 1.0, -0.3, 2.0]` to escape local minima. Returns `null` if no real root found after `MAX_ITER = 300` iterations. All callers handle `null` gracefully via `fmtXIRR()`.

### Habits Streak (habits.js — `getStreakInfo`)

```javascript
let dayOffset = checkedToday ? 0 : 1;
while (dayOffset < 365 && checked.has(_daysAgo(dayOffset))) {
  current++;
  dayOffset++;
}
```

Walks back from today (if checked today) or yesterday (grace period). Each while-iteration = exactly one confirmed day. No off-by-one risk.

### Spaced Repetition (ember.js)

SM-2 variant: intervals grow as `interval × easeFactor`. Correct answer increases `easeFactor`, wrong answer resets interval to 1 day. Review queue sorts by `srData.nextReview` ascending.

---

## Data Migration

The state shape evolves over time. Two mechanisms handle backward compatibility:

**1. Deep-merge with DEFAULT_STATE on load:**
New keys added to `DEFAULT_STATE` automatically appear for existing users — their saved data is merged on top.

**2. One-time migration block in `_load()`:**
```javascript
// Legacy gistToken/Id → canonical gist namespace
if (!merged.gist.token && merged.portfolio?.settings?.gistToken) {
  merged.gist.token = merged.portfolio.settings.gistToken;
}
```

Add new migration blocks here for future breaking changes.

---

## Browser Support

| Feature | Min version |
|---------|-------------|
| `async/await` | Chrome 55, Firefox 52, Safari 10.1 |
| CSS Custom Properties | Chrome 49, Firefox 31, Safari 9.1 |
| `Intl.NumberFormat` | Chrome 24, Firefox 29, Safari 10 |
| CSS Grid | Chrome 57, Firefox 52, Safari 10.1 |

**Not supported:** Internet Explorer (CSS variables not available).

**Tested on:** Chrome 90+, Firefox 88+, Safari 14+, Edge 90+.
