# BiT PleB Portfolio Terminal

A zero-dependency personal finance dashboard. No build step, no server, no framework — pure HTML + CSS + vanilla JavaScript.

**Open it:** double-click `index.html`, or run a local server for live prices:
```bash
python3 -m http.server 8080
```

## Modules

| Module | Status |
|--------|--------|
| Portfolio — FIFO, XIRR, CAGR, live prices, CSV import | ✅ |
| Habits — streaks, heatmap, completion rate | ✅ |
| Ember — Kindle highlights, spaced repetition, daily email | ✅ |
| Finance Calculator | 🔲 planned |

## Data & Sync

All data lives in `localStorage` (`super_app_v1`). Optional cloud sync to a private GitHub Gist — one Gist, three files (`portfolio-data.json`, `ember-highlights.json`, `habits-data.json`). Your GitHub token is never written to the Gist.

## Tests

```bash
npm install
npm test
```

172 unit tests via Vitest.

## Docs

| File | Purpose |
|------|---------|
| `docs/MODULE_RULES.md` | **Read before adding any module** — hard rules |
| `docs/ARCHITECTURE.md` | Full architecture, data flow, algorithms |
| `docs/API.md` | Public API surface |
| `docs/TESTING.md` | Test guide |
| `docs/TROUBLESHOOTING.md` | Debug guide |
| `docs/reference/CONTEXT_BRIEF.md` | Hand to Claude at session start |
| `docs/reference/CODE_REVIEW.md` | Hand to Claude for a code review |
| `docs/reference/UI_COMPONENT_GUIDE.md` | Component → file mapping |
