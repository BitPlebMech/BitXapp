'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * PORTFOLIO / UI  —  All rendering, DOM interactions, event wiring
 * ═══════════════════════════════════════════════════════════════════
 *
 * Contains:
 *   • render()          — master render dispatcher
 *   • renderOverview()  — KPI cards + donut charts + analytics table
 *   • renderPositions() — position cards grid
 *   • renderHistory()   — transaction history table
 *   • openDrawer()      — per-position slide-in detail panel
 *   • openModal()       — add/edit transaction modal
 *   • CSV wizard UI     — 3-step import flow
 *   • Settings panel    — settings open/close + FX diagnostics
 *   • setupEventListeners() — wire all UI interactions on first load
 *
 * This module depends on window.App.Portfolio for all business logic.
 * It does NOT call App.State directly — only via App.Portfolio.
 * ═══════════════════════════════════════════════════════════════════
 */
window.App = window.App || {};

window.App.PortfolioUI = (() => {

  /* ── Aliases ──────────────────────────────────────────────────── */
  const P  = () => window.App.Portfolio;      // Business logic
  const PD = () => window.App.Portfolio.Data; // CSV data helpers

  function el(id) { return document.getElementById(id); }

  /* ── Sort state for analytics ─────────────────────────────────── */
  let _anSortKey = 'value';
  let _anSortAsc = false;
  let _anViewMode = 'asset';

  /* ═══════════════════════════════════════════════════════════════
     MASTER RENDER
     ═══════════════════════════════════════════════════════════════ */

  function render() {
    const positions = P().computePositions();
    const summary   = P().computeSummary(positions);
    renderOverview(positions, summary);
    renderPositions(positions);
    renderHistory();
  }

  /* ═══════════════════════════════════════════════════════════════
     OVERVIEW TAB
     ═══════════════════════════════════════════════════════════════ */

  function renderOverview(positions, summary) {
    const rows = Object.values(positions).filter(r => r.shares > P().QTY_EPSILON).sort((a, b) => b.value - a.value);

    const xirrClass = summary.xirr === null ? 'c-muted' : summary.xirr >= 0 ? 'c-green' : 'c-red';
    const cagrClass = summary.cagr === null ? 'c-muted' : summary.cagr >= 0 ? 'c-green' : 'c-red';

    const winners  = rows.filter(r => r.unrealized >= 0).length;
    const winRate  = rows.length ? Math.round(winners / rows.length * 100) : 0;
    const winColor = winRate >= 60 ? 'var(--green)' : winRate >= 40 ? 'var(--amber)' : 'var(--red)';
    const withXIRR = rows.filter(r => r.xirr !== null);
    const bestX    = withXIRR.length ? withXIRR.reduce((a, b) => b.xirr > a.xirr ? b : a) : null;
    const worstX   = withXIRR.length ? withXIRR.reduce((a, b) => b.xirr < a.xirr ? b : a) : null;

    // Mini sparkline
    const st = window.App.State.getPortfolioData();
    const txBuys = [...(st.transactions || [])].filter(t => t.type === 'BUY').sort((a, b) => a.date.localeCompare(b.date));
    function miniSpark(color) {
      if (!txBuys.length) return '';
      const n = 7;
      const pts = Array.from({ length: n }, (_, i) => {
        const d = txBuys[Math.floor(i * txBuys.length / n)].date;
        return (st.transactions || [])
          .filter(t => t.date <= d && t.type === 'BUY')
          .reduce((s, t) => s + t.qty * P().eurToDisplay(t.price, t.date), 0);
      });
      const mn = Math.min(...pts), mx = Math.max(...pts) || 1;
      const norm = pts.map(v => 18 - (v - mn) / (mx - mn + 0.001) * 15);
      const step = 76 / Math.max(n - 1, 1);
      const d = norm.map((y, i) => (i === 0 ? 'M' : 'L') + (2 + i * step).toFixed(1) + ' ' + y.toFixed(1)).join(' ');
      return `<div class="kpi-spark"><svg viewBox="0 0 80 20" height="20" preserveAspectRatio="none">
        <path d="${d}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>
      </svg></div>`;
    }

    // KPI card definitions (matching source exactly)
    const kpis = [
      { label: 'Total Value',    value: P().fmtValue(summary.totalValue),  sub: 'Cost ' + P().fmtValue(summary.totalCost),
        bar: 'linear-gradient(90deg,var(--blue),var(--purple))', delay: '.05s',
        delta: summary.unrealizedPct !== 0 ? (summary.unrealizedPct >= 0 ? '↑ ' : '↓ ') + P().fmtPct(summary.unrealizedPct) + ' total' : null,
        deltaClass: summary.unrealized >= 0 ? 'up' : 'dn',
        spark: miniSpark('var(--blue)'),
        icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>' },
      { label: 'Unrealised P&L', value: (summary.unrealized >= 0 ? '+' : '') + P().fmtValue(summary.unrealized),
        sub: P().fmtPct(summary.unrealizedPct), subClass: summary.unrealized >= 0 ? 'c-green' : 'c-red',
        bar: summary.unrealized >= 0 ? 'var(--green)' : 'var(--red)', delay: '.09s',
        valClass: summary.unrealized >= 0 ? 'c-green' : 'c-red',
        spark: miniSpark(summary.unrealized >= 0 ? 'var(--green)' : 'var(--red)'),
        icon: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>' },
      { label: 'Realised Gains', value: (summary.realized >= 0 ? '+' : '') + P().fmtValue(summary.realized), sub: 'from closed lots',
        bar: summary.realized >= 0 ? 'var(--green)' : 'var(--red)', delay: '.13s',
        valClass: summary.realized >= 0 ? 'c-green' : 'c-red',
        icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
      { label: 'Net P&L', value: ((summary.unrealized + summary.realized) >= 0 ? '+' : '') + P().fmtValue(summary.unrealized + summary.realized),
        sub: 'total realised + unrealised',
        bar: (summary.unrealized + summary.realized) >= 0 ? 'var(--green)' : 'var(--red)', delay: '.15s',
        valClass: (summary.unrealized + summary.realized) >= 0 ? 'c-green' : 'c-red',
        icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
      { label: 'Portfolio CAGR', value: P().fmtCAGR(summary.cagr), sub: (st.settings?.currency || 'EUR') + '-adj. annualised',
        bar: summary.cagr !== null && summary.cagr >= 0 ? 'var(--green)' : 'var(--red)', delay: '.19s',
        valClass: cagrClass, subClass: cagrClass,
        icon: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>' },
      { label: 'Portfolio XIRR', value: P().fmtXIRR(summary.xirr), sub: 'time-weighted returns',
        bar: summary.xirr !== null && summary.xirr >= 0 ? 'var(--green)' : 'var(--red)', delay: '.23s',
        valClass: xirrClass, subClass: xirrClass,
        spark: miniSpark(summary.xirr !== null && summary.xirr >= 0 ? 'var(--green)' : 'var(--muted)'),
        icon: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' },
      { label: 'Win Rate', value: winRate + ' %',
        sub: winners + ' winning · ' + (rows.length - winners) + ' losing',
        bar: winColor, delay: '.27s', valClass: winRate >= 50 ? 'c-green' : 'c-red',
        icon: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' },
      { label: 'Best XIRR', value: bestX ? bestX.ticker : '—',
        sub: bestX ? P().fmtXIRR(bestX.xirr) : '—',
        subClass: bestX && bestX.xirr >= 0 ? 'c-green' : 'c-red',
        valClass: bestX ? '' : 'c-muted',
        bar: 'linear-gradient(90deg,var(--green),var(--blue))', delay: '.31s',
        icon: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' },
      { label: 'Needs Attention', value: (worstX && worstX.ticker !== bestX?.ticker) ? worstX.ticker : '—',
        sub: (worstX && worstX.ticker !== bestX?.ticker) ? P().fmtXIRR(worstX.xirr) : 'all positions healthy',
        subClass: worstX && worstX.xirr < 0 ? 'c-red' : 'c-muted',
        valClass: worstX && worstX.xirr < 0 ? 'c-red' : 'c-muted',
        bar: (worstX && worstX.xirr < 0) ? 'var(--red)' : 'var(--dim)', delay: '.35s',
        icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' },
      { label: 'Avg Hold Time', value: summary.avgDaysHeld > 0 ? (summary.avgDaysHeld < 365 ? summary.avgDaysHeld + 'd' : P().fmtNum(summary.avgDaysHeld/365.25,1) + 'yr') : '—',
        sub: 'weighted by cost basis', bar: 'var(--blue)', delay: '.39s',
        icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
      { label: 'Concentration', value: P().fmtNum(summary.concentration, 1) + ' %',
        sub: 'largest single position', bar: summary.concentration > 40 ? 'var(--amber)' : 'var(--purple)', delay: '.43s',
        valClass: summary.concentration > 40 ? 'c-muted' : '',
        icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' },
    ];

    const kpiGrid = el('ov-kpis');
    if (kpiGrid) {
      kpiGrid.innerHTML = kpis.map(k => `
        <div class="kpi-card" style="animation-delay:${k.delay || '.05s'}">
          <div class="kpi-bar" style="background:${k.bar}"></div>
          <div class="kpi-icon-bg"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${k.icon}</svg></div>
          <div class="kpi-lbl">${k.label}</div>
          <div class="kpi-val ${k.valClass || ''}">${k.value}</div>
          <div class="kpi-sub ${k.subClass || ''}">${k.sub || ''}</div>
          ${k.delta ? `<div class="kpi-delta ${k.deltaClass || 'nt'}">${k.delta}</div>` : ''}
          ${k.spark || ''}
        </div>`).join('');
    }

    // Donuts
    const totalV = rows.reduce((sum, r) => sum + r.value, 0) || 1;
    if (rows.length) {
      drawSVGDonut('donut-asset-svg', 'donut-asset-leg',
        rows.map(r => ({ label: r.ticker, value: r.value, color: P().tickerColor(r.ticker), cls: r.cls, ticker: r.ticker })),
        totalV);
      const byClass = {};
      for (const r of rows) {
        if (!byClass[r.cls]) byClass[r.cls] = { value: 0, color: P().CLASS_COLORS[r.cls] || '#5b9cff' };
        byClass[r.cls].value += r.value;
      }
      drawSVGDonut('donut-class-svg', 'donut-class-leg',
        Object.entries(byClass).map(([cls, d]) => ({ label: cls, value: d.value, color: d.color, cls, ticker: '' })),
        totalV);
    } else {
      const dvAsset = el('donut-asset-svg'); if (dvAsset) dvAsset.innerHTML = '<div style="color:var(--muted);font-size:12px;padding:20px">No positions</div>';
      const dvLeg = el('donut-asset-leg'); if (dvLeg) dvLeg.innerHTML = '';
    }

    // Invested vs Market Value bar chart
    const barContainer = el('ov-bar-chart');
    if (barContainer) {
      const maxVal = Math.max(...rows.map(r => Math.max(r.costDisp, r.value)), 1);
      barContainer.innerHTML = rows.map(r => {
        const invW = (r.costDisp / maxVal * 100).toFixed(1);
        const mktW = (r.value    / maxVal * 100).toFixed(1);
        const color = P().tickerColor(r.ticker);
        const gainColor = r.unrealized >= 0 ? 'var(--green)' : 'var(--red)';
        return `<div class="ov-bar-row">
          <div class="ov-bar-tick" style="color:${color}">${r.ticker}</div>
          <div class="ov-bar-track">
            <div class="ov-bar-pair">
              <div class="ov-bar-pair-lbl">Inv</div>
              <div class="ov-bar-rail"><div class="ov-bar-fill" style="width:${invW}%;background:${color};opacity:.45"></div></div>
              <div class="ov-bar-amt">${P().fmtCompact(r.costDisp)}</div>
            </div>
            <div class="ov-bar-pair">
              <div class="ov-bar-pair-lbl">Mkt</div>
              <div class="ov-bar-rail"><div class="ov-bar-fill" style="width:${mktW}%;background:${color};opacity:.85"></div></div>
              <div class="ov-bar-amt" style="color:var(--text)">${P().fmtCompact(r.value)}</div>
            </div>
          </div>
          <div class="ov-bar-val">
            <span style="color:${gainColor};font-weight:600">${P().fmtPct(r.unrealizedPct)}</span>
            <span style="color:${gainColor}">${r.unrealized >= 0 ? '+' : ''}${P().fmtCompact(r.unrealized)}</span>
          </div>
        </div>`;
      }).join('');
    }

    // Analytics panels
    renderInlineAnalytics(rows, summary);
  }

  function drawSVGDonut(svgId, legendId, slices, total) {
    const cx = 120, cy = 120, outerR = 102, innerR = 60, gap = 0.025;
    let angle = -Math.PI / 2, paths = '';

    for (const slice of slices) {
      const fraction = slice.value / total;
      const sweep    = fraction * Math.PI * 2;
      const sa = angle + gap / 2, ea = angle + sweep - gap / 2;
      if (sweep - gap > 0.001) {
        const x1 = cx + outerR * Math.cos(sa), y1 = cy + outerR * Math.sin(sa);
        const x2 = cx + outerR * Math.cos(ea), y2 = cy + outerR * Math.sin(ea);
        const x3 = cx + innerR * Math.cos(ea), y3 = cy + innerR * Math.sin(ea);
        const x4 = cx + innerR * Math.cos(sa), y4 = cy + innerR * Math.sin(sa);
        const la = sweep > Math.PI ? 1 : 0;
        const click = slice.ticker ? `onclick="App.Portfolio.openDrawer('${slice.ticker}')"` : '';
        paths += `<path d="M${x1} ${y1} A${outerR} ${outerR} 0 ${la} 1 ${x2} ${y2} L${x3} ${y3} A${innerR} ${innerR} 0 ${la} 0 ${x4} ${y4}Z"
          fill="${slice.color}" style="cursor:${slice.ticker?'pointer':'default'};transition:opacity .15s" ${click}
          onmouseover="this.style.opacity='.78'" onmouseout="this.style.opacity='1'">
          <title>${slice.label} · ${P().fmtNum(fraction*100,1)} % · ${P().fmtValue(slice.value)}</title></path>`;
      }
      angle += fraction * Math.PI * 2;
    }

    const svgEl = el(svgId);
    if (!svgEl) return;
    svgEl.innerHTML = `
      <svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" style="width:220px;height:220px;overflow:visible">
        ${paths}
        <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="var(--surf)"/>
        <text x="${cx}" y="${cy-8}" text-anchor="middle" dominant-baseline="middle" fill="var(--text)" font-family="DM Mono,monospace" font-size="11" font-weight="500">${slices.length} ${slices[0]?.cls ? 'Classes' : 'Assets'}</text>
        <text x="${cx}" y="${cy+10}" text-anchor="middle" dominant-baseline="middle" fill="var(--muted)" font-family="DM Mono,monospace" font-size="10">${P().fmtValue(total)}</text>
      </svg>`;

    const legEl = el(legendId);
    if (legEl) legEl.innerHTML = slices.map(s => `
      <div class="leg-row" ${s.ticker ? `onclick="App.Portfolio.openDrawer('${s.ticker}')"` : ''} style="${!s.ticker?'cursor:default':''}">
        <div class="leg-left">
          <div class="leg-dot" style="background:${s.color}"></div>
          <span class="leg-ticker">${s.label}</span>
          ${s.cls ? `<span class="leg-cls-tag ${P().CLS_CSS[s.cls]||'cb-stock'}">${s.cls}</span>` : ''}
        </div>
        <div class="leg-right">
          <span style="color:var(--text)">${P().fmtNum((s.value/total)*100,1)} %</span>
          <span>${P().fmtValue(s.value)}</span>
        </div>
      </div>`).join('');
  }

  /**
   * Renders Position Metrics + Fees & Taxes + Yearly Trading Costs inside #ov-analytics.
   * Mirrors renderInlineAnalytics() from the reference monolith exactly.
   */
  function renderInlineAnalytics(rows, summary) {
    const target = el('ov-analytics');
    if (!target || !rows.length) {
      if (target) target.innerHTML = '';
      return;
    }

    const st = window.App.State.getPortfolioData();
    const currency = st.settings?.currency || 'EUR';

    const sorted = [...rows].sort((a, b) => {
      let av = a[_anSortKey], bv = b[_anSortKey];
      if (_anSortKey === 'ticker') return _anSortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      av = av ?? (_anSortAsc ? Infinity : -Infinity);
      bv = bv ?? (_anSortAsc ? Infinity : -Infinity);
      return _anSortAsc ? av - bv : bv - av;
    });

    function th(key, label) {
      const active = _anSortKey === key;
      return `<th class="${active ? 'an-sort-active' + (_anSortAsc ? ' an-sort-asc' : '') : ''}" onclick="App.PortfolioUI.analyticsSort('${key}')">${label}</th>`;
    }

    // By Class aggregated rows
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
      const tw1 = c.xirrs.reduce((s, x) => s + x.weight, 0);
      c.xirr = tw1 > 0 ? c.xirrs.reduce((s, x) => s + x.xirr * x.weight, 0) / tw1 : null;
      const tw2 = c.cagrs.reduce((s, x) => s + x.weight, 0);
      c.cagr = tw2 > 0 ? c.cagrs.reduce((s, x) => s + x.cagr * x.weight, 0) / tw2 : null;
      c.ticker = c.cls;
      return c;
    });

    const isAsset = _anViewMode === 'asset';
    const tableRows = isAsset ? sorted : classRows;

    function renderRow(r) {
      const gc = r.unrealized >= 0 ? 'var(--green)' : 'var(--red)';
      const xc = r.xirr === null ? 'var(--muted)' : r.xirr >= 0 ? 'var(--green)' : 'var(--red)';
      const cc = r.cagr === null ? 'var(--muted)' : r.cagr >= 0 ? 'var(--green)' : 'var(--red)';
      const nameCol = isAsset
        ? `<span style="color:${P().tickerColor(r.ticker)}">${r.ticker}</span> <span class="cls-badge ${P().CLS_CSS[r.cls]||'cb-stock'}">${r.cls}</span>`
        : `<span class="cls-badge ${P().CLS_CSS[r.cls]||'cb-stock'}">${r.cls}</span> <span style="color:var(--text2);font-size:10px;margin-left:4px">${r.count} position${r.count!==1?'s':''}</span>`;
      const clickAttr = isAsset ? `onclick="App.Portfolio.openDrawer('${r.ticker}')"` : '';
      return `<tr ${clickAttr} style="${isAsset ? 'cursor:pointer' : ''}">
        <td>${nameCol}</td>
        <td style="color:${gc}">${P().fmtPct(r.unrealizedPct)}</td>
        <td style="color:${gc}">${r.unrealized >= 0 ? '+' : ''}${P().fmtValue(r.unrealized)}</td>
        <td style="color:${xc}">${r.xirr !== null ? P().fmtXIRR(r.xirr) : '—'}</td>
        <td style="color:${cc}">${P().fmtCAGR(r.cagr)}</td>
        <td style="color:var(--text)">${P().fmtValue(r.value)}</td>
        <td>${P().fmtValue(r.costDisp)}</td>
      </tr>`;
    }

    // Fees & Taxes by class
    const feesByClass = {};
    for (const tx of (st.transactions || [])) {
      const cls = st.tickerMeta?.[tx.ticker]?.cls || P().guessClass(tx.ticker);
      if (!feesByClass[cls]) feesByClass[cls] = { fees: 0, taxes: 0, cost: 0, value: 0, realized: 0 };
      feesByClass[cls].fees  += P().eurToDisplay(+(tx.fees  || 0), tx.date);
      feesByClass[cls].taxes += P().eurToDisplay(+(tx.taxes || 0), tx.date);
    }
    for (const pos of rows) {
      if (!feesByClass[pos.cls]) feesByClass[pos.cls] = { fees: 0, taxes: 0, cost: 0, value: 0, realized: 0 };
      feesByClass[pos.cls].cost     += pos.costDisp;
      feesByClass[pos.cls].value    += pos.value;
      feesByClass[pos.cls].realized += pos.realized;
    }
    const totalFeesD  = Object.values(feesByClass).reduce((s, d) => s + d.fees, 0);
    const totalTaxesD = Object.values(feesByClass).reduce((s, d) => s + d.taxes, 0);
    const hasFeeData  = totalFeesD > 0 || totalTaxesD > 0;

    // Yearly Trading Costs
    const yearlyData = {};
    for (const tx of (st.transactions || [])) {
      const year = tx.date.slice(0, 4);
      if (!yearlyData[year]) yearlyData[year] = { volume: 0, fees: 0, taxes: 0, realized: 0, txCount: 0 };
      const y = yearlyData[year];
      y.volume += P().eurToDisplay(tx.qty * tx.price, tx.date);
      y.fees   += P().eurToDisplay(+(tx.fees  || 0), tx.date);
      y.taxes  += P().eurToDisplay(+(tx.taxes || 0), tx.date);
      y.txCount++;
    }
    const sellsByYear = {};
    let totalSellVolume = 0;
    for (const tx of (st.transactions || [])) {
      if (tx.type !== 'SELL') continue;
      const year = tx.date.slice(0, 4);
      const vol = P().eurToDisplay(tx.qty * tx.price, tx.date);
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

      <!-- Position Metrics -->
      <div class="panel" style="margin-bottom:12px">
        <div class="panel-hdr">
          <span class="panel-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            Position Metrics
          </span>
          <div style="display:flex;gap:3px">
            <button class="cls-fb ${isAsset ? 'active' : ''}" onclick="App.PortfolioUI.switchAnView('asset')" style="font-size:9px;padding:3px 8px">By Asset</button>
            <button class="cls-fb ${!isAsset ? 'active' : ''}" onclick="App.PortfolioUI.switchAnView('class')" style="font-size:9px;padding:3px 8px">By Class</button>
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
            <tbody>${tableRows.map(r => renderRow(r)).join('')}</tbody>
          </table>
        </div>
      </div>

      <!-- Fees & Taxes by class -->
      ${hasFeeData ? `
      <div class="panel" style="margin-bottom:12px">
        <div class="panel-hdr">
          <span class="panel-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            Fees &amp; Taxes
          </span>
          <span class="panel-badge">${currency} · by asset class</span>
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
                  <td><span class="cls-badge ${P().CLS_CSS[cls]||'cb-stock'}">${cls}</span></td>
                  <td>${P().fmtValue(d.cost)}</td>
                  <td>${P().fmtValue(d.value)}</td>
                  <td style="color:${d.realized>=0?'var(--green)':'var(--red)'}">${d.realized>=0?'+':''}${P().fmtValue(d.realized)}</td>
                  <td style="color:var(--amber)">${d.fees>0?'−'+P().fmtValue(d.fees):'—'}</td>
                  <td style="color:var(--red)">${d.taxes>0?'−'+P().fmtValue(d.taxes):'—'}</td>
                  <td style="color:${net>=0?'var(--green)':'var(--red)'};font-weight:700">${net>=0?'+':''}${P().fmtValue(net)}</td>
                </tr>`;
              }).join('')}
              <tr style="border-top:.5px solid var(--b2)">
                <td style="font-weight:800;color:var(--text)">Total</td>
                <td>${P().fmtValue(summary.totalCost)}</td>
                <td>${P().fmtValue(summary.totalValue)}</td>
                <td style="color:${summary.realized>=0?'var(--green)':'var(--red)'}">${summary.realized>=0?'+':''}${P().fmtValue(summary.realized)}</td>
                <td style="color:var(--amber)">${totalFeesD>0?'−'+P().fmtValue(totalFeesD):'—'}</td>
                <td style="color:var(--red)">${totalTaxesD>0?'−'+P().fmtValue(totalTaxesD):'—'}</td>
                <td style="color:${(summary.realized-totalFeesD-totalTaxesD)>=0?'var(--green)':'var(--red)'};font-weight:700">${(summary.realized-totalFeesD-totalTaxesD)>=0?'+':''}${P().fmtValue(summary.realized-totalFeesD-totalTaxesD)}</td>
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
          <span class="panel-badge">${currency} · for tax planning</span>
        </div>
        <div class="tbl-wrap">
          <table class="an-tbl">
            <thead><tr>
              <th style="text-align:left">Year</th>
              <th>Trades</th><th>Volume Traded</th><th>Fees Paid</th>
              <th>Fees %</th><th>Taxes Paid</th><th>Realised P&L</th><th>Tax Rate</th>
            </tr></thead>
            <tbody>
              ${years.map(year => {
                const y = yearlyData[year];
                const feePct  = y.volume > 0 ? (y.fees / y.volume * 100) : 0;
                const taxRate = y.realized > 0 ? (y.taxes / y.realized * 100) : 0;
                return `<tr>
                  <td style="text-align:left;font-weight:800;color:var(--text)">${year}</td>
                  <td style="color:var(--text)">${y.txCount}</td>
                  <td>${P().fmtValue(y.volume)}</td>
                  <td style="color:var(--amber)">${y.fees > 0 ? '−' + P().fmtValue(y.fees) : '—'}</td>
                  <td style="color:var(--amber)">${y.fees > 0 ? P().fmtNum(feePct, 2) + ' %' : '—'}</td>
                  <td style="color:var(--red)">${y.taxes > 0 ? '−' + P().fmtValue(y.taxes) : '—'}</td>
                  <td style="color:${y.realized >= 0 ? 'var(--green)' : 'var(--red)'}">${y.realized !== 0 ? (y.realized >= 0 ? '+' : '') + P().fmtValue(y.realized) : '—'}</td>
                  <td style="color:${taxRate > 0 ? 'var(--red)' : 'var(--muted)'}">${y.taxes > 0 && y.realized > 0 ? P().fmtNum(taxRate, 1) + ' %' : '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}
    `;
  }

  function analyticsSort(key) {
    if (_anSortKey === key) _anSortAsc = !_anSortAsc;
    else { _anSortKey = key; _anSortAsc = key === 'ticker'; }
    render();
  }

  function switchAnView(mode) {
    _anViewMode = mode;
    render();
  }

  function switchAllocTab(tab) {
    ['asset','class'].forEach(key => {
      el(`atab-${key}`)?.classList.toggle('active', key === tab);
      el(`aview-${key}`)?.classList.toggle('active', key === tab);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     POSITIONS TAB
     ═══════════════════════════════════════════════════════════════ */

  function renderPositions(positions) {
    const QTY_EPS = P().QTY_EPSILON;
    const allRows   = Object.values(positions);
    const activeAll = allRows.filter(r => r.shares > QTY_EPS);
    const cntEl = el('pos-count');
    if (cntEl) cntEl.textContent = activeAll.length;

    const cf = P().clsFilter();
    const filtered      = cf === 'all' ? allRows : allRows.filter(r => r.cls === cf);
    const activeRows    = filtered.filter(r => r.shares > QTY_EPS);
    const liquidatedRows = filtered.filter(r => r.shares <= QTY_EPS);

    const grid = el('pos-grid');
    if (!grid) return;

    if (!filtered.length) {
      grid.innerHTML = `<div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
        <h3>${cf === 'all' ? 'No positions yet' : 'No ' + cf + ' positions'}</h3>
        <p>Click <strong>Add Transaction</strong> to log your first trade.</p></div>`;
      return;
    }

    const totalPortfolioValue = activeRows.reduce((sum, r) => sum + r.value, 0);

    function buildCard(p, i) {
      const color = P().tickerColor(p.ticker);
      const gainColor = p.unrealized >= 0 ? 'var(--green)' : 'var(--red)';
      const isLiquidated = p.shares <= QTY_EPS;
      const isSimulated  = !isLiquidated && (p.src === 'sim' || p.src === 'mock-fb');
      const sourceLabel  = p.src === 'av' ? '🟢 live·AV' : p.src === 'yahoo' ? '🟢 live·YF' : p.src === 'cg' ? '🟢 live·CG' : p.src === 'mock-fb' ? '⚠ fallback' : '⚡ sim';
      const cagrFlag = p.cagr === null ? 'n' : p.cagr >= 0 ? 'g' : 'r';
      const xirrFlag = p.xirr === null ? 'n' : p.xirr >= 0 ? 'g' : 'r';
      const cardStyle = isLiquidated ? 'opacity:0.6;filter:saturate(0.4)' : '';
      const gcClass = f => f === 'n' ? 'c-muted' : f === 'g' ? 'c-green' : 'c-red';

      return `<div class="pos-card" style="animation-delay:${0.04 + i * 0.04}s;${cardStyle}">
        <div class="pos-card-bar" style="background:linear-gradient(90deg,${color}aa,${color}22)"></div>
        ${isSimulated ? `<div style="background:rgba(255,180,0,0.08);border-bottom:0.5px solid rgba(255,180,0,0.25);padding:4px 14px;font-size:9.5px;font-weight:700;color:var(--amber);letter-spacing:0.06em;display:flex;align-items:center;gap:5px;">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          SIMULATED PRICE — API unavailable for ${p.ticker}
        </div>` : ''}
        <div class="pos-card-body">
          <div class="pos-card-head">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="pos-icon" style="background:${color}18;color:${color}">${P().tickerInitials(p.ticker)}</div>
              <div>
                <div class="pos-name-primary">${p.companyName || P().TICKER_NAMES?.[p.ticker] || p.ticker}</div>
                <div class="pos-ticker-secondary"><span style="font-family:var(--font-mono)">${p.ticker}</span><span class="cls-badge ${P().CLS_CSS[p.cls]||'cb-stock'}">${p.cls}</span></div>
              </div>
            </div>
            <div>
              ${isLiquidated
                ? `<div class="pos-price" style="color:var(--muted);font-size:11px">Fully Exited</div>`
                : `<div class="pos-price">${P().fmtCompact(p.curDisp)}</div>
                   <div class="pos-price-ts">${sourceLabel} · ${P().timeAgo(p.lastTs)}</div>`}
            </div>
          </div>
          <div class="pos-metrics">
            ${isLiquidated ? `
            <div class="pm"><div class="pm-lbl">Shares</div><div class="pm-val" style="color:var(--muted)">0</div></div>
            <div class="pm"><div class="pm-lbl">Avg Cost</div><div class="pm-val">${P().fmtCompact(p.avgCostDisp)}</div></div>
            ` : `
            <div class="pm"><div class="pm-lbl">Shares</div><div class="pm-val">${P().fmtQty(p.shares)}</div></div>
            <div class="pm"><div class="pm-lbl">Avg Cost</div><div class="pm-val">${P().fmtCompact(p.avgCostDisp)}</div></div>
            <div class="pm"><div class="pm-lbl">Value</div><div class="pm-val highlight c-text">${P().fmtValue(p.value)}</div></div>
            <div class="pm"><div class="pm-lbl">Unrealised P&L</div><div class="pm-val highlight" style="color:${gainColor}">${p.unrealized >= 0 ? '+' : ''}${P().fmtValue(p.unrealized)}</div></div>
            `}
            <div class="pm"><div class="pm-lbl">Realised P&L</div><div class="pm-val" style="color:${p.realized >= 0 ? 'var(--green)' : 'var(--red)'}">${p.realized >= 0 ? '+' : ''}${P().fmtValue(p.realized)}</div></div>
            <div class="pm"><div class="pm-lbl">Net P&L</div><div class="pm-val" style="color:${(p.unrealized + p.realized) >= 0 ? 'var(--green)' : 'var(--red)'}">${(p.unrealized + p.realized) >= 0 ? '+' : ''}${P().fmtValue(p.unrealized + p.realized)}</div></div>
            ${!isLiquidated ? `
            <div class="pm wide">
              <div class="pm-lbl">Returns</div>
              <div class="xirr-row">
                <div class="xirr-kpi"><span class="lbl">CAGR</span><span class="${gcClass(cagrFlag)}">${P().fmtCAGR(p.cagr)}</span></div>
                <div class="xirr-kpi"><span class="lbl">XIRR</span><span class="${gcClass(xirrFlag)}">${p.xirr !== null ? P().fmtXIRR(p.xirr) : '—'}</span></div>
                <div class="xirr-kpi"><span class="lbl">ABS</span><span style="color:${gainColor}">${P().fmtPct(p.unrealizedPct)}</span></div>
              </div>
            </div>` : ''}
          </div>
        </div>
        <div class="pos-card-foot">
          <div class="pos-actions">
            <button class="pos-btn" onclick="App.Portfolio.openDrawer('${p.ticker}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              Details
            </button>
            ${!isLiquidated ? `<button class="pos-btn" onclick="App.PortfolioUI.openEditModal(null,'${p.ticker}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>` : ''}
            <button class="pos-btn" title="Rename ticker" onclick="App.Portfolio.renameTicker('${p.ticker}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="pos-btn danger" onclick="App.Portfolio.confirmDeletePos('${p.ticker}')">
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

    grid.innerHTML = html;
  }

  function setClsFilter(cls) {
    P().setClsFilter(cls);
    document.querySelectorAll('.cls-fb').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.cls === cls);
    });
    renderPositions(P().computePositions());
  }

  /* ═══════════════════════════════════════════════════════════════
     HISTORY TAB
     ═══════════════════════════════════════════════════════════════ */

  function renderHistory() {
    const tbody = el('hist-body');
    if (!tbody) return;

    const s = window.App.State.getPortfolioData();
    const query  = (el('hist-search')?.value || '').toUpperCase().trim();
    const sortBy = el('hist-sort')?.value || 'date-desc';

    // Update price column header
    const ph = el('hist-price-hdr');
    if (ph) ph.textContent = `Price (${s.settings?.currency || 'EUR'})`;

    let txs = [...(s.transactions || [])];

    const histFilter = P().histFilter();
    if (histFilter === 'buy')  txs = txs.filter(t => t.type === 'BUY');
    if (histFilter === 'sell') txs = txs.filter(t => t.type === 'SELL');
    if (query) txs = txs.filter(t => t.ticker.includes(query));

    const sortFns = {
      'date-desc':  (a, b) => b.date.localeCompare(a.date),
      'date-asc':   (a, b) => a.date.localeCompare(b.date),
      'ticker':     (a, b) => a.ticker.localeCompare(b.ticker),
      'value-desc': (a, b) => (b.qty * b.price) - (a.qty * a.price),
    };
    txs.sort(sortFns[sortBy] || sortFns['date-desc']);

    if (!txs.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--muted)">No transactions found</td></tr>`;
      return;
    }

    tbody.innerHTML = txs.map((tx, i) => {
      const color = P().tickerColor(tx.ticker);
      const isBuy = tx.type === 'BUY';
      const cls   = s.tickerMeta?.[tx.ticker]?.cls || P().guessClass(tx.ticker);
      const currentPriceD = P().eurToDisplay(P().getPrice(tx.ticker));
      const buyPriceD     = P().eurToDisplay(tx.price, tx.date);
      const totalD        = tx.qty * buyPriceD;

      // P&L: unrealised for BUY, realised for SELL
      let plHTML = '—';
      if (isBuy) {
        const pl    = (currentPriceD - buyPriceD) * tx.qty;
        const plPct = buyPriceD > 0 ? ((currentPriceD - buyPriceD) / buyPriceD) * 100 : 0;
        plHTML = `<span class="${pl >= 0 ? 'c-green' : 'c-red'}">${pl >= 0 ? '+' : ''}${P().fmtValue(pl)} <span style="font-size:10px">(${P().fmtPct(plPct)})</span></span>`;
      } else {
        const priorBuys = (s.transactions || []).filter(t => t.ticker === tx.ticker && t.type === 'BUY' && t.date < tx.date);
        if (priorBuys.length > 0) {
          let totalCost = 0, totalShares = 0;
          priorBuys.forEach(b => { totalCost += b.price * b.qty; totalShares += b.qty; });
          const avgCostBasisD = P().eurToDisplay(totalShares > 0 ? totalCost / totalShares : 0, tx.date);
          const pl    = (buyPriceD - avgCostBasisD) * tx.qty;
          const plPct = avgCostBasisD > 0 ? ((buyPriceD - avgCostBasisD) / avgCostBasisD) * 100 : 0;
          plHTML = `<span class="${pl >= 0 ? 'c-green' : 'c-red'}">${pl >= 0 ? '+' : ''}${P().fmtValue(pl)} <span style="font-size:10px">(${P().fmtPct(plPct)})</span></span>`;
        } else {
          plHTML = '<span style="color:var(--dim)">No cost basis</span>';
        }
      }

      return `<tr>
        <td style="color:var(--dim)">${txs.length - i}</td>
        <td style="color:var(--text2)">${P().fmtDate(tx.date)}</td>
        <td><span class="type-badge ${isBuy ? 'buy' : 'sell'}">${tx.type}</span></td>
        <td><span style="font-weight:800;color:${color};font-family:var(--font-ui)">${tx.ticker}</span>${tx.notes ? `<div style="font-size:9px;color:var(--dim)">${tx.notes}</div>` : ''}</td>
        <td><span class="cls-badge ${P().CLS_CSS[cls]||'cb-stock'}">${cls}</span></td>
        <td style="color:var(--text)">${P().fmtQty(tx.qty)}</td>
        <td style="color:var(--text)">${P().fmtCompact(buyPriceD)}</td>
        <td style="color:var(--text)">${P().fmtValue(totalD)}</td>
        <td>${plHTML}</td>
        <td><button class="del-btn" onclick="App.Portfolio.confirmDelTx('${tx.id}','${tx.ticker}',${tx.qty})" title="Delete transaction">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button></td>
      </tr>`;
    }).join('');
  }

  function setHistFilter(filter) {
    P().setHistFilter(filter);
    ['all','buy','sell'].forEach(f => {
      el('f-' + f)?.classList.toggle('active', f === filter);
    });
    renderHistory();
  }

  /* ═══════════════════════════════════════════════════════════════
     DRAWER — Position Detail
     ═══════════════════════════════════════════════════════════════ */

  /* ── Per-lot XIRR helper ─────────────────────────────────────── */
  function lotXIRR(lot, currentPriceD) {
    const buyPriceD = P().eurToDisplay(lot.priceEUR || 0, lot.date);
    return P().calcXIRR(
      [-(lot.qty * buyPriceD), lot.qty * currentPriceD],
      [new Date(lot.date + 'T12:00:00'), new Date()]
    );
  }

  /* ── Canvas helpers ───────────────────────────────────────────── */
  function cssVar(v) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }

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

  /* ── Dumbbell chart ───────────────────────────────────────────── */
  function drawDumbbell(position) {
    const canvas = el('drw-dumbbell');
    if (!canvas) return;

    const lots = position.openLots;
    if (!lots.length) { canvas.style.display = 'none'; return; }
    canvas.style.display = '';

    const ctx = canvas.getContext('2d');
    const now = new Date();

    const INFO_W = 128, INFO_H = 54, INFO_GAP = 10;
    const dpr  = window.devicePixelRatio || 1;
    const cssW = Math.max(canvas.parentElement.clientWidth - 24, 360);
    const ROW_H = 92, PAD_TOP = 34, PAD_BOT = 32, PAD_L = 78, PAD_R = INFO_W + INFO_GAP + 18;
    const cssH = PAD_TOP + lots.length * ROW_H + PAD_BOT;

    canvas.width  = cssW * dpr;
    canvas.height = cssH * dpr;
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const lotData = lots.map(lot => {
      const buyPriceD     = P().eurToDisplay(lot.priceEUR || 0, lot.date);
      const currentPriceD = position.curDisp;
      const years   = P().yearsHeld(lot.date, now);
      const lotCostD  = lot.qty * buyPriceD;
      const lotValueD = lot.qty * currentPriceD;
      return {
        lot, buyPriceD, currentPriceD, years,
        cagr:    P().calcCagr(lotCostD, lotValueD, years),
        xirr:    lotXIRR(lot, currentPriceD),
        gainPct: ((currentPriceD - buyPriceD) / buyPriceD) * 100,
        isUp:    currentPriceD >= buyPriceD,
      };
    });

    const chartW    = cssW - PAD_L - PAD_R;
    const allPrices = lotData.map(d => d.buyPriceD).concat([position.curDisp]);
    const minPrice  = Math.min(...allPrices) * 0.88;
    const maxPrice  = Math.max(...allPrices) * 1.12;
    const priceToX  = p => PAD_L + ((p - minPrice) / (maxPrice - minPrice)) * chartW;

    // Grid lines
    for (let i = 0; i <= 4; i++) {
      const price = minPrice + (i / 4) * (maxPrice - minPrice);
      const x = priceToX(price);
      ctx.strokeStyle = cssVar('--dim'); ctx.lineWidth = 0.8; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x, PAD_TOP - 14); ctx.lineTo(x, cssH - PAD_BOT + 4); ctx.stroke();
      ctx.fillStyle = cssVar('--dim'); ctx.font = '9px DM Mono,monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(P().fmtCompact(price), x, cssH - PAD_BOT + 6);
    }

    // Avg cost line
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

    // Current price line
    const currentX = priceToX(position.curDisp);
    ctx.strokeStyle = 'rgba(255,152,72,.42)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(currentX, PAD_TOP - 20); ctx.lineTo(currentX, cssH - PAD_BOT); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,152,72,.75)'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('Now', currentX, PAD_TOP - 20);

    const maxQty = Math.max(...lots.map(l => l.qty));

    lotData.forEach(({ lot, buyPriceD, years, cagr, xirr, gainPct, isUp }, i) => {
      const rowCenterY = PAD_TOP + i * ROW_H + ROW_H / 2;
      const buyX = priceToX(buyPriceD);
      const gc   = isUp ? '#00dba8' : '#ff3d5a';

      // Row background
      ctx.fillStyle = i % 2 === 0 ? cssVar('--surf2') : 'transparent';
      ctx.fillRect(0, rowCenterY - ROW_H / 2, cssW, ROW_H);

      // Row labels
      ctx.fillStyle = cssVar('--muted'); ctx.font = '500 10px DM Mono,monospace';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText('L' + (i + 1), PAD_L - 10, rowCenterY - 10);
      ctx.fillStyle = cssVar('--dim'); ctx.font = '400 9px DM Mono,monospace';
      ctx.fillText(P().fmtDateShort(lot.date), PAD_L - 10, rowCenterY + 5);

      // Gradient line
      const grad = ctx.createLinearGradient(buyX, 0, currentX, 0);
      grad.addColorStop(0, isUp ? 'rgba(0,219,168,.12)' : 'rgba(255,61,90,.12)');
      grad.addColorStop(1, isUp ? 'rgba(0,219,168,.55)' : 'rgba(255,61,90,.55)');
      ctx.strokeStyle = grad; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(buyX, rowCenterY); ctx.lineTo(currentX, rowCenterY); ctx.stroke();

      // Dot radius
      const sizeRatio = Math.sqrt(lot.qty) / Math.sqrt(maxQty);
      const dotR = Math.min(Math.max(5 + sizeRatio * 7, 5), 12);

      // Buy dot
      ctx.fillStyle = cssVar('--b2'); ctx.beginPath(); ctx.arc(buyX, rowCenterY, dotR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = cssVar('--muted'); ctx.lineWidth = 1.5; ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(buyX, rowCenterY, dotR, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = cssVar('--muted'); ctx.font = '500 10px DM Mono,monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(P().fmtCompact(buyPriceD), buyX, rowCenterY - dotR - 4);
      ctx.fillStyle = cssVar('--dim'); ctx.font = '400 9px DM Mono,monospace'; ctx.textBaseline = 'top';
      ctx.fillText(P().fmtQty(lot.qty), buyX, rowCenterY + dotR + 4);

      // Current price dot
      ctx.fillStyle = cssVar('--orange'); ctx.beginPath(); ctx.arc(currentX, rowCenterY, dotR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = isUp ? 'rgba(0,219,168,.65)' : 'rgba(255,61,90,.65)';
      ctx.lineWidth = 2; ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(currentX, rowCenterY, dotR + 3, 0, Math.PI * 2); ctx.stroke();

      // Info box
      const boxX = currentX + dotR + INFO_GAP + 4;
      const boxY = rowCenterY - INFO_H / 2;
      ctx.strokeStyle = isUp ? 'rgba(0,219,168,.2)' : 'rgba(255,61,90,.2)';
      ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(currentX + dotR + 3, rowCenterY); ctx.lineTo(boxX, rowCenterY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = cssVar('--surf');
      roundedRect(ctx, boxX, boxY, INFO_W, INFO_H, 5); ctx.fill();
      ctx.strokeStyle = isUp ? 'rgba(0,219,168,.28)' : 'rgba(255,61,90,.28)'; ctx.lineWidth = 0.8;
      roundedRect(ctx, boxX, boxY, INFO_W, INFO_H, 5); ctx.stroke();
      ctx.fillStyle = gc; ctx.font = '700 11.5px Cabinet Grotesk,sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText((gainPct >= 0 ? '+' : '') + P().fmtNum(gainPct, 2) + ' %', boxX + 8, boxY + 7);
      ctx.fillStyle = cssVar('--muted'); ctx.font = '400 9.5px DM Mono,monospace';
      ctx.fillText(xirr !== null ? 'XIRR: ' + P().fmtXIRR(xirr) : years < 1 ? 'Held < 1yr' : 'CAGR: ' + P().fmtCAGR(cagr), boxX + 8, boxY + 23);
      ctx.fillStyle = cssVar('--dim'); ctx.font = '400 8.5px DM Mono,monospace';
      ctx.fillText(P().fmtNum(years, 1) + ' yr · L' + (i + 1) + ' · ' + window.App.State.getPortfolioData().settings.currency, boxX + 8, boxY + 38);
    });
  }

  /* ── Position detail drawer ───────────────────────────────────── */
  function openDrawer(ticker) {
    P().setActiveDrawer(ticker);
    const positions = P().computePositions();
    const pos = positions[ticker];
    if (!pos) return;

    const color     = P().tickerColor(ticker);
    const gainColor = pos.unrealized >= 0 ? 'var(--green)' : 'var(--red)';
    const accentBar = `linear-gradient(90deg,${color}cc,${color}44)`;
    const cagrColor = pos.cagr === null ? 'var(--muted)' : pos.cagr >= 0 ? 'var(--green)' : 'var(--red)';
    const xirrColor = pos.xirr === null ? 'var(--muted)' : pos.xirr >= 0 ? 'var(--green)' : 'var(--red)';
    const settings  = window.App.State.getPortfolioData().settings;

    // Header icon
    const icon = el('drw-icon');
    icon.textContent = P().tickerInitials(ticker);
    icon.style.cssText = `background:${color}20;color:${color};width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:15px;font-weight:800;flex-shrink:0`;

    el('drw-ticker').innerHTML = `${ticker} ${P().clsBadgeHtml(pos.cls)}`;
    el('drw-full').textContent = (P().TICKER_NAMES[ticker] || ticker) + ' · ' +
      (pos.src === 'av' ? 'Live · Alpha Vantage' : pos.src === 'yahoo' ? 'Live · Yahoo Finance' : pos.src === 'cg' ? 'Live · CoinGecko' : 'Simulated price');

    const priceHdr = el('drw-price-hdr');
    if (priceHdr) priceHdr.textContent = `Price (${settings.currency})`;

    el('drw-pills').innerHTML = `
      <div class="drw-pill"><span class="lbl">CAGR</span><strong style="color:${cagrColor}">${P().fmtCAGR(pos.cagr)}</strong></div>
      <div class="drw-pill"><span class="lbl">XIRR</span><strong style="color:${xirrColor}">${P().fmtXIRR(pos.xirr)}</strong></div>`;

    // KPI row
    const posFees  = pos.txs.reduce((s, t) => s + (+(t.fees  || 0)), 0);
    const posTaxes = pos.txs.reduce((s, t) => s + (+(t.taxes || 0)), 0);
    const hasFT    = posFees > 0 || posTaxes > 0;
    const kpis = [
      { label: 'Current Price',  value: P().fmtCompact(pos.curDisp),   sub: settings.currency + ' · ' + pos.cls },
      { label: 'Total Shares',   value: P().fmtQty(pos.shares),         sub: pos.openLots.length + ' open lot' + (pos.openLots.length !== 1 ? 's' : '') },
      { label: 'Current Value',  value: P().fmtValue(pos.value),        sub: 'Cost: ' + P().fmtValue(pos.costDisp) },
      { label: 'Unrealised P&L', value: (pos.unrealized >= 0 ? '+' : '') + P().fmtValue(pos.unrealized), sub: P().fmtPct(pos.unrealizedPct), vc: gainColor },
      { label: 'Realised P&L',   value: (pos.realized >= 0 ? '+' : '') + P().fmtValue(pos.realized), sub: 'closed lots', vc: pos.realized >= 0 ? 'var(--green)' : 'var(--red)' },
      ...(hasFT ? [{ label: 'Fees · Taxes', value: posFees > 0 ? '−' + P().fmtValue(posFees) : '—', sub: posTaxes > 0 ? 'Tax: −' + P().fmtValue(posTaxes) : 'No taxes', vc: 'var(--amber)' }] : []),
    ];
    el('drw-kpis').innerHTML = kpis.map(k =>
      `<div class="drw-kpi"><div class="drw-kpi-bar" style="background:${accentBar}"></div>
      <div class="drw-kpi-lbl">${k.label}</div>
      <div class="drw-kpi-val" style="${k.vc ? 'color:' + k.vc : ''}">${k.value}</div>
      <div class="drw-kpi-sub">${k.sub}</div></div>`
    ).join('');

    // Summary bar
    const fxLd = P().fxLoaded();
    el('drw-summary').innerHTML = `
      <span class="dl">Total Gain</span>
      <span class="dv" style="color:${pos.totalGain >= 0 ? 'var(--green)' : 'var(--red)'}">${pos.totalGain >= 0 ? '+' : ''}${P().fmtValue(pos.totalGain)}</span>
      <span class="dsep">·</span>
      <span class="dl">CAGR</span>
      <span class="dv" style="color:${cagrColor}">${P().fmtCAGR(pos.cagr)}</span>
      <span class="dsep">·</span>
      <span class="dl">XIRR</span>
      <span class="dv" style="color:${xirrColor}">${P().fmtXIRR(pos.xirr)}</span>
      <span class="dsep">·</span>
      <span class="dl">Avg hold</span>
      <span class="dv">${P().fmtNum(pos.avgYears, 1)} yr</span>
      <span class="dsep">·</span>
      <span class="dl">FX</span>
      <span class="dv" style="color:var(--blue)">${settings.currency}${fxLd.USD ? ' ✓ hist' : ' approx'}</span>`;

    // Lot distribution bar
    if (pos.openLots.length) {
      el('drw-lot-dist').style.display = '';
      el('drw-dist-track').innerHTML = pos.openLots.map((l, i) => {
        const pct = (l.qty / pos.shares) * 100;
        return `<div class="lot-dist-seg" style="width:${pct}%;background:${P().LOT_COLORS[i % P().LOT_COLORS.length]}"></div>`;
      }).join('');
      el('drw-dist-leg').innerHTML = pos.openLots.map((l, i) =>
        `<div class="lot-dist-item"><div class="lot-dist-dot" style="background:${P().LOT_COLORS[i % P().LOT_COLORS.length]}"></div>L${i + 1}: ${P().fmtQty(l.qty)}</div>`
      ).join('');
    } else {
      el('drw-lot-dist').style.display = 'none';
    }

    // Transactions table
    el('drw-txs').innerHTML = [...pos.txs].sort((a, b) => b.date.localeCompare(a.date)).map((tx, i) => {
      const isBuy     = tx.type === 'BUY';
      const buyPriceD = P().eurToDisplay(tx.price, tx.date);
      const pnl       = isBuy ? (pos.curDisp - buyPriceD) * tx.qty : null;
      const pnlPct    = isBuy && buyPriceD > 0 ? ((pos.curDisp - buyPriceD) / buyPriceD) * 100 : null;
      const fees      = +(tx.fees || 0) + +(tx.taxes || 0);
      return `<tr>
        <td><span class="lot-num" style="background:${color}22;color:${color}">${i + 1}</span></td>
        <td style="text-align:center"><span class="type-badge ${isBuy ? 'buy' : 'sell'}">${tx.type}</span></td>
        <td style="text-align:left;color:var(--text2)">${P().fmtDate(tx.date)}${tx.notes ? `<div style='font-size:9px;color:var(--dim)'>${tx.notes}</div>` : ''}</td>
        <td>${P().fmtQty(tx.qty)}</td>
        <td>${P().fmtCompact(buyPriceD)}</td>
        <td>${P().fmtValue(tx.qty * buyPriceD)}</td>
        <td style="color:var(--amber);font-size:10px">${fees > 0 ? '−' + P().fmtValue(fees) : '—'}</td>
        <td style="color:${pnl === null ? 'var(--muted)' : pnl >= 0 ? 'var(--green)' : 'var(--red)'}">${pnl === null ? '—' : (pnl >= 0 ? '+' : '') + P().fmtValue(pnl)}</td>
        <td style="color:${pnlPct === null ? 'var(--muted)' : pnlPct >= 0 ? 'var(--green)' : 'var(--red)'}">${pnlPct === null ? '—' : P().fmtPct(pnlPct)}</td>
        <td><button class="del-btn" onclick="App.Portfolio.confirmDelTx('${tx.id}','${tx.ticker}',${tx.qty})" title="Delete"><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><line x1='18' y1='6' x2='6' y2='18'/><line x1='6' y1='6' x2='18' y2='18'/></svg></button></td>
      </tr>`;
    }).join('');

    // FIFO open lots table
    const hasFIFO = pos.openLots.length > 0;
    el('drw-fifo-lbl').style.display = hasFIFO ? '' : 'none';
    el('drw-fifo-tbl').style.display = hasFIFO ? '' : 'none';

    if (hasFIFO) {
      el('drw-fifo-body').innerHTML = pos.openLots.map((lot, i) => {
        const buyPriceD   = P().eurToDisplay(lot.priceEUR, lot.date);
        const lotValue    = lot.qty * pos.curDisp;
        const gain        = lotValue - lot.costDisp;
        const gainPct     = lot.costDisp > 0 ? (gain / lot.costDisp) * 100 : 0;
        const lotCagr     = P().calcCagr(lot.costDisp, lotValue, lot.avgYears);
        const lotXirrVal  = lotXIRR(lot, pos.curDisp);
        const lotXirrColor = lotXirrVal === null ? 'var(--muted)' : lotXirrVal >= 0 ? 'var(--green)' : 'var(--red)';
        const lotColor    = P().LOT_COLORS[i % P().LOT_COLORS.length];
        return `<tr>
          <td><span class="lot-num" style="background:${lotColor}22;color:${lotColor}">${i + 1}</span></td>
          <td style="text-align:left;color:var(--text2)">${P().fmtDate(lot.date)}</td>
          <td style="color:var(--text)">${P().fmtQty(lot.qty)}</td>
          <td>${P().fmtCompact(buyPriceD)}</td>
          <td>${P().fmtValue(lot.costDisp)}</td>
          <td style="color:var(--text)">${P().fmtValue(lotValue)}</td>
          <td style="color:${gain >= 0 ? 'var(--green)' : 'var(--red)'}">${gain >= 0 ? '+' : ''}${P().fmtValue(gain)}</td>
          <td><span class="pill ${gain >= 0 ? 'g' : 'r'}">${P().fmtPct(gainPct)}</span></td>
          <td style="color:${lotCagr === null ? 'var(--muted)' : lotCagr >= 0 ? 'var(--green)' : 'var(--red)'}">${P().fmtCAGR(lotCagr)}</td>
          <td style="color:${lotXirrColor}">${P().fmtXIRR(lotXirrVal)}</td>
        </tr>`;
      }).join('');
    }

    // Open drawer
    el('drw-ov').classList.add('open');
    el('drw').classList.add('open');
    document.body.style.overflow = 'hidden';

    // Draw dumbbell after layout settles
    requestAnimationFrame(() => requestAnimationFrame(() => drawDumbbell(pos)));
  }

  function closeDrawer() {
    P().setActiveDrawer(null);
    el('drw-ov')?.classList.remove('open');
    el('drw')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ═══════════════════════════════════════════════════════════════
     MODAL — Add / Edit Transaction
     ═══════════════════════════════════════════════════════════════ */

  let _editingTxId = null;

  function openModal(ticker = null) {
    _editingTxId = null;
    P().setModalType('BUY');
    _resetModalForm();
    if (ticker) _setTickerInModal(ticker);
    el('modal-title') && (el('modal-title').textContent = 'Add Transaction');
    el('f-submit') && (el('f-submit').textContent = 'Add Transaction');
    el('modal-ov')?.classList.add('open');
    el('modal-box')?.classList.add('open');
    setTimeout(() => el('f-ticker')?.focus(), 80);
  }

  function openEditModal(txId, prefillTicker = null) {
    if (txId) {
      // Edit mode
      _editingTxId = txId;
      const s  = window.App.State.getPortfolioData();
      const tx = s.transactions.find(t => t.id === txId);
      if (!tx) return;

      P().setModalType(tx.type);
      _resetModalForm();
      _setTickerInModal(tx.ticker);

      if (el('f-date'))  el('f-date').value  = tx.date;
      if (el('f-qty'))   el('f-qty').value   = P().fmtInputNum(tx.qty, tx.qty % 1 !== 0 ? 8 : 0);
      if (el('f-price')) el('f-price').value  = P().fmtInputNum(tx.price, 4);
      if (el('f-fees'))  el('f-fees').value   = tx.fees  ? P().fmtInputNum(tx.fees, 2)  : '';
      if (el('f-taxes')) el('f-taxes').value  = tx.taxes ? P().fmtInputNum(tx.taxes, 2) : '';
      if (el('f-notes')) el('f-notes').value  = tx.notes || '';
      const cls = s.tickerMeta[tx.ticker]?.cls || P().guessClass(tx.ticker);
      if (el('f-cls')) el('f-cls').value = cls;

      el('modal-title') && (el('modal-title').textContent = 'Edit Transaction');
      el('f-submit') && (el('f-submit').textContent = 'Update Transaction');
    } else if (prefillTicker) {
      // Add new for specific ticker
      _editingTxId = null;
      P().setModalType('BUY');
      _resetModalForm();
      _setTickerInModal(prefillTicker);
      el('modal-title') && (el('modal-title').textContent = 'Add Transaction');
      el('f-submit') && (el('f-submit').textContent = 'Add Transaction');
    }

    el('modal-ov')?.classList.add('open');
    el('modal-box')?.classList.add('open');
  }

  function closeModal() {
    el('modal-ov')?.classList.remove('open');
    el('modal-box')?.classList.remove('open');
    _editingTxId = null;
  }

  function _resetModalForm() {
    ['f-ticker','f-qty','f-price','f-fees','f-taxes','f-notes'].forEach(id => {
      const e = el(id); if (e) e.value = '';
    });
    if (el('f-date')) el('f-date').value = new Date().toISOString().slice(0,10);
    if (el('f-cls'))  el('f-cls').value = 'Stock';
    if (el('f-total-display')) el('f-total-display').textContent = '';

    const mt = P().modalType();
    el('type-buy')?.classList.toggle('is-buy', mt === 'BUY');
    el('type-sell')?.classList.toggle('is-sell', mt === 'SELL');
    if (el('f-taxes-grp')) el('f-taxes-grp').style.display = mt === 'SELL' ? '' : 'none';
  }

  function _setTickerInModal(ticker) {
    if (el('f-ticker')) el('f-ticker').value = ticker.toUpperCase();
    const s   = window.App.State.getPortfolioData();
    const cls = s.tickerMeta[ticker]?.cls || P().guessClass(ticker);
    if (el('f-cls')) el('f-cls').value = cls;
    // Prefill current price
    const curEUR = P().getPrice(ticker);
    if (curEUR && el('f-price')) el('f-price').value = P().fmtInputNum(P().eurToDisplay(curEUR), 4);
  }

  function setType(type) {
    P().setModalType(type);
    el('type-buy')?.classList.toggle('is-buy', type === 'BUY');
    el('type-sell')?.classList.toggle('is-sell', type === 'SELL');
    // Show taxes field only on SELL; hide on BUY
    if (el('f-taxes-grp')) el('f-taxes-grp').style.display = type === 'SELL' ? '' : 'none';
  }

  function validateForm() {
    const qty   = P().parseLocaleFloat(el('f-qty')?.value  || '');
    const price = P().parseLocaleFloat(el('f-price')?.value || '');
    if (!isNaN(qty) && !isNaN(price) && qty > 0 && price > 0) {
      const total = qty * price + P().parseLocaleFloat(el('f-fees')?.value || '0');
      if (el('f-total-display')) el('f-total-display').textContent = `≈ ${P().fmtValue(total)}`;
    }
  }

  function submitTransaction() {
    const ticker = (el('f-ticker')?.value || '').trim().toUpperCase();
    const date   = el('f-date')?.value || '';
    const qty    = P().parseLocaleFloat(el('f-qty')?.value  || '');
    const price  = P().parseLocaleFloat(el('f-price')?.value || '');
    const fees   = P().parseLocaleFloat(el('f-fees')?.value  || '0') || 0;
    const taxes  = P().parseLocaleFloat(el('f-taxes')?.value || '0') || 0;
    const notes  = el('f-notes')?.value || '';
    const cls    = el('f-cls')?.value || 'Stock';
    const type   = P().modalType();

    if (!ticker || !date || !qty || !price) {
      P().toast('Please fill in all required fields', 'error');
      return;
    }

    // Convert display price back to EUR for storage
    const currency = window.App.State.getPortfolioSettings().currency;
    let priceEUR = price;
    if (currency === 'USD') priceEUR = P().usdToEur(price, date);
    else if (currency === 'INR') {
      const rate = P().getFxRate('INR', date);
      priceEUR = rate > 0 ? price / rate : price;
    }

    const feesEUR  = currency === 'EUR' ? fees  : P().usdToEur(fees,  date);
    const taxesEUR = currency === 'EUR' ? taxes : P().usdToEur(taxes, date);

    // Update tickerMeta
    const s = window.App.State.getPortfolioData();
    if (!s.tickerMeta[ticker]) s.tickerMeta[ticker] = {};
    s.tickerMeta[ticker].cls = cls;
    window.App.State.setPortfolioData(s);

    if (_editingTxId) {
      P().editTransaction(_editingTxId, { date, ticker, type, qty, price: priceEUR, fees: feesEUR, taxes: taxesEUR, notes });
    } else {
      P().addTransaction({ date, ticker, type, qty, price: priceEUR, fees: feesEUR, taxes: taxesEUR, notes });
    }

    closeModal();
  }

  /* ═══════════════════════════════════════════════════════════════
     TAB SWITCHING
     ═══════════════════════════════════════════════════════════════ */

  function showTab(tabId, btn) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    el('tab-' + tabId)?.classList.add('active');
    if (btn) btn.classList.add('active');
  }

  /* ═══════════════════════════════════════════════════════════════
     SETTINGS PANEL
     ═══════════════════════════════════════════════════════════════ */

  function openSettings() {
    P().syncSettingsUI();
    el('settings-panel')?.classList.add('open');
    el('sp-ov')?.classList.add('open');
  }

  function closeSettings() {
    el('settings-panel')?.classList.remove('open');
    el('sp-ov')?.classList.remove('open');
  }

  /* ═══════════════════════════════════════════════════════════════
     CSV IMPORT WIZARD
     ═══════════════════════════════════════════════════════════════ */

  function openCsvImport() {
    const csvState = PD()?.csvState;
    if (csvState) {
      csvState.step = 1;
      csvState.rawRows = [];
      csvState.isinMap = {};
      csvState.previewRows = [];
      csvState.dupCount = 0;
    }
    renderCsvStep();
    el('csv-ov')?.classList.add('open');
    el('csv-box')?.classList.add('open');
  }

  function closeCsvImport() {
    el('csv-ov')?.classList.remove('open');
    el('csv-box')?.classList.remove('open');
  }

  function renderCsvStep() {
    const csvState = PD()?.csvState;
    if (!csvState) return;
    // Update step indicator dots
    [1, 2, 3].forEach(n => {
      el('cstep-' + n)?.classList.toggle('active', n === csvState.step);
      el('cstep-' + n)?.classList.toggle('done',   n < csvState.step);
      if (n < 3) el('cline-' + n)?.classList.toggle('done', n < csvState.step);
    });
    if (csvState.step === 1) renderCsvStep1();
    else if (csvState.step === 2) renderCsvStep2();
    else if (csvState.step === 3) renderCsvStep3();
  }

  function renderCsvStep1() {
    const body = el('csv-body');
    if (!body) return;
    body.innerHTML = `
      <div class="csv-step1">
        <div class="csv-drop-zone" id="csv-drop-zone">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <p>Drop a CSV file here or</p>
          <button class="csv-nav-btn" onclick="document.getElementById('csv-file-input').click()">Browse</button>
          <input type="file" id="csv-file-input" accept=".csv,.tsv,.txt" style="display:none">
        </div>
        <div style="margin:16px 0;color:var(--muted);font-size:11px;text-align:center">
          Expected columns: Date · Ticker (or ISIN/WKN) · Type (BUY/SELL) · Quantity · Price · Currency (optional) · Fees (optional)
        </div>
        <textarea id="csv-text-input" placeholder="Or paste CSV text here..." style="width:100%;min-height:120px;background:var(--surf2);border:1px solid var(--b2);border-radius:6px;padding:10px;color:var(--text);font-family:var(--font-mono);font-size:11px;resize:vertical"></textarea>
      </div>`;

    const foot = el('csv-foot');
    if (foot) foot.innerHTML = `
      <div style="flex:1"></div>
      <button class="csv-nav-btn" id="csv-step1-next" onclick="App.PortfolioUI.csvProceedStep1()">
        Next
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="9 18 15 12 9 6"/></svg>
      </button>`;

    // Wire file input
    const fileInput = el('csv-file-input');
    if (fileInput) fileInput.addEventListener('change', function() {
      if (this.files[0]) _readCsvFile(this.files[0]);
    });

    // Drop zone
    const dropZone = el('csv-drop-zone');
    if (dropZone) {
      dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', e => {
        e.preventDefault(); dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) _readCsvFile(e.dataTransfer.files[0]);
      });
    }
  }

  function _readCsvFile(file) {
    const reader = new FileReader();
    reader.onload = e => { if (el('csv-text-input')) el('csv-text-input').value = e.target.result; };
    reader.readAsText(file);
  }

  function csvProceedStep1() {
    const text = el('csv-text-input')?.value || '';
    if (!text.trim()) { P().toast('Please provide CSV data first', 'warn'); return; }
    const csvState = PD()?.csvState;
    if (!csvState) return;
    csvState.rawText = text;
    csvState.rawRows = PD().parseCsvText(text);
    if (!csvState.rawRows.length) { P().toast('No valid rows found — check column names', 'error'); return; }
    // Build ISIN map
    csvState.isinMap = {};
    for (const row of csvState.rawRows) {
      if (row.isin && !row.ticker && !csvState.isinMap[row.isin]) {
        csvState.isinMap[row.isin] = { status:'pending', ticker:'', companyName:'' };
      }
    }
    csvState.step = 2;
    renderCsvStep();
  }

  function renderCsvStep2() {
    const csvState = PD()?.csvState;
    const body = el('csv-body');
    if (!body || !csvState) return;

    const unresolvedISINs = Object.keys(csvState.isinMap);
    body.innerHTML = `
      <div style="margin-bottom:12px;font-size:13px;color:var(--text2)">
        Found <strong>${csvState.rawRows.length}</strong> rows.
        ${unresolvedISINs.length ? `<strong>${unresolvedISINs.length}</strong> ISINs need ticker resolution.` : 'All tickers already resolved — proceed to preview.'}
      </div>
      ${unresolvedISINs.map(isin => `
      <div class="isin-row" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px;background:var(--surf2);border-radius:6px">
        <span style="font-family:var(--font-mono);font-size:12px;min-width:130px">${isin}</span>
        <input type="text" placeholder="Enter ticker" value="${csvState.isinMap[isin].ticker||''}"
          oninput="App.PortfolioUI.setIsinTicker('${isin}', this.value)"
          style="flex:1;background:var(--surf3);border:1px solid var(--b2);border-radius:4px;padding:4px 8px;color:var(--text);font-family:var(--font-mono)">
        <span class="isin-status" style="font-size:10px;color:${csvState.isinMap[isin].status==='ok'?'var(--green)':'var(--muted)'}">
          ${csvState.isinMap[isin].status === 'ok' ? '✓' : csvState.isinMap[isin].status === 'error' ? '✗' : '—'}
        </span>
      </div>`).join('')}`;

    const foot = el('csv-foot');
    if (foot) foot.innerHTML = `
      <button class="csv-nav-btn back" onclick="App.PortfolioUI._csvGoStep(1)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="15 18 9 12 15 6"/></svg>
        Back
      </button>
      <div style="flex:1"></div>
      <button class="csv-nav-btn" onclick="App.PortfolioUI._csvGoStep(3)">
        Preview →
      </button>`;
  }

  function setIsinTicker(isin, ticker) {
    const csvState = PD()?.csvState;
    if (!csvState) return;
    const t = ticker.trim().toUpperCase();
    csvState.isinMap[isin].ticker = t;
    csvState.isinMap[isin].status = t ? 'manual' : 'pending';
    // Also set on the raw rows
    for (const row of csvState.rawRows) {
      if (row.isin === isin && !row.ticker) row.ticker = t;
    }
  }

  function _csvGoStep(n) {
    const csvState = PD()?.csvState;
    if (!csvState) return;
    if (n === 3) {
      PD().buildPreviewRows();
    }
    csvState.step = n;
    renderCsvStep();
  }

  function renderCsvStep3() {
    const csvState = PD()?.csvState;
    const body = el('csv-body');
    if (!body || !csvState) return;

    const importable = csvState.previewRows.filter(r => !r.isDuplicate);
    body.innerHTML = `
      <div class="prev-summary" style="margin-bottom:12px;font-size:12px;color:var(--text2)">
        <strong>${importable.length}</strong> transactions ready to import
        ${csvState.dupCount > 0 ? `· <span style="color:var(--amber)">${csvState.dupCount} duplicate${csvState.dupCount>1?'s':''} will be skipped</span>` : ''}
      </div>
      <div style="overflow-x:auto">
        <table class="prev-tbl an-tbl" style="font-size:11px">
          <thead><tr><th>Date</th><th>Ticker</th><th>Type</th><th>Qty</th><th>Price EUR</th><th>Fee</th><th>Class</th><th>Status</th></tr></thead>
          <tbody>
            ${csvState.previewRows.map(r => `
            <tr style="${r.isDuplicate?'opacity:0.5':''}">
              <td>${r.dateISO}</td>
              <td style="font-weight:700;color:var(--text)">${r.ticker}</td>
              <td><span class="type-badge ${r.type==='BUY'?'buy':'sell'}">${r.type}</span></td>
              <td>${r.shares}</td>
              <td>${new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',minimumFractionDigits:2}).format(r.priceEUR)}</td>
              <td style="color:var(--muted)">${r.fee>0?new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(r.fee):'—'}</td>
              <td><span class="cls-badge ${P().CLS_CSS[r.cls]||''}" style="font-size:9px">${r.cls}</span></td>
              <td>${r.isDuplicate?'<span style="color:var(--amber);font-size:9px">DUPLICATE</span>':'<span style="color:var(--green);font-size:9px">✓</span>'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    const foot = el('csv-foot');
    if (foot) foot.innerHTML = `
      <button class="csv-nav-btn back" onclick="App.PortfolioUI._csvGoStep(2)">← Back</button>
      <div style="flex:1"></div>
      <button class="csv-nav-btn import" onclick="App.PortfolioUI.csvExecuteImport()" ${importable.length>0?'':'disabled'}>
        Import ${importable.length} Transaction${importable.length!==1?'s':''}
      </button>`;
  }

  function csvExecuteImport() {
    const csvState = PD()?.csvState;
    if (!csvState) return;
    const importable = csvState.previewRows.filter(r => !r.isDuplicate);
    if (!importable.length) return;

    const s = window.App.State.getPortfolioData();
    importable.forEach(r => {
      if (!s.tickerMeta[r.ticker]) s.tickerMeta[r.ticker] = {};
      s.tickerMeta[r.ticker].cls = r.cls;
      if (r.companyName) s.tickerMeta[r.ticker].companyName = r.companyName;
      s.transactions.push({
        id: P().generateId(), date: r.dateISO, ticker: r.ticker,
        type: r.type, qty: r.shares, price: r.priceEUR,
        fees: r.fee || 0, taxes: r.tax || 0, notes: r.notes || '',
      });
    });

    window.App.State.setPortfolioData(s);
    render();
    closeCsvImport();

    const msg = csvState.dupCount > 0
      ? `Imported ${importable.length} transactions (${csvState.dupCount} duplicates skipped)`
      : `Imported ${importable.length} transactions`;
    P().toast(msg, 'success');
  }

  /* ── Ticker verify (modal) ────────────────────────────────────── */
  function _verifyTicker() {
    const raw    = (el('f-ticker')?.value || '').trim().toUpperCase();
    const hint   = el('f-ticker-hint');
    const prev   = el('f-company-preview');
    if (!raw) { if (hint) hint.textContent = ''; if (prev) prev.textContent = ''; return; }

    const s    = window.App.State.getPortfolioData();
    const name = s.tickerMeta[raw]?.companyName || P().TICKER_NAMES[raw] || '';
    const cls  = s.tickerMeta[raw]?.cls || P().guessClass(raw);

    if (name) {
      if (prev) { prev.textContent = name; prev.style.color = 'var(--text2)'; }
      if (hint) { hint.textContent = '✓ Recognised'; hint.style.color = 'var(--green)'; }
    } else {
      if (prev) prev.textContent = '';
      if (hint) { hint.textContent = 'Unknown ticker — will be added on save'; hint.style.color = 'var(--muted)'; }
    }
    // Auto-fill class and price
    if (el('f-cls')) el('f-cls').value = cls;
    const curEUR = P().getPrice(raw);
    if (curEUR && el('f-price')) el('f-price').value = P().fmtInputNum(P().eurToDisplay(curEUR), 4);
    validateForm();
  }

  /* ═══════════════════════════════════════════════════════════════
     EVENT LISTENERS
     ═══════════════════════════════════════════════════════════════ */

  function setupEventListeners() {
    // Header
    el('h-refresh')?.addEventListener('click', () => P().refreshPrices(true));
    el('h-settings-btn')?.addEventListener('click', openSettings);
    el('h-gist-save')?.addEventListener('click', () => P().triggerGistSave(false));
    el('h-signout-btn')?.addEventListener('click', () => P().signOut());
    el('theme-toggle')?.addEventListener('click', P().toggleTheme);
    el('h-currency')?.addEventListener('change', function() {
      const s = window.App.State.getPortfolioData();
      s.settings.currency = this.value;
      window.App.State.setPortfolioData(s);
      render();
    });

    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', function() { showTab(this.dataset.tab, this); });
    });

    // Allocation tabs
    el('atab-asset')?.addEventListener('click', () => switchAllocTab('asset'));
    el('atab-class')?.addEventListener('click', () => switchAllocTab('class'));

    // Position filters
    ['all','Stock','ETF','Crypto','Bond','MF'].forEach(cls => {
      const btn = el('clf-' + cls);
      if (btn) {
        btn.dataset.cls = cls;
        btn.addEventListener('click', () => setClsFilter(cls));
      }
    });

    // Position toolbar
    el('btn-export-csv')?.addEventListener('click', P().exportPortfolioCSV);
    el('btn-import-csv')?.addEventListener('click', openCsvImport);
    el('btn-add-transaction')?.addEventListener('click', () => openModal());

    // History filters
    el('f-all')?.addEventListener('click', () => setHistFilter('all'));
    el('f-buy')?.addEventListener('click', () => setHistFilter('buy'));
    el('f-sell')?.addEventListener('click', () => setHistFilter('sell'));
    el('hist-search')?.addEventListener('input', renderHistory);
    el('hist-sort')?.addEventListener('change', renderHistory);

    // Modal — type toggle
    el('type-buy')?.addEventListener('click', () => setType('BUY'));
    el('type-sell')?.addEventListener('click', () => setType('SELL'));

    // Modal — identifier mode tabs (Ticker / ISIN / WKN)
    ['ticker', 'isin', 'wkn'].forEach(mode => {
      el('id-' + mode)?.addEventListener('click', () => {
        document.querySelectorAll('.id-tab').forEach(b => b.classList.remove('active'));
        el('id-' + mode)?.classList.add('active');
        const placeholders = { ticker: 'e.g. AAPL', isin: 'e.g. US0378331005', wkn: 'e.g. 865985' };
        if (el('f-ticker')) el('f-ticker').placeholder = placeholders[mode];
        if (el('f-ticker-hint')) el('f-ticker-hint').textContent = '';
        if (el('f-company-preview')) el('f-company-preview').textContent = '';
      });
    });

    // Modal — verify button and quick-select tickers
    el('f-verify')?.addEventListener('click', _verifyTicker);
    el('f-ticker')?.addEventListener('keydown', e => { if (e.key === 'Enter') _verifyTicker(); });
    document.querySelectorAll('.qt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ticker = btn.textContent.trim();
        if (el('f-ticker')) el('f-ticker').value = ticker;
        // Reset to Ticker mode when quick-selecting
        document.querySelectorAll('.id-tab').forEach(b => b.classList.remove('active'));
        el('id-ticker')?.classList.add('active');
        if (el('f-ticker')) el('f-ticker').placeholder = 'e.g. AAPL';
        _verifyTicker();
      });
    });

    // Modal — form inputs
    el('f-qty')?.addEventListener('input', validateForm);
    el('f-price')?.addEventListener('input', validateForm);
    el('f-fees')?.addEventListener('input', validateForm);
    el('f-taxes')?.addEventListener('input', validateForm);
    el('f-ticker')?.addEventListener('input', function() { this.value = this.value.toUpperCase(); validateForm(); });
    el('f-submit')?.addEventListener('click', submitTransaction);
    el('modal-cancel')?.addEventListener('click', closeModal);
    el('modal-x-btn')?.addEventListener('click', closeModal);
    el('modal-ov')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

    // CSV modal close
    el('csv-x-btn')?.addEventListener('click', closeCsvImport);
    el('csv-ov')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeCsvImport(); });

    // Drawer close
    el('drw-ov')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeDrawer(); });
    el('drw-x')?.addEventListener('click', closeDrawer);

    // Settings overlay click-outside
    el('sp-ov')?.addEventListener('click', closeSettings);

    // Confirm dialog
    el('cd-confirm')?.addEventListener('click', P().confirmDo);
    document.querySelectorAll('.cancel-btn').forEach(btn => btn.addEventListener('click', P().confirmCancel));

    // Settings panel
    el('settings-close')?.addEventListener('click', closeSettings);
    el('sp-save')?.addEventListener('click', P().applySettings);
    el('gist-load-btn')?.addEventListener('click', P().gistLoad);
    el('gist-clear-btn')?.addEventListener('click', P().gistClearCredentials);
    el('sp-export')?.addEventListener('click', P().exportData);
    el('sp-export-csv')?.addEventListener('click', P().exportPortfolioCSV);
    el('sp-import')?.addEventListener('click', P().triggerImport);
    el('sp-clear-cache')?.addEventListener('click', P().clearPriceCache);
    el('sp-undo-delete')?.addEventListener('click', P().undoDelete);
    el('sp-reset')?.addEventListener('click', () => P().confirmAction(
      'Factory Reset', 'Delete ALL transactions and reset to defaults?', '⚠️', 'Reset',
      () => { window.App.State.resetAll(); render(); P().toast('All data cleared', 'info'); }
    ));

    // Import file input
    el('import-file')?.addEventListener('change', function() {
      if (this.files[0]) P().importData(this.files[0]);
    });

    // Credentials popup
    el('cred-save-btn')?.addEventListener('click', P().saveCredentials);
    el('cred-skip-btn')?.addEventListener('click', P().closeCredentialsPopup);
    el('lock-token')?.addEventListener('keydown', e => { if (e.key === 'Enter') P().saveCredentials(); });
    el('lock-gist-id')?.addEventListener('keydown', e => { if (e.key === 'Enter') P().saveCredentials(); });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (el('modal-box')?.classList.contains('open'))    closeModal();
        else if (el('csv-box')?.classList.contains('open')) closeCsvImport();
        else if (el('drw')?.classList.contains('open')) closeDrawer();
        else if (el('settings-panel')?.classList.contains('open')) closeSettings();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); openModal(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') { e.preventDefault(); P().refreshPrices(true); }
    });
  }

  /* ── Expose escape handler for app-shell ─────────────────────── */
  function handleEscape() {
    if (el('modal-box')?.classList.contains('open'))    closeModal();
    else if (el('drw')?.classList.contains('open')) closeDrawer();
    else if (el('settings-panel')?.classList.contains('open')) closeSettings();
  }

  /* ── Exports ──────────────────────────────────────────────────── */

  return {
    render,
    // Overview
    analyticsSort,
    switchAnView,
    switchAllocTab,
    // Positions
    setClsFilter,
    // History
    setHistFilter,
    renderHistory,
    // Drawer
    openDrawer,
    closeDrawer,
    // Modal
    openModal,
    openEditModal,
    closeModal,
    setType,
    validateForm,
    submitTransaction,
    // Tab
    showTab,
    // Settings
    openSettings,
    closeSettings,
    // CSV wizard
    openCsvImport,
    closeCsvImport,
    csvProceedStep1,
    setIsinTicker,
    _csvGoStep,
    csvExecuteImport,
    // Shell interface
    setupEventListeners,
    handleEscape,
  };

})();
