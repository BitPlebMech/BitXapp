'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * CORE / STATE  —  Unified localStorage persistence layer
 * ═══════════════════════════════════════════════════════════════════
 *
 * Single source of truth for all persisted application data.
 * All modules read/write through this API — never touch localStorage directly.
 *
 * Storage key: 'super_app_v1'
 * Structure:
 *   {
 *     portfolio: { transactions, deletedTransactions, priceCache,
 *                  tickerMeta, lastRefreshTS, fxDaily, fxLastFetch, settings },
 *     habits:    { habits, logs },
 *     financecalc: { saved, history },
 *     gist:      { token, id, lastSync }
 *   }
 *
 * RULES
 *  • No UI code here — no toast, no DOM references.
 *  • No module business logic — only raw get/set operations.
 *  • Every setter persists the entire state object atomically.
 * ═══════════════════════════════════════════════════════════════════
 */
window.App = window.App || {};

window.App.State = (() => {

  const STORAGE_KEY = 'super_app_v1';

  /* ── Default shapes ───────────────────────────────────────────── */

  const DEFAULT_PORTFOLIO_SETTINGS = {
    currency: 'EUR',
    apiKey: '',
    cacheTTL: 14400000,   // 4 hours
    theme: 'dark',
    // NOTE: gistToken / gistId are legacy fields kept here only for migration
    // compatibility.  The canonical storage location is _state.gist (see below).
    // New code must use getGistCredentials() / setGistCredentials().
    gistToken: '',
    gistId: '',
  };

  const DEFAULT_STATE = {
    portfolio: {
      transactions: [],
      deletedTransactions: [],
      priceCache: {},
      tickerMeta: {},
      lastRefreshTS: null,
      fxDaily: { USD: {}, INR: {} },
      fxLastFetch: null,
      settings: { ...DEFAULT_PORTFOLIO_SETTINGS },
    },
    habits: {
      habits: [],
      logs: [],
    },
    financecalc: {
      saved: [],
      history: [],
    },
    ember: {
      sources: [],    // [{ id, title, author, format, importedAt, highlightCount }]
      highlights: [], // [{ id, sourceId, text, chapter, location, page, color, hash, addedAt, category, srData }]
      settings: {
        email: '',
        emailEnabled: false,
        emailFrequency: 'daily',  // 'daily' | 'weekdays' | 'weekly'
        emailTime: '08:00',
        emailJSConfig: { serviceId: '', templateId: '', publicKey: '' },
        dailyGoal: 10,
        lastEmailSentDate: null,  // V1 fix: was stored as raw localStorage key outside super_app_v1
      },
      streak: {
        currentStreak: 0,
        longestStreak: 0,
        lastReviewDate: null,     // YYYY-MM-DD
        totalReviewDays: 0,
        reviewHistory: [],        // [{ date: 'YYYY-MM-DD', count: number }]
      },
    },
    gist: {
      token: '',
      id: '',
      lastSync: '',
    },
    app: {
      theme: 'dark',
    },
  };

  /* ── Internal state ───────────────────────────────────────────── */

  let _state = null;

  /* ── Private helpers ──────────────────────────────────────────── */

  /**
   * Recursive deep-merge: source values overwrite target values.
   * Arrays are replaced wholesale (not concatenated) — this is intentional
   * because arrays in our state are data collections (transactions, logs),
   * not configuration that needs merging.
   */
  function _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        typeof target[key] === 'object' &&
        target[key] !== null &&
        !Array.isArray(target[key])
      ) {
        // Recurse into nested objects
        result[key] = _deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  /** Load full state from localStorage, merging with defaults. */
  function _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        // Deep-merge each top-level namespace so new default keys survive old saves
        const merged = { ...DEFAULT_STATE };
        for (const ns of Object.keys(DEFAULT_STATE)) {
          if (saved[ns]) {
            merged[ns] = _deepMerge(DEFAULT_STATE[ns], saved[ns]);
          }
        }
        // ── One-time migration (BUG-01 / SCALE-02) ───────────────────────────
        // Credentials were previously stored in portfolio.settings.gistToken/Id.
        // Canonical storage is now _state.gist.  If the new location is still
        // empty but the legacy location has a value, migrate it automatically
        // so existing users do not lose their Gist connection on first load.
        if (!merged.gist.token && merged.portfolio?.settings?.gistToken) {
          merged.gist.token = merged.portfolio.settings.gistToken;
        }
        if (!merged.gist.id && merged.portfolio?.settings?.gistId) {
          merged.gist.id = merged.portfolio.settings.gistId;
        }
        // ─────────────────────────────────────────────────────────────────────

        // ── Theme migration (V9 fix) ────────────────────────────────────
        // Theme was previously stored in portfolio.settings.theme.
        // Canonical location is now _state.app.theme.  If the new location
        // still has the default value but the portfolio location differs,
        // migrate it so the user's preference is preserved.
        if (merged.app?.theme === 'dark' && merged.portfolio?.settings?.theme === 'light') {
          merged.app.theme = 'light';
        }
        // ─────────────────────────────────────────────────────────────────

        _state = merged;
      } else {
        _state = JSON.parse(JSON.stringify(DEFAULT_STATE));
      }
    } catch (e) {
      console.warn('[State] Failed to load from localStorage:', e.message);
      _state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  /** Persist full state to localStorage. */
  function _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
    } catch (e) {
      console.error('[State] Failed to persist state:', e.message);
    }
  }

  /** Ensure state is loaded (lazy init). */
  function _ensure() {
    if (!_state) _load();
  }

  /* ── Public API ───────────────────────────────────────────────── */

  // ─── Raw namespace access ───────────────────────────────────────

  /** Returns entire state (read-only reference — do not mutate directly). */
  function getAll() {
    _ensure();
    return _state;
  }

  /** Replace entire state (use sparingly — only for Gist load). */
  function setAll(newState) {
    _ensure();
    _state = newState;
    _save();
  }

  /**
   * Merge an incoming state (e.g. from a Gist load) with the current DEFAULT_STATE.
   *
   * Unlike setAll(), this is safe across module additions and removals:
   *   • New modules not present in the Gist get their default state automatically.
   *   • Removed modules present in the Gist are silently ignored.
   *   • Existing module data is deep-merged so new fields get defaults.
   *
   * Always use this instead of setAll() when loading from Gist.
   */
  function mergeAll(incoming) {
    _ensure();
    const merged = { ...DEFAULT_STATE };
    for (const ns of Object.keys(DEFAULT_STATE)) {
      if (incoming[ns]) {
        merged[ns] = _deepMerge(DEFAULT_STATE[ns], incoming[ns]);
      }
    }
    _state = merged;
    _save();
  }

  // ─── Portfolio namespace ────────────────────────────────────────

  function getPortfolioData() {
    _ensure();
    return _state.portfolio;
  }

  function setPortfolioData(portfolioObj) {
    _ensure();
    _state.portfolio = portfolioObj;
    _save();
  }

  function getPortfolioSettings() {
    _ensure();
    return _state.portfolio.settings;
  }

  function setPortfolioSettings(settings) {
    _ensure();
    _state.portfolio.settings = { ...settings };
    _save();
  }

  // ─── Habits namespace ───────────────────────────────────────────

  /**
   * Returns the habits namespace: { habits: [], logs: [] }
   * habits: [{ id, name, icon, color, createdAt, archivedAt }]
   * logs:   [{ id, habitId, date }]
   */
  function getHabitsData() {
    _ensure();
    return _state.habits;
  }

  /**
   * Persist the habits namespace.
   * @param {{ habits: Array, logs: Array }} habitsObj
   */
  function setHabitsData(habitsObj) {
    _ensure();
    _state.habits = habitsObj;
    _save();
  }

  // ─── Finance Calc namespace ─────────────────────────────────────

  function getFinanceCalcData() {
    _ensure();
    return _state.financecalc;
  }

  function setFinanceCalcData(calcObj) {
    _ensure();
    _state.financecalc = calcObj;
    _save();
  }

  // ─── Ember namespace ────────────────────────────────────────────

  /**
   * Returns the ember namespace: { sources: [], highlights: [] }
   * sources:    [{ id, title, author, format, importedAt, highlightCount }]
   * highlights: [{ id, sourceId, text, chapter, location, page, color, hash, addedAt }]
   */
  function getEmberData() {
    _ensure();
    return _state.ember;
  }

  /** Persist the ember namespace. */
  function setEmberData(emberObj) {
    _ensure();
    _state.ember = emberObj;
    _save();
  }

  /** Returns ember settings object. Lazy-initialises if missing (backward compat). */
  function getEmberSettings() {
    _ensure();
    if (!_state.ember.settings) {
      _state.ember.settings = JSON.parse(JSON.stringify(DEFAULT_STATE.ember.settings));
    }
    if (!_state.ember.settings.emailJSConfig) {
      _state.ember.settings.emailJSConfig = { serviceId: '', templateId: '', publicKey: '' };
    }
    return _state.ember.settings;
  }

  /** Persist ember settings. */
  function setEmberSettings(settings) {
    _ensure();
    _state.ember.settings = { ...settings };
    _save();
  }

  /** Returns ember streak object. Lazy-initialises if missing (backward compat). */
  function getEmberStreak() {
    _ensure();
    if (!_state.ember.streak) {
      _state.ember.streak = JSON.parse(JSON.stringify(DEFAULT_STATE.ember.streak));
    }
    return _state.ember.streak;
  }

  /** Persist ember streak data. */
  function setEmberStreak(streakData) {
    _ensure();
    _state.ember.streak = { ...streakData };
    _save();
  }

  // ─── Gist credential namespace ──────────────────────────────────

  function getGistCredentials() {
    _ensure();
    return { ..._state.gist };
  }

  function setGistCredentials({ token, id, lastSync }) {
    _ensure();
    if (token   !== undefined) _state.gist.token    = token;
    if (id      !== undefined) _state.gist.id       = id;
    if (lastSync !== undefined) _state.gist.lastSync = lastSync;
    _save();
  }

  function clearGistCredentials() {
    _ensure();
    _state.gist = { token: '', id: '', lastSync: '' };
    // Also wipe the legacy portfolio.settings fields so the one-time migration
    // in _load() cannot restore cleared credentials on the next page load.
    if (_state.portfolio?.settings) {
      _state.portfolio.settings.gistToken = '';
      _state.portfolio.settings.gistId    = '';
    }
    _save();
  }

  // ─── App-level settings namespace ───────────────────────────────

  function getAppSettings() {
    _ensure();
    if (!_state.app) _state.app = { theme: 'dark' };
    return _state.app;
  }

  function setAppSettings(appObj) {
    _ensure();
    _state.app = { ...appObj };
    _save();
  }

  // ─── Utility ────────────────────────────────────────────────────

  /**
   * How much space is the stored state using?
   * V2/V10 fix: was two different formulas (raw.length*2 here vs Blob in settings.js).
   * Consolidated to Blob-based UTF-8 byte count (accurate) in one place.
   * Returns { kb, pct, display } so callers can format as needed.
   * Callers that previously used the string return value should use .display.
   */
  function storageInfo() {
    const raw   = localStorage.getItem(STORAGE_KEY) || '';
    const bytes = new Blob([raw]).size;
    const kb    = (bytes / 1024).toFixed(1);
    const pct   = ((bytes / (5 * 1024 * 1024)) * 100).toFixed(1);
    return { kb, pct, display: `${kb} KB (~${pct}% of 5 MB)` };
  }

  /** Wipe all state and reset to defaults (used for factory reset). */
  function resetAll() {
    _state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    _save();
  }

  // ─── Init ───────────────────────────────────────────────────────

  /** Must be called once on page load before any module accesses state. */
  function init() {
    _load();
    console.info('[State] Loaded from localStorage (' + storageInfo().display + ')');
  }

  /* ── Exports ──────────────────────────────────────────────────── */

  return {
    init,
    getAll,
    setAll,
    mergeAll,
    // Portfolio
    getPortfolioData,
    setPortfolioData,
    getPortfolioSettings,
    setPortfolioSettings,
    // Habits
    getHabitsData,
    setHabitsData,
    // FinanceCalc
    getFinanceCalcData,
    setFinanceCalcData,
    // Ember
    getEmberData,
    setEmberData,
    getEmberSettings,
    setEmberSettings,
    getEmberStreak,
    setEmberStreak,
    // Gist credentials
    getGistCredentials,
    setGistCredentials,
    clearGistCredentials,
    // App-level settings
    getAppSettings,
    setAppSettings,
    // Utility
    storageInfo,
    resetAll,
  };

})();
