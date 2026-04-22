'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * EMBER / UI  —  All DOM rendering for the Ember module
 * ═══════════════════════════════════════════════════════════════════
 *
 * Three tabs:
 *   • Books    — master/detail: book grid → click → highlights pane
 *   • Library  — full searchable highlight list with book filter
 *   • Review   — date-seeded daily 10 (same set all day, like Readwise)
 *
 * Import wizard (3 steps):
 *   Step 1 — Drag-drop / file picker
 *   Step 2 — Parse preview (count, samples, duplicate info)
 *   Step 3 — Success confirmation (auto-closes after 2 s)
 *
 * RULES
 *  • No business logic here — only rendering and event binding.
 *  • All data reads go through window.App.Ember (business layer).
 *  • Use _esc() on every user-originated string before injecting HTML.
 * ═══════════════════════════════════════════════════════════════════
 */
window.App = window.App || {};

window.App.EmberUI = (() => {

  /* ── DOM helper ───────────────────────────────────────────────── */
  function el(id) { return document.getElementById(id); }

  /* ── Spine colour palette (mirrors ember.js) ─────────────────── */

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

  /* ── UI state ─────────────────────────────────────────────────── */
  let _activeTab        = 'books';
  let _selectedSourceId = null;  // which book is open in the detail pane
  let _librarySearch    = '';
  let _libraryFilter    = 'all'; // 'all' or a sourceId
  let _pendingParsed    = null;  // parser output waiting for confirmation
  let _gistStatusTimer  = null;

  /* ═══════════════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════════════ */

  function init() {
    _bindHeader();
    _bindImportWizard();
    render();
  }

  /* ═══════════════════════════════════════════════════════════════
     TOP-LEVEL RENDER
     ═══════════════════════════════════════════════════════════════ */

  function render() {
    _renderHeaderStats();
    renderActiveTab();
  }

  function renderActiveTab() {
    // Update tab button states
    ['books', 'library', 'review'].forEach(tab => {
      el(`ember-tab-${tab}`)?.classList.toggle('active', tab === _activeTab);
    });

    // Show/hide panes
    el('ember-pane-books').style.display   = _activeTab === 'books'   ? '' : 'none';
    el('ember-pane-library').style.display = _activeTab === 'library' ? '' : 'none';
    el('ember-pane-review').style.display  = _activeTab === 'review'  ? '' : 'none';

    if (_activeTab === 'books')   _renderBooks();
    if (_activeTab === 'library') _renderLibrary();
    if (_activeTab === 'review')  _renderReview();
  }

  /* ═══════════════════════════════════════════════════════════════
     HEADER
     ═══════════════════════════════════════════════════════════════ */

  function _renderHeaderStats() {
    const stats = window.App.Ember.getStats();
    const statsEl = el('ember-stats');
    if (!statsEl) return;
    statsEl.innerHTML =
      `<span class="ember-stat"><strong>${stats.sourceCount}</strong> Book${stats.sourceCount !== 1 ? 's' : ''}</span>` +
      `<span class="ember-stat-sep">·</span>` +
      `<span class="ember-stat"><strong>${stats.highlightCount}</strong> Highlight${stats.highlightCount !== 1 ? 's' : ''}</span>`;
  }

  function _bindHeader() {
    el('ember-import-btn')?.addEventListener('click', () => openImportWizard());
    el('ember-gist-save')?.addEventListener('click', () => window.App.Ember.triggerGistSave());

    ['books', 'library', 'review'].forEach(tab => {
      el(`ember-tab-${tab}`)?.addEventListener('click', () => {
        _activeTab = tab;
        if (tab !== 'books') _selectedSourceId = null; // reset detail when leaving
        renderActiveTab();
      });
    });
  }

  /** Called by ember.js after Gist operations. */
  function setGistStatus(msg) {
    const statusEl = el('ember-gist-status');
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.style.opacity = '1';
    clearTimeout(_gistStatusTimer);
    _gistStatusTimer = setTimeout(() => { statusEl.style.opacity = '0'; }, 3500);
  }

  /* ═══════════════════════════════════════════════════════════════
     BOOKS TAB
     ═══════════════════════════════════════════════════════════════ */

  function _renderBooks() {
    const sources = window.App.Ember.getSources();
    const wrap    = el('ember-books-content');
    if (!wrap) return;

    if (sources.length === 0) {
      wrap.innerHTML = _emptyState(
        _svgBook(48),
        'No books yet',
        'Import your Kindle highlights to get started',
        `<button class="abtn primary" onclick="window.App.EmberUI.openImportWizard()">
           Import Highlights
         </button>`,
      );
      return;
    }

    if (_selectedSourceId) {
      _renderBooksDetail(sources, _selectedSourceId);
    } else {
      _renderBooksGrid(sources);
    }
  }

  /* ── Books grid ─────────────────────────────────────────────── */

  function _renderBooksGrid(sources) {
    const wrap = el('ember-books-content');
    wrap.innerHTML = `<div class="ember-books-grid">${sources.map(_buildBookCard).join('')}</div>`;

    // Card click → open detail
    wrap.querySelectorAll('.ember-book-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.ember-book-del')) return;
        _selectedSourceId = card.dataset.sourceId;
        _renderBooksDetail(sources, _selectedSourceId);
      });
    });

    // Delete button
    wrap.querySelectorAll('.ember-book-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const sid = btn.closest('.ember-book-card').dataset.sourceId;
        _confirmDeleteSource(sources.find(s => s.id === sid));
      });
    });

  }

  function _buildBookCard(source) {
    const fmtLabel = { 'kindle-html': 'Kindle HTML', 'kindle-txt': 'Kindle TXT', 'pdf': 'PDF' }[source.format] || source.format;
    const date = source.importedAt
      ? new Date(source.importedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';
    const spine = _spineColor(source);

    return `
      <div class="ember-book-card" data-source-id="${source.id}" style="--book-color:${spine}">
        <div class="ember-book-spine" style="background:${spine}"></div>
        <div class="ember-book-body">
          <div class="ember-book-meta-row">
            <span class="ember-book-badge">${_esc(fmtLabel)}</span>
            <span class="ember-book-date">${date}</span>
          </div>
          <div class="ember-book-title">${_esc(source.title)}</div>
          <div class="ember-book-author">${_esc(source.author)}</div>
          <div class="ember-book-count">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" width="11" height="11">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            ${source.highlightCount} highlight${source.highlightCount !== 1 ? 's' : ''}
          </div>
        </div>
        <button class="ember-book-del" title="Delete book and all highlights">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`;
  }

  /* ── Books detail (master-detail layout) ───────────────────── */

  function _renderBooksDetail(sources, sourceId) {
    const source     = sources.find(s => s.id === sourceId);
    if (!source) { _selectedSourceId = null; _renderBooksGrid(sources); return; }
    const highlights = window.App.Ember.getHighlights(sourceId);
    const wrap       = el('ember-books-content');

    // Group by chapter
    const byChapter = {};
    for (const hl of highlights) {
      const ch = hl.chapter || '—';
      if (!byChapter[ch]) byChapter[ch] = [];
      byChapter[ch].push(hl);
    }

    wrap.innerHTML = `
      <div class="ember-detail-layout">

        <!-- Left sidebar: book list -->
        <aside class="ember-detail-sidebar">
          <button class="ember-back-btn" id="ember-detail-back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            All Books
          </button>
          <div class="ember-detail-sidebar-list">
            ${sources.map(s => `
              <div class="ember-sidebar-item ${s.id === sourceId ? 'active' : ''}" data-sid="${s.id}">
                <div class="ember-sidebar-item-spine" style="background:${_spineColor(s)}"></div>
                <div class="ember-sidebar-item-body">
                  <div class="ember-sidebar-item-title">${_esc(s.title)}</div>
                  <div class="ember-sidebar-item-count">${s.highlightCount}</div>
                </div>
              </div>`).join('')}
          </div>
        </aside>

        <!-- Right main: highlights -->
        <main class="ember-detail-main">
          <div class="ember-detail-header">
            <div class="ember-detail-book-info">
              <div class="ember-detail-book-title">${_esc(source.title)}</div>
              <div class="ember-detail-book-author">${_esc(source.author)}</div>
            </div>
            <div class="ember-detail-count-pill">${highlights.length} highlight${highlights.length !== 1 ? 's' : ''}</div>
          </div>

          <div class="ember-detail-highlights">
            ${Object.entries(byChapter).map(([chapter, hls]) => `
              <div class="ember-chapter-group">
                <div class="ember-chapter-heading">${_esc(chapter)}</div>
                ${hls.map(hl => _buildHighlightCard(hl, source)).join('')}
              </div>`).join('')}
          </div>
        </main>
      </div>`;

    // Back button
    el('ember-detail-back')?.addEventListener('click', () => {
      _selectedSourceId = null;
      _renderBooksGrid(sources);
    });

    // Sidebar source switching
    wrap.querySelectorAll('.ember-sidebar-item').forEach(item => {
      item.addEventListener('click', () => {
        _selectedSourceId = item.dataset.sid;
        _renderBooksDetail(sources, _selectedSourceId);
      });
    });

    // Delete highlight buttons
    _bindHighlightDelete(wrap);
  }

  /* ═══════════════════════════════════════════════════════════════
     LIBRARY TAB
     ═══════════════════════════════════════════════════════════════ */

  function _renderLibrary() {
    const sources      = window.App.Ember.getSources();
    const allHighlights = window.App.Ember.getHighlights();
    const wrap         = el('ember-library-content');
    if (!wrap) return;

    if (allHighlights.length === 0) {
      wrap.innerHTML = _emptyState(
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"
              stroke-linecap="round" stroke-linejoin="round" width="48" height="48">
           <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
         </svg>`,
        'Library is empty',
        'Import highlights to build your searchable library',
      );
      return;
    }

    // Apply filters
    let filtered = allHighlights;
    if (_libraryFilter !== 'all') {
      filtered = filtered.filter(h => h.sourceId === _libraryFilter);
    }
    if (_librarySearch.trim()) {
      const q = _librarySearch.toLowerCase();
      filtered = filtered.filter(h =>
        h.text.toLowerCase().includes(q) ||
        (h.chapter || '').toLowerCase().includes(q),
      );
    }

    wrap.innerHTML = `
      <div class="ember-library-controls">
        <div class="ember-search-wrap">
          <svg class="ember-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="ember-search-inp" id="ember-lib-search"
                 placeholder="Search highlights…" value="${_esc(_librarySearch)}" autocomplete="off">
        </div>
        <select class="ember-filter-sel" id="ember-lib-filter">
          <option value="all" ${_libraryFilter === 'all' ? 'selected' : ''}>All Books</option>
          ${sources.map(s =>
            `<option value="${s.id}" ${_libraryFilter === s.id ? 'selected' : ''}>${_esc(s.title)}</option>`
          ).join('')}
        </select>
        <span class="ember-result-count">${filtered.length} highlight${filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div class="ember-library-list" id="ember-lib-list">
        ${filtered.length === 0
          ? `<div class="ember-no-results">No highlights match your search</div>`
          : filtered.map(hl => {
              const src = sources.find(s => s.id === hl.sourceId);
              return _buildHighlightCard(hl, src);
            }).join('')
        }
      </div>`;

    // Bind search input
    el('ember-lib-search')?.addEventListener('input', e => {
      _librarySearch = e.target.value;
      _renderLibrary();
    });

    // Bind filter select
    el('ember-lib-filter')?.addEventListener('change', e => {
      _libraryFilter = e.target.value;
      _renderLibrary();
    });

    _bindHighlightDelete(wrap);
  }

  /* ═══════════════════════════════════════════════════════════════
     REVIEW TAB
     ═══════════════════════════════════════════════════════════════ */

  function _renderReview() {
    const wrap   = el('ember-review-content');
    if (!wrap) return;

    const hls    = window.App.Ember.getDailyReview();
    const sources = window.App.Ember.getSources();
    const today  = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    if (hls.length === 0) {
      wrap.innerHTML = _emptyState(
        '🔥',
        'Nothing to review yet',
        'Import some highlights to start your daily review',
      );
      return;
    }

    wrap.innerHTML = `
      <div class="ember-review-header">
        <div class="ember-review-flame">🔥</div>
        <div>
          <div class="ember-review-date">${today}</div>
          <div class="ember-review-subtitle">Your ${hls.length} highlights for today</div>
        </div>
      </div>
      <div class="ember-review-list">
        ${hls.map((hl, i) => {
          const src = sources.find(s => s.id === hl.sourceId);
          const bookColor = src ? _spineColor(src) : 'var(--amber)';
          return `
            <div class="ember-review-card" style="--book-color:${bookColor}">
              <div class="ember-review-num" style="background:${bookColor}">${i + 1}</div>
              <div class="ember-review-body">
                <blockquote class="ember-review-text">${_esc(hl.text)}</blockquote>
                <div class="ember-review-meta">
                  ${src ? `<span class="ember-review-book">${_esc(src.title)}</span>` : ''}
                  ${hl.chapter ? `<span class="ember-review-chapter">· ${_esc(hl.chapter)}</span>` : ''}
                  ${hl.page     ? `<span class="ember-review-loc">p.${hl.page}</span>`     :
                    hl.location ? `<span class="ember-review-loc">loc.${hl.location}</span>` : ''}
                </div>
              </div>
              <div class="ember-color-pip" style="background:${bookColor}"></div>
            </div>`;
        }).join('')}
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════
     SHARED — HIGHLIGHT CARD
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Renders a single highlight card.
   * @param {object} hl      — highlight object
   * @param {object} [source] — source object; when provided shows book title and
   *                            uses the book's unique spine colour for the accent strip.
   */
  function _buildHighlightCard(hl, source = null) {
    // Always use the book's spine colour when we have it; fall back to hl.color hex
    const accentColor = source
      ? _spineColor(source)
      : _hlColorHex(hl.color);

    const chapterLine = hl.chapter && !source
      ? `<div class="ember-hl-chapter">${_esc(hl.chapter)}</div>`
      : '';
    const sourceTag = source
      ? `<div class="ember-hl-source-tag">${_esc(source.title)}</div>`
      : '';
    const metaItems = [
      hl.page     ? `<span>p.${hl.page}</span>`       : null,
      hl.location ? `<span>loc.${hl.location}</span>` : null,
    ].filter(Boolean).join('');

    return `
      <div class="ember-hl-card" data-hl-id="${hl.id}" style="--book-color:${accentColor}">
        <div class="ember-hl-accent" style="background:${accentColor}"></div>
        <div class="ember-hl-body">
          ${chapterLine}${sourceTag}
          <div class="ember-hl-text">${_esc(hl.text)}</div>
          ${metaItems ? `<div class="ember-hl-foot">${metaItems}</div>` : ''}
        </div>
        <button class="ember-hl-del" data-hl-id="${hl.id}" title="Delete highlight">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round" width="11" height="11">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`;
  }

  /** Hex fallback for when no source object is available (edge case). */
  function _hlColorHex(color) {
    const map = { yellow: '#f59e0b', blue: '#60a5fa', orange: '#fb923c', pink: '#f472b6' };
    return map[color] || 'var(--b2)';
  }

  function _bindHighlightDelete(container) {
    container.querySelectorAll('.ember-hl-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        window.App.Ember.deleteHighlight(btn.dataset.hlId);
        render(); // re-render stats + tab
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     IMPORT WIZARD
     ═══════════════════════════════════════════════════════════════ */

  function openImportWizard() {
    _pendingParsed = null;
    // Reset file input so same file can be re-selected
    const fi = el('ember-file-input');
    if (fi) fi.value = '';
    // Reset dropzone
    const dropzone = el('ember-dropzone');
    if (dropzone) {
      dropzone.classList.remove('has-file', 'dragover');
      const nameEl = el('ember-dropzone-name');
      if (nameEl) nameEl.textContent = '';
    }
    const errEl = el('ember-parse-error');
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
    _showStep(1);
    el('ember-import-ov').classList.add('active');
  }

  function _closeImportWizard() {
    el('ember-import-ov').classList.remove('active');
    _pendingParsed = null;
  }

  function _showStep(step) {
    [1, 2, 3].forEach(i => {
      el(`ember-istep-${i}`)?.classList.toggle('active', i === step);
      el(`ember-istep-${i}`)?.classList.toggle('done',   i < step);
      const pane = el(`ember-istep-content-${i}`);
      if (pane) pane.style.display = i === step ? '' : 'none';
    });

    // Footer button visibility per step
    const cancelBtn  = el('ember-import-cancel');
    const backBtn    = el('ember-import-back');
    const confirmBtn = el('ember-import-confirm');

    if (cancelBtn)  cancelBtn.style.display  = step === 3 ? 'none' : '';
    if (backBtn)    backBtn.style.display     = step === 2 ? '' : 'none';
    if (confirmBtn) confirmBtn.style.display  = step === 2 ? '' : 'none';
  }

  function _bindImportWizard() {
    el('ember-import-close')?.addEventListener('click', _closeImportWizard);

    // Click overlay backdrop to close
    el('ember-import-ov')?.addEventListener('click', e => {
      if (e.target === el('ember-import-ov')) _closeImportWizard();
    });

    // Drag-drop zone
    const dropzone = el('ember-dropzone');
    const fileInput = el('ember-file-input');

    dropzone?.addEventListener('click', () => fileInput?.click());

    dropzone?.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone?.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) _processFile(file);
    });

    fileInput?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) _processFile(file);
    });

    el('ember-import-confirm')?.addEventListener('click', _confirmImport);
    el('ember-import-back')?.addEventListener('click', () => _showStep(1));
    el('ember-import-cancel')?.addEventListener('click', _closeImportWizard);
  }

  function _processFile(file) {
    const errEl = el('ember-parse-error');
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }

    // Update drop zone to show file name
    const dropzone = el('ember-dropzone');
    if (dropzone) {
      const nameEl = el('ember-dropzone-name') || dropzone.querySelector('.ember-dropzone-name');
      if (nameEl) nameEl.textContent = file.name;
      dropzone.classList.add('has-file');
    }

    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target.result;
      const parsed  = window.App.Ember.Data.parse(content, file.name);

      if (!parsed || parsed.length === 0 || parsed.every(p => p.highlights.length === 0)) {
        if (errEl) {
          errEl.textContent = 'Could not parse this file. Please upload a Kindle TXT or HTML Notebook Export.';
          errEl.style.display = '';
        }
        if (dropzone) dropzone.classList.remove('has-file');
        return;
      }

      _pendingParsed = parsed;
      _buildPreview(parsed);
      _showStep(2);
    };
    reader.onerror = () => {
      if (errEl) { errEl.textContent = 'File read error — please try again.'; errEl.style.display = ''; }
    };
    reader.readAsText(file);
  }

  function _buildPreview(parsed) {
    const previewEl = el('ember-preview-content');
    if (!previewEl) return;

    const existingHashes = new Set(window.App.Ember.getHighlights().map(h => h.hash));
    const totalFound = parsed.reduce((n, p) => n + p.highlights.length, 0);
    const newCount   = parsed.reduce((n, p) => n + p.highlights.filter(h => !existingHashes.has(h.hash)).length, 0);
    const skipCount  = totalFound - newCount;

    // Sample highlights (up to 3 from first source)
    const samples = parsed[0]?.highlights.slice(0, 3) || [];

    previewEl.innerHTML = `
      <div class="ember-preview-books">
        ${parsed.map(p => `
          <div class="ember-preview-book">
            <div class="ember-preview-book-title">${_esc(p.title)}</div>
            <div class="ember-preview-book-author">by ${_esc(p.author)}</div>
            <div class="ember-preview-book-fmt">${p.format === 'kindle-html' ? 'Kindle HTML' : 'Kindle TXT'}</div>
            <div class="ember-preview-book-count">${p.highlights.length} highlights found</div>
          </div>`).join('')}
      </div>

      <div class="ember-preview-summary">
        <span class="ember-preview-new-badge">${newCount} new</span>
        ${skipCount > 0 ? `<span class="ember-preview-skip-badge">${skipCount} duplicates (will skip)</span>` : ''}
      </div>

      ${samples.length > 0 ? `
        <div class="ember-preview-samples">
          <div class="ember-preview-samples-label">Sample highlights:</div>
          ${samples.map(h => `
            <div class="ember-preview-sample">"${_esc(h.text.length > 140 ? h.text.slice(0, 140) + '…' : h.text)}"</div>
          `).join('')}
        </div>` : ''}`;

    // Update confirm button
    const confirmBtn = el('ember-import-confirm');
    if (confirmBtn) {
      confirmBtn.disabled = newCount === 0;
      confirmBtn.textContent = newCount > 0
        ? `Import ${newCount} Highlight${newCount !== 1 ? 's' : ''}`
        : 'No new highlights to import';
    }
  }

  function _confirmImport() {
    if (!_pendingParsed) return;

    const result = window.App.Ember.importParsed(_pendingParsed);
    _pendingParsed = null;
    _showStep(3);

    const resultEl = el('ember-import-result');
    if (resultEl) {
      resultEl.innerHTML = `
        <div class="ember-import-success">
          <div class="ember-import-success-icon">✓</div>
          <div>
            <strong>${result.imported}</strong> highlight${result.imported !== 1 ? 's' : ''} imported
            ${result.skipped > 0 ? `<br><span class="ember-muted">${result.skipped} duplicate${result.skipped !== 1 ? 's' : ''} skipped</span>` : ''}
            <br><span class="ember-muted" style="font-size:11px">from ${result.sourceNames.map(_esc).join(', ')}</span>
          </div>
        </div>`;
    }

    // Auto-close and refresh UI
    setTimeout(() => {
      _closeImportWizard();
      render();
    }, 2200);
  }

  /* ═══════════════════════════════════════════════════════════════
     SOURCE DELETE CONFIRM
     ═══════════════════════════════════════════════════════════════ */

  function _confirmDeleteSource(source) {
    if (!source) return;
    const n = source.highlightCount;
    // Use browser confirm (same pattern as Portfolio module for now)
    if (confirm(`Delete "${source.title}" and all ${n} highlight${n !== 1 ? 's' : ''}?\n\nThis cannot be undone.`)) {
      _selectedSourceId = null;
      window.App.Ember.deleteSource(source.id);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     SHARED HELPERS
     ═══════════════════════════════════════════════════════════════ */

  /** Escape HTML entities to prevent XSS via injected highlight text. */
  function _esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Spine colour for a book card.
   * Uses the colour assigned at import time (source.color).
   * Falls back to a deterministic title-hash pick for legacy sources
   * that were imported before the colour-assignment feature existed.
   */
  function _spineColor(source) {
    if (source.color) return source.color;
    // Legacy fallback — title-hash
    let h = 0;
    const t = source.title || '';
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
    return SPINE_PALETTE[h % SPINE_PALETTE.length];
  }

  function _svgBook(size) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"
                stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>`;
  }

  function _emptyState(icon, heading, subtext, actions = '') {
    return `
      <div class="ember-empty">
        <div class="ember-empty-icon">${icon}</div>
        <h3>${heading}</h3>
        <p>${subtext}</p>
        ${actions}
      </div>`;
  }

  /* ── Exports ──────────────────────────────────────────────────── */

  return {
    init,
    render,
    renderActiveTab,
    setGistStatus,
    openImportWizard,
  };

})();
