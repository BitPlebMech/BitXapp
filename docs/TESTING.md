# Portfolio Terminal — Testing Guide

---

## Stack

- **Test runner:** [Vitest](https://vitest.dev/) — fast, Vite-native, Jest-compatible API
- **Coverage:** `@vitest/coverage-v8` (built-in)
- **Environment:** `jsdom` for DOM-dependent tests

---

## Quick Start

```bash
# Install dependencies (first time only)
npm install

# Run all tests
npm test

# Watch mode (re-runs on file save)
npm run test:watch

# Coverage report
npm run test:coverage

# Run a single file
npx vitest run tests/unit/state.test.js
```

---

## Folder Structure

```
tests/
├── unit/
│   ├── core/
│   │   ├── state.test.js        App.State — persistence, migration, merge
│   │   ├── utils.test.js        App.Utils — trySafe, generateId, clamp, debounce
│   │   ├── formatters.test.js   App.Formatters — date, number, timeAgo
│   │   ├── filters.test.js      App.Filters — textSearch, dateRange, sortBy
│   │   └── pagination.test.js   App.Pagination — getPage, slice, renderControls
│   └── modules/
│       ├── portfolio.test.js    FIFO lot matching, XIRR, CAGR, null handling
│       ├── habits.test.js       Streak calculation, toggleCheckIn edge cases
│       └── ember.test.js        SM-2 scoring, streak update, importParsed dedup
├── integration/
│   ├── gist-sync.test.js        Save/load round-trip (mocked fetch)
│   └── theme-switching.test.js  Theme toggle persists via App.State
└── e2e/
    └── user-flows.test.js       Add transaction → refresh → save → reload
```

---

## Configuration

**`package.json`** (root):
```json
{
  "scripts": {
    "test":            "vitest run",
    "test:watch":      "vitest",
    "test:coverage":   "vitest run --coverage"
  },
  "devDependencies": {
    "vitest":               "^1.0.0",
    "@vitest/coverage-v8":  "^1.0.0",
    "jsdom":                "^24.0.0"
  }
}
```

**`vitest.config.js`** (root):
```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['js/**/*.js'],
      exclude: ['js/core/app-shell.js'],  // heavy DOM, covered by e2e
    },
  },
});
```

**`tests/setup.js`**:
```javascript
// Provide a clean localStorage mock before every test
import { beforeEach, vi } from 'vitest';

beforeEach(() => {
  // Reset window.App namespace
  window.App = {};

  // Mock localStorage
  const store = {};
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(k => store[k] ?? null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => { store[k] = v; });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(k => { delete store[k]; });
  vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => Object.keys(store).forEach(k => delete store[k]));
});
```

---

## Writing Tests

### Pattern: load the file, test its side-effects

Since modules attach to `window.App` (no ES module exports), load them with `import`:

```javascript
// tests/unit/core/utils.test.js
import { describe, it, expect } from 'vitest';
import '../../../js/core/utils.js';

describe('App.Utils.trySafe', () => {
  it('returns fn() result on success', () => {
    expect(App.Utils.trySafe(() => 42)).toBe(42);
  });

  it('returns fallback on exception', () => {
    expect(App.Utils.trySafe(() => { throw new Error('oops'); }, 'default')).toBe('default');
  });

  it('does not throw', () => {
    expect(() => App.Utils.trySafe(() => { throw new Error(); })).not.toThrow();
  });
});
```

### Pattern: reset state between tests

```javascript
import { beforeEach, describe, it, expect } from 'vitest';
import '../../../js/core/state.js';

describe('App.State', () => {
  beforeEach(() => {
    localStorage.clear();
    window.App.State.init();
  });

  it('persists and retrieves habits data', () => {
    App.State.setHabitsData({ habits: [{ id: '1', name: 'Run' }], logs: [] });
    App.State.init();  // simulate page reload
    expect(App.State.getHabitsData().habits[0].name).toBe('Run');
  });
});
```

### Pattern: mock fetch for Gist tests

```javascript
import { vi, describe, it, expect } from 'vitest';
import '../../../js/core/gist.js';

describe('App.Gist.savePortfolioData', () => {
  it('sends PATCH when id is provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'abc123', html_url: 'https://gist.github.com/abc123' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await App.Gist.savePortfolioData(
      { portfolio: {}, gist: {} },
      'ghp_token',
      'existing_id'
    );

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('existing_id'),
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(result.id).toBe('abc123');
  });
});
```

---

## Test Coverage Goals

| Area | Target | Notes |
|------|--------|-------|
| `App.State` | 90% | All getters/setters, migration logic |
| `App.Utils` | 100% | Pure functions, easy to test |
| `App.Formatters` | 100% | Pure functions, no I/O |
| `App.Filters` | 100% | Pure functions |
| `App.Pagination` | 95% | getPage, edge cases (0 items, 1 page) |
| `habits.js` streak | 100% | Edge cases: never checked, all 365 days |
| `portfolio.js` XIRR | 80% | calcXIRR null return, fmtXIRR null display |
| `portfolio.js` FIFO | 80% | Same-date BUY/SELL ordering |
| `App.Gist` | 70% | Mocked fetch, error handling |

---

## Debugging Failing Tests

**Module not defined:**
Make sure `window.App` is reset in `beforeEach` and the file is imported at the top of the test. The IIFE pattern in each module runs on import.

**localStorage not persisting between init calls:**
Use the setup.js mock above. The real `localStorage` in jsdom is shared but may reset between test files.

**Async tests timing out:**
Add `{ timeout: 10000 }` to the test options, or check for unresolved promises. Use `vi.useFakeTimers()` for setTimeout-dependent code.

**Date-sensitive tests flaking:**
Avoid `new Date()` directly in assertions. Instead use `App.Formatters.todayISO()` or mock `Date` with `vi.setSystemTime(new Date('2025-01-15'))`.

```javascript
import { vi, afterEach } from 'vitest';

vi.useFakeTimers();
vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));

afterEach(() => {
  vi.useRealTimers();
});
```

---

## CI Integration

Add to `.github/workflows/test.yml`:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
```
