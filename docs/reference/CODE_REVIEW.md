
I have developed using vibe coding a BiT PleB Dashboard — a zero-dependency vanilla JS + CSS browser app. No build step. Read `docs/MODULE_RULES.md` and `docs/ARCHITECTURE.md` first, then do a code review of [file or feature]. Focus on: correctness, module isolation, state management, Gist sync safety, and UI consistency.

Keep in mind : 

This is the BiT PleB Dashboard. Before any code: (1) Read `docs/MODULE_RULES.md` and `docs/ARCHITECTURE.md`. (2) Check the script load order in `index.html`. (3) State changes must go through `App.State`. (4) UI services must go through `App.Shell`. (5) No cross-module imports.

You job is to review the code : 

Act as a senior software engineer performing a professional code review.

Analyze the following code thoroughly with a focus on correctness, maintainability, performance, scalability, and architecture.

Your review must include:

1. **Bug Detection**

   * Identify logical errors, edge cases, and potential runtime issues.
   * Highlight concurrency or async problems if any.
   * Check for null/undefined handling and type safety issues.
   * Look for off-by-one errors, boundary conditions.

2. **Code Quality Issues**

   * Unused variables, imports, or dead code
   * Duplicate logic or repeated functions/classes
   * Poor naming conventions
   * Violations of clean code principles (e.g., SRP, DRY)
   * Inconsistent formatting or style deviations

3. **Performance Analysis**

   * Inefficient algorithms or unnecessary operations
   * Expensive loops, repeated API/DB calls
   * DOM thrashing (batch DOM updates)
   * Memory leaks (event listeners not removed)
   * Suggestions for optimization

4. **Scalability Assessment**

   * Identify bottlenecks that would fail under high load
   * Evaluate modularity and coupling
   * Suggest improvements for scaling (caching, batching, async processing, etc.)
   * Plan for data growth (what breaks at 10k items vs 100k?)

5. **Architecture Review**

   * Assess separation of concerns
   * Suggest better patterns (e.g., service layer, repository pattern)
   * Recommend structural improvements for long-term growth
   * Check adherence to module isolation rules

6. **Security Review**

   * Input validation issues
   * Authentication/authorization risks
   * GitHub token exposure risks
   * XSS vulnerabilities in DOM updates
   * Data leakage in Gist payloads

7. **Error Handling & Logging**

   * Missing try-catch blocks
   * Unhandled promise rejections
   * Insufficient error context for debugging
   * Should errors be visible to users (toast) or silent (console)?

8. **Testing & Maintainability**

   * Functions hard to unit test (too many dependencies)?
   * Lack of defensive programming patterns
   * Missing edge case handling (empty arrays, null data, etc.)

9. **Refactoring Suggestions**

   * Provide improved versions of problematic code
   * Suggest simplifications and abstractions
   * Extract helper functions where appropriate

10. **Final Summary**

    * List top 5 critical issues
    * List top 5 "nice-to-have" improvements
    * Rate overall code quality (1–10)
    * Explain how ready this code is for scaling
    * Estimate effort to fix critical issues

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
- [ ] Module never calls GitHub API directly
- [ ] Inter-module communication only via `App.State` (data) or `App.Shell` (UI)
- [ ] No hardcoded references to other modules' DOM IDs

### State management
- [ ] New data fields added to `DEFAULT_STATE` in `state.js`
- [ ] New module has its own namespace (not piggy-backed onto `portfolio`)
- [ ] Getter/setter pair added to `state.js` for any new namespace
- [ ] State mutations always followed by a `render()` call
- [ ] No direct manipulation of state object (use getters/setters)
- [ ] Complex state queries delegated to accessor functions

### Gist sync
- [ ] Module uses its own Gist file (not `portfolio-data.json`)
- [ ] `triggerGistLoad()` restores **all** fields of the namespace (not just some)
- [ ] GitHub token never written to any Gist payload
- [ ] Race-condition lock used for save operations
- [ ] Error handling for network failures (GitHub API down, no internet)
- [ ] User feedback when sync fails (toast notification)
- [ ] Version checking to prevent overwriting newer data

### UI consistency
- [ ] Toasts routed through `App.Shell.toast()` not `App.Portfolio.toast()`
- [ ] Confirm dialogs use `App.Shell.confirmAction()`
- [ ] Header buttons follow the `hdr-btn` / `hdr-btn primary` pattern
- [ ] New module has Gist Save + Gist Load buttons in its header
- [ ] New module has Export/Import JSON in Settings
- [ ] Loading states during async operations
- [ ] Disabled buttons/inputs during processing

### Script load order (index.html)
- [ ] New scripts added before `settings.js`
- [ ] Data file loads before logic file, logic file before UI file
- [ ] No circular dependencies
- [ ] `app-shell.js` loads before all modules

### Error Handling
- [ ] Network errors caught with user-friendly messages
- [ ] GitHub API failures don't break the app
- [ ] Validation errors shown inline or via toast
- [ ] Console errors logged with context for debugging

### Memory & Performance
- [ ] Event listeners removed in cleanup/destroy functions
- [ ] No accidental global variables
- [ ] DOM updates batched (avoid layout thrashing)
- [ ] No infinite loops or uncanceled intervals

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
| Undefined render after async load | State updated but render() not called | Always call render() after state mutations |
| GitHub token exposed in localStorage | Token stored as plaintext | Never store token locally, use sessionStorage + expiry |

---

## Performance Notes

- **Price refresh:** 3-source fallback chain (Yahoo → CoinGecko → Alpha Vantage). Cache TTL in settings. Don't bypass cache unless explicitly refreshing.
- **XIRR:** Newton-Raphson with 7 seed points and 300 max iterations. Expensive — only call when transactions change, not on every render.
- **Heatmap:** 28-day window, computed fresh on each render. Acceptable for < 100 habits. Consider memoization if scaling beyond 500 habits.
- **Ember review queue:** SM-2 sort on every `getReviewQueue()` call. Fine for < 5,000 highlights. Optimize with binary search if > 10k.
- **DOM rendering:** Batch updates using `requestAnimationFrame()` for large lists (> 100 items).
- **Gist sync:** Parallel load (async.all) for multi-file reads. Sequential writes to prevent race conditions.

---

## Security Checklist

- [ ] All user inputs sanitized before DOM insertion
- [ ] GitHub token never logged, exposed, or sent to non-GitHub origins
- [ ] Gist payloads validated before parsing (no eval, safe JSON.parse)
- [ ] CORS properly handled (no credentials in cross-origin requests)
- [ ] localStorage and sessionStorage not used for sensitive data
- [ ] API responses validated (expect specific fields, types)
- [ ] No hardcoded secrets in source (use `.env` or env vars)
- [ ] Rate limiting respected for GitHub API (60 req/hr for unauthenticated)

---

## Code Style Conventions

| Pattern | Example |
|---------|---------|
| Private functions | `_functionName()` |
| State accessor aliases | `_data()`, `_save()` |
| Module shorthand ref | `P()` for Portfolio, `HD()` for Habits.Data |
| DOM helper | `el(id)` → `document.getElementById(id)` |
| Toast | `_toast(msg, 'success'\|'error'\|'info'\|'warn')` |
| Confirm | `App.Shell.confirmAction(title, body, icon, btnLabel, fn)` |
| Guard clauses | Early return on missing data, never deep nesting |
| No `var` | `const` everywhere, `let` only when reassignment needed |
| Constants | `CONST_NAME_ALL_CAPS` at top of file |
| Async/await | Prefer over `.then()` chains for readability |
| Comments | Comment *why*, not *what*. Code explains itself; comments explain intent. |
| Functions | Max 20-30 lines. Break complex logic into smaller functions. |

---

## Review Output Template

When providing your code review, structure it as follows:

```
## Code Review: [File Name]

### 🐛 Critical Issues (must fix before merge)
1. [Issue with impact and example]
2. [Issue with impact and example]

### ⚠️ Warnings (fix in this PR or ticket for later)
1. [Issue with suggestion]
2. [Issue with suggestion]

### ✅ Improvements (nice-to-have)
1. [Refactor suggestion with before/after]
2. [Pattern upgrade]

### 📊 Summary
- **Quality Score:** X/10
- **Ready for Production:** Yes/No
- **Effort to Fix:** Low/Medium/High
- **Key Concerns:** [brief summary]

### 🚀 Scaling Notes
- Current limits: [what breaks at scale]
- Recommended optimizations for growth: [recommendations]
```

---

## Quick Links

- Module Rules: `docs/MODULE_RULES.md`
- Architecture: `docs/ARCHITECTURE.md`
- Testing: `docs/TESTING.md`
- Troubleshooting: `docs/TROUBLESHOOTING.md`
- GitHub Gist API: https://docs.github.com/en/rest/gists
