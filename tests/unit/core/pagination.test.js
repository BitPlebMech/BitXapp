import { describe, it, expect } from 'vitest';
import '../../../js/core/pagination.js';

const makeItems = n => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

describe('App.Pagination', () => {

  describe('paginate', () => {
    it('returns correct totalPages', () => {
      expect(App.Pagination.paginate(makeItems(50), 25).totalPages).toBe(2);
      expect(App.Pagination.paginate(makeItems(51), 25).totalPages).toBe(3);
      expect(App.Pagination.paginate(makeItems(25), 25).totalPages).toBe(1);
    });

    it('handles empty array — totalPages is 1 (not 0)', () => {
      expect(App.Pagination.paginate([], 25).totalPages).toBe(1);
    });

    it('getPage(1) returns first pageSize items', () => {
      const pg = App.Pagination.paginate(makeItems(100), 10);
      const page = pg.getPage(1);
      expect(page).toHaveLength(10);
      expect(page[0].id).toBe(1);
      expect(page[9].id).toBe(10);
    });

    it('getPage(2) returns correct slice', () => {
      const pg = App.Pagination.paginate(makeItems(100), 10);
      const page = pg.getPage(2);
      expect(page[0].id).toBe(11);
      expect(page[9].id).toBe(20);
    });

    it('last page may have fewer than pageSize items', () => {
      const pg = App.Pagination.paginate(makeItems(23), 10);
      expect(pg.getPage(3)).toHaveLength(3);
    });

    it('clamps page number to valid range', () => {
      const pg = App.Pagination.paginate(makeItems(30), 10);
      expect(pg.getPage(0)).toEqual(pg.getPage(1));   // below 1 → clamp to 1
      expect(pg.getPage(99)).toEqual(pg.getPage(3));  // above max → clamp to last
    });

    it('hasNext returns false on last page', () => {
      const pg = App.Pagination.paginate(makeItems(20), 10);
      expect(pg.hasNext(2)).toBe(false);
    });

    it('hasNext returns true when not on last page', () => {
      const pg = App.Pagination.paginate(makeItems(20), 10);
      expect(pg.hasNext(1)).toBe(true);
    });

    it('hasPrev returns false on first page', () => {
      const pg = App.Pagination.paginate(makeItems(20), 10);
      expect(pg.hasPrev(1)).toBe(false);
    });

    it('hasPrev returns true when not on first page', () => {
      const pg = App.Pagination.paginate(makeItems(20), 10);
      expect(pg.hasPrev(2)).toBe(true);
    });
  });

  describe('paginate.slice', () => {
    it('returns correct from/to/total metadata', () => {
      const pg = App.Pagination.paginate(makeItems(55), 10);
      const s = pg.slice(2);
      expect(s.from).toBe(11);
      expect(s.to).toBe(20);
      expect(s.total).toBe(55);
      expect(s.items).toHaveLength(10);
    });

    it('handles last partial page', () => {
      const pg = App.Pagination.paginate(makeItems(23), 10);
      const s = pg.slice(3);
      expect(s.from).toBe(21);
      expect(s.to).toBe(23);
      expect(s.items).toHaveLength(3);
    });

    it('handles empty list', () => {
      const pg = App.Pagination.paginate([], 10);
      const s = pg.slice(1);
      expect(s.from).toBe(0);
      expect(s.to).toBe(0);
      expect(s.total).toBe(0);
    });
  });

  describe('renderControls', () => {
    it('returns empty string for single page', () => {
      expect(App.Pagination.renderControls(1, 1)).toBe('');
    });

    it('returns HTML string for multi-page', () => {
      const html = App.Pagination.renderControls(2, 5);
      expect(typeof html).toBe('string');
      expect(html).toContain('Page 2 / 5');
    });

    it('prev button disabled on first page', () => {
      const html = App.Pagination.renderControls(1, 5);
      expect(html).toMatch(/data-page="0"[^>]*disabled/);
    });

    it('next button disabled on last page', () => {
      const html = App.Pagination.renderControls(5, 5);
      expect(html).toMatch(/data-page="6"[^>]*disabled/);
    });
  });

  describe('DEFAULT_PAGE_SIZE', () => {
    it('is 25', () => {
      expect(App.Pagination.DEFAULT_PAGE_SIZE).toBe(25);
    });
  });

});
