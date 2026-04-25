# BiT PleB Dashboard — Code Review & Optimization Guide

**Date:** April 2026 | **Scope:** Full codebase | **Status:** Production-ready

> **How to use this file:** Hand it to Claude at the start of a code-review session.
> Say: *"Read docs/reference/CODE_REVIEW.md then review [file or feature]."*

---

## How to Request a Code Review

Paste this prompt to Claude:

> "I'm working on BiT PleB Dashboard — a zero-dependency vanilla JS + CSS browser app. No build step. Read `docs/MODULE_RULES.md` and `docs/ARCHITECTURE.md` first, then do a code review of [file or feature]. Focus on: correctness, module isolation, state management, Gist sync safety, and UI consistency."

For a specific file review, also provide the file. For a full-pass review, provide all changed files since the last review.

---

## Architecture Quick Reference

| Layer | Files | Responsibility |
|-------|-------|----------------|
| Core utilities | `js/core/constants.js`, `utils.js`, `formatters.js`, `pagination.js`, `filters.js` | Pure functions, no side effects |
| State | `js/core/state.js` | Only file allowed to touch localStorage |
| Gist | `js/core/gist.js` | Only file allowed to call GitHub API |
| Shell | `js/core/app-shell.js` | Module registry, sidebar, lazy-init |
| Module logic | `js/modules/*/[name].js` | Business logic, state I/O |
| Module UI | `js/modules/*/[name]-ui.js` | DOM rendering, event listeners |
| Module data | `js/modules/*/[name]-data.js` | Parsers, seed data, shapes |

---

## Review Checklist

### Module isolation
- [ ] Module never calls another module directly (no `App.Portfolio.x()` from Ember, etc.)
- [ ] Module reads/writes only its own state namespace
- [ ] Module never calls `localStorage` directly
- [ ] Inter-module communication only via `App.State` (data) or `App.Shell` (UI)

### State management
- [ ] New data fields added to `DEFAULT_STATE` in `state.js`
- [ ] New module has its own namespace (not piggy-backed onto `portfolio`)
- [ ] Getter/setter pair added to `state.js` for any new namespace
- [ ] State mutations always followed by a `render()` call

### Gist sync
- [ ] Module uses its own Gist file (not `portfolio-data.json`)
- [ ] `triggerGistLoad()` restores **all** fields of the namespace (not just some)
- [ ] GitHub token never written to any Gist payload
- [ ] Race-condition lock used for save operations

### UI consistency
- [ ] Toasts routed through `App.Shell.toast()` not `App.Portfolio.toast()`
- [ ] Confirm dialogs use `App.Shell.confirmAction()`
- [ ] Header buttons follow the `hdr-btn` / `hdr-btn primary` pattern
- [ ] New module has Gist Save + Gist Load buttons in its header
- [ ] New module has Export/Import JSON in Settings

### Script load order (index.html)
- [ ] New scripts added before `settings.js`
- [ ] Data file loads before logic file, logic file before UI file

---

## Known Past Bugs (do not re-introduce)

| Bug | Root cause | Fix |
|-----|-----------|-----|
| Ember books tab empty after Gist load | `sources` not restored, only `highlights` | Always restore all namespace fields |
| Habits data saved in portfolio-data.json | Used generic `App.Gist.save()` instead of `saveHabitsData()` | Each module uses its own Gist function |
| Ember data not loaded on sign-in | `gistLoad()` only fetched `portfolio-data.json` | Load all 3 files in parallel |
| Gist save race condition | No lock on concurrent saves | `_gistSaveInProgress` flag in app-shell.js |
| Currency UI not reflecting saved setting | `_syncCurrencyUI()` not called on init | Called in `portfolio.init()` |
| Streak off-by-one | Walker started from wrong day offset | `dayOffset = checkedToday ? 0 : 1` |

---

## Performance Notes

- **Price refresh:** 3-source fallback chain (Yahoo → CoinGecko → Alpha Vantage). Cache TTL in settings. Don't bypass cache unless explicitly refreshing.
- **XIRR:** Newton-Raphson with 7 seed points and 300 max iterations. Expensive — only call when transactions change, not on every render.
- **Heatmap:** 28-day window, computed fresh on each render. Acceptable for < 100 habits.
- **Ember review queue:** SM-2 sort on every `getReviewQueue()` call. Fine for < 5,000 highlights.

---

## Code Style Conventions

| Pattern | Example |
|---------|---------|
| Private functions | `_functionName()` |
| State accessor aliases | `_data()`, `_save()` |
| Module shorthand ref | `P()` for Portfolio, `HD()` for Habits.Data |
| DOM helper | `el(id)` → `document.getElementById(id)` |
| Toast | `_toast(msg, 'success'|'error'|'info'|'warn')` |
| Confirm | `App.Shell.confirmAction(title, body, icon, btnLabel, fn)` |
| Guard clauses | Early return on missing data, never deep nesting |
| No `var` | `const` everywhere, `let` only when reassignment needed |
