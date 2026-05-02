'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * EMBER / DATA  —  Highlight file parsers
 * ═══════════════════════════════════════════════════════════════════
 *
 * Supports three import formats:
 *   • My Clippings.txt  — the TXT file exported from the Kindle device
 *   • Notebook HTML     — the HTML file exported from the Kindle app / web
 *   • Ember JSON        — Ember-compatible JSON (e.g. from Python PDF extractor)
 *
 * Also exposes:
 *   • detect(content, filename) — auto-detect format
 *   • parse(content, filename)  — parse and return source objects
 *   • genId(prefix)             — unique ID generator
 *
 * Return shape (array of source objects):
 *   [{
 *     title:      string,
 *     author:     string,
 *     format:     'kindle-txt' | 'kindle-html' | 'pdf' | string,
 *     highlights: [{
 *       text:     string,
 *       chapter:  string | null,
 *       location: string | null,
 *       page:     number | null,
 *       color:    'yellow'|'blue'|'orange'|'pink' | null,
 *       addedAt:  ISO string | null,
 *       hash:     string,   ← djb2 hash of text, used for dedup
 *     }]
 *   }]
 *
 * JSON import shape (what your Python extractor should output):
 *   {
 *     "sources": [{ "title", "author", "format" }],   ← optional
 *     "highlights": [{ "text", "chapter", "page", "location", "color", "addedAt" }]
 *   }
 *   OR the full Ember state export shape (sources[] paired with highlights[]).
 *
 * RULES
 *  • No DOM manipulation — this is a pure data module.
 *  • No App.State access — caller handles persistence.
 * ═══════════════════════════════════════════════════════════════════
 */
window.App = window.App || {};
window.App.Ember = window.App.Ember || {};

window.App.Ember.Data = (() => {

  /* ── Hash (djb2) — fast, collision-resistant enough for dedup ─── */

  /**
   * djb2 hash — produces a stable base-36 fingerprint for highlight text.
   * Used to detect duplicate highlights on subsequent imports of the same
   * Kindle file without requiring an expensive full-text comparison.
   *
   * h = h * 33 XOR char  (the `<< 5) + h` form is h * 32 + h = h * 33)
   * >>> 0 keeps the value in the unsigned 32-bit range after each XOR.
   */
  function _hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
      h = h >>> 0; // unsigned 32-bit
    }
    return h.toString(36);
  }

  /* ── ID generator ─────────────────────────────────────────────── */

  // Delegate to centralised App.Utils.generateId (js/core/utils.js)
  function genId(prefix = 'id') {
    return window.App.Utils?.generateId(prefix) ?? `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  /* ═══════════════════════════════════════════════════════════════
     TXT PARSER  —  My Clippings.txt
     ═══════════════════════════════════════════════════════════════

     Format per clipping (separated by "=========="):

       Book Title (Author Name)
       - Your Highlight on page 27 | location 412-415 | Added on Monday, 15 December 2025 14:32:19

       Highlight text here.
       ==========

     Notes (as opposed to Highlights) are skipped.
  */

  function parseTxt(content) {
    const buckets = {}; // keyed by "title||author"

    const chunks = content
      .split(/={10,}/)
      .map(c => c.trim())
      .filter(c => c.length > 0);

    for (const chunk of chunks) {
      const lines = chunk
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

      if (lines.length < 3) continue;

      // ── Line 0: "Title (Author)" ────────────────────────────────
      const titleLine = lines[0];
      // Handle multi-author e.g. "Book (Author1; Author2)"
      const titleMatch = titleLine.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      const title  = titleMatch ? titleMatch[1].trim() : titleLine.trim();
      const author = titleMatch ? titleMatch[2].trim() : 'Unknown';

      // ── Line 1: metadata ─────────────────────────────────────────
      const metaLine = lines[1];

      // Skip notes
      if (/Your Note/i.test(metaLine)) continue;
      // Skip bookmarks
      if (/Your Bookmark/i.test(metaLine)) continue;

      const pageMatch = metaLine.match(/page\s+(\d+)/i);
      const locMatch  = metaLine.match(/location\s+([\d-]+)/i);
      const dateMatch = metaLine.match(/Added on\s+(.+)$/i);

      const page     = pageMatch ? parseInt(pageMatch[1], 10) : null;
      const location = locMatch  ? locMatch[1]                : null;
      const addedAt  = dateMatch ? _parseTxtDate(dateMatch[1].trim()) : null;

      // ── Lines 2+: highlight text ─────────────────────────────────
      const text = lines.slice(2).join(' ').trim();
      if (!text) continue;

      const key = `${title}||${author}`;
      if (!buckets[key]) {
        buckets[key] = { title, author, format: 'kindle-txt', highlights: [] };
      }

      buckets[key].highlights.push({
        text,
        chapter:  null,      // TXT format has no chapter info
        location,
        page,
        color:    null,      // TXT format has no colour info
        addedAt,
        hash:     _hash(text),
      });
    }

    return Object.values(buckets);
  }

  /**
   * Parse Kindle TXT date strings like:
   *   "Monday, 15 December 2025 14:32:19"
   *   "Saturday, January 4, 2025 10:22:14 AM"
   * Falls back to current time if unparseable.
   */
  function _parseTxtDate(str) {
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch (_) { /* fall through */ }
    return new Date().toISOString();
  }

  /* ═══════════════════════════════════════════════════════════════
     HTML PARSER  —  Kindle Notebook Export
     ═══════════════════════════════════════════════════════════════

     DOM structure (verified against real export):

       .bookTitle       → book title
       .authors         → author(s)
       .citation        → Chicago citation (ignored)
       .sectionHeading  → chapter / section name
       .noteHeading     → "Highlight(<span class="highlight_yellow">yellow</span>) - [subsection > ] [Page N · ] Location M"
       .noteText        → highlight text

     Notes (non-highlight entries in noteHeading) are skipped.
     PDF annotations added in Phase 2 will use a similar shape.
  */

  function parseHtml(content) {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(content, 'text/html');

    const titleEl   = doc.querySelector('.bookTitle');
    const authorsEl = doc.querySelector('.authors');

    const title  = titleEl   ? titleEl.textContent.trim()   : 'Unknown Book';
    const author = authorsEl ? authorsEl.textContent.trim() : 'Unknown Author';

    const highlights    = [];
    let   currentChapter = null;

    // Walk direct children of .bodyContainer (or body as fallback)
    const container = doc.querySelector('.bodyContainer') || doc.body;
    const elements  = Array.from(container.children);

    for (let i = 0; i < elements.length; i++) {
      const elem = elements[i];
      const cls  = (elem.className || '').trim();

      if (cls === 'sectionHeading') {
        // New chapter / section
        currentChapter = elem.textContent.trim() || null;
        continue;
      }

      if (cls === 'noteHeading') {
        const headingText = elem.textContent.trim();

        // Skip non-highlight entries (notes, bookmarks)
        if (!/Highlight/i.test(headingText)) continue;

        // ── Color ────────────────────────────────────────────────
        const colorSpan = elem.querySelector('[class^="highlight_"]');
        const color = colorSpan
          ? colorSpan.className.replace('highlight_', '').trim()
          : null;

        // ── Page ─────────────────────────────────────────────────
        // "Page 2" or "Page 27"
        const pageMatch = headingText.match(/[Pp]age\s+(\d+)/);
        const page = pageMatch ? parseInt(pageMatch[1], 10) : null;

        // ── Location ─────────────────────────────────────────────
        // "Location 95" or "Location 162"
        const locMatch  = headingText.match(/[Ll]ocation\s+([\d]+)/);
        const location  = locMatch ? locMatch[1] : null;

        // ── Text — next .noteText sibling ────────────────────────
        const nextElem = elements[i + 1];
        if (!nextElem || (nextElem.className || '').trim() !== 'noteText') continue;

        const text = nextElem.textContent.trim();
        if (!text) { i++; continue; }

        highlights.push({
          text,
          chapter:  currentChapter,
          location,
          page,
          color,
          addedAt:  null, // HTML export does not include timestamps
          hash:     _hash(text),
        });

        // Advance i past the .noteText element we just consumed so the outer
        // loop does not re-process it as a standalone element.
        i++;
      }
    }

    return [{ title, author, format: 'kindle-html', highlights }];
  }

  /* ═══════════════════════════════════════════════════════════════
     JSON PARSER  —  Ember-compatible JSON (Python PDF extractor et al.)
     ═══════════════════════════════════════════════════════════════

     Accepts two JSON shapes:

     Shape A — flat list (simplest, recommended for Python extractor):
       {
         "title":  "Book Title",       ← optional, defaults to filename
         "author": "Author Name",      ← optional, defaults to "Unknown"
         "format": "pdf",              ← optional, defaults to "json"
         "highlights": [
           {
             "text":    "highlight text",   ← required
             "chapter": "Chapter 1",        ← optional
             "page":    42,                 ← optional
             "location": null,              ← optional
             "color":   null,               ← optional
             "addedAt": "2025-04-01T..."    ← optional ISO string
           }
         ]
       }

     Shape B — full Ember state export (same structure as Gist file):
       {
         "sources":    [{ "title", "author", "format", ... }],
         "highlights": [{ "text", "chapter", "page", "sourceId", ... }]
       }
       In this shape, highlights are grouped back to their source by sourceId.

     In both cases:
       • Missing hashes are computed from text (same djb2 as other parsers).
       • Highlights with empty text are skipped.
       • The result is always an array of source objects (same shape as
         parseTxt / parseHtml), so the caller (importParsed) is format-agnostic.
  */

  /**
   * Parse Ember-compatible JSON content into source objects.
   * @param {string} content  — raw file text (will be JSON.parsed)
   * @param {string} filename — original filename (used as title fallback)
   * @returns {Array} array of source objects, or null on parse failure
   */
  function parseJSON(content, filename) {
    let data;
    try {
      data = JSON.parse(content);
    } catch (e) {
      return null; // Not valid JSON — caller will show error
    }

    if (!data || typeof data !== 'object') return null;

    // ── Shape B: full Ember state export (has sources[] + highlights[]) ──
    if (Array.isArray(data.sources) && Array.isArray(data.highlights)) {
      // Rebuild per-source highlight lists
      const sourceMap = {};
      for (const src of data.sources) {
        if (!src.id) continue;
        sourceMap[src.id] = {
          title:      src.title  || 'Unknown Book',
          author:     src.author || 'Unknown Author',
          format:     src.format || 'json',
          highlights: [],
        };
      }

      for (const hl of data.highlights) {
        if (!hl.text || !hl.text.trim()) continue;
        const text = hl.text.trim();
        const bucket = sourceMap[hl.sourceId];
        if (bucket) {
          bucket.highlights.push({
            text,
            chapter:  hl.chapter  || null,
            location: hl.location || null,
            page:     hl.page     || null,
            color:    hl.color    || null,
            addedAt:  hl.addedAt  || null,
            hash:     hl.hash     || _hash(text),
          });
        }
      }

      const result = Object.values(sourceMap).filter(s => s.highlights.length > 0);
      return result.length > 0 ? result : null;
    }

    // ── Shape A: flat list — single source with highlights array ────────
    if (Array.isArray(data.highlights)) {
      const highlights = [];
      for (const hl of data.highlights) {
        if (!hl.text || !hl.text.trim()) continue;
        const text = hl.text.trim();
        highlights.push({
          text,
          chapter:  hl.chapter  || null,
          location: hl.location || null,
          page:     typeof hl.page === 'number' ? hl.page : null,
          color:    hl.color    || null,
          addedAt:  hl.addedAt  || null,
          hash:     hl.hash     || _hash(text),
        });
      }

      if (highlights.length === 0) return null;

      // Use title/author from top-level fields, falling back to filename
      const baseName = (filename || 'Imported Book').replace(/\.json$/i, '');
      return [{
        title:      data.title  || baseName,
        author:     data.author || 'Unknown Author',
        format:     data.format || 'pdf',
        highlights,
      }];
    }

    return null; // Unrecognised shape
  }

  /* ── Format detection ─────────────────────────────────────────── */

  /**
   * Auto-detect format from file extension and/or content.
   * @returns 'kindle-txt' | 'kindle-html' | 'json' | null
   */
  function detect(content, filename) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    if (ext === 'json')              return 'json';
    if (ext === 'txt')               return 'kindle-txt';
    if (ext === 'html' || ext === 'htm') return 'kindle-html';

    // Content sniffing fallback
    if (content.trimStart().startsWith('{') || content.trimStart().startsWith('[')) return 'json';
    if (content.includes('==========') && /Your Highlight/i.test(content)) return 'kindle-txt';
    if (content.includes('bodyContainer') || content.includes('noteHeading'))  return 'kindle-html';
    if (content.includes('My Clippings'))                                      return 'kindle-txt';

    return null;
  }

  /* ── Public parse entry-point ─────────────────────────────────── */

  /**
   * Parse file content into source objects (see module docblock for shape).
   * Returns null if format cannot be determined or parsing yields no highlights.
   */
  function parse(content, filename) {
    const fmt = detect(content, filename);
    if (fmt === 'kindle-txt')  return parseTxt(content);
    if (fmt === 'kindle-html') return parseHtml(content);
    if (fmt === 'json')        return parseJSON(content, filename);
    return null;
  }

  /* ── Exports ──────────────────────────────────────────────────── */

  return {
    parse,
    detect,
    genId,
    parseJSON, // exposed for direct use / testing
    _hash,     // exposed for testing
  };

})();
