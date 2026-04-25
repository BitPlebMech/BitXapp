'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * CORE / PAGINATION  —  Shared list-pagination helper
 * ═══════════════════════════════════════════════════════════════════
 *
 * Provides a single paginate() function used across portfolio
 * transaction history, Ember highlights, and any other long list.
 *
 * Usage:
 *   const pg = App.Pagination.paginate(items, 25);
 *   pg.getPage(1);         // first 25 items
 *   pg.totalPages;         // number of pages
 *   pg.hasNext(currentPage);
 *   pg.hasPrev(currentPage);
 *
 * Render helper:
 *   const html = App.Pagination.renderControls(currentPage, totalPages, onPageFn);
 * ═══════════════════════════════════════════════════════════════════
 */

window.App = window.App || {};

window.App.Pagination = (function () {

  const DEFAULT_PAGE_SIZE = 25;

  /* ── paginate ───────────────────────────────────────────────────
   * Wraps an array in a pagination interface.
   *
   * @param {Array}  items     full list to paginate
   * @param {number} pageSize  items per page (default 25)
   * @returns {{
   *   items: Array,
   *   totalPages: number,
   *   pageSize: number,
   *   getPage(n: number): Array,
   *   hasNext(n: number): boolean,
   *   hasPrev(n: number): boolean,
   *   slice(n: number): { items: Array, from: number, to: number, total: number }
   * }}
   * ─────────────────────────────────────────────────────────────── */
  function paginate(items, pageSize = DEFAULT_PAGE_SIZE) {
    const total      = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      items,
      totalPages,
      pageSize,

      /** Returns items for page n (1-indexed). */
      getPage(n) {
        const page = Math.max(1, Math.min(n, totalPages));
        const from = (page - 1) * pageSize;
        return items.slice(from, from + pageSize);
      },

      /** True if there is a page after n. */
      hasNext(n) { return n < totalPages; },

      /** True if there is a page before n. */
      hasPrev(n) { return n > 1; },

      /**
       * Returns the items for page n plus range metadata.
       * Useful for building "Showing 26–50 of 182" labels.
       */
      slice(n) {
        const page  = Math.max(1, Math.min(n, totalPages));
        const from  = (page - 1) * pageSize;
        const paged = items.slice(from, from + pageSize);
        return {
          items: paged,
          from:  total === 0 ? 0 : from + 1,
          to:    from + paged.length,
          total,
        };
      },
    };
  }

  /* ── renderControls ─────────────────────────────────────────────
   * Returns an HTML string for a prev/next/page-info bar.
   * Attach a data-page attribute to buttons and wire up via event
   * delegation — or pass an onPage callback to attach listeners after
   * insertion.
   *
   * @param {number}   currentPage
   * @param {number}   totalPages
   * @param {Function} [onPage]  optional callback(pageNumber)
   * @returns {string}  HTML string
   * ─────────────────────────────────────────────────────────────── */
  function renderControls(currentPage, totalPages, onPage = null) {
    if (totalPages <= 1) return '';

    const prevDisabled = currentPage <= 1         ? 'disabled' : '';
    const nextDisabled = currentPage >= totalPages ? 'disabled' : '';

    const id = 'pg-' + Math.random().toString(36).slice(2, 6);

    const html = `<div class="pg-controls" id="${id}" style="display:flex;align-items:center;gap:8px;padding:8px 0;font-size:12px;color:var(--muted)">
  <button class="pg-btn" data-page="${currentPage - 1}" ${prevDisabled}
    style="background:var(--surf2);border:1px solid var(--b1);border-radius:5px;padding:4px 10px;cursor:pointer;color:var(--text2)" aria-label="Previous page">‹</button>
  <span style="min-width:80px;text-align:center">Page ${currentPage} / ${totalPages}</span>
  <button class="pg-btn" data-page="${currentPage + 1}" ${nextDisabled}
    style="background:var(--surf2);border:1px solid var(--b1);border-radius:5px;padding:4px 10px;cursor:pointer;color:var(--text2)" aria-label="Next page">›</button>
</div>`;

    if (onPage) {
      // Wire up after next paint
      requestAnimationFrame(() => {
        document.getElementById(id)?.querySelectorAll('.pg-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const pg = parseInt(btn.dataset.page, 10);
            if (!isNaN(pg)) onPage(pg);
          });
        });
      });
    }

    return html;
  }

  /* ── Public API ──────────────────────────────────────────────── */
  return Object.freeze({ paginate, renderControls, DEFAULT_PAGE_SIZE });

}());
