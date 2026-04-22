'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * PORTFOLIO MODULE  —  Business logic, calculations, price engine
 * ═══════════════════════════════════════════════════════════════════
 *
 * This file contains ALL portfolio business logic:
 *   • FX rates — ECB via frankfurter.app with fallback chain
 *   • Price engine — CoinGecko / Yahoo Finance / Alpha Vantage / Mock
 *   • XIRR — Newton-Raphson solver, multiple seed points
 *   • FIFO lot matching — correct same-date BUY-before-SELL ordering
 *   • CAGR — with 12-month minimum guard (< 1yr shows —)
 *   • Formatting — locale-aware number/currency/percentage display
 *   • CRUD — add/edit/delete transactions, ticker rename
 *   • Export/import — JSON and CSV downloads
 *   • Gist sync wrappers — UI feedback around core/gist.js calls
 *   • Module init — registers with App.Shell, seeds sample data
 *
 * All state reads/writes go through App.State.getPortfolioData() /
 * App.State.setPortfolioData().  No direct localStorage access here.
 * ═══════════════════════════════════════════════════════════════════
 */
window.App = window.App || {};
window.App.Portfolio = window.App.Portfolio || {};

window.App.Portfolio = (() => {

  /* Preserve Data sub-module reference added before this IIFE runs */
  const Data = window.App.Portfolio.Data;

  /* ── DOM helper ───────────────────────────────────────────────── */
  function el(id) { return document.getElementById(id); }

  /* ═══════════════════════════════════════════════════════════════
     CONSTANTS
     ═══════════════════════════════════════════════════════════════ */

  const QTY_EPSILON           = 0.00001;
  const DEFAULT_CACHE_TTL_MS  = 14400000;  // 4 hours
  const MIN_CAGR_YEARS        = 1.0;        // CAGR only meaningful for ≥ 1 year holdings
  const CORS_PROXY            = 'https://corsproxy.io/?';
  const FETCH_TIMEOUT_MS      = { quick: 4000, standard: 5000, slow: 10000, bulk: 25000 };
  const MAX_DELETED_HISTORY   = 10;

  // 14 hues spanning the full wheel (one per major region, red zone excluded).
  // Arranged by stride-7 interleave so adjacent indices are always ~180° apart
  // in hue — two tickers with nearby hash values will always look clearly different.
  //
  // Sorted by hue:  orange(20) yellow(48) lime(80) green(142) emerald(160)
  //   teal(178) cyan(190) blue(214) indigo(239) violet(258) purple(271)
  //   fuchsia(289) pink(330) rose(350)
  // After stride-7: [0,7,1,8,2,9,3,10,4,11,5,12,6,13]
  const PALETTE = [
    '#f97316', // 0  orange     H= 20°
    '#3b82f6', // 1  blue       H=214°  (+194° from prev)
    '#facc15', // 2  yellow     H= 48°  (+194° wrap)
    '#6366f1', // 3  indigo     H=239°  (+191°)
    '#a3e635', // 4  lime       H= 80°  (+201° wrap)
    '#8b5cf6', // 5  violet     H=258°  (+178°)
    '#22c55e', // 6  green      H=142°  (+244° wrap)
    '#a855f7', // 7  purple     H=271°  (+129°)
    '#10b981', // 8  emerald    H=160°  (+249° wrap)
    '#d946ef', // 9  fuchsia    H=289°  (+129°)
    '#14b8a6', // 10 teal       H=178°  (+249° wrap)
    '#ec4899', // 11 pink       H=330°  (+152°)
    '#22d3ee', // 12 cyan       H=190°  (+220° wrap)
    '#f43f5e', // 13 rose       H=350°  (+160°)
  ];
  const LOT_COLORS  = ['#5b9cff','#00dba8','#a07cf8','#ffaa20','#ff6b9d','#00d4ff','#ff9848','#ff3d5a','#39e88e','#e879f9'];
  const CLASS_COLORS = { Stock:'#5b9cff', ETF:'#a07cf8', Crypto:'#e8732a', Bond:'#00d4ff', MF:'#00dba8' };
  const CLS_CSS      = { Stock:'cb-stock', ETF:'cb-etf', Crypto:'cb-crypto', Bond:'cb-bond', MF:'cb-mf' };
  const CUR_SYMBOLS  = { EUR:'€', USD:'$', INR:'₹' };

  const TICKER_NAMES = {
    AAPL:'Apple Inc.', MSFT:'Microsoft Corp.', GOOGL:'Alphabet Inc.', AMZN:'Amazon.com',
    META:'Meta Platforms', NVDA:'NVIDIA Corp.', TSLA:'Tesla Inc.', BRKB:'Berkshire Hathaway',
    JPM:'JPMorgan Chase', V:'Visa Inc.', MA:'Mastercard', SPY:'SPDR S&P 500 ETF',
    QQQ:'Invesco QQQ', VOO:'Vanguard S&P 500', VTI:'Vanguard Total Mkt', IVV:'iShares S&P 500',
    GLD:'SPDR Gold ETF', TLT:'iShares 20yr Treasury', HYG:'iShares HY Corp Bond',
    BTC:'Bitcoin', ETH:'Ethereum', SOL:'Solana', ADA:'Cardano', XRP:'Ripple',
    AMD:'AMD Inc.', NFLX:'Netflix Inc.', DIS:'Walt Disney', PLTR:'Palantir',
    UBER:'Uber Technologies', INTC:'Intel Corp.', BAC:'Bank of America',
    GS:'Goldman Sachs', WMT:'Walmart', COST:'Costco', ORCL:'Oracle', CRM:'Salesforce',
  };

  const CRYPTO_TICKERS = new Set(['BTC','ETH','SOL','ADA','XRP','DOT','DOGE','MATIC','LINK','UNI','ATOM','AVAX']);
  const ETF_TICKERS    = new Set(['SPY','QQQ','VOO','VTI','IVV','VUG','ARKK','GLD','SLV','TLT','HYG','IEF','XLK','XLF','IWM','EEM','VEA','VWO','SCHD','JEPI','VGT','SMH','SOXX','XBI','BOTZ','USO','IAU']);
  const BOND_TICKERS   = new Set(['TLT','HYG','IEF','LQD','BND','AGG','SHY','TIP','MBB']);

  const COINGECKO_IDS = {
    BTC:'bitcoin', ETH:'ethereum', SOL:'solana', ADA:'cardano', XRP:'ripple',
    DOT:'polkadot', DOGE:'dogecoin', MATIC:'matic-network', LINK:'chainlink',
    UNI:'uniswap', ATOM:'cosmos', AVAX:'avalanche-2', BNB:'binancecoin',
    LTC:'litecoin', ALGO:'algorand',
  };

  const MOCK_PRICES_USD = {
    AAPL:215, MSFT:388, GOOGL:168, AMZN:198, META:595, NVDA:115, TSLA:275,
    BRKB:500, JPM:250, V:310, MA:520, SPY:565, QQQ:490, VOO:536, VTI:280,
    IVV:570, GLD:280, TLT:88, HYG:77,
    BTC:84000, ETH:2000, SOL:130, ADA:0.70, XRP:2.30, DOGE:0.18,
    AMD:108, NFLX:980, DIS:100, PLTR:90, UBER:72, INTC:20,
    BAC:44, GS:570, WMT:98, COST:980, ORCL:170, CRM:298,
  };

  /* ── In-memory session state (not persisted directly) ─────────── */

  let fxLatest     = { EUR:1, USD:1.09, INR:92.0 };
  let fxLoaded     = { USD:false, INR:false };
  let fxDiagnostics = { lastAttempt:null, lastSuccess:null, lastError:null, httpStatus:null, errorType:null };

  let histFilter   = 'all';
  let clsFilter    = 'all';
  // confirmCallback removed — confirm dialog state is now owned by App.Shell
  let activeDrawer = null;
  let modalType    = 'BUY';
  let _idMode      = 'ticker';
  let _credCallback = null;
  const tickerColorCache = {};

  /* ── State accessors ──────────────────────────────────────────── */

  function _state()   { return window.App.State.getPortfolioData(); }
  function _save(s)   { window.App.State.setPortfolioData(s); }
  function _settings(){ return _state().settings; }

  /**
   * QUALITY-01: Force-persist the current in-memory state and refresh status UI.
   *
   * IMPORTANT: _state() returns the live reference to _state.portfolio.
   * Callers that mutate it directly (e.g. s.fxDaily.USD[date] = rate) must call
   * _save(s) themselves.  saveState() is only for callers that cannot easily
   * thread the reference through — prefer explicit _save(s) + updateStorageStatus()
   * calls in new code.
   */
  function saveState() {
    _save(_state());
    updateStorageStatus();
    updateGistSaveIndicator();
  }

  /* ── Storage status ───────────────────────────────────────────── */

  function updateStorageStatus() {
    const info    = window.App.State.storageInfo();
    const txCount = _state().transactions.length;
    const posCount = new Set(_state().transactions.map(t => t.ticker)).size;
    const target  = el('sp-storage');
    if (target) {
      target.innerHTML = `<strong>${posCount} positions</strong> · <strong>${txCount} transactions</strong> · <strong>${info}</strong> in localStorage`;
    }
  }

  function updateGistSaveIndicator() {
    const dot = el('h-gist-save')?.querySelector('.gist-unsaved-dot');
    if (dot) dot.style.display = 'block';
  }

  /* ═══════════════════════════════════════════════════════════════
     NETWORK HELPERS
     ═══════════════════════════════════════════════════════════════ */

  function fetchWithTimeout(url, ms = 5000, options = {}) {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    );
    return Promise.race([fetch(url, options), timeout]);
  }

  function withCorsProxy(url) {
    return CORS_PROXY ? CORS_PROXY + url : url;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ═══════════════════════════════════════════════════════════════
     FX RATES
     ═══════════════════════════════════════════════════════════════ */

  async function fetchFxLatest() {
    // Frankfurter (primary)
    try {
      const resp = await fetchWithTimeout(
        withCorsProxy('https://api.frankfurter.app/latest?from=EUR&to=USD,INR'),
        FETCH_TIMEOUT_MS.standard
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data.rates?.USD > 0) { fxLatest.USD = data.rates.USD; fxLoaded.USD = true; }
        if (data.rates?.INR > 0) { fxLatest.INR = data.rates.INR; fxLoaded.INR = true; }
        updateFXUI(); return;
      }
    } catch { /* fall through */ }

    // ExchangeRate-API (fallback)
    try {
      const resp = await fetchWithTimeout('https://open.er-api.com/v6/latest/EUR', FETCH_TIMEOUT_MS.standard);
      if (resp.ok) {
        const data = await resp.json();
        if (data.rates?.USD > 0) { fxLatest.USD = data.rates.USD; fxLoaded.USD = true; }
        if (data.rates?.INR > 0) { fxLatest.INR = data.rates.INR; fxLoaded.INR = true; }
        updateFXUI(); return;
      }
    } catch { /* fall through */ }

    updateFXUI();
  }

  async function fetchFX() {
    const today = new Date().toISOString().slice(0, 10);
    const url   = `https://api.frankfurter.app/2021-01-01..${today}?from=EUR&to=USD,INR`;
    fxDiagnostics.lastAttempt = new Date().toISOString();

    try {
      const response = await fetchWithTimeout(withCorsProxy(url), FETCH_TIMEOUT_MS.bulk);
      fxDiagnostics.httpStatus = response.status;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const s = _state();
      let usdCount = 0, inrCount = 0;
      for (const [date, rates] of Object.entries(data.rates || {})) {
        if (rates.USD) { s.fxDaily.USD[date] = rates.USD; usdCount++; }
        if (rates.INR) { s.fxDaily.INR[date] = rates.INR; inrCount++; }
      }
      if (usdCount > 50) {
        fxLoaded.USD = true;
        const latest = Object.keys(s.fxDaily.USD).sort().at(-1);
        fxLatest.USD = s.fxDaily.USD[latest];
      }
      if (inrCount > 50) {
        fxLoaded.INR = true;
        const latest = Object.keys(s.fxDaily.INR).sort().at(-1);
        fxLatest.INR = s.fxDaily.INR[latest];
      }
      s.fxLastFetch = Date.now();
      fxDiagnostics.lastSuccess = new Date().toISOString();
      fxDiagnostics.lastError   = null;
      _save(s);
      updateFXUI();
      return true;
    } catch (e) {
      fxDiagnostics.lastError  = e.message;
      fxDiagnostics.errorType  = e.message.includes('timeout') ? 'TIMEOUT' : 'NETWORK_ERROR';
      const cached = Object.keys(_state().fxDaily.USD).length;
      if (!cached) toast('⚠️ FX API failed — using approximate rates. CAGR/XIRR may be inaccurate.', 'error');
      updateFXUI();
      return false;
    }
  }

  // PERF-02: replaced full-history O(n) scan with a 5-day backward walk using a
  // single reused Date object — avoids allocating one Date per history entry.
  function getFxRate(toCurrency, dateStr) {
    if (toCurrency === 'EUR') return 1;
    const history = _state().fxDaily[toCurrency];
    if (history && Object.keys(history).length > 0) {
      if (history[dateStr]) return history[dateStr];
      const d = new Date(dateStr + 'T12:00:00');
      for (let offset = 1; offset <= 5; offset++) {
        d.setDate(d.getDate() - 1);
        const key = d.toISOString().slice(0, 10);
        if (history[key]) return history[key];
      }
    }
    return fxLatest[toCurrency];
  }

  function eurToDisplay(eurAmount, dateStr = null) {
    const currency = _settings().currency;
    if (currency === 'EUR') return eurAmount;
    const rate = dateStr ? getFxRate(currency, dateStr) : fxLatest[currency];
    return eurAmount * rate;
  }

  function usdToEur(usdPrice, dateStr = null) {
    const rate = dateStr ? getFxRate('USD', dateStr) : fxLatest.USD;
    return rate > 0 ? usdPrice / rate : usdPrice;
  }

  function updateFXUI() {
    const s       = _state();
    const allOK   = fxLoaded.USD && fxLoaded.INR;
    const partial = fxLoaded.USD || fxLoaded.INR;
    const histCount = Object.keys(s.fxDaily.USD).length;
    const hasHist   = histCount > 50;

    const fxPill = el('h-fx');
    const combined = el('h-fx-ts-combined');
    if (fxPill && combined) {
      fxPill.className = 'fx-pill ' + (allOK ? 'ok' : partial ? 'load' : 'err');
      const fxText = allOK
        ? `FX: 1€ = $${fmtNum(fxLatest.USD, 4)} · ₹${fmtNum(fxLatest.INR, 1)}`
        : partial ? 'FX: Partial'
        : `FX: ~$${fmtNum(fxLatest.USD, 2)} (approx)`;
      const tsText = s.lastRefreshTS
        ? new Date(s.lastRefreshTS).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })
        : '—';
      combined.textContent = `${fxText}  •  Updated ${tsText}`;
    }

    const chips = el('sp-fx-chips');
    if (chips) {
      const lastDate = Object.keys(s.fxDaily.USD).sort().at(-1) || '—';
      chips.innerHTML = `
        <div class="fx-chip"><span><span class="src">EUR → USD</span></span><strong>1 EUR = ${fmtNum(fxLatest.USD, 4)} USD</strong></div>
        <div class="fx-chip"><span><span class="src">EUR → INR</span></span><strong>1 EUR = ₹${fmtNum(fxLatest.INR, 2)}</strong></div>
        <div class="fx-chip"><span class="src">Last ECB date</span><strong>${lastDate}</strong></div>
        <div class="fx-chip" style="flex-direction:column;align-items:flex-start;gap:2px">
          <span class="src">Historical coverage</span>
          <span style="color:${allOK?'var(--green)':hasHist?'var(--amber)':'var(--red)'};font-size:10px">
            ${allOK ? `${histCount} daily rates` : hasHist ? `${histCount} cached days` : '❌ No data — CAGR/XIRR inaccurate'}
          </span>
        </div>`;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     PRICE ENGINE
     ═══════════════════════════════════════════════════════════════ */

  function getMockPrice(ticker) {
    const base = MOCK_PRICES_USD[ticker] || 50;
    const seed = ticker.split('').reduce((acc, ch, i) => acc + ch.charCodeAt(0) * (i + 3), 0);
    const dayOffset = Math.floor(Date.now() / 86400000) % 97;
    const pctChange = ((seed * 7919 + dayOffset * 1013) % 800 - 400) / 10000;
    return +(base * (1 + pctChange)).toFixed(4);
  }

  function getPrice(ticker) {
    return _state().priceCache[ticker]?.price || getMockPrice(ticker);
  }

  function isCacheValid(ticker) {
    const cached = _state().priceCache[ticker];
    return cached && (Date.now() - cached.ts) < _settings().cacheTTL;
  }

  async function fetchYahoo(ticker) {
    try {
      const url  = withCorsProxy(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`);
      const resp = await fetchWithTimeout(url, FETCH_TIMEOUT_MS.quick);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data  = await resp.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      return (price && price > 0) ? price : null;
    } catch { return null; }
  }

  async function fetchCoinGeckoBatch(tickers) {
    const idMap = {};
    for (const t of tickers) { if (COINGECKO_IDS[t]) idMap[t] = COINGECKO_IDS[t]; }
    if (!Object.keys(idMap).length) return {};
    try {
      const ids  = Object.values(idMap).join(',');
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
    } catch { return {}; }
  }

  async function fetchAlphaVantage(ticker, apiKey) {
    try {
      const resp = await fetchWithTimeout(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${apiKey}`,
        FETCH_TIMEOUT_MS.slow
      );
      const data  = await resp.json();
      const price = parseFloat(data['Global Quote']?.['05. price']);
      return price > 0 ? price : null;
    } catch { return null; }
  }

  async function refreshPrices(force = false) {
    const refreshBtn = el('h-refresh');
    refreshBtn?.classList.add('spin-me');
    setHeaderStatus('load', 'Fetching prices…');

    const s       = _state();
    const tickers = [...new Set(s.transactions.map(t => t.ticker))];
    if (!tickers.length) {
      refreshBtn?.classList.remove('spin-me');
      setHeaderStatus('live', 'No positions');
      return;
    }

    const stale = tickers.filter(t => force || !isCacheValid(t));
    if (!stale.length) {
      refreshBtn?.classList.remove('spin-me');
      setHeaderStatus('live', 'All prices current');
      return;
    }

    const apiKey    = (_settings().apiKey || '').trim();
    let liveCount   = 0;

    // Crypto via CoinGecko
    const cryptoTickers = stale.filter(t => COINGECKO_IDS[t]);
    if (cryptoTickers.length) {
      const cgPrices = await fetchCoinGeckoBatch(cryptoTickers);
      for (const ticker of cryptoTickers) {
        const price = cgPrices[ticker];
        s.priceCache[ticker] = { price: price ? usdToEur(price) : getMockPrice(ticker), ts: Date.now(), src: price ? 'cg' : 'sim' };
        if (price) liveCount++;
      }
    }

    // Stocks/ETFs via Yahoo + optional AV
    const stockTickers = stale.filter(t => !COINGECKO_IDS[t]);
    for (let i = 0; i < stockTickers.length; i++) {
      const ticker = stockTickers[i];
      setHeaderStatus('load', `Fetching ${ticker} (${i + 1}/${stockTickers.length})…`);
      let price = null, src = 'sim';

      if (apiKey) {
        price = await fetchAlphaVantage(ticker, apiKey);
        if (price) { src = 'av'; if (i < stockTickers.length - 1) await sleep(13000); }
      }
      if (!price) {
        price = await fetchYahoo(ticker);
        if (price) src = 'yahoo';
      }

      s.priceCache[ticker] = { price: price ? usdToEur(price) : getMockPrice(ticker), ts: Date.now(), src };
      if (price) liveCount++;
    }

    const total = stale.length;
    if (liveCount === total)    setHeaderStatus('live', `Live prices · ${total} tickers updated`);
    else if (liveCount > 0)     setHeaderStatus('live', `${liveCount}/${total} live · ${total - liveCount} simulated`);
    else                        setHeaderStatus('live', 'All simulated — check internet connection');

    s.lastRefreshTS = Date.now();
    _save(s);
    updateFXUI();
    updateSourceBadge();
    refreshBtn?.classList.remove('spin-me');
    render();
    if (activeDrawer) openDrawer(activeDrawer);
  }

  function updateSourceBadge() {
    const badge = el('h-src-badge');
    if (!badge) return;
    const LIVE = new Set(['av','yahoo','cg']);
    const srcs = Object.values(_state().priceCache).map(c => c.src);
    const allLive = srcs.length > 0 && srcs.every(s => LIVE.has(s));
    const anyLive = srcs.some(s => LIVE.has(s));
    if (allLive)      { badge.className = 'price-src-badge live'; badge.textContent = 'Live'; }
    else if (anyLive) { badge.className = 'price-src-badge sim';  badge.textContent = 'Mixed'; }
    else              { badge.className = 'price-src-badge sim';  badge.textContent = 'Simulated'; }
  }

  /* ═══════════════════════════════════════════════════════════════
     XIRR
     ═══════════════════════════════════════════════════════════════ */

  function calcXIRR(cashflows, dates) {
    if (cashflows.length < 2) return null;
    if (!cashflows.some(c => c < 0) || !cashflows.some(c => c > 0)) return null;

    const baseTime = dates[0].getTime();
    const years    = dates.map(d => (d.getTime() - baseTime) / (365.25 * 24 * 3600 * 1000));

    const EPSILON = 1e-8, MAX_ITER = 300;
    for (const seed of [0.1, 0.0, -0.05, 0.5, 1.0, -0.3, 2.0]) {
      let rate = seed, converged = false;
      for (let iter = 0; iter < MAX_ITER; iter++) {
        let npv = 0, dnpv = 0;
        for (let j = 0; j < cashflows.length; j++) {
          if (years[j] === 0) { npv += cashflows[j]; continue; }
          const df = Math.pow(1 + rate, years[j]);
          npv  +=  cashflows[j] / df;
          dnpv -= years[j] * cashflows[j] / ((1 + rate) * df);
        }
        if (Math.abs(dnpv) < 1e-14) break;
        const next = rate - npv / dnpv;
        if (!isFinite(next) || Math.abs(next) > 1000) break;
        if (Math.abs(next - rate) < EPSILON) { converged = true; rate = next; break; }
        rate = next;
      }
      if (converged && isFinite(rate) && rate > -1) return rate * 100;
    }
    return null;
  }

  function buildCashflows(txs) {
    const cashflows = [], dates = [];
    for (const tx of txs) {
      const displayPrice = eurToDisplay(tx.price, tx.date);
      const total = +tx.qty * displayPrice;
      const fees  = +(tx.fees || 0);
      // BUY: cash out = total + fees (fees increase your cost)
      // SELL: cash in = total - fees (fees reduce your proceeds)
      cashflows.push(tx.type === 'BUY' ? -(total + fees) : (total - fees));
      dates.push(new Date(tx.date + 'T12:00:00'));
    }
    return { cashflows, dates };
  }

  function positionXIRR(allTxs, openLots, currentPriceD) {
    const { cashflows, dates } = buildCashflows(allTxs);
    const remainingQty = openLots.reduce((sum, lot) => sum + lot.qty, 0);
    if (remainingQty > QTY_EPSILON) {
      cashflows.push(remainingQty * currentPriceD);
      dates.push(new Date());
    }
    return calcXIRR(cashflows, dates);
  }

  function portfolioXIRR(allTxs, positions) {
    const { cashflows, dates } = buildCashflows(allTxs);
    const now = new Date();
    for (const pos of Object.values(positions)) {
      if (pos.shares > QTY_EPSILON) { cashflows.push(pos.value); dates.push(now); }
    }
    return calcXIRR(cashflows, dates);
  }

  /* ═══════════════════════════════════════════════════════════════
     PORTFOLIO CALCULATIONS (FIFO + CAGR)
     ═══════════════════════════════════════════════════════════════ */

  function yearsHeld(dateStr, now) {
    return (now - new Date(dateStr + 'T12:00:00')) / (1000 * 60 * 60 * 24 * 365.25);
  }

  function calcCagr(cost, value, years) {
    if (years < MIN_CAGR_YEARS || cost <= 0 || value <= 0) return null;
    return (Math.pow(value / cost, 1 / years) - 1) * 100;
  }

  function guessClass(ticker) {
    if (CRYPTO_TICKERS.has(ticker)) return 'Crypto';
    if (BOND_TICKERS.has(ticker)) return 'Bond';
    if (ETF_TICKERS.has(ticker)) return 'ETF';
    return 'Stock';
  }

  function computePositions() {
    const s = _state();
    // CRITICAL: BUY before SELL on same date — prevents overselling in FIFO
    const sorted = [...s.transactions].sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return (a.type === 'BUY' ? 0 : 1) - (b.type === 'BUY' ? 0 : 1);
    });

    const byTicker = {};
    for (const tx of sorted) {
      if (!byTicker[tx.ticker]) byTicker[tx.ticker] = [];
      byTicker[tx.ticker].push(tx);
    }

    const positions = {};
    const now = new Date();

    for (const [ticker, txs] of Object.entries(byTicker)) {
      const lotQueue = [];
      let realizedGain = 0;
      // Per-sell FIFO gain: tx.id → realized gain for that specific sell transaction
      const sellGainMap = new Map();
      // For Effective Buy Average: track total cash invested and total sale proceeds
      let totalInvested = 0;
      let totalProceeds = 0;

      for (const tx of txs) {
        if (tx.type === 'BUY') {
          const feesPerShare = tx.qty > 0 ? (+(tx.fees || 0)) / +tx.qty : 0;
          lotQueue.push({ qty: +tx.qty, priceEUR: +tx.price + feesPerShare, id: tx.id, date: tx.date, fees: +(tx.fees||0) });
          totalInvested += +tx.qty * eurToDisplay(+tx.price, tx.date);
        } else {
          let remaining = +tx.qty;
          let txGain = 0;
          while (remaining > QTY_EPSILON && lotQueue.length > 0) {
            const lot = lotQueue[0];
            const matched = Math.min(remaining, lot.qty);
            const sellD = eurToDisplay(+tx.price, tx.date);
            const buyD  = eurToDisplay(lot.priceEUR, lot.date);
            const matchedGain = (sellD - buyD) * matched - (+(tx.taxes||0) * matched / +tx.qty);
            txGain        += matchedGain;
            realizedGain  += matchedGain;
            lot.qty   -= matched;
            remaining -= matched;
            if (lot.qty < QTY_EPSILON) lotQueue.shift();
          }
          sellGainMap.set(tx.id, txGain);
          totalProceeds += +tx.qty * eurToDisplay(+tx.price, tx.date);
        }
      }

      let totalShares = 0, totalCostD = 0, weightedYears = 0;
      const openLots = [];

      for (const lot of lotQueue) {
        if (lot.qty < QTY_EPSILON) continue;
        const lotCostD = lot.qty * eurToDisplay(lot.priceEUR, lot.date);
        totalShares   += lot.qty;
        totalCostD    += lotCostD;
        weightedYears += lotCostD * yearsHeld(lot.date, now);
        openLots.push({ ...lot, costDisp: lotCostD, avgYears: yearsHeld(lot.date, now) });
      }

      const currentEUR  = getPrice(ticker);
      const currentDisp = eurToDisplay(currentEUR);
      const marketValue = totalShares * currentDisp;
      const unrealized  = marketValue - totalCostD;
      const avgHoldYears = totalCostD > 0 ? weightedYears / totalCostD : 0;

      // Effective Buy Average = (all cash invested − all sale proceeds) / remaining shares
      // Correctly surfaces hidden realized losses from tax-loss harvesting
      const effectiveBuyAvg = totalShares > 0 ? (totalInvested - totalProceeds) / totalShares : 0;

      positions[ticker] = {
        ticker, txs, openLots,
        shares: totalShares,
        avgCostDisp: totalShares > 0 ? totalCostD / totalShares : 0,  // Open Lots Average (break-even)
        effectiveBuyAvg,                                                // True cost after accounting for all trades
        totalInvested, totalProceeds,
        sellGainMap,   // Map<tx.id, realizedGain> — FIFO-accurate per-sell P&L
        costDisp: totalCostD,
        curEUR: currentEUR,
        curDisp: currentDisp,
        value: marketValue,
        unrealized,
        unrealizedPct: totalCostD > 0 ? (unrealized / totalCostD) * 100 : 0,
        realized: realizedGain,
        totalGain: unrealized + realizedGain,
        cagr: calcCagr(totalCostD, marketValue, avgHoldYears),
        xirr: positionXIRR(txs, openLots, currentDisp),
        avgYears: avgHoldYears,
        cls: s.tickerMeta[ticker]?.cls || guessClass(ticker),
        companyName: s.tickerMeta[ticker]?.companyName || TICKER_NAMES[ticker] || '',
        src: s.priceCache[ticker]?.src || 'sim',
        lastTs: s.priceCache[ticker]?.ts || 0,
      };
    }

    return positions;
  }

  function computeSummary(positions) {
    let totalValue = 0, totalCost = 0, totalRealized = 0, weightedYears = 0;
    let totalFees = 0, totalTaxes = 0;
    const now = new Date(), byClass = {};

    for (const pos of Object.values(positions)) {
      totalValue    += pos.value;
      totalCost     += pos.costDisp;
      totalRealized += pos.realized;
      for (const lot of pos.openLots) weightedYears += lot.costDisp * yearsHeld(lot.date, now);
      const cls = pos.cls;
      if (!byClass[cls]) byClass[cls] = { fees:0, taxes:0, cost:0, value:0, realized:0 };
      byClass[cls].cost  += pos.costDisp;
      byClass[cls].value += pos.value;
      byClass[cls].realized += pos.realized;
    }
    for (const tx of _state().transactions) {
      const f = +(tx.fees||0), t = +(tx.taxes||0);
      totalFees  += f; totalTaxes += t;
      const cls = _state().tickerMeta[tx.ticker]?.cls || guessClass(tx.ticker);
      if (byClass[cls]) { byClass[cls].fees = (byClass[cls].fees||0)+f; byClass[cls].taxes = (byClass[cls].taxes||0)+t; }
    }

    const unrealized = totalValue - totalCost;
    const avgYears   = totalCost > 0 ? weightedYears / totalCost : 0;
    const topPos     = Object.values(positions).sort((a,b) => b.value - a.value)[0];

    return {
      totalValue, totalCost, unrealized,
      unrealizedPct: totalCost > 0 ? (unrealized / totalCost) * 100 : 0,
      realized: totalRealized,
      totalGain: unrealized + totalRealized,
      totalFees, totalTaxes,
      byClass,
      cagr:         calcCagr(totalCost, totalValue, avgYears),
      xirr:         portfolioXIRR(_state().transactions, positions),
      positions:    Object.keys(positions).length,
      avgDaysHeld:  Math.round(avgYears * 365.25),
      concentration: (topPos && totalValue > 0) ? topPos.value / totalValue * 100 : 0,
      netReturn: totalCost > 0 ? (unrealized + totalRealized) / totalCost * 100 : 0,
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     FORMATTING
     ═══════════════════════════════════════════════════════════════ */

  function activeLocale() {
    switch (_settings().currency) {
      case 'USD': return 'en-US';
      case 'INR': return 'en-IN';
      default:    return 'de-DE';
    }
  }

  function activeCurrencyCode() { return _settings().currency || 'EUR'; }
  function currencySymbol()     { return CUR_SYMBOLS[_settings().currency] || '€'; }

  function _fmt(n, opts) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    try { return new Intl.NumberFormat(activeLocale(), opts).format(n); }
    catch { return String(n); }
  }

  function fmtNum(n, places = 2) {
    return _fmt(n, { minimumFractionDigits: places, maximumFractionDigits: places });
  }

  function fmtCurrency(n, decimals = 2) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    try {
      return new Intl.NumberFormat(activeLocale(), {
        style: 'currency', currency: activeCurrencyCode(),
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
      }).format(n);
    } catch { return String(n); }
  }

  function fmtValue(n)   { return fmtCurrency(n, 0); }

  function fmtCompact(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    const sym = currencySymbol();
    if (_settings().currency === 'INR') {
      if (v >= 10000000) return sym + fmtNum(v / 10000000, 2) + ' Cr';
      if (v >= 100000)   return sym + fmtNum(v / 100000,   2) + ' L';
    }
    if (v >= 1000000) return fmtNum(v / 1000000, 2) + ' M ' + sym;
    if (v >= 1000)    return fmtNum(v / 1000,    1) + ' K ' + sym;
    return fmtCurrency(v, 2);
  }

  function fmtPct(n, places = 2) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return (n >= 0 ? '+' : '') + fmtNum(n, places) + ' %';
  }

  function fmtXIRR(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return (v >= 0 ? '+' : '') + fmtNum(v, 1) + ' % XIRR';
  }

  function fmtCAGR(v) {
    if (v === null || v === undefined || !isFinite(v)) return '< 1yr';
    return (v >= 0 ? '+' : '') + fmtNum(v, 1) + ' % p.a.';
  }

  function fmtQty(qty) {
    if (qty === null || qty === undefined) return '—';
    return qty % 1 === 0
      ? _fmt(qty, { maximumFractionDigits: 0 })
      : _fmt(+qty, { minimumFractionDigits: 2, maximumFractionDigits: 15 });
  }

  function decimalSep() {
    return new Intl.NumberFormat(activeLocale()).format(1.1).charAt(1);
  }

  function fmtInputNum(n, places = 2) {
    if (!isFinite(n)) return '';
    return n.toFixed(places).replace('.', decimalSep());
  }

  function parseLocaleFloat(s) {
    if (typeof s !== 'string') return parseFloat(s);
    const str = s.trim(); if (!str) return NaN;
    const eu = activeLocale() === 'de-DE';
    const hasComma = str.includes(','), hasPeriod = str.includes('.');
    let norm;
    if (hasComma && !hasPeriod)        norm = eu ? str.replace(',', '.') : str.replace(/,/g, '');
    else if (hasPeriod && !hasComma)   norm = (eu && str.split('.')[1]?.length <= 3) ? str.replace(/\./g, '') : str;
    else if (hasComma && hasPeriod)    norm = eu ? str.replace(/\./g, '').replace(',', '.') : str.replace(/,/g, '');
    else                               norm = str;
    return parseFloat(norm);
  }

  function fmtDate(s)      { return new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); }
  function fmtDateShort(s) { return new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { month:'short', year:'2-digit' }); }
  function generateId()    { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function timeAgo(ts) {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60)    return 'just now';
    if (sec < 3600)  return Math.floor(sec / 60) + 'm ago';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
    return Math.floor(sec / 86400) + 'd ago';
  }

  /* ── Colour helpers ───────────────────────────────────────────── */

  function tickerColor(ticker) {
    if (ticker === 'BTC') return '#e8732a';
    if (!tickerColorCache[ticker]) {
      const hash = ticker.split('').reduce((acc, ch, i) => acc + ch.charCodeAt(0) * (i + 3), 0);
      tickerColorCache[ticker] = PALETTE[hash % PALETTE.length];
    }
    return tickerColorCache[ticker];
  }

  function tickerInitials(ticker) {
    if (ticker === 'BTC') return '₿';
    if (ticker === 'ETH') return 'Ξ';
    if (ticker === 'SOL') return '◎';
    return ticker.slice(0, 2);
  }

  function clsBadgeHtml(cls) {
    return `<span class="cls-badge ${CLS_CSS[cls] || ''}">${cls}</span>`;
  }

  /* ═══════════════════════════════════════════════════════════════
     CRUD OPERATIONS
     ═══════════════════════════════════════════════════════════════ */

  function addTransaction(tx) {
    const s = _state();
    s.transactions.push({ id: generateId(), ...tx });
    _save(s);
    render();
    toast('Transaction added', 'success');
  }

  function editTransaction(id, updates) {
    const s  = _state();
    const ix = s.transactions.findIndex(t => t.id === id);
    if (ix < 0) return;
    s.transactions[ix] = { ...s.transactions[ix], ...updates };
    _save(s);
    render();
    toast('Transaction updated', 'success');
  }

  function deleteTransaction(id) {
    const s  = _state();
    const ix = s.transactions.findIndex(t => t.id === id);
    if (ix < 0) return;
    const [deleted] = s.transactions.splice(ix, 1);
    s.deletedTransactions = [deleted, ...(s.deletedTransactions || [])].slice(0, MAX_DELETED_HISTORY);
    _save(s);
    render();
    toast('Transaction deleted · Undo available in Settings', 'info');
  }

  function undoDelete() {
    const s = _state();
    if (!s.deletedTransactions?.length) { toast('No deleted transactions to restore', 'warn'); return; }
    const [restored, ...rest] = s.deletedTransactions;
    s.transactions.push(restored);
    s.deletedTransactions = rest;
    _save(s);
    render();
    toast(`Restored ${restored.ticker} transaction from ${restored.date}`, 'success');
  }

  function deletePosition(ticker) {
    const s = _state();
    s.transactions = s.transactions.filter(t => t.ticker !== ticker);
    delete s.priceCache[ticker];
    delete s.tickerMeta[ticker];
    delete tickerColorCache[ticker];
    _save(s);
    render();
    toast(ticker + ' removed', 'info');
  }

  function confirmDeletePos(ticker) {
    const s = _state();
    const count = s.transactions.filter(t => t.ticker === ticker).length;
    confirmAction(
      `Delete ${ticker}?`,
      `Remove all ${count} transaction(s) — cannot be undone.`,
      '⚠️', 'Delete All',
      () => deletePosition(ticker)
    );
  }

  function confirmDelTx(id, ticker, qty) {
    confirmAction(
      'Delete transaction?',
      `Remove ${qty} ${ticker} — cannot be undone.`,
      '🗑', 'Delete',
      () => deleteTransaction(id)
    );
  }

  function restoreTransaction(id) {
    const s = _state();
    if (!Array.isArray(s.deletedTransactions)) return;
    const tx = s.deletedTransactions.find(t => t.id === id);
    if (!tx) return;
    const { _deletedAt, ...clean } = tx;
    s.transactions.push(clean);
    s.deletedTransactions = s.deletedTransactions.filter(t => t.id !== id);
    if (!s.tickerMeta[clean.ticker]) s.tickerMeta[clean.ticker] = { cls: guessClass(clean.ticker) };
    _save(s);
    render();
    toast(clean.ticker + ' transaction restored', 'success');
  }

  function renameTicker(oldTicker) {
    const newRaw = prompt(`Rename ticker "${oldTicker}" to:`, oldTicker);
    if (!newRaw?.trim() || newRaw.trim().toUpperCase() === oldTicker) return;
    const up = newRaw.trim().toUpperCase();
    const s  = _state();
    s.transactions.forEach(t => { if (t.ticker === oldTicker) t.ticker = up; });
    if (s.priceCache[oldTicker]) { s.priceCache[up] = s.priceCache[oldTicker]; delete s.priceCache[oldTicker]; }
    if (s.tickerMeta[oldTicker]) { s.tickerMeta[up] = s.tickerMeta[oldTicker]; delete s.tickerMeta[oldTicker]; }
    if (tickerColorCache[oldTicker]) { tickerColorCache[up] = tickerColorCache[oldTicker]; delete tickerColorCache[oldTicker]; }
    _save(s);
    render();
    toast(`Renamed ${oldTicker} → ${up}`, 'success');
  }

  function clearPriceCache() {
    const s = _state();
    s.priceCache = {};
    _save(s);
    toast('Price cache cleared', 'info');
  }

  /* ═══════════════════════════════════════════════════════════════
     EXPORT / IMPORT
     ═══════════════════════════════════════════════════════════════ */

  function exportData() {
    const s    = _state();
    const safe = { ...s, settings: { ...s.settings, gistToken: '' }, _exported: new Date().toISOString() };
    _triggerDownload(JSON.stringify(safe, null, 2), 'application/json', `portfolio-${new Date().toISOString().slice(0,10)}.json`);
    toast('Portfolio exported', 'success');
  }

  function exportPortfolioCSV() {
    const s = _state();
    if (!s.transactions.length) { toast('No transactions to export', 'warn'); return; }
    const header = `Date,Ticker,Company Name,Type,Quantity,Price EUR,Price ${s.settings.currency},Fees,Taxes,Notes,Asset Class`;
    const rows = [...s.transactions].sort((a,b) => b.date.localeCompare(a.date)).map(tx => {
      const priceD = eurToDisplay(+tx.price, tx.date);
      const cls    = s.tickerMeta[tx.ticker]?.cls || guessClass(tx.ticker);
      const name   = s.tickerMeta[tx.ticker]?.companyName || TICKER_NAMES[tx.ticker] || '';
      const esc    = v => { const str = String(v||''); return (str.includes(',') || str.includes('"')) ? '"'+str.replace(/"/g,'""')+'"' : str; };
      return [tx.date, tx.ticker, esc(name), tx.type, +tx.qty, (+tx.price).toFixed(4), priceD.toFixed(4), (+(tx.fees||0)).toFixed(2), (+(tx.taxes||0)).toFixed(2), esc(tx.notes||''), cls].join(',');
    });
    _triggerDownload([header].concat(rows).join('\n'), 'text/csv;charset=utf-8;', `portfolio_transactions_${new Date().toISOString().slice(0,10)}.csv`);
    toast(`Exported ${s.transactions.length} transactions`, 'success');
  }

  function exportPositionCSV() {
    if (!activeDrawer) return;
    const pos = computePositions()[activeDrawer];
    if (!pos?.txs?.length) { toast('No transactions for ' + activeDrawer, 'warn'); return; }
    const header = `Date,Ticker,Company Name,Type,Quantity,Price EUR,Price ${_settings().currency},Fees,Taxes,Notes,Asset Class`;
    const rows   = pos.txs.map(tx => {
      const priceD = eurToDisplay(+tx.price, tx.date);
      const esc    = v => { const str = String(v||''); return (str.includes(',') || str.includes('"')) ? '"'+str.replace(/"/g,'""')+'"' : str; };
      return [tx.date, pos.ticker, esc(pos.companyName), tx.type, +tx.qty, (+tx.price).toFixed(4), priceD.toFixed(4), (+(tx.fees||0)).toFixed(2), (+(tx.taxes||0)).toFixed(2), esc(tx.notes||''), pos.cls].join(',');
    });
    _triggerDownload([header].concat(rows).join('\n'), 'text/csv;charset=utf-8;', `${pos.ticker}_transactions_${new Date().toISOString().slice(0,10)}.csv`);
    toast(`Exported ${pos.txs.length} transactions for ${pos.ticker}`, 'success');
  }

  function _triggerDownload(content, mimeType, filename) {
    const blob = new Blob([content], { type: mimeType });
    const link = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob), download: filename, style: 'visibility:hidden',
    });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  function triggerImport() {
    const inp = el('import-file');
    if (inp) { inp.value = ''; inp.click(); }
  }

  function importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed.transactions)) throw new Error('Invalid portfolio format');
        confirmAction('Import portfolio?',
          `Replace current data with ${parsed.transactions.length} transactions from file?`,
          '📂', 'Import',
          () => {
            const s = _state();
            const token = s.settings.gistToken, id = s.settings.gistId;
            Object.assign(s, parsed);
            s.settings.gistToken = token;
            s.settings.gistId    = id;
            _save(s);
            render();
            syncSettingsUI();
            applyTheme();
            toast('Portfolio imported', 'success');
          }
        );
      } catch (err) {
        toast('Import failed: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  /* ═══════════════════════════════════════════════════════════════
     GIST SYNC WRAPPERS  (UI-level — calls core/gist.js)
     ═══════════════════════════════════════════════════════════════ */

  function setGistStatus(text, ok = null) {
    const el_ = el('gist-status');
    if (el_) {
      el_.textContent = text;
      el_.style.color = ok === true ? 'var(--green)' : ok === false ? 'var(--red)' : 'var(--muted)';
    }
  }

  function _gistCreds() {
    // BUG-01 fix: read from the canonical _state.gist namespace, not portfolio.settings
    const creds = window.App.State.getGistCredentials();
    return {
      token: (creds.token || '').trim(),
      id:    (creds.id    || '').trim(),
    };
  }

  async function triggerGistSave(silent = false) {
    const { token, id } = _gistCreds();
    if (!token) {
      if (!silent) toast('Add your GitHub token in Settings → Gist Sync', 'error');
      return;
    }
    if (!id && !silent) {
      confirmAction(
        'Create a new Gist?',
        'No Gist ID set. This creates a brand-new Gist. If you already have one, paste its ID in Settings first.',
        '☁️', 'Create new Gist',
        () => _performGistSave(token, id, silent)
      );
      return;
    }
    _performGistSave(token, id, silent);
  }

  async function _performGistSave(token, id, silent = false) {
    if (!silent) setGistStatus('Saving…');
    try {
      // Save the full unified state — Gist stores everything
      const payload = window.App.State.getAll();
      const result  = await window.App.Gist.save(payload, token, id);

      if (!id) {
        // First save — store the new Gist ID in the canonical credential namespace
        window.App.State.setGistCredentials({ id: result.id });
        if (el('cfg-gist-id')) el('cfg-gist-id').value = result.id;
        setGistStatus('Gist created — ID: ' + result.id, true);
      } else {
        if (!silent) setGistStatus('Saved · ' + new Date().toLocaleTimeString(), true);
      }

      // Update last sync timestamp in unified state
      window.App.State.setGistCredentials({ lastSync: new Date().toISOString() });

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
      const parsed = await window.App.Gist.load(token, id);
      if (!Array.isArray(parsed.transactions) && !parsed.portfolio?.transactions) {
        throw new Error('Invalid portfolio format in Gist');
      }
      const txCount = parsed.transactions?.length || parsed.portfolio?.transactions?.length || 0;
      confirmAction('Load from Gist?',
        `Replace current data with ${txCount} transactions from Gist?`,
        '☁️', 'Load',
        () => {
          // BUG-01/02 fix: read from canonical credential namespace before overwriting state
          const { token: currentToken, id: currentId } = window.App.State.getGistCredentials();

          // Support both new unified format and old flat format
          if (parsed.portfolio) {
            // mergeAll() safely handles future module additions/removals — new modules
            // not in the Gist get default state; removed modules are silently ignored.
            window.App.State.mergeAll(parsed);
            // BUG-02 fix: credentials were scrubbed before saving — restore them now
            window.App.State.setGistCredentials({ token: currentToken, id: currentId });
          } else {
            // Legacy flat format — migrate into portfolio namespace
            const s = _state();
            Object.assign(s, parsed);
            s.settings.gistToken = currentToken;
            s.settings.gistId    = currentId;
            _save(s);
          }

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

  function gistClearCredentials() {
    confirmAction(
      'Clear Gist credentials?',
      'Removes token and Gist ID from this browser only. Your GitHub data is untouched.',
      '🔑', 'Clear',
      () => {
        // BUG-01 fix: clear from canonical credential namespace
        window.App.State.clearGistCredentials();
        if (el('cfg-gist-token')) el('cfg-gist-token').value = '';
        if (el('cfg-gist-id'))    el('cfg-gist-id').value    = '';
        setGistStatus('Credentials cleared', null);
        toast('Gist credentials cleared', 'info');
      }
    );
  }

  /**
   * Wipe real portfolio data from localStorage and reload sample/demo data.
   * Called on sign-out so that cached Gist data is not readable without credentials.
   * GitHub Gist is completely untouched — only the local copy is cleared.
   */
  function _clearToSampleData() {
    const s = _state();
    s.transactions        = [];
    s.deletedTransactions = [];
    s.priceCache          = {};
    s.tickerMeta          = {};
    s.lastRefreshTS       = null;
    _save(s);
    seedSampleData(); // guard removed: transactions=[] so seed will run
    render();
  }

  /**
   * Sign out of Gist — clears credentials AND wipes the locally-cached real
   * portfolio data, then loads demo/sample data.
   * This ensures that without a token + Gist ID the real portfolio is never
   * visible, which matters on public hosting (e.g. GitHub Pages).
   * GitHub Gist is completely untouched.
   */
  function signOut() {
    confirmAction(
      'Sign Out?',
      'Your credentials and locally-cached portfolio data will be cleared. Demo data will be shown until you sign in again. Your GitHub Gist is untouched.',
      '🚪', 'Sign Out',
      () => {
        window.App.State.clearGistCredentials();
        _clearToSampleData();
        openCredentialsPopup(() => {});
        toast('Signed out — showing demo data', 'info');
      }
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     CREDENTIALS / LOCK SCREEN
     ═══════════════════════════════════════════════════════════════ */

  function initLockScreen() {
    // BUG-01 fix: read from canonical credential namespace
    const creds = window.App.State.getGistCredentials();
    if (!(creds.token||'').trim() || !(creds.id||'').trim()) {
      openCredentialsPopup(() => {});
    }
  }

  function openCredentialsPopup(callback) {
    _credCallback = callback;
    if (el('lock-token'))   el('lock-token').value   = '';
    if (el('lock-gist-id')) el('lock-gist-id').value = '';
    if (el('cred-hint'))    { el('cred-hint').textContent = ''; el('cred-hint').style.color = 'var(--muted)'; }
    el('cred-ov')?.classList.add('open');
    setTimeout(() => el('lock-token')?.focus(), 80);
  }

  function saveCredentials() {
    const token  = (el('lock-token')?.value   || '').trim();
    const gistId = (el('lock-gist-id')?.value || '').trim();
    const hint   = el('cred-hint');
    if (!token)  { if (hint) { hint.textContent = 'GitHub token is required'; hint.style.color = 'var(--red)'; } return; }
    if (!gistId) { if (hint) { hint.textContent = 'Gist ID is required'; hint.style.color = 'var(--red)'; } return; }

    // BUG-01 fix: write to canonical credential namespace
    window.App.State.setGistCredentials({ token, id: gistId });
    el('cred-ov')?.classList.remove('open');

    // Offer to load from Gist — cancelling shows demo data
    confirmAction(
      'Load from Gist?',
      'Load your saved portfolio from GitHub Gist, or cancel to browse with demo data. You can load from Gist anytime via Refresh.',
      '☁️', 'Load from Gist',
      () => { gistLoad().then(() => { if (_credCallback) _credCallback(); }); }
    );
  }

  function closeCredentialsPopup() {
    el('cred-ov')?.classList.remove('open');
    // If skipped with no credentials, ensure only demo data is visible.
    // This is the privacy guarantee: real Gist data requires a valid token + ID.
    const creds = window.App.State.getGistCredentials();
    const hasAuth = (creds.token || '').trim() && (creds.id || '').trim();
    if (!hasAuth) {
      _clearToSampleData();
    }
    if (_credCallback) { _credCallback(); _credCallback = null; }
  }

  /* ═══════════════════════════════════════════════════════════════
     SETTINGS
     ═══════════════════════════════════════════════════════════════ */

  function syncSettingsUI() {
    const s      = _state();
    // BUG-01 fix: read Gist credentials from canonical namespace
    const creds  = window.App.State.getGistCredentials();
    if (el('cfg-currency'))   el('cfg-currency').value   = s.settings.currency;
    if (el('cfg-cache-ttl'))  el('cfg-cache-ttl').value  = s.settings.cacheTTL / 3600000;
    if (el('cfg-api-key'))    el('cfg-api-key').value    = s.settings.apiKey || '';
    if (el('cfg-gist-token')) el('cfg-gist-token').value = creds.token || '';
    if (el('cfg-gist-id'))    el('cfg-gist-id').value    = creds.id    || '';
    updateStorageStatus();
  }

  function applySettings() {
    const s = _state();
    s.settings.currency = el('cfg-currency')?.value  || s.settings.currency;
    s.settings.cacheTTL = (parseFloat(el('cfg-cache-ttl')?.value) || 4) * 3600000;
    s.settings.apiKey   = (el('cfg-api-key')?.value    || '').trim();
    _save(s);
    // BUG-01 fix: write Gist credentials to canonical namespace, not portfolio.settings
    window.App.State.setGistCredentials({
      token: (el('cfg-gist-token')?.value || '').trim(),
      id:    (el('cfg-gist-id')?.value    || '').trim(),
    });
    render();
    toast('Settings saved', 'success');
  }

  function applyTheme() {
    const theme = _settings().theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    // Sun shown in dark mode (click → go light); Moon shown in light mode (click → go dark)
    const sun  = el('theme-icon-sun');
    const moon = el('theme-icon-moon');
    if (sun)  sun.style.display  = theme === 'dark'  ? '' : 'none';
    if (moon) moon.style.display = theme === 'light' ? '' : 'none';
  }

  function toggleTheme() {
    const s     = _state();
    const next  = s.settings.theme === 'dark' ? 'light' : 'dark';
    s.settings.theme = next;
    _save(s);
    applyTheme();
  }

  /* ═══════════════════════════════════════════════════════════════
     SAMPLE DATA
     ═══════════════════════════════════════════════════════════════ */

  function seedSampleData() {
    const s = _state();
    if (s.transactions.length > 0) return; // Don't overwrite existing data on normal init

    s.transactions = [
      { id: generateId(), date:'2022-03-15', ticker:'AAPL', type:'BUY',  qty:10,  price:155.00, fees:1.50, taxes:0,     notes:'Initial position' },
      { id: generateId(), date:'2022-08-10', ticker:'NVDA', type:'BUY',  qty:5,   price:178.00, fees:1.50, taxes:0,     notes:'' },
      { id: generateId(), date:'2023-01-05', ticker:'BTC',  type:'BUY',  qty:0.1, price:15800,  fees:12.00,taxes:0,     notes:'DCA entry' },
      { id: generateId(), date:'2023-06-20', ticker:'SPY',  type:'BUY',  qty:3,   price:435.00, fees:0,    taxes:0,     notes:'ETF allocation' },
      { id: generateId(), date:'2023-11-01', ticker:'ETH',  type:'BUY',  qty:0.5, price:1650,   fees:5.00, taxes:0,     notes:'' },
      { id: generateId(), date:'2024-02-14', ticker:'AAPL', type:'BUY',  qty:5,   price:182.00, fees:1.50, taxes:0,     notes:'Add to position' },
      { id: generateId(), date:'2024-04-01', ticker:'BTC',  type:'SELL', qty:0.05,price:65000,  fees:8.00, taxes:250.00,notes:'Partial profit take' },
      { id: generateId(), date:'2024-09-15', ticker:'MSFT', type:'BUY',  qty:4,   price:415.00, fees:1.50, taxes:0,     notes:'' },
    ];
    s.tickerMeta = {
      AAPL:{ cls:'Stock', companyName:'Apple Inc.' },
      NVDA:{ cls:'Stock', companyName:'NVIDIA Corp.' },
      BTC: { cls:'Crypto', companyName:'Bitcoin' },
      SPY: { cls:'ETF',    companyName:'SPDR S&P 500 ETF' },
      ETH: { cls:'Crypto', companyName:'Ethereum' },
      MSFT:{ cls:'Stock',  companyName:'Microsoft Corp.' },
    };
    _save(s);
  }

  /* ═══════════════════════════════════════════════════════════════
     TOAST
     ═══════════════════════════════════════════════════════════════ */

  /**
   * ARCH-01 fix: toast is now owned by App.Shell.
   * This wrapper preserves the existing call-site API in portfolio-ui.js.
   */
  function toast(msg, type = 'info') {
    window.App.Shell.toast(msg, type);
  }

  /* ═══════════════════════════════════════════════════════════════
     CONFIRM DIALOG
     ═══════════════════════════════════════════════════════════════ */

  /**
   * ARCH-01 fix: confirmAction / confirmDo / confirmCancel are now owned by App.Shell.
   * These wrappers preserve the existing call-site API in portfolio-ui.js.
   * The in-module `confirmCallback` variable is no longer needed and has been removed.
   */
  function confirmAction(title, body, icon, confirmLabel, onConfirm) {
    window.App.Shell.confirmAction(title, body, icon, confirmLabel, onConfirm);
  }

  function confirmDo()    { window.App.Shell.confirmDo(); }
  function confirmCancel(){ window.App.Shell.confirmCancel(); }

  /* ═══════════════════════════════════════════════════════════════
     HEADER STATUS
     ═══════════════════════════════════════════════════════════════ */

  function setHeaderStatus(state, text) {
    const pill = el('h-status');
    if (!pill) return;
    pill.className = 'status-pill ' + state;
    pill.querySelector?.('.status-text') && (pill.querySelector('.status-text').textContent = text);
    if (!pill.querySelector('.status-text')) pill.textContent = text;
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER ENTRY POINT (delegates to portfolio-ui.js)
     ═══════════════════════════════════════════════════════════════ */

  function render() {
    if (window.App.PortfolioUI?.render) {
      window.App.PortfolioUI.render();
    }
  }

  function openDrawer(ticker) {
    if (window.App.PortfolioUI?.openDrawer) {
      window.App.PortfolioUI.openDrawer(ticker);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     MODULE INIT
     ═══════════════════════════════════════════════════════════════ */

  function init() {
    seedSampleData();
    applyTheme();
    syncSettingsUI();
    updateStorageStatus();
    updateSourceBadge();

    // Setup event listeners
    if (window.App.PortfolioUI?.setupEventListeners) {
      window.App.PortfolioUI.setupEventListeners();
    }

    render();

    // Async data loading — non-blocking
    fetchFxLatest().then(() => render());
    fetchFX();
    refreshPrices();

    // Show credentials popup if Gist token/ID are missing
    initLockScreen();

    console.info('[Portfolio] Module initialised');
  }

  /* ── Register with shell ──────────────────────────────────────── */

  window.App.Shell?.registerModule({
    id: 'portfolio',
    label: 'Portfolio',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
    init,
  });

  /* ── Exports ──────────────────────────────────────────────────── */

  return {
    // Data helpers
    computePositions,
    computeSummary,
    guessClass,
    tickerColor,
    tickerInitials,
    clsBadgeHtml,
    // Formatting
    fmtNum, fmtCurrency, fmtValue, fmtCompact, fmtPct, fmtXIRR, fmtCAGR,
    fmtQty, fmtInputNum, fmtDate, fmtDateShort,
    parseLocaleFloat, decimalSep, generateId, timeAgo,
    currencySymbol, activeLocale, activeCurrencyCode,
    // FX
    eurToDisplay, usdToEur, getFxRate, fxLatest: () => fxLatest, fxLoaded: () => fxLoaded,
    // Math helpers (used by drawer)
    calcXIRR, calcCagr, yearsHeld,
    // Price
    getPrice, getMockPrice, refreshPrices,
    // CRUD
    addTransaction, editTransaction, deleteTransaction, deletePosition,
    confirmDeletePos, confirmDelTx, restoreTransaction,
    undoDelete, renameTicker, clearPriceCache,
    // Export/import
    exportData, exportPortfolioCSV, exportPositionCSV, triggerImport, importData,
    // Gist
    triggerGistSave, gistLoad, gistClearCredentials, signOut,
    // Credentials
    openCredentialsPopup, saveCredentials, closeCredentialsPopup,
    // Settings
    syncSettingsUI, applySettings, applyTheme, toggleTheme,
    // UI helpers
    toast, confirmAction, confirmDo, confirmCancel, setHeaderStatus,
    setGistStatus, updateFXUI, updateStorageStatus, updateGistSaveIndicator, updateSourceBadge,
    // CSV
    csvState: () => Data?.csvState,
    // State helpers
    activeDrawer: () => activeDrawer,
    setActiveDrawer: (t) => { activeDrawer = t; },
    histFilter: () => histFilter,
    setHistFilter: (f) => { histFilter = f; },
    clsFilter: () => clsFilter,
    setClsFilter: (f) => { clsFilter = f; },
    modalType: () => modalType,
    setModalType: (t) => { modalType = t; },
    // Module interface
    render,
    openDrawer,
    init,
    // Constants (read-only)
    PALETTE, LOT_COLORS, CLASS_COLORS, CLS_CSS, CUR_SYMBOLS,
    TICKER_NAMES, COINGECKO_IDS, QTY_EPSILON,
    // Re-expose Data sub-module so portfolio-ui.js can reach it via App.Portfolio.Data
    Data,
  };

})();
