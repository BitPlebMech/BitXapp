# Code Review Report — BiT PleB Dashboard
**Reviewed:** 2026-05-02  
**Reviewer:** Senior Engineer (Claude)  
**Scope:** Full codebase — `js/core/` + all modules + `index.html` script load order  
**Baseline docs read:** `MODULE_RULES.md`, `ARCHITECTURE.md`

---

## 1. 🐛 Critical Issues (must fix before next release)

---

### CRIT-01 · Duplicate Gist save paths — race-condition lock only on Shell path

**File:** `portfolio.js` → `triggerGistSave()` / `_performGistSave()`  
**Severity:** Data-loss risk

`App.Shell.triggerGistSave()` has a `_gistSaveInProgress` lock that prevents concurrent saves. `portfolio.js` has its **own** `triggerGistSave()` / `_performGistSave()` which has **no equivalent lock**. If the portfolio header "Save to Gist" button is wired to the portfolio version rather than the Shell version, two concurrent saves can fire simultaneously, producing duplicate Gist PATCH requests and potentially corrupting `portfolio-data.json`.

Additionally, `portfolio.triggerGistSave()` only saves `portfolio-data.json` — it skips `ember-highlights.json` and `habits-data.json`. A user who clicks the portfolio save button will silently leave Ember and Habits data behind, creating a Gist that is out of sync.

**Evidence:** The MODULE_RULES (Rule 7) says *"wire header Gist Save to `App.Shell.triggerGistSave()`, not module save."* The portfolio module still exposes its own `triggerGistSave` in its return object and the save path inside it has no lock.

**Fix:** Remove `triggerGistSave` and `_performGistSave` from `portfolio.js` exports (keep as dead-code comment or delete entirely). Wire every "Save to Gist" button — including the portfolio header button — to `App.Shell.triggerGistSave()`.

---

### CRIT-02 · `_gistLoad()` in portfolio.js loads only 2 of 3 Gist files

**File:** `portfolio.js` → `_gistLoad()` (private, line ~1142)  
**Severity:** Silent data loss

`_gistLoad()` was made private (renamed with `_` prefix) but its body still runs `loadPortfolioData` + `loadEmberData` in parallel and **never calls `loadHabitsData`**. Any future code path that reaches `_gistLoad()` would silently discard all habits data. The function is 80+ lines of dead code that diverges from `App.Shell.triggerGistLoad()` and will cause confusion if someone re-exposes it.

**Fix:** Delete `_gistLoad()` entirely from `portfolio.js`. The comment above it is sufficient documentation. Shell is the single canonical loader.

---

### CRIT-03 · XSS risk — `ticker` injected directly into `innerHTML`

**File:** `portfolio-ui.js`, line ~950  
**Severity:** XSS / data integrity

```js
el('drw-ticker').innerHTML = `${ticker} ${P().clsBadgeHtml(pos.cls)}`;
```

`ticker` comes from `state.transactions[].ticker` which is written by the user via `addTransaction()` → `renameTicker()`. `renameTicker()` uses a browser `prompt()` and uppercases the input but does **not** HTML-escape it. A ticker like `<img src=x onerror=alert(1)>` would execute arbitrary JS.

Similarly in `portfolio.js → updateStorageStatus()`:
```js
const txt = `<strong>${posCount} positions</strong> · ... · <strong>${info.display}</strong> in localStorage`;
```
`info.display` comes from `storageInfo()` which formats numbers only, so it is safe — but the pattern is fragile. The root cause is `ticker` going unescaped into `innerHTML`.

**Fix:** Add a shared `_esc(str)` HTML-escape helper in `utils.js` (one already exists in `ember-ui.js` — promote it to core). Wrap all user-supplied string interpolations in `innerHTML` templates through `_esc()`.

---

### CRIT-04 · `selectDemoMode()` sets demo portfolio data with `setPortfolioData()` — overwrites entire namespace including `priceCache`

**File:** `app-shell.js` → `selectDemoMode()`  
**Severity:** State corruption in demo mode

```js
if (portfolioRes.ok) {
  portfolioData = await portfolioRes.json();
  window.App.State.setPortfolioData(portfolioData);
}
```

`portfolio-demo.json` is expected to be the full portfolio namespace including `priceCache`, `fxDaily`, `settings`, etc. If the demo JSON file only contains `transactions` (a common authoring mistake), `setPortfolioData()` replaces the entire namespace with a partial object, wiping `priceCache` and breaking FX history. There is no shape validation before the call.

**Fix:** Validate that `portfolioData` has at least a `transactions` array before writing. Use `mergeAll()` or a deep-merge into `getPortfolioData()` rather than a wholesale replace, so missing fields get their defaults.

---

### CRIT-05 · Alpha Vantage `sleep(13000)` blocks the entire UI thread via `refreshPrices()`

**File:** `portfolio.js` → `refreshPrices()`  
**Severity:** UI freeze / severe UX regression

```js
if (price) { src = 'av'; if (i < stockTickers.length - 1) await sleep(13000); }
```

With Alpha Vantage enabled and e.g. 5 stock tickers, this loop sleeps for up to 52 seconds (4 × 13 s). While `refreshPrices` is async, it holds the `refreshBtn` in a `spin-me` state and the header status in `'Fetching …'` for the entire duration. No cancellation mechanism exists. If the user navigates away and back, a second `refreshPrices()` call can start while the first is still sleeping, causing duplicate cache writes.

The 13-second delay exists because Alpha Vantage free tier allows ~5 req/min. But this rate limit only applies when AV is the source. The delay fires even when AV returns a price for the first ticker and Yahoo is used for the rest.

**Fix:** Move AV throttle outside the per-ticker loop. Track AV call count separately and only sleep before the *next AV call*, not after every successful AV hit. Add a cancellation token or `_refreshInProgress` flag mirroring the Gist save lock.

---

## 2. ⚠️ Warnings (fix soon — ticket if not this sprint)

---

### WARN-01 · `portfolio.js` has a `triggerGistSave` still in its `return {}` exports

Even though MODULE_RULES §7 says not to use it, it is exported and therefore callable by any external code. If settings or ember-ui ever call `App.Portfolio.triggerGistSave()`, they get a module-only save with no lock — a silent regression. Remove from exports.

---

### WARN-02 · `Habits.triggerGistLoad()` and `Ember.triggerGistLoad()` each make a separate full Gist HTTP fetch

**Files:** `habits.js` ~line 263, `ember.js` ~line 1025  
When a user clicks "Load from Gist" inside the Habits or Ember header, the module calls `App.Gist.loadHabitsData()` / `App.Gist.loadEmberData()` directly — each makes its own `GET /gists/:id` HTTP call. This duplicates network traffic. `App.Gist.loadAllFiles()` already exists to do a single fetch and extract all files. The module-level load buttons should use it or delegate to `App.Shell.triggerGistLoad()` to stay consistent and rate-limit-safe.

---

### WARN-03 · `_gistLoad()` in portfolio.js is dead code that still references `App.State.setEmberData?.()` — cross-namespace write from portfolio module

**File:** `portfolio.js` → `_gistLoad()` (private)  
Even as dead code, this function calls `window.App.State.setEmberData?.()` from inside the portfolio module — a Rule 1 violation. If it were re-enabled it would break module isolation. Safest fix is deletion (see CRIT-02).

---

### WARN-04 · Theme migration logic in `state.js._load()` is one-directional and fragile

**File:** `state.js` → `_load()`

```js
if (merged.app?.theme === 'dark' && merged.portfolio?.settings?.theme === 'light') {
  merged.app.theme = 'light';
}
```

This only migrates `light` → `dark` direction. A user who changed from dark to something else before the migration runs will not have their preference carried over. Once `app.theme` is anything other than the string `'dark'` the condition is false and the migration silently stops applying. The migration also runs on every load (not once), wasting cycles.

**Fix:** Add a `_migrationApplied` flag or a `version` field to state. Run the migration block only when `app.theme` is absent or `null` (truly unset), not when it equals `'dark'` (which is a valid user choice).

---

### WARN-05 · `renameTicker()` uses `prompt()` — synchronous, blocks JS, unstyled

**File:** `portfolio.js` → `renameTicker()`

```js
const newRaw = prompt(`Rename ticker "${oldTicker}" to:`, oldTicker);
```

Native `prompt()` is synchronous, blocks the event loop, cannot be styled, and is blocked in some embedded webviews. It is the only remaining `prompt()` call in the codebase. It also puts `oldTicker` into the prompt string without HTML-escaping — if `oldTicker` contains `"` the string breaks out of the template (minor, but worth noting for consistency).

**Fix:** Replace with a custom modal (reuse the existing confirm dialog pattern or add a small text-input overlay).

---

### WARN-06 · `computePositions()` re-runs full FIFO + XIRR on every `render()` call

**File:** `portfolio.js` → `computePositions()`

`computePositions()` is O(n × m) where n = transactions and m = lots. XIRR (Newton-Raphson, up to 300 iterations × 7 seeds) runs for every position on every render. `render()` is called after every CRUD op, price refresh, FX update, and drawer open. With 50 transactions across 10 tickers this is already ~700 Newton-Raphson iterations per render cycle.

**Fix:** Memoize `computePositions()` with a cache key based on `(transactions.length + transactions map of id+price)` or a simple transaction-array hash. Invalidate on CRUD or price changes. This is the biggest performance win available.

---

### WARN-07 · `factoryReset()` in settings.js does not re-render Ember or Habits after reset

**File:** `settings.js` → `factoryReset()`

```js
window.App.State.resetAll();
window.App.Shell.runAction('portfolio:render');
syncUI();
```

After `resetAll()` the Portfolio is re-rendered, but if the user was on the Ember or Habits tab those modules still show stale data. `App.Ember?.render()` and `App.Habits?.render()` are not called.

**Fix:** Add `window.App.Shell.runAction('ember:render')` and `window.App.Shell.runAction('habits:render')` after `portfolio:render`, guarded against the module not being loaded.

---

### WARN-08 · `selectUserMode()` fire-and-forget — errors only shown via toast, credential callback called regardless

**File:** `app-shell.js` → `selectUserMode()`

```js
triggerGistLoadSilent().then(() => {
  toast('User mode — data loaded from Gist', 'info');
  if (_credCallback) { _credCallback(); _credCallback = null; }
}).catch(e => {
  toast('Sign-in failed: ' + e.message, 'error');
});
```

If `triggerGistLoadSilent()` fails, the `.catch` shows a toast but the code falls through without calling `_credCallback`. The credentials overlay will remain open, which is correct — but the user has no clear recovery path from inside the overlay (there is no "retry" button). Separately, `_credCallback` is invoked on success but the success path also calls a second `toast('User mode…')` after `triggerGistLoadSilent` already toasted `"Signed in ✓ — …"` — the user sees two success toasts.

**Fix:** Remove the redundant `toast('User mode — data loaded from Gist')` since `triggerGistLoadSilent` already toasts. Add a retry affordance or at minimum close-and-reopen the credentials overlay on failure.

---

### WARN-09 · `ember.js → checkAndSendEmail()` is still exported and callable from the browser

**File:** `ember.js` exports  
**ARCHITECTURE.md** documents that email sending was moved **exclusively** to GitHub Actions cron to prevent duplicate sends. However `checkAndSendEmail()` is still exported in ember's return object and is potentially callable from ember-ui event handlers. If any UI path accidentally triggers it, the duplicate-send guard (`lastEmailSentDate`) is the only protection — and that guard can be bypassed if the date comparison has clock skew between tabs.

**Fix:** Remove `checkAndSendEmail` from ember's exports. Mark it `_checkAndSendEmail` (private) or delete it entirely. The GH Actions workflow is the only legitimate caller.

---

### WARN-10 · No event listener cleanup in any module — potential memory leak on repeated init

**Files:** `habits-ui.js`, `ember-ui.js`, `portfolio-ui.js`  
All modules call `setupEventListeners()` in `init()`. Shell's lazy-init pattern calls `init()` once per session, so this is safe today. However, if `_initialised.delete(modId)` + `switchModule()` is used (as done in `_restoreFromGist()`), `init()` can be called a second time, doubling up all event listeners. Portfolio and Habits both do `_initialised.delete(activeId); switchModule(activeId)` in the restore path.

**Fix:** Guard `setupEventListeners()` with a `_listenersAttached` flag per module, or use event delegation on stable parent elements rather than attaching to individual buttons.

---

## 3. ✅ Improvements (nice-to-have / quality of life)

---

### IMPR-01 · Extract `_esc()` HTML-escape helper to `utils.js`

`ember-ui.js` already has a well-written `_esc()`. `portfolio-ui.js` has none. Move it to `js/core/utils.js` as `App.Utils.esc()` and use it everywhere `innerHTML` receives user data. This makes XSS prevention systematic rather than per-file.

---

### IMPR-02 · `gist.js` — deprecated `save()` and `load()` functions should be deleted, not kept as dead code

The comment says they are kept for "git blame" purposes. That is git's job, not the source file's. These ~60 lines increase cognitive load for every reader. Delete them; `git log -S 'save(payload'` recovers the history.

---

### IMPR-03 · `storageInfo()` in `state.js` uses `Blob` for byte counting — correct, but called on every `init()` log

`storageInfo()` allocates a `Blob` on every call. It is called during `init()`, `updateStorageStatus()` (every render in Portfolio), and on every Settings tab visit. Consider caching the result with a dirty flag that clears on `_save()`.

---

### IMPR-04 · `state.js` — `getPortfolioData()` returns a live mutable reference; `getGistCredentials()` returns a shallow copy — the inconsistency is a bug waiting to happen

The jsdoc comment acknowledges this for portfolio. A future developer will write `const creds = App.State.getGistCredentials(); creds.token = '...'` expecting it to persist (it won't, because it is a copy). Either always return copies (safe, slight overhead) or always return live refs and document clearly. Pick one pattern and apply it uniformly.

---

### IMPR-05 · `computeSummary()` iterates `_state().transactions` a second time for fees/taxes after already iterating positions — DRY opportunity

`computeSummary()` has two loops: one over `positions` and one over `_state().transactions`. Both cover essentially the same data. Merge into one pass.

---

### IMPR-06 · `fetchFX()` bulk request has no TTL guard — fires on every Portfolio init if it was loaded < 1 day ago

The `fxLastFetch` field is stored in state but `fetchFX()` does not check it before making the multi-megabyte historical rates request. A user who refreshes the page gets a new bulk FX fetch every time Portfolio initialises, even if the data is only minutes old.

**Suggested guard:**
```js
const ONE_DAY = 86400000;
if (s.fxLastFetch && Date.now() - s.fxLastFetch < ONE_DAY) return true;
```

---

### IMPR-07 · `app-shell.js → _restoreFromGist()` force-reinits the active module by deleting from `_initialised` — can re-trigger `seedSampleData()`

```js
_initialised.delete(activeId);
switchModule(activeId);
```

If the user is on Portfolio and does a Gist load, this path re-calls `portfolio.init()`. `portfolio.init()` calls `seedSampleData()` which is guarded by `if (s.transactions.length === 0) return` — but only *after* `mergeAll()` already wrote the Gist data. So the guard should hold. However if the Gist portfolio is empty (new user, first save), `seedSampleData()` fires and overwrites the freshly loaded (empty) state with demo data — the exact opposite of what the user expected.

**Fix:** Either don't call `switchModule` for re-init (call `render()` directly via action registry), or check `transactions.length > 0` *before* seeding in the Gist-load path.

---

### IMPR-08 · `settings.js → _observeActivation()` uses MutationObserver but never disconnects it

The observer fires forever for the lifetime of the page. This is harmless in a SPA that never unmounts, but if settings is ever destroyed and re-mounted the observer will leak. Best practice: store the observer and disconnect in a cleanup function.

---

### IMPR-09 · `ember.js → importParsed()` deduplication is by `hash` field — no fallback if hash is absent

```js
const existingHashes = new Set(allHighlights.map(h => h.hash).filter(Boolean));
```

If a highlight has no `hash` (e.g., manually added via `addQuote()` or imported from a 3rd-party CSV that doesn't generate hashes), dedup is skipped and duplicates can accumulate silently.

---

### IMPR-10 · Script load order in `index.html` has `ember-ui.js` loading before `ember.js`

Per ARCHITECTURE.md the documented order for ember is `ember-data.js → ember-ui.js → ember.js`. The actual `index.html` matches this. However MODULE_RULES §5 says the correct order is `data → logic → UI`. For ember the logic file is `ember.js` — which means UI is loading before logic, *which is inverted from every other module*. Habits and Portfolio both correctly load UI last. This works today because `ember-ui.js` only calls `window.App.Ember.*` at event-handler time (not at load time), but it is a deviation from the stated rule and is a future footgun.

---

## 4. 📊 Summary

| Dimension | Score | Notes |
|-----------|-------|-------|
| Module isolation | 8/10 | Excellent overall; portfolio's own gist save + _gistLoad() are the outliers |
| State management | 9/10 | Clean and consistent; live-ref vs copy inconsistency is the only gap |
| Gist sync safety | 7/10 | Lock exists on Shell path only; duplicate save paths; module loads make N HTTP calls |
| Performance | 6/10 | XIRR+FIFO on every render; no FX TTL guard; 13s AV sleep blocks; no memoization |
| Security | 7/10 | Token scrubbing works; `_esc()` missing from portfolio; `prompt()` with unescaped input |
| Architecture | 9/10 | Excellent layer discipline; action registry well used; dead code (_gistLoad) is the main smell |
| Error handling | 8/10 | Good try/catch coverage; missing: AV refresh cancellation, factoryReset partial re-render |
| Scalability | 6/10 | No memoization on hot path; full recompute on every render; FX bulk fetch on every init |
| Code quality | 8/10 | Clean, well-commented; DRY violations in computeSummary + duplicate save paths |
| Test/Maintainability | 7/10 | Functions are testable; event listeners not cleaned up; observer not disconnected |

**Overall Quality Score: 7.5 / 10**  
**Production Ready:** Yes — for personal use. No for multi-user or high-reliability deployment.  
**Effort to fix all Criticals:** ~1 day (mostly deletion + wiring changes, not rewrites)

---

## 5. 🚀 Scaling Notes

| Concern | Current limit | Breaks at | Fix |
|---------|---------------|-----------|-----|
| `computePositions()` FIFO+XIRR per render | Fast at 50 txs | ~500 txs visible lag | Memoize with tx-hash cache key |
| `computeSummary()` double-pass over transactions | Fast at 100 txs | ~2k txs | Single-pass merge |
| Ember review queue SM-2 sort on every `getReviewQueue()` | Fast at 500 highlights | ~10k highlights | Binary-search insert on add |
| Habits heatmap 28-day scan per habit per render | Fast at 20 habits | ~500 habits | Memoize per-habit log Set |
| FX historical data in localStorage | ~200 KB at 4yr of daily data | ~1.5 MB at 15yr | TTL-prune old entries; compress with delta encoding |
| Gist load — 3 modules × separate HTTP requests | 3 req (now 1 with loadAllFiles) | Rate limit at 60 req/hr | Already fixed for full load; module-specific loads still make separate calls |

---

## 6. 📋 Fix Plan (Prioritised)

### Phase 1 — Critical fixes (1 day, low risk)

| ID | File | Action | Risk |
|----|------|---------|------|
| FIX-01 | `portfolio.js` | Remove `triggerGistSave`, `_performGistSave`, `_gistLoad` entirely. Update return `{}`. | Low — these are already unused on the main path |
| FIX-02 | `portfolio.js` exports | Remove `triggerGistSave` from the return object | Low |
| FIX-03 | `portfolio-ui.js` line ~950 | Wrap `ticker` in `_esc()` before injecting into `innerHTML` | Low |
| FIX-04 | `utils.js` | Add `esc(str)` HTML-escape helper (promote from ember-ui.js) | Low |
| FIX-05 | `app-shell.js → selectDemoMode()` | Validate `portfolioData.transactions` array before `setPortfolioData()`; use merge instead of wholesale replace | Low |
| FIX-06 | `portfolio.js → refreshPrices()` | Add `_refreshInProgress` lock flag; fix AV sleep to only delay before AV calls, not after every hit | Medium |

### Phase 2 — Warnings (2–3 days, moderate effort)

| ID | File | Action | Risk |
|----|------|---------|------|
| FIX-07 | `habits.js`, `ember.js` | Replace module-level `triggerGistLoad()` with delegation to `App.Shell.triggerGistLoad()` or use `loadAllFiles()` | Low |
| FIX-08 | `state.js → _load()` | Fix theme migration to check `app.theme === null/undefined` not `=== 'dark'` | Low |
| FIX-09 | `settings.js → factoryReset()` | Add `runAction('ember:render')` and `runAction('habits:render')` after reset | Low |
| FIX-10 | `ember.js` | Remove `checkAndSendEmail` from exports; rename `_checkAndSendEmail` | Low |
| FIX-11 | `portfolio.js → renameTicker()` | Replace `prompt()` with a proper inline modal | Medium |
| FIX-12 | `app-shell.js → selectUserMode()` | Remove duplicate success toast | Low |
| FIX-13 | `habits-ui.js`, `ember-ui.js`, `portfolio-ui.js` | Add `_listenersAttached` guard in `setupEventListeners()` | Low |

### Phase 3 — Improvements (nice-to-have, 3–5 days)

| ID | File | Action |
|----|------|--------|
| FIX-14 | `portfolio.js → computePositions()` | Memoize with dirty flag; invalidate on CRUD / price change |
| FIX-15 | `portfolio.js → fetchFX()` | Add `fxLastFetch` TTL guard (skip if < 24h old) |
| FIX-16 | `gist.js` | Delete deprecated `save()` and `load()` dead code |
| FIX-17 | `portfolio.js → computeSummary()` | Merge double-pass into single pass |
| FIX-18 | `app-shell.js → _restoreFromGist()` | Use `runAction('portfolio:render')` instead of `_initialised.delete + switchModule` |
| FIX-19 | `settings.js → _observeActivation()` | Store and expose observer.disconnect() for cleanup |
| FIX-20 | `index.html` script order | Move `ember-ui.js` after `ember.js` to match all other modules (data → logic → UI) |

---

## 7. Known Past Bugs — Regression Check

| Past Bug | Still present? | Notes |
|----------|---------------|-------|
| Ember books tab empty after Gist load | ✅ Fixed | `_restoreFromGist()` restores `sources` correctly; legacy recovery logic is in place |
| Habits data saved in portfolio-data.json | ✅ Fixed | `saveHabitsData()` used throughout |
| Ember data not loaded on sign-in | ✅ Fixed | `loadAllFiles()` fetches all 3 in one call |
| Gist save race condition | ⚠️ Partial | Fixed on Shell path; portfolio's own save path has no lock (CRIT-01) |
| Currency UI not reflecting saved setting | ✅ Fixed | `_syncCurrencyUI()` called in `init()` |
| Streak off-by-one | ✅ Fixed | `dayOffset = checkedToday ? 0 : 1` verified correct |
| Undefined render after async load | ✅ Fixed | `render()` called after all state mutations |
| GitHub token exposed in localStorage | ✅ Fixed | Token scrubbed before every Gist write; `_scrubToken()` verified |
