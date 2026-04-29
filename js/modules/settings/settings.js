'use strict';

/**
 * MODULE RULES — read docs/MODULE_RULES.md before editing
 *
 * 1. State: read/write ONLY your own namespace via App.State.getXxxData() / setXxxData()
 * 2. Gist:  use your own file via App.Gist.saveXxxData() — never the generic save()
 * 3. Isolation: never call another module directly — use App.State (data) or App.Shell (UI)
 * 4. Shell: app-level concerns (theme, toast, confirm, sign-in) belong to App.Shell
 * 5. Actions: register callable actions with App.Shell.registerAction('mod:action', fn)
 * 6. Render: export a public render() so Shell can re-render after Gist load
 * 7. Save button: wire header Gist Save to App.Shell.triggerGistSave(), not module save
 * 8. No localStorage: only js/core/state.js touches localStorage directly
 */

/**
 * ═══════════════════════════════════════════════════════════════════
 * SETTINGS MODULE  —  Unified settings for all modules
 * ═══════════════════════════════════════════════════════════════════
 *
 * Single scrollable page with five sections:
 *   1. Gist Sync       — shared GitHub token + Gist ID, save/load
 *   2. Portfolio       — API key, cache TTL, currency, export/import
 *   3. Ember           — delegates to EmberUI for email config panel,
 *                        plus export/import JSON
 *   4. Appearance      — theme toggle
 *   5. Storage         — localStorage usage info
 *
 * All DOM IDs in this module are prefixed `stg-` to avoid collisions.
 * ═══════════════════════════════════════════════════════════════════
 */
window.App = window.App || {};

window.App.Settings = (() => {

  function el(id) { return document.getElementById(id); }

  /* ── helpers ──────────────────────────────────────────────────── */

  function _toast(msg, type = 'info') {
    window.App.Shell?.toast(msg, type);
  }

  function _confirm(title, body, icon, label, cb) {
    window.App.Shell?.confirmAction(title, body, icon, label, cb);
  }

  function _triggerDownload(content, mime, filename) {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ── Sync settings UI fields from state ──────────────────────── */

  function syncUI() {
    const s     = window.App.State.getPortfolioData();
    const creds = window.App.State.getGistCredentials();

    // Gist section
    if (el('cfg-gist-token')) el('cfg-gist-token').value = creds.token || '';
    if (el('cfg-gist-id'))    el('cfg-gist-id').value    = creds.id    || '';

    // Portfolio section
    if (el('cfg-currency'))  el('cfg-currency').value  = s.settings?.currency  || 'EUR';
    if (el('cfg-cache-ttl')) el('cfg-cache-ttl').value = (s.settings?.cacheTTL || 14400000) / 3600000;
    if (el('cfg-api-key'))   el('cfg-api-key').value   = s.settings?.apiKey    || '';

    _updateStorageInfo();
    _updateFXChips();
    _renderEmberSettingsSection();
  }

  /* ── Storage info ─────────────────────────────────────────────── */

  function _updateStorageInfo() {
    // V2/V10 fix: was calling localStorage.getItem() directly (Rule 1 violation)
    // and using a different byte formula than state.js. Now delegates to the
    // single canonical implementation in App.State.storageInfo().
    const info = window.App.State.storageInfo();
    if (el('stg-storage'))
      el('stg-storage').textContent = `localStorage: ${info.display} used`;
  }

  /* ── FX chips ─────────────────────────────────────────────────── */

  function _updateFXChips() {
    const dst = el('stg-fx-chips');
    if (!dst) return;
    // Read FX data from state (allowed by Rule 3 — reading via App.State)
    const fxData = window.App.State.getPortfolioData()?.fxDaily || {};
    const pairs  = [
      { pair: 'USD/EUR', val: fxData.USD?.[Object.keys(fxData.USD || {})[0]] },
      { pair: 'INR/EUR', val: fxData.INR?.[Object.keys(fxData.INR || {})[0]] },
    ];
    dst.innerHTML = pairs.map(p =>
      `<div class="fx-chip"><span>${p.pair}</span><span>${p.val ? (1 / p.val).toFixed(4) : '—'}</span></div>`
    ).join('');
  }

  /* ── Ember settings section ───────────────────────────────────── */

  function _renderEmberSettingsSection() {
    const container = el('stg-ember-settings-content');
    if (!container) return;
    // Route through the Shell action registry — avoids direct EmberUI coupling (Rule 3).
    // The 'ember:renderSettingsInto' action is registered by Ember.init() on the first
    // visit to the Ember tab.  If it hasn't been registered yet, runAction() returns
    // undefined and we show a helpful placeholder instead of a blank panel.
    const result = window.App.Shell.runAction('ember:renderSettingsInto', container);
    if (result === undefined) {
      container.innerHTML = '<span style="color:var(--muted);font-size:12px">Ember settings load when you visit the Ember module first.</span>';
    }
  }

  /* ── Gist section ─────────────────────────────────────────────── */

  function _setGistStatus(msg, ok) {
    const el2 = el('stg-gist-status');
    if (!el2) return;
    el2.textContent = msg;
    el2.style.color = ok === true ? 'var(--green)' : ok === false ? 'var(--red)' : 'var(--muted)';
  }

  function saveGistCredentials() {
    const token = (el('cfg-gist-token')?.value || '').trim();
    const id    = (el('cfg-gist-id')?.value    || '').trim();
    // V12 fix: write only to the canonical gist namespace.
    // The old legacy write to portfolio.settings.gistToken/Id is removed —
    // state.js _load() already handles one-time migration from the legacy location
    // for existing users, so there is no reason to keep re-injecting it there.
    window.App.State.setGistCredentials({ token, id });
    _setGistStatus('Credentials saved ✓', true);
    _toast('Gist credentials saved', 'success');
  }

  function loadPortfolioFromGist() {
    // Always use the Shell's canonical loader — it restores ALL modules
    // (portfolio, ember settings, habits) in one shot. Never call
    // Portfolio.gistLoad() directly; it is portfolio-only.
    if (typeof window.App.Shell?.triggerGistLoad === 'function') {
      window.App.Shell.triggerGistLoad();
    } else {
      _toast('Shell not ready', 'warn');
    }
  }

  function clearGistCredentials() {
    _confirm(
      'Clear Gist credentials?',
      'Removes token and Gist ID from this browser only. Your GitHub data is untouched.',
      '🔑', 'Clear',
      () => {
        window.App.State.clearGistCredentials();
        if (el('cfg-gist-token')) el('cfg-gist-token').value = '';
        if (el('cfg-gist-id'))    el('cfg-gist-id').value    = '';
        _setGistStatus('Credentials cleared', null);
        _toast('Gist credentials cleared', 'info');
      }
    );
  }

  /* ── Portfolio section ────────────────────────────────────────── */

  function savePortfolioSettings() {
    const s = window.App.State.getPortfolioData();
    s.settings.currency = el('cfg-currency')?.value  || s.settings.currency;
    s.settings.cacheTTL = (parseFloat(el('cfg-cache-ttl')?.value) || 4) * 3600000;
    s.settings.apiKey   = (el('cfg-api-key')?.value   || '').trim();
    window.App.State.setPortfolioData(s);
    // Sync currency selector in portfolio header
    const hCur = document.getElementById('h-currency');
    if (hCur) hCur.value = s.settings.currency;
    // Re-render portfolio if active
    window.App.Shell.runAction('portfolio:render');
    _toast('Portfolio settings saved', 'success');
  }

  function exportPortfolioJSON() {
    const s = window.App.State.getPortfolioData();
    const safe = {
      ...s,
      settings: { ...s.settings, gistToken: '', gistId: '' },
      _exported: new Date().toISOString(),
    };
    _triggerDownload(JSON.stringify(safe, null, 2), 'application/json',
      `portfolio-${new Date().toISOString().slice(0,10)}.json`);
    _toast('Portfolio exported', 'success');
  }

  function exportPortfolioCSV() {
    // Routes through Shell action registry — no direct Portfolio coupling (Rule 3)
    const result = window.App.Shell.runAction('portfolio:exportCSV');
    if (result === undefined) {
      _toast('Portfolio module not ready — visit Portfolio tab first', 'warn');
    }
  }

  function importPortfolioJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        // Accept either flat portfolio object or wrapped { portfolio: ... }
        const data = parsed.portfolio || parsed;
        if (!Array.isArray(data.transactions)) {
          _toast('Invalid portfolio JSON — no transactions array found', 'error');
          return;
        }
        _confirm(
          'Import Portfolio JSON?',
          `Replace current portfolio with ${data.transactions.length} transactions from file?`,
          '📥', 'Import',
          () => {
            const current = window.App.State.getPortfolioData();
            const merged  = { ...current, ...data };
            // Never overwrite credentials from file
            merged.settings = {
              ...current.settings,
              ...data.settings,
              gistToken: current.settings.gistToken,
              gistId:    current.settings.gistId,
            };
            window.App.State.setPortfolioData(merged);
            window.App.Shell.runAction('portfolio:render');
            syncUI();
            _toast('Portfolio imported successfully', 'success');
          }
        );
      } catch (err) {
        _toast('Failed to parse JSON: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  function clearPriceCache() {
    // V7 fix: promoted the fallback to the primary path — writing directly to
    // App.State is the correct approach here (no Portfolio logic needed).
    // The old App.Portfolio.clearPriceCache() call is removed.
    const s = window.App.State.getPortfolioData();
    s.priceCache = {};
    window.App.State.setPortfolioData(s);
    window.App.Shell.runAction('portfolio:render');  // re-render if loaded; safe no-op if not
    _toast('Price cache cleared', 'info');
  }

  function undoDelete() {
    // Routes through Shell action registry — no direct Portfolio coupling (Rule 3)
    const result = window.App.Shell.runAction('portfolio:undoDelete');
    if (result === undefined) {
      _toast('Portfolio module not ready — visit Portfolio tab first', 'warn');
    }
  }

  function factoryReset() {
    _confirm(
      'Factory Reset',
      'Delete ALL data (portfolio, ember, habits, calc) and reset to defaults? This cannot be undone.',
      '⚠️', 'Reset Everything',
      () => {
        window.App.State.resetAll();
        window.App.Shell.runAction('portfolio:render');
        syncUI();
        _toast('All data cleared', 'info');
      }
    );
  }

  /* ── Ember section ────────────────────────────────────────────── */

  function exportEmberJSON() {
    const d = window.App.State.getEmberData();
    const payload = {
      ...d,
      settings: window.App.State.getEmberSettings(),
      streak:   window.App.State.getEmberStreak?.() || {},
      _exported: new Date().toISOString(),
    };
    _triggerDownload(JSON.stringify(payload, null, 2), 'application/json',
      `ember-highlights-${new Date().toISOString().slice(0,10)}.json`);
    _toast('Ember data exported', 'success');
  }

  function importEmberJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        const hlCount = (parsed.highlights || []).length;
        _confirm(
          'Import Ember JSON?',
          `Replace current Ember data with ${hlCount} highlights from file?`,
          '📥', 'Import',
          () => {
            const current = window.App.State.getEmberData();
            const merged  = { ...current };
            if (Array.isArray(parsed.highlights)) merged.highlights = parsed.highlights;
            if (Array.isArray(parsed.sources))    merged.sources    = parsed.sources;
            window.App.State.setEmberData(merged);
            if (parsed.settings) window.App.State.setEmberSettings(parsed.settings);
            if (parsed.streak)   window.App.State.setEmberStreak?.(parsed.streak);
            window.App.Shell.runAction('ember:render');
            _toast('Ember data imported successfully', 'success');
          }
        );
      } catch (err) {
        _toast('Failed to parse JSON: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  /* ── Habits section ──────────────────────────────────────────── */

  function exportHabitsJSON() {
    // Routes through Shell action registry — no direct Habits coupling (Rule 3)
    const result = window.App.Shell.runAction('habits:exportJSON');
    if (result === undefined) {
      _toast('Habits module not loaded — visit Habits tab first', 'warn');
    }
  }

  function importHabitsJSON(file) {
    if (!file) return;
    // Routes through Shell action registry — no direct Habits coupling (Rule 3)
    const result = window.App.Shell.runAction('habits:importJSON', file);
    if (result === undefined) {
      _toast('Habits module not loaded — visit Habits tab first', 'warn');
    }
  }

  /* ── Appearance section ───────────────────────────────────────── */

  function toggleTheme() {
    // V3 fix: was App.Portfolio.toggleTheme() — a cross-module call (Rules 3+4).
    // Shell now owns theme toggling; all callers use App.Shell.toggleTheme().
    window.App.Shell.toggleTheme();
  }

  /* ── Event wiring ─────────────────────────────────────────────── */

  function _wireEvents() {
    // Gist section
    el('stg-gist-save-btn')?.addEventListener('click',  saveGistCredentials);
    el('stg-gist-load-btn')?.addEventListener('click',  loadPortfolioFromGist);
    el('stg-gist-clear-btn')?.addEventListener('click', clearGistCredentials);

    // Portfolio section
    el('stg-portfolio-save')?.addEventListener('click', savePortfolioSettings);
    el('stg-export-portfolio')?.addEventListener('click', exportPortfolioJSON);
    el('stg-export-csv')?.addEventListener('click', exportPortfolioCSV);
    el('stg-import-portfolio')?.addEventListener('click', () => el('stg-import-portfolio-file')?.click());
    el('stg-import-portfolio-file')?.addEventListener('change', function() {
      if (this.files[0]) { importPortfolioJSON(this.files[0]); this.value = ''; }
    });
    el('stg-clear-cache')?.addEventListener('click',  clearPriceCache);
    el('stg-undo-delete')?.addEventListener('click',  undoDelete);
    el('stg-reset')?.addEventListener('click',        factoryReset);

    // Ember section
    el('stg-export-ember')?.addEventListener('click', exportEmberJSON);
    el('stg-import-ember')?.addEventListener('click', () => el('stg-import-ember-file')?.click());
    el('stg-import-ember-file')?.addEventListener('change', function() {
      if (this.files[0]) { importEmberJSON(this.files[0]); this.value = ''; }
    });

    // Habits section
    el('stg-export-habits')?.addEventListener('click', exportHabitsJSON);
    el('stg-import-habits')?.addEventListener('click', () => el('stg-import-habits-file')?.click());
    el('stg-import-habits-file')?.addEventListener('change', function() {
      if (this.files[0]) { importHabitsJSON(this.files[0]); this.value = ''; }
    });

  }

  /* ── Module init ──────────────────────────────────────────────── */

  function init() {
    _wireEvents();
    syncUI();
    _observeActivation();
  }

  /**
   * Re-sync the Settings UI on every visit, not just the first.
   *
   * Shell's lazy-init pattern calls mod.init() exactly once (the first visit),
   * so init() alone would leave field values stale when the user toggles away
   * and comes back.  A MutationObserver on the 'active' CSS class fires every
   * time the pane is shown, keeping fields fresh without any router coupling.
   */
  function _observeActivation() {
    const pane = document.getElementById('mod-settings');
    if (!pane) return;
    const obs = new MutationObserver(() => {
      if (pane.classList.contains('active')) {
        syncUI();   // refresh all fields + lazy-render Ember settings section
      }
    });
    obs.observe(pane, { attributes: true, attributeFilter: ['class'] });
  }

  /* ── Register with shell ──────────────────────────────────────── */

  window.App.Shell?.registerModule({
    id:   'settings',
    label: 'Settings',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--purple)" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
             <circle cx="12" cy="12" r="3"/>
             <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06
                      a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09
                      A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83
                      l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09
                      A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83
                      l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09
                      a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83
                      l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09
                      a1.65 1.65 0 0 0-1.51 1z"/>
           </svg>`,
    init,
  });

  /* ── Public API ───────────────────────────────────────────────── */

  return {
    init,
    syncUI,
  };

})();
