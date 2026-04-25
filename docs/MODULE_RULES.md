# Portfolio Terminal — Module Rules
> **Read this before adding or editing any module.**
> These rules exist because breaking them has caused real bugs (wrong Gist file, lost books tab, corrupt state).

---

## 1. State namespaces — the single most important rule

`localStorage` holds one key: `super_app_v1`. Inside it, **every module owns exactly one namespace**:

```json
{
  "portfolio":   { "transactions": [], "priceCache": {}, "settings": {} },
  "habits":      { "habits": [], "logs": [] },
  "ember":       { "sources": [], "highlights": [], "settings": {}, "streak": {} },
  "financecalc": { "saved": [], "history": [] },
  "gist":        { "token": "", "id": "", "lastSync": "" }
}
```

**Rules:**
- A module reads/writes **only its own namespace** via `App.State`.
- **Never** put a new module's data inside `portfolio`, `ember`, or any other existing namespace.
- **Never** call `localStorage` directly. Always go through `App.State.getXxxData()` / `setXxxData()`.

**To add a new module's state:**
1. Add `mymodule: { … }` to `DEFAULT_STATE` in `state.js`
2. Add `getMymoduleData()` and `setMymoduleData()` accessors in `state.js`
3. Use those accessors — nowhere else

---

## 2. Gist files — one file per module

Each module that syncs to Gist gets its **own file** in the Gist. Never mix modules into someone else's file.

| Module | Gist file | Save function | Load function |
|--------|-----------|---------------|---------------|
| Portfolio | `portfolio-data.json` | `App.Gist.savePortfolioData()` | `App.Gist.loadPortfolioData()` |
| Ember | `ember-highlights.json` | `App.Gist.saveEmberData()` | `App.Gist.loadEmberData()` |
| Habits | `habits-data.json` | `App.Gist.saveHabitsData()` | `App.Gist.loadHabitsData()` |

**Rules:**
- All files share the **same Gist ID** from `App.State.getGistCredentials()`.
- To add sync for a new module: add `MYMODULE_FILENAME` constant + `saveMymoduleData()` + `loadMymoduleData()` to `gist.js`. Do not reuse or extend another module's file.
- A module's `triggerGistLoad()` must restore **all fields** of its state namespace from the parsed Gist data — not just some of them. (The "empty books tab" bug was caused by restoring `highlights` but forgetting `sources`.)

---

## 3. Module isolation — no cross-module calls

Modules must never call each other directly:

```
✅  window.App.State.getEmberData()     — reading via State is fine
✅  window.App.Shell.toast(msg)         — UI services via Shell is fine
✅  window.App.Shell.confirmAction(…)   — Shell dialogs are fine

❌  window.App.Portfolio.toast(…)       — calling another module's function
❌  window.App.Ember.getSources()       — reading another module's data directly
```

If two modules need to share behaviour, put it in a `js/core/` helper — not in either module.

---

## 4. What each layer is allowed to do

| Layer | Can call | Cannot call |
|-------|----------|-------------|
| `js/core/` utilities (`constants`, `utils`, `formatters`, etc.) | Nothing — pure functions only | Anything on `window.App` |
| `state.js` | `localStorage` only | Any module or Gist |
| `gist.js` | `fetch()` (GitHub API) only | `App.State`, any module, any DOM |
| `app-shell.js` | `App.State`, `App.Gist`, registered modules via `init()` | No module internals |
| Module business logic (e.g. `habits.js`) | `App.State`, `App.Shell`, `App.Gist` | Other modules |
| Module UI (e.g. `habits-ui.js`) | Its own module's business logic, `App.Shell` | `App.State` directly, other modules |

---

## 5. Script load order

Scripts in `index.html` must stay in this order. Each group depends on everything above it:

```
Group A — pure utilities (no deps):
  constants.js, utils.js, theme-tokens.js, formatters.js, pagination.js, filters.js

Group B — infrastructure:
  state.js → gist.js → app-shell.js

Group C — modules (each group: data file → business logic → UI):
  habits-data.js → habits.js → habits-ui.js
  ember-data.js  → ember-ui.js → ember.js
  portfolio-data.js → portfolio.js → portfolio-ui.js
  calc.js
  settings.js   ← always last (depends on all modules being registered)

Group D — inline boot script:
  DOMContentLoaded → App.State.init() → App.Shell.init()
```

---

## 6. Registering a new module (checklist)

- [ ] Create `js/modules/mymodule/mymodule.js` with an IIFE assigning to `window.App.MyModule`
- [ ] Call `window.App.Shell?.registerModule({ id, label, icon, init })` at the bottom
- [ ] Add `mymodule: { … }` to `DEFAULT_STATE` in `state.js` + getter/setter
- [ ] Add `<div id="mod-mymodule" class="module-pane">` in `index.html`
- [ ] Add `<script>` tag in `index.html` before `settings.js`
- [ ] If Gist sync needed: add file constant + save/load functions to `gist.js`, add `triggerGistSave()` + `triggerGistLoad()` to the module, add Gist Save/Load buttons to the module header in `index.html`, add Export/Import JSON to Settings

**The shell auto-generates the sidebar button. No other files need to change.**

---

## 7. Common mistakes to avoid

| Mistake | Consequence | Rule |
|---------|-------------|------|
| Storing new module data in `portfolio` namespace | Data lost or corrupt on save | Rule 1 |
| Using `App.Gist.save()` (the old generic function) instead of `saveXxxData()` | Overwrites `portfolio-data.json` with wrong data | Rule 2 |
| Restoring only `highlights` from Gist, forgetting `sources` | Books tab empty after load | Rule 2 |
| Calling `window.App.Portfolio.toast()` from another module | Hard dependency, breaks isolation | Rule 3 |
| Calling `localStorage.getItem()` directly in a module | Bypasses state layer, migration won't run | Rule 1 |
| Loading scripts out of order | Silent failures — module calls function that isn't defined yet | Rule 5 |
