/**
 * Global test setup — runs before every test file.
 *
 * IMPORTANT: We do NOT reset window.App here.
 * Module files (state.js, utils.js etc.) run their IIFEs at import time and
 * attach to window.App. Wiping window.App in beforeEach would destroy those
 * references. Instead we only reset localStorage so each test starts fresh.
 */
import { beforeEach, vi } from 'vitest';

beforeEach(() => {
  // Fresh in-memory localStorage for every test
  const store = {};
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(k => store[k] ?? null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => { store[k] = String(v); });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(k => { delete store[k]; });
  vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => {
    Object.keys(store).forEach(k => delete store[k]);
  });
});
