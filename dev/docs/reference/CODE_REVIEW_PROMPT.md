# BiT PleB Dashboard — Code Review Prompt
> Paste this entire file to Claude at the start of a new session to request a full architectural audit.
> Say: "Read docs/reference/CODE_REVIEW_PROMPT.md and then do the audit described inside it."

---

## What This App Is

**BiT PleB Dashboard** — a zero-dependency, browser-only personal dashboard.
No build step, no framework, no backend. Pure HTML + CSS + vanilla JavaScript.
Data lives in `localStorage` (`super_app_v1`) and syncs to a private GitHub Gist.

**Current modules:** Portfolio · Ember (reading highlights) · Habits

**The app was built organically** — Portfolio came first, then other modules were added.
Because of this, there are known and unknown places where early Portfolio patterns leaked
into the architecture and now violate the rules that were written later.
The goal of this review is to find every such violation and fix it permanently,
so that adding a new module in the future requires touching the fewest files possible.

---

## The Five Golden Rules

These are the non-negotiable architectural rules. Every finding in this audit must be
judged against them.

**Rule 1 — State via App.State only**
`localStorage` is touched only by `js/core/state.js`. No module calls
`localStorage.getItem()` or `localStorage.setItem()` directly.
Every module reads and writes only its own namespace via `App.State.getXxxData()` / `setXxxData()`.

**Rule 2 — Gist files via App.Gist only, one file per module**
The GitHub API is called only by `js/core/gist.js`.
Each module has exactly one Gist file. Files are never mixed across modules.
`triggerGistLoad()` inside a module restores ALL fields of that module's namespace — never just some.

**Rule 3 — No cross-module calls**
Modules never call each other directly.
`App.Ember` never calls `App.Portfolio.x()`. `App.Habits` never calls `App.Ember.x()`.
Cross-module communication goes only through `App.State` (data) or `App.Shell` (UI services).
`settings.js` calling `App.Portfolio.toggleTheme()` is a violation — theme is a shell concern.

**Rule 4 — Shell owns all-module operations**
Anything that touches ALL modules at once (sign-in load, full Gist save, theme, toasts,
confirm dialogs) belongs to `App.Shell`, not to any module.
No module-private function should be called at sign-in or from the Settings page
if that function only handles one module's data.

**Rule 5 — New module = one registration, no cascade**
Adding a new module should require changes to only these places:
`state.js` (new namespace) · `gist.js` (new file save/load if needed) ·
`app-shell.js triggerGistLoad/Save` (add restore step) · `index.html` (new pane + script tag).
If adding a module requires editing `portfolio.js`, `settings.js`, or any other existing module,
that is an architecture violation.

---

## Known Violations Found During Previous Sessions

These have been partially fixed or are confirmed but not yet fixed. Include them in the audit.

### V1 — `ember.js` calls `localStorage` directly (Rule 1)
**File:** `js/modules/ember/ember.js` · function `checkAndSendEmail()`
```js
const lastSent = localStorage.getItem('ember_last_email_sent');   // ← violation
localStorage.setItem('ember_last_email_sent', today);             // ← violation
```
`ember_last_email_sent` is a per-module piece of state. It should live in
`App.State` under the `ember` namespace (e.g. `ember.lastEmailSentDate`),
not as a raw `localStorage` key outside `super_app_v1`.
**Fix:** Add `lastEmailSentDate` to `DEFAULT_STATE.ember` in `state.js`.
Replace both `localStorage` calls with `App.State.getEmberSettings()` / `App.State.setEmberSettings()`.

### V2 — `settings.js` reads `localStorage` directly for storage info (Rule 1)
**File:** `js/modules/settings/settings.js` · function `_updateStorageInfo()`
```js
const raw = localStorage.getItem('super_app_v1') || '';
```
This is read-only and harmless in practice, but it still violates Rule 1.
**Fix:** `App.State.storageInfo()` already exists and returns the same string. Use it.

### V3 — `settings.js` calls `App.Portfolio.toggleTheme()` directly (Rules 3 + 4)
**File:** `js/modules/settings/settings.js` · function `toggleTheme()`
```js
window.App.Portfolio?.toggleTheme();  // ← cross-module call
```
Theme is a shell/app-level concern, not a Portfolio concern. Theme also lives in
`portfolio.settings.theme` — a state namespace ownership violation (Rule 1) since
a module's settings namespace should not own app-wide state.
**Fix (two parts):**
1. Move theme storage to its own top-level key in `state.js` — either a dedicated
   `App.State.getAppSettings()` / `setAppSettings()` accessor, or add `theme` to
   the `gist` namespace or a new `app` namespace. Remove it from `portfolio.settings`.
2. Move `toggleTheme()` and `applyTheme()` entirely into `app-shell.js`.
   Expose `App.Shell.toggleTheme()`. Have `settings.js` call that instead.
   `portfolio.js` can keep a thin local `applyTheme()` that delegates to Shell.

### V4 — Portfolio header "Save" button saves ONLY portfolio, not all modules (Rule 4)
**File:** `js/modules/portfolio/portfolio-ui.js` line 1639
```js
el('h-gist-save')?.addEventListener('click', () => P().triggerGistSave(false));
```
`Portfolio.triggerGistSave()` saves only `portfolio-data.json`.
If the user clicks Save in Portfolio, their Ember and Habits data is NOT saved.
`App.Shell.triggerGistSave()` exists and saves all three files — but no UI button calls it.
**Fix:** Wire the Portfolio header save button to `App.Shell.triggerGistSave()`.
Do the same for the Ember and Habits header save buttons — they also save their file only.
Or: keep per-module save buttons for module-specific saves, but also add a prominent
"Save All" button wired to `App.Shell.triggerGistSave()`. Decide which UX is correct,
then fix the wiring consistently.

### V5 — `App.Shell.triggerGistSave()` is orphaned — no UI button calls it (Rule 4)
**File:** `js/core/app-shell.js`
`triggerGistSave()` is exported but never called from any button in the app.
It exists, it is correct, but it is unreachable from the UI.
This is the direct consequence of V4. See V4 fix.

### V6 — `portfolio.js` still exports `gistLoad` publicly (Rule 4)
**File:** `js/modules/portfolio/portfolio.js` exports block
```js
triggerGistSave, gistLoad, ...
```
`gistLoad()` is a portfolio-only private loader. After the sign-in fix (where sign-in now
calls `App.Shell.triggerGistLoad()` instead), there is no legitimate external caller of
`portfolio.gistLoad()`. Keeping it public invites future callers to misuse it.
**Fix:** Remove `gistLoad` from the exports. Make the function private (prefix `_`).
Keep `triggerGistSave` exported because the per-module save button uses it (see V4 discussion).

### V7 — `settings.js` calls `App.Portfolio.clearPriceCache()`, `exportPortfolioCSV()`, `undoDelete()` (Rule 3)
**File:** `js/modules/settings/settings.js`
```js
window.App.Portfolio.exportPortfolioCSV();
window.App.Portfolio.clearPriceCache();
window.App.Portfolio.undoDelete();
```
Settings calling Portfolio directly is a cross-module call. Settings is supposed to be
a UI aggregator that talks to modules via Shell or State, not a module that has hard
dependencies on Portfolio internals.
**Fix (pragmatic):** These are Portfolio-specific actions and there is no Shell equivalent.
The right fix is: add `App.Shell.registerAction(moduleId, actionId, fn)` pattern so
modules can register callable actions, and Settings calls `App.Shell.callAction(...)`.
However, that is a large refactor. A simpler pragmatic fix that keeps isolation:
move these three buttons entirely into the Portfolio section of Settings and call them
via a module-registered callback rather than a direct cross-module call.

### V8 — GitHub Action email uses ALL highlights, browser email uses only 'general' category (Rule 2)
**File:** `.github/workflows/ember-email.yml`
`ember.js generateDailyDigest()` filters highlights to `category === 'general'` only.
The Python script in the GitHub Action picks from ALL highlights regardless of category.
Users who categorise highlights as 'academic' will see academic highlights in their
daily email from the Action, but not from the browser-side email. Inconsistent behaviour.
**Fix:** Add category filter to the Python script in the YML:
```python
highlights = [h for h in ember.get('highlights', []) if h.get('category', 'general') == 'general']
```
Add this line immediately after `highlights = ember.get('highlights', [])`.

### V9 — Theme stored in `portfolio.settings.theme`, owned by Portfolio namespace (Rule 1)
**File:** `js/core/state.js` · `DEFAULT_PORTFOLIO_SETTINGS`
Theme is an app-level concern (it affects every module's UI) but is stored inside the
Portfolio namespace. If portfolio state is reset, the theme resets to dark.
`App.Shell.applyTheme()` already reads from `App.State.getPortfolioSettings()` —
meaning the Shell has a hidden dependency on Portfolio's namespace.
This is the root cause of V3. Fix V3 and V9 together.

---

## What the Audit Should Produce

For each finding (known violations above + any new ones discovered):

1. **Plain-language description** — what is wrong and why it matters for scaling
2. **File + line number** — exact location
3. **Severity** — Bug (causes data loss or wrong behaviour) / Structural (will cause bugs when scaling) / Cosmetic (style only)
4. **Minimal fix** — the smallest code change that fixes it without rewriting everything

After all findings, produce:

### A. Updated MODULE_RULES.md additions
Any new rules or clarifications to add to `docs/MODULE_RULES.md` based on violations found.

### B. New module checklist addition
Add any missing items to the "Registering a new module" checklist in `MODULE_RULES.md`
(e.g. "wire save button to App.Shell.triggerGistSave, not module.triggerGistSave").

### C. The Rules Card
A short comment block (8–12 lines) to paste at the top of every new module file:
```js
/**
 * MODULE RULES — read before editing
 * 1. ...
 */
```
Make it concrete enough that a non-expert developer reading it for the first time
understands exactly what they must and must not do.

---

## Files to Review

Provide all files under `js/` and `docs/` to the reviewer.
Priority order for findings: state.js → app-shell.js → gist.js → each module → settings.js → index.html.

The reviewer should also check `docs/MODULE_RULES.md`, `docs/ARCHITECTURE.md`, and
`docs/reference/CODE_REVIEW.md` for any rules that are documented but not enforced in code,
or any code patterns that exist but are not yet documented as rules.
