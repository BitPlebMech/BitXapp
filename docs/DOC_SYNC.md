# BiT PleB Dashboard — Documentation Sync Protocol

> **How to trigger:** After any meaningful vibe-coding session, say:
> *"Run doc sync"* — Claude reads this file, scans the current codebase, and
> updates every doc that is out of date. No session history needed.

---

## What this file is

A machine-readable orchestration spec. It tells Claude:
1. What each doc covers (the doc map)
2. What kinds of changes require which docs to be updated (the trigger rules)
3. Exactly how to run a sync pass (the protocol)

The goal is that Claude never needs to guess what to update. The rules are here.
The code is the source of truth. Docs follow the code — not the other way round.

---

## Doc Map

Each entry is: **file → what it covers → what makes it stale**.

### Primary docs (always check these)

| File | Covers | Goes stale when… |
|------|--------|-----------------|
| `docs/ARCHITECTURE.md` | Module graph, script load order, init flow, state lifecycle, Gist sync architecture, algorithms, CSS architecture, browser support | New module added; script order changed; new algorithm added; core init flow changes; new Gist file added; new Shell method added |
| `docs/MODULE_RULES.md` | Hard rules for state, Gist, isolation, script order, new-module checklist, Shell-owned concerns | New rule discovered from a real bug; Shell gains a new app-level API; a new pattern becomes standard; a past-mistake table entry added |
| `docs/API.md` | Every public method on `window.App.*` with signatures and return types | Any public function added, removed, renamed, or whose signature changes |
| `docs/TROUBLESHOOTING.md` | Common errors, root causes, fixes, debug steps | A known bug is fixed (entry should say "fixed in X"); a new class of error emerges; a fix changes the symptom description |
| `docs/reference/CONTEXT_BRIEF.md` | Session-start handoff: what the app is, file map, key patterns, sign-in flow, algorithms, history log | Any of the above changes; new module added; core pattern changes; history entry needed |
| `CHANGELOG.md` | Dated log of every significant change | Always — every doc sync should add an entry |

### Reference docs (check only when relevant)

| File | Covers | Goes stale when… |
|------|--------|-----------------|
| `docs/TESTING.md` | Test runner, how to run, what is tested, coverage targets | Test runner changes; new test files added; coverage numbers change significantly |
| `docs/reference/CODE_REVIEW.md` | Prompt template for requesting code reviews | Review criteria change; new architecture rules added |
| `docs/reference/UI_COMPONENT_GUIDE.md` | Component → file mapping, which files to share with Claude for a given UI task | New CSS file added; new HTML structure; file renamed |
| `docs/reference/UI_TWEAKS.md` | Safe-to-touch CSS token locations with file + line references | Design tokens file changes; new token added; line numbers shift significantly |
| `docs/reference/FUTURE_IPAD_SYNC.md` | Multi-device sync research | Only if sync architecture fundamentally changes |
| `docs/reference/MACOS_APP.md` | Native macOS app prerequisites | Only if app stack fundamentally changes |

### Deleted (do not recreate)

| File | Why deleted |
|------|-------------|
| `docs/PROJECT_DESCRIPTION_V2.md` | Duplicate of `CONTEXT_BRIEF.md`; was an AI handoff prompt masquerading as a doc |

---

## Trigger Rules

When you finish a coding session, match what you built against these triggers.
Each trigger lists which docs need updating.

### Adding a new module

- `ARCHITECTURE.md` — add to module graph, script load order, file tree
- `MODULE_RULES.md` — update new-module checklist if any step was non-obvious
- `API.md` — add the new module's public API surface
- `CONTEXT_BRIEF.md` — add to Modules table, file map, state namespace table
- `CHANGELOG.md` — log it

### Adding a new Shell method (`App.Shell.*`)

- `API.md` — add signature and description under `App.Shell`
- `MODULE_RULES.md` — if it's a new app-level concern, add to Rule 7 table
- `ARCHITECTURE.md` — if it changes init flow or Gist architecture
- `CONTEXT_BRIEF.md` — add to Core Patterns table if it's a pattern modules should follow
- `CHANGELOG.md` — log it

### Adding a new `App.State` accessor

- `API.md` — add under `App.State`
- `MODULE_RULES.md` — update state namespace JSON in Rule 1 if new namespace
- `ARCHITECTURE.md` — update state shape diagram if new top-level namespace
- `CHANGELOG.md` — log it

### Adding a new Gist file (new module syncing)

- `ARCHITECTURE.md` — update "Three Gist files" table
- `MODULE_RULES.md` — update Rule 2 table
- `CONTEXT_BRIEF.md` — update state namespace table
- `CHANGELOG.md` — log it

### Changing the script load order in `index.html`

- `ARCHITECTURE.md` — update "Script Load Order" section (numbered list)
- `MODULE_RULES.md` — update Rule 5 group diagram
- `CHANGELOG.md` — log it

### Fixing a bug that was previously documented as a known issue

- `TROUBLESHOOTING.md` — update the entry to say "Fixed in [date]" or remove if no longer relevant
- `docs/reference/CODE_REVIEW_REPORT.md` — update regression check table status
- `CHANGELOG.md` — log it

### Changing a core algorithm (FIFO, XIRR, streak, SM-2, FX)

- `ARCHITECTURE.md` — update "Key Algorithms" section
- `CONTEXT_BRIEF.md` — update "Key Algorithms" section
- `CHANGELOG.md` — log it

### Adding a new rule from a real bug

- `MODULE_RULES.md` — add to Rule 8 "Common mistakes" table with consequence and rule ref
- `CHANGELOG.md` — log the bug and the rule it generated

### Performance optimisation

- `ARCHITECTURE.md` — update relevant section if the data flow or algorithm changes
- `CHANGELOG.md` — log with before/after description

### CSS / design-token change

- `docs/reference/UI_TWEAKS.md` — update token name, file, and line reference
- `docs/reference/UI_COMPONENT_GUIDE.md` — update file map if a CSS file is added/renamed
- `CHANGELOG.md` — log if significant (new file, renamed file, token renamed)

### New troubleshooting pattern discovered

- `docs/TROUBLESHOOTING.md` — add a new entry under the appropriate section
- `CHANGELOG.md` — log it

---

## Sync Protocol — what Claude does when you say "Run doc sync"

1. **Read this file first** — understand scope and rules
2. **Read `CHANGELOG.md`** — find the last sync date to know what's already current
3. **Scan the codebase** — read the current state of:
   - `index.html` (script load order, HTML structure)
   - `js/core/app-shell.js` (Shell public API, `return {}` block)
   - `js/core/state.js` (DEFAULT_STATE, all getters/setters)
   - `js/core/gist.js` (file constants, save/load functions)
   - `js/modules/*/` (registered modules, public exports, actions registered)
4. **Compare code reality against each doc** — don't trust memory; read the actual files
5. **Update only what is stale** — surgical edits, not rewrites; preserve existing structure
6. **Write a `CHANGELOG.md` entry** — dated, bullet-pointed, concise
7. **Report to user** — list every file touched and what changed (one line per change)

### What Claude must NOT do during a sync

- Rewrite docs from scratch (destroys history and context)
- Update a doc based on session memory alone (always verify against live code)
- Add speculative content ("this might be useful") — only document what exists
- Change the tone or structure of a doc without being asked
- Skip `CHANGELOG.md` — it is always updated, even for small fixes

---

## CHANGELOG format

```markdown
## YYYY-MM-DD — [brief title]

### Added
- Short bullet describing what is new

### Changed  
- Short bullet describing what was modified and why

### Fixed
- Short bullet describing bug fixed (include which rule/pattern it violated if relevant)

### Removed
- Short bullet describing what was deleted and why
```

Use semantic categories. Leave out empty categories.
Link to the relevant doc sections if the change affects architecture rules.

---

## Doc quality bar

A doc is considered **current** if:
- Every code example in it actually runs against the current codebase
- Every file path it mentions exists
- Every function name it mentions is in the current public API
- Every rule it states is enforced by the current code, not just intended

A doc is **stale** if any of the above is false — even if only one line is wrong.
Stale docs are worse than no docs: they actively mislead future Claude sessions.
