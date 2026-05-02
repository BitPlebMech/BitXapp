'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * CORE / UTILS  —  Shared utility helpers
 * ═══════════════════════════════════════════════════════════════════
 *
 * Stateless helpers used across multiple modules. No side-effects,
 * no dependencies on other App.* namespaces.
 *
 * Exports:
 *   App.Utils.trySafe(fn, fallback, context)  — safe try/catch wrapper
 *   App.Utils.generateId(prefix)              — unique ID generator
 *   App.Utils.clamp(value, min, max)          — numeric clamp
 *   App.Utils.debounce(fn, ms)                — debounce wrapper
 * ═══════════════════════════════════════════════════════════════════
 */

window.App = window.App || {};

window.App.Utils = (function () {

  /* ── trySafe ────────────────────────────────────────────────────
   * Runs fn() and returns its result. On any exception, logs the
   * error with context label and returns fallback instead.
   *
   * Replaces the 8+ repetitive try-catch-console.error patterns
   * scattered across the codebase.
   *
   * @param {Function} fn        — function to attempt
   * @param {*}        fallback  — value returned on failure
   * @param {string}   context   — label shown in console.error
   * @returns {*}
   * ─────────────────────────────────────────────────────────────── */
  function trySafe(fn, fallback = null, context = 'Operation') {
    try {
      return fn();
    } catch (e) {
      console.error(`[${context}] Failed:`, e.message);
      return fallback;
    }
  }

  /* ── generateId ─────────────────────────────────────────────────
   * Generates a short, collision-resistant unique ID.
   * Centralises the two slightly different implementations in
   * habits-data.js (_genId) and ember-data.js (genId).
   *
   * Format: <prefix>_<base36 timestamp>_<4-char random suffix>
   * Example: "id_lxk2f4a0_8d3z"
   *
   * @param {string} prefix — optional prefix (default 'id')
   * @returns {string}
   * ─────────────────────────────────────────────────────────────── */
  function generateId(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  /* ── clamp ──────────────────────────────────────────────────────
   * Constrains a value to [min, max].
   * ─────────────────────────────────────────────────────────────── */
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /* ── debounce ───────────────────────────────────────────────────
   * Returns a debounced version of fn that delays invocation by ms.
   * Useful for search inputs and resize handlers.
   * ─────────────────────────────────────────────────────────────── */
  function debounce(fn, ms = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /* ── escHtml ────────────────────────────────────────────────────
   * Escape HTML special characters to prevent XSS when inserting
   * into innerHTML.  Use this whenever user-controlled text (notes,
   * names, imported data) goes into a template literal that will be
   * assigned to innerHTML.
   *
   * @param {*} str - value to escape (null/undefined return '')
   * @returns {string} escaped string safe for HTML insertion
   * ─────────────────────────────────────────────────────────────── */
  function escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ── Public API ─────────────────────────────────────────────── */
  return Object.freeze({ trySafe, generateId, clamp, debounce, escHtml });

}());
