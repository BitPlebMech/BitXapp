'use strict';

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
