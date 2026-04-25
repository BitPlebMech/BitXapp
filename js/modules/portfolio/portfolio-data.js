'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * PORTFOLIO / DATA  —  Data shapes, CSV parsing, import state
 * ═══════════════════════════════════════════════════════════════════
 *
 * Contains:
 *   • Transaction and position data shape documentation
 *   • parseCsvText()  — parse raw CSV text into rawRows
 *   • buildPreviewRows() — finalise rows before import
 *   • csvState object  — stateful wizard scratch-pad
 *
 * This file has NO UI dependencies and NO network calls.
 * ═══════════════════════════════════════════════════════════════════
 */
window.App = window.App || {};
window.App.Portfolio = window.App.Portfolio || {};

window.App.Portfolio.Data = (() => {

  /* ── Data Shape Documentation ─────────────────────────────────── */

  /**
   * Transaction record (stored in App.State.getPortfolioData().transactions)
   * {
   *   id:     string   — unique ID (Date.now().toString(36) + random)
   *   date:   string   — ISO date 'YYYY-MM-DD'
   *   ticker: string   — e.g. 'AAPL', 'BTC'
   *   type:   string   — 'BUY' | 'SELL'
   *   qty:    number   — quantity of shares/tokens
   *   price:  number   — price per unit in EUR (internal base currency)
   *   fees:   number   — total fees in EUR (optional, default 0)
   *   taxes:  number   — taxes paid in EUR (optional, default 0)
   *   notes:  string   — user notes (optional)
   * }
   */

  /**
   * CSV expected columns (case-insensitive):
   *   Date | Ticker | ISIN | WKN | Type | Quantity | Price | Currency | Fees | Taxes | Notes
   */

  /* ── CSV parsing constants ────────────────────────────────────── */

  /** Supported column name variants (lowercased for matching) */
  const COL_ALIASES = {
    date:     ['date', 'trade date', 'transaction date', 'value date', 'datum'],
    ticker:   ['ticker', 'symbol', 'stock', 'asset', 'wertpapier'],
    isin:     ['isin'],
    wkn:      ['wkn'],
    type:     ['type', 'side', 'direction', 'transactiontype', 'typ'],
    qty:      ['quantity', 'qty', 'amount', 'shares', 'units', 'anzahl', 'menge'],
    price:    ['price', 'unit price', 'preis', 'kurs', 'price eur', 'price usd', 'rate'],
    currency: ['currency', 'ccy', 'cur', 'währung'],
    fees:     ['fees', 'fee', 'commission', 'gebühren', 'kosten'],
    taxes:    ['taxes', 'tax', 'withholding', 'steuern'],
    notes:    ['notes', 'note', 'comment', 'memo', 'remarks'],
  };

  /* ── CSV wizard state ─────────────────────────────────────────── */

  /**
   * Stateful scratch-pad for the 3-step import wizard.
   * Reset when openCsvImport() is called.
   */
  const csvState = {
    step: 1,
    rawText: '',
    rawRows: [],      // [{ date, ticker, isin, wkn, type, qty, price, currency, fees, taxes, notes }]
    isinMap: {},      // { [isin]: { status:'pending'|'ok'|'manual'|'error', ticker, companyName } }
    previewRows: [],  // Finalised rows for step-3 preview and import
    dupCount: 0,
  };

  /* ── Asset class detection (inlined to avoid parent-module dependency) ── */

  /**
   * ARCH-02 fix: guessClass was previously delegated to window.App.Portfolio.guessClass,
   * creating a circular sub-module→parent dependency.  The sets are inlined here so
   * portfolio-data.js has no runtime dependency on its parent module.
   *
   * Keep this in sync with the CRYPTO_TICKERS / ETF_TICKERS / BOND_TICKERS
   * constants in portfolio.js if they are ever expanded.
   */
  const _CRYPTO_TICKERS = new Set(['BTC','ETH','SOL','ADA','XRP','DOT','DOGE','MATIC','LINK','UNI','ATOM','AVAX']);
  const _ETF_TICKERS    = new Set(['SPY','QQQ','VOO','VTI','IVV','VUG','ARKK','GLD','SLV','TLT','HYG','IEF','XLK','XLF','IWM','EEM','VEA','VWO','SCHD','JEPI','VGT','SMH','SOXX','XBI','BOTZ','USO','IAU']);
  const _BOND_TICKERS   = new Set(['TLT','HYG','IEF','LQD','BND','AGG','SHY','TIP','MBB']);

  function _guessClass(ticker) {
    if (_CRYPTO_TICKERS.has(ticker)) return 'Crypto';
    if (_BOND_TICKERS.has(ticker))   return 'Bond';
    if (_ETF_TICKERS.has(ticker))    return 'ETF';
    return 'Stock';
  }

  /* ── Helpers ──────────────────────────────────────────────────── */

  /** Find the column index for a semantic field in a header row */
  function _findCol(headers, field) {
    const aliases = COL_ALIASES[field] || [field];
    for (let i = 0; i < headers.length; i++) {
      if (aliases.includes(headers[i].toLowerCase().trim())) return i;
    }
    return -1;
  }

  /** Normalise type string to 'BUY' | 'SELL' | null */
  function _normaliseType(raw) {
    if (!raw) return null;
    const s = raw.trim().toUpperCase();
    if (['BUY', 'B', 'KAUF', 'PURCHASE', 'IN'].includes(s)) return 'BUY';
    if (['SELL', 'S', 'VERKAUF', 'SALE', 'OUT'].includes(s)) return 'SELL';
    return null;
  }

  /** Normalise date string to ISO 'YYYY-MM-DD' or null */
  function _normaliseDate(raw) {
    if (!raw) return null;
    const s = raw.trim();

    // Already ISO: 2024-03-15
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // DD.MM.YYYY or DD/MM/YYYY (European)
    const euMatch = s.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
    if (euMatch) return `${euMatch[3]}-${euMatch[2]}-${euMatch[1]}`;

    // MM/DD/YYYY (US)
    const usMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (usMatch) {
      const [, mm, dd, yyyy] = usMatch;
      if (parseInt(mm) > 12) return `${yyyy}-${dd}-${mm}`;  // Likely DD/MM
      return `${yyyy}-${mm}-${dd}`;
    }

    // Try native Date parse as last resort
    const d = new Date(s);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);

    return null;
  }

  /** Parse a number that may use EU (comma) or US (period) decimal notation */
  function _parseNum(s) {
    if (typeof s === 'number') return s;
    if (!s) return 0;
    const str = String(s).trim().replace(/[€$£¥₹]/g, '');
    // EU format: 1.234,56
    if (/\d\.\d{3},/.test(str)) return parseFloat(str.replace(/\./g, '').replace(',', '.'));
    // Has both: use comma as decimal if comma comes last
    if (str.includes(',') && str.includes('.')) {
      return str.lastIndexOf(',') > str.lastIndexOf('.')
        ? parseFloat(str.replace(/\./g, '').replace(',', '.'))
        : parseFloat(str.replace(/,/g, ''));
    }
    if (str.includes(',') && !str.includes('.')) return parseFloat(str.replace(',', '.'));
    return parseFloat(str.replace(/,/g, '')) || 0;
  }

  /* ── Public API ───────────────────────────────────────────────── */

  /**
   * Parse raw CSV text into an array of normalised row objects.
   * Tries comma, semicolon, and tab delimiters in order.
   *
   * @param {string} text - Raw CSV content
   * @returns {Array<Object>} rawRows suitable for isinMap building
   */
  function parseCsvText(text) {
    if (!text || !text.trim()) return [];

    // Detect delimiter: try comma → semicolon → tab
    const firstLine = text.trim().split('\n')[0];
    const delimiter = firstLine.includes(';')
      ? ';'
      : firstLine.includes('\t') ? '\t' : ',';

    // Simple CSV tokenizer (handles quoted fields)
    function tokenize(line) {
      const fields = [];
      let cur = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
          else inQuote = !inQuote;
        } else if (ch === delimiter && !inQuote) {
          fields.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      fields.push(cur);
      return fields;
    }

    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const headers = tokenize(lines[0]);
    const colIdx = {};
    for (const field of Object.keys(COL_ALIASES)) {
      colIdx[field] = _findCol(headers, field);
    }

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = tokenize(lines[i]);
      if (fields.length < 3) continue; // Skip empty/short lines

      const g = (field) => colIdx[field] >= 0 ? (fields[colIdx[field]] || '').trim() : '';

      const dateISO = _normaliseDate(g('date'));
      if (!dateISO) continue; // Skip rows with no valid date

      const type = _normaliseType(g('type'));
      if (!type) continue; // Skip rows with no valid type

      const qty = _parseNum(g('qty'));
      if (!qty || qty <= 0) continue;

      rows.push({
        dateISO,
        ticker:   g('ticker').toUpperCase(),
        isin:     g('isin').toUpperCase(),
        wkn:      g('wkn').toUpperCase(),
        type,
        qty,
        price:    _parseNum(g('price')),
        currency: (g('currency') || 'EUR').toUpperCase(),
        fees:     _parseNum(g('fees')),
        taxes:    _parseNum(g('taxes')),
        notes:    g('notes'),
      });
    }

    return rows;
  }

  /**
   * Build the final previewRows from rawRows + resolved isinMap.
   * Deduplicates against existing transactions in state.
   * Mutates csvState.previewRows and csvState.dupCount.
   */
  function buildPreviewRows() {
    const portfolio = window.App.State.getPortfolioData();
    const existingTxs = portfolio.transactions || [];
    const tickerMeta  = portfolio.tickerMeta || {};

    // Build a duplicate-detection set: date|ticker|type|qty
    const existingSet = new Set(
      existingTxs.map(t => `${t.date}|${t.ticker}|${t.type}|${+t.qty}`)
    );

    csvState.previewRows = [];
    csvState.dupCount = 0;

    for (const row of csvState.rawRows) {
      // Resolve ticker from ISIN if needed
      let ticker = row.ticker;
      if (!ticker && row.isin && csvState.isinMap[row.isin]) {
        ticker = csvState.isinMap[row.isin].ticker || '';
      }
      if (!ticker) continue;

      ticker = ticker.toUpperCase();

      // Resolve company name
      let companyName = '';
      if (row.isin && csvState.isinMap[row.isin]?.companyName) {
        companyName = csvState.isinMap[row.isin].companyName;
      } else if (tickerMeta[ticker]?.companyName) {
        companyName = tickerMeta[ticker].companyName;
      }

      // Convert price to EUR if needed
      let priceEUR = row.price;
      if (row.currency && row.currency !== 'EUR') {
        if (row.currency === 'USD' && typeof window.App.Portfolio?.usdToEur === 'function') {
          // ARCH-02 note: usdToEur reads live FX rates managed by App.Portfolio.
          // This is an intentional sub-module dependency — data.js is part of
          // the Portfolio module and usdToEur cannot be inlined without duplicating
          // the entire FX state.  Optional-chain ensures graceful fallback.
          priceEUR = window.App.Portfolio.usdToEur(row.price, row.dateISO);
        } else if (!['EUR', 'USD'].includes(row.currency)) {
          console.warn(`[CSV] Unsupported currency ${row.currency} for ${ticker} — price stored as-is`);
        }
      }

      // ARCH-02 fix: use inlined _guessClass instead of calling parent module
      const cls = tickerMeta[ticker]?.cls || _guessClass(ticker);

      const dupKey = `${row.dateISO}|${ticker}|${row.type}|${row.qty}`;
      const isDuplicate = existingSet.has(dupKey);
      if (isDuplicate) csvState.dupCount++;

      csvState.previewRows.push({
        dateISO: row.dateISO,
        ticker,
        companyName,
        type:       row.type,
        shares:     row.qty,
        priceEUR:   priceEUR || 0,
        fee:        row.fees || 0,
        tax:        row.taxes || 0,
        notes:      row.notes || '',
        cls,
        isDuplicate,
      });
    }
  }

  /* ── Exports ──────────────────────────────────────────────────── */

  return {
    csvState,
    parseCsvText,
    buildPreviewRows,
    COL_ALIASES,
  };

})();
