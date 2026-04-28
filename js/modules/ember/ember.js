'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * EMBER MODULE  —  Business logic & state management
 * ═══════════════════════════════════════════════════════════════════
 *
 * Core responsibilities:
 *   • CRUD for sources (books) and highlights
 *   • Import orchestration — calls ember-data.js parser, deduplicates
 *   • Daily review — date-seeded shuffle, consistent within a day
 *   • GitHub Gist sync — saves Ember state to ember-highlights.json
 *   • App.Shell registration — lazy init on first sidebar click
 *
 * Extended features:
 *   • Book categorization — category field on highlights (general / academic)
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

  /* ── Spine colour palette — sourced from js/core/theme-tokens.js ─ */

  const SPINE_PALETTE = window.App.ThemeTokens?.SPINE_PALETTE || [
    '#E86A4A', '#4AB5E8', '#A8C97F', '#9B7FE8', '#E8A14A',
    '#4AE8C9', '#E87F9B', '#7FA8E8', '#5BD178', '#D17FE8',
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
          // Categorization and spaced-repetition fields
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
     DAILY REVIEW — Legacy daily review, kept for backward compatibility
     Superseded by getReviewQueue() for the SM-2 Review tab.
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Returns up to 10 highlights for today.
   * Uses a date-seeded LCG shuffle — same set shown all day (like Readwise).
   * The Review tab uses getReviewQueue() (SM-2) instead; this feeds the
   * daily digest list in the Review tab's scrollable view.
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
     SPACED REPETITION — SM-2 ALGORITHM
     Computes review intervals, builds the due-highlights queue,
     and records per-highlight review history.
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
     REVIEW STREAK — Daily streak tracking, history, and milestones
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
     SETTINGS — Email automation config, EmailJS credentials, review goal
     ═══════════════════════════════════════════════════════════════ */

  function getSettings() {
    return window.App.State.getEmberSettings();
  }

  function saveSettings(settings) {
    window.App.State.setEmberSettings(settings);
    _toast('Settings saved', 'success');
  }

  /* ═══════════════════════════════════════════════════════════════
     EMAIL AUTOMATION — Daily digest generator and EmailJS delivery
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
        <div style="margin:0 0 12px;background:${bg};border-radius:8px;overflow:hidden;
                    border-left:3px solid ${accent};box-shadow:0 1px 3px rgba(0,0,0,0.07)">
          <div style="padding:12px 14px">
            <p style="margin:0 0 8px;font-size:15px;line-height:1.65;color:#1a1a2e;
                      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
              &#x201C;${_escEmail(hl.text)}&#x201D;
            </p>
            <p style="margin:0;font-size:12px;color:#6b7280;
                      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
              <strong style="color:#374151">${_escEmail(srcTitle)}</strong>${srcAuthor ? ` <em style="color:#9ca3af">&#x2014; ${_escEmail(srcAuthor)}</em>` : ''}
            </p>
          </div>
        </div>`;
    }).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Ember — Daily Highlights</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%">

  <!-- Outer wrapper: 8px padding on mobile, 24px on desktop -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:16px 8px">

      <!-- Card: max 600px, full width on small screens -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;width:100%;border-radius:14px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(0,0,0,0.10)">

        <!-- ── Header ── -->
        <tr>
          <td style="background:linear-gradient(135deg,#e8643a 0%,#c84fa0 60%,#9b59e8 100%);
                     padding:24px 24px 20px;text-align:center">
            <!--
              Inline base64 PNG — ember_icon_email.png (220×220, 8 KB).
              Self-contained: no external URL, no loading spinner, works offline.
              Gmail, Apple Mail, Outlook all support inline base64 in <img>.
              To swap the icon: replace the base64 string below with a new one.
              To change icon size: edit width/height on the <img> tag.
            -->
            <img src="data:image/png;base64,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"
                 width="72" height="72"
                 alt="Ember"
                 style="display:block;margin:0 auto 10px;border-radius:16px;
                        border:0;outline:none;text-decoration:none">
            <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;color:#ffffff;
                       letter-spacing:-0.03em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
              Ember
            </h1>
            <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.88);
                      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
              Your Daily Reading Highlights
            </p>
          </td>
        </tr>

        <!-- ── Date banner ── -->
        <tr>
          <td style="background:#ffffff;padding:12px 20px;border-bottom:1px solid #e5e7eb">
            <div style="background:#f9fafb;border-radius:8px;padding:10px 14px;text-align:center">
              <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#374151;
                        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
                ${_escEmail(dateStr)}
              </p>
              <p style="margin:0;font-size:11px;color:#9ca3af;
                        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
                ${highlights.length} highlight${highlights.length !== 1 ? 's' : ''} curated for you today
              </p>
            </div>
          </td>
        </tr>

        <!-- ── Highlights ── -->
        <tr>
          <td style="background:#ffffff;padding:16px 20px">
            ${highlightCards}
          </td>
        </tr>

        <!-- ── Footer ── -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;
                     padding:14px 20px;text-align:center">
            <p style="margin:0;font-size:10px;color:#9ca3af;line-height:1.6;
                      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
              Sent by your Ember reading dashboard
            </p>
          </td>
        </tr>

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
      subject:          `Ember — ${highlights.length} highlights for ${dateStr}`,
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
    // V1 fix: was localStorage.getItem('ember_last_email_sent') — a raw key outside
    // super_app_v1, invisible to resetAll(), Gist restore, and migrations.
    // Now stored inside ember.settings.lastEmailSentDate via App.State.
    const lastSent = settings.lastEmailSentDate || null;
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
      // V1 fix: persist via App.State instead of raw localStorage
      settings.lastEmailSentDate = today;
      window.App.State.setEmberSettings(settings);
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
   * Saves to ember-highlights.json, separate from portfolio-data.json.
   */
  function triggerGistSave() {
    const creds = window.App.State.getGistCredentials();
    if (!creds.token) {
      window.App.Shell.toast('Add your GitHub token in Settings → Gist Sync', 'warn');
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
        sources:    d.sources,             // ← books
        highlights: d.highlights,
        settings:   window.App.State.getEmberSettings(),
        streak:     window.App.State.getEmberStreak(),
      };

      // Save Ember-specific file only — portfolio-data.json is managed by Portfolio module
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

      window.App.EmberUI?.setGistStatus('Saved ✓');
      _toast('Ember data saved to Gist', 'success');
    } catch (e) {
      window.App.EmberUI?.setGistStatus('Save failed');
      _toast('Gist save failed: ' + e.message, 'error');
    }
  }

  /**
   * Load ONLY ember-highlights.json from Gist and replace local Ember state.
   * Does NOT touch portfolio-data.json or habits-data.json.
   *
   * V13 — SCOPE NOTE: this is a module-scoped restore only.
   * For sign-in and full restores (all three modules at once) always use
   * App.Shell.triggerGistLoad() instead — never add a UI button here that
   * calls this function directly for a "load everything" action.
   *
   * Handles legacy Gist files (saved before sources were included):
   * if sources is empty but highlights reference sourceIds, synthetic source
   * records are reconstructed from the highlight metadata so the Books tab
   * is never left blank after a load.
   */
  async function triggerGistLoad() {
    const creds = window.App.State.getGistCredentials();
    if (!creds.token) { _toast('Add your GitHub token in Settings → Gist Sync', 'error'); return; }
    if (!creds.id)    { _toast('No Gist ID configured', 'error'); return; }
    try {
      _toast('Loading Ember data from Gist…', 'info');
      const parsed = await window.App.Gist.loadEmberData(creds.token, creds.id);
      if (!parsed) { _toast('No ember-highlights.json found in Gist yet', 'warn'); return; }

      const highlights = parsed.highlights || [];
      let sources      = parsed.sources    || [];

      // ── Legacy recovery: Gist file was saved without sources (old bug) ──────
      // If sources is empty but highlights exist and reference sourceIds,
      // build synthetic source stubs so the Books tab is not left blank.
      // A proper re-import will overwrite these stubs with full metadata.
      if (sources.length === 0 && highlights.length > 0) {
        const seenIds = new Map(); // sourceId → synthetic source
        for (const hl of highlights) {
          if (hl.sourceId && !seenIds.has(hl.sourceId)) {
            seenIds.set(hl.sourceId, {
              id:             hl.sourceId,
              title:          `Book (${hl.sourceId.slice(-6)})`,
              author:         '',
              format:         'kindle',
              color:          SPINE_PALETTE[seenIds.size % SPINE_PALETTE.length],
              importedAt:     hl.addedAt || new Date().toISOString(),
              lastImportAt:   hl.addedAt || new Date().toISOString(),
              highlightCount: 0,
            });
          }
        }
        // Fill highlightCounts
        for (const hl of highlights) {
          const src = seenIds.get(hl.sourceId);
          if (src) src.highlightCount++;
        }
        sources = Array.from(seenIds.values());
      }

      const srcCount = sources.length;
      const hlCount  = highlights.length;

      window.App.Shell.confirmAction(
        'Load Ember data from Gist?',
        `Replace local Ember data with ${srcCount} book${srcCount !== 1 ? 's' : ''} and ${hlCount} highlight${hlCount !== 1 ? 's' : ''} from Gist. This cannot be undone.`,
        '☁️', 'Load',
        () => {
          const d = _data();
          d.highlights = highlights;
          d.sources    = sources;
          _save(d);
          if (parsed.settings) window.App.State.setEmberSettings(parsed.settings);
          if (parsed.streak)   window.App.State.setEmberStreak(parsed.streak);
          window.App.EmberUI.render();
          _toast(`Ember loaded ✓ — ${srcCount} book${srcCount !== 1 ? 's' : ''}, ${hlCount} highlight${hlCount !== 1 ? 's' : ''}`, 'success');
        }
      );
    } catch (e) {
      _toast('Ember Gist load failed: ' + e.message, 'error');
    }
  }

  /* ── Toast helper ─────────────────────────────────────────────── */

  function _toast(msg, type = 'info') {
    // Always route through App.Shell — never call another module directly (MODULE_RULES §3)
    if (typeof window.App.Shell?.toast === 'function') {
      window.App.Shell.toast(msg, type);
    } else {
      console.info(`[Ember] ${msg}`);
    }
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

    // Migration: assign default category to highlights imported before categories were added
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

    // Register Shell actions so settings.js and Shell can invoke Ember behaviour
    // without direct coupling (Rule 3).
    window.App.Shell.registerAction('ember:render', () => window.App.EmberUI?.render?.());
    window.App.Shell.registerAction('ember:renderSettingsInto', (container) => {
      if (typeof window.App.EmberUI?.renderSettingsInto === 'function') {
        window.App.EmberUI.renderSettingsInto(container);
      }
    });

    window.App.EmberUI.init();

    // NOTE: Automated daily email is handled exclusively by the GitHub Actions
    // cron in .github/workflows/ember-email.yml.
    // The browser-based checkAndSendEmail() has been removed to prevent
    // duplicate emails when the app is opened multiple times in a day.
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
    // Daily review — legacy date-seeded shuffle, kept for backward compatibility
    getDailyReview,
    // Spaced Repetition — SM-2 review queue and rating submission
    getReviewQueue,
    submitReview,
    getIntervalPreview,
    // Streak — daily review streak tracking
    getStreak,
    resetStreak,
    // Settings — email automation config and review preferences
    getSettings,
    saveSettings,
    // Email — daily digest generation and EmailJS delivery
    generateDailyDigest,
    sendDailyEmail,
    // Stats
    getStats,
    // Gist
    triggerGistSave,
    triggerGistLoad,
    // V14 fix: public render() so App.Shell can re-render after Gist load
    // without reaching into the internal EmberUI sub-layer directly.
    render: () => window.App.EmberUI?.render?.(),
    // Re-attach Data sub-module
    Data: _existing.Data,
  };

})();
