'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * EMBER MODULE  —  Business logic & state management
 * ═══════════════════════════════════════════════════════════════════
 *
 * Phase 1 responsibilities (unchanged):
 *   • CRUD for sources (books) and highlights
 *   • Import orchestration — calls ember-data.js parser, deduplicates
 *   • Daily review — date-seeded shuffle, consistent within a day
 *   • GitHub Gist sync — saves full unified state (all modules)
 *   • App.Shell registration — lazy init on first sidebar click
 *
 * Phase 2 additions:
 *   • Book categorization — category field on highlights
 *   • Spaced Repetition (SM-2 algorithm) — review queue, submitReview
 *   • Review streak tracking — daily streak, history, milestones
 *   • Email automation — EmailJS integration, daily digest generator
 *   • Settings management — getSettings / saveSettings
 *   • Separate Gist file for Ember data (ember-highlights.json)
 *
 * DATA FLOW:
 *   1. init()          → App.State.getEmberData() → seed if empty
 *   2. importParsed()  → dedup by hash → App.State.setEmberData()
 *   3. deleteSource()  → cascades to highlights → setEmberData()
 *   4. submitReview()  → SM-2 calc → saves srData → updates streak
 *   5. triggerGistSave() → App.Gist.saveEmberData()
 * ═══════════════════════════════════════════════════════════════════
 */
window.App = window.App || {};

window.App.Ember = window.App.Ember || {};

window.App.Ember = (() => {

  // Preserve ember-data.js sub-module reference
  const _existing = window.App.Ember;

  /* ── Spine colour palette ─────────────────────────────────────── */

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
     SOURCES (Books)
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
   * @param {string} [category]   — 'general' | 'academic' (default: 'general')
   * @returns {{ imported: number, skipped: number, sourceNames: string[] }}
   */
  function importParsed(parsedSources, category = 'general') {
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
          // Phase 2 fields
          category:  category,
          srData:    null, // initialized lazily on first review
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
     DAILY REVIEW (Phase 1 — kept for backward compat)
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Returns up to 10 highlights for today.
   * Uses a date-seeded LCG shuffle — same set shown all day (like Readwise).
   * Phase 2 note: the Review tab now uses getReviewQueue() instead.
   */
  function getDailyReview() {
    const highlights = _data().highlights;
    if (highlights.length === 0) return [];

    // 1. Stable sort by id so order is reproducible regardless of insertion order
    const sorted = [...highlights].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    // 2. Shuffle once with a fixed seed so the deck stays constant between days
    //    (changes only when new highlights are imported — which is fine).
    const FIXED_SEED = 0xD15EA5E;
    let s = FIXED_SEED >>> 0;
    for (let i = sorted.length - 1; i > 0; i--) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const j = s % (i + 1);
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }

    // 3. Day-based window: advances by `count` each day, wraps around
    //    so every highlight cycles through before anything repeats.
    const n        = sorted.length;
    const count    = Math.min(10, n);
    const dayNum   = Math.floor(Date.now() / 86400000); // UTC days since epoch
    const startIdx = (dayNum * count) % n;

    const result = [];
    for (let i = 0; i < count; i++) {
      result.push(sorted[(startIdx + i) % n]);
    }
    return result;
  }

  /* ═══════════════════════════════════════════════════════════════
     SPACED REPETITION — SM-2 ALGORITHM  (Phase 2)
     ═══════════════════════════════════════════════════════════════ */

  /** Default srData for a highlight that has never been reviewed. */
  function _defaultSrData() {
    return {
      easeFactor:  2.5,
      interval:    0,
      repetitions: 0,
      nextReview:  null,   // ISO date string (YYYY-MM-DD) or null
      lastReviewed: null,
      totalReviews: 0,
    };
  }

  /**
   * Compute next SM-2 values after a review.
   *
   * @param {object} srData    — current srData (may be null for first review)
   * @param {number} quality   — 0=Again, 3=Hard, 4=Good, 5=Easy
   * @returns {object} updated srData
   */
  function _computeSM2(srData, quality) {
    let {
      easeFactor  = 2.5,
      interval    = 0,
      repetitions = 0,
      totalReviews = 0,
    } = srData || {};

    const today = new Date().toISOString().split('T')[0];

    if (quality < 3) {
      // "Again" — reset to 1 day
      repetitions = 0;
      interval    = 1;
    } else {
      // Calculate next interval
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * easeFactor);
      }

      // Update ease factor
      easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      easeFactor = Math.max(1.3, Math.min(3.0, easeFactor));
      easeFactor = Math.round(easeFactor * 100) / 100; // 2 decimal places

      repetitions++;
    }

    // Calculate next review date
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + interval);
    const nextReview = nextDate.toISOString().split('T')[0];

    return {
      easeFactor,
      interval,
      repetitions,
      nextReview,
      lastReviewed: today,
      totalReviews: totalReviews + 1,
    };
  }

  /**
   * Returns interval preview string for a rating button (e.g., "6d", "2w").
   * @param {object|null} srData
   * @param {number} quality
   */
  function getIntervalPreview(srData, quality) {
    if (quality < 3) return '<1d';

    let { easeFactor = 2.5, interval = 0, repetitions = 0 } = srData || {};

    let newInterval;
    if (repetitions === 0) newInterval = 1;
    else if (repetitions === 1) newInterval = 6;
    else newInterval = Math.round(interval * easeFactor);

    if (newInterval < 1)   return '<1d';
    if (newInterval === 1) return '1d';
    if (newInterval < 7)   return `${newInterval}d`;
    if (newInterval < 30)  return `${Math.round(newInterval / 7)}w`;
    if (newInterval < 365) return `${Math.round(newInterval / 30)}mo`;
    return `${Math.round(newInterval / 365)}y`;
  }

  /**
   * Build the review queue: due highlights (nextReview ≤ today) + new highlights.
   * Overdue first, then new.
   * @returns {Array} highlight objects (with source info attached for convenience)
   */
  function getReviewQueue() {
    const today      = new Date().toISOString().split('T')[0];
    const highlights = _data().highlights;

    const due = highlights.filter(h => {
      const sr = h.srData;
      return sr && sr.nextReview && sr.nextReview <= today;
    });

    const newHls = highlights.filter(h => !h.srData || !h.srData.nextReview);

    return [...due, ...newHls];
  }

  /**
   * Process a review rating for a highlight (SM-2).
   * Updates srData, saves state, updates streak.
   *
   * @param {string} highlightId
   * @param {number} quality — 0, 3, 4, or 5
   */
  function submitReview(highlightId, quality) {
    const d  = _data();
    const hl = d.highlights.find(h => h.id === highlightId);
    if (!hl) return;

    if (!hl.srData) hl.srData = _defaultSrData();

    hl.srData = _computeSM2(hl.srData, quality);
    _save(d);

    _updateStreak();
  }

  /* ═══════════════════════════════════════════════════════════════
     REVIEW STREAK  (Phase 2)
     ═══════════════════════════════════════════════════════════════ */

  function _defaultStreak() {
    return {
      currentStreak:  0,
      longestStreak:  0,
      lastReviewDate: null,
      totalReviewDays: 0,
      reviewHistory:  [],
    };
  }

  /**
   * Update streak after a review action.
   * Called by submitReview — increments count and updates dates.
   */
  function _updateStreak() {
    const today   = new Date().toISOString().split('T')[0];
    const streak  = window.App.State.getEmberStreak();

    // Update or create today's history entry
    let todayEntry = streak.reviewHistory.find(e => e.date === today);
    if (!todayEntry) {
      todayEntry = { date: today, count: 0 };
      streak.reviewHistory.push(todayEntry);
      // Keep only last 365 days
      if (streak.reviewHistory.length > 365) {
        streak.reviewHistory = streak.reviewHistory.slice(-365);
      }
    }
    todayEntry.count++;

    // Only update streak/totalDays once per day (first review of the day)
    if (streak.lastReviewDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      if (streak.lastReviewDate === yesterdayStr) {
        streak.currentStreak++;
      } else {
        streak.currentStreak = 1; // gap or first ever
      }

      if (streak.currentStreak > streak.longestStreak) {
        streak.longestStreak = streak.currentStreak;
      }

      streak.lastReviewDate  = today;
      streak.totalReviewDays = (streak.totalReviewDays || 0) + 1;
    }

    window.App.State.setEmberStreak(streak);
  }

  /** Public getter for streak data (used by UI). */
  function getStreak() {
    return window.App.State.getEmberStreak();
  }

  /**
   * Reset current streak to 0 (destructive — confirmed by UI before calling).
   */
  function resetStreak() {
    const streak = window.App.State.getEmberStreak();
    streak.currentStreak = 0;
    window.App.State.setEmberStreak(streak);
    window.App.EmberUI?.renderActiveTab();
    _toast('Review streak reset', 'info');
  }

  /* ═══════════════════════════════════════════════════════════════
     SETTINGS  (Phase 2)
     ═══════════════════════════════════════════════════════════════ */

  function getSettings() {
    return window.App.State.getEmberSettings();
  }

  function saveSettings(settings) {
    window.App.State.setEmberSettings(settings);
    _toast('Settings saved', 'success');
  }

  /* ═══════════════════════════════════════════════════════════════
     EMAIL AUTOMATION  (Phase 2)
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Select up to 10 General Reading highlights, proportionally distributed
   * across books.
   * @returns {Array} highlights with source object attached
   */
  function generateDailyDigest() {
    const d = _data();
    const generalHls = d.highlights.filter(h => (h.category || 'general') === 'general');
    if (generalHls.length === 0) return [];

    const target = Math.min(10, generalHls.length);

    // Group by source
    const bySource = {};
    for (const hl of generalHls) {
      if (!bySource[hl.sourceId]) bySource[hl.sourceId] = [];
      bySource[hl.sourceId].push(hl);
    }

    const totalHls = generalHls.length;
    const selected = [];

    for (const [srcId, srcHls] of Object.entries(bySource)) {
      const proportion = srcHls.length / totalHls;
      const count      = Math.max(1, Math.round(proportion * target));
      // Shuffle this source's highlights
      const shuffled = [...srcHls].sort(() => Math.random() - 0.5);
      selected.push(...shuffled.slice(0, count));
    }

    // Shuffle final set, trim to target, attach source info
    const final = selected.sort(() => Math.random() - 0.5).slice(0, target);
    return final.map(hl => ({
      ...hl,
      _source: d.sources.find(s => s.id === hl.sourceId) || null,
    }));
  }

  /**
   * Build an HTML email body from highlight objects.
   * Uses inline CSS (email-client safe).
   */
  function _buildEmailHtml(highlights) {
    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    const highlightCards = highlights.map((hl, i) => {
      const srcTitle  = hl._source ? hl._source.title  : 'Unknown Book';
      const srcAuthor = hl._source ? hl._source.author : '';
      const accentColors = ['#E86A4A','#4AB5E8','#A8C97F','#9B7FE8','#E8A14A',
                            '#4AE8C9','#E87F9B','#7FA8E8','#5BD178','#D17FE8'];
      const accent = (hl._source && hl._source.color) || accentColors[i % accentColors.length];
      const bg = i % 2 === 0 ? '#ffffff' : '#fafafa';

      return `
        <div style="margin:0 0 16px;background:${bg};border-radius:8px;overflow:hidden;
                    border-left:4px solid ${accent};box-shadow:0 1px 4px rgba(0,0,0,0.08)">
          <div style="padding:16px 20px">
            <p style="margin:0 0 12px;font-size:16px;line-height:1.7;color:#1a1a2e;
                      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
              "${_escEmail(hl.text)}"
            </p>
            <p style="margin:0;font-size:13px;color:#6b7280;
                      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
              <strong style="color:#374151">${_escEmail(srcTitle)}</strong>
              ${srcAuthor ? `<em> — ${_escEmail(srcAuthor)}</em>` : ''}
            </p>
          </div>
        </div>`;
    }).join('');

    return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:24px 16px">
      <table width="600" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;width:100%">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#e8643a,#d17fe8);
                        border-radius:12px 12px 0 0;padding:28px 32px;text-align:center">
          <div style="font-size:36px;margin-bottom:8px">🔥</div>
          <h1 style="margin:0 0 6px;font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.02em">Ember</h1>
          <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.85)">Your Daily Reading Highlights</p>
        </td></tr>

        <!-- Date Banner -->
        <tr><td style="background:#fff;padding:16px 32px;border-bottom:1px solid #e5e7eb">
          <div style="background:#f9fafb;border-radius:8px;padding:12px 16px;text-align:center">
            <p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#374151">${_escEmail(dateStr)}</p>
            <p style="margin:0;font-size:12px;color:#9ca3af">${highlights.length} highlight${highlights.length !== 1 ? 's' : ''} curated for you today</p>
          </div>
        </td></tr>

        <!-- Highlights -->
        <tr><td style="background:#fff;padding:24px 32px">
          ${highlightCards}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;
                        border-radius:0 0 12px 12px;text-align:center">
          <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.6">
            Sent by your Ember reading dashboard · <a href="#" style="color:#9ca3af">Manage preferences</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  function _escEmail(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Send the daily digest email via EmailJS.
   * @param {boolean} [isTest=false] — if true, bypasses day-dedup check
   */
  async function sendDailyEmail(isTest = false) {
    const settings = window.App.State.getEmberSettings();
    const config   = settings.emailJSConfig || {};

    if (!settings.email) throw new Error('No recipient email address configured');
    if (!config.serviceId || !config.templateId || !config.publicKey) {
      throw new Error('EmailJS credentials not fully configured (Service ID, Template ID, and Public Key are required)');
    }

    const highlights = generateDailyDigest();
    if (highlights.length === 0) {
      throw new Error('No General Reading highlights available to send');
    }

    // EmailJS must be loaded
    if (typeof emailjs === 'undefined') {
      throw new Error('EmailJS SDK not loaded — check your internet connection');
    }

    emailjs.init(config.publicKey);

    const dateStr = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    // Build per-slot plain-text variables for 10 slots.
    // EmailJS HTML-escapes {{variable}} content so we send plain text only —
    // the template itself provides all the HTML structure.
    const ACCENT_COLORS = [
      '#E86A4A','#4AB5E8','#A8C97F','#9B7FE8','#E8A14A',
      '#4AE8C9','#E87F9B','#7FA8E8','#5BD178','#D17FE8',
    ];
    const sources = getSources();

    const params = {
      to_email:         settings.email,
      subject:          `🔥 Ember — ${highlights.length} highlights for ${dateStr}`,
      date_string:      dateStr,
      highlights_count: String(highlights.length),
    };

    for (let i = 1; i <= 10; i++) {
      const hl = highlights[i - 1];
      if (hl) {
        const src = sources.find(s => s.id === hl.sourceId);
        params[`h${i}_text`]   = hl.text   || '';
        params[`h${i}_book`]   = src?.title  || 'Unknown Book';
        params[`h${i}_author`] = src?.author ? ` — ${src.author}` : '';
        params[`h${i}_color`]  = ACCENT_COLORS[(i - 1) % ACCENT_COLORS.length];
        params[`h${i}_show`]   = 'block';
      } else {
        params[`h${i}_text`]   = '';
        params[`h${i}_book`]   = '';
        params[`h${i}_author`] = '';
        params[`h${i}_color`]  = '#cccccc';
        params[`h${i}_show`]   = 'none';
      }
    }

    await emailjs.send(config.serviceId, config.templateId, params);
  }

  /**
   * Check on init whether an automated email should be sent today.
   * Called from init() — fails silently on error.
   */
  async function checkAndSendEmail() {
    const settings = window.App.State.getEmberSettings();
    if (!settings.emailEnabled || !settings.email) return;

    const today    = new Date().toISOString().split('T')[0];
    const lastSent = localStorage.getItem('ember_last_email_sent');
    if (lastSent === today) return; // Already sent today

    const now = new Date();
    const day = now.getDay(); // 0=Sun, 1=Mon…6=Sat

    // Frequency check
    if (settings.emailFrequency === 'weekdays' && (day === 0 || day === 6)) return;
    if (settings.emailFrequency === 'weekly'   && day !== 1)                 return;

    // Time check (approximate — app may not be open at exact time)
    if (settings.emailTime) {
      const [h] = settings.emailTime.split(':').map(Number);
      if (now.getHours() < h) return; // Too early
    }

    try {
      await sendDailyEmail();
      localStorage.setItem('ember_last_email_sent', today);
    } catch (e) {
      console.warn('[Ember] Auto-email failed:', e.message);
    }
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
   * Phase 2: saves to ember-highlights.json (separate file).
   * Also saves full unified state for backward compat.
   */
  function triggerGistSave() {
    const creds = window.App.State.getGistCredentials();
    if (!creds.token) {
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
      const d        = _data();
      const emberData = {
        highlights: d.highlights,
        settings:   window.App.State.getEmberSettings(),
        streak:     window.App.State.getEmberStreak(),
      };

      // Save Ember-specific file
      const result = await window.App.Gist.saveEmberData(
        emberData,
        creds.token,
        creds.id,
      );

      if (result.id) {
        window.App.State.setGistCredentials({
          id:       result.id,
          lastSync: new Date().toISOString(),
        });
      }

      // Also save full unified state for Portfolio compatibility
      await window.App.Gist.save(
        window.App.State.getAll(),
        creds.token,
        result.id || creds.id,
      );

      window.App.EmberUI?.setGistStatus('Saved ✓');
      _toast('Ember data saved to Gist', 'success');
    } catch (e) {
      window.App.EmberUI?.setGistStatus('Save failed');
      _toast('Gist save failed: ' + e.message, 'error');
    }
  }

  /* ── Toast helper ─────────────────────────────────────────────── */

  function _toast(msg, type = 'info') {
    if (typeof window.App.Portfolio?.toast === 'function') {
      window.App.Portfolio.toast(msg, type);
      return;
    }
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

    // Phase 2 migration: assign default category to Phase 1 highlights
    for (const hl of d.highlights) {
      if (!hl.category) {
        hl.category = 'general';
        dirty = true;
      }
    }

    if (dirty) _save(d);

    // Ensure streak and settings are initialised
    window.App.State.getEmberStreak();
    window.App.State.getEmberSettings();

    window.App.EmberUI.init();

    // Check and send automated email (async, fire-and-forget)
    checkAndSendEmail().catch(() => {});
  }

  /* ── Register with App.Shell ──────────────────────────────────── */

  window.App.Shell.registerModule({
    id:    'ember',
    label: 'Ember',
    icon: `<svg viewBox="0 0 264 264" fill="none" stroke="#FF6A00" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" width="28" height="28" shape-rendering="geometricPrecision"><path d="M132 242c49.5 0 88-38.5 88-88 0-33.3-19.8-63.8-49.5-85.8-2.2 28.6-18.7 47.3-36.3 52.8 6.6-30.8-7.7-60.5-24.2-77-3.3 24.2-16.5 44-33 58.3-19.8 17.6-33 42.9-33 62.7 0 42.9 34.1 77 88 77"/><ellipse cx="105" cy="150" rx="8" ry="15" fill="#FF5F1F" stroke="none"/><ellipse cx="159" cy="150" rx="8" ry="15" fill="#FF5F1F" stroke="none"/><path d="M98 192c14 20 54 18 68 0" stroke="#FF5F1F" fill="none"/></svg>`,
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
    // Daily review (Phase 1, kept for compat)
    getDailyReview,
    // Spaced Repetition (Phase 2)
    getReviewQueue,
    submitReview,
    getIntervalPreview,
    // Streak (Phase 2)
    getStreak,
    resetStreak,
    // Settings (Phase 2)
    getSettings,
    saveSettings,
    // Email (Phase 2)
    generateDailyDigest,
    sendDailyEmail,
    // Stats
    getStats,
    // Gist
    triggerGistSave,
    // Re-attach Data sub-module
    Data: _existing.Data,
  };

})();
