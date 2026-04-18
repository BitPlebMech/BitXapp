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
    gist: {
      token: '',
      id: '',
      lastSync: '',
    },
  };

  /* ── Internal state ───────────────────────────────────────────── */

  let _state = null;

  /* ── Private helpers ──────────────────────────────────────────── */

  /** Deep-merge source into target (one level deep for nested objects). */
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
        result[key] = { ...target[key], ...source[key] };
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
        // Extra: merge portfolio.settings deeply (it has many evolving keys)
        if (saved.portfolio?.settings) {
          merged.portfolio.settings = {
            ...DEFAULT_PORTFOLIO_SETTINGS,
            ...saved.portfolio.settings,
          };
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
    // Re-apply settings deep merge (many evolving keys)
    if (incoming.portfolio?.settings) {
      merged.portfolio.settings = {
        ...DEFAULT_PORTFOLIO_SETTINGS,
        ...incoming.portfolio.settings,
      };
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
    _save();
  }

  // ─── Utility ────────────────────────────────────────────────────

  /** How many bytes is the current stored state? Returns human-readable string. */
  function storageInfo() {
    const raw = localStorage.getItem(STORAGE_KEY) || '';
    const kb = (raw.length * 2 / 1024).toFixed(1);
    return `${kb} KB`;
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
    console.info('[State] Loaded from localStorage (' + storageInfo() + ')');
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
    // Gist credentials
    getGistCredentials,
    setGistCredentials,
    clearGistCredentials,
    // Utility
    storageInfo,
    resetAll,
  };

})();
