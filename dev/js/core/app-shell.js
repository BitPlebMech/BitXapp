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

  /* ── Action registry ──────────────────────────────────────────────
   *
   * Modules register named actions at init time so that app-level code
   * (Shell, Settings) can invoke module behaviour without direct coupling.
   *
   * Pattern:
   *   // In module init():
   *   App.Shell.registerAction('portfolio:exportCSV', exportPortfolioCSV);
   *
   *   // In settings.js or Shell:
   *   App.Shell.runAction('portfolio:exportCSV');
   *
   * This replaces all window.App.Portfolio.xxx() / window.App.Habits.xxx()
   * calls in settings.js (Rule 3 violations).
   * ─────────────────────────────────────────────────────────────── */

  const _actions = {};

  /**
   * Register a named action.  Called from each module's init().
   * @param {string}   id  — namespaced action id, e.g. 'portfolio:exportCSV'
   * @param {Function} fn  — the function to invoke
   */
  function registerAction(id, fn) {
    if (typeof fn !== 'function') {
      console.warn(`[Shell] registerAction: "${id}" is not a function`);
      return;
    }
    _actions[id] = fn;
  }

  /**
   * Run a registered action by id.  Fails silently with a warning if not registered.
   * @param {string} id     — action id
   * @param {...*}   args   — forwarded to the registered function
   * @returns {*} return value of the action function, or undefined if not found
   */
  function runAction(id, ...args) {
    if (!_actions[id]) {
      console.warn(`[Shell] runAction: "${id}" is not registered — module may not be initialised yet`);
      return undefined;
    }
    return _actions[id](...args);
  }

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

  /* ── Shared Gist restore logic ───────────────────────────────────
   *
   * Extracted from triggerGistLoad/triggerGistLoadSilent to eliminate
   * duplication.  Both call this after fetching and (optionally) confirming.
   * ─────────────────────────────────────────────────────────────── */

  function _restoreFromGist(portfolioParsed, emberParsed, habitsParsed) {
    const { token: tok, id: gid } = window.App.State.getGistCredentials();

    // Restore portfolio namespace
    if (portfolioParsed.portfolio) window.App.State.mergeAll(portfolioParsed);
    // Always restore credentials (scrubbed before saving)
    window.App.State.setGistCredentials({ token: tok, id: gid });

    // Restore Ember from ember-highlights.json
    if (emberParsed) {
      let emberHighlights = emberParsed.highlights || [];
      let emberSources    = emberParsed.sources    || [];

      // Legacy recovery: Gist was saved before sources were included.
      // Reconstruct synthetic stubs from sourceIds in highlights so the Books
      // tab is not left blank after load.
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

    // Re-render all loaded modules
    if (window.App.Ember?.render)  window.App.Ember.render();
    if (window.App.Habits?.render) window.App.Habits.render();
    const activeId = _active;
    if (activeId && activeId !== 'ember' && activeId !== 'habits') {
      _initialised.delete(activeId);
      switchModule(activeId);
    }

    window.App.State.setGistCredentials({ lastSync: new Date().toISOString() });
  }

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

      // Single fetch — all three files extracted from one API call
      const { portfolio: portfolioParsed, ember: emberParsed, habits: habitsParsed }
        = await window.App.Gist.loadAllFiles(creds.token, creds.id);

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
          _restoreFromGist(portfolioParsed, emberParsed, habitsParsed);
          toast(`Loaded from Gist ✓ — ${detail}`, 'success');
        }
      );
    } catch (e) {
      toast('Gist load failed: ' + e.message, 'error');
    } finally {
      _gistLoadInProgress = false;
    }
  }

  /* ── Gist load (silent) ──────────────────────────────────────────
   *
   * Same as triggerGistLoad() but skips the confirm dialog.
   * Used by the sign-in flow: credentials are already entered by the user,
   * so we load immediately without asking for confirmation.
   * ─────────────────────────────────────────────────────────────── */

  async function triggerGistLoadSilent() {
    if (_gistLoadInProgress) {
      toast('Load already in progress…', 'info');
      return;
    }
    const creds = window.App.State.getGistCredentials();
    if (!creds.token) { toast('GitHub token is required', 'error'); return; }
    if (!creds.id)    { toast('Gist ID is required', 'error'); return; }

    _gistLoadInProgress = true;
    try {
      toast('Signing in…', 'info');

      // Single fetch — all three files extracted from one API call
      const { portfolio: portfolioParsed, ember: emberParsed, habits: habitsParsed }
        = await window.App.Gist.loadAllFiles(creds.token, creds.id);

      _restoreFromGist(portfolioParsed, emberParsed, habitsParsed);

      const txCount    = portfolioParsed.portfolio?.transactions?.length || portfolioParsed.transactions?.length || 0;
      const hlCount    = emberParsed?.highlights?.length || 0;
      const habitCount = habitsParsed?.habits?.length || 0;
      const detail = [
        `${txCount} transaction${txCount !== 1 ? 's' : ''}`,
        hlCount     ? `${hlCount} Ember highlight${hlCount !== 1 ? 's' : ''}` : '',
        habitCount  ? `${habitCount} habit${habitCount !== 1 ? 's' : ''}`     : '',
      ].filter(Boolean).join(' + ');

      toast(`Signed in ✓ — ${detail}`, 'success');
    } catch (e) {
      toast('Sign-in failed: ' + e.message, 'error');
      throw e;
    } finally {
      _gistLoadInProgress = false;
    }
  }

  /* ── Credentials / Lock screen ───────────────────────────────────
   *
   * App-level sign-in popup.  Owned by the Shell — not by any module.
   * Any module that needs to gate on credentials calls
   *   App.Shell.initLockScreen()   — show popup if no creds stored
   *   App.Shell.openCredentialsPopup()
   *   App.Shell.signOut()
   * ─────────────────────────────────────────────────────────────── */

  let _credCallback = null;

  /**
   * Show the credentials popup if token+id are not stored.
   * Called once from each module that requires authentication (currently Portfolio).
   */
  function initLockScreen() {
    const creds = window.App.State.getGistCredentials();
    if (!(creds.token || '').trim() || !(creds.id || '').trim()) {
      openCredentialsPopup(() => {});
    }
  }

  function openCredentialsPopup(callback) {
    _credCallback = callback;
    const lockToken  = el('lock-token');
    const lockGistId = el('lock-gist-id');
    const hint       = el('cred-hint');
    if (lockToken)   lockToken.value   = '';
    if (lockGistId)  lockGistId.value  = '';
    if (hint) { hint.textContent = ''; hint.style.color = 'var(--muted)'; }
    el('cred-ov')?.classList.add('open');
    setTimeout(() => el('lock-token')?.focus(), 80);
  }

  function saveCredentials() {
    const token  = (el('lock-token')?.value  || '').trim();
    const gistId = (el('lock-gist-id')?.value || '').trim();
    const hint   = el('cred-hint');
    if (!token)  { if (hint) { hint.textContent = 'GitHub token is required'; hint.style.color = 'var(--red)'; } return; }
    if (!gistId) { if (hint) { hint.textContent = 'Gist ID is required';      hint.style.color = 'var(--red)'; } return; }

    window.App.State.setGistCredentials({ token, id: gistId });
    el('cred-ov')?.classList.remove('open');

    // Load all Gist files silently — no confirm dialog needed, user just signed in
    triggerGistLoadSilent().then(() => {
      if (_credCallback) { _credCallback(); _credCallback = null; }
    }).catch(e => {
      toast('Sign-in failed: ' + e.message, 'error');
    });
  }

  /**
   * Enter demo mode — clear credentials, reset all modules to their seed/mock
   * data, close the popup.  Portfolio seed and Habits seed are loaded via the
   * action registry so Shell does not directly couple to module internals.
   */
  function enterDemoMode() {
    window.App.State.clearGistCredentials();

    // Reset each module via the action registry (modules register these in init)
    runAction('portfolio:clearToSampleData');

    // Habits seed data
    const habitsSeed = window.App.Habits?.Data?.buildSeedData?.();
    window.App.State.setHabitsData(habitsSeed || { habits: [], logs: [] });

    // Ember — no mock data exists; reset to empty
    window.App.State.setEmberData({ sources: [], highlights: [] });
    window.App.State.setEmberSettings(window.App.State.getEmberSettings());

    // Re-render any already-initialised modules
    if (window.App.Habits?.render)  window.App.Habits.render();
    if (window.App.Ember?.render)   window.App.Ember.render();

    el('cred-ov')?.classList.remove('open');
    toast('Demo mode — sample data loaded', 'info');
    if (_credCallback) { _credCallback(); _credCallback = null; }
  }

  function closeCredentialsPopup() {
    el('cred-ov')?.classList.remove('open');
    // No credentials entered — fall back to demo/sample data
    const creds  = window.App.State.getGistCredentials();
    const hasAuth = (creds.token || '').trim() && (creds.id || '').trim();
    if (!hasAuth) {
      runAction('portfolio:clearToSampleData');
    }
    if (_credCallback) { _credCallback(); _credCallback = null; }
  }

  /**
   * Sign out — clears credentials, resets to demo/sample data, reopens popup.
   */
  function signOut() {
    confirmAction(
      'Sign Out?',
      'Your credentials and locally-cached data will be cleared. Demo data will be shown until you sign in again. Your GitHub Gist is untouched.',
      '🚪', 'Sign Out',
      () => {
        window.App.State.clearGistCredentials();
        runAction('portfolio:clearToSampleData');
        openCredentialsPopup(() => {});
        toast('Signed out — showing demo data', 'info');
      }
    );
  }

  /* ── Theme application ────────────────────────────────────────── */

  /**
   * Apply the saved theme to <html data-theme="...">
   * Called once on startup; modules may call this again after settings change.
   */
  function applyTheme() {
    const appSettings = window.App.State?.getAppSettings?.() || {};
    const theme = appSettings.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }

  /**
   * Toggle between dark and light theme.
   * V3 fix: Shell now owns toggleTheme so settings.js can call App.Shell.toggleTheme()
   * instead of App.Portfolio.toggleTheme() (cross-module call).
   * V9 fix: Theme storage moved from portfolio.settings.theme to app.theme namespace.
   */
  function toggleTheme() {
    const appSettings = window.App.State?.getAppSettings?.() || {};
    const next = (appSettings.theme || 'dark') === 'dark' ? 'light' : 'dark';
    window.App.State.setAppSettings({ ...appSettings, theme: next });
    applyTheme();
    // Sync the theme-toggle icon in the header
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
    _wireGlobalTopbar();

    // Activate default module
    switchModule(defaultModule);

    console.info('[Shell] Ready. Active module:', defaultModule);
  }

  /**
   * Wire global topbar buttons that are outside all module panes.
   * These live in the shared <div class="topbar"> and must be owned by Shell.
   * Called once from init() — never from any module.
   */
  function _wireGlobalTopbar() {
    el('h-signout-btn')?.addEventListener('click', () => signOut());
    el('theme-toggle')?.addEventListener('click',  () => toggleTheme());
    el('cred-save-btn')?.addEventListener('click', () => saveCredentials());
    el('cred-demo-btn')?.addEventListener('click', () => enterDemoMode());
    el('lock-token')?.addEventListener('keydown',   e => { if (e.key === 'Enter') saveCredentials(); });
    el('lock-gist-id')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveCredentials(); });
  }

  /* ── Exports ──────────────────────────────────────────────────── */

  return {
    registerModule,
    registerAction,
    runAction,
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
    triggerGistLoadSilent,
    // App-level credentials / lock screen — owned by Shell, not by any module
    initLockScreen,
    openCredentialsPopup,
    closeCredentialsPopup,
    saveCredentials,
    enterDemoMode,
    signOut,
    /** Returns the currently active module id */
    get active() { return _active; },
  };

})();
