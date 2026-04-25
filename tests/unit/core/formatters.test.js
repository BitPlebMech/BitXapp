import { describe, it, expect, vi, afterEach } from 'vitest';
import '../../../js/core/formatters.js';

describe('App.Formatters', () => {

  // ── fmtDate ──────────────────────────────────────────────────────

  describe('fmtDate', () => {
    it('formats ISO date as "01 Jan 2025"', () => {
      expect(App.Formatters.fmtDate('2025-01-01')).toBe('01 Jan 2025');
    });

    it('formats mid-year date correctly', () => {
      expect(App.Formatters.fmtDate('2024-06-15')).toBe('15 Jun 2024');
    });

    it('handles December correctly', () => {
      expect(App.Formatters.fmtDate('2023-12-31')).toBe('31 Dec 2023');
    });

    it('does not shift day due to timezone (uses T12:00:00)', () => {
      // If T00:00:00Z is used, some timezones shift to the previous day
      const result = App.Formatters.fmtDate('2025-03-01');
      expect(result).toContain('Mar 2025');
      expect(result).toContain('01');
    });
  });

  // ── fmtDateShort ─────────────────────────────────────────────────

  describe('fmtDateShort', () => {
    it("formats as \"Jan '25\"", () => {
      expect(App.Formatters.fmtDateShort('2025-01-15')).toMatch(/Jan.+25/);
    });

    it('does not include day', () => {
      const result = App.Formatters.fmtDateShort('2025-06-10');
      expect(result).not.toMatch(/\b10\b/);
    });
  });

  // ── fmtDateLong ──────────────────────────────────────────────────

  describe('fmtDateLong', () => {
    it('includes weekday, day, month, year', () => {
      const result = App.Formatters.fmtDateLong('2025-01-01');
      expect(result).toContain('Wednesday');
      expect(result).toContain('January');
      expect(result).toContain('2025');
    });
  });

  // ── todayISO ─────────────────────────────────────────────────────

  describe('todayISO', () => {
    it('returns a string matching YYYY-MM-DD', () => {
      expect(App.Formatters.todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('matches current date components', () => {
      const d = new Date();
      const expected = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      expect(App.Formatters.todayISO()).toBe(expected);
    });
  });

  // ── daysAgoISO ───────────────────────────────────────────────────

  describe('daysAgoISO', () => {
    it('returns today for n=0', () => {
      expect(App.Formatters.daysAgoISO(0)).toBe(App.Formatters.todayISO());
    });

    it('returns yesterday for n=1', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const expected = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
      expect(App.Formatters.daysAgoISO(1)).toBe(expected);
    });

    it('returns YYYY-MM-DD format', () => {
      expect(App.Formatters.daysAgoISO(7)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  // ── timeAgo ──────────────────────────────────────────────────────

  describe('timeAgo', () => {
    it('returns "just now" for recent timestamp', () => {
      expect(App.Formatters.timeAgo(Date.now() - 30000)).toBe('just now');
    });

    it('returns minutes ago', () => {
      expect(App.Formatters.timeAgo(Date.now() - 5 * 60 * 1000)).toBe('5m ago');
    });

    it('returns hours ago', () => {
      expect(App.Formatters.timeAgo(Date.now() - 3 * 3600 * 1000)).toBe('3h ago');
    });

    it('returns days ago', () => {
      expect(App.Formatters.timeAgo(Date.now() - 2 * 86400 * 1000)).toBe('2d ago');
    });

    it('accepts ISO string', () => {
      const ts = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      expect(App.Formatters.timeAgo(ts)).toBe('5m ago');
    });
  });

  // ── fmtNum ───────────────────────────────────────────────────────

  describe('fmtNum', () => {
    it('formats integer', () => {
      expect(App.Formatters.fmtNum(1000, 0)).toBe('1,000');
    });

    it('formats to 2 decimal places by default', () => {
      expect(App.Formatters.fmtNum(3.14159)).toBe('3.14');
    });

    it('returns "—" for null', () => {
      expect(App.Formatters.fmtNum(null)).toBe('—');
    });

    it('returns "—" for undefined', () => {
      expect(App.Formatters.fmtNum(undefined)).toBe('—');
    });

    it('returns "—" for NaN', () => {
      expect(App.Formatters.fmtNum(NaN)).toBe('—');
    });

    it('returns "—" for Infinity', () => {
      expect(App.Formatters.fmtNum(Infinity)).toBe('—');
    });

    it('handles zero correctly', () => {
      expect(App.Formatters.fmtNum(0, 2)).toBe('0.00');
    });

    it('handles negative numbers', () => {
      expect(App.Formatters.fmtNum(-42.5, 1)).toBe('-42.5');
    });
  });

  // ── fmtPct ───────────────────────────────────────────────────────

  describe('fmtPct', () => {
    it('adds + sign for positive ratios', () => {
      expect(App.Formatters.fmtPct(0.1234)).toBe('+12.34 %');
    });

    it('keeps - sign for negative ratios', () => {
      expect(App.Formatters.fmtPct(-0.05)).toBe('-5.00 %');
    });

    it('handles alreadyPct=true', () => {
      expect(App.Formatters.fmtPct(12.34, 2, true)).toBe('+12.34 %');
    });

    it('returns "—" for null', () => {
      expect(App.Formatters.fmtPct(null)).toBe('—');
    });

    it('handles zero', () => {
      expect(App.Formatters.fmtPct(0)).toBe('+0.00 %');
    });
  });

});
