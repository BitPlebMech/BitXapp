'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * HABITS MODULE  —  Business logic and state management
 * ═══════════════════════════════════════════════════════════════════
 *
 * This file contains ALL habits business logic:
 *   • Streak calculation (current, longest)
 *   • Check-in / un-check-in (toggle for today)
 *   • CRUD — add/edit/archive/delete habits
 *   • State persistence via App.State.getHabitsData() / setHabitsData()
 *   • Gist sync support — full state saved via App.Gist
 *   • Module init — seeds data on first open, registers with App.Shell
 *
 * DATA FLOW (proves the full modular architecture):
 *   1. init() → App.State.getHabitsData() → seed if empty
 *   2. checkIn() → mutates habits data → App.State.setHabitsData() → re-render
 *   3. triggerGistSave() → App.Gist.save(App.State.getAll(), token, id)
 *      (saves the FULL unified state, so ALL modules persist together)
 * ═══════════════════════════════════════════════════════════════════
 */
window.App = window.App || {};

window.App.Habits = (() => {

  /* Preserve Data sub-module reference set by habits-data.js */
  const _DataRef = window.App.Habits?.Data;
  const HD = () => window.App.Habits.Data;

  /* ── State accessors ──────────────────────────────────────────── */

  function _data() { return window.App.State.getHabitsData(); }
  function _save(d) { window.App.State.setHabitsData(d); }

  /* ── Helpers ──────────────────────────────────────────────────── */

  function _today()       { return HD().today(); }
  function _daysAgo(n)    { return HD().daysAgo(n); }
  function _genId()       { return HD().genId(); }

  /** Return the set of dates a given habit was checked in, as a Set */
  function _checkedDates(habitId) {
    return new Set(_data().logs.filter(l => l.habitId === habitId).map(l => l.date));
  }

  /* ═══════════════════════════════════════════════════════════════
     STREAK CALCULATION
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Calculate the current streak for a habit.
   * Streak = consecutive days ending today (or yesterday if not yet checked in today).
   *
   * @param {string} habitId
   * @returns {{ current: number, longest: number, checkedToday: boolean }}
   */
  function getStreakInfo(habitId) {
    const checked = _checkedDates(habitId);
    const today = _today();
    const checkedToday = checked.has(today);

    // Current streak: walk back from today (or yesterday if not checked today)
    // Using a while-loop avoids off-by-one: each iteration = one confirmed day.
    let current = 0;
    let dayOffset = checkedToday ? 0 : 1;  // Start from today or yesterday

    while (dayOffset < 365 && checked.has(_daysAgo(dayOffset))) {
      current++;
      dayOffset++;
    }

    // Longest streak: scan all dates
    const allDates = [...checked].sort();
    let longest = 0, run = 0, prevDate = null;

    for (const dateStr of allDates) {
      if (!prevDate) {
        run = 1;
      } else {
        const prev = new Date(prevDate + 'T12:00:00');
        const curr = new Date(dateStr   + 'T12:00:00');
        const diffDays = Math.round((curr - prev) / 86400000);
        run = diffDays === 1 ? run + 1 : 1;
      }
      if (run > longest) longest = run;
      prevDate = dateStr;
    }

    return { current, longest, checkedToday };
  }

  /**
   * Get completion rate for a habit over the last N days.
   * @param {string} habitId
   * @param {number} days
   * @returns {number} 0..100
   */
  function getCompletionRate(habitId, days = 7) {
    const checked = _checkedDates(habitId);
    let count = 0;
    for (let i = 0; i < days; i++) {
      if (checked.has(_daysAgo(i))) count++;
    }
    return Math.round((count / days) * 100);
  }

  /**
   * Get daily completion counts for the last N days (for mini heatmap).
   * @param {string} habitId
   * @param {number} days
   * @returns {Array<{ date: string, done: boolean }>}
   */
  function getRecentDays(habitId, days = 28) {
    const checked = _checkedDates(habitId);
    return Array.from({ length: days }, (_, i) => {
      const date = _daysAgo(days - 1 - i);
      return { date, done: checked.has(date) };
    });
  }

  /**
   * Get total check-in count for a habit.
   */
  function getTotalCheckIns(habitId) {
    return _data().logs.filter(l => l.habitId === habitId).length;
  }

  /* ═══════════════════════════════════════════════════════════════
     CHECK-IN / UN-CHECK-IN
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Toggle today's check-in for a habit.
   * If already checked in today → removes the log entry.
   * If not checked in → adds a new log entry.
   *
   * @param {string} habitId
   * @returns {{ checkedIn: boolean }}  — true if now checked in
   */
  function toggleCheckIn(habitId) {
    const d     = _data();
    const today = _today();
    const existingIdx = d.logs.findIndex(l => l.habitId === habitId && l.date === today);

    if (existingIdx >= 0) {
      d.logs.splice(existingIdx, 1);
      _save(d);
      _render();
      return { checkedIn: false };
    } else {
      d.logs.push({ id: _genId(), habitId, date: today });
      _save(d);
      _render();
      return { checkedIn: true };
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     CRUD
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Add a new habit.
   * @param {{ name: string, icon: string, color: string }} config
   */
  function addHabit({ name, icon = '⭐', color = '#5b9cff' }) {
    if (!name?.trim()) return;
    const d = _data();
    d.habits.push({
      id:         _genId(),
      name:       name.trim(),
      icon,
      color,
      createdAt:  _today(),
      archivedAt: null,
    });
    _save(d);
    _render();
    _toast('Habit added', 'success');
  }

  /**
   * Edit a habit's name, icon, or color.
   */
  function editHabit(habitId, updates) {
    const d = _data();
    const h = d.habits.find(h => h.id === habitId);
    if (!h) return;
    Object.assign(h, updates);
    _save(d);
    _render();
    _toast('Habit updated', 'success');
  }

  /**
   * Archive a habit (hide from main view, keep logs for history).
   */
  function archiveHabit(habitId) {
    const d = _data();
    const h = d.habits.find(h => h.id === habitId);
    if (!h) return;
    h.archivedAt = _today();
    _save(d);
    _render();
    _toast('Habit archived', 'info');
  }

  /**
   * Permanently delete a habit and all its logs.
   */
  function deleteHabit(habitId) {
    const d = _data();
    d.habits = d.habits.filter(h => h.id !== habitId);
    d.logs   = d.logs.filter(l => l.habitId !== habitId);
    _save(d);
    _render();
    _toast('Habit deleted', 'info');
  }

  /* ═══════════════════════════════════════════════════════════════
     GIST SYNC
     Saves the FULL unified state — both portfolio and habits persist
     together in one Gist, proving the cross-module sync works.
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Delegate to App.Shell.triggerGistSave() — Shell owns the canonical
   * save logic so every module gets sync for free without duplicating code.
   */
  function triggerGistSave() {
    window.App.Shell.triggerGistSave();
  }

  /**
   * ARCH-01 fix: toast now routes through App.Shell — no cross-module dependency.
   * Previously called App.Portfolio.toast, which violated the isolation rule.
   */
  function _toast(msg, type = 'info') {
    if (window.App.Shell?.toast) {
      window.App.Shell.toast(msg, type);
    } else {
      console.info('[Habits] ' + type.toUpperCase() + ':', msg);
    }
  }

  /* ── Render delegate ──────────────────────────────────────────── */
  function _render() {
    if (window.App.HabitsUI?.render) window.App.HabitsUI.render();
  }

  /* ═══════════════════════════════════════════════════════════════
     MODULE INIT
     ═══════════════════════════════════════════════════════════════ */

  function init() {
    // Seed data if no habits exist yet
    const d = _data();
    if (!d.habits || d.habits.length === 0) {
      const seed = HD().buildSeedData();
      _save(seed);
      console.info('[Habits] Seeded', seed.habits.length, 'habits with', seed.logs.length, 'log entries');
    }

    // Setup UI events
    if (window.App.HabitsUI?.setupEventListeners) {
      window.App.HabitsUI.setupEventListeners();
    }

    _render();
    console.info('[Habits] Module initialised');
  }

  /* ── Register with shell ──────────────────────────────────────── */
  window.App.Shell?.registerModule({
    id: 'habits',
    label: 'Habits',
    icon: `<svg viewBox="0 0 264 264" fill="none" stroke-width="42" stroke-linecap="round" width="28" height="28"><path d="M132 42 A90 90 0 0 1 222 132" stroke="#3A86FF"/><path d="M222 132 A90 90 0 0 1 132 222" stroke="#2ECC71"/><path d="M132 222 A90 90 0 0 1 42 132" stroke="#FFBE0B"/><path d="M42 132 A90 90 0 0 1 132 42" stroke="#FF5F1F"/></svg>`,
    init,
  });

  /* ── Exports ──────────────────────────────────────────────────── */

  return {
    // Streak & stats
    getStreakInfo,
    getCompletionRate,
    getRecentDays,
    getTotalCheckIns,
    // Actions
    toggleCheckIn,
    addHabit,
    editHabit,
    archiveHabit,
    deleteHabit,
    // Gist
    triggerGistSave,
    // Module interface
    init,
    // State accessors (for HabitsUI)
    getData:  _data,
    today:    _today,
    // Re-attach Data sub-module (habits-data.js sets this before this IIFE runs)
    Data: _DataRef,
  };

})();
