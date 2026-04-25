import { describe, it, expect, vi } from 'vitest';
import '../../../js/core/utils.js';

describe('App.Utils', () => {

  // ── trySafe ──────────────────────────────────────────────────────

  describe('trySafe', () => {
    it('returns fn() result on success', () => {
      expect(App.Utils.trySafe(() => 42)).toBe(42);
    });

    it('returns string result on success', () => {
      expect(App.Utils.trySafe(() => 'hello')).toBe('hello');
    });

    it('returns null fallback by default on exception', () => {
      expect(App.Utils.trySafe(() => { throw new Error('boom'); })).toBeNull();
    });

    it('returns custom fallback on exception', () => {
      expect(App.Utils.trySafe(() => { throw new Error(); }, 'default')).toBe('default');
    });

    it('returns array fallback on exception', () => {
      const result = App.Utils.trySafe(() => { throw new Error(); }, []);
      expect(result).toEqual([]);
    });

    it('does not re-throw', () => {
      expect(() => App.Utils.trySafe(() => { throw new Error('should not propagate'); })).not.toThrow();
    });

    it('logs error with context label', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      App.Utils.trySafe(() => { throw new Error('bad'); }, null, 'MyContext');
      expect(spy).toHaveBeenCalledWith('[MyContext] Failed:', 'bad');
      spy.mockRestore();
    });

    it('passes through complex return values', () => {
      const obj = { a: 1, b: [2, 3] };
      expect(App.Utils.trySafe(() => obj)).toBe(obj);
    });
  });

  // ── generateId ───────────────────────────────────────────────────

  describe('generateId', () => {
    it('returns a non-empty string', () => {
      expect(typeof App.Utils.generateId()).toBe('string');
      expect(App.Utils.generateId().length).toBeGreaterThan(0);
    });

    it('uses default prefix "id"', () => {
      expect(App.Utils.generateId()).toMatch(/^id_/);
    });

    it('uses custom prefix', () => {
      expect(App.Utils.generateId('habit')).toMatch(/^habit_/);
      expect(App.Utils.generateId('tx')).toMatch(/^tx_/);
    });

    it('generates unique IDs on repeated calls', () => {
      const ids = new Set(Array.from({ length: 100 }, () => App.Utils.generateId()));
      expect(ids.size).toBe(100);
    });
  });

  // ── clamp ────────────────────────────────────────────────────────

  describe('clamp', () => {
    it('returns value when within range', () => {
      expect(App.Utils.clamp(5, 0, 10)).toBe(5);
    });

    it('clamps to min', () => {
      expect(App.Utils.clamp(-5, 0, 10)).toBe(0);
    });

    it('clamps to max', () => {
      expect(App.Utils.clamp(15, 0, 10)).toBe(10);
    });

    it('handles equal min and max', () => {
      expect(App.Utils.clamp(5, 3, 3)).toBe(3);
    });

    it('handles value equal to min', () => {
      expect(App.Utils.clamp(0, 0, 10)).toBe(0);
    });

    it('handles value equal to max', () => {
      expect(App.Utils.clamp(10, 0, 10)).toBe(10);
    });
  });

  // ── debounce ─────────────────────────────────────────────────────

  describe('debounce', () => {
    it('delays function execution', async () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      const debounced = App.Utils.debounce(fn, 100);

      debounced();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledOnce();

      vi.useRealTimers();
    });

    it('cancels earlier call if called again within delay', () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      const debounced = App.Utils.debounce(fn, 100);

      debounced();
      debounced();
      debounced();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledOnce(); // only once, not 3 times

      vi.useRealTimers();
    });
  });

});
