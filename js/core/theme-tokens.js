'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * CORE / THEME-TOKENS  —  Shared colour constants
 * ═══════════════════════════════════════════════════════════════════
 *
 * Single source of truth for all chart/UI colour palettes that were
 * previously duplicated across portfolio.js and ember.js.
 *
 * Modules should read from here rather than defining their own palettes:
 *
 *   const { PALETTE, LOT_COLORS, SPINE_PALETTE } = window.App.ThemeTokens;
 *
 * CSS design tokens (--blue, --green, etc.) live in bitxapp-base.css
 * and are separate from these JS chart colours.
 * ═══════════════════════════════════════════════════════════════════
 */

window.App = window.App || {};

window.App.ThemeTokens = Object.freeze({

  /* ── Portfolio chart palette ────────────────────────────────────
   * 14 hues spanning the full wheel (red zone excluded).
   * Stride-7 interleave: adjacent indices are always ~180° apart,
   * so two tickers with nearby hash values always look different.
   *
   * Hue order:  orange(20) yellow(48) lime(80) green(142) emerald(160)
   *   teal(178) cyan(190) blue(214) indigo(239) violet(258) purple(271)
   *   fuchsia(289) pink(330) rose(350)
   * After stride-7 interleave: [0,7,1,8,2,9,3,10,4,11,5,12,6,13]
   * ─────────────────────────────────────────────────────────────── */
  PALETTE: Object.freeze([
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
  ]),

  /* ── FIFO lot colours ───────────────────────────────────────────
   * Used to distinguish individual purchase lots in lot-detail views.
   * ─────────────────────────────────────────────────────────────── */
  LOT_COLORS: Object.freeze([
    '#5b9cff', '#00dba8', '#a07cf8', '#ffaa20', '#ff6b9d',
    '#00d4ff', '#ff9848', '#ff3d5a', '#39e88e', '#e879f9',
  ]),

  /* ── Asset class colours ────────────────────────────────────────
   * Per asset class: used for donut charts and class badges.
   * ─────────────────────────────────────────────────────────────── */
  CLASS_COLORS: Object.freeze({
    Stock:  '#5b9cff',
    ETF:    '#a07cf8',
    Crypto: '#e8732a',
    Bond:   '#00d4ff',
    MF:     '#00dba8',
  }),

  /* ── Asset class CSS badge mappings ────────────────────────────── */
  CLS_CSS: Object.freeze({
    Stock:  'cb-stock',
    ETF:    'cb-etf',
    Crypto: 'cb-crypto',
    Bond:   'cb-bond',
    MF:     'cb-mf',
  }),

  /* ── Currency symbols ───────────────────────────────────────────── */
  CUR_SYMBOLS: Object.freeze({
    EUR: '€',
    USD: '$',
    INR: '₹',
  }),

  /* ── Ember book-spine palette ───────────────────────────────────
   * 10 vibrant colours for Kindle/book spine display in Ember.
   * Distinct from PALETTE — warmer, more saturated tones.
   * ─────────────────────────────────────────────────────────────── */
  SPINE_PALETTE: Object.freeze([
    '#E86A4A', // coral
    '#4AB5E8', // sky blue
    '#A8C97F', // sage green
    '#9B7FE8', // lavender
    '#E8A14A', // amber orange
    '#4AE8C9', // teal
    '#E87F9B', // rose
    '#7FA8E8', // periwinkle
    '#5BD178', // mint green
    '#D17FE8', // purple
  ]),

});
