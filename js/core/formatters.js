'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * CORE / FORMATTERS  —  Shared display-formatting helpers
 * ═══════════════════════════════════════════════════════════════════
 *
 * Consolidates date, number, and time formatting that was previously
 * duplicated across portfolio.js, ember.js, and habits-ui.js.
 *
 * These are pure display formatters — no state, no side-effects.
 * Portfolio-specific currency/XIRR/CAGR formatters that depend on
 * active locale/settings remain in portfolio.js (they need _settings()).
 *
 * Usage:
 *   const { fmtDate, fmtDateShort, fmtDateLong, timeAgo } = window.App.Formatters;
 * ═══════════════════════════════════════════════════════════════════
 */

window.App = window.App || {};

window.App.Formatters = (function () {

  /* ── Date formatting ────────────────────────────────────────────
   * All date helpers accept ISO date strings "YYYY-MM-DD" or full
   * ISO timestamps. Noon UTC (T12:00:00) is used to avoid DST
   * boundary issues when constructing Date objects from date-only strings.
   * ─────────────────────────────────────────────────────────────── */

  /**
   * "01 Jan 2025" — standard medium date used across portfolio history,
   * ember import dates, and habits logs.
   * @param {string} s  ISO date string e.g. "2025-01-01"
   */
  function fmtDate(s) {
    return new Date(s + 'T12:00:00').toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  /**
   * "Jan '25" — compact date for chart axis labels.
   * @param {string} s  ISO date string
   */
  function fmtDateShort(s) {
    return new Date(s + 'T12:00:00').toLocaleDateString('en-GB', {
      month: 'short', year: '2-digit',
    });
  }

  /**
   * "Wednesday, 1 January 2025" — full date for tooltips and detail views.
   * @param {string} s  ISO date string
   */
  function fmtDateLong(s) {
    return new Date(s + 'T12:00:00').toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  /**
   * Returns today as "YYYY-MM-DD" in local time.
   * Canonical equivalent of the various inline toISOString().slice(0,10) calls.
   */
  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * Returns "YYYY-MM-DD" for N days ago in local time.
   * Shared implementation of the daysAgo() pattern used in habits and ember.
   * @param {number} n  days to subtract (0 = today)
   */
  function daysAgoISO(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /* ── Relative time ──────────────────────────────────────────────
   * "just now", "5m ago", "3h ago", "2d ago"
   * Shared from portfolio.js timeAgo() — used in gist sync labels,
   * ember import timestamps, and habits log entries.
   * ─────────────────────────────────────────────────────────────── */

  /**
   * @param {number|string} ts  Unix ms timestamp or ISO string
   * @returns {string}
   */
  function timeAgo(ts) {
    const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts;
    const sec = Math.floor((Date.now() - ms) / 1000);
    if (sec < 60)    return 'just now';
    if (sec < 3600)  return Math.floor(sec / 60) + 'm ago';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
    return Math.floor(sec / 86400) + 'd ago';
  }

  /* ── Generic number formatting ──────────────────────────────────
   * Simple locale-agnostic number helpers.
   * More opinionated currency/percentage formatters live in portfolio.js
   * because they depend on the user's active currency setting.
   * ─────────────────────────────────────────────────────────────── */

  /**
   * Format a number to fixed decimal places with thousands separator.
   * Returns '—' for null/undefined/NaN/Infinity.
   * @param {number} n
   * @param {number} places
   */
  function fmtNum(n, places = 2) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return n.toLocaleString('en-US', {
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    });
  }

  /**
   * Format as percentage with sign. "+12.34 %" or "-3.50 %"
   * Returns '—' for null/undefined/NaN.
   * @param {number} n      raw ratio value (e.g. 0.1234 for 12.34%)
   * @param {number} places decimal places (default 2)
   * @param {boolean} alreadyPct  true if n is already in percent (e.g. 12.34)
   */
  function fmtPct(n, places = 2, alreadyPct = false) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    const v = alreadyPct ? n : n * 100;
    return (v >= 0 ? '+' : '') + fmtNum(v, places) + ' %';
  }

  /* ── Public API ──────────────────────────────────────────────── */
  return Object.freeze({
    fmtDate,
    fmtDateShort,
    fmtDateLong,
    todayISO,
    daysAgoISO,
    timeAgo,
    fmtNum,
    fmtPct,
  });

}());
