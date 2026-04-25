'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * CORE / FILTERS  —  Shared list-filtering helpers
 * ═══════════════════════════════════════════════════════════════════
 *
 * Stateless functions for searching and filtering arrays.
 * Habits, Portfolio, and Ember all filter lists independently today;
 * these helpers provide a shared, tested baseline to build on.
 *
 * Usage:
 *   const results = App.Filters.textSearch(items, 'apple', ['title','notes']);
 *   const inRange  = App.Filters.dateRange(items, '2024-01-01', '2024-12-31', 'date');
 *   const both     = App.Filters.combine([textFn, dateFn], items);
 * ═══════════════════════════════════════════════════════════════════
 */

window.App = window.App || {};

window.App.Filters = (function () {

  /* ── textSearch ─────────────────────────────────────────────────
   * Returns items whose specified fields contain query (case-insensitive).
   * Empty/null query returns all items unmodified.
   *
   * @param {Array}    items   array of objects to search
   * @param {string}   query   search string
   * @param {string[]} fields  object keys to search within (supports dot-notation: 'source.title')
   * @returns {Array}
   * ─────────────────────────────────────────────────────────────── */
  function textSearch(items, query, fields) {
    if (!query || !query.trim()) return items;
    const q = query.trim().toLowerCase();
    return items.filter(item =>
      fields.some(field => {
        const val = _getNestedValue(item, field);
        return val && String(val).toLowerCase().includes(q);
      })
    );
  }

  /* ── dateRange ──────────────────────────────────────────────────
   * Filters items to those whose dateField falls within [startDate, endDate].
   * Either bound can be null/undefined to leave that side open.
   *
   * @param {Array}  items      array of objects
   * @param {string} startDate  ISO "YYYY-MM-DD" inclusive start (or null)
   * @param {string} endDate    ISO "YYYY-MM-DD" inclusive end (or null)
   * @param {string} dateField  key on each item containing the ISO date string
   * @returns {Array}
   * ─────────────────────────────────────────────────────────────── */
  function dateRange(items, startDate, endDate, dateField = 'date') {
    return items.filter(item => {
      const d = item[dateField];
      if (!d) return false;
      if (startDate && d < startDate) return false;
      if (endDate   && d > endDate)   return false;
      return true;
    });
  }

  /* ── byField ────────────────────────────────────────────────────
   * Filters items by exact match on a field.
   * Useful for asset class filters ("Stock", "ETF") or habit status.
   *
   * @param {Array}  items
   * @param {string} field
   * @param {*}      value  pass null/undefined to return all items
   * @returns {Array}
   * ─────────────────────────────────────────────────────────────── */
  function byField(items, field, value) {
    if (value === null || value === undefined) return items;
    return items.filter(item => item[field] === value);
  }

  /* ── combine ────────────────────────────────────────────────────
   * Applies multiple filter functions sequentially to items.
   * Each filterFn is (items) => filteredItems.
   *
   * @param {Function[]} fns
   * @param {Array}      items
   * @returns {Array}
   * ─────────────────────────────────────────────────────────────── */
  function combine(fns, items) {
    return fns.reduce((acc, fn) => fn(acc), items);
  }

  /* ── sortBy ─────────────────────────────────────────────────────
   * Sorts items by a field. Handles strings, numbers, and ISO dates.
   *
   * @param {Array}  items
   * @param {string} field
   * @param {'asc'|'desc'} direction
   * @returns {Array}  new sorted array (does not mutate original)
   * ─────────────────────────────────────────────────────────────── */
  function sortBy(items, field, direction = 'asc') {
    const dir = direction === 'desc' ? -1 : 1;
    return [...items].sort((a, b) => {
      const av = a[field], bv = b[field];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return av < bv ? -dir : dir;
    });
  }

  /* ── Private: dot-notation nested value getter ────────────────── */
  function _getNestedValue(obj, path) {
    return path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), obj);
  }

  /* ── Public API ──────────────────────────────────────────────── */
  return Object.freeze({ textSearch, dateRange, byField, combine, sortBy });

}());
