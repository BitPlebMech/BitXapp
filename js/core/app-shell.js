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

    // Separate regular modules from the settings module (pinned to bottom)
    const regularMods  = _modules.filter(m => m.id !== 'settings');
    const settingsMod  = _modules.find(m => m.id === 'settings');

    const modHtml = regularMods.map(mod => `
      <div
        id="sb-${mod.id}"
        class="sb-icon${mod.soon ? ' sb-soon' : ''}"
        data-module="${mod.id}"
      >
        <div class="sb-icon-btn">${mod.icon}</div>
        <div class="sb-icon-lbl">${mod.label}</div>
        <span class="sb-tip">${mod.label}${mod.soon ? ' <span style="opacity:.55;font-size:9px;text-transform:uppercase;letter-spacing:.06em">soon</span>' : ''}</span>
      </div>
    `).join('');

    const settingsHtml = settingsMod ? `
      <div class="sb-divider"></div>
      <div
        id="sb-settings"
        class="sb-icon"
        data-module="settings"
      >
        <div class="sb-icon-btn">${settingsMod.icon}</div>
        <div class="sb-icon-lbl">Settings</div>
        <span class="sb-tip">Settings</span>
      </div>
    ` : '';

    nav.innerHTML = modHtml + `<div class="sb-spacer"></div>` + settingsHtml;

    // Attach click handlers to all non-soon module icons
    nav.querySelectorAll('.sb-icon[data-module]').forEach(icon => {
      if (!icon.classList.contains('sb-soon')) {
        icon.addEventListener('click', () => switchModule(icon.dataset.module));
      }
    });
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
          _initialised.add(modId);  // BUG-03 fix: only mark as initialised on success
          console.info(`[Shell] Module "${modId}" initialised`);
        } catch (e) {
          console.error(`[Shell] Module "${modId}" init failed — will retry on next visit:`, e);
          // NOT added to _initialised so the user can retry by switching away and back
        }
      } else {
        _initialised.add(modId);  // modules with no init() are always "ready"
      }
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

  /* ── Toast ────────────────────────────────────────────────────── */

  /**
   * Display a transient toast notification.
   * This is the canonical implementation — all modules call App.Shell.toast().
   *
   * @param {string} msg   - Message to display
   * @param {string} type  - 'info' | 'success' | 'warn' | 'error'
   */
  function toast(msg, type = 'info') {
    const container = el('toast-container') || (() => {
      const div = Object.assign(document.createElement('div'), { id: 'toast-container' });
      Object.assign(div.style, {
        position: 'fixed', bottom: '24px', right: '24px', zIndex: '9999',
        display: 'flex', flexDirection: 'column', gap: '8px',
      });
      document.body.appendChild(div);
      return div;
    })();
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
  }

  /* ── Confirm dialog ───────────────────────────────────────────── */

  /**
   * Open the shared confirm dialog.
   * This is the canonical implementation — all modules call App.Shell.confirmAction().
   *
   * @param {string}   title        - Dialog heading
   * @param {string}   body         - Dialog body message
   * @param {string}   icon         - Emoji or text icon
   * @param {string}   confirmLabel - Label for the confirm button
   * @param {Function} onConfirm    - Callback executed when user confirms
   */
  let _confirmCallback = null;

  function confirmAction(title, body, icon, confirmLabel, onConfirm) {
    _confirmCallback = onConfirm;
    const cdIcon    = document.getElementById('cd-icon');
    const cdTitle   = document.getElementById('cd-title');
    const cdBody    = document.getElementById('cd-body');
    const cdConfirm = document.getElementById('cd-confirm');
    if (cdIcon)    cdIcon.textContent    = icon || '⚠️';
    if (cdTitle)   cdTitle.textContent   = title;
    if (cdBody)    cdBody.textContent    = body;
    if (cdConfirm) cdConfirm.textContent = confirmLabel || 'Confirm';
    document.getElementById('confirm-dialog')?.classList.add('open');
  }

  /** Called when the user clicks the confirm button in the dialog. */
  function confirmDo() {
    document.getElementById('confirm-dialog')?.classList.remove('open');
    if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
  }

  /** Called when the user clicks cancel or closes the dialog. */
  function confirmCancel() {
    document.getElementById('confirm-dialog')?.classList.remove('open');
    _confirmCallback = null;
  }

  /* ── Gist sync ────────────────────────────────────────────────────
   *
   * Shell-owned canonical save. Every module — current and future —
   * benefits automatically via the sidebar Gist button.
   * Portfolio keeps its own richer version for its header button
   * (status indicators, silent mode); this handles everything else.
   * ─────────────────────────────────────────────────────────────── */

  let _gistSaveInProgress = false;

  async function triggerGistSave() {
    if (_gistSaveInProgress) {
      toast('Save already in progress…', 'info');
      return;
    }
    const creds = window.App.State.getGistCredentials();
    if (!creds.token) {
      toast('Add your GitHub token in Settings → Gist Sync', 'error');
      return;
    }
    if (!creds.id) {
      confirmAction(
        'Create a new Gist?',
        'No Gist ID set. This will create a brand-new Gist. If you already have one, paste its ID in Settings first.',
        '☁️', 'Create new Gist',
        () => _doGistSave(creds.token, '')
      );
      return;
    }
    _doGistSave(creds.token, creds.id);
  }

  async function _doGistSave(token, id) {
    _gistSaveInProgress = true;
    try {
      toast('Saving to Gist…', 'info');

      // 1. portfolio-data.json
      const portfolioPayload = {
        portfolio: window.App.State.getPortfolioData(),
        gist:      window.App.State.getGistCredentials(),
      };
      const result = await window.App.Gist.savePortfolioData(portfolioPayload, token, id);
      const gistId = result.id || id;

      // 2. ember-highlights.json
      const emberData = window.App.State.getEmberData?.() || {};
      await window.App.Gist.saveEmberData({
        sources:    emberData.sources    || [],   // ← books
        highlights: emberData.highlights || [],
        settings:   window.App.State.getEmberSettings?.() || {},
        streak:     window.App.State.getEmberStreak?.()   || {},
      }, token, gistId);

      // 3. habits-data.json
      const habitsData = window.App.State.getHabitsData?.() || {};
      await window.App.Gist.saveHabitsData({
        habits: habitsData.habits || [],
        logs:   habitsData.logs   || [],
      }, token, gistId);

      if (!id) window.App.State.setGistCredentials({ id: gistId });
      window.App.State.setGistCredentials({ lastSync: new Date().toISOString() });
      toast('Saved to Gist ✓  (portfolio + ember + habits)', 'success');
    } catch (e) {
      toast('Gist save failed: ' + e.message, 'error');
    } finally {
      _gistSaveInProgress = false;
    }
  }

  /* ── Gist load ────────────────────────────────────────────────────
   *
   * Shell-owned canonical load — fetches both portfolio-data.json and
   * ember-highlights.json in parallel and merges all namespaces into state.
   * Any module can call App.Shell.triggerGistLoad() to restore full state.
   * ─────────────────────────────────────────────────────────────── */

  let _gistLoadInProgress = false;

  async function triggerGistLoad() {
    if (_gistLoadInProgress) {
      toast('Load already in progress…', 'info');
      return;
    }
    const creds = window.App.State.getGistCredentials();
    if (!creds.token) {
      toast('Add your GitHub token in Settings → Gist Sync', 'error');
      return;
    }
    if (!creds.id) {
      toast('Enter a Gist ID in Settings → Gist Sync first', 'error');
      return;
    }
    _gistLoadInProgress = true;
    try {
      toast('Loading from Gist…', 'info');
      // Fetch all three files in parallel — ember/habits may not exist yet (null = skip)
      const [portfolioParsed, emberParsed, habitsParsed] = await Promise.all([
        window.App.Gist.loadPortfolioData(creds.token, creds.id),
        window.App.Gist.loadEmberData(creds.token, creds.id).catch(() => null),
        window.App.Gist.loadHabitsData(creds.token, creds.id).catch(() => null),
      ]);

      const txCount     = portfolioParsed.portfolio?.transactions?.length || portfolioParsed.transactions?.length || 0;
      const hlCount     = emberParsed?.highlights?.length || 0;
      const habitCount  = habitsParsed?.habits?.length || 0;
      const detail = [
        `${txCount} transaction${txCount !== 1 ? 's' : ''}`,
        hlCount     ? `${hlCount} Ember highlight${hlCount !== 1 ? 's' : ''}`   : '',
        habitCount  ? `${habitCount} habit${habitCount !== 1 ? 's' : ''}`       : '',
      ].filter(Boolean).join(' + ');

      confirmAction(
        'Load from Gist?',
        `Replace all local data with: ${detail}. This cannot be undone.`,
        '☁️', 'Load everything',
        () => {
          const { token: tok, id: gid } = window.App.State.getGistCredentials();

          // Restore portfolio namespace
          if (portfolioParsed.portfolio) window.App.State.mergeAll(portfolioParsed);
          // Always restore credentials (scrubbed before saving)
          window.App.State.setGistCredentials({ token: tok, id: gid });

          // Restore Ember from ember-highlights.json
          if (emberParsed) {
            let emberHighlights = emberParsed.highlights || [];
            let emberSources    = emberParsed.sources    || [];

            // Legacy recovery: Gist was saved before sources were included (old bug).
            // Reconstruct synthetic stubs from sourceIds in highlights so the Books
            // tab is not left blank after load. A re-import will overwrite stubs.
            if (emberSources.length === 0 && emberHighlights.length > 0) {
              const seenIds = new Map();
              const palette = window.App.ThemeTokens?.SPINE_PALETTE || [
                '#E86A4A','#4AB5E8','#A8C97F','#9B7FE8','#E8A14A',
                '#4AE8C9','#E87F9B','#7FA8E8','#5BD178','#D17FE8',
              ];
              for (const hl of emberHighlights) {
                if (hl.sourceId && !seenIds.has(hl.sourceId)) {
                  seenIds.set(hl.sourceId, {
                    id:             hl.sourceId,
                    title:          `Book (${hl.sourceId.slice(-6)})`,
                    author:         '',
                    format:         'kindle',
                    color:          palette[seenIds.size % palette.length],
                    importedAt:     hl.addedAt || new Date().toISOString(),
                    lastImportAt:   hl.addedAt || new Date().toISOString(),
                    highlightCount: 0,
                  });
                }
              }
              for (const hl of emberHighlights) {
                const src = seenIds.get(hl.sourceId);
                if (src) src.highlightCount++;
              }
              emberSources = Array.from(seenIds.values());
            }

            const currentEmber = window.App.State.getEmberData?.() || {};
            window.App.State.setEmberData?.({
              ...currentEmber,
              highlights: emberHighlights,
              sources:    emberSources,
            });
            if (emberParsed.settings) window.App.State.setEmberSettings?.(emberParsed.settings);
            if (emberParsed.streak)   window.App.State.setEmberStreak?.(emberParsed.streak);
          }

          // Restore Habits from habits-data.json
          if (habitsParsed) {
            window.App.State.setHabitsData?.({
              habits: habitsParsed.habits || [],
              logs:   habitsParsed.logs   || [],
            });
          }

          // Re-render: call each module's public render() so we do not re-run
          // init() (which would duplicate event listeners).
          // V14 fix: was calling App.EmberUI / App.HabitsUI directly (Shell
          // reaching into module sub-layers). Now routes through the module's
          // own public render() which each module added to its exports.
          if (window.App.Ember?.render)   window.App.Ember.render();
          if (window.App.Habits?.render)  window.App.Habits.render();
          // Re-initialise the active pane in case it is Portfolio or another module
          const activeId = _active;
          if (activeId && activeId !== 'ember' && activeId !== 'habits') {
            _initialised.delete(activeId);
            switchModule(activeId);
          }

          window.App.State.setGistCredentials({ lastSync: new Date().toISOString() });
          toast(`Loaded from Gist ✓ — ${detail}`, 'success');
        }
      );
    } catch (e) {
      toast('Gist load failed: ' + e.message, 'error');
    } finally {
      _gistLoadInProgress = false;
    }
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

  /**
   * Toggle between dark and light theme.
   * V3 fix: Shell now owns toggleTheme so settings.js can call App.Shell.toggleTheme()
   * instead of App.Portfolio.toggleTheme() (cross-module call).
   * Theme storage stays in portfolio.settings.theme for now (V9 is the full migration).
   */
  function toggleTheme() {
    const s    = window.App.State?.getPortfolioData?.() || {};
    const next = (s.settings?.theme || 'dark') === 'dark' ? 'light' : 'dark';
    if (s.settings) {
      s.settings.theme = next;
      window.App.State.setPortfolioData(s);
    }
    applyTheme();
    // Sync the theme-toggle icon in the Portfolio header if it is in the DOM
    const sun  = document.getElementById('theme-icon-sun');
    const moon = document.getElementById('theme-icon-moon');
    if (sun)  sun.style.display  = next === 'dark'  ? '' : 'none';
    if (moon) moon.style.display = next === 'light' ? '' : 'none';
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
    toggleTheme,   // V3 fix: Shell owns theme toggling; settings.js calls this instead of App.Portfolio.toggleTheme()
    init,
    // App-level UI services — all modules should call these instead of each other
    toast,
    confirmAction,
    confirmDo,
    confirmCancel,
    // App-level Gist sync — works for every module automatically
    triggerGistSave,
    triggerGistLoad,
    /** Returns the currently active module id */
    get active() { return _active; },
  };

})();
