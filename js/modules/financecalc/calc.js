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
 * FINANCE CALCULATOR MODULE  —  Stub
 * ═══════════════════════════════════════════════════════════════════
 *
 * Planned calculators:
 *   • Compound interest (one-time or periodic investment)
 *   • SIP / DCA return simulator
 *   • Loan amortisation schedule
 *   • Rule of 72 / inflation-adjusted returns
 *   • Goal-based savings planner
 *
 * Data flow (follows the same pattern as all other modules):
 *   • State: window.App.State.getFinanceCalcData() / setFinanceCalcData()
 *   • Gist:  triggerGistSave() → App.Gist.saveFinanceCalcData() (when implemented)
 *   • Shell: window.App.Shell.registerModule({ id: 'calc', ... })
 * ═══════════════════════════════════════════════════════════════════
 */
window.App = window.App || {};

window.App.FinanceCalc = (() => {

  /* ── State accessors ──────────────────────────────────────────────── */
  function _data() { return window.App.State.getFinanceCalcData(); }
  function _save(d) { window.App.State.setFinanceCalcData(d); }

  /* ── Module init ──────────────────────────────────────────────────── */
  function init() {
    console.info('[FinanceCalc] Module initialised (stub)');
  }

  /* ── Register with shell ──────────────────────────────────────────── */
  window.App.Shell?.registerModule({
    id:    'calc',
    label: 'Finance Calc',
    icon:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/><line x1="8" y1="18" x2="16" y2="18"/></svg>`,
    soon:  true,   // App.Shell uses this flag to dim the sidebar button
    init,
  });

  /* ── Exports ──────────────────────────────────────────────────────── */
  return { init };

})();
