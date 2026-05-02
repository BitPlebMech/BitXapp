# BiT PleB Dashboard — Troubleshooting Guide

Common errors, root causes, and fixes. Check the browser console (F12 → Console) first.

---

## Table of Contents

1. [App won't load / blank screen](#1-app-wont-load--blank-screen)
2. [Gist sync errors](#2-gist-sync-errors)
3. [Price fetch failures](#3-price-fetch-failures)
4. [FX rate issues](#4-fx-rate-issues)
5. [Data / localStorage issues](#5-data--localstorage-issues)
6. [Habits streak wrong](#6-habits-streak-wrong)
7. [CSV import problems](#7-csv-import-problems)
8. [Ember / email issues](#8-ember--email-issues)
9. [Module won't initialize](#9-module-wont-initialize)
10. [Theme / UI glitches](#10-theme--ui-glitches)
11. [Developer: running tests](#11-developer-running-tests)

---

## 1. App won't load / blank screen

**Console error: `App.State not found — ensure state.js loads before app-shell.js`**

The script load order in `index.html` is wrong. `state.js` must appear before `app-shell.js`.

```html
<!-- Correct order -->
<script src="js/core/state.js"></script>
<script src="js/core/gist.js"></script>
<script src="js/core/app-shell.js"></script>
```

**Console error: `Cannot read properties of undefined (reading 'init')`**

A module file is missing or has a syntax error. Open Network tab (F12 → Network) and look for any 404 responses on `.js` files.

**White screen, no console errors**

Check that `DOMContentLoaded` fires. Open Console and run:
```javascript
document.readyState  // should be "complete"
window.App           // should show the App object
```

If `window.App` is `{}` (empty), the module files failed to load. Check the Network tab.

---

## 2. Gist sync errors

### "Add your GitHub token in Settings → Gist Sync"
Your GitHub Personal Access Token (PAT) is not saved. Go to **Settings → Gist Sync** and enter your token.

**Creating a token:**
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Scopes required: ✅ `gist` only
3. No expiry recommended for personal use

### "Gist save failed: Bad credentials"
Your token is expired or was revoked. Generate a new one (same steps above).

**Why tokens get auto-revoked:** GitHub scans all public Gist content for tokens. If your token appeared in a Gist content accidentally, GitHub revokes it automatically. The app scrubs tokens before saving, but if you manually pasted a token into a Gist it will be revoked.

### "Gist save failed: Not Found" / HTTP 404
Your Gist ID is wrong or the Gist was deleted. Clear the Gist ID in Settings and create a new one.

### `"portfolio-data.json" not found in this Gist`
The Gist ID you entered points to a Gist that doesn't have the expected file. Either:
- You pasted the wrong Gist ID
- The first save never completed — try Save first, then Load

### "Save already in progress…"
You clicked Gist Save twice quickly. The second click is blocked by the race-condition lock. Wait for the first save to complete (the button will re-enable).

### Gist loads old data after reload
The Gist save succeeded but you reloaded before it completed. The `_saved` timestamp in the Gist file tells you when it was written. Check Settings → Gist Sync → Last Sync timestamp.

---

## 3. Price fetch failures

### Prices show "—" after refresh
**Most likely:** All price sources are rate-limited or unavailable. The app tries 3 sources in order: Yahoo Finance → CoinGecko (crypto only) → Alpha Vantage.

**Check:** Open Console and look for messages like:
```
[Portfolio] Yahoo failed for AAPL: timeout
[Portfolio] Alpha Vantage failed for AAPL: HTTP 429
```

**Fix options:**
- Wait and retry — Yahoo rate limits reset in ~1 hour
- Add an Alpha Vantage API key in Settings (free tier: 25 requests/day)
- Use the **mock prices** toggle (Settings → Debug) for development

### Prices are stale
The price cache TTL is 4 hours by default. Force a fresh fetch with **Refresh (force)** button or clear the cache in Settings.

Check the cache age in the console:
```javascript
App.State.getPortfolioData().lastRefreshTS
// Returns Unix ms timestamp of last successful refresh
```

### "timeout" errors
Your connection is slow or a CORS proxy is overloaded. The app uses `https://corsproxy.io/` as a proxy for Yahoo Finance requests. If the proxy is down, prices will fail.

**Alternative:** Use Alpha Vantage with your own API key (no proxy needed).

---

## 4. FX rate issues

### "⚠️ FX API failed — using approximate rates"
The app couldn't fetch live EUR/USD and EUR/INR rates from `open.er-api.com`. It falls back to hardcoded approximate rates. XIRR and CAGR calculations may be slightly off.

**Fix:** Check your internet connection. The FX API is free and doesn't require a key — it usually self-resolves.

### XIRR shows "—" for INR or USD portfolio
The historical FX rates (needed for accurate XIRR) haven't been fetched yet. Wait for the async `fetchFX()` to complete on page load, then click Refresh.

### FX rates look stale (more than a day old)
`fetchFX()` has a 24-hour TTL cache — it skips the bulk Frankfurter fetch if data was loaded less than 24h ago. If you think rates are stale:
1. Check `App.State.getPortfolioData().fxLastFetch` in the console (Unix ms timestamp)
2. If it's > 24h old and rates are still not refreshing, clear the price cache in Settings — this resets `fxLastFetch` and forces a fresh fetch on next load

### Currency dropdown resets to EUR on reload
**This was a bug fixed in Phase 1.** If you're seeing it, make sure you have the latest version of `portfolio.js` with `_syncCurrencyUI()` in `init()`.

---

## 5. Data / localStorage issues

### "Storage full" or save fails silently
`localStorage` has a ~5 MB limit per origin. The portfolio state (especially price cache and transaction history) can approach this with large datasets.

**Check current usage:**
```javascript
App.State.storageInfo()  // e.g. "1.8 MB / 5 MB"
```

**Fix:**
- Clear the price cache: Settings → Clear Price Cache (frees ~100–500 KB)
- Archive old transactions by exporting JSON and importing only recent years
- Use Gist sync as backup, then clear deleted transactions: Settings → Clear Deleted History

### Data disappeared after browser update or private mode
- **Private/Incognito mode:** `localStorage` is cleared when the window closes — this is browser behaviour. Use Gist sync to persist your data.
- **Browser update:** Some browsers clear `localStorage` on major updates. Always keep a Gist backup.

### "Invalid portfolio format" on JSON import
Your JSON file doesn't have a `transactions` array at the top level. Check:
```javascript
JSON.parse(fileContent).transactions  // must be an array
```

The expected format is the output of Settings → Export Portfolio JSON.

### State looks correct in App.State but UI doesn't update
Modules render on explicit `render()` calls — there's no reactivity. After modifying state directly in the console, call:
```javascript
App.Portfolio.render()  // or App.Habits.init()
```

---

## 6. Habits streak wrong

### Streak shows 0 when I checked in today
**Possible cause:** Your device clock is off, so "today" in the app doesn't match the day you checked in.

**Check:**
```javascript
App.Habits.today()           // what the app thinks today is
new Date().toISOString()     // your actual local time
```

**Fix:** Ensure your OS clock is synced.

### Streak counts yesterday's check-in but not today's
This is intentional. If you haven't checked in today yet, the streak counts from yesterday — this is the **grace period** behaviour. It prevents your streak from showing 0 in the morning before you check in.

### Longest streak is lower than expected
The longest streak scan only goes back 365 days. If your habit has entries older than a year, earlier streaks are not counted in `longest`.

---

## 7. CSV import problems

### "Could not detect column" / import wizard shows empty preview
Your CSV has non-standard column names. The importer supports common aliases (e.g. `Qty`, `Quantity`, `Units`, `Shares` all map to quantity). Check `portfolio-data.js` for the full alias list.

**Minimum required columns:** `date`, `ticker`, `type` (BUY/SELL), `qty`, `price`

### Duplicate transactions after import
The importer deduplicates by `(date, ticker, type, qty, price)`. If your CSV has slightly different values (e.g. price with more decimal places), it won't deduplicate. Review the preview table before confirming.

### Dates imported as wrong year
The importer auto-detects `DD/MM/YYYY`, `MM/DD/YYYY`, and `YYYY-MM-DD`. Ambiguous dates (e.g. `01/02/2024`) default to `DD/MM/YYYY`. If your broker uses `MM/DD`, reformat the date column before import.

---

## 8. Ember / email issues

### Email not sending
1. **EmailJS credentials not configured** — go to Ember → Settings → Email and enter your Service ID, Template ID, and Public Key from [emailjs.com](https://emailjs.com).
2. **EmailJS SDK not loaded** — check your internet connection. The SDK loads from `cdn.jsdelivr.net`.
3. **No highlights available** — emails only send if you have highlights in the "General Reading" category.

### Auto-email sends at wrong time
The scheduled email time in Ember Settings is compared against your local clock. If your timezone is different from when you set it up, adjust the time accordingly.

### Spaced repetition intervals growing too slowly
The SM-2 algorithm increases the ease factor only when you score ≥ 4 (out of 5). Score 5 ("perfect recall") grows intervals fastest. Scoring 3 or below resets the interval to 1 day.

---

## 9. Module won't initialize

**Console: `[Shell] Module "portfolio" init failed — will retry on next visit`**

`portfolio.init()` threw an error. The most common cause is a corrupted state shape. Check:
```javascript
App.State.getPortfolioData()  // look for unexpected null/undefined values
```

**Fix:** If state is corrupted, you can reset just the portfolio namespace:
```javascript
App.State.setPortfolioData({
  transactions: [], deletedTransactions: [], priceCache: {},
  tickerMeta: {}, lastRefreshTS: null, fxDaily: {USD:{},INR:{}},
  fxLastFetch: null, settings: {}
});
location.reload();
```

**The module retries automatically** on next sidebar click — it's not permanently broken.

---

## 10. Theme / UI glitches

### Theme reverts to dark on reload
The theme is stored in `portfolio.settings.theme`. If portfolio state is reset, the theme resets too. Set it again in the header theme toggle.

### Light mode looks too blue / dark mode is too dark
Check that `css/bitxapp-base.css` is loading correctly (Network tab, no 404). Also check that `data-theme` is set correctly on `<html>`:
```javascript
document.documentElement.getAttribute('data-theme')  // 'light' or 'dark'
```

### Sidebar icons missing or sidebar blank
`App.Shell.registerModule()` was not called for a module (or the module file failed to load). Check Console for 404s and `[Shell] Module already registered` warnings.

### Toast notifications not appearing
The toast container is dynamically created on first toast. If toasts aren't showing, check:
```javascript
document.getElementById('toast-container')  // null means no toast was ever fired
App.Shell.toast('test')  // manually fire a test toast
```

---

## 11. Developer: running tests

See [TESTING.md](./TESTING.md) for full setup. Quick check:

```bash
npm test                  # run all tests
npm run test:watch        # watch mode
npm run test:coverage     # coverage report at coverage/index.html
```

**Common test failure: `window.App is not defined`**
Make sure `tests/setup.js` initialises `window.App = {}` in `beforeEach`. See TESTING.md setup section.

---

## Still stuck?

1. Open browser DevTools → Console — copy the full error message
2. Check `App.State.getAll()` in the console to see current state
3. Try a factory reset (⚠️ deletes all local data): Settings → Factory Reset
4. Restore from Gist after reset: Settings → Gist Sync → Load
