'use strict';

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
    const raw = localStorage.getItem('super_app_v1') || '';
    const kb  = (new Blob([raw]).size / 1024).toFixed(1);
    const pct = ((raw.length / 5120000) * 100).toFixed(1);
    const txt = `localStorage: ${kb} KB used (~${pct}% of 5 MB limit)`;
    if (el('stg-storage')) el('stg-storage').textContent = txt;
  }

  /* ── FX chips ─────────────────────────────────────────────────── */

  function _updateFXChips() {
    // Mirror the FX chip rendering from portfolio module if available
    const portfolioFX = window.App.Portfolio?.updateFXUI;
    if (typeof portfolioFX === 'function') {
      // Portfolio owns FX — just copy the rendered chips across
      const src = document.getElementById('h-fx');
      const dst = el('stg-fx-chips');
      if (src && dst) {
        // Show the same rates from state
        const fxData = window.App.State.getPortfolioData()?.fxDaily || {};
        const cur    = window.App.State.getPortfolioData()?.settings?.currency || 'EUR';
        const pairs  = [
          { pair: 'USD/EUR', val: fxData.USD?.[Object.keys(fxData.USD||{})[0]] },
          { pair: 'INR/EUR', val: fxData.INR?.[Object.keys(fxData.INR||{})[0]] },
        ];
        dst.innerHTML = pairs.map(p =>
          `<div class="fx-chip"><span>${p.pair}</span><span>${p.val ? (1/p.val).toFixed(4) : '—'}</span></div>`
        ).join('');
      }
    }
  }

  /* ── Ember settings section ───────────────────────────────────── */

  function _renderEmberSettingsSection() {
    const container = el('stg-ember-settings-content');
    if (!container) return;
    // Ask EmberUI to render its settings form into this container if available
    if (typeof window.App.EmberUI?.renderSettingsInto === 'function') {
      window.App.EmberUI.renderSettingsInto(container);
    } else {
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
    window.App.State.setGistCredentials({ token, id });
    // Also keep portfolio settings in sync (legacy compat)
    const s = window.App.State.getPortfolioData();
    if (s.settings) {
      s.settings.gistToken = token;
      s.settings.gistId    = id;
      window.App.State.setPortfolioData(s);
    }
    _setGistStatus('Credentials saved ✓', true);
    _toast('Gist credentials saved', 'success');
  }

  function loadPortfolioFromGist() {
    if (typeof window.App.Portfolio?.gistLoad === 'function') {
      window.App.Portfolio.gistLoad();
    } else {
      _toast('Portfolio module not ready', 'warn');
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
    window.App.Portfolio?.render?.();
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
    if (typeof window.App.Portfolio?.exportPortfolioCSV === 'function') {
      window.App.Portfolio.exportPortfolioCSV();
    } else {
      _toast('Portfolio module not ready', 'warn');
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
            window.App.Portfolio?.render?.();
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
    if (typeof window.App.Portfolio?.clearPriceCache === 'function') {
      window.App.Portfolio.clearPriceCache();
    } else {
      const s = window.App.State.getPortfolioData();
      s.priceCache = {};
      window.App.State.setPortfolioData(s);
      _toast('Price cache cleared', 'info');
    }
  }

  function undoDelete() {
    if (typeof window.App.Portfolio?.undoDelete === 'function') {
      window.App.Portfolio.undoDelete();
    } else {
      _toast('Portfolio module not ready', 'warn');
    }
  }

  function factoryReset() {
    _confirm(
      'Factory Reset',
      'Delete ALL data (portfolio, ember, habits, calc) and reset to defaults? This cannot be undone.',
      '⚠️', 'Reset Everything',
      () => {
        window.App.State.resetAll();
        window.App.Portfolio?.render?.();
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
            window.App.Ember?.render?.();
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
    if (typeof window.App.Habits?.exportJSON === 'function') {
      window.App.Habits.exportJSON();
    } else {
      _toast('Habits module not loaded', 'error');
    }
  }

  function importHabitsJSON(file) {
    if (!file) return;
    if (typeof window.App.Habits?.importJSON === 'function') {
      window.App.Habits.importJSON(file);
    } else {
      _toast('Habits module not loaded', 'error');
    }
  }

  /* ── Appearance section ───────────────────────────────────────── */

  function toggleTheme() {
    if (typeof window.App.Portfolio?.toggleTheme === 'function') {
      window.App.Portfolio.toggleTheme();
    } else {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next    = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      const s = window.App.State.getPortfolioData();
      if (s.settings) { s.settings.theme = next; window.App.State.setPortfolioData(s); }
    }
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
   * Called each time the Settings module is made visible (shell lazy-init
   * only fires once, so we hook switchModule via a MutationObserver on the
   * active class to re-sync on every visit).
   */
  function _observeActivation() {
    const pane = document.getElementById('mod-settings');
    if (!pane) return;
    const obs = new MutationObserver(() => {
      if (pane.classList.contains('active')) {
        syncUI();                         // refresh fields + ember settings
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
