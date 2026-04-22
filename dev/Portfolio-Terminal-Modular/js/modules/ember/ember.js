'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * EMBER MODULE  —  Business logic & state management
 * ═══════════════════════════════════════════════════════════════════
 *
 * Responsibilities:
 *   • CRUD for sources (books) and highlights
 *   • Import orchestration — calls ember-data.js parser, deduplicates
 *   • Daily review — date-seeded shuffle, consistent within a day
 *   • GitHub Gist sync — saves full unified state (all modules)
 *   • App.Shell registration — lazy init on first sidebar click
 *
 * DATA FLOW:
 *   1. init()          → App.State.getEmberData() → seed if empty
 *   2. importParsed()  → dedup by hash → App.State.setEmberData()
 *   3. deleteSource()  → cascades to highlights → setEmberData()
 *   4. triggerGistSave() → App.Gist.save(App.State.getAll(), …)
 * ═══════════════════════════════════════════════════════════════════
 */
window.App = window.App || {};

window.App.Ember = window.App.Ember || {};

window.App.Ember = (() => {

  // Preserve ember-data.js sub-module reference
  const _existing = window.App.Ember;

  /* ── Spine colour palette ─────────────────────────────────────── */

  /**
   * 10 distinct, hand-picked colours assigned sequentially to books on import.
   * Kept in sync with the identical constant in ember-ui.js.
   */
  const SPINE_PALETTE = [
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
  ];

  /* ── State accessors ──────────────────────────────────────────── */

  function _data()    { return window.App.State.getEmberData(); }
  function _save(d)   { window.App.State.setEmberData(d); }
  function ED()       { return window.App.Ember.Data; }

  /* ═══════════════════════════════════════════════════════════════
     SOURCES (Books / PDFs)
     ═══════════════════════════════════════════════════════════════ */

  function getSources() {
    return _data().sources;
  }

  function getSource(sourceId) {
    return _data().sources.find(s => s.id === sourceId) || null;
  }

  /**
   * Delete a source and ALL its highlights (cascade).
   */
  function deleteSource(sourceId) {
    const d = _data();
    d.sources    = d.sources.filter(s => s.id !== sourceId);
    d.highlights = d.highlights.filter(h => h.sourceId !== sourceId);
    _save(d);
    window.App.EmberUI?.render();
    _toast(`Book removed`, 'info');
  }

  /* ═══════════════════════════════════════════════════════════════
     HIGHLIGHTS
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Get highlights — all or filtered by sourceId.
   */
  function getHighlights(sourceId = null) {
    const d = _data();
    return sourceId
      ? d.highlights.filter(h => h.sourceId === sourceId)
      : d.highlights;
  }

  /**
   * Delete a single highlight. Updates source.highlightCount.
   */
  function deleteHighlight(highlightId) {
    const d = _data();
    d.highlights = d.highlights.filter(h => h.id !== highlightId);
    // Keep denormalised counts accurate
    d.sources = d.sources.map(s => ({
      ...s,
      highlightCount: d.highlights.filter(h => h.sourceId === s.id).length,
    }));
    _save(d);
    window.App.EmberUI?.renderActiveTab();
  }

  /* ═══════════════════════════════════════════════════════════════
     IMPORT
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Import parsed source objects from ember-data.js.
   * Deduplicates by hash, creates/updates source records.
   *
   * @param {Array} parsedSources  — output of App.Ember.Data.parse()
   * @returns {{ imported: number, skipped: number, sourceNames: string[] }}
   */
  function importParsed(parsedSources) {
    const d = _data();
    const existingHashes = new Set(d.highlights.map(h => h.hash));

    let totalImported = 0;
    let totalSkipped  = 0;
    const sourceNames = [];

    for (const src of parsedSources) {
      // Find existing source by title+author fingerprint
      const fingerprint = `${src.title}||${src.author}`;
      let source = d.sources.find(s => `${s.title}||${s.author}` === fingerprint);

      if (!source) {
        // Assign next palette colour not already used by an existing source
        const usedColors = new Set(d.sources.map(s => s.color).filter(Boolean));
        const spineColor = SPINE_PALETTE.find(c => !usedColors.has(c))
                           || SPINE_PALETTE[d.sources.length % SPINE_PALETTE.length];

        source = {
          id:             ED().genId('src'),
          title:          src.title,
          author:         src.author,
          format:         src.format,
          color:          spineColor,
          importedAt:     new Date().toISOString(),
          lastImportAt:   new Date().toISOString(),
          highlightCount: 0,
        };
        d.sources.push(source);
      } else {
        source.lastImportAt = new Date().toISOString();
      }

      let imported = 0;
      let skipped  = 0;

      for (const hl of src.highlights) {
        if (existingHashes.has(hl.hash)) {
          skipped++;
          continue;
        }
        const highlight = {
          id:        ED().genId('hl'),
          sourceId:  source.id,
          text:      hl.text,
          chapter:   hl.chapter   || null,
          location:  hl.location  || null,
          page:      hl.page      || null,
          color:     hl.color     || null,
          hash:      hl.hash,
          addedAt:   hl.addedAt   || new Date().toISOString(),
        };
        d.highlights.push(highlight);
        existingHashes.add(hl.hash);
        imported++;
      }

      // Keep count accurate
      source.highlightCount = d.highlights.filter(h => h.sourceId === source.id).length;

      totalImported += imported;
      totalSkipped  += skipped;
      sourceNames.push(src.title);
    }

    _save(d);
    return { imported: totalImported, skipped: totalSkipped, sourceNames };
  }

  /* ═══════════════════════════════════════════════════════════════
     DAILY REVIEW
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Returns up to 10 highlights for today.
   * Uses a date-seeded LCG shuffle — same set shown all day (like Readwise).
   */
  function getDailyReview() {
    const highlights = _data().highlights;
    if (highlights.length === 0) return [];

    // Seed: YYYYMMDD as integer
    const now  = new Date();
    const seed = now.getFullYear() * 10000
               + (now.getMonth() + 1) * 100
               + now.getDate();

    // Knuth LCG shuffle (seeded Fisher-Yates)
    const shuffled = [...highlights];
    let s = seed >>> 0;
    for (let i = shuffled.length - 1; i > 0; i--) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const j = s % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, Math.min(10, shuffled.length));
  }

  /* ═══════════════════════════════════════════════════════════════
     STATS
     ═══════════════════════════════════════════════════════════════ */

  function getStats() {
    const d = _data();
    return {
      sourceCount:    d.sources.length,
      highlightCount: d.highlights.length,
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     GIST SYNC
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Trigger a Gist save — prompts for credentials if not stored.
   * Saves the FULL unified state (all modules) in one Gist file.
   */
  function triggerGistSave() {
    const creds = window.App.State.getGistCredentials();
    if (!creds.token) {
      // Reuse Portfolio's credentials popup (shared Gist)
      if (typeof window.App.Portfolio?.openCredentialsPopup === 'function') {
        window.App.Portfolio.openCredentialsPopup(() => _performGistSave());
      } else {
        _toast('No Gist credentials — configure them in Portfolio Settings', 'warn');
      }
      return;
    }
    _performGistSave();
  }

  async function _performGistSave() {
    const creds = window.App.State.getGistCredentials();
    window.App.EmberUI?.setGistStatus('Saving…');
    try {
      const result = await window.App.Gist.save(
        window.App.State.getAll(),
        creds.token,
        creds.id,
      );
      if (result.id) {
        window.App.State.setGistCredentials({
          id:       result.id,
          lastSync: new Date().toISOString(),
        });
      }
      window.App.EmberUI?.setGistStatus('Saved ✓');
      _toast('Ember data saved to Gist', 'success');
    } catch (e) {
      window.App.EmberUI?.setGistStatus('Save failed');
      _toast('Gist save failed: ' + e.message, 'error');
    }
  }

  /* ── Toast helper ─────────────────────────────────────────────── */

  function _toast(msg, type = 'info') {
    // Reuse Portfolio's toast if available
    if (typeof window.App.Portfolio?.toast === 'function') {
      window.App.Portfolio.toast(msg, type);
      return;
    }
    // Fallback — minimal inline toast
    const wrap = document.getElementById('toast-wrap');
    if (!wrap) { console.info(`[Ember] ${msg}`); return; }
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => t.classList.add('toast-exit'), 3200);
    setTimeout(() => t.remove(), 3700);
  }

  /* ═══════════════════════════════════════════════════════════════
     MODULE INIT
     ═══════════════════════════════════════════════════════════════ */

  function init() {
    // Ensure ember namespace exists (migration safety)
    const d = _data();
    if (!d.sources)    d.sources    = [];
    if (!d.highlights) d.highlights = [];

    // Migration: assign spine colours to any sources that pre-date this feature
    let dirty = false;
    const usedColors = new Set(d.sources.map(s => s.color).filter(Boolean));
    for (const src of d.sources) {
      if (!src.color) {
        const next = SPINE_PALETTE.find(c => !usedColors.has(c))
                     || SPINE_PALETTE[d.sources.indexOf(src) % SPINE_PALETTE.length];
        src.color = next;
        usedColors.add(next);
        dirty = true;
      }
    }
    if (dirty) _save(d);

    window.App.EmberUI.init();
  }

  /* ── Register with App.Shell ──────────────────────────────────── */

  window.App.Shell.registerModule({
    id:    'ember',
    label: 'Ember',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
               width="22" height="22">
             <path d="M12 22c5 0 9-4 9-9 0-3-1.5-5.5-4-7.5C15 7 13.5 9 12 9
                      c-2 0-3-2-3-2C6.5 9 4 12.5 4 16c0 3.3 2.7 6 6 6z"/>
             <path d="M9.5 14.5c.5 1.5 2.5 2 3 .5" opacity="0.55"/>
           </svg>`,
    init,
  });

  /* ── Exports ──────────────────────────────────────────────────── */

  return {
    // Sources
    getSources,
    getSource,
    deleteSource,
    // Highlights
    getHighlights,
    deleteHighlight,
    // Import
    importParsed,
    // Review
    getDailyReview,
    // Stats
    getStats,
    // Gist
    triggerGistSave,
    // Re-attach Data sub-module (was overwritten by this IIFE's assignment)
    Data: _existing.Data,
  };

})();
