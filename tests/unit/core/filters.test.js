import { describe, it, expect } from 'vitest';
import '../../../js/core/filters.js';

const ITEMS = [
  { id: 1, name: 'Apple Inc.',    ticker: 'AAPL', cls: 'Stock', date: '2024-01-15', value: 1000 },
  { id: 2, name: 'Bitcoin',       ticker: 'BTC',  cls: 'Crypto', date: '2024-03-10', value: 5000 },
  { id: 3, name: 'Vanguard S&P',  ticker: 'VOO',  cls: 'ETF',   date: '2024-06-20', value: 2500 },
  { id: 4, name: 'Tesla Inc.',     ticker: 'TSLA', cls: 'Stock', date: '2024-09-05', value: 800 },
  { id: 5, name: 'Ethereum',       ticker: 'ETH',  cls: 'Crypto', date: '2024-11-30', value: 3000 },
];

describe('App.Filters', () => {

  // ── textSearch ───────────────────────────────────────────────────

  describe('textSearch', () => {
    it('returns all items for empty query', () => {
      expect(App.Filters.textSearch(ITEMS, '', ['name'])).toHaveLength(5);
    });

    it('returns all items for null query', () => {
      expect(App.Filters.textSearch(ITEMS, null, ['name'])).toHaveLength(5);
    });

    it('filters by single field case-insensitively', () => {
      const result = App.Filters.textSearch(ITEMS, 'apple', ['name']);
      expect(result).toHaveLength(1);
      expect(result[0].ticker).toBe('AAPL');
    });

    it('searches across multiple fields', () => {
      const result = App.Filters.textSearch(ITEMS, 'btc', ['name', 'ticker']);
      expect(result).toHaveLength(1);
      expect(result[0].ticker).toBe('BTC');
    });

    it('matches partial strings', () => {
      const result = App.Filters.textSearch(ITEMS, 'Inc', ['name']);
      expect(result).toHaveLength(2); // Apple Inc. + Tesla Inc.
    });

    it('returns empty array when no match', () => {
      expect(App.Filters.textSearch(ITEMS, 'ZZZNOMATCH', ['name', 'ticker'])).toHaveLength(0);
    });

    it('is case-insensitive', () => {
      const lower = App.Filters.textSearch(ITEMS, 'apple', ['name']);
      const upper = App.Filters.textSearch(ITEMS, 'APPLE', ['name']);
      expect(lower).toEqual(upper);
    });

    it('does not mutate the original array', () => {
      const copy = [...ITEMS];
      App.Filters.textSearch(ITEMS, 'apple', ['name']);
      expect(ITEMS).toEqual(copy);
    });
  });

  // ── dateRange ────────────────────────────────────────────────────

  describe('dateRange', () => {
    it('returns items within range (inclusive)', () => {
      const result = App.Filters.dateRange(ITEMS, '2024-03-01', '2024-06-30', 'date');
      expect(result.map(i => i.ticker)).toEqual(['BTC', 'VOO']);
    });

    it('returns all items when both bounds are null', () => {
      expect(App.Filters.dateRange(ITEMS, null, null, 'date')).toHaveLength(5);
    });

    it('applies only start bound', () => {
      const result = App.Filters.dateRange(ITEMS, '2024-09-01', null, 'date');
      expect(result.map(i => i.ticker)).toEqual(['TSLA', 'ETH']);
    });

    it('applies only end bound', () => {
      const result = App.Filters.dateRange(ITEMS, null, '2024-01-31', 'date');
      expect(result.map(i => i.ticker)).toEqual(['AAPL']);
    });

    it('is inclusive on exact boundaries', () => {
      const result = App.Filters.dateRange(ITEMS, '2024-01-15', '2024-01-15', 'date');
      expect(result).toHaveLength(1);
      expect(result[0].ticker).toBe('AAPL');
    });

    it('uses "date" as default field name', () => {
      const result = App.Filters.dateRange(ITEMS, '2024-01-01', '2024-01-31');
      expect(result).toHaveLength(1);
    });
  });

  // ── byField ──────────────────────────────────────────────────────

  describe('byField', () => {
    it('filters by exact field value', () => {
      const result = App.Filters.byField(ITEMS, 'cls', 'Stock');
      expect(result).toHaveLength(2);
      expect(result.every(i => i.cls === 'Stock')).toBe(true);
    });

    it('returns all items when value is null', () => {
      expect(App.Filters.byField(ITEMS, 'cls', null)).toHaveLength(5);
    });

    it('returns empty for non-existent value', () => {
      expect(App.Filters.byField(ITEMS, 'cls', 'Bond')).toHaveLength(0);
    });

    it('filters by numeric field', () => {
      const result = App.Filters.byField(ITEMS, 'id', 3);
      expect(result).toHaveLength(1);
      expect(result[0].ticker).toBe('VOO');
    });
  });

  // ── combine ──────────────────────────────────────────────────────

  describe('combine', () => {
    it('applies multiple filters sequentially', () => {
      const textFn  = items => App.Filters.textSearch(items, 'Inc', ['name']);
      const classFn = items => App.Filters.byField(items, 'cls', 'Stock');
      const result  = App.Filters.combine([textFn, classFn], ITEMS);
      expect(result).toHaveLength(2); // AAPL and TSLA both have "Inc" and cls "Stock"
    });

    it('short-circuits on empty result', () => {
      const emptyFn  = () => [];
      const countFn  = vi => vi;  // identity — should not be reached with items
      const result   = App.Filters.combine([emptyFn, countFn], ITEMS);
      expect(result).toHaveLength(0);
    });

    it('returns all items when no filters applied', () => {
      expect(App.Filters.combine([], ITEMS)).toHaveLength(5);
    });
  });

  // ── sortBy ───────────────────────────────────────────────────────

  describe('sortBy', () => {
    it('sorts by string field ascending', () => {
      const result = App.Filters.sortBy(ITEMS, 'ticker');
      expect(result.map(i => i.ticker)).toEqual(['AAPL', 'BTC', 'ETH', 'TSLA', 'VOO']);
    });

    it('sorts by string field descending', () => {
      const result = App.Filters.sortBy(ITEMS, 'ticker', 'desc');
      expect(result.map(i => i.ticker)).toEqual(['VOO', 'TSLA', 'ETH', 'BTC', 'AAPL']);
    });

    it('sorts by numeric field', () => {
      const result = App.Filters.sortBy(ITEMS, 'value');
      expect(result[0].ticker).toBe('TSLA');  // 800 is smallest
      expect(result[4].ticker).toBe('BTC');   // 5000 is largest
    });

    it('sorts by date string (ISO sorts lexicographically)', () => {
      const result = App.Filters.sortBy(ITEMS, 'date');
      expect(result[0].ticker).toBe('AAPL');  // earliest
      expect(result[4].ticker).toBe('ETH');   // latest
    });

    it('does not mutate original array', () => {
      const original = ITEMS.map(i => i.ticker);
      App.Filters.sortBy(ITEMS, 'ticker');
      expect(ITEMS.map(i => i.ticker)).toEqual(original);
    });

    it('handles null values by placing them last', () => {
      const data = [{ v: 3 }, { v: null }, { v: 1 }];
      const result = App.Filters.sortBy(data, 'v');
      expect(result[0].v).toBe(1);
      expect(result[2].v).toBeNull();
    });
  });

});
