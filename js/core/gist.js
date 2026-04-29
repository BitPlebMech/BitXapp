'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * CORE / GIST  —  Pure GitHub Gist API layer
 * ═══════════════════════════════════════════════════════════════════
 *
 * Responsible ONLY for:
 *   • Writing a JSON payload to a GitHub Gist (create or update)
 *   • Reading a JSON payload from a GitHub Gist
 *
 * This module has NO UI dependencies — no toast, no DOM queries,
 * no confirmAction calls.  All callers handle their own feedback.
 *
 * Each module that needs sync calls:
 *   App.Gist.save(payload, token, id)   → Promise<{ id, url }>
 *   App.Gist.load(token, id)             → Promise<object>
 *
 * DESIGN RATIONALE
 *   Keeping Gist logic here (not in portfolio.js) means every future
 *   module gets sync capability for free — just add a save/load pair here.
 *   No code duplication, no cross-module imports.
 * ═══════════════════════════════════════════════════════════════════
 */
window.App = window.App || {};

window.App.Gist = (() => {

  // One Gist, three files.  Each module owns its own filename — no cross-module
  // collisions even if two modules save simultaneously to the same Gist.
  const FILENAME        = 'portfolio-data.json';
  const EMBER_FILENAME  = 'ember-highlights.json';
  const HABITS_FILENAME = 'habits-data.json';

  /* ── Portfolio-specific save/load ─────────────────────────────── */

  /**
   * Save only portfolio-namespace data to portfolio-data.json.
   * Writes: { portfolio, gist (credentials scrubbed), _saved }
   *
   * @param {{ portfolio: object, gist: object }} portfolioPayload
   * @param {string} token  - GitHub PAT (gist scope)
   * @param {string} [id]   - Existing Gist ID; omit to create new
   * @returns {Promise<{ id: string, url: string }>}
   */
  async function savePortfolioData(portfolioPayload, token, id) {
    if (!token) throw new Error('GitHub token is required');

    const safe = _scrubToken(portfolioPayload);
    const body = {
      description: 'BiT PleB Dashboard — saved ' + new Date().toISOString(),
      public: false,
      files: {
        [FILENAME]: {
          content: JSON.stringify({ ...safe, _saved: new Date().toISOString() }, null, 2),
        },
      },
    };

    const url    = id ? `https://api.github.com/gists/${id}` : 'https://api.github.com/gists';
    const method = id ? 'PATCH' : 'POST';

    const resp = await fetch(url, {
      method,
      headers: _headers(token),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    return { id: data.id, url: data.html_url };
  }

  /**
   * Load portfolio data from portfolio-data.json in a Gist.
   * Supports both new slim format { portfolio, gist } and old full-blob format.
   *
   * @param {string} token - GitHub PAT
   * @param {string} id    - Gist ID
   * @returns {Promise<object>} Parsed JSON payload
   */
  async function loadPortfolioData(token, id) {
    if (!token) throw new Error('GitHub token is required');
    if (!id)    throw new Error('Gist ID is required');

    const resp = await fetch(`https://api.github.com/gists/${id}`, {
      headers: _headers(token),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const raw  = data.files?.[FILENAME]?.content;
    if (!raw) throw new Error(`"${FILENAME}" not found in this Gist`);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error('Gist file is not valid JSON');
    }

    return parsed;
  }

  /* ── Helpers ──────────────────────────────────────────────────── */

  function _headers(token) {
    return {
      'Authorization': 'token ' + token,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Strip the GitHub token from any object before writing it to a Gist.
   * GitHub scans Gist content and auto-revokes any "ghp_" token it finds,
   * even in private Gists.
   */
  function _scrubToken(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const clone = { ...obj };
    // Strip from top-level gist namespace
    if (clone.gist) {
      clone.gist = { ...clone.gist, token: '' };
    }
    // Strip from portfolio settings (legacy location)
    if (clone.portfolio?.settings) {
      clone.portfolio = {
        ...clone.portfolio,
        settings: { ...clone.portfolio.settings, gistToken: '' },
      };
    }
    return clone;
  }

  /* ── Public API (legacy) ──────────────────────────────────────────
   *
   * save() and load() are kept here as dead code for backward compatibility.
   * They are NOT exported — use the module-specific functions above instead.
   * Removing the bodies would make git blame harder; keeping them documents
   * the old single-file approach that was replaced by per-module functions.
   * ─────────────────────────────────────────────────────────────── */

  /**
   * @deprecated  Use savePortfolioData() instead.
   * Kept as dead code — not exported.
   */
  async function save(payload, token, id) {
    if (!token) throw new Error('GitHub token is required');

    const safePayload = _scrubToken(payload);
    const body = {
      description: 'BiT PleB Dashboard — saved ' + new Date().toISOString(),
      public: false,
      files: {
        [FILENAME]: {
          content: JSON.stringify({ ...safePayload, _saved: new Date().toISOString() }, null, 2),
        },
      },
    };

    const url    = id ? `https://api.github.com/gists/${id}` : 'https://api.github.com/gists';
    const method = id ? 'PATCH' : 'POST';

    const resp = await fetch(url, {
      method,
      headers: _headers(token),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    return {
      id:  data.id,
      url: data.html_url,
    };
  }

  /**
   * @deprecated  Use loadPortfolioData() or loadAllFiles() instead.
   * Kept as dead code — not exported.
   */
  async function load(token, id) {
    if (!token) throw new Error('GitHub token is required');
    if (!id)    throw new Error('Gist ID is required');

    const resp = await fetch(`https://api.github.com/gists/${id}`, {
      headers: _headers(token),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const raw  = data.files?.[FILENAME]?.content;
    if (!raw) throw new Error(`"${FILENAME}" not found in this Gist`);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error('Gist file is not valid JSON');
    }

    return parsed;
  }

  /**
   * Save Ember-specific data to a dedicated `ember-highlights.json` file
   * within the same Gist (creates a new file alongside portfolio-data.json).
   *
   * @param {{ highlights, settings, streak }} emberData
   * @param {string} token  - GitHub PAT (gist scope)
   * @param {string} [id]   - Existing Gist ID; omit to create new
   * @returns {Promise<{ id: string, url: string }>}
   */
  async function saveEmberData(emberData, token, id) {
    if (!token) throw new Error('GitHub token is required');

    const payload = {
      sources:    emberData.sources    || [],   // ← books; was missing, caused empty Books tab
      highlights: emberData.highlights || [],
      settings:   emberData.settings   || {},
      streak:     emberData.streak     || {},
      metadata: {
        version:  '2.1',
        lastSync: new Date().toISOString(),
      },
    };

    const body = {
      description: 'Ember Highlights — saved ' + new Date().toISOString(),
      public: false,
      files: {
        [EMBER_FILENAME]: {
          content: JSON.stringify(payload, null, 2),
        },
      },
    };

    const url    = id ? `https://api.github.com/gists/${id}` : 'https://api.github.com/gists';
    const method = id ? 'PATCH' : 'POST';

    const resp = await fetch(url, {
      method,
      headers: _headers(token),
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    return { id: data.id, url: data.html_url };
  }

  /**
   * Load Ember data from `ember-highlights.json` in a Gist.
   * Returns null if the file does not exist yet (first save).
   *
   * @param {string} token - GitHub PAT
   * @param {string} id    - Gist ID
   * @returns {Promise<object|null>}
   */
  async function loadEmberData(token, id) {
    if (!token) throw new Error('GitHub token is required');
    if (!id)    throw new Error('Gist ID is required');

    const resp = await fetch(`https://api.github.com/gists/${id}`, {
      headers: _headers(token),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const raw  = data.files?.[EMBER_FILENAME]?.content;
    if (!raw) return null; // File doesn't exist yet

    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error('Ember Gist file is not valid JSON');
    }
  }

  /* ── Habits-specific save/load ───────────────────────────────── */

  /**
   * Save Habits data to a dedicated `habits-data.json` file in the Gist.
   *
   * @param {{ habits: Array, logs: Array }} habitsData
   * @param {string} token  - GitHub PAT (gist scope)
   * @param {string} id     - Existing Gist ID to update
   * @returns {Promise<{ id: string, url: string }>}
   */
  async function saveHabitsData(habitsData, token, id) {
    if (!token) throw new Error('GitHub token is required');

    const payload = {
      habits: habitsData.habits || [],
      logs:   habitsData.logs   || [],
      metadata: {
        version:  '1.0',
        lastSync: new Date().toISOString(),
      },
    };

    const url    = id ? `https://api.github.com/gists/${id}` : 'https://api.github.com/gists';
    const method = id ? 'PATCH' : 'POST';

    const resp = await fetch(url, {
      method,
      headers: _headers(token),
      body: JSON.stringify({
        description: 'Habits Data — saved ' + new Date().toISOString(),
        public: false,
        files: {
          [HABITS_FILENAME]: {
            content: JSON.stringify(payload, null, 2),
          },
        },
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    return { id: data.id, url: data.html_url };
  }

  /**
   * Load Habits data from `habits-data.json` in a Gist.
   * Returns null if the file does not exist yet (first save).
   *
   * @param {string} token - GitHub PAT
   * @param {string} id    - Gist ID
   * @returns {Promise<object|null>}
   */
  async function loadHabitsData(token, id) {
    if (!token) throw new Error('GitHub token is required');
    if (!id)    throw new Error('Gist ID is required');

    const resp = await fetch(`https://api.github.com/gists/${id}`, {
      headers: _headers(token),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const raw  = data.files?.[HABITS_FILENAME]?.content;
    if (!raw) return null; // File doesn't exist yet — first save

    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error('Habits Gist file is not valid JSON');
    }
  }

  /* ── Unified loader — single Gist fetch, all files extracted ──── */

  /**
   * Fetch the Gist ONCE and extract all module files.
   * Returns { portfolio, ember, habits } where each value is:
   *   - parsed JSON object if the file exists
   *   - null if the file doesn't exist yet (first save)
   *
   * This replaces calling loadPortfolioData + loadEmberData + loadHabitsData
   * in parallel (which made 3 identical HTTP requests).
   *
   * @param {string} token - GitHub PAT
   * @param {string} id    - Gist ID
   * @returns {Promise<{ portfolio: object, ember: object|null, habits: object|null }>}
   */
  async function loadAllFiles(token, id) {
    if (!token) throw new Error('GitHub token is required');
    if (!id)    throw new Error('Gist ID is required');

    const resp = await fetch(`https://api.github.com/gists/${id}`, {
      headers: _headers(token),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();

    // Extract portfolio (required — throws if missing)
    const portfolioRaw = data.files?.[FILENAME]?.content;
    if (!portfolioRaw) throw new Error(`"${FILENAME}" not found in this Gist`);
    let portfolio;
    try { portfolio = JSON.parse(portfolioRaw); }
    catch { throw new Error('portfolio-data.json is not valid JSON'); }

    // Extract ember (optional — null if not present yet)
    let ember = null;
    const emberRaw = data.files?.[EMBER_FILENAME]?.content;
    if (emberRaw) {
      try { ember = JSON.parse(emberRaw); }
      catch { throw new Error('ember-highlights.json is not valid JSON'); }
    }

    // Extract habits (optional — null if not present yet)
    let habits = null;
    const habitsRaw = data.files?.[HABITS_FILENAME]?.content;
    if (habitsRaw) {
      try { habits = JSON.parse(habitsRaw); }
      catch { throw new Error('habits-data.json is not valid JSON'); }
    }

    return { portfolio, ember, habits };
  }

  /* ── Exports ──────────────────────────────────────────────────── */

  return {
    savePortfolioData, loadPortfolioData,
    saveEmberData,     loadEmberData,
    saveHabitsData,    loadHabitsData,
    loadAllFiles,
  };

})();
