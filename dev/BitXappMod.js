'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PORTFOLIO TERMINAL — APPLICATION CORE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * A zero-dependency personal investment tracker for stocks, ETFs, and crypto.
 * Built with vanilla HTML/CSS/JavaScript — no frameworks, no build tools.
 * 
 * ARCHITECTURE
 * ────────────────────────────────────────────────────────────────────────────
 * • Single IIFE pattern: All logic encapsulated, only `App` object exported
 * • Event-driven UI: Event listeners attached during init (setupEventListeners)
 * • State persistence: localStorage + optional GitHub Gist sync
 * • Reactive rendering: UI updates automatically when state changes
 * 
 * DATA FLOW
 * ────────────────────────────────────────────────────────────────────────────
 * 1. Load state from localStorage (or seed sample data if empty)
 * 2. Apply saved theme preference (light/dark)
 * 3. Attach all event listeners to UI elements
 * 4. Render UI immediately with cached/mock prices (instant display)
 * 5. Fetch current ECB FX rates in background (async, re-renders on success)
 * 6. Fetch historical FX data if stale (async, persisted for offline use)
 * 7. Fetch live prices from CoinGecko/Yahoo (async, updates UI on completion)
 * 
 * KEY FEATURES
 * ────────────────────────────────────────────────────────────────────────────
 * • Multi-currency support: EUR (base), USD, INR with historical ECB rates
 * • FIFO lot tracking: Accurate P&L calculation with same-date BUY-before-SELL
 * • Real-time pricing: CoinGecko (crypto), Yahoo Finance (stocks/ETFs)
 * • Performance metrics: P&L, P&L%, CAGR, XIRR per position and lot
 * • CSV import/export: Bulk transaction management with ISIN resolution
 * • Offline-first: Works without network, cached prices valid for 4 hours
 * 
 * SECTION INDEX (Ctrl+F to navigate)
 * ────────────────────────────────────────────────────────────────────────────
 * DOM HELPER · CONSTANTS · STATE · PERSISTENCE · FX RATES · PRICE ENGINE
 * XIRR · PORTFOLIO CALCULATIONS · FORMATTING · COLOURS · CRUD OPERATIONS
 * RENDER PIPELINE · OVERVIEW TAB · POSITIONS TAB · HISTORY TAB · DRAWER
 * DUMBBELL CHART · MODAL · CSV IMPORT · SETTINGS · DATA MANAGEMENT
 * SAMPLE DATA · TOAST · KEYBOARD · THEME · GIST SYNC · EVENT LISTENERS
 * INITIALISATION · PUBLIC API
 * 
 * DEBUGGING
 * ────────────────────────────────────────────────────────────────────────────
 * • State is inside IIFE closure — not accessible from console directly
 * • To inspect: JSON.parse(localStorage.getItem('portfolio_v3'))
 * • Console logging: Search for console.info/warn/error throughout code
 * • FX diagnostics: Settings panel → FX Diagnostics → Test API
 * 
 * IMPORTANT PATTERNS
 * ────────────────────────────────────────────────────────────────────────────
 * • Always call saveState() after mutating state (transactions, settings, etc)
 * • FIFO calculation requires deterministic sort (BUYs before SELLs on same date)
 * • Currency conversion uses getFxRate() with fallback chain: cached → latest → hardcoded
 * • Price fetching is fault-tolerant: each ticker fails independently
 * • All network calls use fetchWithTimeout() to avoid hanging forever
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */
const App = (function () {

  /* ═══════════════════════════════════════════════════════════════════
     DOM HELPER
     Short alias for getElementById — used throughout the app.
     ═══════════════════════════════════════════════════════════════════ */
  /** @param {string} id @returns {HTMLElement|null} */
  function el(id) { return document.getElementById(id); }

  /* ═══════════════════════════════════════════════════════════════════
     CONSTANTS & REFERENCE DATA
     Static lookup tables that never change at runtime.
     ═══════════════════════════════════════════════════════════════════ */

  /** localStorage key for persisted state */
  const STORAGE_KEY = 'portfolio_v3';

  /** Minimum quantity threshold — treats values below this as zero to avoid floating-point dust */
  const QTY_EPSILON = 0.00001;

  /* ─── Configuration Constants ────────────────────────────────────────
     Timing, caching, and API limits that control app behavior.
     Adjust these to tune performance vs freshness tradeoffs. */
  
  /** Price cache TTL in milliseconds (default: 4 hours = 14400000ms) */
  const DEFAULT_CACHE_TTL_MS = 14400000;
  
  /** Network fetch timeout in milliseconds */
  const FETCH_TIMEOUT_MS = {
    quick: 4000,    // CoinGecko, Yahoo Finance quick checks
    standard: 5000, // ECB latest FX rate
    slow: 10000,    // Alpha Vantage (optional API)
    bulk: 25000,    // ECB historical data (2021→today)
  };
  
  /** Maximum number of deleted transactions kept for recovery */
  const MAX_DELETED_HISTORY = 10;
  
  /** CORS proxy for Frankfurter API (workaround for missing CORS headers)
   *  Frankfurter API blocks JavaScript fetch from GitHub Pages origins.
   *  Set to null to disable proxy if Frankfurter fixes their CORS policy. */
  const CORS_PROXY = 'https://corsproxy.io/?';
  
  /** Minimum holding period (in years) required to calculate CAGR */
  const MIN_CAGR_YEARS = 0.5;

  /** Colour palette for individual positions in charts/donuts */
  const PALETTE = [
    '#5b9cff', '#00dba8', '#a07cf8', '#ffaa20', '#ff6b9d',
    '#00d4ff', '#ff9848', '#06b6d4', '#8b5cf6', '#a3e635'
  ];

  /** Distinct colours for FIFO lot indicators (up to 10 lots) */
  const LOT_COLORS = [
    '#5b9cff', '#00dba8', '#a07cf8', '#ffaa20', '#ff6b9d',
    '#00d4ff', '#ff9848', '#ff3d5a', '#39e88e', '#e879f9'
  ];

  /** Asset class → colour mapping for "By Class" donut */
  const CLASS_COLORS = { Stock: '#5b9cff', ETF: '#a07cf8', Crypto: '#e8732a', Bond: '#00d4ff', MF: '#00dba8' };

  /** Asset class → CSS badge class mapping */
  const CLS_CSS = { Stock: 'cb-stock', ETF: 'cb-etf', Crypto: 'cb-crypto', Bond: 'cb-bond', MF: 'cb-mf' };

  /** Display currency → symbol mapping */
  const CUR_SYMBOLS = { EUR: '€', USD: '$', INR: '₹' };

  /** Well-known ticker → full company name for display */
  const TICKER_NAMES = {
    AAPL: 'Apple Inc.', MSFT: 'Microsoft Corp.', GOOGL: 'Alphabet Inc.',
    AMZN: 'Amazon.com', META: 'Meta Platforms', NVDA: 'NVIDIA Corp.',
    TSLA: 'Tesla Inc.', BRKB: 'Berkshire Hathaway', JPM: 'JPMorgan Chase',
    V: 'Visa Inc.', MA: 'Mastercard', SPY: 'SPDR S&P 500 ETF',
    QQQ: 'Invesco QQQ', VOO: 'Vanguard S&P 500', VTI: 'Vanguard Total Mkt',
    IVV: 'iShares S&P 500', GLD: 'SPDR Gold ETF', TLT: 'iShares 20yr Treasury',
    HYG: 'iShares HY Corp Bond', BTC: 'Bitcoin', ETH: 'Ethereum',
    SOL: 'Solana', ADA: 'Cardano', XRP: 'Ripple', AMD: 'AMD Inc.',
    NFLX: 'Netflix Inc.', DIS: 'Walt Disney', PLTR: 'Palantir',
    UBER: 'Uber Technologies', INTC: 'Intel Corp.', BAC: 'Bank of America',
    GS: 'Goldman Sachs', WMT: 'Walmart', COST: 'Costco',
    ORCL: 'Oracle', CRM: 'Salesforce',
  };

  /** Sets for auto-detecting asset class from ticker symbol */
  const CRYPTO_TICKERS = new Set(['BTC', 'ETH', 'SOL', 'ADA', 'XRP', 'DOT', 'DOGE', 'MATIC', 'LINK', 'UNI', 'ATOM', 'AVAX']);
  const ETF_TICKERS    = new Set(['SPY', 'QQQ', 'VOO', 'VTI', 'IVV', 'VUG', 'ARKK', 'GLD', 'SLV', 'TLT', 'HYG', 'IEF', 'XLK', 'XLF', 'IWM', 'EEM', 'VEA', 'VWO', 'SCHD', 'JEPI', 'VGT', 'SMH', 'SOXX', 'XBI', 'BOTZ', 'USO', 'IAU']);
  const BOND_TICKERS   = new Set(['TLT', 'HYG', 'IEF', 'LQD', 'BND', 'AGG', 'SHY', 'TIP', 'MBB']);

  /** CoinGecko ID lookup for crypto tickers — used for free live crypto prices */
  const COINGECKO_IDS = {
    BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', ADA: 'cardano',
    XRP: 'ripple', DOT: 'polkadot', DOGE: 'dogecoin', MATIC: 'matic-network',
    LINK: 'chainlink', UNI: 'uniswap', ATOM: 'cosmos', AVAX: 'avalanche-2',
    BNB: 'binancecoin', LTC: 'litecoin', ALGO: 'algorand',
  };

  /* ═══════════════════════════════════════════════════════════════════
     APPLICATION STATE
     Mutable data that changes during the session.
     `state` is persisted to localStorage on every mutation.
     ═══════════════════════════════════════════════════════════════════ */

  /** Main persisted state object */
  let state = {
    transactions: [],          // Array of {id, date, ticker, type, qty, price(EUR), fees(EUR), taxes(EUR), notes}
    deletedTransactions: [],   // Last 10 deleted (MAX_DELETED_HISTORY), for recovery
    priceCache: {},            // {[ticker]: {price, ts, src}}
    tickerMeta: {},            // {[ticker]: {cls}}
    lastRefreshTS: null,       // Timestamp of last price refresh
    fxDaily: { USD: {}, INR: {} },  // Historical ECB rates (persisted for offline use)
    fxLastFetch: null,         // Timestamp of last successful FX fetch
    settings: {
      currency: 'EUR',         // Display currency: EUR | USD | INR
      apiKey: '',              // Alpha Vantage API key (optional)
      cacheTTL: DEFAULT_CACHE_TTL_MS,  // Price cache TTL in ms (4 hours)
      theme: 'dark',           // 'dark' | 'light' — persisted preference
      gistToken: '',           // GitHub PAT with gist scope
      gistId: '',              // GitHub Gist ID (auto-filled after first save)
    },
  };

  /** Latest known FX rates (fallback when APIs are unavailable)
   *  Updated April 2025 - these provide ~1% accuracy when live APIs fail */
  let fxLatest = { EUR: 1, USD: 1.09, INR: 92.0 };

  /** Whether we successfully loaded historical FX data */
  let fxLoaded = { USD: false, INR: false };
  
  /** Track API diagnostics for debugging */
  let fxDiagnostics = {
    lastAttempt: null,
    lastSuccess: null,
    lastError: null,
    httpStatus: null,
    errorType: null
  };

  /** UI filter state */
  let histFilter = 'all';   // History tab: 'all' | 'buy' | 'sell'
  let clsFilter = 'all';    // Positions tab: 'all' | 'Stock' | 'ETF' | etc.

  /** Confirm dialog callback — set when a confirmation is pending */
  let confirmCallback = null;

  /** Currently open drawer ticker, or null */
  let activeDrawer = null;

  /** Current modal transaction type */
  let modalType = 'BUY';

  /** Current identifier input mode in the Add Transaction modal */
  let _idMode = 'ticker'; // 'ticker' | 'isin' | 'wkn'

  /** Credentials popup callback — set when waiting for user to enter Gist token/ID */
  let _credCallback = null;

  /** Cache for deterministic ticker → colour assignments */
  const tickerColorCache = {};

  /* ═══════════════════════════════════════════════════════════════════
     PERSISTENCE (localStorage)
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * Load state from localStorage and merge with defaults.
   * Settings are deep-merged so new keys added in app updates survive old saves.
   */
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        // Deep-merge settings so any new setting keys (e.g. theme, gistToken)
        // are not lost when loading a save that predates them.
        const mergedSettings = { ...state.settings, ...(saved.settings || {}) };
        state = { ...state, ...saved, settings: mergedSettings };
        
        // Backward compatibility: Ensure new FX fields exist
        if (!state.fxDaily) state.fxDaily = { USD: {}, INR: {} };
        if (!state.fxLastFetch) state.fxLastFetch = null;
      }
    } catch (e) {
      console.warn('[Storage] Failed to load:', e.message);
    }
  }

  /**
   * Persist current state to localStorage only.
   * Gist sync is manual — use the Save to Gist button in the header.
   */
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      updateStorageStatus();
      updateGistSaveIndicator();
    } catch (e) {
      toast('Storage save failed', 'error');
    }
  }

  /** Update the storage info display in the settings panel */
  function updateStorageStatus() {
    const sizeKB = ((localStorage.getItem(STORAGE_KEY) || '').length * 2 / 1024).toFixed(1);
    const txCount = state.transactions.length;
    const posCount = new Set(state.transactions.map(t => t.ticker)).size;
    const target = el('sp-storage');
    if (target) {
      target.innerHTML = `<strong>${posCount} positions</strong> · <strong>${txCount} transactions</strong> · <strong>${sizeKB} KB</strong> in localStorage · Use the Gist button in the header to sync`;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     FX RATES — ECB via frankfurter.app
     Fetches full daily EUR→USD and EUR→INR history from 2021 onward.
     Used for accurate historical cost basis conversion.
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * Fetch the very latest ECB rate (may be same-day if published, otherwise last business day).
   * Called separately from historical fetch to ensure fxLatest is as fresh as possible.
   */
  /** Fetch with a timeout using Promise.race — avoids AbortController cloning issues */
  function fetchWithTimeout(url, ms = 5000, options = {}) {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    );
    return Promise.race([fetch(url, options), timeout]);
  }

  /**
   * Wrap URL with CORS proxy if configured.
   * Frankfurter API blocks JavaScript fetch from GitHub Pages due to missing CORS headers.
   * @param {string} url - Original API URL
   * @returns {string} - Proxied URL or original if CORS_PROXY is null
   */
  function withCorsProxy(url) {
    if (!CORS_PROXY) return url;
    // corsproxy.io expects: https://corsproxy.io/?https://api.example.com
    return CORS_PROXY + url;
  }

  /**
   * Fetch latest FX rates with multiple API fallbacks.
   * Tries in order: Frankfurter → ExchangeRate-API → uses built-in fallback rates
   */
  async function fetchFxLatest() {
    console.info('[FX] Fetching current rates...');
    
    // Try primary source: Frankfurter (ECB data) - uses CORS proxy
    try {
      const url = 'https://api.frankfurter.app/latest?from=EUR&to=USD,INR';
      const resp = await fetchWithTimeout(
        withCorsProxy(url),
        FETCH_TIMEOUT_MS.standard
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data.rates?.USD && data.rates.USD > 0) {
          fxLatest.USD = data.rates.USD;
          fxLoaded.USD = true;
        }
        if (data.rates?.INR && data.rates.INR > 0) {
          fxLatest.INR = data.rates.INR;
          fxLoaded.INR = true;
        }
        console.info('[FX] ✓ Current rates from Frankfurter (ECB):', `$${fxLatest.USD}`, `₹${fxLatest.INR}`);
        updateFXUI();
        return;
      }
    } catch (e) {
      console.info('[FX] Frankfurter unavailable, trying fallback API...');
    }

    // Try fallback source: ExchangeRate-API (free, no key required)
    try {
      const resp = await fetchWithTimeout(
        'https://open.er-api.com/v6/latest/EUR',
        FETCH_TIMEOUT_MS.standard
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data.rates?.USD && data.rates.USD > 0) {
          fxLatest.USD = data.rates.USD;
          fxLoaded.USD = true;
        }
        if (data.rates?.INR && data.rates.INR > 0) {
          fxLatest.INR = data.rates.INR;
          fxLoaded.INR = true;
        }
        console.info('[FX] ✓ Current rates from ExchangeRate-API (fallback):', `$${fxLatest.USD}`, `₹${fxLatest.INR}`);
        updateFXUI();
        return;
      }
    } catch (e) {
      console.warn('[FX] All current rate APIs unavailable');
    }

    // All APIs failed - use built-in approximate rates
    console.warn('[FX] ⚠️ Using built-in rates: 1 EUR = $' + fxLatest.USD + ' / ₹' + fxLatest.INR);
    console.warn('[FX] ⚠️ These are approximate - deploy to https:// for live rates');
    updateFXUI();
  }

  /**
   * Fetch all historical FX rates from the ECB API.
   * Falls back to using latest rate for all historical conversions if unavailable.
   * Data is persisted to localStorage for offline use.
   * @returns {Promise<boolean>} true if fetch succeeded
   */
  async function fetchFX() {
    const today = new Date().toISOString().slice(0, 10);
    const url = `https://api.frankfurter.app/2021-01-01..${today}?from=EUR&to=USD,INR`;
    
    fxDiagnostics.lastAttempt = new Date().toISOString();
    console.info('[FX] Attempting historical fetch:', url);
    
    try {
      const response = await fetchWithTimeout(withCorsProxy(url), FETCH_TIMEOUT_MS.bulk);
      
      fxDiagnostics.httpStatus = response.status;
      
      if (!response.ok) {
        fxDiagnostics.errorType = 'HTTP_ERROR';
        fxDiagnostics.lastError = `HTTP ${response.status} ${response.statusText}`;
        console.error('[FX] ✗ HTTP Error:', response.status, response.statusText);
        console.error('[FX] ⚠️ WARNING: Historical FX data unavailable');
        console.error('[FX] Impact: CAGR/XIRR will use approximate rates');
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      let usdCount = 0, inrCount = 0;

      for (const [date, rates] of Object.entries(data.rates || {})) {
        if (rates.USD) { state.fxDaily.USD[date] = rates.USD; usdCount++; }
        if (rates.INR) { state.fxDaily.INR[date] = rates.INR; inrCount++; }
      }

      // Only mark as loaded if we got a meaningful amount of data
      if (usdCount > 50) {
        fxLoaded.USD = true;
        const latestDate = Object.keys(state.fxDaily.USD).sort().at(-1);
        fxLatest.USD = state.fxDaily.USD[latestDate];
        console.info(`[FX] ✓ Loaded ${usdCount} historical USD rates (${Object.keys(state.fxDaily.USD)[0]} to ${latestDate})`);
      }
      if (inrCount > 50) {
        fxLoaded.INR = true;
        const latestDate = Object.keys(state.fxDaily.INR).sort().at(-1);
        fxLatest.INR = state.fxDaily.INR[latestDate];
        console.info(`[FX] ✓ Loaded ${inrCount} historical INR rates (${Object.keys(state.fxDaily.INR)[0]} to ${latestDate})`);
      }

      // Success - persist and update diagnostics
      state.fxLastFetch = Date.now();
      fxDiagnostics.lastSuccess = new Date().toISOString();
      fxDiagnostics.lastError = null;
      fxDiagnostics.errorType = null;
      saveState();
      updateFXUI();
      return true;
      
    } catch (e) {
      // Detailed error logging
      if (e.name === 'AbortError' || e.message.includes('timeout')) {
        fxDiagnostics.errorType = 'TIMEOUT';
        fxDiagnostics.lastError = `Request timeout after ${FETCH_TIMEOUT_MS.bulk}ms`;
        console.error('[FX] ✗ Timeout: API did not respond within', FETCH_TIMEOUT_MS.bulk + 'ms');
      } else if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
        fxDiagnostics.errorType = 'NETWORK_ERROR';
        fxDiagnostics.lastError = 'Network error - check internet connection or CORS policy';
        console.error('[FX] ✗ Network Error: Cannot reach api.frankfurter.app');
        console.error('[FX] Possible causes:');
        console.error('  - No internet connection');
        console.error('  - CORS blocked (if opening file:// locally)');
        console.error('  - Firewall/proxy blocking request');
        console.error('  - API server is down');
      } else {
        fxDiagnostics.errorType = 'UNKNOWN';
        fxDiagnostics.lastError = e.message;
        console.error('[FX] ✗ Unexpected error:', e.message);
      }
      
      // Check if we have cached data to use
      const cachedDays = Object.keys(state.fxDaily.USD).length;
      if (cachedDays > 0) {
        const cacheAge = state.fxLastFetch ? Math.round((Date.now() - state.fxLastFetch) / 3600000) : '?';
        console.warn(`[FX] Using cached data: ${cachedDays} days (age: ${cacheAge}h)`);
        console.warn('[FX] ⚠️ CAGR/XIRR calculations will use stale rates');
      } else {
        console.error('[FX] ⚠️ CRITICAL: No cached historical data available');
        console.error('[FX] ⚠️ All transactions will use current FX rate');
        console.error('[FX] ⚠️ CAGR/XIRR will be INACCURATE - currency movements ignored');
        // Show toast warning to user
        toast('⚠️ FX API failed - using approximate rates. CAGR/XIRR may be inaccurate.', 'error');
      }
      
      updateFXUI();
      return false;
    }
  }

  /**
   * Look up a historical FX rate for a specific date.
   * Uses cached data from localStorage or falls back to current rate if unavailable.
   * @param {string} toCurrency - 'USD' or 'INR'
   * @param {string} dateStr    - ISO date string 'YYYY-MM-DD'
   * @returns {number} The EUR→toCurrency rate
   */
  function getFxRate(toCurrency, dateStr) {
    if (toCurrency === 'EUR') return 1;

    const history = state.fxDaily[toCurrency];
    
    // Use cached historical data if available
    if (history && Object.keys(history).length > 0) {
      // Exact match
      if (history[dateStr]) return history[dateStr];

      // Find nearest date within 5-day window (weekends/holidays)
      const targetTime = new Date(dateStr + 'T12:00:00').getTime();
      let bestRate = null;
      let bestDistance = Infinity;
      const maxDistance = 5 * 86400000; // 5 days in ms

      for (const [date, rate] of Object.entries(history)) {
        const distance = Math.abs(new Date(date + 'T12:00:00').getTime() - targetTime);
        if (distance < bestDistance && distance <= maxDistance) {
          bestDistance = distance;
          bestRate = rate;
        }
      }
      
      if (bestRate) return bestRate;
    }

    // No cached data available - fall back to current rate
    // This is approximate and will affect CAGR/XIRR accuracy
    return fxLatest[toCurrency];
  }

  /**
   * Convert a EUR amount (internal base) to the user's display currency.
   * Uses historical ECB rate when dateStr is provided, otherwise latest rate.
   * @param {number} eurAmount - Amount in EUR (internal storage currency)
   * @param {string|null} dateStr - Optional ISO date for historical rate
   * @returns {number} Amount in display currency
   */
  function eurToDisplay(eurAmount, dateStr = null) {
    const currency = state.settings.currency;
    if (currency === 'EUR') return eurAmount;

    if (currency === 'USD') {
      const rate = dateStr ? getFxRate('USD', dateStr) : fxLatest.USD;
      return eurAmount * rate;
    }

    // EUR → INR
    const rate = dateStr ? getFxRate('INR', dateStr) : fxLatest.INR;
    return eurAmount * rate;
  }



  /**
   * Convert a USD price (from Yahoo/CoinGecko) to EUR for internal storage.
   * @param {number} usdPrice
   * @param {string|null} dateStr
   * @returns {number} EUR price
   */
  function usdToEur(usdPrice, dateStr = null) {
    const rate = dateStr ? getFxRate('USD', dateStr) : fxLatest.USD;
    return rate > 0 ? usdPrice / rate : usdPrice;
  }

  /** Update all FX-related UI elements (header pill + settings chips + diagnostics) */

  function updateFXUI() {
    const allOK = fxLoaded.USD && fxLoaded.INR;
    const partialOK = fxLoaded.USD || fxLoaded.INR;
    const historicalCount = Object.keys(state.fxDaily.USD).length;
    const hasHistoricalData = historicalCount > 50;

    // Header FX pill — combined with timestamp
    const fxPill = el('h-fx');
    const combinedText = el('h-fx-ts-combined');
    if (fxPill && combinedText) {
      fxPill.className = 'fx-pill ' + (allOK ? 'ok' : partialOK ? 'load' : 'err');
      fxPill.style.cssText = 'font-size:10px;display:flex;align-items:center;gap:6px';
      
      let fxText;
      if (allOK) {
        fxText = `FX: 1€ = $${fmtNum(fxLatest.USD, 4)} · ₹${fmtNum(fxLatest.INR, 1)}`;
      } else if (partialOK) {
        fxText = 'FX: Partial';
      } else {
        fxText = `FX: ~$${fmtNum(fxLatest.USD, 2)} · ~₹${fmtNum(fxLatest.INR, 0)} (approx)`;
      }
      
      const tsText = state.lastRefreshTS 
        ? new Date(state.lastRefreshTS).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : '—';
      
      combinedText.textContent = `${fxText}  •  Updated ${tsText}`;
      
      // Tooltip
      if (!allOK) {
        fxPill.title = hasHistoricalData 
          ? `Using cached historical FX data (${historicalCount} days). Check Settings for diagnostics.`
          : '⚠️ WARNING: No historical FX data. CAGR/XIRR will be inaccurate. Check Settings for diagnostics.';
      } else {
        fxPill.title = 'ECB exchange rates via frankfurter.app · Updated: ' + tsText;
      }
    }

    // Settings panel FX chips
    const chips = el('sp-fx-chips');
    if (chips) {
      const lastDate = Object.keys(state.fxDaily.USD).sort().at(-1) || '—';
      const statusColor = allOK ? 'var(--green)' : (hasHistoricalData ? 'var(--amber)' : 'var(--red)');
      const statusText = allOK 
        ? `${historicalCount} USD + ${Object.keys(state.fxDaily.INR).length} INR daily rates · last: ${lastDate}`
        : hasHistoricalData
        ? `⚠️ Using cached data: ${historicalCount} days (APIs unavailable)`
        : `❌ CRITICAL: No historical data - CAGR/XIRR will be inaccurate`;
      
      chips.innerHTML = `
        <div class="fx-chip"><span><span class="src">EUR → USD ${allOK ? '(ECB live)' : '(cached/approx)'}</span></span><strong>1 EUR = ${fmtNum(fxLatest.USD, 4)} USD</strong></div>
        <div class="fx-chip"><span><span class="src">EUR → INR ${allOK ? '(ECB live)' : '(cached/approx)'}</span></span><strong>1 EUR = ₹${fmtNum(fxLatest.INR, 2)}</strong></div>
        <div class="fx-chip"><span class="src">Last ECB date</span><strong>${lastDate}</strong></div>
        <div class="fx-chip" style="flex-direction:column;align-items:flex-start;gap:2px">
          <span class="src">${allOK ? 'Historical coverage · ECB publishes on business days only' : 'Status'}</span>
          <span style="color:${statusColor};font-size:10px">${statusText}</span>
        </div>`;
    }
    
    // Update diagnostics panel
    const diagPanel = el('fx-diagnostics');
    const diagContent = el('fx-diag-content');
    if (diagPanel && diagContent) {
      // Show panel if there are any issues
      if (!allOK || fxDiagnostics.lastError) {
        diagPanel.style.display = 'block';
        
        let html = '';
        if (fxDiagnostics.lastAttempt) {
          html += `<div>Last attempt: ${new Date(fxDiagnostics.lastAttempt).toLocaleString()}</div>`;
        }
        if (fxDiagnostics.lastSuccess) {
          html += `<div style="color:var(--green)">Last success: ${new Date(fxDiagnostics.lastSuccess).toLocaleString()}</div>`;
        }
        if (fxDiagnostics.lastError) {
          html += `<div style="color:var(--red);margin-top:4px"><strong>Error:</strong> ${fxDiagnostics.errorType}</div>`;
          html += `<div style="color:var(--red)">${fxDiagnostics.lastError}</div>`;
        }
        if (fxDiagnostics.httpStatus) {
          html += `<div style="margin-top:4px">HTTP Status: ${fxDiagnostics.httpStatus}</div>`;
        }
        
        // Cache status
        if (hasHistoricalData) {
          const cacheAge = state.fxLastFetch ? Math.round((Date.now() - state.fxLastFetch) / 3600000) : '?';
          html += `<div style="margin-top:4px;color:var(--amber)">Using cached data: ${historicalCount} days (age: ${cacheAge}h)</div>`;
        } else {
          html += `<div style="margin-top:4px;color:var(--red);font-weight:600">⚠️ NO CACHED DATA - Calculations will be approximate!</div>`;
        }
        
        diagContent.innerHTML = html;
      } else {
        diagPanel.style.display = 'none';
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     PRICE ENGINE
     Priority order for live prices (all free, no key required by default):
       1. CoinGecko  — crypto tickers (BTC, ETH, SOL, …)
       2. Yahoo Finance — stocks, ETFs (unofficial API, no key needed)
       3. Alpha Vantage — optional enhancement if user adds a key
       4. Simulated     — deterministic fallback, clearly labelled
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * Fallback prices in USD — only used when ALL live sources fail.
   * Updated to approximate March 2025 values; always clearly labelled "sim".
   */
  const MOCK_PRICES_USD = {
    AAPL: 215.00, MSFT: 388.00, GOOGL: 168.00, AMZN: 198.00, META: 595.00,
    NVDA: 115.00, TSLA: 275.00, BRKB: 500.00, JPM: 250.00, V: 310.00,
    MA: 520.00, SPY: 565.00, QQQ: 490.00, VOO: 536.00, VTI: 280.00,
    IVV: 570.00, GLD: 280.00, TLT: 88.00,  HYG: 77.00,
    BTC: 84000, ETH: 2000, SOL: 130.00, ADA: 0.70, XRP: 2.30, DOGE: 0.18,
    AMD: 108.00, NFLX: 980.00, DIS: 100.00, PLTR: 90.00, UBER: 72.00,
    INTC: 20.00, BAC: 44.00, GS: 570.00, WMT: 98.00, COST: 980.00,
    ORCL: 170.00, CRM: 298.00, MSTR: 330.00, COIN: 210.00,
  };

  /**
   * Generate a deterministic simulated price that shifts slightly each day.
   * Used only when all live sources fail.
   */
  function getMockPrice(ticker) {
    const basePrice = MOCK_PRICES_USD[ticker] || 50;
    const seed = ticker.split('').reduce((acc, ch, i) => acc + (ch.charCodeAt(0) * (i + 3)), 0);
    const dayOffset = Math.floor(Date.now() / 86400000) % 97;
    const pctChange = ((seed * 7919 + dayOffset * 1013) % 800 - 400) / 10000;
    return +(basePrice * (1 + pctChange)).toFixed(4);
  }

  /** Get the current cached price for a ticker (falls back to mock) */
  function getPrice(ticker) {
    return state.priceCache[ticker]?.price || getMockPrice(ticker);
  }

  /** Check whether the cached price for a ticker is still within TTL */
  function isCacheValid(ticker) {
    const cached = state.priceCache[ticker];
    return cached && (Date.now() - cached.ts) < state.settings.cacheTTL;
  }

  /**
   * Fetch a live price from Yahoo Finance (free, no key required).
   * Uses the unofficial chart API — returns null on any failure.
   */
  async function fetchYahoo(ticker) {
    try {
      const url = withCorsProxy(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`);
      const resp = await fetchWithTimeout(url, FETCH_TIMEOUT_MS.quick);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      return (price && price > 0) ? price : null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch live prices for multiple crypto tickers from CoinGecko (free, no key).
   * Returns a map of { ticker: priceUSD }.
   */
  async function fetchCoinGeckoBatch(tickers) {
    const idMap = {};
    for (const t of tickers) {
      if (COINGECKO_IDS[t]) idMap[t] = COINGECKO_IDS[t];
    }
    if (!Object.keys(idMap).length) return {};

    try {
      const ids = Object.values(idMap).join(',');
      const resp = await fetchWithTimeout(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, 
        FETCH_TIMEOUT_MS.quick
      );
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();

      const result = {};
      for (const [ticker, cgId] of Object.entries(idMap)) {
        if (data[cgId]?.usd) result[ticker] = data[cgId].usd;
      }
      return result;
    } catch (e) {
      console.warn('[CoinGecko]', e.message);
      console.info('Note: Crypto prices require network access. Works when deployed to GitHub Pages.');
      return {};
    }
  }

  /**
   * Fetch a live price from Alpha Vantage (optional, requires user's free API key).
   * @param {string} ticker - Stock symbol
   * @param {string} apiKey - Alpha Vantage API key
   * @returns {Promise<number|null>} Price in USD, or null on failure
   */
  async function fetchAlphaVantage(ticker, apiKey) {
    try {
      const resp = await fetchWithTimeout(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${apiKey}`, 
        FETCH_TIMEOUT_MS.slow
      );
      const data = await resp.json();
      const price = parseFloat(data['Global Quote']?.['05. price']);
      return (price > 0) ? price : null;
    } catch {
      return null;
    }
  }

  /**
   * Refresh prices for all tickers in the portfolio.
   * Strategy: CoinGecko for crypto → Yahoo Finance for stocks → AV if key set → mock fallback.
   */
  async function refreshPrices(force = false) {
    const refreshBtn = el('h-refresh');
    refreshBtn?.classList.add('spin-me');
    setHeaderStatus('load', 'Fetching prices…');

    const tickers = [...new Set(state.transactions.map(t => t.ticker))];
    if (!tickers.length) {
      refreshBtn?.classList.remove('spin-me');
      setHeaderStatus('live', 'No positions');
      return;
    }

    const staleTickers = tickers.filter(t => force || !isCacheValid(t));
    if (!staleTickers.length) {
      refreshBtn?.classList.remove('spin-me');
      setHeaderStatus('live', 'All prices current');
      return;
    }

    const apiKey = (state.settings.apiKey || '').trim();
    let liveCount = 0;

    // ── Step 1: Crypto via CoinGecko (batch, free, no key) ──────────
    const cryptoTickers = staleTickers.filter(t => COINGECKO_IDS[t]);
    if (cryptoTickers.length) {
      setHeaderStatus('load', `Fetching ${cryptoTickers.join(', ')} via CoinGecko…`);
      const cgPrices = await fetchCoinGeckoBatch(cryptoTickers);
      for (const ticker of cryptoTickers) {
        const price = cgPrices[ticker];
        // CoinGecko returns USD — convert to EUR for storage
        const priceEur = price ? usdToEur(price) : getMockPrice(ticker);
        state.priceCache[ticker] = { price: priceEur, ts: Date.now(), src: price ? 'cg' : 'sim' };
        if (price) liveCount++;
      }
    }

    // ── Step 2: Stocks/ETFs via Yahoo Finance (free, no key) + optional AV ──
    const stockTickers = staleTickers.filter(t => !COINGECKO_IDS[t]);
    for (let i = 0; i < stockTickers.length; i++) {
      const ticker = stockTickers[i];
      setHeaderStatus('load', `Fetching ${ticker} (${i + 1}/${stockTickers.length})…`);

      let price = null;
      let src = 'sim';

      // Try Alpha Vantage first if the user has provided a key
      if (apiKey) {
        price = await fetchAlphaVantage(ticker, apiKey);
        if (price) { src = 'av'; if (i < stockTickers.length - 1) await sleep(13000); }
      }

      // Fall back to Yahoo Finance if no AV key or AV failed
      if (!price) {
        price = await fetchYahoo(ticker);
        if (price) src = 'yahoo';
      }

      // Yahoo/AV return USD — convert to EUR for storage
      const priceEurStock = price ? usdToEur(price) : getMockPrice(ticker);
      state.priceCache[ticker] = { price: priceEurStock, ts: Date.now(), src };
      if (price) liveCount++;
    }

    // ── Status summary ──────────────────────────────────────────────
    const total = staleTickers.length;
    if (liveCount === total) {
      setHeaderStatus('live', `Live prices · ${total} tickers updated`);
    } else if (liveCount > 0) {
      setHeaderStatus('live', `${liveCount}/${total} live · ${total - liveCount} simulated`);
    } else {
      setHeaderStatus('live', 'All simulated — check internet connection');
    }

    state.lastRefreshTS = Date.now();
    updateFXUI(); // Update combined FX+timestamp box
    updateSourceBadge();
    saveState();
    refreshBtn?.classList.remove('spin-me');
    render();
    if (activeDrawer) openDrawer(activeDrawer);
  }

  /**
   * Update the "Simulated" / "Live" / "Mixed" badge in the header.
   * A price is "live" if its source is Alpha Vantage ('av'),
   * Yahoo Finance ('yahoo'), or CoinGecko ('cg').
   */
  function updateSourceBadge() {
    const badge = el('h-src-badge');
    if (!badge) return;
    const LIVE_SOURCES = new Set(['av', 'yahoo', 'cg']);
    const sources = Object.values(state.priceCache).map(c => c.src);
    const allLive = sources.length > 0 && sources.every(s => LIVE_SOURCES.has(s));
    const anyLive = sources.some(s => LIVE_SOURCES.has(s));
    if (allLive)      { badge.className = 'price-src-badge live'; badge.textContent = 'Live'; }
    else if (anyLive) { badge.className = 'price-src-badge sim';  badge.textContent = 'Mixed'; }
    else              { badge.className = 'price-src-badge sim';  badge.textContent = 'Simulated'; }
  }

  /* ═══════════════════════════════════════════════════════════════════
     XIRR CALCULATOR
     Newton-Raphson solver with multiple seed points for robustness.
     Returns annualised return rate as a percentage, or null.
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * Calculate Extended Internal Rate of Return (XIRR) using Newton-Raphson method.
   * 
   * XIRR finds the discount rate that makes NPV of irregular cashflows = 0.
   * - Negative cashflows = money out (purchases)
   * - Positive cashflows = money in (sales, current value)
   * 
   * Algorithm:
   * 1. Convert dates to fractional years from base date
   * 2. Try multiple seed rates to avoid local minima
   * 3. Iteratively refine rate using: rate_new = rate - NPV/NPV'
   * 4. Stop when rate converges within EPSILON tolerance
   * 
   * @param {number[]} cashflows - Negative = outflow (buy), positive = inflow (sell/current value)
   * @param {Date[]} dates - Corresponding dates for each cashflow
   * @returns {number|null} - Annualized return as percentage, or null if no convergence
   */
  function calcXIRR(cashflows, dates) {
    if (cashflows.length < 2) return null;
    if (!cashflows.some(c => c < 0) || !cashflows.some(c => c > 0)) return null;

    const baseTime = dates[0].getTime();
    const yearsFromBase = dates.map(d => (d.getTime() - baseTime) / (365.25 * 24 * 3600 * 1000));

    // Convergence parameters
    const EPSILON = 1e-8;           // Tolerance for convergence
    const MAX_ITERATIONS = 300;     // Maximum Newton-Raphson iterations
    const SEED_RATES = [0.1, 0.0, -0.05, 0.5, 1.0, -0.3, 2.0];  // Try multiple starting points

    // Try multiple starting points to avoid local minima
    for (const seed of SEED_RATES) {
      let rate = seed;
      let converged = false;

      for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        let npv = 0;        // Net present value
        let npvDerivative = 0; // d(NPV)/d(rate)

        for (let j = 0; j < cashflows.length; j++) {
          if (yearsFromBase[j] === 0) { npv += cashflows[j]; continue; }
          const discountFactor = Math.pow(1 + rate, yearsFromBase[j]);
          npv += cashflows[j] / discountFactor;
          npvDerivative -= yearsFromBase[j] * cashflows[j] / ((1 + rate) * discountFactor);
        }

        if (Math.abs(npvDerivative) < 1e-14) break; // Flat derivative, can't continue

        const nextRate = rate - npv / npvDerivative;
        if (!isFinite(nextRate) || Math.abs(nextRate) > 1000) break;

        if (Math.abs(nextRate - rate) < EPSILON) {
          converged = true;
          rate = nextRate;
          break;
        }
        rate = nextRate;
      }

      if (converged && isFinite(rate) && rate > -1) {
        return rate * 100; // Convert to percentage
      }
    }

    return null; // Failed to converge with any seed
  }

  /**
   * Build XIRR cashflows from all transactions for a position,
   * plus the current value of remaining shares as a terminal cashflow.
   * @param {Array} allTxs          - All buy/sell transactions for the ticker
   * @param {Array} openLots        - Currently open FIFO lots
   * @param {number} currentPriceD  - Current price in display currency
   * @returns {number|null}
   */
  function positionXIRR(allTxs, openLots, currentPriceD) {
    const { cashflows, dates } = buildCashflows(allTxs);

    // Add current remaining value as terminal cashflow
    const remainingQty = openLots.reduce((sum, lot) => sum + lot.qty, 0);
    if (remainingQty > QTY_EPSILON) {
      cashflows.push(remainingQty * currentPriceD);
      dates.push(new Date());
    }

    return calcXIRR(cashflows, dates);
  }

  /**
   * Calculate XIRR for a single open lot.
   * @param {Object} lot           - {qty, priceEUR, date}
   * @param {number} currentPriceD - Current price in display currency
   * @returns {number|null}
   */
  function lotXIRR(lot, currentPriceD) {
    const buyPriceD = eurToDisplay(lot.priceEUR || lot.priceUSD || 0, lot.date);
    return calcXIRR(
      [-(lot.qty * buyPriceD), lot.qty * currentPriceD],
      [new Date(lot.date + 'T12:00:00'), new Date()]
    );
  }

  /**
   * Calculate portfolio-level XIRR across all positions.
   * @param {Array} allTxs    - Every transaction in the portfolio
   * @param {Object} positions - Position map from computePositions()
   * @returns {number|null}
   */
  function portfolioXIRR(allTxs, positions) {
    const { cashflows, dates } = buildCashflows(allTxs);
    const now = new Date();

    // Add current market value of each position as terminal cashflow
    for (const pos of Object.values(positions)) {
      if (pos.shares > QTY_EPSILON) {
        cashflows.push(pos.value);
        dates.push(now);
      }
    }

    return calcXIRR(cashflows, dates);
  }

  /**
   * Convert a list of transactions into XIRR cashflow arrays.
   * Buys are negative (outflows), sells are positive (inflows).
   * All amounts are in the display currency at historical FX rates.
   * @param {Array} txs - Transaction array
   * @returns {{cashflows: number[], dates: Date[]}}
   */
  function buildCashflows(txs) {
    const cashflows = [];
    const dates = [];
    for (const tx of txs) {
      const date = new Date(tx.date + 'T12:00:00');
      const displayPrice = eurToDisplay(tx.price, tx.date);
      const amount = tx.qty * displayPrice;
      cashflows.push(tx.type === 'BUY' ? -amount : amount);
      dates.push(date);
    }
    return { cashflows, dates };
  }

  /* ═══════════════════════════════════════════════════════════════════
     PORTFOLIO CALCULATIONS (FIFO + CAGR)
     Core financial logic for computing positions from transactions.
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * Calculate years between a date string and now.
   * @param {string} dateStr - ISO date 'YYYY-MM-DD'
   * @param {Date} now
   * @returns {number}
   */
  function yearsHeld(dateStr, now) {
    return (now - new Date(dateStr + 'T12:00:00')) / (1000 * 60 * 60 * 24 * 365.25);
  }

  /**
   * Calculate CAGR (Compound Annual Growth Rate).
   * Returns null if holding period is < 6 months or values are non-positive.
   * @param {number} cost  - Initial cost basis
   * @param {number} value - Current market value
   * @param {number} years - Holding period in years
   * @returns {number|null} CAGR as percentage
   */
  /**
   * Calculate Compound Annual Growth Rate (CAGR).
   * Formula: (final/initial)^(1/years) - 1
   * 
   * @param {number} cost - Initial investment value
   * @param {number} value - Final value
   * @param {number} years - Time period in years
   * @returns {number|null} CAGR as percentage, or null if period < 0.5 years
   */
  function calcCagr(cost, value, years) {
    if (years < MIN_CAGR_YEARS || cost <= 0 || value <= 0) return null;
    return (Math.pow(value / cost, 1 / years) - 1) * 100;
  }

  /**
   * Compute all positions from the transaction ledger using FIFO lot matching.
   * 
   * FIFO Algorithm:
   * - BUY transactions create new lots (with fees added to cost basis)
   * - SELL transactions consume oldest lots first (realized P&L calculated)
   * - Remaining lots are open positions (unrealized P&L calculated)
   * 
   * Returns position data including:
   * - shares: Total open shares
   * - costDisp: Total cost basis in display currency
   * - value: Current market value
   * - unrealized: Unrealized P&L (open lots)
   * - realized: Realized P&L (closed lots from sells)
   * - cagr: Compound annual growth rate
   * - xirr: Extended internal rate of return
   * 
   * @returns {Object<string, Position>} Map of ticker → position data
   */
  function computePositions() {
    // Group transactions by ticker, sorted chronologically
    // CRITICAL: If same date, BUY must come before SELL to avoid overselling
    const byTicker = {};
    const sorted = [...state.transactions].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      // Same date: BUY (0) before SELL (1)
      return (a.type === 'BUY' ? 0 : 1) - (b.type === 'BUY' ? 0 : 1);
    });
    for (const tx of sorted) {
      if (!byTicker[tx.ticker]) byTicker[tx.ticker] = [];
      byTicker[tx.ticker].push(tx);
    }

    const positions = {};
    const now = new Date();

    for (const [ticker, txs] of Object.entries(byTicker)) {
      // FIFO lot queue: sells consume from the front
      const lotQueue = [];
      let realizedGain = 0;

      for (const tx of txs) {
        if (tx.type === 'BUY') {
          // fees add to effective cost basis
          const feesPerShare = tx.qty > 0 ? (+(tx.fees || 0)) / +tx.qty : 0;
          lotQueue.push({ qty: +tx.qty, priceEUR: +tx.price + feesPerShare, id: tx.id, date: tx.date, fees: +(tx.fees || 0) });
        } else {
          // SELL: match against oldest lots first (FIFO)
          let remaining = +tx.qty;
          while (remaining > QTY_EPSILON && lotQueue.length > 0) {
            const lot = lotQueue[0];
            const matched = Math.min(remaining, lot.qty);
            const sellPriceD = eurToDisplay(+tx.price, tx.date);
            const buyPriceD = eurToDisplay(lot.priceEUR, lot.date);
            realizedGain += (sellPriceD - buyPriceD) * matched - (+(tx.taxes || 0) * matched / +tx.qty);
            lot.qty -= matched;
            remaining -= matched;
            if (lot.qty < QTY_EPSILON) lotQueue.shift();
          }
        }
      }

      // Summarise remaining open lots
      let totalShares = 0, totalCostD = 0, weightedYears = 0;
      const openLots = [];

      for (const lot of lotQueue) {
        if (lot.qty < QTY_EPSILON) continue;
        const lotCostD = lot.qty * eurToDisplay(lot.priceEUR, lot.date);
        totalShares += lot.qty;
        totalCostD += lotCostD;
        weightedYears += lotCostD * yearsHeld(lot.date, now);
        openLots.push({ ...lot, priceEUR: lot.priceEUR, costDisp: lotCostD, avgYears: yearsHeld(lot.date, now) });
      }

      // Current market data
      const currentEUR = getPrice(ticker);
      const currentDisp = eurToDisplay(currentEUR);
      const marketValue = totalShares * currentDisp;
      const unrealizedGain = marketValue - totalCostD;
      const avgHoldYears = totalCostD > 0 ? weightedYears / totalCostD : 0;

      positions[ticker] = {
        ticker, txs, openLots,
        shares: totalShares,  // Preserve full precision for crypto (up to 15 decimals)
        avgCostDisp: totalShares > 0 ? totalCostD / totalShares : 0,
        costDisp: totalCostD,
        curEUR: currentEUR,
        curDisp: currentDisp,
        value: marketValue,
        unrealized: unrealizedGain,
        unrealizedPct: totalCostD > 0 ? (unrealizedGain / totalCostD) * 100 : 0,
        realized: realizedGain,
        totalGain: unrealizedGain + realizedGain,
        cagr: calcCagr(totalCostD, marketValue, avgHoldYears),
        xirr: positionXIRR(txs, openLots, currentDisp),
        avgYears: avgHoldYears,
        cls: state.tickerMeta[ticker]?.cls || guessClass(ticker),
        companyName: state.tickerMeta[ticker]?.companyName || TICKER_NAMES[ticker] || '',
        src: state.priceCache[ticker]?.src || 'sim',
        lastTs: state.priceCache[ticker]?.ts || 0,
      };
    }

    return positions;
  }

  /**
   * Compute portfolio-level summary statistics from positions.
   * @param {Object} positions - Map from computePositions()
   * @returns {Object} Summary with totalValue, totalCost, unrealized, etc.
   */
  function computeSummary(positions) {
    let totalValue = 0, totalCost = 0, totalRealized = 0, weightedYears = 0;
    let totalFees = 0, totalTaxes = 0;
    const now = new Date();
    const byClass = {};

    for (const pos of Object.values(positions)) {
      totalValue += pos.value;
      totalCost  += pos.costDisp;
      totalRealized += pos.realized;
      for (const lot of pos.openLots) {
        weightedYears += lot.costDisp * yearsHeld(lot.date, now);
      }
      // Accumulate fees and taxes
      const cls = pos.cls;
      if (!byClass[cls]) byClass[cls] = { fees: 0, taxes: 0, cost: 0, value: 0, realized: 0 };
      byClass[cls].cost  += pos.costDisp;
      byClass[cls].value += pos.value;
      byClass[cls].realized += pos.realized;
    }
    for (const tx of state.transactions) {
      const f = +(tx.fees  || 0);
      const t = +(tx.taxes || 0);
      totalFees  += f;
      totalTaxes += t;
      const cls = state.tickerMeta[tx.ticker]?.cls || guessClass(tx.ticker);
      if (byClass[cls]) {
        byClass[cls].fees  = (byClass[cls].fees  || 0) + f;
        byClass[cls].taxes = (byClass[cls].taxes || 0) + t;
      }
    }

    const unrealized = totalValue - totalCost;
    const avgYears   = totalCost > 0 ? weightedYears / totalCost : 0;
    const daysHeld   = avgYears * 365.25;
    const topPos     = Object.values(positions).sort((a,b) => b.value - a.value)[0];
    const concentration = (topPos && totalValue > 0) ? (topPos.value / totalValue * 100) : 0;
    const netReturn  = totalCost > 0 ? ((unrealized + totalRealized) / totalCost * 100) : 0;

    return {
      totalValue, totalCost, unrealized,
      unrealizedPct: totalCost > 0 ? (unrealized / totalCost) * 100 : 0,
      realized: totalRealized,
      totalGain: unrealized + totalRealized,
      totalFees, totalTaxes,
      byClass,
      cagr:          calcCagr(totalCost, totalValue, avgYears),
      xirr:          portfolioXIRR(state.transactions, positions),
      positions:     Object.keys(positions).length,
      avgDaysHeld:   Math.round(daysHeld),
      concentration,
      netReturn,
    };
  }

  /**
   * Auto-detect asset class from ticker symbol.
   * @param {string} ticker
   * @returns {string} 'Stock' | 'ETF' | 'Crypto' | 'Bond'
   */
  function guessClass(ticker) {
    if (CRYPTO_TICKERS.has(ticker)) return 'Crypto';
    if (BOND_TICKERS.has(ticker)) return 'Bond';
    if (ETF_TICKERS.has(ticker)) return 'ETF';
    return 'Stock';
  }

  /* ═══════════════════════════════════════════════════════════════════
     FORMATTING & DISPLAY HELPERS
     ─────────────────────────────────────────────────────────────────
     Single source of truth for ALL number and currency display.

     Region → locale → separators:
       USD  →  en-US  →  1,234,567.89   $1,234.56
       EUR  →  de-DE  →  1.234.567,89   1.234,56 €
       INR  →  en-IN  →  12,34,567.89   ₹12,34,567

     Rules:
       • All formatting goes through Intl.NumberFormat (never raw .toFixed)
       • fmtNum()      — locale-aware plain number
       • fmtCurrency() — locale-aware currency with symbol
       • fmtValue()    — whole-number currency (KPI cards, totals)
       • fmtCompact()  — compact price display (K / M / L / Cr)
       • fmtPct()      — percentage with sign
       • fmtXIRR()     — XIRR value
       • fmtCAGR()     — CAGR value
       • fmtQty()      — share quantities
       • fmtInputNum() — pre-fill value for <input> fields
       • parseLocaleFloat() — parse user-typed numbers
     ═══════════════════════════════════════════════════════════════════ */

  /** Locale tag for the active currency (drives Intl.NumberFormat). */
  function activeLocale() {
    switch (state.settings.currency) {
      case 'USD': return 'en-US';
      case 'INR': return 'en-IN';
      default:    return 'de-DE';   // EUR uses German convention
    }
  }

  /** ISO 4217 code for the active currency. */
  function activeCurrencyCode() {
    return state.settings.currency || 'EUR';
  }

  /** Currency symbol for the active currency. */
  function currencySymbol() { return CUR_SYMBOLS[state.settings.currency] || '€'; }

  /**
   * Low-level number formatter — all other fmt* functions call this.
   * Returns '—' for null / undefined / non-finite values.
   * @param {number|null|undefined} n
   * @param {Intl.NumberFormatOptions} opts
   * @returns {string}
   */
  function _fmt(n, opts) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    try { return new Intl.NumberFormat(activeLocale(), opts).format(n); }
    catch (e) { return String(n); }
  }

  /**
   * Format a plain number with the active locale's separators.
   *   EUR: 1.234,56    USD: 1,234.56    INR: 1,234.56
   * @param {number} n
   * @param {number} [places=2]
   * @returns {string}
   */
  function fmtNum(n, places) {
    const p = (places === undefined) ? 2 : places;
    return _fmt(n, { minimumFractionDigits: p, maximumFractionDigits: p });
  }

  /**
   * Format a monetary value with the active currency and locale.
   *   EUR: 1.234,56 €    USD: $1,234.56    INR: ₹1,23,456
   * @param {number} n
   * @param {number} [decimals=2]
   * @returns {string}
   */
  function fmtCurrency(n, decimals) {
    const d = (decimals === undefined) ? 2 : decimals;
    if (n === null || n === undefined || !isFinite(n)) return '—';
    try {
      return new Intl.NumberFormat(activeLocale(), {
        style: 'currency',
        currency: activeCurrencyCode(),
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      }).format(n);
    } catch (e) { return String(n); }
  }

  /** Format as whole-number currency — used for KPI totals, P&L values. */
  function fmtValue(n) { return fmtCurrency(n, 0); }

  /**
   * Compact currency for per-share price display.
   * Large numbers use locale-aware suffixes BEFORE the currency symbol.
   *   EUR: 25,0 K €    USD: 25.0 K $    INR: ₹1.23 L
   * @param {number} v
   * @returns {string}
   */
  function fmtCompact(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    const cur = state.settings.currency;
    const sym = currencySymbol();
    if (cur === 'INR') {
      if (v >= 10000000) return sym + fmtNum(v / 10000000, 2) + ' Cr';
      if (v >= 100000)   return sym + fmtNum(v / 100000,   2) + ' L';
    }
    if (v >= 1000000) return fmtNum(v / 1000000, 2) + ' M ' + sym;
    if (v >= 1000)    return fmtNum(v / 1000,    1) + ' K ' + sym;
    return fmtCurrency(v, 2);
  }

  /**
   * Format a percentage with explicit sign.
   *   EUR: +18,40 %    USD: +18.40 %    INR: +18.40 %
   * @param {number} n
   * @param {number} [places=2]
   * @returns {string}
   */
  function fmtPct(n, places) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    const p = (places === undefined) ? 2 : places;
    return (n >= 0 ? '+' : '') + fmtNum(n, p) + ' %';
  }

  /**
   * Format an XIRR value for display.
   *   EUR: +22,1 % XIRR    USD: +22.1 % XIRR
   */
  function fmtXIRR(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + fmtNum(v, 1) + ' % XIRR';
  }

  /**
   * Format a CAGR value for display.
   *   EUR: +8,3 % p.a.    USD: +8.3 % p.a.
   */
  function fmtCAGR(v) {
    if (v === null || v === undefined || !isFinite(v)) return '< 6mo';
    return (v >= 0 ? '+' : '') + fmtNum(v, 1) + ' % p.a.';
  }

  /**
   * Format a share quantity — integers shown without decimals,
   * fractional shares shown with up to 4 decimal places.
   * @param {number} qty
   * @returns {string}
   */
  function fmtQty(qty) {
    if (qty === null || qty === undefined) return '—';
    // Whole numbers (stocks): no decimals
    // Fractional (crypto): preserve up to 15 decimals, minimum 2
    return qty % 1 === 0
      ? _fmt(qty, { maximumFractionDigits: 0 })
      : _fmt(+qty, { minimumFractionDigits: 2, maximumFractionDigits: 15 });
  }

  /**
   * Detect the decimal separator character for the active locale.
   * de-DE → ","    en-US / en-IN → "."
   * @returns {',' | '.'}
   */
  function decimalSep() {
    const sample = new Intl.NumberFormat(activeLocale()).format(1.1);
    return sample.charAt(1); // the character between 1 and 1
  }

  /**
   * Format a number for an INPUT field — uses the locale decimal separator
   * so that placeholders and pre-fills match the user's regional convention.
   *   EUR: "853,40"    USD: "853.40"    INR: "853.40"
   * @param {number} n
   * @param {number} [places=2]
   * @returns {string}
   */
  function fmtInputNum(n, places) {
    const p = (places === undefined) ? 2 : places;
    if (!isFinite(n)) return '';
    return n.toFixed(p).replace('.', decimalSep());
  }

  /**
   * Parse a user-typed decimal number that may use any locale convention.
   *   EU  "1.234,56"  → 1234.56
   *   US  "1,234.56"  → 1234.56
   *   IN  "1,23,456.78" → 123456.78
   *   Plain "285,50" or "285.50" both work.
   * @param {string} s
   * @returns {number}
   */
  /**
   * Parse user-typed number strings respecting the active currency's format.
   * EUR (de-DE): 1.234,56 → comma is decimal
   * USD/INR (en-US/en-IN): 1,234.56 → period is decimal
   * Falls back to auto-detection if format is ambiguous.
   */
  function parseLocaleFloat(s) {
    if (typeof s !== 'string') return parseFloat(s);
    const str = s.trim();
    if (!str) return NaN;
    
    const locale = activeLocale();
    const isEuropean = locale === 'de-DE'; // EUR uses comma as decimal
    
    const hasComma  = str.includes(',');
    const hasPeriod = str.includes('.');
    
    let normalised;
    
    // If only one separator, use currency convention
    if (hasComma && !hasPeriod) {
      normalised = isEuropean 
        ? str.replace(',', '.')              // EUR: comma → decimal
        : str.replace(/,/g, '');             // USD/INR: comma → thousands
    } else if (hasPeriod && !hasComma) {
      normalised = isEuropean && str.split('.')[1]?.length <= 3
        ? str.replace(/\./g, '')             // EUR: 1.234 → thousands  
        : str;                               // USD/INR: period → decimal
    } else if (hasComma && hasPeriod) {
      // Both separators: use locale convention
      normalised = isEuropean
        ? str.replace(/\./g, '').replace(',', '.')  // EUR: 1.234,56
        : str.replace(/,/g, '');                    // USD/INR: 1,234.56
    } else {
      normalised = str; // No separators
    }
    
    return parseFloat(normalised);
  }

  /** Format an ISO date string as "01 Mar 2024" */
  function fmtDate(s) {
    return new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /** Format an ISO date string as "Mar 24" (short) */
  function fmtDateShort(s) {
    return new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  }

  /** Generate a unique transaction ID */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /** Format a timestamp as relative time ("2m ago", "3h ago", etc.) */
  function timeAgo(ts) {
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 60)    return 'just now';
    if (seconds < 3600)  return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
  }

  /** Promise-based sleep */
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ═══════════════════════════════════════════════════════════════════
     COLOUR HELPERS
     Deterministic colour assignment for tickers and badges.
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * Get a consistent colour for a ticker symbol.
   * BTC always gets orange; others are assigned from the palette via hash.
   * @param {string} ticker
   * @returns {string} Hex colour
   */
  function tickerColor(ticker) {
    if (ticker === 'BTC') return '#e8732a';
    if (!tickerColorCache[ticker]) {
      const hash = ticker.split('').reduce((acc, ch, i) => acc + (ch.charCodeAt(0) * (i + 3)), 0);
      tickerColorCache[ticker] = PALETTE[hash % PALETTE.length];
    }
    return tickerColorCache[ticker];
  }

  /** Get a 1–2 character icon/abbreviation for a ticker */
  function tickerInitials(ticker) {
    if (ticker === 'BTC') return '₿';
    if (ticker === 'ETH') return 'Ξ';
    if (ticker === 'SOL') return '◎';
    return ticker.slice(0, 2);
  }

  /** Generate an asset-class badge HTML snippet */
  function classBadge(cls) {
    return `<span class="cls-badge ${CLS_CSS[cls] || 'cb-stock'}">${cls}</span>`;
  }

  /** Generate an asset-class tag for legend rows */
  function classLegendTag(cls) {
    return `<span class="leg-cls-tag ${CLS_CSS[cls] || 'cb-stock'}">${cls}</span>`;
  }

  /**
   * Get a gain/loss colour class based on a sign flag.
   * @param {'n'|'g'|'r'} flag - n=neutral, g=gain, r=loss
   * @returns {string} CSS class name
   */
  function gainClass(flag) {
    return flag === 'n' ? 'c-muted' : flag === 'g' ? 'c-green' : 'c-red';
  }

  /* ═══════════════════════════════════════════════════════════════════
     CRUD OPERATIONS
     Create, delete transactions and positions.
     Every mutation calls saveState() + render().
     ═══════════════════════════════════════════════════════════════════ */

  /** Add a new transaction to the ledger */
  function addTransaction(data) {
    state.transactions.push({
      id:     generateId(),
      date:   data.date,
      ticker: data.ticker,
      type:   data.type,
      qty:    +data.qty,
      price:  +data.price,
      fees:   +(data.fees  || 0),
      taxes:  +(data.taxes || 0),
      notes:  data.notes || '',
    });

    // Auto-set asset class if not already known
    if (!state.tickerMeta[data.ticker]) {
      state.tickerMeta[data.ticker] = { cls: data.cls || guessClass(data.ticker) };
    }

    // Seed price cache for new tickers
    if (!state.priceCache[data.ticker]) {
      state.priceCache[data.ticker] = { price: getMockPrice(data.ticker), ts: Date.now(), src: 'sim' };
    }

    saveState();
    render();
    toast(`${data.type === 'BUY' ? 'Bought' : 'Sold'} ${data.qty} ${data.ticker}`, 'success');
  }

  /**
   * Delete a single transaction by its unique ID.
   * @param {string} id - Transaction ID to remove
   */
  function deleteTransaction(id) {
    const tx = state.transactions.find(t => t.id === id);
    if (tx) {
      if (!Array.isArray(state.deletedTransactions)) state.deletedTransactions = [];
      state.deletedTransactions.unshift({ ...tx, _deletedAt: new Date().toISOString() });
      // Keep only the most recent deletions for recovery
      if (state.deletedTransactions.length > MAX_DELETED_HISTORY) {
        state.deletedTransactions = state.deletedTransactions.slice(0, MAX_DELETED_HISTORY);
      }
    }
    state.transactions = state.transactions.filter(t => t.id !== id);
    saveState();
    render();
    toast('Transaction deleted — recoverable from History', 'info');
  }

  /** Restore a previously deleted transaction */
  function restoreTransaction(id) {
    if (!Array.isArray(state.deletedTransactions)) return;
    const tx = state.deletedTransactions.find(t => t.id === id);
    if (!tx) return;
    const { _deletedAt, ...clean } = tx;
    state.transactions.push(clean);
    state.deletedTransactions = state.deletedTransactions.filter(t => t.id !== id);
    if (!state.tickerMeta[clean.ticker]) state.tickerMeta[clean.ticker] = { cls: guessClass(clean.ticker) };
    saveState();
    render();
    toast(clean.ticker + ' transaction restored', 'success');
  }

  /**
   * Delete all transactions for a ticker and clean up its cached data.
   * @param {string} ticker - Ticker symbol (e.g. 'AAPL')
   */
  function deletePosition(ticker) {
    state.transactions = state.transactions.filter(t => t.ticker !== ticker);
    delete state.priceCache[ticker];
    delete state.tickerMeta[ticker];
    delete tickerColorCache[ticker];
    saveState();
    render();
    toast(ticker + ' removed', 'info');
  }

  /* ═══════════════════════════════════════════════════════════════════
     RENDER PIPELINE
     Main render() function triggers all tab renders.
     Each tab has its own render function.
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * Re-render all visible UI from current state.
   * Recomputes positions and summary on every call.
   * Called after every state mutation.
   */
  function render() {
    const positions = computePositions();
    const summary = computeSummary(positions);
    renderOverview(positions, summary);
    renderPositions(positions);
    renderHistory();
    updateStorageStatus();
  }

  /* ── Overview Tab ────────────────────────────────────────────────── */

  function renderOverview(positions, summary) {
    const rows = Object.values(positions).filter(r => r.shares > QTY_EPSILON).sort((a, b) => b.value - a.value);
    const best = rows.length ? [...rows].sort((a, b) => b.unrealizedPct - a.unrealizedPct)[0] : null;

    const xirrClass = summary.xirr === null ? 'c-muted' : summary.xirr >= 0 ? 'c-green' : 'c-red';
    const cagrClass = summary.cagr === null ? 'c-muted' : summary.cagr >= 0 ? 'c-green' : 'c-red';

    // Win rate + best/worst XIRR (used by KPI cards and passed to renderInlineAnalytics)
    const winners  = rows.filter(r => r.unrealized >= 0).length;
    const winRate  = rows.length ? Math.round(winners / rows.length * 100) : 0;
    const winColor = winRate >= 60 ? 'var(--green)' : winRate >= 40 ? 'var(--amber)' : 'var(--red)';
    const withXIRR = rows.filter(r => r.xirr !== null);
    const bestX    = withXIRR.length ? withXIRR.reduce((a, b) => b.xirr > a.xirr ? b : a) : null;
    const worstX   = withXIRR.length ? withXIRR.reduce((a, b) => b.xirr < a.xirr ? b : a) : null;

    // ── Mini sparkline helper (must be defined before kpis array uses it) ──
    const txBuys = [...state.transactions].filter(t => t.type === 'BUY').sort((a, b) => a.date.localeCompare(b.date));
    function miniSpark(color) {
      if (!txBuys.length) return '';
      const n = 7;
      const pts = Array.from({ length: n }, (_, i) => {
        const d = txBuys[Math.floor(i * txBuys.length / n)].date;
        return state.transactions
          .filter(t => t.date <= d && t.type === 'BUY')
          .reduce((s, t) => s + t.qty * eurToDisplay(t.price, t.date), 0);
      });
      const mn = Math.min(...pts), mx = Math.max(...pts) || 1;
      const norm = pts.map(v => 18 - (v - mn) / (mx - mn + 0.001) * 15);
      const step = 76 / Math.max(n - 1, 1);
      const d = norm.map((y, i) => (i === 0 ? 'M' : 'L') + (2 + i * step).toFixed(1) + ' ' + y.toFixed(1)).join(' ');
      return `<div class="kpi-spark"><svg viewBox="0 0 80 20" height="20" preserveAspectRatio="none">
        <path d="${d}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>
      </svg></div>`;
    }

    // ── KPI cards ──────────────────────────────────────────────────────────
    const kpis = [
      { label: 'Total Value',    value: fmtValue(summary.totalValue),  sub: 'Cost ' + fmtValue(summary.totalCost),
        bar: 'linear-gradient(90deg,var(--blue),var(--purple))', delay: '.05s',
        delta: summary.unrealizedPct !== 0 ? (summary.unrealizedPct >= 0 ? '↑ ' : '↓ ') + fmtPct(summary.unrealizedPct) + ' total' : null,
        deltaClass: summary.unrealized >= 0 ? 'up' : 'dn',
        spark: miniSpark('var(--blue)'),
        icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>' },
      { label: 'Unrealised P&L', value: (summary.unrealized >= 0 ? '+' : '') + fmtValue(summary.unrealized),
        sub: fmtPct(summary.unrealizedPct), subClass: summary.unrealized >= 0 ? 'c-green' : 'c-red',
        bar: summary.unrealized >= 0 ? 'var(--green)' : 'var(--red)', delay: '.09s',
        valClass: summary.unrealized >= 0 ? 'c-green' : 'c-red',
        spark: miniSpark(summary.unrealized >= 0 ? 'var(--green)' : 'var(--red)'),
        icon: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>' },
      { label: 'Realised Gains', value: (summary.realized >= 0 ? '+' : '') + fmtValue(summary.realized), sub: 'from closed lots',
        bar: summary.realized >= 0 ? 'var(--green)' : 'var(--red)', delay: '.13s',
        valClass: summary.realized >= 0 ? 'c-green' : 'c-red',
        icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
      { label: 'Net P&L', value: ((summary.unrealized + summary.realized) >= 0 ? '+' : '') + fmtValue(summary.unrealized + summary.realized), 
        sub: 'total realised + unrealised',
        bar: (summary.unrealized + summary.realized) >= 0 ? 'var(--green)' : 'var(--red)', delay: '.15s',
        valClass: (summary.unrealized + summary.realized) >= 0 ? 'c-green' : 'c-red',
        icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
      { label: 'Portfolio CAGR', value: fmtCAGR(summary.cagr),         sub: state.settings.currency + '-adj. annualised',
        bar: summary.cagr !== null && summary.cagr >= 0 ? 'var(--green)' : 'var(--red)', delay: '.19s',
        valClass: cagrClass, subClass: cagrClass,
        icon: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>' },
      { label: 'Portfolio XIRR', value: fmtXIRR(summary.xirr),         sub: 'time-weighted returns',
        bar: summary.xirr !== null && summary.xirr >= 0 ? 'var(--green)' : 'var(--red)', delay: '.23s',
        valClass: xirrClass, subClass: xirrClass,
        spark: miniSpark(summary.xirr !== null && summary.xirr >= 0 ? 'var(--green)' : 'var(--muted)'),
        icon: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' },
      { label: 'Win Rate',       value: winRate + ' %',
        sub: winners + ' winning · ' + (rows.length - winners) + ' losing',
        bar: winColor, delay: '.27s', valClass: winRate >= 50 ? 'c-green' : 'c-red',
        icon: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' },
      { label: 'Best XIRR',      value: bestX ? bestX.ticker : '—',
        sub: bestX ? fmtXIRR(bestX.xirr) : '—',
        subClass: bestX && bestX.xirr >= 0 ? 'c-green' : 'c-red',
        valClass: bestX ? '' : 'c-muted',
        bar: 'linear-gradient(90deg,var(--green),var(--blue))', delay: '.31s',
        icon: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' },
      { label: 'Needs Attention', value: (worstX && worstX.ticker !== bestX?.ticker) ? worstX.ticker : '—',
        sub: (worstX && worstX.ticker !== bestX?.ticker) ? fmtXIRR(worstX.xirr) : 'all positions healthy',
        subClass: worstX && worstX.xirr < 0 ? 'c-red' : 'c-muted',
        valClass: worstX && worstX.xirr < 0 ? 'c-red' : 'c-muted',
        bar: (worstX && worstX.xirr < 0) ? 'var(--red)' : 'var(--dim)', delay: '.35s',
        icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' },
      { label: 'Avg Hold Time',   value: summary.avgDaysHeld > 0 ? (summary.avgDaysHeld < 365 ? summary.avgDaysHeld + 'd' : fmtNum(summary.avgDaysHeld/365.25,1) + 'yr') : '—',
        sub: 'weighted by cost basis', bar: 'var(--blue)', delay: '.39s',
        icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
      { label: 'Concentration',   value: fmtNum(summary.concentration, 1) + ' %',
        sub: 'largest single position', bar: summary.concentration > 40 ? 'var(--amber)' : 'var(--purple)', delay: '.43s',
        valClass: summary.concentration > 40 ? 'c-muted' : '',
        icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' },
    ];

    el('ov-kpis').innerHTML = kpis.map(k => `
      <div class="kpi-card" style="animation-delay:${k.delay}">
        <div class="kpi-bar" style="background:${k.bar}"></div>
        <div class="kpi-icon-bg"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${k.icon}</svg></div>
        <div class="kpi-lbl">${k.label}</div>
        <div class="kpi-val ${k.valClass || ''}">${k.value}</div>
        <div class="kpi-sub ${k.subClass || ''}">${k.sub}</div>
        ${k.delta ? `<div class="kpi-delta ${k.deltaClass || 'nt'}">${k.delta}</div>` : ''}
        ${k.spark || ''}
      </div>`).join('');

    // Donut charts
    const totalV = rows.reduce((sum, r) => sum + r.value, 0) || 1;

    if (rows.length) {
      // By Asset donut
      drawSVGDonut('donut-asset-svg', 'donut-asset-leg',
        rows.map(r => ({ label: r.ticker, value: r.value, color: tickerColor(r.ticker), cls: r.cls, ticker: r.ticker })),
        totalV
      );

      // By Class donut — aggregate values by asset class
      const byClass = {};
      for (const r of rows) {
        if (!byClass[r.cls]) byClass[r.cls] = { value: 0, color: CLASS_COLORS[r.cls] || '#5b9cff' };
        byClass[r.cls].value += r.value;
      }
      drawSVGDonut('donut-class-svg', 'donut-class-leg',
        Object.entries(byClass).map(([cls, data]) => ({ label: cls, value: data.value, color: data.color, cls, ticker: '' })),
        totalV
      );
    } else {
      el('donut-asset-svg').innerHTML = '<div style="color:var(--muted);font-size:12px;padding:20px">No positions</div>';
      el('donut-asset-leg').innerHTML = '';
    }

    // ── Invested vs Market Value bar chart ─────────────────────────────
    const barContainer = el('ov-bar-chart');
    if (barContainer) {
      const maxVal = Math.max(...rows.map(r => Math.max(r.costDisp, r.value)), 1);
      barContainer.innerHTML = rows.map(r => {
        const invW  = (r.costDisp / maxVal * 100).toFixed(1);
        const mktW  = (r.value    / maxVal * 100).toFixed(1);
        const color = tickerColor(r.ticker);
        const gainColor = r.unrealized >= 0 ? 'var(--green)' : 'var(--red)';
        return `<div class="ov-bar-row">
          <div class="ov-bar-tick" style="color:${color}">${r.ticker}</div>
          <div class="ov-bar-track">
            <div class="ov-bar-pair">
              <div class="ov-bar-pair-lbl">Inv</div>
              <div class="ov-bar-rail"><div class="ov-bar-fill" style="width:${invW}%;background:${color};opacity:.45"></div></div>
              <div class="ov-bar-amt">${fmtCompact(r.costDisp)}</div>
            </div>
            <div class="ov-bar-pair">
              <div class="ov-bar-pair-lbl">Mkt</div>
              <div class="ov-bar-rail"><div class="ov-bar-fill" style="width:${mktW}%;background:${color};opacity:.85"></div></div>
              <div class="ov-bar-amt" style="color:var(--text)">${fmtCompact(r.value)}</div>
            </div>
          </div>
          <div class="ov-bar-val">
            <span style="color:${gainColor};font-weight:600">${fmtPct(r.unrealizedPct)}</span>
            <span style="color:${gainColor}">${r.unrealized >= 0 ? '+' : ''}${fmtCompact(r.unrealized)}</span>
          </div>
        </div>`;
      }).join('');
    }

    // ── Analytics section (merged into Overview) ───────────────────────────
    renderInlineAnalytics(rows, summary);
  }

  /**
   * Render the analytics section inside the Overview tab.
   * Shows: Position Metrics (by asset / by class toggle), Fees & Taxes, Yearly Trading Costs.
   */
  function renderInlineAnalytics(rows, summary) {
    const target = el('ov-analytics');
    // rows already excludes liquidated (filtered in renderOverview)
    if (!target || !rows.length) {
      if (target) target.innerHTML = '';
      return;
    }

    const sorted = [...rows].sort((a, b) => {
      let av = a[_anSortKey], bv = b[_anSortKey];
      if (_anSortKey === 'ticker') return _anSortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      av = av ?? (_anSortAsc ? Infinity : -Infinity);
      bv = bv ?? (_anSortAsc ? Infinity : -Infinity);
      return _anSortAsc ? av - bv : bv - av;
    });

    function th(key, label) {
      const active = _anSortKey === key;
      return `<th class="${active ? 'an-sort-active' + (_anSortAsc ? ' an-sort-asc' : '') : ''}" onclick="App.analyticsSort('${key}')">${label}</th>`;
    }

    // ── Build "By Class" aggregated rows ──
    const byClassMap = {};
    for (const r of rows) {
      if (!byClassMap[r.cls]) byClassMap[r.cls] = { cls: r.cls, costDisp: 0, value: 0, unrealized: 0, unrealizedPct: 0, realized: 0, xirrs: [], cagrs: [], count: 0 };
      const c = byClassMap[r.cls];
      c.costDisp += r.costDisp; c.value += r.value; c.unrealized += r.unrealized; c.realized += r.realized;
      if (r.xirr !== null) c.xirrs.push({ xirr: r.xirr, weight: r.costDisp });
      if (r.cagr !== null) c.cagrs.push({ cagr: r.cagr, weight: r.costDisp });
      c.count++;
    }
    const classRows = Object.values(byClassMap).map(c => {
      c.unrealizedPct = c.costDisp > 0 ? (c.unrealized / c.costDisp) * 100 : 0;
      const totalW1 = c.xirrs.reduce((s, x) => s + x.weight, 0);
      c.xirr = totalW1 > 0 ? c.xirrs.reduce((s, x) => s + x.xirr * x.weight, 0) / totalW1 : null;
      const totalW2 = c.cagrs.reduce((s, x) => s + x.weight, 0);
      c.cagr = totalW2 > 0 ? c.cagrs.reduce((s, x) => s + x.cagr * x.weight, 0) / totalW2 : null;
      c.ticker = c.cls; // for sorting compatibility
      return c;
    });

    const isAsset = _anViewMode === 'asset';
    const tableRows = isAsset ? sorted : classRows;

    // ── Position Metrics table ──
    function renderRow(r) {
      const gc = r.unrealized >= 0 ? 'var(--green)' : 'var(--red)';
      const xc = r.xirr === null ? 'var(--muted)' : r.xirr >= 0 ? 'var(--green)' : 'var(--red)';
      const cc = r.cagr === null ? 'var(--muted)' : r.cagr >= 0 ? 'var(--green)' : 'var(--red)';
      const nameCol = isAsset
        ? `<span style="color:${tickerColor(r.ticker)}">${r.ticker}</span> ${classBadge(r.cls)}`
        : `${classBadge(r.cls)} <span style="color:var(--text2);font-size:10px;margin-left:4px">${r.count} position${r.count !== 1 ? 's' : ''}</span>`;
      const clickAttr = isAsset ? `onclick="App.openDrawer('${r.ticker}')"` : '';
      return `<tr ${clickAttr} style="${isAsset ? 'cursor:pointer' : ''}">
        <td>${nameCol}</td>
        <td style="color:${gc}">${fmtPct(r.unrealizedPct)}</td>
        <td style="color:${gc}">${r.unrealized >= 0 ? '+' : ''}${fmtValue(r.unrealized)}</td>
        <td style="color:${xc}">${r.xirr !== null ? fmtXIRR(r.xirr) : '—'}</td>
        <td style="color:${cc}">${fmtCAGR(r.cagr)}</td>
        <td style="color:var(--text)">${fmtValue(r.value)}</td>
        <td>${fmtValue(r.costDisp)}</td>
      </tr>`;
    }

    // ── Fees & Taxes: build per-class data with proper EUR→display conversion ──
    const feesByClass = {};
    for (const tx of state.transactions) {
      const cls = state.tickerMeta[tx.ticker]?.cls || guessClass(tx.ticker);
      if (!feesByClass[cls]) feesByClass[cls] = { fees: 0, taxes: 0, cost: 0, value: 0, realized: 0 };
      feesByClass[cls].fees  += eurToDisplay(+(tx.fees  || 0), tx.date);
      feesByClass[cls].taxes += eurToDisplay(+(tx.taxes || 0), tx.date);
    }
    for (const pos of Object.values(rows)) {
      const cls = pos.cls;
      if (!feesByClass[cls]) feesByClass[cls] = { fees: 0, taxes: 0, cost: 0, value: 0, realized: 0 };
      feesByClass[cls].cost     += pos.costDisp;
      feesByClass[cls].value    += pos.value;
      feesByClass[cls].realized += pos.realized;
    }
    const totalFeesD  = Object.values(feesByClass).reduce((s, d) => s + d.fees, 0);
    const totalTaxesD = Object.values(feesByClass).reduce((s, d) => s + d.taxes, 0);
    const hasFeeData = totalFeesD > 0 || totalTaxesD > 0;

    // ── Yearly Trading Costs breakdown ──
    const yearlyData = {};
    for (const tx of state.transactions) {
      const year = tx.date.slice(0, 4);
      if (!yearlyData[year]) yearlyData[year] = { volume: 0, fees: 0, taxes: 0, realized: 0, txCount: 0 };
      const y = yearlyData[year];
      y.volume += eurToDisplay(tx.qty * tx.price, tx.date);
      y.fees   += eurToDisplay(+(tx.fees  || 0), tx.date);
      y.taxes  += eurToDisplay(+(tx.taxes || 0), tx.date);
      y.txCount++;
      // Approximate realised P&L per year from sells only
      if (tx.type === 'SELL') {
        // We can't do exact FIFO per-year here without heavy computation,
        // but the per-class realized is already computed above.
        // For yearly view, we track sell proceeds minus cost approximation.
      }
    }
    // Aggregate realised gains per year from sell transactions using FIFO info
    // Simplified: use the total realized from summary spread by sell-year proportion
    const sellsByYear = {};
    let totalSellVolume = 0;
    for (const tx of state.transactions) {
      if (tx.type !== 'SELL') continue;
      const year = tx.date.slice(0, 4);
      const vol = eurToDisplay(tx.qty * tx.price, tx.date);
      sellsByYear[year] = (sellsByYear[year] || 0) + vol;
      totalSellVolume += vol;
    }
    for (const [year, sellVol] of Object.entries(sellsByYear)) {
      if (yearlyData[year] && totalSellVolume > 0) {
        yearlyData[year].realized = summary.realized * (sellVol / totalSellVolume);
      }
    }
    const years = Object.keys(yearlyData).sort().reverse();
    const hasYearlyData = years.length > 0 && (totalFeesD > 0 || totalTaxesD > 0);

    target.innerHTML = `
      <div style="margin-top:18px"></div>

      <!-- Position Metrics with By Asset / By Class toggle -->
      <div class="panel" style="margin-bottom:12px">
        <div class="panel-hdr">
          <span class="panel-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            Position Metrics
          </span>
          <div style="display:flex;gap:3px">
            <button class="cls-fb ${isAsset ? 'active' : ''}" onclick="App.switchAnView('asset')" style="font-size:9px;padding:3px 8px">By Asset</button>
            <button class="cls-fb ${!isAsset ? 'active' : ''}" onclick="App.switchAnView('class')" style="font-size:9px;padding:3px 8px">By Class</button>
          </div>
        </div>
        <div class="tbl-wrap">
          <table class="an-tbl">
            <thead><tr>
              ${th('ticker', isAsset ? 'Ticker' : 'Class')}
              ${th('unrealizedPct', 'P&L %')}
              ${th('unrealized', 'P&L')}
              ${th('xirr', 'XIRR')}
              ${th('cagr', 'CAGR')}
              ${th('value', 'Value')}
              ${th('costDisp', 'Cost')}
            </tr></thead>
            <tbody>
              ${tableRows.map(r => renderRow(r)).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Fees & Taxes by class -->
      ${hasFeeData ? `
      <div class="panel" style="margin-bottom:12px">
        <div class="panel-hdr">
          <span class="panel-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Fees & Taxes
          </span>
          <span class="panel-badge">${state.settings.currency} · by asset class</span>
        </div>
        <div class="tbl-wrap">
          <table class="an-tbl">
            <thead><tr>
              <th style="text-align:left">Class</th>
              <th>Invested</th><th>Market Value</th><th>Realised P&L</th>
              <th>Fees</th><th>Taxes</th><th>Net P&L</th>
            </tr></thead>
            <tbody>
              ${Object.entries(feesByClass).map(([cls, d]) => {
                const net = d.realized - d.fees - d.taxes;
                return `<tr>
                  <td>${classBadge(cls)}</td>
                  <td>${fmtValue(d.cost)}</td>
                  <td>${fmtValue(d.value)}</td>
                  <td style="color:${d.realized>=0?'var(--green)':'var(--red)'}">${d.realized>=0?'+':''}${fmtValue(d.realized)}</td>
                  <td style="color:var(--amber)">${d.fees>0?'−'+fmtValue(d.fees):'—'}</td>
                  <td style="color:var(--red)">${d.taxes>0?'−'+fmtValue(d.taxes):'—'}</td>
                  <td style="color:${net>=0?'var(--green)':'var(--red)'};font-weight:700">${net>=0?'+':''}${fmtValue(net)}</td>
                </tr>`;
              }).join('')}
              <tr style="border-top:.5px solid var(--b2)">
                <td style="font-weight:800;color:var(--text)">Total</td>
                <td>${fmtValue(summary.totalCost)}</td>
                <td>${fmtValue(summary.totalValue)}</td>
                <td style="color:${summary.realized>=0?'var(--green)':'var(--red)'}">${summary.realized>=0?'+':''}${fmtValue(summary.realized)}</td>
                <td style="color:var(--amber)">${totalFeesD>0?'−'+fmtValue(totalFeesD):'—'}</td>
                <td style="color:var(--red)">${totalTaxesD>0?'−'+fmtValue(totalTaxesD):'—'}</td>
                <td style="color:${(summary.realized-totalFeesD-totalTaxesD)>=0?'var(--green)':'var(--red)'};font-weight:700">${(summary.realized-totalFeesD-totalTaxesD)>=0?'+':''}${fmtValue(summary.realized-totalFeesD-totalTaxesD)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>` : ''}

      <!-- Yearly Trading Costs -->
      ${hasYearlyData ? `
      <div class="panel" style="margin-bottom:12px">
        <div class="panel-hdr">
          <span class="panel-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Yearly Trading Costs
          </span>
          <span class="panel-badge">${state.settings.currency} · for tax planning</span>
        </div>
        <div class="tbl-wrap">
          <table class="an-tbl">
            <thead><tr>
              <th style="text-align:left">Year</th>
              <th>Trades</th>
              <th>Volume Traded</th>
              <th>Fees Paid</th>
              <th>Fees %</th>
              <th>Taxes Paid</th>
              <th>Realised P&L</th>
              <th>Tax Rate</th>
            </tr></thead>
            <tbody>
              ${years.map(year => {
                const y = yearlyData[year];
                const feePct = y.volume > 0 ? (y.fees / y.volume * 100) : 0;
                const taxRate = y.realized > 0 ? (y.taxes / y.realized * 100) : 0;
                return `<tr>
                  <td style="text-align:left;font-weight:800;color:var(--text)">${year}</td>
                  <td style="color:var(--text)">${y.txCount}</td>
                  <td>${fmtValue(y.volume)}</td>
                  <td style="color:var(--amber)">${y.fees > 0 ? '−' + fmtValue(y.fees) : '—'}</td>
                  <td style="color:var(--amber)">${y.fees > 0 ? fmtNum(feePct, 2) + ' %' : '—'}</td>
                  <td style="color:var(--red)">${y.taxes > 0 ? '−' + fmtValue(y.taxes) : '—'}</td>
                  <td style="color:${y.realized >= 0 ? 'var(--green)' : 'var(--red)'}">${y.realized !== 0 ? (y.realized >= 0 ? '+' : '') + fmtValue(y.realized) : '—'}</td>
                  <td style="color:${taxRate > 0 ? 'var(--red)' : 'var(--muted)'}">${y.taxes > 0 && y.realized > 0 ? fmtNum(taxRate, 1) + ' %' : '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}
    `;
  }

  /* ── SVG Donut Chart ─────────────────────────────────────────────── */

  /**
   * Draw an SVG donut chart with clickable slices and a legend.
   * @param {string} svgContainerId - ID of the SVG wrapper div
   * @param {string} legendId       - ID of the legend wrapper div
   * @param {Array} slices          - [{label, value, color, cls, ticker}]
   * @param {number} total          - Sum of all values (for percentage calc)
   */
  function drawSVGDonut(svgContainerId, legendId, slices, total) {
    const cx = 120, cy = 120, outerR = 102, innerR = 60, gap = 0.025;
    let angle = -Math.PI / 2;
    let paths = '';

    for (const slice of slices) {
      const fraction = slice.value / total;
      const sweep = fraction * Math.PI * 2;
      const startAngle = angle + gap / 2;
      const endAngle = angle + sweep - gap / 2;

      if (sweep - gap > 0.001) {
        const x1 = cx + outerR * Math.cos(startAngle), y1 = cy + outerR * Math.sin(startAngle);
        const x2 = cx + outerR * Math.cos(endAngle),   y2 = cy + outerR * Math.sin(endAngle);
        const x3 = cx + innerR * Math.cos(endAngle),   y3 = cy + innerR * Math.sin(endAngle);
        const x4 = cx + innerR * Math.cos(startAngle),  y4 = cy + innerR * Math.sin(startAngle);
        const largeArc = sweep > Math.PI ? 1 : 0;
        const clickHandler = slice.ticker ? `onclick="App.openDrawer('${slice.ticker}')"` : '';

        paths += `<path d="M${x1} ${y1} A${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} L${x3} ${y3} A${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}Z"
          fill="${slice.color}" style="cursor:${slice.ticker ? 'pointer' : 'default'};transition:opacity .15s" ${clickHandler}
          onmouseover="this.style.opacity='.78'" onmouseout="this.style.opacity='1'">
          <title>${slice.label} · ${fmtNum(fraction * 100, 1)} % · ${fmtValue(slice.value)}</title></path>`;
      }
      angle += fraction * Math.PI * 2;
    }

    el(svgContainerId).innerHTML = `
      <svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" style="width:220px;height:220px;overflow:visible">
        ${paths}
        <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="var(--surf)"/>
        <text x="${cx}" y="${cy - 8}" text-anchor="middle" dominant-baseline="middle" fill="var(--text)" font-family="DM Mono,monospace" font-size="11" font-weight="500">${slices.length} ${slices[0]?.cls ? 'Classes' : 'Assets'}</text>
        <text x="${cx}" y="${cy + 10}" text-anchor="middle" dominant-baseline="middle" fill="var(--muted)" font-family="DM Mono,monospace" font-size="10">${fmtValue(total)}</text>
      </svg>`;

    el(legendId).innerHTML = slices.map(s => `
      <div class="leg-row" ${s.ticker ? `onclick="App.openDrawer('${s.ticker}')"` : ''} style="${!s.ticker ? 'cursor:default' : ''}">
        <div class="leg-left">
          <div class="leg-dot" style="background:${s.color}"></div>
          <span class="leg-ticker">${s.label}</span>
          ${classLegendTag(s.cls)}
        </div>
        <div class="leg-right">
          <span style="color:var(--text)">${fmtNum((s.value / total) * 100, 1)} %</span>
          <span>${fmtValue(s.value)}</span>
        </div>
      </div>`).join('');
  }

  /* ── Module Switcher ─────────────────────────────────────────────── */

  /** Switch the active top-level module (sidebar icon navigation) */
  function switchModule(modId) {
    const modules = ['portfolio', 'habits', 'calc', 'compare'];
    modules.forEach(m => {
      const pane = el('mod-' + m);
      if (pane) pane.classList.toggle('active', m === modId);
    });
    // Toggle active state on all sidebar icons
    modules.forEach(id => {
      const btn = el('sb-' + id);
      if (btn) btn.classList.toggle('active', id === modId);
    });
  }

  /* ── Analytics Tab ───────────────────────────────────────────────── */

  /** Sort state for analytics table */
  let _anSortKey = 'value';
  let _anSortAsc = false;
  let _anViewMode = 'asset'; // 'asset' = per-ticker rows, 'class' = aggregated by class

  /** Handle click on an analytics column header — re-renders overview */
  function analyticsSort(key) {
    if (_anSortKey === key) {
      _anSortAsc = !_anSortAsc;
    } else {
      _anSortKey = key;
      _anSortAsc = (key === 'ticker');
    }
    render();
  }

  /** Toggle Position Metrics between per-asset and per-class view */
  function switchAnView(mode) {
    _anViewMode = mode;
    render();
  }

  function switchAllocTab(tab) {
    ['asset', 'class'].forEach(key => {
      el(`atab-${key}`).classList.toggle('active', key === tab);
      el(`aview-${key}`).classList.toggle('active', key === tab);
    });
  }

  /* ── Positions Tab ───────────────────────────────────────────────── */

  function renderPositions(positions) {
    const allRows = Object.values(positions);
    // Show active (non-zero) position count
    const activeAll = allRows.filter(r => r.shares > QTY_EPSILON);
    el('pos-count').textContent = activeAll.length;

    // Apply class filter
    const filteredRows = clsFilter === 'all' ? allRows : allRows.filter(r => r.cls === clsFilter);
    const activeRows     = filteredRows.filter(r => r.shares > QTY_EPSILON);
    const liquidatedRows = filteredRows.filter(r => r.shares <= QTY_EPSILON);

    if (!filteredRows.length) {
      el('pos-grid').innerHTML = `<div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
        <h3>${clsFilter === 'all' ? 'No positions yet' : 'No ' + clsFilter + ' positions'}</h3>
        <p>Click <strong>Add Transaction</strong> to log your first trade.</p></div>`;
      return;
    }

    const totalPortfolioValue = activeRows.reduce((sum, r) => sum + r.value, 0);

    function buildCard(p, i) {
      const color = tickerColor(p.ticker);
      const gainColor = p.unrealized >= 0 ? 'var(--green)' : 'var(--red)';
      const isLiquidated = p.shares <= QTY_EPSILON;
      const isSimulated = !isLiquidated && (p.src === 'sim' || p.src === 'mock-fb');
      const sourceLabel = p.src === 'av' ? '🟢 live·AV' : p.src === 'yahoo' ? '🟢 live·YF' : p.src === 'cg' ? '🟢 live·CG' : p.src === 'mock-fb' ? '⚠ fallback' : '⚡ sim';
      const cagrFlag = p.cagr === null ? 'n' : p.cagr >= 0 ? 'g' : 'r';
      const xirrFlag = p.xirr === null ? 'n' : p.xirr >= 0 ? 'g' : 'r';
      const cardStyle = isLiquidated ? 'opacity:0.6;filter:saturate(0.4)' : '';

      return `<div class="pos-card" style="animation-delay:${0.04 + i * 0.04}s;${cardStyle}">
        <div class="pos-card-bar" style="background:linear-gradient(90deg,${color}aa,${color}22)"></div>
        ${isSimulated ? `<div style="background:rgba(255,180,0,0.08);border-bottom:0.5px solid rgba(255,180,0,0.25);padding:4px 14px;font-size:9.5px;font-weight:700;color:var(--amber);letter-spacing:0.06em;display:flex;align-items:center;gap:5px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          SIMULATED PRICE — API unavailable for ${p.ticker}
        </div>` : ''}
        <div class="pos-card-body">
          <div class="pos-card-head">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="pos-icon" style="background:${color}18;color:${color}">${tickerInitials(p.ticker)}</div>
              <div>
                <div class="pos-name-primary">${p.companyName || TICKER_NAMES[p.ticker] || p.ticker}</div>
                <div class="pos-ticker-secondary"><span style="font-family:var(--font-mono)">${p.ticker}</span>${classBadge(p.cls)}</div>
              </div>
            </div>
            <div>
              ${isLiquidated
                ? `<div class="pos-price" style="color:var(--muted);font-size:11px">Fully Exited</div>`
                : `<div class="pos-price">${fmtCompact(p.curDisp)}</div>
                   <div class="pos-price-ts">${sourceLabel} · ${timeAgo(p.lastTs)}</div>`}
            </div>
          </div>
          <div class="pos-metrics">
            ${isLiquidated ? `
            <div class="pm"><div class="pm-lbl">Shares</div><div class="pm-val" style="color:var(--muted)">0</div></div>
            <div class="pm"><div class="pm-lbl">Avg Cost</div><div class="pm-val">${fmtCompact(p.avgCostDisp)}</div></div>
            ` : `
            <div class="pm"><div class="pm-lbl">Shares</div><div class="pm-val">${fmtQty(p.shares)}</div></div>
            <div class="pm"><div class="pm-lbl">Avg Cost</div><div class="pm-val">${fmtCompact(p.avgCostDisp)}</div></div>
            <div class="pm"><div class="pm-lbl">Value</div><div class="pm-val highlight c-text">${fmtValue(p.value)}</div></div>
            <div class="pm"><div class="pm-lbl">Unrealised P&L</div><div class="pm-val highlight" style="color:${gainColor}">${p.unrealized >= 0 ? '+' : ''}${fmtValue(p.unrealized)}</div></div>
            `}
            <div class="pm"><div class="pm-lbl">Realised P&L</div><div class="pm-val" style="color:${p.realized >= 0 ? 'var(--green)' : 'var(--red)'}">${p.realized >= 0 ? '+' : ''}${fmtValue(p.realized)}</div></div>
            <div class="pm"><div class="pm-lbl">Net P&L</div><div class="pm-val" style="color:${(p.unrealized + p.realized) >= 0 ? 'var(--green)' : 'var(--red)'}">${(p.unrealized + p.realized) >= 0 ? '+' : ''}${fmtValue(p.unrealized + p.realized)}</div></div>
            ${!isLiquidated ? `
            <div class="pm wide">
              <div class="pm-lbl">Returns</div>
              <div class="xirr-row">
                <div class="xirr-kpi"><span class="lbl">CAGR</span><span class="${gainClass(cagrFlag)}">${fmtCAGR(p.cagr)}</span></div>
                <div class="xirr-kpi"><span class="lbl">XIRR</span><span class="${gainClass(xirrFlag)}">${p.xirr !== null ? fmtXIRR(p.xirr) : '—'}</span></div>
                <div class="xirr-kpi"><span class="lbl">ABS</span><span style="color:${gainColor}">${fmtPct(p.unrealizedPct)}</span></div>
              </div>
            </div>` : ''}
          </div>
        </div>
        <div class="pos-card-foot">
          <div class="pos-actions">
            <button class="pos-btn" onclick="App.openDrawer('${p.ticker}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Details
            </button>
            ${!isLiquidated ? `<button class="pos-btn" onclick="App.openModal('${p.ticker}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>` : ''}
            <button class="pos-btn" title="Rename ticker" onclick="App.renameTicker('${p.ticker}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="pos-btn danger" onclick="App.confirmDeletePos('${p.ticker}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
      </div>`;
    }

    let html = '';

    if (activeRows.length) {
      html += activeRows.sort((a, b) => b.value - a.value).map((p, i) => buildCard(p, i)).join('');
    } else {
      html += `<div class="empty-state" style="grid-column:1/-1">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
        <h3>No active positions</h3></div>`;
    }

    if (liquidatedRows.length) {
      html += `<div class="pos-section-divider" style="grid-column:1/-1">
        <div class="pos-section-line"></div>
        <span class="pos-section-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Liquidated · ${liquidatedRows.length}
        </span>
        <div class="pos-section-line"></div>
      </div>`;
      html += liquidatedRows.sort((a, b) => a.ticker.localeCompare(b.ticker)).map((p, i) => buildCard(p, i)).join('');
    }

    el('pos-grid').innerHTML = html;
  }

  /* ── History Tab ─────────────────────────────────────────────────── */

  function renderRecentlyDeleted() {
    const deleted = (state.deletedTransactions || []).slice(0, MAX_DELETED_HISTORY);
    const section = el('hist-deleted-section');
    const body    = el('hist-deleted-body');
    if (!section || !body) return;
    if (!deleted.length) { section.style.display = 'none'; return; }
    section.style.display = '';
    body.innerHTML = deleted.map(tx => {
      const color = tickerColor(tx.ticker);
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:.5px solid var(--b1)">
        <span style="font-weight:800;color:${color};font-family:var(--font-ui);font-size:12px;width:52px;flex-shrink:0">${tx.ticker}</span>
        <span class="type-badge ${tx.type==='BUY'?'buy':'sell'}" style="flex-shrink:0">${tx.type}</span>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--text2)">${fmtDate(tx.date)}</span>
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--muted)">×${fmtQty(tx.qty)}</span>
        <span style="font-size:10px;color:var(--dim);flex:1">${tx._deletedAt ? new Date(tx._deletedAt).toLocaleDateString() : ''}</span>
        <button class="pos-btn" style="font-size:10px;padding:3px 8px" onclick="App.restoreTransaction('${tx.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:10px;height:10px"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          Restore
        </button>
      </div>`;
    }).join('');
  }

  function renderHistory() {
    renderRecentlyDeleted();
    const query = (el('hist-search')?.value || '').toUpperCase().trim();
    const sortBy = el('hist-sort')?.value || 'date-desc';
    // Update price header to reflect selected currency
    const ph = el('hist-price-hdr');
    if (ph) ph.textContent = `Price (${state.settings.currency})`;

    let txs = [...state.transactions];

    // Filter by type
    if (histFilter === 'buy')  txs = txs.filter(t => t.type === 'BUY');
    if (histFilter === 'sell') txs = txs.filter(t => t.type === 'SELL');

    // Filter by search query
    if (query) txs = txs.filter(t => t.ticker.includes(query));

    // Sort
    const sortFns = {
      'date-desc':  (a, b) => b.date.localeCompare(a.date),
      'date-asc':   (a, b) => a.date.localeCompare(b.date),
      'ticker':     (a, b) => a.ticker.localeCompare(b.ticker),
      'value-desc': (a, b) => (b.qty * b.price) - (a.qty * a.price),
    };
    txs.sort(sortFns[sortBy] || sortFns['date-desc']);

    if (!txs.length) {
      el('hist-body').innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--muted)">No transactions found</td></tr>`;
      return;
    }

    el('hist-body').innerHTML = txs.map((tx, i) => {
      const color = tickerColor(tx.ticker);
      const isBuy = tx.type === 'BUY';
      const cls = state.tickerMeta[tx.ticker]?.cls || guessClass(tx.ticker);
      const currentPriceD = eurToDisplay(getPrice(tx.ticker));
      const buyPriceD = eurToDisplay(tx.price, tx.date);
      const totalD = tx.qty * buyPriceD;

      // P&L calculation: unrealised for BUY, realised for SELL
      let plHTML = '—';
      if (isBuy) {
        // BUY: show unrealised P&L (current price vs buy price)
        const pl = (currentPriceD - buyPriceD) * tx.qty;
        const plPct = ((currentPriceD - buyPriceD) / buyPriceD) * 100;
        plHTML = `<span class="${pl >= 0 ? 'c-green' : 'c-red'}">${pl >= 0 ? '+' : ''}${fmtValue(pl)} <span style="font-size:10px">(${fmtPct(plPct)})</span></span>`;
      } else {
        // SELL: show realised P&L (sell price vs average cost basis of sold shares)
        // For simplicity, compute average cost basis from all prior BUY transactions for this ticker
        const priorBuys = state.transactions.filter(t => 
          t.ticker === tx.ticker && 
          t.type === 'BUY' && 
          t.date < tx.date
        );
        
        if (priorBuys.length > 0) {
          // Calculate weighted average cost basis in EUR
          let totalCost = 0;
          let totalShares = 0;
          priorBuys.forEach(b => {
            totalCost += b.price * b.qty;
            totalShares += b.qty;
          });
          const avgCostBasis = totalShares > 0 ? totalCost / totalShares : 0;
          
          // Convert to display currency for comparison
          const avgCostBasisD = eurToDisplay(avgCostBasis, tx.date);
          const sellPriceD = buyPriceD; // buyPriceD is actually the sell price for SELL txs
          
          const pl = (sellPriceD - avgCostBasisD) * tx.qty;
          const plPct = avgCostBasisD > 0 ? ((sellPriceD - avgCostBasisD) / avgCostBasisD) * 100 : 0;
          plHTML = `<span class="${pl >= 0 ? 'c-green' : 'c-red'}">${pl >= 0 ? '+' : ''}${fmtValue(pl)} <span style="font-size:10px">(${fmtPct(plPct)})</span></span>`;
        } else {
          plHTML = '<span style="color:var(--dim)">No cost basis</span>';
        }
      }

      return `<tr>
        <td style="color:var(--dim)">${txs.length - i}</td>
        <td style="color:var(--text2)">${fmtDate(tx.date)}</td>
        <td><span class="type-badge ${isBuy ? 'buy' : 'sell'}">${tx.type}</span></td>
        <td><span style="font-weight:800;color:${color};font-family:var(--font-ui)">${tx.ticker}</span>${tx.notes ? `<div style="font-size:9px;color:var(--dim)">${tx.notes}</div>` : ''}</td>
        <td>${classBadge(cls)}</td>
        <td style="color:var(--text)">${fmtQty(tx.qty)}</td>
        <td style="color:var(--text)">${fmtCompact(buyPriceD)}</td>
        <td style="color:var(--text)">${fmtValue(totalD)}</td>
        <td>${plHTML}</td>
        <td><button class="del-btn" onclick="App.confirmDelTx('${tx.id}','${tx.ticker}',${tx.qty})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button></td>
      </tr>`;
    }).join('');
  }

  /* ═══════════════════════════════════════════════════════════════════
     POSITION DETAIL DRAWER
     Bottom sheet with full position breakdown.
     ═══════════════════════════════════════════════════════════════════ */

  function openDrawer(ticker) {
    activeDrawer = ticker;
    const positions = computePositions();
    const pos = positions[ticker];
    if (!pos) return;

    const color = tickerColor(ticker);
    const gainColor = pos.unrealized >= 0 ? 'var(--green)' : 'var(--red)';
    const accentBar = `linear-gradient(90deg,${color}cc,${color}44)`;
    const cagrColor = pos.cagr === null ? 'var(--muted)' : pos.cagr >= 0 ? 'var(--green)' : 'var(--red)';
    const xirrColor = pos.xirr === null ? 'var(--muted)' : pos.xirr >= 0 ? 'var(--green)' : 'var(--red)';

    // Header
    const icon = el('drw-icon');
    icon.textContent = tickerInitials(ticker);
    icon.style.cssText = `background:${color}20;color:${color};width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:15px;font-weight:800;flex-shrink:0`;

    el('drw-ticker').innerHTML = `${ticker} ${classBadge(pos.cls)}`;
    el('drw-full').textContent = (TICKER_NAMES[ticker] || ticker) + ' · ' +
      (pos.src === 'av' ? 'Live · Alpha Vantage' : pos.src === 'yahoo' ? 'Live · Yahoo Finance' : pos.src === 'cg' ? 'Live · CoinGecko' : 'Simulated price');
    // Update price column header to reflect selected currency
    const priceHdr = el('drw-price-hdr');
    if (priceHdr) priceHdr.textContent = `Price (${state.settings.currency})`;

    el('drw-pills').innerHTML = `
      <div class="drw-pill"><span class="lbl">CAGR</span><strong style="color:${cagrColor}">${fmtCAGR(pos.cagr)}</strong></div>
      <div class="drw-pill"><span class="lbl">XIRR</span><strong style="color:${xirrColor}">${fmtXIRR(pos.xirr)}</strong></div>`;

    // KPI row
    el('drw-kpis').innerHTML = [
      { label: 'Current Price',  value: fmtCompact(pos.curDisp), sub: state.settings.currency + ' · ' + pos.cls },
      { label: 'Total Shares',   value: fmtQty(pos.shares),      sub: pos.openLots.length + ' open lot' + (pos.openLots.length !== 1 ? 's' : '') },
      { label: 'Current Value',  value: fmtValue(pos.value),      sub: 'Cost: ' + fmtValue(pos.costDisp) },
      { label: 'Unrealised P&L', value: (pos.unrealized >= 0 ? '+' : '') + fmtValue(pos.unrealized), sub: fmtPct(pos.unrealizedPct), vc: gainColor },
      { label: 'Realised P&L',   value: (pos.realized >= 0 ? '+' : '') + fmtValue(pos.realized), sub: 'closed lots', vc: pos.realized >= 0 ? 'var(--green)' : 'var(--red)' },
    ].concat((() => {
      const posFees  = pos.txs.reduce((s,t) => s + (+(t.fees  || 0)), 0);
      const posTaxes = pos.txs.reduce((s,t) => s + (+(t.taxes || 0)), 0);
      const hasFT = posFees > 0 || posTaxes > 0;
      return hasFT ? [{ label: 'Fees · Taxes', value: posFees > 0 ? '−'+fmtValue(posFees) : '—', sub: posTaxes > 0 ? 'Tax: −'+fmtValue(posTaxes) : 'No taxes', vc: 'var(--amber)' }] : [];
    })()).map(k => `<div class="drw-kpi"><div class="drw-kpi-bar" style="background:${accentBar}"></div>
      <div class="drw-kpi-lbl">${k.label}</div>
      <div class="drw-kpi-val" style="${k.vc ? 'color:' + k.vc : ''}">${k.value}</div>
      <div class="drw-kpi-sub">${k.sub}</div></div>`).join('');

    // Summary bar
    el('drw-summary').innerHTML = `
      <span class="dl">Total Gain</span>
      <span class="dv" style="color:${pos.totalGain >= 0 ? 'var(--green)' : 'var(--red)'}">${pos.totalGain >= 0 ? '+' : ''}${fmtValue(pos.totalGain)}</span>
      <span class="dsep">·</span>
      <span class="dl">CAGR</span>
      <span class="dv" style="color:${cagrColor}">${fmtCAGR(pos.cagr)}</span>
      <span class="dsep">·</span>
      <span class="dl">XIRR</span>
      <span class="dv" style="color:${xirrColor}">${fmtXIRR(pos.xirr)}</span>
      <span class="dsep">·</span>
      <span class="dl">Avg hold</span>
      <span class="dv">${fmtNum(pos.avgYears, 1)} yr</span>
      <span class="dsep">·</span>
      <span class="dl">FX</span>
      <span class="dv" style="color:var(--blue)">${state.settings.currency}${fxLoaded.USD ? ' ✓ hist' : ' approx'}</span>`;

    // Lot distribution bar
    if (pos.openLots.length) {
      el('drw-lot-dist').style.display = '';
      el('drw-dist-track').innerHTML = pos.openLots.map((l, i) => {
        const pct = (l.qty / pos.shares) * 100;
        return `<div class="lot-dist-seg" style="width:${pct}%;background:${LOT_COLORS[i % LOT_COLORS.length]}"></div>`;
      }).join('');
      el('drw-dist-leg').innerHTML = pos.openLots.map((l, i) =>
        `<div class="lot-dist-item"><div class="lot-dist-dot" style="background:${LOT_COLORS[i % LOT_COLORS.length]}"></div>L${i + 1}: ${fmtQty(l.qty)}</div>`
      ).join('');
    } else {
      el('drw-lot-dist').style.display = 'none';
    }

    // Transaction history table
    el('drw-txs').innerHTML = [...pos.txs].sort((a, b) => b.date.localeCompare(a.date)).map((tx, i) => {
      const isBuy = tx.type === 'BUY';
      const buyPriceD = eurToDisplay(tx.price, tx.date);
      const pnl = isBuy ? (pos.curDisp - buyPriceD) * tx.qty : null;
      const pnlPct = isBuy ? ((pos.curDisp - buyPriceD) / buyPriceD) * 100 : null;

      return `<tr>
        <td><span class="lot-num" style="background:${color}22;color:${color}">${i + 1}</span></td>
        <td style="text-align:center"><span class="type-badge ${isBuy ? 'buy' : 'sell'}">${tx.type}</span></td>
        <td style="text-align:left;color:var(--text2)">${fmtDate(tx.date)}${tx.notes ? `<div style='font-size:9px;color:var(--dim)'>${tx.notes}</div>` : ''}</td>
        <td>${fmtQty(tx.qty)}</td>
        <td>${fmtCompact(buyPriceD)}</td>
        <td>${fmtValue(tx.qty * buyPriceD)}</td>
        <td style="color:var(--amber);font-size:10px">${(+(tx.fees||0)+(+(tx.taxes||0)))>0 ? '−'+fmtValue(+(tx.fees||0)+(+(tx.taxes||0))) : '—'}</td>
        <td style="color:${pnl === null ? 'var(--muted)' : pnl >= 0 ? 'var(--green)' : 'var(--red)'}">${pnl === null ? '—' : (pnl >= 0 ? '+' : '') + fmtValue(pnl)}</td>
        <td style="color:${pnlPct === null ? 'var(--muted)' : pnlPct >= 0 ? 'var(--green)' : 'var(--red)'}">${pnlPct === null ? '—' : fmtPct(pnlPct)}</td>
        <td><button class="del-btn" onclick="App.confirmDelTx('${tx.id}','${tx.ticker}',${tx.qty})" title="Delete this transaction"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/></svg></button></td>
      </tr>`;
    }).join('');

    // FIFO open lots table
    const hasFIFO = pos.openLots.length > 0;
    el('drw-fifo-lbl').style.display = hasFIFO ? '' : 'none';
    el('drw-fifo-tbl').style.display = hasFIFO ? '' : 'none';

    if (hasFIFO) {
      el('drw-fifo-body').innerHTML = pos.openLots.map((lot, i) => {
        const buyPriceD = eurToDisplay(lot.priceEUR, lot.date);
        const lotValue = lot.qty * pos.curDisp;
        const gain = lotValue - lot.costDisp;
        const gainPct = (gain / lot.costDisp) * 100;
        const lotCagr = calcCagr(lot.costDisp, lotValue, lot.avgYears);
        const lotXirrVal = lotXIRR(lot, pos.curDisp);
        const lotXirrColor = lotXirrVal === null ? 'var(--muted)' : lotXirrVal >= 0 ? 'var(--green)' : 'var(--red)';

        return `<tr>
          <td><span class="lot-num" style="background:${LOT_COLORS[i % LOT_COLORS.length]}22;color:${LOT_COLORS[i % LOT_COLORS.length]}">${i + 1}</span></td>
          <td style="text-align:left;color:var(--text2)">${fmtDate(lot.date)}</td>
          <td style="color:var(--text)">${fmtQty(lot.qty)}</td>
          <td>${fmtCompact(buyPriceD)}</td>
          <td>${fmtValue(lot.costDisp)}</td>
          <td style="color:var(--text)">${fmtValue(lotValue)}</td>
          <td style="color:${gain >= 0 ? 'var(--green)' : 'var(--red)'}">${gain >= 0 ? '+' : ''}${fmtValue(gain)}</td>
          <td><span class="pill ${gain >= 0 ? 'g' : 'r'}">${fmtPct(gainPct)}</span></td>
          <td style="color:${lotCagr === null ? 'var(--muted)' : lotCagr >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtCAGR(lotCagr)}</td>
          <td style="color:${lotXirrColor}">${fmtXIRR(lotXirrVal)}</td>
        </tr>`;
      }).join('');
    }

    // Show the drawer
    el('drw-ov').classList.add('open');
    el('drw').classList.add('open');
    document.body.style.overflow = 'hidden';

    // Draw dumbbell chart after layout settles
    requestAnimationFrame(() => requestAnimationFrame(() => drawDumbbell(pos)));
  }

  function closeDrawer() {
    activeDrawer = null;
    el('drw-ov').classList.remove('open');
    el('drw').classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ── Dumbbell Chart (Canvas) ─────────────────────────────────────
     Draws buy-price vs current-price for each open lot as connected dots.
     ─────────────────────────────────────────────────────────────────── */

  /**
   * Read a CSS variable value from the document root.
   * Used by the canvas chart to stay in sync with the active theme.
   * @param {string} varName - e.g. '--muted'
   * @returns {string} Resolved colour value
   */
  function cssVar(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  /** Draw a rounded rectangle path on a canvas context */
  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /** Draw the dumbbell chart for a position's open lots */
  function drawDumbbell(position) {
    const canvas = el('drw-dumbbell');
    if (!canvas) return;

    const lots = position.openLots;
    if (!lots.length) { canvas.style.display = 'none'; return; }
    canvas.style.display = '';

    const ctx = canvas.getContext('2d');
    const now = new Date();

    // Layout constants
    const INFO_W = 128, INFO_H = 54, INFO_GAP = 10;
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.max(canvas.parentElement.clientWidth - 24, 360);
    const ROW_H = 92, PAD_TOP = 34, PAD_BOT = 32, PAD_L = 78, PAD_R = INFO_W + INFO_GAP + 18;
    const cssH = PAD_TOP + lots.length * ROW_H + PAD_BOT;

    // Set canvas dimensions for HiDPI
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    // Pre-compute lot data
    const lotData = lots.map(lot => {
      const buyPriceD = eurToDisplay(lot.priceEUR || lot.priceUSD || 0, lot.date);
      const currentPriceD = position.curDisp;
      const years = yearsHeld(lot.date, now);
      const lotCostD = lot.qty * buyPriceD;
      const lotValueD = lot.qty * currentPriceD;
      return {
        lot, buyPriceD, currentPriceD, years,
        cagr: calcCagr(lotCostD, lotValueD, years),
        xirr: lotXIRR(lot, currentPriceD),
        gainPct: ((currentPriceD - buyPriceD) / buyPriceD) * 100,
        isUp: currentPriceD >= buyPriceD,
      };
    });

    // Price → X coordinate mapping
    const chartW = cssW - PAD_L - PAD_R;
    const allPrices = lotData.map(d => d.buyPriceD).concat([position.curDisp]);
    const minPrice = Math.min(...allPrices) * 0.88;
    const maxPrice = Math.max(...allPrices) * 1.12;
    const priceToX = p => PAD_L + ((p - minPrice) / (maxPrice - minPrice)) * chartW;

    // Draw vertical grid lines with price labels
    for (let i = 0; i <= 4; i++) {
      const price = minPrice + (i / 4) * (maxPrice - minPrice);
      const x = priceToX(price);
      ctx.strokeStyle = cssVar('--dim');
      ctx.lineWidth = 0.8;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x, PAD_TOP - 14); ctx.lineTo(x, cssH - PAD_BOT + 4); ctx.stroke();
      ctx.fillStyle = cssVar('--dim');
      ctx.font = '9px DM Mono,monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(fmtCompact(price), x, cssH - PAD_BOT + 6);
    }

    // Draw avg cost dashed vertical line
    let totalUnits = 0, totalCostD = 0;
    lotData.forEach(d => { totalUnits += d.lot.qty; totalCostD += d.lot.qty * d.buyPriceD; });
    const avgCostD = totalCostD / totalUnits;
    const avgX = priceToX(avgCostD);

    ctx.strokeStyle = 'rgba(91,156,255,.42)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(avgX, PAD_TOP - 20); ctx.lineTo(avgX, cssH - PAD_BOT); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(91,156,255,.7)'; ctx.font = '500 9px DM Mono,monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('Avg', avgX, PAD_TOP - 20);

    // Draw current price dashed vertical line
    const currentX = priceToX(position.curDisp);
    ctx.strokeStyle = 'rgba(255,152,72,.42)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(currentX, PAD_TOP - 20); ctx.lineTo(currentX, cssH - PAD_BOT); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,152,72,.75)'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('Now', currentX, PAD_TOP - 20);

    // Draw each lot row
    const maxQty = Math.max(...lots.map(l => l.qty));

    lotData.forEach(({ lot, buyPriceD, years, cagr, xirr, gainPct, isUp }, i) => {
      const rowCenterY = PAD_TOP + i * ROW_H + ROW_H / 2;
      const buyX = priceToX(buyPriceD);
      const gc = isUp ? '#00dba8' : '#ff3d5a';

      // Alternating row background
      ctx.fillStyle = i % 2 === 0 ? cssVar('--surf2') : 'transparent';
      ctx.fillRect(0, rowCenterY - ROW_H / 2, cssW, ROW_H);

      // Row labels (left side)
      ctx.fillStyle = cssVar('--muted'); ctx.font = '500 10px DM Mono,monospace';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText('L' + (i + 1), PAD_L - 10, rowCenterY - 10);
      ctx.fillStyle = cssVar('--dim'); ctx.font = '400 9px DM Mono,monospace';
      ctx.fillText(fmtDateShort(lot.date), PAD_L - 10, rowCenterY + 5);

      // Gradient connecting line between buy and current
      const grad = ctx.createLinearGradient(buyX, 0, currentX, 0);
      grad.addColorStop(0, isUp ? 'rgba(0,219,168,.12)' : 'rgba(255,61,90,.12)');
      grad.addColorStop(1, isUp ? 'rgba(0,219,168,.55)' : 'rgba(255,61,90,.55)');
      ctx.strokeStyle = grad; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(buyX, rowCenterY); ctx.lineTo(currentX, rowCenterY); ctx.stroke();

      // Dot radius proportional to lot size
      const sizeRatio = Math.sqrt(lot.qty) / Math.sqrt(maxQty);
      const dotR = Math.min(Math.max(5 + sizeRatio * 7, 5), 12);

      // Buy dot
      ctx.fillStyle = cssVar('--b2'); ctx.beginPath(); ctx.arc(buyX, rowCenterY, dotR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.5; ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(buyX, rowCenterY, dotR, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = cssVar('--muted'); ctx.font = '500 10px DM Mono,monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(fmtCompact(buyPriceD), buyX, rowCenterY - dotR - 4);
      ctx.fillStyle = cssVar('--dim'); ctx.font = '400 9px DM Mono,monospace'; ctx.textBaseline = 'top';
      ctx.fillText(fmtQty(lot.qty), buyX, rowCenterY + dotR + 4);

      // Current price dot with gain/loss halo
      ctx.fillStyle = cssVar('--orange'); ctx.beginPath(); ctx.arc(currentX, rowCenterY, dotR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = isUp ? 'rgba(0,219,168,.65)' : 'rgba(255,61,90,.65)';
      ctx.lineWidth = 2; ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(currentX, rowCenterY, dotR + 3, 0, Math.PI * 2); ctx.stroke();

      // Info box (right of current dot)
      const boxX = currentX + dotR + INFO_GAP + 4;
      const boxY = rowCenterY - INFO_H / 2;

      // Dashed connector line to info box
      ctx.strokeStyle = isUp ? 'rgba(0,219,168,.2)' : 'rgba(255,61,90,.2)';
      ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(currentX + dotR + 3, rowCenterY); ctx.lineTo(boxX, rowCenterY); ctx.stroke();
      ctx.setLineDash([]);

      // Info box background
      ctx.fillStyle = cssVar('--surf');
      roundedRect(ctx, boxX, boxY, INFO_W, INFO_H, 5); ctx.fill();
      ctx.strokeStyle = isUp ? 'rgba(0,219,168,.28)' : 'rgba(255,61,90,.28)'; ctx.lineWidth = 0.8;
      roundedRect(ctx, boxX, boxY, INFO_W, INFO_H, 5); ctx.stroke();

      // Info box text
      ctx.fillStyle = gc; ctx.font = '700 11.5px Cabinet Grotesk,sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText((gainPct >= 0 ? '+' : '') + fmtNum(gainPct, 2) + ' %', boxX + 8, boxY + 7);
      ctx.fillStyle = cssVar('--muted'); ctx.font = '400 9.5px DM Mono,monospace';
      ctx.fillText(xirr !== null ? 'XIRR: ' + fmtXIRR(xirr) : years < 1 ? 'Held < 1yr' : 'CAGR: ' + fmtCAGR(cagr), boxX + 8, boxY + 23);
      ctx.fillStyle = cssVar('--dim'); ctx.font = '400 8.5px DM Mono,monospace';
      ctx.fillText(fmtNum(years, 1) + ' yr · L' + (i + 1) + ' · ' + state.settings.currency, boxX + 8, boxY + 38);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     MODAL (Add Transaction Form)
     ═══════════════════════════════════════════════════════════════════ */

  function openModal(ticker = '') {
    const today = new Date().toISOString().slice(0, 10);
    el('f-date').value = today;
    el('f-ticker').value = ticker || '';
    el('f-qty').value = '';
    el('f-price').value = '';
    el('f-notes').value = '';
    if (el('f-fees'))  el('f-fees').value  = '';
    if (el('f-taxes')) el('f-taxes').value = '';
    if (el('f-company-preview')) el('f-company-preview').textContent = '';
    // Reset identifier mode to ticker
    _idMode = 'ticker';
    ['ticker','isin','wkn'].forEach(m => {
      const t = el('id-' + m);
      if (t) t.classList.toggle('active', m === 'ticker');
    });
    el('f-ticker').placeholder = 'e.g. AAPL';
    // Set decimal separator in placeholders to match selected currency
    const _sep = decimalSep();
    el('f-qty').placeholder   = '0';
    el('f-price').placeholder = '0' + _sep + '00';
    if (el('f-price-cur-lbl')) el('f-price-cur-lbl').textContent = state.settings.currency;
    el('f-total').textContent = '—';
    el('f-total').style.color = 'var(--muted)';
    el('f-hint').textContent = '';
    el('f-ticker-hint').textContent = '';
    el('f-cur-lbl').textContent = state.settings.currency;

    if (ticker) {
      el('f-cls').value = state.tickerMeta[ticker]?.cls || guessClass(ticker);
      setTicker(ticker, false);
    }

    setType('BUY');
    el('modal-ov').classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => el('f-ticker').focus(), 80);
  }

  function closeModal() {
    el('modal-ov').classList.remove('open');
    document.body.style.overflow = '';
  }

  /** Set the transaction type (BUY/SELL) in the modal */
  function setType(type) {
    modalType = type;
    el('type-buy').className = 'type-btn' + (type === 'BUY' ? ' is-buy' : '');
    el('type-sell').className = 'type-btn' + (type === 'SELL' ? ' is-sell' : '');
    if (el('f-fees-grp'))  el('f-fees-grp').style.display  = type === 'BUY'  ? '' : 'none';
    if (el('f-taxes-grp')) el('f-taxes-grp').style.display = type === 'SELL' ? '' : 'none';
    validateForm();
  }

  /** Set the ticker field and auto-fill related fields */
  function setTicker(ticker, focus = true) {
    el('f-ticker').value = ticker;
    el('f-cls').value = state.tickerMeta[ticker]?.cls || guessClass(ticker);
    const cachedPrice = getPrice(ticker);
    el('f-price').value = fmtInputNum(eurToDisplay(cachedPrice), 2);
    // Show cached company name if available
    const preview = el('f-company-preview');
    if (preview) {
      const known = state.tickerMeta[ticker]?.companyName || TICKER_NAMES[ticker] || '';
      preview.textContent = known ? '✓ ' + known : '';
      preview.style.color = known ? 'var(--green)' : '';
    }
    // Reset id mode to ticker
    _idMode = 'ticker';
    ['ticker','isin','wkn'].forEach(m => {
      const t = el('id-' + m);
      if (t) t.classList.toggle('active', m === 'ticker');
    });
    const inp = el('f-ticker');
    if (inp) inp.placeholder = 'e.g. AAPL';
    onTickerInput();
    validateForm();
    if (focus) el('f-ticker').focus();
  }

  /** Handle ticker input changes — show name hint and auto-detect class */
  function onTickerInput() {
    const raw = el('f-ticker').value.trim();
    const ticker = _idMode === 'ticker' ? raw.toUpperCase() : raw;
    const hint = el('f-ticker-hint');
    const preview = el('f-company-preview');

    if (!raw) {
      if (hint) hint.textContent = '';
      if (preview) preview.textContent = '';
      return;
    }

    if (_idMode === 'ticker') {
      const known = state.tickerMeta[ticker]?.companyName || TICKER_NAMES[ticker] || '';
      if (known) {
        if (hint) { hint.textContent = known; hint.className = 'fhint ok'; }
        if (preview) { preview.textContent = ''; }
      } else {
        if (hint) { hint.textContent = raw.length >= 2 ? 'Unknown ticker — press Verify to look up' : ''; hint.className = 'fhint'; }
        if (preview) preview.textContent = '';
      }
      el('f-cls').value = state.tickerMeta[ticker]?.cls || guessClass(ticker);
    } else {
      if (hint) { hint.textContent = raw.length >= 5 ? 'Press Verify to resolve to ticker' : ''; hint.className = 'fhint'; }
      if (preview) preview.textContent = '';
    }
    validateForm();
  }

  /** Switch the identifier input mode (ticker / isin / wkn) */
  function setIdMode(mode) {
    _idMode = mode;
    ['ticker','isin','wkn'].forEach(m => {
      const t = el('id-' + m);
      if (t) t.classList.toggle('active', m === mode);
    });
    const inp = el('f-ticker');
    const hints = { ticker: 'e.g. AAPL', isin: 'e.g. US0378331005', wkn: 'e.g. 865985' };
    inp.placeholder = hints[mode] || '';
    inp.value = '';
    el('f-ticker-hint').textContent = '';
    if (el('f-company-preview')) el('f-company-preview').textContent = '';
    inp.focus();
  }

  /**
   * Verify the entered identifier via OpenFIGI, resolve to ticker + company name,
   * then populate the form fields.
   */
  async function verifyIdentifier() {
    const raw = el('f-ticker').value.trim().toUpperCase();
    const hint = el('f-ticker-hint');
    const preview = el('f-company-preview');
    const btn = el('f-verify');

    if (!raw) { hint.textContent = 'Enter an identifier first'; hint.className = 'fhint warn'; return; }

    // For ticker mode: try Yahoo Finance name lookup first
    if (_idMode === 'ticker') {
      hint.textContent = 'Looking up…'; hint.className = 'fhint';
      if (btn) btn.disabled = true;
      try {
        const known = state.tickerMeta[raw]?.companyName || TICKER_NAMES[raw];
        if (known) {
          hint.textContent = known; hint.className = 'fhint ok';
          if (preview) { preview.textContent = '✓ ' + known; preview.style.color = 'var(--green)'; }
          el('f-cls').value = state.tickerMeta[raw]?.cls || guessClass(raw);
          if (btn) btn.disabled = false;
          return;
        }
        // Try Yahoo Finance quote for unknown tickers
        const yUrl = withCorsProxy(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(raw)}?interval=1d&range=1d`);
        const resp = await fetchWithTimeout(yUrl, 6000, {});
        if (resp.ok) {
          const data = await resp.json();
          const meta = data?.chart?.result?.[0]?.meta;
          if (meta) {
            const name = meta.longName || meta.shortName || raw;
            if (!state.tickerMeta[raw]) state.tickerMeta[raw] = {};
            state.tickerMeta[raw].companyName = name;
            state.tickerMeta[raw].cls = state.tickerMeta[raw].cls || guessClass(raw);
            hint.textContent = name; hint.className = 'fhint ok';
            if (preview) { preview.textContent = '✓ ' + name; preview.style.color = 'var(--green)'; }
            el('f-cls').value = state.tickerMeta[raw].cls;
            saveState();
          } else {
            hint.textContent = 'Not found on Yahoo Finance'; hint.className = 'fhint warn';
          }
        } else {
          hint.textContent = 'Lookup failed — ticker will be tracked as-is'; hint.className = 'fhint';
        }
      } catch(e) {
        hint.textContent = 'Lookup failed — ticker will be tracked as-is'; hint.className = 'fhint';
      }
      if (btn) btn.disabled = false;
      return;
    }

    // For ISIN / WKN: use OpenFIGI
    hint.textContent = 'Resolving via OpenFIGI…'; hint.className = 'fhint';
    if (preview) preview.textContent = '';
    if (btn) btn.disabled = true;

    const idType = _idMode === 'isin' ? 'ID_ISIN' : 'ID_WERTPAPIER';
    try {
      const resp = await fetchWithTimeout('https://api.openfigi.com/v3/mapping', 10000, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ idType, idValue: raw }]),
      });

      if (!resp.ok) throw new Error('OpenFIGI HTTP ' + resp.status);
      const data = await resp.json();
      const result = data[0];

      if (result?.data?.length > 0) {
        const us = result.data.find(d => d.exchCode === 'US' || d.exchCode === 'UW' || d.exchCode === 'UN');
        const best = us || result.data[0];
        const ticker = (best.ticker || '').replace('/', '-').toUpperCase();
        const name = best.name || best.securityDescription || ticker;

        if (!ticker) throw new Error('No ticker in response');

        // Infer class
        const st = (best.securityType || '').toLowerCase();
        let cls = 'Stock';
        if (st.includes('etf') || st.includes('fund')) cls = 'ETF';
        else if (st.includes('crypto') || best.exchCode === 'CRYP') cls = 'Crypto';
        else if (st.includes('bond') || st.includes('govt')) cls = 'Bond';

        // Store resolved data
        if (!state.tickerMeta[ticker]) state.tickerMeta[ticker] = {};
        state.tickerMeta[ticker].companyName = name;
        state.tickerMeta[ticker].cls = cls;
        saveState();

        // Populate the form
        _idMode = 'ticker';
        ['ticker','isin','wkn'].forEach(m => {
          const t = el('id-' + m);
          if (t) t.classList.toggle('active', m === 'ticker');
        });
        el('f-ticker').value = ticker;
        el('f-ticker').placeholder = 'e.g. AAPL';
        el('f-cls').value = cls;
        el('f-price').value = fmtInputNum(eurToDisplay(getPrice(ticker)), 2);
        hint.textContent = name; hint.className = 'fhint ok';
        if (preview) { preview.textContent = '✓ ' + name + ' (' + ticker + ')'; preview.style.color = 'var(--green)'; }
      } else {
        hint.textContent = 'Not found via OpenFIGI — try entering ticker manually'; hint.className = 'fhint warn';
      }
    } catch(e) {
      console.error('[verifyIdentifier]', e);
      hint.textContent = 'Lookup failed: ' + e.message; hint.className = 'fhint warn';
    }
    if (btn) btn.disabled = false;
    validateForm();
  }

  /** Validate the form and update the estimated total display */
  function validateForm() {
    const ticker = el('f-ticker').value.toUpperCase().trim();
    const qty   = parseLocaleFloat(el('f-qty').value);
    const price = parseLocaleFloat(el('f-price').value);
    const hint  = el('f-hint');
    const sep   = decimalSep();

    // Keep placeholders in sync with active currency convention
    el('f-qty').placeholder   = '0';
    el('f-price').placeholder = '0' + sep + '00';

    hint.textContent = '';
    hint.className = 'fhint';
    el('f-cur-lbl').textContent = state.settings.currency;

    // Show estimated total if both qty and price are valid
    if (qty > 0 && price > 0) {
      el('f-total').textContent = fmtValue(qty * eurToDisplay(price));
      el('f-total').style.color = 'var(--text)';
    } else {
      el('f-total').textContent = '—';
      el('f-total').style.color = 'var(--muted)';
    }

    // Warn if selling more than held — only compute positions when needed
    if (modalType === 'SELL' && ticker && qty > 0) {
      const pos = computePositions()[ticker];
      if (!pos) {
        hint.textContent = '⚠ No position for ' + ticker;
        hint.className = 'fhint warn';
      } else if (qty > pos.shares) {
        hint.textContent = `⚠ Only ${fmtQty(pos.shares)} shares held`;
        hint.className = 'fhint warn';
      }
    }
  }

  /** Submit the transaction form */
  function submitTransaction() {
    const ticker = el('f-ticker').value.toUpperCase().trim();
    const qty   = parseLocaleFloat(el('f-qty').value);
    const price = parseLocaleFloat(el('f-price').value);
    const date = el('f-date').value;
    const notes = el('f-notes').value.trim();
    const cls  = el('f-cls').value;
    const fees  = parseLocaleFloat(el('f-fees')?.value  || '0') || 0;
    const taxes = parseLocaleFloat(el('f-taxes')?.value || '0') || 0;
    const hint  = el('f-hint');

    // Validation
    if (!ticker)          { hint.textContent = 'Ticker required';      hint.className = 'fhint err'; return; }
    if (!qty || qty <= 0) { hint.textContent = 'Quantity must be > 0'; hint.className = 'fhint err'; return; }
    if (!price || price <= 0) { hint.textContent = 'Price must be > 0'; hint.className = 'fhint err'; return; }
    if (!date)            { hint.textContent = 'Date required';        hint.className = 'fhint err'; return; }

    addTransaction({ ticker, type: modalType, qty, price, date, notes, cls, fees, taxes });
    // Persist any company name resolved during this modal session
    const resolvedName = state.tickerMeta[ticker]?.companyName;
    if (!resolvedName) {
      const known = TICKER_NAMES[ticker];
      if (known) {
        if (!state.tickerMeta[ticker]) state.tickerMeta[ticker] = {};
        state.tickerMeta[ticker].companyName = known;
        saveState();
      }
    }
    closeModal();
  }

  /* ═══════════════════════════════════════════════════════════════════
     SETTINGS PANEL
     ═══════════════════════════════════════════════════════════════════ */

  /** Open the settings side panel, syncing all inputs from current state */
  function openSettings() {
    // Sync all form inputs from current state (avoids duplicating field assignments)
    syncSettingsUI();
    updateStorageStatus();
    el('sp-ov').classList.add('open');
    el('sp').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  /** Close the settings side panel */
  function closeSettings() {
    el('sp-ov').classList.remove('open');
    el('sp').classList.remove('open');
    document.body.style.overflow = '';
  }

  /** Read settings form inputs and persist them to state */
  function saveSettings() {
    state.settings.apiKey    = (el('cfg-apikey').value    || '').trim();
    state.settings.cacheTTL  = parseInt(el('cfg-cache').value);
    state.settings.gistToken = (el('cfg-gist-token').value || '').trim();
    state.settings.gistId    = (el('cfg-gist-id').value    || '').trim();
    saveState();
    render();
    updateSourceBadge();
    toast('Settings saved', 'success');
  }

  /* ═══════════════════════════════════════════════════════════════════
     UI INTERACTION HANDLERS
     Tab switching, filter toggles, header status.
     ═══════════════════════════════════════════════════════════════════ */

  /** Switch between Overview / Positions / History tabs */
  /**
   * Switch between Overview, Positions, and History tabs.
   * @param {string} name - 'overview' | 'positions' | 'history'
   * @param {HTMLElement} buttonEl - The tab button that was clicked
   */
  function showTab(name, buttonEl) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    const tabIds = { overview: 'tab-overview', positions: 'tab-positions', history: 'tab-history' };
    const pane = el(tabIds[name]);
    if (pane) pane.classList.add('active');
    if (buttonEl) buttonEl.classList.add('active');
  }

  /** Set the history tab's BUY/SELL/ALL filter */
  function setHistFilter(filter) {
    histFilter = filter;
    ['all', 'buy', 'sell'].forEach(f => el('f-' + f).classList.toggle('active', f === filter));
    renderHistory();
  }

  /** Set the positions tab's asset class filter */
  function setClsFilter(filter) {
    clsFilter = filter;
    ['all', 'Stock', 'ETF', 'Crypto', 'Bond', 'MF'].forEach(f => {
      const btn = el('clf-' + f);
      if (btn) btn.classList.toggle('active', f === filter);
    });
    renderPositions(computePositions());
  }

  /** Handle display currency change */
  /** Handle the display currency selector change in the header */
  function onCurrencyChange() {
    state.settings.currency = el('h-currency').value;
    saveState();
    render();
    if (activeDrawer) openDrawer(activeDrawer);
  }

  /**
   * Update the header status indicator.
   * @param {'live'|'load'|'err'} status
   * @param {string} text
   */
  function setHeaderStatus(status, text) {
    const dot = el('h-dot');
    dot.className = 'status-dot' + (status === 'err' ? ' err' : status === 'load' ? ' load' : '');
    el('h-status').textContent = text;
  }

  /* ═══════════════════════════════════════════════════════════════════
     CONFIRM DIALOG
     Reusable confirmation popup for destructive actions.
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * Show the confirm dialog for a destructive action.
   * @param {string} title
   * @param {string} message
   * @param {string} icon - Emoji displayed above the title
   * @param {string} buttonLabel - Text for the confirm button
   * @param {Function} callback - Called if user confirms
   */
  function confirmAction(title, message, icon, buttonLabel, callback) {
    el('ci').textContent = icon || '⚠️';
    el('ct').textContent = title;
    el('cm').textContent = message;
    el('cok').textContent = buttonLabel || 'Delete';
    confirmCallback = callback;
    el('confirm-ov').classList.add('open');
  }

  function confirmOk() {
    closeConfirm();
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
  }

  function closeConfirm() { el('confirm-ov').classList.remove('open'); }

  function confirmDelTx(id, ticker, qty) {
    confirmAction('Delete transaction?', `Remove ${qty} ${ticker} — cannot be undone.`, '🗑', 'Delete', () => deleteTransaction(id));
  }

  function confirmDeletePos(ticker) {
    const count = state.transactions.filter(t => t.ticker === ticker).length;
    confirmAction(`Delete ${ticker}?`, `Remove all ${count} transaction(s) — cannot be undone.`, '⚠️', 'Delete All', () => deletePosition(ticker));
  }

  /* ═══════════════════════════════════════════════════════════════════
     CSV IMPORT WIZARD
     Step 1 — Upload & Parse depot CSV
     Step 2 — Resolve ISINs to tickers (OpenFIGI, no key required)
     Step 3 — Preview EUR→USD conversion + duplicate detection + import
     ═══════════════════════════════════════════════════════════════════ */

  /** Mutable wizard state — reset on every openCsvImport() */
  let csvState = {
    step: 1,
    rawRows: [],        // parsed CSV rows (original fields)
    isinMap: {},        // { [isin]: { ticker, cls, status: 'idle'|'loading'|'ok'|'err'|'manual' } }
    previewRows: [],    // enriched + converted rows ready to import
    dupCount: 0,
    _resolving: false,  // true while OpenFIGI request is in-flight
  };

  /** Open the CSV import wizard and reset all wizard state */
  function openCsvImport() {
    csvState = { step: 1, rawRows: [], isinMap: {}, previewRows: [], dupCount: 0, _resolving: false };
    el('csv-ov').classList.add('open');
    renderCsvStep();
  }

  /** Close the CSV import wizard */
  function closeCsvImport() {
    el('csv-ov').classList.remove('open');
  }

  /** Update the step indicator bar */
  function updateCsvStepIndicator(step) {
    [1, 2, 3].forEach(i => {
      const s = el('cstep-' + i);
      s.classList.remove('active', 'done');
      if (i < step) s.classList.add('done');
      else if (i === step) s.classList.add('active');
      const num = s.querySelector('.csv-step-num');
      if (i < step) num.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
      else num.textContent = i;
    });
    [1, 2].forEach(i => {
      const line = el('cline-' + i);
      if (i < step) line.classList.add('done');
      else line.classList.remove('done');
    });
  }

  /** Main render dispatcher — renders the body and footer for the current step */
  function renderCsvStep() {
    updateCsvStepIndicator(csvState.step);
    if (csvState.step === 1) renderCsvStep1();
    else if (csvState.step === 2) renderCsvStep2();
    else renderCsvStep3();
  }

  /* ── Step 1: Upload & Parse ──────────────────────────────────────── */
  function renderCsvStep1() {
    const body = el('csv-body');

    const hasRows = csvState.rawRows.length > 0;

    body.innerHTML = `
      <div id="csv-drop-area" class="csv-drop" onclick="el('csv-file-inp').click()"
           ondragover="event.preventDefault();this.classList.add('drag-over')"
           ondragleave="this.classList.remove('drag-over')"
           ondrop="App.csvDropHandler(event)">
        <input type="file" id="csv-file-inp" accept=".csv,text/csv" style="display:none"
               onchange="App.csvFileSelected(event)">
        <div class="csv-drop-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <polyline points="12 18 12 12"/>
            <polyline points="9 15 12 12 15 15"/>
          </svg>
        </div>
        <div>${hasRows ? '✓ File loaded — drop another to replace' : 'Drop your depot <strong style="color:var(--blue)">.csv</strong> here or click to browse'}</div>
        ${hasRows ? `<button class="abtn outline" style="margin-top:12px" onclick="event.stopPropagation();el('csv-file-inp').click()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Choose Different File
        </button>` : `<button class="abtn blue" style="margin-top:12px" onclick="event.stopPropagation();el('csv-file-inp').click()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px">
            <path d="M3 3h18v18H3z"/>
            <polyline points="9 9 9 15"/>
            <polyline points="12 9 12 15"/>
            <polyline points="15 9 15 15"/>
          </svg>
          Browse Files
        </button>`}
        ${!hasRows ? `<div class="csv-drop-sub" style="margin-top:12px;padding:8px 12px;background:rgba(91,156,255,0.08);border:0.5px solid rgba(91,156,255,0.2);border-radius:6px;color:var(--text2);font-size:11px;line-height:1.5"><strong style="color:var(--blue)">Required columns:</strong> date, isin, shares, price, type, currency<br><strong style="color:var(--blue)">Format:</strong> Date (DD/MM/YYYY), Type (buy/sell), Price & Shares (numbers)</div>` : ''}
      </div>
      ${hasRows ? `
      <div class="csv-summary-card">
        <div class="csv-sum-item">
          <div class="csv-sum-lbl">Transactions</div>
          <div class="csv-sum-val csv-sum-ok">${csvState.rawRows.length}</div>
        </div>
        <div class="csv-sum-item">
          <div class="csv-sum-lbl">Unique ISINs</div>
          <div class="csv-sum-val">${Object.keys(csvState.isinMap).length}</div>
        </div>
        <div class="csv-sum-item">
          <div class="csv-sum-lbl">Date Range</div>
          <div class="csv-sum-val" style="font-size:12px">${csvState.rawRows.at(-1).dateISO} → ${csvState.rawRows[0].dateISO}</div>
        </div>
        <div class="csv-sum-item">
          <div class="csv-sum-lbl">Currencies</div>
          <div class="csv-sum-val" style="font-size:12px">${[...new Set(csvState.rawRows.map(r => r.currency))].join(', ')}</div>
        </div>
        <div class="csv-sum-item">
          <div class="csv-sum-lbl">Buy / Sell</div>
          <div class="csv-sum-val" style="font-size:12px">
            <span style="color:var(--green)">${csvState.rawRows.filter(r=>r.type==='BUY').length}B</span>
            / <span style="color:var(--red)">${csvState.rawRows.filter(r=>r.type==='SELL').length}S</span>
          </div>
        </div>
      </div>` : ''}
    `;

    const foot = el('csv-foot');
    foot.innerHTML = `
      <button class="cancel-btn" onclick="App.closeCsvImport()">Cancel</button>
      <button class="csv-nav-btn next" onclick="App.csvGoStep(2)" ${hasRows ? '' : 'disabled'}>
        Next — Resolve ISINs
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    `;
  }

  /** Handle file drop on the drop zone */
  function csvDropHandler(event) {
    event.preventDefault();
    const dropArea = el('csv-drop-area');
    if (dropArea) dropArea.classList.remove('drag-over');
    const file = event.dataTransfer.files[0];
    if (file) readCsvFile(file);
  }

  /** Handle file selected from the file input */
  function csvFileSelected(event) {
    const file = event.target.files[0];
    if (file) readCsvFile(file);
    event.target.value = '';
  }

  /** Read and parse a CSV file */
  function readCsvFile(file) {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      toast('Please select a .csv file', 'error'); return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const result = parseCsvText(e.target.result);
      if (result.error) { toast('Parse error: ' + result.error, 'error'); return; }
      csvState.rawRows = result.rows;
      csvState.isinMap = result.isinMap;
      renderCsvStep();
    };
    reader.readAsText(file);
  }

  /**
   * Parse depot CSV text.
   * Supports semicolon (;) and comma (,) delimiters.
   * Handles European number format: 1.234,56 → 1234.56
   * Columns: date, isin, shares, price, type, currency, [fee], [tax], [company name]
   * Returns { rows, isinMap } or { error }
   */
  function parseCsvText(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
    if (lines.length < 2) return { error: 'File is empty or has only a header row' };

    // Auto-detect delimiter: count semicolons vs commas in header
    const hdrRaw = lines[0];
    const delimiter = (hdrRaw.split(';').length > hdrRaw.split(',').length) ? ';' : ',';

    // Parse header (case-insensitive, trim, strip quotes)
    const headers = hdrRaw.split(delimiter).map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const col = name => headers.indexOf(name);

    // Required column check
    const required = ['date', 'isin', 'shares', 'price', 'type'];
    for (const r of required) {
      if (col(r) === -1) return { error: `Missing required column: "${r}". Found: ${headers.join(', ')}` };
    }

    /**
     * Parse number strings from CSV - auto-detects European vs US/Indian format.
     * European: "1.234,56" or "0,09135035" → comma is decimal
     * US/Indian: "1,234.56" or "0.09135035" → period is decimal
     * Handles crypto with high precision decimals.
     */
    function parseEuNum(str) {
      if (!str) return NaN;
      let s = str.replace(/"/g, '').trim();
      // Remove leading minus for detection, restore later
      const neg = s.startsWith('-');
      if (neg) s = s.slice(1);
      
      const hasComma  = s.includes(',');
      const hasPeriod = s.includes('.');
      
      // Both separators: determine which is decimal based on position
      if (hasPeriod && hasComma) {
        const lastComma  = s.lastIndexOf(',');
        const lastPeriod = s.lastIndexOf('.');
        if (lastComma > lastPeriod) {
          // European: 1.234,56 → comma is decimal
          s = s.replace(/\./g, '').replace(',', '.');
        } else {
          // US/Indian: 1,234.56 → period is decimal
          s = s.replace(/,/g, '');
        }
      } 
      // Only comma: European format (crypto, prices, amounts)
      else if (hasComma && !hasPeriod) {
        const parts = s.split(',');
        // Decimal detection rules:
        // 1. Starts with 0, → decimal (crypto: 0,09135035)
        // 2. ≤ 4 digits before comma → decimal (prices: 1989,03280756304)
        // 3. ≤ 2 digits after comma → decimal (traditional: 19614,8)
        if (parts.length === 2 && (s.startsWith('0,') || parts[0].length <= 4 || parts[1].length <= 2)) {
          s = s.replace(',', '.');
        } else {
          s = s.replace(/,/g, ''); // Thousands separator
        }
      } 
      // Only period: could be US/Indian decimal or European thousands
      else if (hasPeriod && !hasComma) {
        const parts = s.split('.');
        // If starts with 0. or has ≤ 4 digits before period → likely decimal
        if (s.startsWith('0.') || (parts.length === 2 && parts[0].length <= 4)) {
          // Keep as-is (decimal period)
        } else if (parts.length === 2 && parts[1].length === 3) {
          s = s.replace(/\./g, ''); // European thousands: 1.234
        }
        // else leave as-is (standard decimal)
      }
      
      const val = parseFloat(s);
      return neg ? -val : val;
    }

    const rows = [];
    const isinMap = {};

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Split by delimiter, respecting quoted fields
      const vals = [];
      let cur = '', inQ = false;
      for (let ci = 0; ci < line.length; ci++) {
        const ch = line[ci];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === delimiter && !inQ) { vals.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      vals.push(cur.trim());

      const get = name => {
        const idx = col(name);
        return idx >= 0 && vals[idx] !== undefined
          ? vals[idx].replace(/^"|"$/g, '').trim()
          : '';
      };

      // Parse date DD/MM/YYYY → YYYY-MM-DD
      const rawDate = get('date');
      const dateParts = rawDate.split('/');
      if (dateParts.length !== 3) continue;
      const dateISO = `${dateParts[2]}-${dateParts[1].padStart(2,'0')}-${dateParts[0].padStart(2,'0')}`;

      // Normalise type
      const rawType = get('type').toLowerCase().trim();
      const type = rawType === 'buy' ? 'BUY' : rawType === 'sell' ? 'SELL' : null;
      if (!type) continue;

      const isin = get('isin').trim().toUpperCase();
      if (!isin) continue;

      const shares = Math.abs(parseEuNum(get('shares')));
      const price  = Math.abs(parseEuNum(get('price')));
      if (isNaN(shares) || isNaN(price) || shares <= 0 || price <= 0) continue;

      const currency    = (get('currency') || 'EUR').toUpperCase();
      const description = get('company name') || get('description') || get('name') || '';
      const assetType   = get('assettype') || get('asset_type') || get('assetType') || 'Security';

      // Parse optional fee and tax columns
      const feeRaw  = get('fee')  || get('fees')  || '0';
      const taxRaw  = get('tax')  || get('taxes') || '0';
      const fee  = Math.abs(parseEuNum(feeRaw)  || 0);
      const tax  = Math.abs(parseEuNum(taxRaw)  || 0);

      rows.push({ dateISO, type, isin, shares, price, currency, description, assetType, fee, tax, _line: i });

      // Build ISIN map (first occurrence wins)
      if (!isinMap[isin]) {
        const atl = assetType.toLowerCase();
        let cls = 'Stock';
        if (atl.includes('etf') || atl.includes('fund')) cls = 'ETF';
        else if (atl.includes('crypto') || atl.includes('coin')) cls = 'Crypto';
        else if (atl.includes('bond') || atl.includes('fixed')) cls = 'Bond';
        // Store company name hint from CSV (first Buy row usually most accurate)
        isinMap[isin] = { ticker: '', cls, status: 'idle', csvName: description };
      }
    }

    if (!rows.length) return { error: 'No valid transaction rows found. Check delimiter (;/,), date format (DD/MM/YYYY), and required columns: date, isin, shares, price, type.' };

    // Sort newest first
    rows.sort((a, b) => b.dateISO.localeCompare(a.dateISO));

    return { rows, isinMap };
  }

  /* ── Step 2: Resolve ISINs ───────────────────────────────────────── */
  function renderCsvStep2() {
    const body = el('csv-body');
    const isins = Object.keys(csvState.isinMap);
    const allResolved = isins.every(i => ['ok','manual'].includes(csvState.isinMap[i].status));

    body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:13px;flex-wrap:wrap">
        <div style="font-size:12px;color:var(--muted)">
          Map each ISIN to a ticker symbol. Auto-resolve uses the free OpenFIGI API.
        </div>
        <button class="resolve-btn" id="resolve-all-btn" onclick="App.csvAutoResolve()" ${csvState._resolving ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          ${csvState._resolving ? 'Resolving…' : 'Auto-Resolve via OpenFIGI'}
        </button>
      </div>
      <div class="isin-list" id="isin-list">
        ${isins.map(isin => renderISINRow(isin)).join('')}
      </div>
      <div style="font-size:10px;color:var(--dim);margin-top:9px">
        OpenFIGI is a free Bloomberg API — no API key needed. If auto-resolve fails, type the ticker manually.
      </div>
    `;

    const foot = el('csv-foot');
    foot.innerHTML = `
      <button class="csv-nav-btn back" onclick="App.csvGoStep(1)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>
      <div style="flex:1"></div>
      <button class="csv-nav-btn next" id="csv-next-2" onclick="App.csvGoStep(3)" ${allResolved ? '' : 'disabled'}>
        Preview Import
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    `;
  }

  /** Build a single ISIN row's HTML */
  function renderISINRow(isin) {
    const m = csvState.isinMap[isin];
    const rowCls = m.status === 'ok' || m.status === 'manual' ? 'resolved' : m.status === 'err' ? 'error' : '';
    const statusHtml = {
      idle:    `<div class="isin-status man">⬡ Pending</div>`,
      loading: `<div class="isin-status load">⟳ Resolving…</div>`,
      ok:      `<div class="isin-status ok">✓ Auto-resolved</div>`,
      err:     `<div class="isin-status err">✕ Not found — enter manually</div>`,
      manual:  `<div class="isin-status man">✎ Manual</div>`,
    }[m.status] || '';

    const txCount = csvState.rawRows.filter(r => r.isin === isin).length;
    const csvName = m.csvName ? `<span style="color:var(--text2);font-size:10px">${m.csvName}</span>` : '';

    return `
      <div class="isin-row ${rowCls}" id="isin-row-${isin}">
        <div class="isin-code">
          <strong>${isin}</strong>
          ${csvName}
          <span style="color:var(--dim)">${txCount} transaction${txCount !== 1 ? 's' : ''}</span>
          ${statusHtml}
        </div>
        <input class="finp" type="text" placeholder="Ticker (e.g. MSTR)"
               style="text-transform:uppercase;font-size:12px"
               value="${m.ticker}"
               oninput="App.csvTickerInput('${isin}', this.value)"
               id="isin-ticker-${isin}">
        <select class="fsel" style="font-size:11px" onchange="App.csvClsChange('${isin}', this.value)">
          ${['Stock','ETF','Crypto','Bond','MF'].map(c =>
            `<option value="${c}" ${m.cls === c ? 'selected' : ''}>${c}</option>`
          ).join('')}
        </select>
        <button class="isin-clear-btn" onclick="App.csvClearISIN('${isin}')" title="Clear / reset">✕</button>
      </div>
    `;
  }

  /** User typed a ticker manually */
  function csvTickerInput(isin, value) {
    const v = value.toUpperCase().trim();
    csvState.isinMap[isin].ticker = v;
    csvState.isinMap[isin].status = v ? 'manual' : 'idle';
    // refresh row class
    const row = el('isin-row-' + isin);
    if (row) {
      row.classList.toggle('resolved', !!v);
      row.classList.remove('error');
    }
    // enable/disable next button
    const allResolved = Object.values(csvState.isinMap).every(m => ['ok','manual'].includes(m.status));
    const nextBtn = el('csv-next-2');
    if (nextBtn) nextBtn.disabled = !allResolved;
  }

  /** User changed asset class */
  function csvClsChange(isin, cls) {
    csvState.isinMap[isin].cls = cls;
  }

  /** Clear an ISIN's ticker back to idle */
  function csvClearISIN(isin) {
    csvState.isinMap[isin].ticker = '';
    csvState.isinMap[isin].status = 'idle';
    renderCsvStep2();
  }

  /** Call OpenFIGI to auto-resolve all ISINs in one batched request */
  async function csvAutoResolve() {
    const isins = Object.keys(csvState.isinMap);
    if (!isins.length) return;

    csvState._resolving = true;

    // Mark all as loading
    isins.forEach(isin => { csvState.isinMap[isin].status = 'loading'; });
    renderCsvStep2();

    try {
      const body = isins.map(isin => ({ idType: 'ID_ISIN', idValue: isin }));
      const resp = await fetch('https://api.openfigi.com/v3/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) throw new Error('OpenFIGI HTTP ' + resp.status);
      const data = await resp.json();

      data.forEach((result, idx) => {
        const isin = isins[idx];
        if (result.data && result.data.length > 0) {
          // Prefer US exchange listings, fall back to first result
          const us = result.data.find(d => d.exchCode === 'US' || d.exchCode === 'UW' || d.exchCode === 'UN');
          const best = us || result.data[0];
          const ticker = (best.ticker || '').replace('/', '-');
          if (ticker) {
            csvState.isinMap[isin].ticker = ticker;
            csvState.isinMap[isin].status = 'ok';
            csvState.isinMap[isin].resolvedName = best.name || best.securityDescription || csvState.isinMap[isin].csvName || '';
            // Infer class from securityType
            const st = (best.securityType || '').toLowerCase();
            if (st.includes('etf') || st.includes('fund')) csvState.isinMap[isin].cls = 'ETF';
            else if (st.includes('crypto') || best.exchCode === 'CRYP') csvState.isinMap[isin].cls = 'Crypto';
            else if (st.includes('bond') || st.includes('govt') || st.includes('corp')) csvState.isinMap[isin].cls = 'Bond';
            else csvState.isinMap[isin].cls = 'Stock';
          } else {
            csvState.isinMap[isin].status = 'err';
          }
        } else {
          csvState.isinMap[isin].status = 'err';
        }
      });
    } catch (err) {
      console.error('[OpenFIGI]', err);
      isins.forEach(isin => {
        if (csvState.isinMap[isin].status === 'loading') csvState.isinMap[isin].status = 'err';
      });
      toast('OpenFIGI lookup failed — please enter tickers manually', 'warn');
    }

    csvState._resolving = false;
    renderCsvStep2();
  }

  /* ── Step 3: Preview & Import ────────────────────────────────────── */

  /** Build preview rows: EUR price stored directly, fee/tax included, duplicate detection */
  function buildPreviewRows() {
    const existing = state.transactions;
    const rows = [];
    let dupCount = 0;

    csvState.rawRows.forEach(raw => {
      const map = csvState.isinMap[raw.isin];
      if (!map || !map.ticker) return;

      const ticker = map.ticker;
      const cls    = map.cls;

      // Prices are stored internally in EUR. Convert only if not already EUR.
      let priceEUR = raw.price;
      if (raw.currency !== 'EUR') {
        // Non-EUR: convert to EUR via latest FX (we store EUR internally)
        const rate = fxLatest[raw.currency];
        priceEUR = rate ? raw.price / rate : raw.price;
      }
      priceEUR = Math.round(priceEUR * 10000) / 10000;

      // fee and tax are already in EUR per CSV
      const fee = raw.fee || 0;
      const tax = raw.tax || 0;

      // Duplicate detection: same date + ticker + type + qty
      const isDuplicate = existing.some(t =>
        t.date === raw.dateISO &&
        t.ticker === ticker &&
        t.type === raw.type &&
        Math.abs(t.qty - raw.shares) < 0.0001
      );

      if (isDuplicate) dupCount++;

      rows.push({
        ...raw,
        ticker,
        cls,
        priceEUR,
        fee,
        tax,
        companyName: map.resolvedName || map.csvName || '',
        notes: raw.description || '',
        isDuplicate,
      });
    });

    csvState.previewRows = rows;
    csvState.dupCount = dupCount;
  }

  function renderCsvStep3() {
    buildPreviewRows();
    const body = el('csv-body');
    const importable = csvState.previewRows.filter(r => !r.isDuplicate);

    body.innerHTML = `
      <div class="prev-summary">
        <strong>${importable.length}</strong> transactions ready to import
        ${csvState.dupCount > 0 ? `· <span class="warn">${csvState.dupCount} duplicate${csvState.dupCount>1?'s':''} will be skipped</span>` : ''}
        · prices stored in <strong>EUR</strong> (original currency preserved)
      </div>
      <div class="prev-wrap">
        <table class="prev-tbl">
          <thead>
            <tr>
              <th>Date</th>
              <th>Ticker</th>
              <th>Company</th>
              <th>Type</th>
              <th>Qty</th>
              <th>Price EUR</th>
              <th>Fee</th>
              <th>Tax</th>
              <th>Class</th>
            </tr>
          </thead>
          <tbody>
            ${csvState.previewRows.map(r => `
              <tr class="${r.isDuplicate ? 'dup-row' : ''}">
                <td>${r.dateISO}</td>
                <td style="color:var(--text);font-weight:700">${r.ticker}</td>
                <td style="color:var(--text2);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.companyName || '—'}</td>
                <td>
                  <span class="type-badge ${r.type==='BUY'?'buy':'sell'}">${r.type}</span>
                  ${r.isDuplicate ? '<span class="dup-badge" style="margin-left:4px">DUP</span>' : ''}
                </td>
                <td>${r.shares}</td>
                <td style="color:var(--text)">${new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',minimumFractionDigits:2}).format(r.priceEUR)}</td>
                <td style="color:var(--muted)">${r.fee > 0 ? new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',minimumFractionDigits:2}).format(r.fee) : '—'}</td>
                <td style="color:var(--muted)">${r.tax > 0 ? new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',minimumFractionDigits:2}).format(r.tax) : '—'}</td>
                <td>
                  <span class="cls-badge cb-${r.cls.toLowerCase()}" style="font-size:9px;padding:1px 5px;border-radius:3px">${r.cls}</span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    const foot = el('csv-foot');
    foot.innerHTML = `
      <button class="csv-nav-btn back" onclick="App.csvGoStep(2)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>
      <div style="flex:1"></div>
      <button class="csv-nav-btn import" onclick="App.csvExecuteImport()" ${importable.length > 0 ? '' : 'disabled'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Import ${importable.length} Transaction${importable.length !== 1 ? 's' : ''}
      </button>
    `;
  }

  /** Navigate to a wizard step (with validation) */
  function csvGoStep(n) {
    if (n === 2 && !csvState.rawRows.length) return;
    if (n === 3) {
      const unresolved = Object.values(csvState.isinMap).filter(m => !['ok','manual'].includes(m.status));
      if (unresolved.length) { toast('Please resolve all ISINs before proceeding', 'warn'); return; }
    }
    csvState.step = n;
    renderCsvStep();
  }

  /** Final import: add importable rows to state */
  function csvExecuteImport() {
    const importable = csvState.previewRows.filter(r => !r.isDuplicate);
    if (!importable.length) return;

    importable.forEach(r => {
      // Update tickerMeta with class + company name
      if (!state.tickerMeta[r.ticker]) state.tickerMeta[r.ticker] = {};
      state.tickerMeta[r.ticker].cls = r.cls;
      if (r.companyName) state.tickerMeta[r.ticker].companyName = r.companyName;

      state.transactions.push({
        id:     generateId(),
        date:   r.dateISO,
        ticker: r.ticker,
        type:   r.type,
        qty:    r.shares,
        price:  r.priceEUR,   // stored in EUR (base currency)
        fees:   r.fee  || 0,
        taxes:  r.tax  || 0,
        notes:  r.notes || '',
      });
    });

    saveState();
    render();
    closeCsvImport();

    const msg = csvState.dupCount > 0
      ? `Imported ${importable.length} transactions (${csvState.dupCount} duplicates skipped)`
      : `Imported ${importable.length} transactions`;
    toast(msg, 'success');
  }

  /* ═══════════════════════════════════════════════════════════════════
     DATA EXPORT / IMPORT
     ═══════════════════════════════════════════════════════════════════ */

  /** Serialise current state to a timestamped JSON file and trigger a browser download */
  function exportData() {
    const blob = new Blob(
      [JSON.stringify({ ...state, settings: { ...state.settings, gistToken: '' }, _exported: new Date().toISOString() }, null, 2)],
      { type: 'application/json' }
    );
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'portfolio-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click();
    URL.revokeObjectURL(link.href);
    toast('Portfolio exported', 'success');
  }

  /**
   * Export single position's transactions as CSV.
   * Called from position detail drawer.
   */
  function exportPositionCSV() {
    if (!activeDrawer) return;
    
    const positions = computePositions();
    const pos = positions[activeDrawer];
    if (!pos) return;
    
    const ticker = pos.ticker;
    const txs = pos.txs;
    
    if (txs.length === 0) {
      toast('No transactions to export for ' + ticker, 'warn');
      return;
    }
    
    // CSV header
    const header = 'Date,Ticker,Company Name,Type,Quantity,Price EUR,Price ' + state.settings.currency + 
                   ',Fees,Taxes,Notes,Asset Class';
    
    // CSV rows
    const rows = txs.map(tx => {
      const priceDisp = eurToDisplay(+tx.price, tx.date);
      const companyName = pos.companyName || TICKER_NAMES[ticker] || '';
      const cls = pos.cls;
      
      // Escape fields that might contain commas or quotes
      const escapeCsv = val => {
        const str = String(val || '');
        return str.includes(',') || str.includes('"') || str.includes('\n') 
          ? '"' + str.replace(/"/g, '""') + '"' 
          : str;
      };
      
      return [
        tx.date,
        ticker,
        escapeCsv(companyName),
        tx.type,
        +tx.qty,  // Preserve full precision for crypto (no .toFixed truncation)
        (+tx.price).toFixed(4),
        priceDisp.toFixed(4),
        (+(tx.fees || 0)).toFixed(2),
        (+(tx.taxes || 0)).toFixed(2),
        escapeCsv(tx.notes || ''),
        cls
      ].join(',');
    });
    
    const csv = [header].concat(rows).join('\n');
    
    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${ticker}_transactions_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast(`Exported ${txs.length} transaction${txs.length !== 1 ? 's' : ''} for ${ticker}`, 'success');
  }

  /**
   * Export all portfolio transactions as CSV.
   * Called from Portfolio tab.
   */
  function exportPortfolioCSV() {
    const txs = state.transactions;
    
    if (txs.length === 0) {
      toast('No transactions to export', 'warn');
      return;
    }
    
    // CSV header
    const header = 'Date,Ticker,Company Name,Type,Quantity,Price EUR,Price ' + state.settings.currency + 
                   ',Fees,Taxes,Notes,Asset Class';
    
    // Sort by date descending
    const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
    
    // CSV rows
    const rows = sorted.map(tx => {
      const priceDisp = eurToDisplay(+tx.price, tx.date);
      const cls = state.tickerMeta[tx.ticker]?.cls || guessClass(tx.ticker);
      const companyName = state.tickerMeta[tx.ticker]?.companyName || TICKER_NAMES[tx.ticker] || '';
      
      // Escape fields that might contain commas or quotes
      const escapeCsv = val => {
        const str = String(val || '');
        return str.includes(',') || str.includes('"') || str.includes('\n') 
          ? '"' + str.replace(/"/g, '""') + '"' 
          : str;
      };
      
      return [
        tx.date,
        tx.ticker,
        escapeCsv(companyName),
        tx.type,
        +tx.qty,  // Preserve full precision for crypto (no .toFixed truncation)
        (+tx.price).toFixed(4),
        priceDisp.toFixed(4),
        (+(tx.fees || 0)).toFixed(2),
        (+(tx.taxes || 0)).toFixed(2),
        escapeCsv(tx.notes || ''),
        cls
      ].join(',');
    });
    
    const csv = [header].concat(rows).join('\n');
    
    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `portfolio_transactions_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast(`Exported ${txs.length} transaction${txs.length !== 1 ? 's' : ''} from portfolio`, 'success');
  }

  /** Programmatically open the file picker for JSON import (works inside modals/sidebars) */
  function triggerImport() {
    const inp = el('import-file');
    if (inp) { inp.value = ''; inp.click(); }
  }

  /**
   * Rename a ticker symbol across all transactions, price cache, and tickerMeta.
   * @param {string} oldTicker - Current ticker symbol
   */
  function renameTicker(oldTicker) {
    const newTicker = prompt(`Rename ticker "${oldTicker}" to:`, oldTicker);
    if (!newTicker || newTicker.trim() === '' || newTicker.trim().toUpperCase() === oldTicker.toUpperCase()) return;
    const up = newTicker.trim().toUpperCase();

    // Migrate transactions
    state.transactions.forEach(t => { if (t.ticker === oldTicker) t.ticker = up; });

    // Migrate price cache
    if (state.priceCache[oldTicker]) {
      state.priceCache[up] = state.priceCache[oldTicker];
      delete state.priceCache[oldTicker];
    }

    // Migrate tickerMeta
    if (state.tickerMeta[oldTicker]) {
      state.tickerMeta[up] = state.tickerMeta[oldTicker];
      delete state.tickerMeta[oldTicker];
    }

    // Migrate color cache (in-memory only)
    if (tickerColorCache[oldTicker]) {
      tickerColorCache[up] = tickerColorCache[oldTicker];
      delete tickerColorCache[oldTicker];
    }

    saveState();
    render();
    toast(`Renamed ${oldTicker} → ${up}`, 'success');
  }

  /**
   * Read a JSON backup file from a file-input event and replace current state.
   * Shows a confirmation dialog before overwriting to prevent accidental data loss.
   * @param {Event} event - The file input change event
   */
  function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data.transactions)) throw new Error('Invalid format');
        confirmAction(
          'Import portfolio?',
          `Replace current data with ${data.transactions.length} transactions from ${file.name}?`,
          '📥', 'Import',
          () => {
            state = { ...state, ...data };
            saveState();
            render();
            syncSettingsUI();
            toast('Imported', 'success');
          }
        );
      } catch (err) {
        toast('Import failed: ' + err.message, 'error');
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  /** Prompt then wipe all transactions, price cache, and ticker metadata */
  function clearAllData() {
    confirmAction('Clear all data?', 'Delete all transactions, positions and price cache.', '🗑', 'Clear All', () => {
      state.transactions = [];
      state.priceCache = {};
      state.tickerMeta = {};
      saveState();
      render();
      toast('All data cleared', 'info');
    });
  }

  /** Prompt then replace all transactions with the built-in demo portfolio */
  function reloadSampleData() {
    confirmAction('Reload sample data?', 'Replace current transactions with sample portfolio.', '🔄', 'Reload', applySampleData);
  }

  /* ═══════════════════════════════════════════════════════════════════
     SAMPLE DATA
     Pre-loaded portfolio for demonstration purposes.
     ═══════════════════════════════════════════════════════════════════ */

  function applySampleData() {
    const id = () => Math.random().toString(36).slice(2, 9);
    state.transactions = [
      { id: id(), date: '2022-03-14', ticker: 'AAPL',  type: 'BUY',  qty: 10,   price: 155.35, notes: 'Initial buy' },
      { id: id(), date: '2022-09-01', ticker: 'AAPL',  type: 'BUY',  qty: 5,    price: 157.65, notes: 'Dip add' },
      { id: id(), date: '2023-07-15', ticker: 'AAPL',  type: 'SELL', qty: 5,    price: 189.30, notes: 'Partial profit' },
      { id: id(), date: '2024-01-10', ticker: 'AAPL',  type: 'BUY',  qty: 3,    price: 185.50, notes: 'Reload' },
      { id: id(), date: '2022-06-10', ticker: 'MSFT',  type: 'BUY',  qty: 8,    price: 252.46, notes: '' },
      { id: id(), date: '2023-11-20', ticker: 'NVDA',  type: 'BUY',  qty: 15,   price: 495.82, notes: 'AI play' },
      { id: id(), date: '2024-02-20', ticker: 'NVDA',  type: 'BUY',  qty: 5,    price: 674.00, notes: 'Add' },
      { id: id(), date: '2024-06-01', ticker: 'NVDA',  type: 'SELL', qty: 8,    price: 1080.00, notes: 'Trim' },
      { id: id(), date: '2023-01-10', ticker: 'VOO',   type: 'BUY',  qty: 4,    price: 367.80, notes: 'DCA' },
      { id: id(), date: '2023-07-14', ticker: 'VOO',   type: 'BUY',  qty: 3,    price: 389.20, notes: 'DCA' },
      { id: id(), date: '2024-05-01', ticker: 'TSLA',  type: 'BUY',  qty: 12,   price: 182.63, notes: '' },
      { id: id(), date: '2024-07-15', ticker: 'TSLA',  type: 'SELL', qty: 5,    price: 248.50, notes: 'Take profit' },
      { id: id(), date: '2022-06-20', ticker: 'BTC',   type: 'BUY',  qty: 0.15, price: 19400,  notes: 'Bear market buy' },
      { id: id(), date: '2023-10-28', ticker: 'BTC',   type: 'BUY',  qty: 0.10, price: 33400,  notes: 'Breakout' },
    ];
    state.tickerMeta = {
      AAPL: { cls: 'Stock' }, MSFT: { cls: 'Stock' }, NVDA: { cls: 'Stock' },
      VOO: { cls: 'ETF' }, TSLA: { cls: 'Stock' }, BTC: { cls: 'Crypto' },
    };
    saveState();
    render();
    toast('Sample portfolio loaded', 'success');
  }

  /* ═══════════════════════════════════════════════════════════════════
     TOAST NOTIFICATIONS
     Brief feedback messages that auto-dismiss.
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * Show a toast notification.
   * @param {string} message - Text to display
   * @param {'success'|'error'|'info'|'warn'} type - Visual style
   * @param {number} duration - Display time in ms (default 3500)
   */
  function toast(message, type = 'info', duration = 3500) {
    const container = el('toast-wrap');
    const toastEl = document.createElement('div');
    toastEl.className = 'toast ' + type;
    toastEl.textContent = message;
    container.appendChild(toastEl);

    setTimeout(() => {
      toastEl.style.opacity = '0';
      toastEl.style.transition = 'opacity 0.3s';
      setTimeout(() => toastEl.remove(), 300);
    }, duration);
  }

  /* ═══════════════════════════════════════════════════════════════════
     KEYBOARD SHORTCUTS
     ═══════════════════════════════════════════════════════════════════ */

  document.addEventListener('keydown', e => {

    if (e.key === 'Escape') {
      closeModal();
      closeDrawer();
      closeSettings();
      closeConfirm();
      closeCsvImport();
    }
  });

  /* ═══════════════════════════════════════════════════════════════════
     SETTINGS UI SYNC
     Ensures form inputs reflect the current state values.
     ═══════════════════════════════════════════════════════════════════ */

  function syncSettingsUI() {
    el('cfg-apikey').value       = state.settings.apiKey    || '';
    el('cfg-cache').value        = state.settings.cacheTTL  || 14400000;
    el('h-currency').value       = state.settings.currency  || 'EUR';
    el('cfg-gist-token').value   = state.settings.gistToken || '';
    el('cfg-gist-id').value      = state.settings.gistId    || '';
  }

  /* ═══════════════════════════════════════════════════════════════════
     THEME — light / dark toggle
     ═══════════════════════════════════════════════════════════════════ */

  const MOON_SVG = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  const SUN_SVG  = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';

  function applyTheme() {
    const theme = state.settings.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
  }

  function updateThemeIcon(theme) {
    const icon = el('h-theme-icon');
    if (!icon) return;
    icon.innerHTML = (theme === 'dark') ? MOON_SVG : SUN_SVG;
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next   = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    state.settings.theme = next;
    updateThemeIcon(next);
    saveState();
  }

  /* ═══════════════════════════════════════════════════════════════════
     GITHUB GIST SYNC
     Saves / loads portfolio-data.json to a private GitHub Gist.
     Token stays in localStorage — never leaves the browser.
     ═══════════════════════════════════════════════════════════════════ */

  function setGistStatus(msg, ok = null) {
    const node = el('gist-status');
    if (!node) return;
    node.textContent = msg;
    node.style.color = ok === true ? 'var(--green)' : ok === false ? 'var(--red)' : 'var(--muted)';
  }

  /**
   * Show the amber unsaved-changes dot on the header Gist button
   * whenever Gist is configured and local data may differ from last save.
   * Dot is hidden after a successful save.
   */
  function updateGistSaveIndicator() {
    const btn = el('h-gist-save');
    if (!btn) return;
    const { token, id } = _gistCreds();
    const dot = btn.querySelector('.gist-unsaved-dot');
    if (dot) dot.style.display = (token && id) ? '' : 'none';
  }

  /** Read token + id from state (fallback to live DOM if settings panel open) */
  function _gistCreds() {
    const token = ((el('cfg-gist-token') && el('cfg-gist-token').value) || state.settings.gistToken || '').trim();
    const id    = ((el('cfg-gist-id')    && el('cfg-gist-id').value)    || state.settings.gistId    || '').trim();
    return { token, id };
  }

  async function gistSave(silent = false) {
    const { token, id } = _gistCreds();
    if (!token) {
      if (!silent) toast('Add your GitHub token in Settings → Gist Sync', 'error');
      return;
    }

    // If no Gist ID is set and this is a manual save, confirm before creating
    // a brand-new Gist — prevents accidental duplicate databases on new browsers.
    if (!id && !silent) {
      confirmAction(
        'Create a new Gist?',
        'No Gist ID is set. This will create a brand-new Gist database. ' +
        'If you already have a Gist, paste its ID in the field above first.',
        '☁️', 'Create new Gist',
        () => _performGistSave(token, id, silent)
      );
      return;
    }

    _performGistSave(token, id, silent);
  }

  /** Internal — performs the actual Gist API call */
  async function _performGistSave(token, id, silent = false) {
    if (!silent) setGistStatus('Saving…');
    // Strip token before writing — GitHub scans Gist content and
    // auto-revokes any ghp_ token it finds, even in private Gists.
    const { gistToken: _t, ...safeSettings } = state.settings;
    const safeState = { ...state, settings: safeSettings };
    const payload = {
      description: 'Portfolio Terminal — saved ' + new Date().toISOString(),
      public: false,
      files: {
        'portfolio-data.json': {
          content: JSON.stringify({ ...safeState, _saved: new Date().toISOString() }, null, 2)
        }
      }
    };
    try {
      const url    = id ? `https://api.github.com/gists/${id}` : 'https://api.github.com/gists';
      const method = id ? 'PATCH' : 'POST';
      const resp   = await fetch(url, {
        method,
        headers: { 'Authorization': 'token ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.message || resp.status); }
      const data = await resp.json();
      if (!id) {
        // First save — store the new Gist ID
        state.settings.gistId = data.id;
        if (el('cfg-gist-id')) el('cfg-gist-id').value = data.id;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setGistStatus('Gist created — ID: ' + data.id, true);
      } else {
        if (!silent) setGistStatus('Saved · ' + new Date().toLocaleTimeString(), true);
      }
      // Hide the unsaved-changes dot — Gist is now in sync with local state
      const dot = el('h-gist-save')?.querySelector('.gist-unsaved-dot');
      if (dot) dot.style.display = 'none';
      if (!silent) toast('Saved to GitHub Gist', 'success');
    } catch (e) {
      setGistStatus('Save failed: ' + e.message, false);
      if (!silent) toast('Gist save failed: ' + e.message, 'error');
    }
  }

  async function gistLoad() {
    const { token, id } = _gistCreds();
    if (!token) { toast('Add your GitHub token in Settings → Gist Sync', 'error'); return; }
    if (!id)    { toast('Enter a Gist ID to load from', 'error'); return; }
    setGistStatus('Loading…');
    try {
      const resp = await fetch(`https://api.github.com/gists/${id}`, {
        headers: { 'Authorization': 'token ' + token }
      });
      if (!resp.ok) { const e = await resp.json(); throw new Error(e.message || resp.status); }
      const data   = await resp.json();
      const raw    = data.files?.['portfolio-data.json']?.content;
      if (!raw) throw new Error('portfolio-data.json not found in Gist');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.transactions)) throw new Error('Invalid portfolio format');
      confirmAction(
        'Load from Gist?',
        `Replace current data with ${parsed.transactions.length} transactions from Gist?`,
        '☁️', 'Load',
        () => {
          // Preserve current credentials — never overwrite with values
          // from the Gist file. The file intentionally has gistToken:''
          const currentToken  = state.settings.gistToken;
          const currentGistId = state.settings.gistId;
          state = { ...state, ...parsed };
          state.settings.gistToken = currentToken;
          state.settings.gistId    = currentGistId;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          render();
          syncSettingsUI();
          applyTheme();
          setGistStatus('Loaded · ' + new Date().toLocaleTimeString(), true);
          toast('Portfolio loaded from GitHub Gist', 'success');
        }
      );
    } catch (e) {
      setGistStatus('Load failed: ' + e.message, false);
      toast('Gist load failed: ' + e.message, 'error');
    }
  }

  /**
   * Clear saved token and Gist ID from this browser only.
   * Your Gist data on GitHub is completely untouched.
   * Use this to re-enter fresh credentials without clearing all browser data.
   */
  function gistClearCredentials() {
    confirmAction(
      'Clear Gist credentials?',
      'Removes the saved token and Gist ID from this browser only. ' +
      'Your data on GitHub is not affected. You can re-enter credentials at any time.',
      '🔑', 'Clear',
      () => {
        state.settings.gistToken = '';
        state.settings.gistId    = '';
        el('cfg-gist-token').value = '';
        el('cfg-gist-id').value    = '';
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setGistStatus('Credentials cleared — paste your token and Gist ID to reconnect', null);
        toast('Gist credentials cleared', 'info');
      }
    );
  }

  /**
   * Sign Out - Clear Gist credentials and show credentials popup.
   * This allows the user to enter different credentials (e.g., switching accounts).
   */
  function signOut() {
    confirmAction(
      'Sign Out?',
      'You will be asked to re-enter your GitHub token and Gist ID. Your local data will be preserved.',
      '🚪', 'Sign Out',
      () => {
        // Clear credentials from state and localStorage
        state.settings.gistToken = '';
        state.settings.gistId    = '';
        saveState();
        
        // Show credentials popup
        openCredentialsPopup(() => {});
        
        toast('Signed out successfully', 'info');
      }
    );
  }

  /* ═══════════════════════════════════════════════════════════════════
     CREDENTIALS CHECK
     Shows the credentials popup if Gist token/ID are missing.
     ═══════════════════════════════════════════════════════════════════ */

  /** Check for missing credentials on startup and show popup if needed */
  function initLockScreen() {
    // PIN removed. Only show credentials popup if Gist token/ID missing.
    const hasToken  = !!(state.settings.gistToken || '').trim();
    const hasGistId = !!(state.settings.gistId    || '').trim();
    if (!hasToken || !hasGistId) {
      openCredentialsPopup(() => {});
    }
  }

  function openCredentialsPopup(callback) {
    _credCallback = callback;
    el('lock-token').value   = '';
    el('lock-gist-id').value = '';
    el('cred-hint').textContent  = '';
    el('cred-hint').style.color  = 'var(--muted)';
    el('cred-ov').classList.add('open');
    // Auto-focus the token field
    setTimeout(() => el('lock-token').focus(), 80);
  }

  /**
   * Save credentials entered in the popup, then ask whether to load from
   * Gist or keep the current local data. Gives the user full control —
   * choosing Skip means nothing is pulled from Gist, preventing accidental
   * overwrites of local test data or sample data.
   */
  function saveCredentials() {
    const token  = (el('lock-token').value   || '').trim();
    const gistId = (el('lock-gist-id').value || '').trim();
    const hint   = el('cred-hint');

    if (!token) {
      hint.textContent = 'GitHub token is required';
      hint.style.color = 'var(--red)';
      return;
    }
    if (!gistId) {
      hint.textContent = 'Gist ID is required';
      hint.style.color = 'var(--red)';
      return;
    }

    // Persist credentials — do NOT auto-save to Gist here
    state.settings.gistToken = token;
    state.settings.gistId    = gistId;
    if (el('cfg-gist-token')) el('cfg-gist-token').value = token;
    if (el('cfg-gist-id'))    el('cfg-gist-id').value    = gistId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    // Close credentials popup
    el('cred-ov').classList.remove('open');
    const cb = _credCallback;
    _credCallback = null;

    // Ask: load Gist data or keep current local data?
    // Patching the cancel button to say "Skip" for this specific confirm.
    confirmAction(
      'Load data from Gist?',
      'Would you like to replace the current data with your saved portfolio from GitHub Gist? Choose Skip to keep the current local data.',
      '☁️', 'Load from Gist',
      () => { gistLoad().then(() => { if (cb) cb(); }); }
    );

    // Patch cancel button to "Skip" — restore after dialog closes
    const cancelBtn = el('confirm-ov')?.querySelector('.cancel-btn');
    if (cancelBtn) {
      cancelBtn.textContent = 'Skip';
      const origOnClick = cancelBtn.onclick;
      cancelBtn.onclick = () => {
        closeConfirm();
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = origOnClick;
        if (cb) cb();
      };
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     EVENT LISTENERS SETUP
     Attach all event handlers that were previously inline onclick/onchange.
     Called once during initialization to wire up the UI.
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * Setup all event listeners for buttons, selects, and interactive elements.
   * Replaces inline onclick/onchange handlers for better separation of concerns.
   */
  function setupEventListeners() {
    // ─── Header Controls ──────────────────────────────────────────────
    
    /** Theme toggle button (topbar) */
    const themeBtn = el('h-theme-btn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    
    /** Sign Out button (topbar) */
    const signOutBtn = el('h-signout-btn');
    if (signOutBtn) signOutBtn.addEventListener('click', signOut);
    
    /** Currency selector */
    const currencySelect = el('h-currency');
    if (currencySelect) currencySelect.addEventListener('change', onCurrencyChange);
    
    /** Refresh prices button */
    const refreshBtn = el('h-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', () => refreshPrices(true));
    
    /** Settings button */
    const settingsBtn = el('h-settings-btn');
    if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
    
    /** Gist Save button (header) */
    const gistSaveBtn = el('h-gist-save');
    if (gistSaveBtn) gistSaveBtn.addEventListener('click', () => gistSave(false));
    
    // ─── Sidebar Navigation ───────────────────────────────────────────
    
    /** Portfolio module icon */
    const sbPortfolio = el('sb-portfolio');
    if (sbPortfolio) sbPortfolio.addEventListener('click', () => switchModule('portfolio'));
    
    /** Gist Save icon (sidebar) */
    const sbGistSave = el('sb-gist-save');
    if (sbGistSave) sbGistSave.addEventListener('click', () => gistSave(false));
    
    // ─── Tab Navigation ───────────────────────────────────────────────
    
    /** Wire up all tab buttons to showTab() */
    document.querySelectorAll('.tab-btn').forEach((btn, idx) => {
      const tabIds = ['overview', 'positions', 'history'];
      if (tabIds[idx]) {
        btn.addEventListener('click', function() { showTab(tabIds[idx], this); });
      }
    });
    
    // ─── Overview Tab: Allocation Tabs ────────────────────────────────
    
    /** By Asset / By Class toggle */
    const atabAsset = el('atab-asset');
    if (atabAsset) atabAsset.addEventListener('click', () => switchAllocTab('asset'));
    
    const atabClass = el('atab-class');
    if (atabClass) atabClass.addEventListener('click', () => switchAllocTab('class'));
    
    // ─── Positions Tab: Class Filters ─────────────────────────────────
    
    /** Class filter buttons (All, Stock, ETF, Crypto, Bond, MF) */
    const filterIds = ['all', 'Stock', 'ETF', 'Crypto', 'Bond', 'MF'];
    filterIds.forEach(cls => {
      const btn = el('clf-' + cls);
      if (btn) btn.addEventListener('click', () => setClsFilter(cls));
    });
    
    // ─── Positions Tab: Toolbar Buttons ───────────────────────────────
    
    /** Export Portfolio CSV button */
    const btnExportCsv = el('btn-export-csv');
    if (btnExportCsv) btnExportCsv.addEventListener('click', exportPortfolioCSV);
    
    /** Import CSV button */
    const btnImportCsv = el('btn-import-csv');
    if (btnImportCsv) btnImportCsv.addEventListener('click', openCsvImport);
    
    /** Add Transaction button */
    const btnAddTransaction = el('btn-add-transaction');
    if (btnAddTransaction) btnAddTransaction.addEventListener('click', () => openModal());
    
    // ─── History Tab: Filter Buttons ──────────────────────────────────
    
    /** All / Buy / Sell filters */
    const fAll = el('f-all');
    if (fAll) fAll.addEventListener('click', () => setHistFilter('all'));
    
    const fBuy = el('f-buy');
    if (fBuy) fBuy.addEventListener('click', () => setHistFilter('buy'));
    
    const fSell = el('f-sell');
    if (fSell) fSell.addEventListener('click', () => setHistFilter('sell'));
    
    /** History search input */
    const histSearch = el('hist-search');
    if (histSearch) histSearch.addEventListener('input', renderHistory);
    
    /** History sort select */
    const histSort = el('hist-sort');
    if (histSort) histSort.addEventListener('change', renderHistory);
    
    // ─── Modal: Add Transaction ───────────────────────────────────────
    
    /** BUY/SELL toggle buttons */
    const typeBuy = el('type-buy');
    if (typeBuy) typeBuy.addEventListener('click', () => setType('BUY'));
    
    const typeSell = el('type-sell');
    if (typeSell) typeSell.addEventListener('click', () => setType('SELL'));
    
    /** Identifier mode tabs (Ticker / ISIN / WKN) */
    const idTicker = el('id-ticker');
    if (idTicker) idTicker.addEventListener('click', () => setIdMode('ticker'));
    
    const idIsin = el('id-isin');
    if (idIsin) idIsin.addEventListener('click', () => setIdMode('isin'));
    
    const idWkn = el('id-wkn');
    if (idWkn) idWkn.addEventListener('click', () => setIdMode('wkn'));
    
    /** Verify identifier button */
    const verifyBtn = el('f-verify');
    if (verifyBtn) verifyBtn.addEventListener('click', verifyIdentifier);
    
    /** Ticker input for live search */
    const tickerInput = el('f-ticker');
    if (tickerInput) {
      // Auto-uppercase ticker input
      tickerInput.addEventListener('input', function() {
        this.value = this.value.toUpperCase();
        onTickerInput();
      });
    }
    
    /** Quantity input for total calculation */
    const qtyInput = el('f-qty');
    if (qtyInput) qtyInput.addEventListener('input', validateForm);
    
    /** Price input for total calculation */
    const priceInput = el('f-price');
    if (priceInput) priceInput.addEventListener('input', validateForm);
    
    /** Fees input */
    const feesInput = el('f-fees');
    if (feesInput) feesInput.addEventListener('input', validateForm);
    
    /** Taxes input */
    const taxesInput = el('f-taxes');
    if (taxesInput) taxesInput.addEventListener('input', validateForm);
    
    /** Asset class selector */
    const clsSelect = el('f-cls');
    if (clsSelect) clsSelect.addEventListener('change', validateForm);
    
    /** Submit transaction button */
    const submitBtn = el('f-submit');
    if (submitBtn) submitBtn.addEventListener('click', submitTransaction);
    
    /** Modal cancel button */
    const modalCancel = el('modal-cancel');
    if (modalCancel) modalCancel.addEventListener('click', closeModal);
    
    /** Quick ticker buttons */
    document.querySelectorAll('.qt-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        setTicker(this.textContent.trim(), true);
      });
    });
    
    /** Close modal buttons - specific handlers for each modal */
    const modalXBtn = el('modal-x-btn');
    if (modalXBtn) modalXBtn.addEventListener('click', closeModal);
    
    const csvXBtn = el('csv-x-btn');
    if (csvXBtn) csvXBtn.addEventListener('click', closeCsvImport);
    
    /** Modal overlay (click to close) */
    const modalOv = el('modal-ov');
    if (modalOv) modalOv.addEventListener('click', (e) => {
      // Only close if clicking the overlay itself, not modal content
      if (e.target === e.currentTarget) closeModal();
    });
    
    /** CSV modal overlay (click to close) */
    const csvOv = el('csv-ov');
    if (csvOv) csvOv.addEventListener('click', (e) => {
      // Only close if clicking the overlay itself, not modal content
      if (e.target === e.currentTarget) closeCsvImport();
    });
    
    // ─── Drawer: Position Detail ──────────────────────────────────────
    
    /** Close drawer button */
    const drwX = document.querySelector('.drw-x');
    if (drwX) drwX.addEventListener('click', closeDrawer);
    
    /** Drawer overlay (click to close) */
    const drwOv = el('drw-ov');
    if (drwOv) drwOv.addEventListener('click', (e) => {
      // Only close if clicking the overlay itself, not drawer content
      if (e.target === e.currentTarget) closeDrawer();
    });
    
    /** Drawer handle (click to close) */
    const drwHandle = document.querySelector('.drw-handle');
    if (drwHandle) drwHandle.addEventListener('click', closeDrawer);
    
    /** Export Position CSV button (inside drawer) */
    document.querySelectorAll('.export-btn').forEach(btn => {
      if (btn.textContent.includes('Export CSV')) {
        btn.addEventListener('click', exportPositionCSV);
      }
    });
    
    // ─── Confirmation Dialog ──────────────────────────────────────────
    
    /** Confirm OK button */
    const confirmOkBtn = el('cok');
    if (confirmOkBtn) confirmOkBtn.addEventListener('click', confirmOk);
    
    /** Cancel button */
    document.querySelectorAll('.cancel-btn').forEach(btn => {
      btn.addEventListener('click', closeConfirm);
    });
    
    // ─── Settings Panel ───────────────────────────────────────────────
    
    /** Close settings button */
    const spClose = el('sp-close');
    if (spClose) spClose.addEventListener('click', closeSettings);
    
    /** Settings overlay (click to close) */
    const spOv = el('sp-ov');
    if (spOv) spOv.addEventListener('click', (e) => {
      // Only close if clicking the overlay itself, not settings panel
      if (e.target === e.currentTarget) closeSettings();
    });
    
    /** Save settings button */
    const saveSett = el('save-sett');
    if (saveSett) saveSett.addEventListener('click', saveSettings);
    
    /** Data management buttons */
    const exportBtn = el('export-btn');
    if (exportBtn) exportBtn.addEventListener('click', exportData);
    
    const importBtn = el('import-btn');
    if (importBtn) importBtn.addEventListener('click', triggerImport);
    
    const clearBtn = el('clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', clearAllData);
    
    const reloadBtn = el('reload-btn');
    if (reloadBtn) reloadBtn.addEventListener('click', reloadSampleData);
    
    /** Gist management buttons */
    const gistLoadBtn = el('gist-load-btn');
    if (gistLoadBtn) gistLoadBtn.addEventListener('click', gistLoad);
    
    const gistClearBtn = el('gist-clear-btn');
    if (gistClearBtn) gistClearBtn.addEventListener('click', gistClearCredentials);
    
    /** File import input */
    const importFile = el('import-file');
    if (importFile) importFile.addEventListener('change', importData);
    
    // ─── CSV Import Wizard ────────────────────────────────────────────
    
    /** Close CSV wizard */
    const csvClose = el('csv-close');
    if (csvClose) csvClose.addEventListener('click', closeCsvImport);
    
    /** CSV wizard navigation */
    const csvPrev = el('csv-prev');
    if (csvPrev) csvPrev.addEventListener('click', () => csvGoStep(-1));
    
    const csvNext = el('csv-next');
    if (csvNext) csvNext.addEventListener('click', () => csvGoStep(1));
    
    /** CSV auto-resolve button */
    const csvResolve = el('csv-resolve-btn');
    if (csvResolve) csvResolve.addEventListener('click', csvAutoResolve);
    
    /** CSV execute import button */
    const csvExec = el('csv-exec');
    if (csvExec) csvExec.addEventListener('click', csvExecuteImport);
    
    // ─── Credentials Popup ────────────────────────────────────────────
    
    /** Save credentials button */
    document.querySelectorAll('.submit-btn').forEach(btn => {
      if (btn.textContent.includes('Save & Continue')) {
        btn.addEventListener('click', saveCredentials);
      }
    });
    
    // ─── FX Diagnostics ───────────────────────────────────────────────
    
    /** Test FX API button */
    document.querySelectorAll('.abtn.outline').forEach(btn => {
      if (btn.textContent.includes('Test API')) {
        btn.addEventListener('click', testFxAPI);
      }
      if (btn.textContent.includes('Copy Debug Info')) {
        btn.addEventListener('click', copyFxDebugInfo);
      }
    });
    
    console.info('[Events] All event listeners attached');
  }

  /* ═══════════════════════════════════════════════════════════════════
     INITIALISATION
     Boot sequence: load state → apply theme → setup events → render with
     mock prices → fetch FX rates (background) → fetch live prices (bg).
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * Initialize the application.
   * Loads saved state, applies theme, seeds mock prices, renders UI,
   * then fetches live FX rates and prices in the background.
   */
  async function init() {
    loadState();
    applyTheme();
    setupEventListeners();

    // Load sample data if this is a fresh install
    if (!state.transactions.length) applySampleData();

    // Check if we have cached historical FX data from localStorage
    const hasCachedFX = Object.keys(state.fxDaily.USD).length > 50;
    const fxAge = state.fxLastFetch ? Date.now() - state.fxLastFetch : Infinity;
    const FX_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

    if (hasCachedFX) {
      // Use cached historical FX data
      fxLoaded.USD = Object.keys(state.fxDaily.USD).length > 50;
      fxLoaded.INR = Object.keys(state.fxDaily.INR).length > 50;
      
      if (fxLoaded.USD) {
        const latestDate = Object.keys(state.fxDaily.USD).sort().at(-1);
        fxLatest.USD = state.fxDaily.USD[latestDate];
      }
      if (fxLoaded.INR) {
        const latestDate = Object.keys(state.fxDaily.INR).sort().at(-1);
        fxLatest.INR = state.fxDaily.INR[latestDate];
      }
      
      console.info('[FX] Using cached historical data (' + Object.keys(state.fxDaily.USD).length + ' days)');
      updateFXUI();
    }

    // Seed mock prices for all tickers immediately so the UI shows instantly
    const allTickers = [...new Set(state.transactions.map(t => t.ticker))];
    for (const ticker of allTickers) {
      if (!state.priceCache[ticker]) {
        state.priceCache[ticker] = { price: getMockPrice(ticker), ts: 0, src: 'sim' };
      }
      // Seed company name from TICKER_NAMES if not already stored
      if (!state.tickerMeta[ticker]) state.tickerMeta[ticker] = {};
      if (!state.tickerMeta[ticker].companyName && TICKER_NAMES[ticker]) {
        state.tickerMeta[ticker].companyName = TICKER_NAMES[ticker];
      }
    }

    syncSettingsUI();
    render();
    setHeaderStatus('live', 'Simulated prices · refreshing…');
    updateSourceBadge();

    // All network fetches run in the background — UI is already showing data
    fetchFxLatest().then(() => render());
    
    // Only refetch historical FX if stale or missing
    if (!hasCachedFX || fxAge > FX_CACHE_TTL) {
      console.info('[FX] Refreshing historical data (cache age: ' + Math.round(fxAge / 3600000) + 'h)');
      fetchFX().then(ok => { if (ok) render(); });
    }
    
    refreshPrices();

    updateStorageStatus();

    // Show credentials popup if Gist token/ID are missing
    initLockScreen();
  }

  init();

  /* ═══════════════════════════════════════════════════════════════════
     FX DIAGNOSTICS
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * Test FX API connectivity and display detailed results inline.
   */
  async function testFxAPI() {
    const resultDiv = el('fx-test-result');
    if (!resultDiv) return;
    
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div style="color:var(--amber)">Testing API connectivity...</div>';
    
    let results = [];
    
    // Test 1: Frankfurter (current rates)
    results.push('<div style="margin-top:8px"><strong>Test 1: Frankfurter (current rates)</strong></div>');
    try {
      const startTime = Date.now();
      const resp = await fetchWithTimeout(
        'https://api.frankfurter.app/latest?from=EUR&to=USD,INR',
        FETCH_TIMEOUT_MS.standard
      );
      const elapsed = Date.now() - startTime;
      
      if (resp.ok) {
        const data = await resp.json();
        results.push(`<div style="color:var(--green)">✓ Success (${elapsed}ms)</div>`);
        results.push(`<div>Status: ${resp.status} ${resp.statusText}</div>`);
        results.push(`<div>Rates: USD=${data.rates?.USD}, INR=${data.rates?.INR}</div>`);
      } else {
        results.push(`<div style="color:var(--red)">✗ HTTP ${resp.status} ${resp.statusText}</div>`);
      }
    } catch (e) {
      results.push(`<div style="color:var(--red)">✗ ${e.message}</div>`);
    }
    
    // Test 2: Frankfurter (historical)
    results.push('<div style="margin-top:8px"><strong>Test 2: Frankfurter (historical)</strong></div>');
    try {
      const startTime = Date.now();
      const resp = await fetchWithTimeout(
        'https://api.frankfurter.app/2024-01-01..2024-01-31?from=EUR&to=USD',
        FETCH_TIMEOUT_MS.bulk
      );
      const elapsed = Date.now() - startTime;
      
      if (resp.ok) {
        const data = await resp.json();
        const count = Object.keys(data.rates || {}).length;
        results.push(`<div style="color:var(--green)">✓ Success (${elapsed}ms)</div>`);
        results.push(`<div>Status: ${resp.status} ${resp.statusText}</div>`);
        results.push(`<div>Fetched ${count} days of historical rates</div>`);
      } else {
        results.push(`<div style="color:var(--red)">✗ HTTP ${resp.status} ${resp.statusText}</div>`);
      }
    } catch (e) {
      results.push(`<div style="color:var(--red)">✗ ${e.message}</div>`);
    }
    
    // Test 3: ExchangeRate-API (fallback)
    results.push('<div style="margin-top:8px"><strong>Test 3: ExchangeRate-API (fallback)</strong></div>');
    try {
      const startTime = Date.now();
      const resp = await fetchWithTimeout(
        'https://open.er-api.com/v6/latest/EUR',
        FETCH_TIMEOUT_MS.standard
      );
      const elapsed = Date.now() - startTime;
      
      if (resp.ok) {
        const data = await resp.json();
        results.push(`<div style="color:var(--green)">✓ Success (${elapsed}ms)</div>`);
        results.push(`<div>Status: ${resp.status}</div>`);
        results.push(`<div>Rates: USD=${data.rates?.USD}, INR=${data.rates?.INR}</div>`);
      } else {
        results.push(`<div style="color:var(--red)">✗ HTTP ${resp.status}</div>`);
      }
    } catch (e) {
      results.push(`<div style="color:var(--red)">✗ ${e.message}</div>`);
    }
    
    results.push('<div style="margin-top:8px;color:var(--text2)">Test completed at ' + new Date().toLocaleTimeString() + '</div>');
    resultDiv.innerHTML = results.join('');
  }

  /**
   * Copy FX debug information to clipboard for issue reporting.
   */
  function copyFxDebugInfo() {
    const info = [];
    info.push('=== BIT PLEB Portfolio Terminal - FX Debug Info ===');
    info.push('Generated: ' + new Date().toISOString());
    info.push('');
    info.push('--- API Diagnostics ---');
    info.push('Last Attempt: ' + (fxDiagnostics.lastAttempt || 'Never'));
    info.push('Last Success: ' + (fxDiagnostics.lastSuccess || 'Never'));
    info.push('Error Type: ' + (fxDiagnostics.errorType || 'None'));
    info.push('Error Message: ' + (fxDiagnostics.lastError || 'None'));
    info.push('HTTP Status: ' + (fxDiagnostics.httpStatus || 'N/A'));
    info.push('');
    info.push('--- Cached Data ---');
    info.push('USD Historical Rates: ' + Object.keys(state.fxDaily.USD).length + ' days');
    info.push('INR Historical Rates: ' + Object.keys(state.fxDaily.INR).length + ' days');
    const lastFetch = state.fxLastFetch ? new Date(state.fxLastFetch).toISOString() : 'Never';
    info.push('Last Successful Fetch: ' + lastFetch);
    const cacheAge = state.fxLastFetch ? Math.round((Date.now() - state.fxLastFetch) / 3600000) + 'h' : 'N/A';
    info.push('Cache Age: ' + cacheAge);
    info.push('');
    info.push('--- Current State ---');
    info.push('USD Loaded: ' + fxLoaded.USD);
    info.push('INR Loaded: ' + fxLoaded.INR);
    info.push('Current USD Rate: ' + fxLatest.USD);
    info.push('Current INR Rate: ' + fxLatest.INR);
    info.push('');
    info.push('--- Browser Info ---');
    info.push('User Agent: ' + navigator.userAgent);
    info.push('Online: ' + navigator.onLine);
    info.push('Protocol: ' + window.location.protocol);
    info.push('');
    info.push('Please share this info when reporting FX API issues.');
    
    const text = info.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      toast('Debug info copied to clipboard', 'info');
    }).catch(() => {
      // Fallback: show in alert
      alert(text);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     PUBLIC API
     ─────────────────────────────────────────────────────────────────
     Only the functions listed here are accessible from HTML onclick
     handlers via the global `App` object. Everything else is private.
     ═══════════════════════════════════════════════════════════════════ */

  return {
    // Navigation
    /** Switch main tab. @param {string} name @param {HTMLElement} btn */
    showTab,
    /** Switch top-level module via sidebar. @param {string} modId */
    switchModule,
    /** Sort analytics table by column key. @param {string} key */
    analyticsSort,
    /** Toggle allocation donut view. @param {'asset'|'class'} tab */
    switchAllocTab,
    /** Toggle Position Metrics between asset and class view. @param {'asset'|'class'} mode */
    switchAnView,

    // Positions tab
    /** Filter position cards by class. @param {string} cls */
    setClsFilter,
    /** Open position detail drawer. @param {string} ticker */
    openDrawer,
    closeDrawer,
    /** Prompt to delete all lots for a ticker. @param {string} ticker */
    confirmDeletePos,

    // History tab
    renderHistory,
    /** Set BUY/SELL/ALL filter. @param {'all'|'buy'|'sell'} filter */
    setHistFilter,

    // Add Transaction modal
    /** Open modal, optionally pre-filling ticker. @param {string} [ticker] */
    openModal,
    closeModal,
    /** Toggle BUY/SELL. @param {'BUY'|'SELL'} type */
    setType,
    /** Pre-fill ticker field and update price display. @param {string} ticker @param {boolean} [focus] */
    setTicker,
    /** Set identifier input mode (tab switcher). @param {'ticker'|'isin'|'wkn'} mode */
    setIdMode,
    /** Verify identifier via OpenFIGI or Yahoo Finance. */
    verifyIdentifier,
    onTickerInput,
    validateForm,
    submitTransaction,

    // CSV Import wizard (3-step: Upload → Resolve ISINs → Preview)
    openCsvImport,
    closeCsvImport,
    /** Handle drag-drop onto upload zone. @param {DragEvent} e */
    csvDropHandler,
    /** Handle file input change. @param {Event} e */
    csvFileSelected,
    /** Navigate wizard step. @param {1|2|3} n */
    csvGoStep,
    /** Auto-resolve all ISINs via OpenFIGI (free, no key needed). */
    csvAutoResolve,
    csvTickerInput,
    csvClsChange,
    csvClearISIN,
    /** Commit all non-duplicate rows to the portfolio. */
    csvExecuteImport,

    // Settings panel
    openSettings,
    closeSettings,
    saveSettings,

    // Data management
    exportData,
    /** Export single position's transactions as CSV. */
    exportPositionCSV,
    /** Export all portfolio transactions as CSV. */
    exportPortfolioCSV,
    triggerImport,
    /** Import portfolio from JSON file. @param {Event} e */
    importData,
    clearAllData,
    reloadSampleData,
    renameTicker,

    // Header
    /** Force-refresh all prices bypassing cache TTL. */
    doRefresh: () => refreshPrices(true),
    onCurrencyChange,
    /** Toggle between light and dark theme. */
    toggleTheme,

    // GitHub Gist sync
    /** Manually save to GitHub Gist. @param {boolean} silent */
    gistSave,
    /** Load portfolio data from GitHub Gist. */
    gistLoad,
    /** Clear saved token and Gist ID from this browser. */
    gistClearCredentials,
    /** Sign out - clear credentials and show login popup. */
    signOut,

    // Confirmation dialog
    confirmOk,
    closeConfirm,
    /** Prompt to delete a single transaction. @param {string} id @param {string} ticker @param {number} qty */
    confirmDelTx,

    // Data recovery
    /** Restore a previously deleted transaction. @param {string} id */
    restoreTransaction,
    // Gist credentials popup
    /** Save credentials from the credentials popup and proceed. */
    saveCredentials,
    
    // FX Diagnostics
    /** Test FX API connectivity and display detailed results. */
    testFxAPI,
    /** Copy FX debug information to clipboard. */
    copyFxDebugInfo,
  };
})();
