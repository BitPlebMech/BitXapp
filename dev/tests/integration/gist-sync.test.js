/**
 * Integration tests — Gist save/load round-trip.
 * fetch is mocked; no real network calls are made.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../../js/core/utils.js';
import '../../js/core/state.js';
import '../../js/core/gist.js';

// ── Mock fetch helper ──────────────────────────────────────────────

function mockFetch(responseBody, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => responseBody,
  });
}

beforeEach(() => {
  App.State.init();
  vi.restoreAllMocks();
});

// ── savePortfolioData ─────────────────────────────────────────────

describe('App.Gist.savePortfolioData', () => {
  it('sends POST when no id provided (new gist)', async () => {
    vi.stubGlobal('fetch', mockFetch({ id: 'new123', html_url: 'https://gist.github.com/new123' }));

    const result = await App.Gist.savePortfolioData(
      { portfolio: { transactions: [] }, gist: {} },
      'ghp_token',
      ''
    );

    const call = fetch.mock.calls[0];
    expect(call[1].method).toBe('POST');
    expect(call[0]).toBe('https://api.github.com/gists');
    expect(result.id).toBe('new123');
  });

  it('sends PATCH when id is provided (existing gist)', async () => {
    vi.stubGlobal('fetch', mockFetch({ id: 'existing456', html_url: 'https://gist.github.com/existing456' }));

    await App.Gist.savePortfolioData(
      { portfolio: {}, gist: {} },
      'ghp_token',
      'existing456'
    );

    const call = fetch.mock.calls[0];
    expect(call[1].method).toBe('PATCH');
    expect(call[0]).toContain('existing456');
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', mockFetch({ message: 'Bad credentials' }, false, 401));

    await expect(
      App.Gist.savePortfolioData({ portfolio: {}, gist: {} }, 'bad_token', '')
    ).rejects.toThrow('Bad credentials');
  });

  it('throws when no token provided', async () => {
    await expect(
      App.Gist.savePortfolioData({ portfolio: {}, gist: {} }, '', '')
    ).rejects.toThrow('GitHub token is required');
  });

  it('scrubs token from payload before sending', async () => {
    vi.stubGlobal('fetch', mockFetch({ id: 'x', html_url: '' }));

    await App.Gist.savePortfolioData(
      { portfolio: {}, gist: { token: 'ghp_secret123' } },
      'ghp_token',
      ''
    );

    const sentBody = JSON.parse(fetch.mock.calls[0][1].body);
    const fileContent = sentBody.files['portfolio-data.json'].content;
    expect(fileContent).not.toContain('ghp_secret123');
  });
});

// ── loadPortfolioData ─────────────────────────────────────────────

describe('App.Gist.loadPortfolioData', () => {
  it('returns parsed portfolio payload', async () => {
    const payload = { portfolio: { transactions: [{ id: '1', ticker: 'AAPL' }] }, _saved: '2025-01-01T00:00:00Z' };
    vi.stubGlobal('fetch', mockFetch({
      files: { 'portfolio-data.json': { content: JSON.stringify(payload) } },
    }));

    const result = await App.Gist.loadPortfolioData('ghp_token', 'gist123');
    expect(result.portfolio.transactions[0].ticker).toBe('AAPL');
  });

  it('throws when portfolio-data.json not found in gist', async () => {
    vi.stubGlobal('fetch', mockFetch({ files: {} }));

    await expect(
      App.Gist.loadPortfolioData('ghp_token', 'gist123')
    ).rejects.toThrow('"portfolio-data.json" not found');
  });

  it('throws on invalid JSON content', async () => {
    vi.stubGlobal('fetch', mockFetch({
      files: { 'portfolio-data.json': { content: 'not valid json {{' } },
    }));

    await expect(
      App.Gist.loadPortfolioData('ghp_token', 'gist123')
    ).rejects.toThrow('not valid JSON');
  });

  it('throws when no id provided', async () => {
    await expect(
      App.Gist.loadPortfolioData('ghp_token', '')
    ).rejects.toThrow('Gist ID is required');
  });
});

// ── saveEmberData ─────────────────────────────────────────────────

describe('App.Gist.saveEmberData', () => {
  it('saves ember highlights to ember-highlights.json', async () => {
    vi.stubGlobal('fetch', mockFetch({ id: 'gist123', html_url: '' }));

    await App.Gist.saveEmberData(
      { highlights: [{ id: 'h1', text: 'Quote' }], settings: {}, streak: {} },
      'ghp_token',
      'gist123'
    );

    const sentBody = JSON.parse(fetch.mock.calls[0][1].body);
    expect(sentBody.files['ember-highlights.json']).toBeDefined();

    const content = JSON.parse(sentBody.files['ember-highlights.json'].content);
    expect(content.highlights[0].text).toBe('Quote');
  });
});

// ── Full round-trip: save then load ───────────────────────────────

describe('Gist round-trip', () => {
  it('data saved matches data loaded', async () => {
    const originalPayload = {
      portfolio: {
        transactions: [
          { id: 'tx1', ticker: 'NVDA', type: 'BUY', qty: 5, price: 600, date: '2024-03-01' },
        ],
        settings: { currency: 'USD' },
      },
      gist: { token: '', id: 'round-trip-gist' },
    };

    // Intercept save and capture what was written
    let writtenContent;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url, opts) => {
      if (opts?.method === 'PATCH') {
        const body = JSON.parse(opts.body);
        writtenContent = body.files['portfolio-data.json'].content;
        return Promise.resolve({ ok: true, json: async () => ({ id: 'round-trip-gist', html_url: '' }) });
      }
      // Load call
      return Promise.resolve({
        ok: true,
        json: async () => ({ files: { 'portfolio-data.json': { content: writtenContent } } }),
      });
    }));

    // Save
    await App.Gist.savePortfolioData(originalPayload, 'ghp_token', 'round-trip-gist');

    // Load
    const loaded = await App.Gist.loadPortfolioData('ghp_token', 'round-trip-gist');

    expect(loaded.portfolio.transactions[0].ticker).toBe('NVDA');
    expect(loaded.portfolio.settings.currency).toBe('USD');
  });
});
