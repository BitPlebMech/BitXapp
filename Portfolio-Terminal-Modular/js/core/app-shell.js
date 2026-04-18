'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * CORE / APP-SHELL  —  Top-level routing and shell initialisation
 * ═══════════════════════════════════════════════════════════════════
 *
 * Responsible ONLY for:
 *   • Rendering the sidebar navigation
 *   • Switching between top-level modules (portfolio / habits / calc)
 *   • Bootstrapping each module in correct order on page load
 *   • Global keyboard shortcut registration
 *
 * This module does NOT contain any business logic.
 * Each module is responsible for its own init() call after the shell
 * has made its pane visible.
 * ═══════════════════════════════════════════════════════════════════
 */
window.App = window.App || {};

window.App.Shell = (() => {

  /* ── Module registry ──────────────────────────────────────────── */

  /**
   * Registered modules.  Each entry:
   *   { id, label, icon, init }
   *   id:    matches the DOM id "mod-{id}" and sidebar button "sb-{id}"
   *   label: tooltip text shown on hover
   *   icon:  SVG string or emoji for the sidebar button
   *   init:  function to call the first time the module is activated
   */
  const _modules = [];
  const _initialised = new Set();
  let _active = null;

  /* ── DOM helpers ──────────────────────────────────────────────── */

  function el(id) { return document.getElementById(id); }

  /* ── Sidebar rendering ────────────────────────────────────────── */

  /**
   * Inject sidebar nav buttons based on registered modules.
   * The sidebar element (#sidebar-nav) must exist in index.html.
   */
  function _renderSidebar() {
    const nav = el('sidebar-nav');
    if (!nav) return;

    // Generate sidebar in the same .sb-icon / .sb-icon-btn format as the reference app
    nav.innerHTML = _modules.map(mod => `
      <div
        id="sb-${mod.id}"
        class="sb-icon${mod.soon ? ' sb-soon' : ''}"
        data-module="${mod.id}"
      >
        <div class="sb-icon-btn">${mod.icon}</div>
        <div class="sb-icon-lbl">${mod.label}</div>
        <span class="sb-tip">${mod.label}${mod.soon ? ' <span style="opacity:.55;font-size:9px;text-transform:uppercase;letter-spacing:.06em">soon</span>' : ''}</span>
      </div>
    `).join('') + `
      <div class="sb-spacer"></div>
      <div class="sb-icon" id="sb-gist-save" title="Save to Gist">
        <div class="sb-icon-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
          </svg>
          <div class="sb-gist-dot gist-unsaved-dot" style="display:none"></div>
        </div>
        <div class="sb-icon-lbl">Gist Sync</div>
        <span class="sb-tip">Save to GitHub Gist</span>
      </div>
    `;

    // Attach click handlers to non-soon module icons
    nav.querySelectorAll('.sb-icon[data-module]').forEach(icon => {
      if (!icon.classList.contains('sb-soon')) {
        icon.addEventListener('click', () => switchModule(icon.dataset.module));
      }
    });

    const gistBtn = el('sb-gist-save');
    if (gistBtn) {
      gistBtn.addEventListener('click', () => {
        if (_active && window.App[_capitalise(_active)]?.triggerGistSave) {
          window.App[_capitalise(_active)].triggerGistSave();
        } else if (window.App.Portfolio?.triggerGistSave) {
          window.App.Portfolio.triggerGistSave();
        }
      });
    }
  }

  function _capitalise(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /* ── Module switching ─────────────────────────────────────────── */

  /**
   * Activate a top-level module pane and deactivate all others.
   * Lazily calls each module's init() the first time it is shown.
   *
   * @param {string} modId - Module ID (matches registration id)
   */
  function switchModule(modId) {
    // Update pane visibility — uses 'module-pane' class to match reference CSS
    _modules.forEach(mod => {
      const pane = el('mod-' + mod.id);
      if (pane) pane.classList.toggle('active', mod.id === modId);
    });

    // Update sidebar active state on .sb-icon elements
    _modules.forEach(mod => {
      const icon = el('sb-' + mod.id);
      if (icon) icon.classList.toggle('active', mod.id === modId);
    });

    _active = modId;

    // Lazy-init the module on first visit
    if (!_initialised.has(modId)) {
      const mod = _modules.find(m => m.id === modId);
      if (mod?.init) {
        try {
          mod.init();
          console.info(`[Shell] Module "${modId}" initialised`);
        } catch (e) {
          console.error(`[Shell] Module "${modId}" init failed:`, e);
        }
      }
      _initialised.add(modId);
    }
  }

  /* ── Module registration ──────────────────────────────────────── */

  /**
   * Register a module with the shell.
   * Call this from each module file before App.Shell.init().
   *
   * @param {{ id: string, label: string, icon: string, init: function }} config
   */
  function registerModule(config) {
    if (_modules.find(m => m.id === config.id)) {
      console.warn(`[Shell] Module "${config.id}" already registered`);
      return;
    }
    _modules.push(config);
  }

  /* ── Keyboard shortcuts ───────────────────────────────────────── */

  function _setupKeyboard() {
    document.addEventListener('keydown', e => {
      // Alt+1..9 — switch modules by index
      if (e.altKey && e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        if (_modules[idx]) {
          switchModule(_modules[idx].id);
          e.preventDefault();
        }
      }

      // Escape — propagate to active module (close drawers, modals, etc.)
      if (e.key === 'Escape') {
        const modObj = _modules.find(m => m.id === _active);
        if (modObj && window.App[_capitalise(modObj.id)]?.handleEscape) {
          window.App[_capitalise(modObj.id)].handleEscape();
        }
      }
    });
  }

  /* ── Theme application ────────────────────────────────────────── */

  /**
   * Apply the saved theme to <html data-theme="...">
   * Called once on startup; modules may call this again after settings change.
   */
  function applyTheme() {
    const settings = window.App.State?.getPortfolioSettings?.() || {};
    const theme = settings.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }

  /* ── Initialisation ───────────────────────────────────────────── */

  /**
   * Boot the shell:
   *   1. Init state (loads localStorage)
   *   2. Apply theme
   *   3. Render sidebar
   *   4. Activate the default module
   *
   * @param {string} [defaultModule='portfolio'] - Module to show on load
   */
  function init(defaultModule = 'portfolio') {
    // State must already be initialised before shell runs
    if (!window.App.State) {
      console.error('[Shell] App.State not found — ensure state.js loads before app-shell.js');
      return;
    }

    applyTheme();
    _renderSidebar();
    _setupKeyboard();

    // Activate default module
    switchModule(defaultModule);

    console.info('[Shell] Ready. Active module:', defaultModule);
  }

  /* ── Exports ──────────────────────────────────────────────────── */

  return {
    registerModule,
    switchModule,
    applyTheme,
    init,
    /** Returns the currently active module id */
    get active() { return _active; },
  };

})();
