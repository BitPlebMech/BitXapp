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
 *   module (habits, financecalc, …) gets sync capability for free —
 *   just call App.Gist.save() with the full state payload.
 *   No code duplication, no cross-module imports.
 * ═══════════════════════════════════════════════════════════════════
 */
window.App = window.App || {};

window.App.Gist = (() => {

  const FILENAME = 'portfolio-data.json';

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

  /* ── Public API ───────────────────────────────────────────────── */

  /**
   * Save a JSON payload to a GitHub Gist.
   *
   * @param {object} payload  - The data to persist (full App.State.getAll() recommended)
   * @param {string} token    - GitHub Personal Access Token (gist scope)
   * @param {string} [id]     - Existing Gist ID to update; omit to create a new Gist
   * @returns {Promise<{ id: string, url: string }>}
   * @throws {Error} on network failure or bad credentials
   */
  async function save(payload, token, id) {
    if (!token) throw new Error('GitHub token is required');

    const safePayload = _scrubToken(payload);
    const body = {
      description: 'Portfolio Terminal — saved ' + new Date().toISOString(),
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
   * Load a JSON payload from a GitHub Gist.
   *
   * @param {string} token - GitHub Personal Access Token
   * @param {string} id    - Gist ID to load from
   * @returns {Promise<object>} Parsed JSON payload
   * @throws {Error} if Gist not found, file missing, or JSON invalid
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

  /* ── Exports ──────────────────────────────────────────────────── */

  return { save, load };

})();
