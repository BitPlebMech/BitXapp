# BiT PleB Dashboard — Changelog

All significant changes are recorded here. Most recent first.
Format follows `docs/DOC_SYNC.md` conventions.

---

## 2026-05-02 — Code Review Phase 1–3 + Doc Sync

### Fixed (Phase 1 — Critical)
- Removed duplicate Gist save path from `portfolio.js` (`triggerGistSave`, `_performGistSave`, `_gistLoad`, `_gistCreds` deleted — ~130 lines). Shell is now the single canonical save path with its race-condition lock
- XSS: wrapped all user-supplied strings in `_esc()` before `innerHTML` injection in `portfolio-ui.js` and `ember-ui.js`; promoted `escHtml()` to `utils.js` as `App.Utils.escHtml()`
- `selectDemoMode()` in `app-shell.js` now validates `transactions` array before writing and uses spread-merge instead of wholesale `setPortfolioData()` — prevents partial demo JSON from wiping `priceCache`
- `refreshPrices()` in `portfolio.js` now has a `_refreshInProgress` lock flag (mirrors Gist save lock); Alpha Vantage 13s sleep now only fires before the next AV call, not after every ticker — eliminates unnecessary blocking when Yahoo fallback is used

### Fixed (Phase 2 — Warnings)
- Habits and Ember `triggerGistLoad()` now use `loadAllFiles()` (one HTTP call) instead of separate module-specific fetches — eliminates redundant round-trips
- Theme migration in `state.js._load()` now triggers only when `app` namespace is absent in saved data (`!saved.app`), not on every load for dark-theme users
- `factoryReset()` in `settings.js` now re-renders Ember and Habits after reset (were left stale)
- `checkAndSendEmail()` removed from `ember.js` exports — now private (`_checkAndSendEmail`); GH Actions cron is the only caller
- `renameTicker()` in `portfolio.js` replaces browser `prompt()` with `App.Shell.promptAction()` — new Shell method that reuses the confirm dialog with an injected text input
- Removed duplicate "User mode — data loaded from Gist" toast in `selectUserMode()`; `triggerGistLoadSilent()` already toasts "Signed in ✓ — …"
- Added `_listenersAttached` guard to `setupEventListeners()` / `init()` in all three UI modules (`habits-ui.js`, `ember-ui.js`, `portfolio-ui.js`) — prevents duplicate `document.addEventListener` accumulation on retry-init

### Changed (Phase 3 — Improvements)
- `computePositions()` in `portfolio.js` is now memoized with `_posCache` / `_posDirty` flag — `_save()` invalidates automatically; saves FIFO + XIRR recomputation on every `render()` when state is unchanged
- `fetchFX()` in `portfolio.js` now has a 24h TTL guard — skips the multi-MB Frankfurter bulk fetch if `fxLastFetch` is less than 1 day old; repopulates `fxLatest` from cached `fxDaily` on cache hit
- `computeSummary()` in `portfolio.js` merged from double-pass to single-pass — fees/taxes now accumulated from `pos.txs` instead of a second `_state().transactions` scan
- `_restoreFromGist()` in `app-shell.js` now uses `runAction('portfolio:render')` instead of `_initialised.delete(activeId) + switchModule(activeId)` — avoids re-triggering `init()` and `seedSampleData()` guard on empty-Gist load
- `MutationObserver` in `settings.js._observeActivation()` now stored in `_activationObserver`; `disconnectObserver()` exposed publicly for cleanup
- `ember-ui.js` script tag moved after `ember.js` in `index.html` — corrects load order to data → logic → UI, matching all other modules (was inverted)
- Deprecated `save()` and `load()` dead code deleted from `gist.js` (~65 lines); git history preserves the bodies

### Added
- `App.Shell.promptAction(title, icon, default, label, onConfirm)` — text-input variant of the confirm dialog; reuses `#confirm-dialog` DOM with injected `<input data-prompt>`; `confirmDo()` reads input value before closing
- `_activationObserver` module-level variable in `settings.js` + `disconnectObserver()` public method
- `docs/DOC_SYNC.md` — documentation orchestration file; defines doc map, trigger rules, and sync protocol for future sessions
- `CHANGELOG.md` — this file
- `docs/reference/CODE_REVIEW_REPORT.md` — full 9-section code review with regression check table (updated post-Phase 3)

### Removed
- `docs/PROJECT_DESCRIPTION_V2.md` — duplicate of `CONTEXT_BRIEF.md`; was an AI handoff prompt, not a real doc

---

## 2026-04 — Phase 7 (prior session, reconstructed from CONTEXT_BRIEF history)

### Changed
- Sign-in UX overhauled: Sign In + Demo mode buttons replace the old single flow
- Daily email moved exclusively to GitHub Actions cron (`.github/workflows/ember-email.yml`)
- `checkAndSendEmail()` removed from `ember.js init()` to prevent duplicate sends across browser sessions
- `triggerGistLoadSilent()` introduced for silent auto-load on sign-in (no confirm dialog)

---

## 2026-04 — Phase 3–6 (prior sessions, reconstructed)

### Added
- Core utilities extracted: `constants.js`, `utils.js`, `formatters.js`, `pagination.js`, `filters.js`
- 172-unit Vitest test suite (`tests/unit/`, `tests/integration/`)
- Per-module Gist save/load buttons in module headers
- `habits-data.json` as a dedicated Gist file for Habits
- Books-tab Gist load fix: `_restoreFromGist()` now restores `sources` alongside `highlights`

---

## 2026-04 — Phase 2 (prior sessions, reconstructed)

### Added
- Ember module: Kindle highlight import, searchable library, spaced repetition (SM-2), daily digest email
- CSS split: `bitxapp-base.css` (tokens) · `main.css` (shell) · `components.css` (overlays) · per-module CSS
- Gist cross-module sync: portfolio + ember saving to the same Gist under separate file names

---

## 2026-04 — Modular Refactor (prior session, reconstructed)

### Changed
- Monolith `BitXappMod.js` (~5,000 lines) split into `js/core/` + per-module `data · logic · ui` files
- Storage key migrated from `portfolio_v3` to `super_app_v1` with deep-merge migration
- `App.State`, `App.Shell`, `App.Gist` layer boundaries established
