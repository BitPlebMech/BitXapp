# Portfolio Terminal — Modular Refactor Log

**Source:** `DashBoard/BitXappMod.js` (5 091 lines) + `BitXappMod.css` (1 946 lines)  
**Target:** `Portfolio-Terminal-Modular/` — fully modular multi-module app  
**Storage key migration:** `portfolio_v3` → `super_app_v1`

---

## Architecture decisions

### 1. Unified state via `App.State`

All modules read and write data exclusively through `js/core/state.js`. No module
touches `localStorage` directly. The single key `super_app_v1` holds a namespaced
object `{ portfolio, portfolioSettings, habits, financecalc, gist }`.

**Why:** Prevents key collisions as modules are added; makes Gist sync trivially
correct — one save captures everything.

### 2. Pure Gist API via `App.Gist`

`js/core/gist.js` is a stateless, UI-free wrapper around the GitHub Gist REST API.
It exposes only `save(payload, token, id)` and `load(token, id)`.

**Why:** Both Portfolio and Habits need Gist sync. Extracting it into a shared core
layer means zero duplication and a single place to fix credential scrubbing bugs.

**Credential scrubbing:** `_scrubToken()` strips any `ghp_` GitHub PAT found in the
payload before it is written to the Gist. GitHub auto-revokes tokens it detects in
public Gist content.

### 3. Lazy-init shell via `App.Shell`

`js/core/app-shell.js` maintains a module registry. Sidebar buttons are generated
from `registerModule()` calls. `switchModule(id)` lazy-inits a module on first visit
(calls `mod.init()` once, then never again).

**Why:** Habits data is seeded on `init()`. Calling init eagerly on page load would
pollute localStorage before the user ever opens the tab.

### 4. Habits module — proves the modular data flow end-to-end

`habits.js → App.State.getHabitsData() / setHabitsData() → localStorage`

No Portfolio code is involved. `triggerGistSave()` in habits.js calls
`App.Gist.save(App.State.getAll(), …)`, which saves the full unified state — proving
cross-module Gist sync works without coupling.

### 5. FIFO sort: BUY before SELL on same date

Critical for correct lot matching. Preserved exactly from the monolith:

```js
const sorted = [...s.transactions].sort((a, b) => {
  const d = a.date.localeCompare(b.date);
  if (d !== 0) return d;
  return (a.type === 'BUY' ? 0 : 1) - (b.type === 'BUY' ? 0 : 1);
});
```

### 6. Gist load backward compatibility

`gistLoad()` in `portfolio.js` checks `typeof result.transactions === 'object'` to
detect the old flat format from `portfolio_v3` and wraps it in the new structure.
Users migrating from the monolith don't lose data.

### 7. CSS split strategy

| File | Contents |
|------|----------|
| `css/main.css` | Design tokens (dark + light), CSS reset, keyframe animations, app shell layout, sidebar, shared utilities (pills, badges, scrollbars) |
| `css/components.css` | Generic reusable overlays: modal, settings panel, drawer, confirm dialog, toasts, form inputs, CSV wizard, credentials popup |
| `css/modules/portfolio.css` | KPI cards, overview charts (donut, bar), positions grid, history table, analytics table, drawer content |
| `css/modules/habits.css` | Habit cards, heatmap cells, stats row, check-in button, add form, color swatches, archived section |
| `css/modules/financecalc.css` | Empty stub — to be filled when module is implemented |

---

## File map

```
Portfolio-Terminal-Modular/
├── index.html                          Entry point — correct script load order
├── REFACTOR_LOG.md                     This file
│
├── css/
│   ├── main.css                        Tokens, reset, shell, animations
│   ├── components.css                  Generic UI components
│   └── modules/
│       ├── portfolio.css               Portfolio-specific styles
│       ├── habits.css                  Habits-specific styles
│       └── financecalc.css             Stub
│
└── js/
    ├── core/
    │   ├── state.js                    Central localStorage CRUD (super_app_v1)
    │   ├── gist.js                     Pure GitHub Gist API (save / load)
    │   └── app-shell.js               Module registry + sidebar + lazy init
    │
    └── modules/
        ├── portfolio/
        │   ├── portfolio-data.js       CSV parsing, deduplication, column aliases
        │   ├── portfolio.js            Business logic: FIFO, XIRR, CAGR, formatters
        │   └── portfolio-ui.js         DOM rendering: KPIs, cards, charts, forms
        │
        ├── habits/
        │   ├── habits-data.js          Data shapes, seed data, date utilities
        │   ├── habits.js               Streak calc, check-in toggle, CRUD
        │   └── habits-ui.js            Habit cards, heatmap, add form
        │
        └── financecalc/
            └── calc.js                 Stub — registers 'calc' with App.Shell
```

---

## Script load order (index.html)

```
state.js          — must be first: all modules depend on it
gist.js           — depends on nothing
app-shell.js      — must load before any registerModule() calls

habits-data.js    — utility layer for habits.js
habits.js         — calls App.Shell.registerModule('habits')
habits-ui.js      — called by habits.js via _render()

portfolio-data.js — CSV parser utilities for portfolio.js
portfolio.js      — calls App.Shell.registerModule('portfolio')
portfolio-ui.js   — called by portfolio.js via _render()

<inline script>   — DOMContentLoaded → App.State.init() → App.Shell.init('portfolio')
```

---

## What was not migrated

- **`mod-compare`** (Return Comparator) — kept as a placeholder pane, no JS yet
- **Dumbbell chart canvas rendering** — uses vanilla Canvas API inside portfolio-ui.js;
  no external charting library required
- **Lock screen / auth gate** — the original had a credential popup gating all access;
  the modular version shows the cred popup lazily only when a Gist operation is
  attempted without credentials (better UX)
