'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * EMBER / UI  —  All DOM rendering for the Ember module
 * ═══════════════════════════════════════════════════════════════════
 *
 * Four tabs:
 *   • Books    — master/detail: book grid → click → highlights pane
 *   • Library  — full searchable highlight list with category + book filter
 *   • Review   — SM-2 spaced repetition review mode with streak widget
 *   • Settings — email automation, EmailJS credentials, review settings
 *
 * Import wizard (3 steps):
 *   Step 1 — Category selection + Drag-drop / file picker
 *   Step 2 — Parse preview (count, samples, duplicate info)
 *   Step 3 — Success confirmation (auto-closes after 2 s)
 *
 * UI features:
 *   • Category filter tabs in Library (general / academic)
 *   • Debounced search (no focus loss)
 *   • Category badges on highlight cards
 *   • Streak widget with flame animation
 *   • SM-2 single-card review mode with rating buttons
 *   • Settings panel with EmailJS configuration
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
  let _activeTab              = 'books';
  let _selectedSourceId       = null;    // which book is open in the detail pane
  let _librarySearch          = '';
  let _libraryFilter          = 'all';   // 'all' or a sourceId
  let _libraryCategoryFilter  = 'all';   // 'all' | 'general' | 'academic'
  let _pendingParsed          = null;    // parser output waiting for confirmation
  let _pendingCategory        = null;    // category selected in import wizard
  let _gistStatusTimer        = null;
  let _searchDebounceTimer    = null;    // for debounced search

  // Review session state
  let _reviewQueue            = [];
  let _reviewIndex            = 0;
  let _reviewSessionActive    = false;

  // Quotes tab state
  let _quotesTagFilter        = 'all';
  let _quotesSearch           = '';

  // Bookmarks tab state
  let _bookmarksTypeFilter    = 'all';   // 'all' | 'article' | 'video'
  let _bookmarksTagFilter     = 'all';

  // Drawer state
  let _drawerType             = 'quote'; // 'quote' | 'article' | 'video'
  let _drawerQuoteTags        = [];
  let _drawerArticleTags      = [];
  let _drawerVideoTags        = [];

  /* ═══════════════════════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════════════════════ */

  function init() {
    _bindHeader();
    _bindImportWizard();
    _bindDrawer();
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
    ['books', 'library', 'quotes', 'bookmarks', 'review'].forEach(tab => {
      el(`ember-tab-${tab}`)?.classList.toggle('active', tab === _activeTab);
    });

    // Show/hide panes
    const panes = ['books', 'library', 'quotes', 'bookmarks', 'review'];
    panes.forEach(tab => {
      const pane = el(`ember-pane-${tab}`);
      if (pane) pane.style.display = tab === _activeTab ? '' : 'none';
    });

    if (_activeTab === 'books')     _renderBooks();
    if (_activeTab === 'library')   _renderLibrary();
    if (_activeTab === 'quotes')    _renderQuotes();
    if (_activeTab === 'bookmarks') _renderBookmarks();
    if (_activeTab === 'review')    _renderReview();
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
      `<span class="ember-stat"><strong>${stats.highlightCount}</strong> Highlight${stats.highlightCount !== 1 ? 's' : ''}</span>` +
      `<span class="ember-stat-sep">·</span>` +
      `<span class="ember-stat"><strong>${stats.quoteCount}</strong> Quote${stats.quoteCount !== 1 ? 's' : ''}</span>` +
      `<span class="ember-stat-sep">·</span>` +
      `<span class="ember-stat"><strong>${stats.bookmarkCount}</strong> Bookmark${stats.bookmarkCount !== 1 ? 's' : ''}</span>`;
  }

  function _bindHeader() {
    el('ember-import-btn')?.addEventListener('click', () => openImportWizard());
    el('ember-gist-save')?.addEventListener('click', () => window.App.Shell.triggerGistSave());
    el('ember-gist-load')?.addEventListener('click', () => window.App.Shell.triggerGistLoad());

    ['books', 'library', 'quotes', 'bookmarks', 'review'].forEach(tab => {
      el(`ember-tab-${tab}`)?.addEventListener('click', () => {
        _activeTab = tab;
        if (tab !== 'books') _selectedSourceId = null;
        // Reset review session when leaving review tab
        if (tab !== 'review') {
          _reviewSessionActive = false;
          _reviewQueue         = [];
          _reviewIndex         = 0;
        }
        // Reset quotes / bookmarks filter state when switching away
        if (tab !== 'quotes') {
          _quotesTagFilter = 'all';
          _quotesSearch    = '';
        }
        if (tab !== 'bookmarks') {
          _bookmarksTypeFilter = 'all';
          _bookmarksTagFilter  = 'all';
        }
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

    wrap.querySelectorAll('.ember-book-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.ember-book-del')) return;
        _selectedSourceId = card.dataset.sourceId;
        _renderBooksDetail(sources, _selectedSourceId);
      });
    });

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

    const byChapter = {};
    for (const hl of highlights) {
      const ch = hl.chapter || '—';
      if (!byChapter[ch]) byChapter[ch] = [];
      byChapter[ch].push(hl);
    }

    wrap.innerHTML = `
      <div class="ember-detail-layout">
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

    el('ember-detail-back')?.addEventListener('click', () => {
      _selectedSourceId = null;
      _renderBooksGrid(sources);
    });

    wrap.querySelectorAll('.ember-sidebar-item').forEach(item => {
      item.addEventListener('click', () => {
        _selectedSourceId = item.dataset.sid;
        _renderBooksDetail(sources, _selectedSourceId);
      });
    });

    _bindHighlightDelete(wrap);
  }

  /* ═══════════════════════════════════════════════════════════════
     LIBRARY TAB
     ═══════════════════════════════════════════════════════════════ */

  function _renderLibrary() {
    const sources       = window.App.Ember.getSources();
    const allHighlights = window.App.Ember.getHighlights();
    const wrap          = el('ember-library-content');
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

    // Render the full controls + category tabs on first render only
    // (search updates will only update the list, preserving input focus)
    wrap.innerHTML = `
      <!-- Category filter tabs -->
      <div class="ember-cat-tabs" id="ember-cat-tabs">
        <button class="ember-cat-tab ${_libraryCategoryFilter === 'all' ? 'active' : ''}" data-cat="all">All Books</button>
        <button class="ember-cat-tab ${_libraryCategoryFilter === 'general' ? 'active' : ''}" data-cat="general">📚 General Reading</button>
        <button class="ember-cat-tab ${_libraryCategoryFilter === 'academic' ? 'active' : ''}" data-cat="academic">🎓 Academic</button>
      </div>

      <!-- Search + book filter row -->
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
        <span class="ember-result-count" id="ember-result-count"></span>
      </div>

      <div class="ember-library-list" id="ember-lib-list"></div>`;

    // Render the highlights list (reused by debounced search too)
    _updateLibraryList(sources, allHighlights);

    // Bind category tabs
    wrap.querySelectorAll('.ember-cat-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _libraryCategoryFilter = btn.dataset.cat;
        wrap.querySelectorAll('.ember-cat-tab').forEach(b => b.classList.toggle('active', b.dataset.cat === _libraryCategoryFilter));
        _updateLibraryList(sources, allHighlights);
      });
    });

    // Bind search with debounce (preserves focus)
    const searchInput = el('ember-lib-search');
    searchInput?.addEventListener('input', e => {
      _librarySearch = e.target.value;
      clearTimeout(_searchDebounceTimer);
      _searchDebounceTimer = setTimeout(() => {
        _updateLibraryList(sources, allHighlights);
      }, 300);
    });

    // Bind book filter select
    el('ember-lib-filter')?.addEventListener('change', e => {
      _libraryFilter = e.target.value;
      _updateLibraryList(sources, allHighlights);
    });

    _bindHighlightDelete(wrap);
  }

  /**
   * Update only the highlights list and count (without re-rendering controls).
   * Called on search/filter change to preserve input focus.
   */
  function _updateLibraryList(sources, allHighlights) {
    let filtered = allHighlights;

    // Apply category filter
    if (_libraryCategoryFilter !== 'all') {
      filtered = filtered.filter(h => (h.category || 'general') === _libraryCategoryFilter);
    }

    // Apply book filter
    if (_libraryFilter !== 'all') {
      filtered = filtered.filter(h => h.sourceId === _libraryFilter);
    }

    // Apply search
    const q = _librarySearch.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(h =>
        h.text.toLowerCase().includes(q) ||
        (h.chapter || '').toLowerCase().includes(q),
      );
    }

    const listEl  = el('ember-lib-list');
    const countEl = el('ember-result-count');
    if (countEl) {
      countEl.textContent = `${filtered.length} highlight${filtered.length !== 1 ? 's' : ''}`;
    }
    if (!listEl) return;

    if (filtered.length === 0) {
      listEl.innerHTML = `<div class="ember-no-results">No highlights match your search</div>`;
    } else {
      listEl.innerHTML = filtered.map(hl => {
        const src = sources.find(s => s.id === hl.sourceId);
        return _buildHighlightCard(hl, src);
      }).join('');
    }

    _bindHighlightDelete(listEl);
  }

  /* ═══════════════════════════════════════════════════════════════
     REVIEW TAB  —  Daily digest list with SM-2 spaced repetition
     ═══════════════════════════════════════════════════════════════ */

  function _renderReview() {
    const wrap = el('ember-review-content');
    if (!wrap) return;

    const highlights = window.App.Ember.getDailyReview();
    const sources    = window.App.Ember.getSources();

    if (highlights.length === 0) {
      wrap.innerHTML = _emptyState(
        '📖',
        'No highlights yet',
        'Import some books to see your daily digest here',
      );
      return;
    }

    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    const cards = highlights.map((hl, i) => {
      const src    = sources.find(s => s.id === hl.sourceId);
      const accent = src ? _spineColor(src) : SPINE_PALETTE[i % SPINE_PALETTE.length];

      return `
        <div class="ember-review-single-card" style="border-left-color:${accent}">
          <blockquote class="ember-review-single-text">${_esc(hl.text)}</blockquote>
          <div class="ember-review-single-meta">
            ${src ? `<span class="ember-review-single-book" style="color:${accent}">${_esc(src.title)}</span>` : ''}
            ${src?.author ? `<span class="ember-review-single-author">— ${_esc(src.author)}</span>` : ''}
            ${hl.page     ? `<span class="ember-review-single-loc">p.${hl.page}</span>` :
              hl.location ? `<span class="ember-review-single-loc">loc.${hl.location}</span>` : ''}
          </div>
          ${_buildCategoryBadge(hl.category)}
        </div>`;
    }).join('');

    wrap.innerHTML = `
      <div class="ember-review-daily-header">
        <div class="ember-review-start-date">${_esc(today)}</div>
        <div class="ember-review-goal-note">${highlights.length} highlights for today</div>
      </div>

      <div class="ember-review-daily-list">
        ${cards}
      </div>`;
  }

  /* ── Streak Widget ─────────────────────────────────────────────── */

  /**
   * Build the streak widget HTML.
   * @param {object} streak  — streak data from App.Ember.getStreak()
   * @param {boolean} compact — smaller version when in active review session
   */
  function _buildStreakWidget(streak, compact = false) {
    const current = streak.currentStreak || 0;
    const longest = streak.longestStreak || 0;
    const days    = streak.totalReviewDays || 0;

    const intense = current >= 7;
    const flameClass = `ember-flame${intense ? ' ember-flame-intense' : ''}`;

    // Milestone badge
    let badge = '';
    if (current >= 100) badge = '<div class="ember-streak-badge">👑 Legend!</div>';
    else if (current >= 30) badge = '<div class="ember-streak-badge">⭐ Streak Master!</div>';
    else if (current >= 7)  badge = '<div class="ember-streak-badge">🔥 You\'re on fire!</div>';

    if (compact) {
      return `
        <div class="ember-streak-compact">
          <span class="${flameClass}">🔥</span>
          <span class="ember-streak-compact-count">${current}</span>
          <span class="ember-streak-compact-label">day streak</span>
          ${badge}
        </div>`;
    }

    return `
      <div class="ember-streak-widget">
        <div class="ember-streak-left">
          <div class="${flameClass}">🔥</div>
          <div class="ember-streak-count">${current}</div>
          <div class="ember-streak-day-label">day streak</div>
          ${badge}
        </div>
        <div class="ember-streak-right">
          <div class="ember-streak-stat">
            <span class="ember-streak-stat-val">${longest}</span>
            <span class="ember-streak-stat-lbl">longest</span>
          </div>
          <div class="ember-streak-stat">
            <span class="ember-streak-stat-val">${days}</span>
            <span class="ember-streak-stat-lbl">total days</span>
          </div>
        </div>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════
     SETTINGS TAB  —  Email automation, EmailJS credentials, review goal
     ═══════════════════════════════════════════════════════════════ */

  function _renderSettings() {
    const wrap = el('ember-settings-content');
    if (!wrap) return;

    const s = window.App.Ember.getSettings();
    const cfg = s.emailJSConfig || {};

    wrap.innerHTML = `
      <div class="ember-settings">

        <!-- Email Configuration -->
        <div class="ember-settings-section">
          <div class="ember-settings-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            Email Automation
          </div>
          <div class="ember-settings-info">
            Receive a daily digest of 10 General Reading highlights in your inbox.
            Academic highlights are excluded from email.
          </div>

          <div class="ember-settings-row">
            <label class="ember-settings-label">
              Recipient Email Addresses
              <span class="ember-settings-hint"> — press Enter or comma to add each address</span>
            </label>
            <!-- Chip input wrap — same visual pattern as the drawer tag input -->
            <div class="ember-email-wrap" id="es-email-wrap">
              ${(s.emails || []).map(addr => `
                <span class="ember-email-chip" data-email="${_esc(addr)}">
                  ${_esc(addr)}
                  <button class="ember-email-chip-del" aria-label="Remove ${_esc(addr)}" data-email="${_esc(addr)}">✕</button>
                </span>`).join('')}
              <input type="email" id="es-email-input" class="ember-email-input"
                     placeholder="${(s.emails || []).length === 0 ? 'you@example.com' : 'Add another…'}"
                     autocomplete="off" spellcheck="false">
            </div>
          </div>

          <div class="ember-settings-row ember-settings-toggle-row">
            <label class="ember-settings-label">Enable Email Automation</label>
            <label class="ember-toggle">
              <input type="checkbox" id="es-email-enabled" ${s.emailEnabled ? 'checked' : ''}>
              <span class="ember-toggle-slider"></span>
            </label>
          </div>

          <div class="ember-settings-row">
            <label class="ember-settings-label">Frequency</label>
            <select class="ember-settings-sel" id="es-frequency">
              <option value="daily"    ${s.emailFrequency === 'daily'    ? 'selected' : ''}>Daily</option>
              <option value="weekdays" ${s.emailFrequency === 'weekdays' ? 'selected' : ''}>Weekdays (Mon–Fri)</option>
              <option value="weekly"   ${s.emailFrequency === 'weekly'   ? 'selected' : ''}>Weekly (Mondays)</option>
            </select>
          </div>

          <div class="ember-settings-row">
            <label class="ember-settings-label">Delivery Time <span class="ember-settings-hint">(approximate — requires app to be open)</span></label>
            <input type="time" class="ember-settings-inp" id="es-time"
                   value="${_esc(s.emailTime || '08:00')}">
          </div>

          <button class="ember-settings-test-btn" id="es-test-btn">
            Send Test Email
          </button>
          <div class="ember-settings-test-result" id="es-test-result"></div>
        </div>

        <!-- EmailJS Credentials -->
        <div class="ember-settings-section">
          <div class="ember-settings-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            EmailJS Credentials
          </div>
          <div class="ember-settings-info">
            Create a free account at <strong>emailjs.com</strong> (200 emails/month free).
            Set up an email template with variables: <code>{{to_email}}</code>,
            <code>{{subject}}</code>, and <code>{{email_content}}</code> (mark as HTML).
          </div>

          <div class="ember-settings-row">
            <label class="ember-settings-label">Service ID</label>
            <input type="text" class="ember-settings-inp" id="es-service-id"
                   value="${_esc(cfg.serviceId || '')}" placeholder="service_xxxxxxx" autocomplete="off">
          </div>
          <div class="ember-settings-row">
            <label class="ember-settings-label">Template ID</label>
            <input type="text" class="ember-settings-inp" id="es-template-id"
                   value="${_esc(cfg.templateId || '')}" placeholder="template_xxxxxxx" autocomplete="off">
          </div>
          <div class="ember-settings-row">
            <label class="ember-settings-label">Public Key</label>
            <input type="text" class="ember-settings-inp" id="es-public-key"
                   value="${_esc(cfg.publicKey || '')}" placeholder="xxxxxxxxxxxxxxxxxxxx" autocomplete="off">
          </div>
        </div>

        <!-- Review Settings -->
        <div class="ember-settings-section">
          <div class="ember-settings-section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
            Review Settings
          </div>

          <div class="ember-settings-row">
            <label class="ember-settings-label">Daily Review Goal <span class="ember-settings-hint">(5–50 highlights)</span></label>
            <input type="number" class="ember-settings-inp ember-settings-inp-sm" id="es-daily-goal"
                   value="${s.dailyGoal || 10}" min="5" max="50">
          </div>
        </div>

        <!-- Actions -->
        <div class="ember-settings-actions">
          <button class="ember-settings-save-btn" id="es-save-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                 stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
            </svg>
            Save Settings
          </button>

          <button class="ember-settings-danger-btn" id="es-reset-streak-btn">
            Reset Review Streak
          </button>
        </div>

      </div>`;

    // Bind save
    el('es-save-btn')?.addEventListener('click', () => _saveSettings());

    // Bind reset streak
    el('es-reset-streak-btn')?.addEventListener('click', () => {
      if (confirm('Reset your current review streak to 0?\n\nThis cannot be undone.')) {
        window.App.Ember.resetStreak();
        if (_activeTab === 'settings') _renderSettings();
      }
    });

    // ── Multi-email chip input ─────────────────────────────────────
    _bindEmailChips();

    // Bind test email
    el('es-test-btn')?.addEventListener('click', async () => {
      const btn    = el('es-test-btn');
      const result = el('es-test-result');
      btn.disabled = true;
      btn.textContent = 'Sending…';
      if (result) { result.textContent = ''; result.className = 'ember-settings-test-result'; }

      try {
        // Save current settings first (silently — no toast)
        _saveSettings(false);
        const { sent, failed, errors } = await window.App.Ember.sendDailyEmail(true);
        if (result) {
          if (failed === 0) {
            result.textContent = `✓ Test email sent to ${sent} address${sent !== 1 ? 'es' : ''}. Check your inbox.`;
          } else {
            result.textContent = `✓ Sent to ${sent}, ✗ failed for ${failed}. ${errors.join('; ')}`;
          }
          result.classList.add(failed === 0 ? 'ember-test-success' : 'ember-test-error');
        }
      } catch (e) {
        if (result) {
          // EmailJS rejects with { status, text } — not a standard Error object
          const msg = e.message || e.text || (typeof e === 'string' ? e : JSON.stringify(e));
          result.textContent = '✗ ' + (msg || 'Unknown error — check browser console for details');
          result.classList.add('ember-test-error');
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send Test Email';
      }
    });
  }

  /**
   * Wire up the multi-email chip input in the Settings panel.
   * Chips are added on Enter / comma / Tab / blur.
   * Invalid email addresses are rejected with a shake animation.
   */
  function _bindEmailChips() {
    const wrap  = el('es-email-wrap');
    const input = el('es-email-input');
    if (!wrap || !input) return;

    function _addChip(raw) {
      const addr = raw.trim().toLowerCase();
      if (!addr) return;

      // Basic email format check
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
        input.classList.add('ember-email-input-shake');
        setTimeout(() => input.classList.remove('ember-email-input-shake'), 400);
        return;
      }

      // Deduplicate
      if (wrap.querySelector(`[data-email="${CSS.escape(addr)}"]`)) {
        input.value = '';
        return;
      }

      const chip = document.createElement('span');
      chip.className = 'ember-email-chip';
      chip.dataset.email = addr;
      chip.innerHTML = `${_esc(addr)}<button class="ember-email-chip-del" aria-label="Remove ${_esc(addr)}" data-email="${_esc(addr)}">✕</button>`;
      wrap.insertBefore(chip, input);
      input.value = '';
      input.placeholder = 'Add another…';
    }

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
        e.preventDefault();
        _addChip(input.value);
      }
      // Backspace on empty input removes the last chip
      if (e.key === 'Backspace' && input.value === '') {
        const chips = wrap.querySelectorAll('.ember-email-chip');
        if (chips.length > 0) chips[chips.length - 1].remove();
        if (wrap.querySelectorAll('.ember-email-chip').length === 0) {
          input.placeholder = 'you@example.com';
        }
      }
    });

    // Also add on paste of comma-separated addresses
    input.addEventListener('paste', e => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text');
      pasted.split(/[,;\s]+/).forEach(part => _addChip(part));
    });

    // Add on blur (user clicks away)
    input.addEventListener('blur', () => {
      if (input.value.trim()) _addChip(input.value);
    });

    // Remove chip on ✕ click (event delegation on wrap)
    wrap.addEventListener('click', e => {
      const del = e.target.closest('.ember-email-chip-del');
      if (!del) return;
      del.closest('.ember-email-chip')?.remove();
      if (wrap.querySelectorAll('.ember-email-chip').length === 0) {
        input.placeholder = 'you@example.com';
      }
    });

    // Clicking anywhere on the wrap focuses the input
    wrap.addEventListener('click', e => {
      if (!e.target.closest('.ember-email-chip-del') && !e.target.closest('.ember-email-chip')) {
        input.focus();
      }
    });
  }

  function _saveSettings(showToast = true) {
    // Collect email chips — flush any half-typed address in the input first
    const wrap      = el('es-email-wrap');
    const inputEl   = el('es-email-input');
    if (inputEl && inputEl.value.trim()) {
      // Trigger the chip-add logic by simulating blur-add
      const addr = inputEl.value.trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
        const chip = document.createElement('span');
        chip.className = 'ember-email-chip';
        chip.dataset.email = addr;
        chip.innerHTML = `${_esc(addr)}<button class="ember-email-chip-del" data-email="${_esc(addr)}">✕</button>`;
        wrap?.insertBefore(chip, inputEl);
        inputEl.value = '';
      }
    }
    const emails = wrap
      ? [...wrap.querySelectorAll('.ember-email-chip')].map(c => c.dataset.email).filter(Boolean)
      : [];

    const enabled    = el('es-email-enabled')?.checked || false;
    const frequency  = el('es-frequency')?.value || 'daily';
    const time       = el('es-time')?.value || '08:00';
    const serviceId  = el('es-service-id')?.value.trim() || '';
    const templateId = el('es-template-id')?.value.trim() || '';
    const publicKey  = el('es-public-key')?.value.trim() || '';
    const dailyGoal  = parseInt(el('es-daily-goal')?.value || '10', 10);

    const settings = {
      email:  '',    // legacy field — cleared; emails[] is now canonical
      emails,
      emailEnabled: enabled,
      emailFrequency: frequency,
      emailTime: time,
      emailJSConfig: { serviceId, templateId, publicKey },
      dailyGoal: Math.max(5, Math.min(50, dailyGoal || 10)),
    };

    if (showToast) {
      window.App.Ember.saveSettings(settings);
    } else {
      window.App.State.setEmberSettings(settings);
    }

    // Push settings to Gist immediately so sign-out / sign-in never resets them.
    // Fire-and-forget — only runs if credentials are already configured.
    const creds = window.App.State.getGistCredentials();
    if (creds.token && creds.id) {
      window.App.Ember.triggerGistSave();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     SHARED — HIGHLIGHT CARD
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Build a single highlight card with category badge.
   * @param {object} hl      — highlight object
   * @param {object} [source] — source object
   */
  function _buildHighlightCard(hl, source = null) {
    const accentColor = source ? _spineColor(source) : _hlColorHex(hl.color);

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
          <div class="ember-hl-foot">
            ${metaItems}
            ${_buildCategoryBadge(hl.category)}
          </div>
        </div>
        <button class="ember-hl-del" data-hl-id="${hl.id}" title="Delete highlight">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round" width="11" height="11">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>`;
  }

  /** Build a small category badge span. */
  function _buildCategoryBadge(category) {
    if (!category) return '';
    const isAcademic = category === 'academic';
    const cls  = isAcademic ? 'ember-cat-badge-academic' : 'ember-cat-badge-general';
    const icon = isAcademic ? '🎓' : '📚';
    const label = isAcademic ? 'academic' : 'general';
    return `<span class="ember-cat-badge ${cls}">${icon} ${label}</span>`;
  }

  function _hlColorHex(color) {
    const map = { yellow: '#f59e0b', blue: '#60a5fa', orange: '#fb923c', pink: '#f472b6' };
    return map[color] || 'var(--b2)';
  }

  function _bindHighlightDelete(container) {
    container.querySelectorAll('.ember-hl-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        window.App.Ember.deleteHighlight(btn.dataset.hlId);
        render();
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     QUOTES TAB
     ═══════════════════════════════════════════════════════════════ */

  function _renderQuotes() {
    const wrap = el('ember-quotes-content');
    if (!wrap) return;

    const quotes = window.App.Ember.getQuotes({
      tag:    _quotesTagFilter !== 'all' ? _quotesTagFilter : undefined,
      search: _quotesSearch || undefined,
    });
    const allTags = window.App.Ember.getAllQuoteTags();

    // ── Tag filter strip ───────────────────────────────────────────
    const tagPillsHtml = [
      `<span class="ember-tag-pill ember-tag-all ${_quotesTagFilter === 'all' ? 'active' : ''}"
            data-tag="all">All</span>`,
      ...allTags.map(t => {
        const ns  = _tagNs(t);
        const active = _quotesTagFilter === t ? 'active' : '';
        return `<span class="ember-tag-pill ${active}" data-tag="${_esc(t)}" data-ns="${ns}">${_esc(t)}</span>`;
      }),
    ].join('');

    // ── Cards ──────────────────────────────────────────────────────
    const cardsHtml = quotes.length > 0
      ? quotes.map(q => _buildQuoteCard(q)).join('')
      : _emptyState('💬', 'No quotes yet',
          _quotesTagFilter !== 'all' || _quotesSearch
            ? 'No quotes match your filter.'
            : 'Add quotes you find on X, podcasts, or books.',
          `<button class="abtn primary" onclick="window.App.EmberUI.openAddDrawer('quote')">+ Add Quote</button>`);

    wrap.innerHTML = `
      <div class="ember-quotes-toolbar">
        <div class="ember-search-wrap">
          <svg class="ember-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input class="ember-search-input" id="ember-quotes-search"
                 placeholder="Search quotes…" value="${_esc(_quotesSearch)}">
        </div>
        <button class="abtn primary sm" onclick="window.App.EmberUI.openAddDrawer('quote')">+ Add Quote</button>
      </div>
      <div class="ember-tag-filter-strip" id="ember-quotes-tag-strip">${tagPillsHtml}</div>
      <div class="ember-quotes-list" id="ember-quotes-list">${cardsHtml}</div>`;

    // Search
    const searchEl = el('ember-quotes-search');
    let _debounce = null;
    searchEl?.addEventListener('input', () => {
      clearTimeout(_debounce);
      _debounce = setTimeout(() => {
        _quotesSearch = searchEl.value;
        _renderQuotes();
      }, 220);
    });

    // Tag filter pills
    el('ember-quotes-tag-strip')?.querySelectorAll('.ember-tag-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        _quotesTagFilter = pill.dataset.tag;
        _renderQuotes();
      });
    });

    // Card actions: star, delete
    el('ember-quotes-list')?.querySelectorAll('.ember-quote-star').forEach(btn => {
      btn.addEventListener('click', () => {
        window.App.Ember.toggleQuoteStar(btn.dataset.id);
        _renderQuotes();
        _renderHeaderStats();
      });
    });
    el('ember-quotes-list')?.querySelectorAll('.ember-quote-del').forEach(btn => {
      btn.addEventListener('click', () => {
        window.App.Ember.deleteQuote(btn.dataset.id);
        _renderQuotes();
        _renderHeaderStats();
      });
    });
  }

  function _buildQuoteCard(q) {
    const tags = (q.tags || []).map(t =>
      `<span class="ember-tag-pill" data-ns="${_tagNs(t)}" style="font-size:10px;padding:2px 8px">${_esc(t)}</span>`
    ).join('');

    const date = q.addedAt
      ? new Date(q.addedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';

    const starClass = q.starred ? 'ember-quote-star on' : 'ember-quote-star';
    const urlLink   = q.url
      ? `<a class="ember-quote-url" href="${_esc(q.url)}" target="_blank" rel="noopener" title="${_esc(q.url)}">↗ source</a>`
      : '';

    return `
      <div class="ember-quote-card${q.starred ? ' starred' : ''}" data-id="${q.id}">
        <div class="ember-quote-text">${_esc(q.text)}</div>
        <div class="ember-quote-footer">
          <div class="ember-quote-tags">${tags}</div>
          <div class="ember-quote-meta-right">
            ${urlLink}
            <span class="ember-quote-date">${date}</span>
            <button class="${starClass}" data-id="${q.id}" title="${q.starred ? 'Unstar' : 'Star'}">★</button>
            <button class="ember-quote-del" data-id="${q.id}" title="Delete">✕</button>
          </div>
        </div>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════
     BOOKMARKS TAB
     ═══════════════════════════════════════════════════════════════ */

  function _renderBookmarks() {
    const wrap = el('ember-bookmarks-content');
    if (!wrap) return;

    const bookmarks = window.App.Ember.getBookmarks({
      type: _bookmarksTypeFilter !== 'all' ? _bookmarksTypeFilter : undefined,
      tag:  _bookmarksTagFilter  !== 'all' ? _bookmarksTagFilter  : undefined,
    });
    const allTags = window.App.Ember.getAllBookmarkTags();

    // ── Type toggle ────────────────────────────────────────────────
    const types = [
      { id: 'all',     label: 'All' },
      { id: 'article', label: '📄 Articles' },
      { id: 'video',   label: '▶ Videos' },
    ];
    const typeToggleHtml = types.map(t =>
      `<button class="ember-bm-type-btn${_bookmarksTypeFilter === t.id ? ' active' : ''}" data-type="${t.id}">${t.label}</button>`
    ).join('');

    // ── Tag filter strip ───────────────────────────────────────────
    const tagPillsHtml = [
      `<span class="ember-tag-pill ember-tag-all ${_bookmarksTagFilter === 'all' ? 'active' : ''}"
            data-tag="all">All</span>`,
      ...allTags.map(t => {
        const active = _bookmarksTagFilter === t ? 'active' : '';
        return `<span class="ember-tag-pill ${active}" data-tag="${_esc(t)}" data-ns="${_tagNs(t)}">${_esc(t)}</span>`;
      }),
    ].join('');

    // ── Cards ──────────────────────────────────────────────────────
    const cardsHtml = bookmarks.length > 0
      ? bookmarks.map(b => _buildBookmarkCard(b)).join('')
      : _emptyState('🔖', 'No bookmarks yet',
          _bookmarksTypeFilter !== 'all' || _bookmarksTagFilter !== 'all'
            ? 'No bookmarks match your filter.'
            : 'Save articles and videos you want to keep.',
          `<button class="abtn primary" onclick="window.App.EmberUI.openAddDrawer('article')">+ Save Link</button>`);

    wrap.innerHTML = `
      <div class="ember-bm-toolbar">
        <div class="ember-bm-type-toggle" id="ember-bm-type-toggle">${typeToggleHtml}</div>
        <button class="abtn primary sm" onclick="window.App.EmberUI.openAddDrawer('article')">+ Save Link</button>
      </div>
      <div class="ember-tag-filter-strip" id="ember-bm-tag-strip">${tagPillsHtml}</div>
      <div class="ember-bm-list" id="ember-bm-list">${cardsHtml}</div>`;

    // Type toggle
    el('ember-bm-type-toggle')?.querySelectorAll('.ember-bm-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _bookmarksTypeFilter = btn.dataset.type;
        _renderBookmarks();
      });
    });

    // Tag filter
    el('ember-bm-tag-strip')?.querySelectorAll('.ember-tag-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        _bookmarksTagFilter = pill.dataset.tag;
        _renderBookmarks();
      });
    });

    // Card actions: done toggle, delete
    el('ember-bm-list')?.querySelectorAll('.ember-bm-done-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.App.Ember.toggleBookmarkStatus(btn.dataset.id);
        _renderBookmarks();
        _renderHeaderStats();
      });
    });
    el('ember-bm-list')?.querySelectorAll('.ember-bm-del').forEach(btn => {
      btn.addEventListener('click', () => {
        window.App.Ember.deleteBookmark(btn.dataset.id);
        _renderBookmarks();
        _renderHeaderStats();
      });
    });
  }

  function _buildBookmarkCard(b) {
    const tags = (b.tags || []).map(t =>
      `<span class="ember-tag-pill" data-ns="${_tagNs(t)}" style="font-size:10px;padding:2px 8px">${_esc(t)}</span>`
    ).join('');

    const date = b.addedAt
      ? new Date(b.addedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : '';

    const isVideo   = b.type === 'video';
    const thumbIcon = isVideo ? '▶' : '📄';
    const thumbCls  = isVideo ? 'video-thumb' : 'article-thumb';
    const badgeCls  = isVideo ? 'video'        : 'article';
    const badgeLbl  = isVideo ? 'Video'         : 'Article';
    const doneLbl   = b.status === 'done' ? '✓ Done' : 'Mark done';

    const noteHtml = b.note
      ? `<div class="ember-bm-note">${_esc(b.note)}</div>`
      : '';

    return `
      <div class="ember-bm-card${b.status === 'done' ? ' done' : ''}">
        <div class="ember-bm-thumb ${thumbCls}">${thumbIcon}</div>
        <div class="ember-bm-body">
          <a class="ember-bm-title" href="${_esc(b.url)}" target="_blank" rel="noopener">${_esc(b.title)}</a>
          <div class="ember-bm-url">${_esc(_shortenUrl(b.url))}</div>
          ${noteHtml}
          <div class="ember-bm-footer">
            <span class="ember-bm-badge ${badgeCls}">${badgeLbl}</span>
            ${tags}
            <span class="ember-bm-date">${date}</span>
          </div>
        </div>
        <div class="ember-bm-actions">
          <button class="ember-bm-done-btn${b.status === 'done' ? ' on' : ''}" data-id="${b.id}">${doneLbl}</button>
          <button class="ember-bm-del" data-id="${b.id}" title="Delete">✕</button>
        </div>
      </div>`;
  }

  /** Shorten a URL to domain + path (max 48 chars) for display. */
  function _shortenUrl(url) {
    try {
      const u = new URL(url);
      const short = u.hostname + u.pathname;
      return short.length > 48 ? short.slice(0, 45) + '…' : short;
    } catch (_) {
      return url.length > 48 ? url.slice(0, 45) + '…' : url;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     TAG HELPERS  — shared by Quotes and Bookmarks
     ═══════════════════════════════════════════════════════════════ */

  /** Extract namespace prefix from a tag string, e.g. "author:Naval" → "author". */
  function _tagNs(tag) {
    const prefix = (tag || '').split(':')[0];
    return ['author', 'topic', 'source', 'mood'].includes(prefix) ? prefix : 'default';
  }

  /* ═══════════════════════════════════════════════════════════════
     ADD QUOTE / SAVE BOOKMARK DRAWER
     ═══════════════════════════════════════════════════════════════ */

  function openAddDrawer(type) {
    _drawerType = type || 'quote';
    _drawerQuoteTags   = [];
    _drawerArticleTags = [];
    _drawerVideoTags   = [];

    // Clear all form fields
    ['ember-q-text', 'ember-q-url', 'ember-a-url', 'ember-a-title',
     'ember-a-note', 'ember-v-url', 'ember-v-title', 'ember-v-note'].forEach(id => {
      const inp = el(id);
      if (inp) inp.value = '';
    });
    // Clear tag pill areas
    _renderTagPills('ember-q-tag-wrap', 'ember-q-tag-input', _drawerQuoteTags);
    _renderTagPills('ember-a-tag-wrap', 'ember-a-tag-input', _drawerArticleTags);
    _renderTagPills('ember-v-tag-wrap', 'ember-v-tag-input', _drawerVideoTags);

    _switchDrawerType(_drawerType);
    el('ember-drawer-ov')?.classList.add('active');
  }

  function _closeDrawer() {
    el('ember-drawer-ov')?.classList.remove('active');
  }

  function _switchDrawerType(type) {
    _drawerType = type;
    ['quote', 'article', 'video'].forEach(t => {
      el(`ember-dtype-${t}`)?.classList.toggle('active', t === type);
      const form = el(`ember-dform-${t}`);
      if (form) form.style.display = t === type ? '' : 'none';
    });
    const labels = { quote: 'Add Quote', article: 'Save Article', video: 'Save Video' };
    const submitBtn = el('ember-drawer-submit');
    if (submitBtn) submitBtn.textContent = labels[type] || 'Save';
  }

  function _bindDrawer() {
    // Overlay background click closes
    el('ember-drawer-ov')?.addEventListener('click', e => {
      if (e.target === el('ember-drawer-ov')) _closeDrawer();
    });
    el('ember-drawer-cancel')?.addEventListener('click', _closeDrawer);
    el('ember-drawer-submit')?.addEventListener('click', _submitDrawer);

    // Type switcher buttons
    el('ember-drawer-type-toggle')?.querySelectorAll('.ember-dtype-btn').forEach(btn => {
      btn.addEventListener('click', () => _switchDrawerType(btn.dataset.type));
    });

    // Tag input binding for each form
    _bindTagInput('ember-q-tag-wrap', 'ember-q-tag-input', 'ember-q-tag-sug', _drawerQuoteTags,
      () => window.App.Ember.getAllQuoteTags());
    _bindTagInput('ember-a-tag-wrap', 'ember-a-tag-input', 'ember-a-tag-sug', _drawerArticleTags,
      () => window.App.Ember.getAllBookmarkTags());
    _bindTagInput('ember-v-tag-wrap', 'ember-v-tag-input', 'ember-v-tag-sug', _drawerVideoTags,
      () => window.App.Ember.getAllBookmarkTags());
  }

  function _submitDrawer() {
    try {
      if (_drawerType === 'quote') {
        const text = (el('ember-q-text')?.value || '').trim();
        if (!text) { el('ember-q-text')?.focus(); window.App.Shell.toast('Quote text is required', 'warn'); return; }
        window.App.Ember.addQuote({
          text,
          tags: [..._drawerQuoteTags],
          url:  (el('ember-q-url')?.value || '').trim(),
        });
        _activeTab = 'quotes';

      } else if (_drawerType === 'article') {
        const url   = (el('ember-a-url')?.value   || '').trim();
        const title = (el('ember-a-title')?.value || '').trim();
        if (!url)   { el('ember-a-url')?.focus();   window.App.Shell.toast('URL is required', 'warn'); return; }
        if (!title) { el('ember-a-title')?.focus(); window.App.Shell.toast('Title is required', 'warn'); return; }
        window.App.Ember.addBookmark({
          type: 'article', url, title,
          tags: [..._drawerArticleTags],
          note: (el('ember-a-note')?.value || '').trim(),
        });
        _activeTab = 'bookmarks';

      } else if (_drawerType === 'video') {
        const url   = (el('ember-v-url')?.value   || '').trim();
        const title = (el('ember-v-title')?.value || '').trim();
        if (!url)   { el('ember-v-url')?.focus();   window.App.Shell.toast('URL is required', 'warn'); return; }
        if (!title) { el('ember-v-title')?.focus(); window.App.Shell.toast('Title is required', 'warn'); return; }
        window.App.Ember.addBookmark({
          type: 'video', url, title,
          tags: [..._drawerVideoTags],
          note: (el('ember-v-note')?.value || '').trim(),
        });
        _activeTab = 'bookmarks';
      }

      _closeDrawer();
      render();
    } catch (err) {
      window.App.Shell.toast(err.message, 'error');
    }
  }

  /* ── Tag input component ──────────────────────────────────────── */

  /**
   * Wire up a tag input:  wrap (holds pills + input), input (the text field),
   * sugBox (dropdown), tagArr (live array mutated in place), getSuggestions (fn).
   */
  function _bindTagInput(wrapId, inputId, sugId, tagArr, getSuggestions) {
    const wrapEl  = el(wrapId);
    const inputEl = el(inputId);
    const sugEl   = el(sugId);
    if (!wrapEl || !inputEl) return;

    wrapEl.addEventListener('click', () => inputEl.focus());

    inputEl.addEventListener('input', () => {
      const val = inputEl.value;
      if (!sugEl) return;
      const all  = getSuggestions();
      const lc   = val.toLowerCase();
      const matches = lc
        ? all.filter(t => t.toLowerCase().includes(lc) && !tagArr.includes(t)).slice(0, 6)
        : all.filter(t => !tagArr.includes(t)).slice(0, 6);

      if (matches.length) {
        sugEl.innerHTML = matches.map(m =>
          `<div class="ember-tag-sug-item" data-tag="${_esc(m)}">${_esc(m)}</div>`
        ).join('');
        sugEl.style.display = '';
        sugEl.querySelectorAll('.ember-tag-sug-item').forEach(item => {
          item.addEventListener('mousedown', e => {
            e.preventDefault();
            _addTag(tagArr, item.dataset.tag, wrapId, inputId);
            sugEl.style.display = 'none';
          });
        });
      } else {
        sugEl.style.display = 'none';
      }
    });

    inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = inputEl.value.replace(/,$/, '').trim();
        if (val) _addTag(tagArr, val, wrapId, inputId);
        if (sugEl) sugEl.style.display = 'none';
      } else if (e.key === 'Backspace' && !inputEl.value) {
        if (tagArr.length) {
          tagArr.pop();
          _renderTagPills(wrapId, inputId, tagArr);
        }
      } else if (e.key === 'Escape') {
        if (sugEl) sugEl.style.display = 'none';
      }
    });

    inputEl.addEventListener('blur', () => {
      setTimeout(() => { if (sugEl) sugEl.style.display = 'none'; }, 150);
    });
  }

  function _addTag(tagArr, tag, wrapId, inputId) {
    tag = tag.trim();
    if (!tag || tagArr.includes(tag)) return;
    tagArr.push(tag);
    _renderTagPills(wrapId, inputId, tagArr);
    const inputEl = el(inputId);
    if (inputEl) inputEl.value = '';
  }

  function _renderTagPills(wrapId, inputId, tagArr) {
    const wrapEl  = el(wrapId);
    const inputEl = el(inputId);
    if (!wrapEl || !inputEl) return;

    // Remove existing pills (keep the input)
    wrapEl.querySelectorAll('.ember-drawer-tag-pill').forEach(p => p.remove());

    // Insert pills before the input
    for (let i = tagArr.length - 1; i >= 0; i--) {
      const tag  = tagArr[i];
      const pill = document.createElement('span');
      pill.className = `ember-drawer-tag-pill`;
      pill.dataset.ns = _tagNs(tag);
      pill.innerHTML  = `${_esc(tag)} <span class="ember-drawer-tag-remove" data-idx="${i}">×</span>`;
      wrapEl.insertBefore(pill, inputEl);
    }

    // Bind remove buttons
    wrapEl.querySelectorAll('.ember-drawer-tag-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        tagArr.splice(parseInt(btn.dataset.idx, 10), 1);
        _renderTagPills(wrapId, inputId, tagArr);
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     IMPORT WIZARD
     ═══════════════════════════════════════════════════════════════ */

  function openImportWizard() {
    _pendingParsed   = null;
    _pendingCategory = null;

    const fi = el('ember-file-input');
    if (fi) fi.value = '';

    const dropzone = el('ember-dropzone');
    if (dropzone) {
      dropzone.classList.remove('has-file', 'dragover');
      const nameEl = el('ember-dropzone-name');
      if (nameEl) nameEl.textContent = '';
    }

    // Reset category selection UI
    document.querySelectorAll('.ember-cat-option').forEach(opt => opt.classList.remove('selected'));

    const errEl = el('ember-parse-error');
    if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }

    _showStep(1);
    el('ember-import-ov').classList.add('active');
  }

  function _closeImportWizard() {
    el('ember-import-ov').classList.remove('active');
    _pendingParsed   = null;
    _pendingCategory = null;
  }

  function _showStep(step) {
    [1, 2, 3].forEach(i => {
      el(`ember-istep-${i}`)?.classList.toggle('active', i === step);
      el(`ember-istep-${i}`)?.classList.toggle('done',   i < step);
      const pane = el(`ember-istep-content-${i}`);
      if (pane) pane.style.display = i === step ? '' : 'none';
    });

    const cancelBtn  = el('ember-import-cancel');
    const backBtn    = el('ember-import-back');
    const confirmBtn = el('ember-import-confirm');

    if (cancelBtn)  cancelBtn.style.display  = step === 3 ? 'none' : '';
    if (backBtn)    backBtn.style.display     = step === 2 ? '' : 'none';
    if (confirmBtn) confirmBtn.style.display  = step === 2 ? '' : 'none';
  }

  function _bindImportWizard() {
    el('ember-import-close')?.addEventListener('click', _closeImportWizard);

    el('ember-import-ov')?.addEventListener('click', e => {
      if (e.target === el('ember-import-ov')) _closeImportWizard();
    });

    // Category option clicks
    document.querySelectorAll('.ember-cat-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.ember-cat-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        _pendingCategory = opt.dataset.cat;

        // Clear any "select category" error
        const errEl = el('ember-parse-error');
        if (errEl && errEl.textContent.includes('category')) {
          errEl.style.display = 'none';
        }
      });
    });

    // Drag-drop zone
    const dropzone  = el('ember-dropzone');
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

    // Require category selection before proceeding
    if (!_pendingCategory) {
      if (errEl) {
        errEl.textContent = 'Please select a category (General Reading or Academic Reading) before uploading.';
        errEl.style.display = '';
      }
      return;
    }

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
          errEl.textContent = 'Could not parse this file. Please upload a Kindle TXT, Kindle HTML Notebook Export, or an Ember-compatible JSON file.';
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

  /** Map internal format identifiers to human-readable labels. */
  function _fmtLabel(format) {
    const map = {
      'kindle-html': 'Kindle HTML',
      'kindle-txt':  'Kindle TXT',
      'pdf':         'PDF (JSON)',
      'json':        'JSON Import',
    };
    return map[format] || format || 'Unknown';
  }

  function _buildPreview(parsed) {
    const previewEl = el('ember-preview-content');
    if (!previewEl) return;

    const existingHashes = new Set(window.App.Ember.getHighlights().map(h => h.hash));
    const totalFound  = parsed.reduce((n, p) => n + p.highlights.length, 0);
    const newCount    = parsed.reduce((n, p) => n + p.highlights.filter(h => !existingHashes.has(h.hash)).length, 0);
    const skipCount   = totalFound - newCount;

    const samples = parsed[0]?.highlights.slice(0, 3) || [];
    const catLabel = _pendingCategory === 'academic' ? '🎓 Academic Reading' : '📚 General Reading';

    previewEl.innerHTML = `
      <div class="ember-preview-books">
        ${parsed.map(p => `
          <div class="ember-preview-book">
            <div class="ember-preview-book-title">${_esc(p.title)}</div>
            <div class="ember-preview-book-author">by ${_esc(p.author)}</div>
            <div class="ember-preview-book-fmt">${_fmtLabel(p.format)}</div>
            <div class="ember-preview-book-count">${p.highlights.length} highlights found</div>
          </div>`).join('')}
      </div>

      <div class="ember-preview-summary">
        <span class="ember-preview-new-badge">${newCount} new</span>
        ${skipCount > 0 ? `<span class="ember-preview-skip-badge">${skipCount} duplicates (will skip)</span>` : ''}
        <span class="ember-preview-cat-badge ${_pendingCategory === 'academic' ? 'academic' : 'general'}">${catLabel}</span>
      </div>

      <div class="ember-import-gist-note">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
             stroke-linecap="round" stroke-linejoin="round" width="13" height="13" style="flex-shrink:0;margin-top:1px">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Import saves to local storage only — press <strong>Gist Save</strong> in the header to sync to cloud.
      </div>

      ${samples.length > 0 ? `
        <div class="ember-preview-samples">
          <div class="ember-preview-samples-label">Sample highlights:</div>
          ${samples.map(h => `
            <div class="ember-preview-sample">"${_esc(h.text.length > 140 ? h.text.slice(0, 140) + '…' : h.text)}"</div>
          `).join('')}
        </div>` : ''}`;

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

    const result = window.App.Ember.importParsed(_pendingParsed, _pendingCategory || 'general');
    _pendingParsed   = null;
    _pendingCategory = null;
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
    if (confirm(`Delete "${source.title}" and all ${n} highlight${n !== 1 ? 's' : ''}?\n\nThis cannot be undone.`)) {
      _selectedSourceId = null;
      window.App.Ember.deleteSource(source.id);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     SHARED HELPERS
     ═══════════════════════════════════════════════════════════════ */

  function _esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _spineColor(source) {
    if (source.color) return source.color;
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

  /**
   * Render the Ember settings form into an arbitrary container element.
   * Called by the unified Settings module so the form appears there
   * instead of in a dedicated Ember tab.
   *
   * @param {HTMLElement} container
   */
  function renderSettingsInto(container) {
    if (!container) return;
    // Temporarily point ember-settings-content to the provided container,
    // then call the existing renderer which writes into that ID.
    const prev = container.id;
    container.id = 'ember-settings-content';
    _renderSettings();
    container.id = prev;
  }

  return {
    init,
    render,
    renderActiveTab,
    setGistStatus,
    openImportWizard,
    openAddDrawer,
    renderSettingsInto,
  };

})();
