'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * CORE / CONSTANTS  —  App-wide magic numbers & shared config values
 * ═══════════════════════════════════════════════════════════════════
 *
 * All modules should import values from here rather than repeating
 * literals. This file has no side-effects and no dependencies.
 *
 * Usage:
 *   const { CACHE_TTL_MS, TOAST_TIMEOUT_MS } = window.App.Constants;
 * ═══════════════════════════════════════════════════════════════════
 */

window.App = window.App || {};

window.App.Constants = Object.freeze({

  /* ── Caching ────────────────────────────────────────────────────── */
  CACHE_TTL_MS:      14400000,   // 4 hours — default price-cache lifetime
  QTY_EPSILON:       0.00001,    // Negligible quantity difference (floating-point safety)
  MIN_CAGR_YEARS:    1.0,        // CAGR only meaningful for holdings ≥ 1 year

  /* ── Toast / UI timing ──────────────────────────────────────────── */
  TOAST_TIMEOUT_MS:  3500,       // Auto-hide delay for toasts
  TOAST_SHOW_DELAY_MS: 10,       // Fade-in kickoff delay (allows paint before class add)
  TOAST_FADE_OUT_MS: 300,        // Fade-out transition duration

  /* ── Network fetch timeouts ─────────────────────────────────────── */
  FETCH_TIMEOUT_MS: Object.freeze({
    quick:    4000,   // Single-ticker price lookup
    standard: 5000,   // FX rate fetch
    slow:     10000,  // Multi-source fallback
    bulk:     25000,  // Full portfolio batch fetch
  }),

  /* ── Data limits ────────────────────────────────────────────────── */
  MAX_DELETED_HISTORY: 10,       // Soft-delete history kept per module
  MAX_STREAK_DAYS:     365,      // Max days to scan for streak calculation

  /* ── CORS proxy ─────────────────────────────────────────────────── */
  CORS_PROXY: 'https://corsproxy.io/?',

});
