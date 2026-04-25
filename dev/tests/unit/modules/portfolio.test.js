/**
 * Portfolio module — unit tests for pure business logic.
 *
 * Tests go through the public App.Portfolio API (formatters, XIRR, CAGR,
 * CRUD). The full rendering stack is covered by e2e tests.
 *
 * NOTE on locale: portfolio.fmtNum uses Intl.NumberFormat with the locale
 * determined by the active currency (EUR→de-DE, USD→en-US, INR→en-IN).
 * Tests that check formatted output either:
 *   a) Set currency to USD (en-US, dot decimal) for predictable output, or
 *   b) Assert structure (sign, units) rather than exact decimal separator.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../../../js/core/utils.js';
import '../../../js/core/constants.js';
import '../../../js/core/theme-tokens.js';
import '../../../js/core/state.js';
import '../../../js/core/gist.js';
import '../../../js/core/app-shell.js';
import '../../../js/modules/portfolio/portfolio-data.js';
import '../../../js/modules/portfolio/portfolio.js';

// ── Helpers ────────────────────────────────────────────────────────

function setUSDCurrency() {
  const data = App.State.getPortfolioData();
  data.settings.currency = 'USD';
  App.State.setPortfolioData(data);
}

// ── Module bootstrap (minimal — no full DOM render) ────────────────

beforeEach(() => {
  App.State.init();

  // Minimal DOM elements the module references
  document.body.innerHTML = `
    <select id="h-currency">
      <option value="EUR">EUR</option>
      <option value="USD">USD</option>
      <option value="INR">INR</option>
    </select>
    <div id="h-gist-status"></div>
    <div id="h-source-badge"></div>
    <div id="storage-status"></div>
  `;

  App.State.setPortfolioData({
    transactions: [],
    deletedTransactions: [],
    priceCache: {},
    tickerMeta: {},
    lastRefreshTS: null,
    fxDaily: { USD: {}, INR: {} },
    fxLastFetch: null,
    settings: { currency: 'EUR', apiKey: '', cacheTTL: 14400000, theme: 'dark' },
  });

  // Stub shell so registerModule doesn't crash without a sidebar
  if (!window.App.Shell) {
    window.App.Shell = { registerModule: vi.fn(), toast: vi.fn(), confirmAction: vi.fn() };
  }

  // Stub portfolio UI to prevent DOM operations
  window.App.PortfolioUI = { setupEventListeners: vi.fn(), render: vi.fn() };
});

// ── fmtXIRR ───────────────────────────────────────────────────────

describe('App.Portfolio.fmtXIRR', () => {
  it('returns "—" for null', () => {
    expect(App.Portfolio.fmtXIRR(null)).toBe('—');
  });

  it('returns "—" for undefined', () => {
    expect(App.Portfolio.fmtXIRR(undefined)).toBe('—');
  });

  it('returns "—" for NaN', () => {
    expect(App.Portfolio.fmtXIRR(NaN)).toBe('—');
  });

  it('returns "—" for Infinity', () => {
    expect(App.Portfolio.fmtXIRR(Infinity)).toBe('—');
  });

  it('includes % XIRR suffix and sign for positive value', () => {
    const result = App.Portfolio.fmtXIRR(12.5);
    expect(result).toMatch(/^\+/);
    expect(result).toContain('% XIRR');
  });

  it('includes negative sign for negative value', () => {
    expect(App.Portfolio.fmtXIRR(-8.3)).toMatch(/^-/);
  });

  it('formats zero with + sign', () => {
    expect(App.Portfolio.fmtXIRR(0)).toMatch(/^\+/);
    expect(App.Portfolio.fmtXIRR(0)).toContain('% XIRR');
  });
});

// ── fmtCAGR ───────────────────────────────────────────────────────

describe('App.Portfolio.fmtCAGR', () => {
  it('returns "< 1yr" for null', () => {
    expect(App.Portfolio.fmtCAGR(null)).toBe('< 1yr');
  });

  it('returns "< 1yr" for undefined', () => {
    expect(App.Portfolio.fmtCAGR(undefined)).toBe('< 1yr');
  });

  it('returns "< 1yr" for NaN', () => {
    expect(App.Portfolio.fmtCAGR(NaN)).toBe('< 1yr');
  });

  it('includes % p.a. suffix and + sign for positive', () => {
    const result = App.Portfolio.fmtCAGR(7.2);
    expect(result).toMatch(/^\+/);
    expect(result).toContain('% p.a.');
  });

  it('includes - sign for negative', () => {
    expect(App.Portfolio.fmtCAGR(-3.1)).toMatch(/^-/);
  });
});

// ── fmtDate ───────────────────────────────────────────────────────

describe('App.Portfolio.fmtDate', () => {
  it('formats ISO date string correctly', () => {
    expect(App.Portfolio.fmtDate('2025-01-01')).toBe('01 Jan 2025');
  });

  it('does not shift day due to midnight UTC issue', () => {
    // Regression: using T00:00:00 can shift date in negative-offset timezones
    const result = App.Portfolio.fmtDate('2025-03-01');
    expect(result).toContain('01');
    expect(result).toContain('Mar 2025');
  });
});

// ── fmtNum ────────────────────────────────────────────────────────
// Use USD currency so locale is en-US (dot decimal, comma thousands)

describe('App.Portfolio.fmtNum (USD locale)', () => {
  beforeEach(() => setUSDCurrency());

  it('returns "—" for null', () => {
    expect(App.Portfolio.fmtNum(null)).toBe('—');
  });

  it('returns "—" for NaN', () => {
    expect(App.Portfolio.fmtNum(NaN)).toBe('—');
  });

  it('formats 0 to two decimal places', () => {
    expect(App.Portfolio.fmtNum(0)).toBe('0.00');
  });

  it('formats thousands correctly', () => {
    expect(App.Portfolio.fmtNum(1000, 0)).toBe('1,000');
  });
});

// ── fmtPct ────────────────────────────────────────────────────────
// Use USD currency so locale is en-US

describe('App.Portfolio.fmtPct (USD locale)', () => {
  beforeEach(() => setUSDCurrency());

  it('returns "—" for null', () => {
    expect(App.Portfolio.fmtPct(null)).toBe('—');
  });

  it('formats positive with + sign and dot decimal', () => {
    const result = App.Portfolio.fmtPct(12.34);
    expect(result).toBe('+12.34 %');
  });

  it('formats negative correctly', () => {
    expect(App.Portfolio.fmtPct(-5.5)).toBe('-5.50 %');
  });
});

// ── Currency sync on init ─────────────────────────────────────────

describe('Currency UI sync', () => {
  it('h-currency dropdown reflects saved INR setting after init', () => {
    const data = App.State.getPortfolioData();
    data.settings.currency = 'INR';
    App.State.setPortfolioData(data);

    // Silence any errors from init DOM ops
    try { App.Portfolio.init(); } catch (_) { /* ignore render errors in test env */ }

    expect(document.getElementById('h-currency').value).toBe('INR');
  });
});

// ── addTransaction / CRUD ─────────────────────────────────────────

describe('App.Portfolio transaction CRUD', () => {
  const sampleTx = {
    date: '2024-01-15', ticker: 'AAPL', type: 'BUY',
    qty: 10, price: 180, fees: 5, taxes: 0, notes: '',
  };

  it('addTransaction stores a transaction', () => {
    App.Portfolio.addTransaction({ ...sampleTx });
    expect(App.State.getPortfolioData().transactions).toHaveLength(1);
    expect(App.State.getPortfolioData().transactions[0].ticker).toBe('AAPL');
  });

  it('addTransaction assigns a unique id per transaction', () => {
    App.Portfolio.addTransaction({ ...sampleTx });
    App.Portfolio.addTransaction({ ...sampleTx, date: '2024-02-01' });
    const txs = App.State.getPortfolioData().transactions;
    expect(txs[0].id).not.toBe(txs[1].id);
  });

  it('deleteTransaction soft-deletes to deletedTransactions', () => {
    App.Portfolio.addTransaction({ ...sampleTx });
    const id = App.State.getPortfolioData().transactions[0].id;
    App.Portfolio.deleteTransaction(id);

    const { transactions, deletedTransactions } = App.State.getPortfolioData();
    expect(transactions).toHaveLength(0);
    expect(deletedTransactions).toHaveLength(1);
    expect(deletedTransactions[0].id).toBe(id);
  });

  it('restoreTransaction moves tx back from deleted', () => {
    App.Portfolio.addTransaction({ ...sampleTx });
    const id = App.State.getPortfolioData().transactions[0].id;
    App.Portfolio.deleteTransaction(id);
    App.Portfolio.restoreTransaction(id);

    const { transactions, deletedTransactions } = App.State.getPortfolioData();
    expect(transactions).toHaveLength(1);
    expect(deletedTransactions).toHaveLength(0);
  });

  it('editTransaction updates fields', () => {
    App.Portfolio.addTransaction({ ...sampleTx });
    const id = App.State.getPortfolioData().transactions[0].id;
    App.Portfolio.editTransaction(id, { notes: 'updated' });
    expect(App.State.getPortfolioData().transactions[0].notes).toBe('updated');
  });
});

// ── Gist save race condition (App.Shell) ──────────────────────────

describe('App.Shell.triggerGistSave — race condition lock', () => {
  it('blocks second call while first is in flight', async () => {
    let saveResolve;
    window.App.Gist = {
      savePortfolioData: vi.fn(() => new Promise(res => { saveResolve = res; })),
      saveEmberData:     vi.fn(() => Promise.resolve({ id: 'x', url: '' })),
    };
    window.App.State.setGistCredentials({ token: 'tok', id: 'gist1' });

    // First call — stays in-flight
    App.Shell.triggerGistSave();

    // Second call — should be blocked (lock is set)
    App.Shell.triggerGistSave();

    // Only one network call should have been made
    expect(window.App.Gist.savePortfolioData).toHaveBeenCalledTimes(1);

    // Resolve the pending save
    if (saveResolve) saveResolve({ id: 'gist1', url: '' });
  });
});
