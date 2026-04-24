'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * EMBER / DATA  —  Kindle highlight file parsers
 * ═══════════════════════════════════════════════════════════════════
 *
 * Supports two Kindle export formats:
 *   • My Clippings.txt  — the TXT file exported from the Kindle device
 *   • Notebook HTML     — the HTML file exported from the Kindle app / web
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
 *     format:     'kindle-txt' | 'kindle-html',
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
 * RULES
 *  • No DOM manipulation — this is a pure data module.
 *  • No App.State access — caller handles persistence.
 * ═══════════════════════════════════════════════════════════════════
 */
window.App = window.App || {};
window.App.Ember = window.App.Ember || {};

window.App.Ember.Data = (() => {

  /* ── Hash (djb2) — fast, collision-resistant enough for dedup ─── */

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
          addedAt:  null, // HTML export doesn't include timestamps
          hash:     _hash(text),
        });

        i++; // consume the .noteText element
      }
    }

    return [{ title, author, format: 'kindle-html', highlights }];
  }

  /* ── Format detection ─────────────────────────────────────────── */

  /**
   * Auto-detect format from file extension and/or content.
   * @returns 'kindle-txt' | 'kindle-html' | null
   */
  function detect(content, filename) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    if (ext === 'txt')              return 'kindle-txt';
    if (ext === 'html' || ext === 'htm') return 'kindle-html';

    // Content sniffing fallback
    if (content.includes('==========') && /Your Highlight/i.test(content)) return 'kindle-txt';
    if (content.includes('bodyContainer') || content.includes('noteHeading'))  return 'kindle-html';
    if (content.includes('My Clippings'))                                      return 'kindle-txt';

    return null;
  }

  /* ── Public parse entry-point ─────────────────────────────────── */

  /**
   * Parse file content into source objects (see module docblock for shape).
   * Returns null if format cannot be determined.
   */
  function parse(content, filename) {
    const fmt = detect(content, filename);
    if (fmt === 'kindle-txt')  return parseTxt(content);
    if (fmt === 'kindle-html') return parseHtml(content);
    return null;
  }

  /* ── Exports ──────────────────────────────────────────────────── */

  return {
    parse,
    detect,
    genId,
    _hash, // exposed for testing
  };

})();
