import { describe, it, expect, beforeEach } from 'vitest';
import '../../../js/core/state.js';

// Re-init state before each test to start from a clean slate
beforeEach(() => {
  window.App.State.init();
});

describe('App.State', () => {

  // ── init & defaults ───────────────────────────────────────────────

  describe('init', () => {
    it('creates default portfolio namespace', () => {
      const pd = App.State.getPortfolioData();
      expect(Array.isArray(pd.transactions)).toBe(true);
      expect(pd.settings.currency).toBe('EUR');
    });

    it('creates default habits namespace', () => {
      const hd = App.State.getHabitsData();
      expect(Array.isArray(hd.habits)).toBe(true);
      expect(Array.isArray(hd.logs)).toBe(true);
    });

    it('creates default gist namespace', () => {
      const creds = App.State.getGistCredentials();
      expect(creds.token).toBe('');
      expect(creds.id).toBe('');
    });

    it('creates default ember namespace', () => {
      const ed = App.State.getEmberData();
      expect(Array.isArray(ed.highlights)).toBe(true);
      expect(Array.isArray(ed.sources)).toBe(true);
    });
  });

  // ── Portfolio ─────────────────────────────────────────────────────

  describe('portfolio', () => {
    it('persists and retrieves transactions', () => {
      const data = App.State.getPortfolioData();
      data.transactions.push({ id: '1', ticker: 'AAPL', type: 'BUY', qty: 10 });
      App.State.setPortfolioData(data);

      // Simulate reload
      App.State.init();
      expect(App.State.getPortfolioData().transactions[0].ticker).toBe('AAPL');
    });

    it('persists currency setting', () => {
      const data = App.State.getPortfolioData();
      data.settings.currency = 'USD';
      App.State.setPortfolioData(data);

      App.State.init();
      expect(App.State.getPortfolioData().settings.currency).toBe('USD');
    });

    it('getPortfolioSettings returns settings object', () => {
      const s = App.State.getPortfolioSettings();
      expect(s).toHaveProperty('currency');
      expect(s).toHaveProperty('theme');
    });

    it('setPortfolioSettings merges settings', () => {
      App.State.setPortfolioSettings({ currency: 'INR' });
      expect(App.State.getPortfolioSettings().currency).toBe('INR');
    });
  });

  // ── Habits ────────────────────────────────────────────────────────

  describe('habits', () => {
    it('persists habits data', () => {
      App.State.setHabitsData({ habits: [{ id: 'h1', name: 'Meditate' }], logs: [] });
      App.State.init();
      expect(App.State.getHabitsData().habits[0].name).toBe('Meditate');
    });

    it('returns empty arrays by default', () => {
      const hd = App.State.getHabitsData();
      expect(hd.habits).toHaveLength(0);
      expect(hd.logs).toHaveLength(0);
    });
  });

  // ── Gist credentials ─────────────────────────────────────────────

  describe('gist credentials', () => {
    it('setGistCredentials stores token', () => {
      App.State.setGistCredentials({ token: 'ghp_mytoken' });
      expect(App.State.getGistCredentials().token).toBe('ghp_mytoken');
    });

    it('setGistCredentials supports partial update (id only)', () => {
      App.State.setGistCredentials({ token: 'tok' });
      App.State.setGistCredentials({ id: 'abc123' });
      const creds = App.State.getGistCredentials();
      expect(creds.token).toBe('tok');  // unchanged
      expect(creds.id).toBe('abc123');
    });

    it('clearGistCredentials wipes token and id', () => {
      App.State.setGistCredentials({ token: 'ghp_abc', id: 'gist123' });
      App.State.clearGistCredentials();
      const creds = App.State.getGistCredentials();
      expect(creds.token).toBe('');
      expect(creds.id).toBe('');
    });

    it('persists credentials across init()', () => {
      App.State.setGistCredentials({ token: 'ghp_persist', id: 'gist456' });
      App.State.init();
      expect(App.State.getGistCredentials().token).toBe('ghp_persist');
    });
  });

  // ── Legacy migration ──────────────────────────────────────────────

  describe('legacy gistToken migration', () => {
    it('migrates gistToken from portfolio.settings to gist namespace', () => {
      // Simulate old-format save (pre-migration)
      const legacyState = {
        portfolio: {
          transactions: [],
          deletedTransactions: [],
          priceCache: {},
          tickerMeta: {},
          lastRefreshTS: null,
          fxDaily: { USD: {}, INR: {} },
          fxLastFetch: null,
          settings: {
            currency: 'EUR',
            apiKey: '',
            cacheTTL: 14400000,
            theme: 'dark',
            gistToken: 'legacy_token',
            gistId: 'legacy_id',
          },
        },
        habits: { habits: [], logs: [] },
        ember: { sources: [], highlights: [], settings: {}, streak: {} },
        gist: { token: '', id: '', lastSync: '' },
      };
      localStorage.setItem('super_app_v1', JSON.stringify(legacyState));

      App.State.init();

      expect(App.State.getGistCredentials().token).toBe('legacy_token');
      expect(App.State.getGistCredentials().id).toBe('legacy_id');
    });

    it('does not overwrite new gist namespace if already populated', () => {
      const stateWithBoth = {
        portfolio: {
          transactions: [], deletedTransactions: [], priceCache: {}, tickerMeta: {},
          lastRefreshTS: null, fxDaily: { USD: {}, INR: {} }, fxLastFetch: null,
          settings: { currency: 'EUR', apiKey: '', cacheTTL: 14400000, theme: 'dark',
            gistToken: 'old_token', gistId: 'old_id' },
        },
        habits: { habits: [], logs: [] },
        ember: { sources: [], highlights: [], settings: {}, streak: {} },
        gist: { token: 'new_token', id: 'new_id', lastSync: '' },
      };
      localStorage.setItem('super_app_v1', JSON.stringify(stateWithBoth));

      App.State.init();

      // New namespace should win — migration is skipped
      expect(App.State.getGistCredentials().token).toBe('new_token');
      expect(App.State.getGistCredentials().id).toBe('new_id');
    });
  });

  // ── mergeAll ──────────────────────────────────────────────────────

  describe('mergeAll', () => {
    it('merges incoming portfolio data', () => {
      App.State.mergeAll({
        portfolio: {
          transactions: [{ id: '1', ticker: 'BTC' }],
          settings: { currency: 'USD' },
        },
      });
      expect(App.State.getPortfolioData().transactions[0].ticker).toBe('BTC');
      expect(App.State.getPortfolioSettings().currency).toBe('USD');
    });

    it('keeps defaults for missing namespaces', () => {
      App.State.mergeAll({ portfolio: { transactions: [] } });
      // habits not in incoming — should still have default shape
      expect(Array.isArray(App.State.getHabitsData().habits)).toBe(true);
    });

    it('persists merged state', () => {
      App.State.mergeAll({ habits: { habits: [{ id: 'h1', name: 'Run' }], logs: [] } });
      App.State.init();
      expect(App.State.getHabitsData().habits[0].name).toBe('Run');
    });
  });

  // ── resetAll ──────────────────────────────────────────────────────

  describe('resetAll', () => {
    it('wipes all data and reinitialises defaults', () => {
      App.State.setHabitsData({ habits: [{ id: 'h1', name: 'Run' }], logs: [] });
      App.State.resetAll();
      App.State.init();
      expect(App.State.getHabitsData().habits).toHaveLength(0);
    });
  });

  // ── storageInfo ───────────────────────────────────────────────────

  describe('storageInfo', () => {
    it('returns a non-empty string', () => {
      const info = App.State.storageInfo();
      expect(typeof info).toBe('string');
      expect(info.length).toBeGreaterThan(0);
    });
  });

});
