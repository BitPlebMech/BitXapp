'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * HABITS / DATA  —  Data shapes and default/mock seed data
 * ═══════════════════════════════════════════════════════════════════
 *
 * Data shapes (stored in App.State.getHabitsData()):
 *
 *   habits: [{
 *     id:         string   — unique ID
 *     name:       string   — display name, e.g. "Exercise"
 *     icon:       string   — emoji, e.g. "🏃"
 *     color:      string   — hex color for UI accents
 *     createdAt:  string   — ISO date 'YYYY-MM-DD'
 *     archivedAt: string|null — ISO date if archived, else null
 *   }]
 *
 *   logs: [{
 *     id:       string   — unique ID
 *     habitId:  string   — references habits[n].id
 *     date:     string   — ISO date 'YYYY-MM-DD'
 *   }]
 *
 * SEED DATA
 *   Four habits with realistic check-in history spanning 30 days.
 *   The seed is only inserted if no habits exist yet (first open).
 * ═══════════════════════════════════════════════════════════════════
 */
window.App = window.App || {};
window.App.Habits = window.App.Habits || {};

window.App.Habits.Data = (() => {

  /* ── Utility ──────────────────────────────────────────────────── */

  function _genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /** Return today as ISO date string YYYY-MM-DD */
  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  /** Subtract N days from today, return ISO date string */
  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  /* ── Default habit definitions ────────────────────────────────── */

  const DEFAULT_HABITS = [
    { name: 'Exercise',  icon: '🏃', color: '#5b9cff' },
    { name: 'Read',      icon: '📚', color: '#00dba8' },
    { name: 'Code',      icon: '💻', color: '#a07cf8' },
    { name: 'Meditate',  icon: '🧘', color: '#ffaa20' },
  ];

  /**
   * Build a realistic log history for the seed data.
   * Each habit gets a different completion rate to simulate real usage.
   *
   * @param {string} habitId
   * @param {number} index      — habit index 0-3, used to vary the pattern
   * @param {number} daysBack   — how many days of history to generate
   * @returns {Array} log entries
   */
  function _buildSeedLogs(habitId, index, daysBack = 30) {
    // Completion rates: 80%, 65%, 90%, 50% for the four habits
    const rates = [0.80, 0.65, 0.90, 0.50];
    const rate = rates[index % rates.length];

    // Use a seeded pseudo-random approach for deterministic history
    const seed = habitId.charCodeAt(0) + index * 17;
    const logs = [];

    for (let i = 0; i <= daysBack; i++) {
      const dateStr = daysAgo(i);
      // Simple deterministic "random" — consistent across page reloads
      const pseudoRand = ((seed * 9301 + i * 49297) % 233280) / 233280;
      if (pseudoRand < rate) {
        logs.push({ id: _genId(), habitId, date: dateStr });
      }
    }

    return logs;
  }

  /**
   * Generate the full seed state — called once on first load.
   * @returns {{ habits: Array, logs: Array }}
   */
  function buildSeedData() {
    const habits = DEFAULT_HABITS.map((def, i) => ({
      id:         'habit-seed-' + i,
      name:       def.name,
      icon:       def.icon,
      color:      def.color,
      createdAt:  daysAgo(90),
      archivedAt: null,
    }));

    const logs = [];
    habits.forEach((h, i) => {
      logs.push(..._buildSeedLogs(h.id, i, 30));
    });

    return { habits, logs };
  }

  /* ── Exports ──────────────────────────────────────────────────── */

  return {
    buildSeedData,
    today,
    daysAgo,
    genId: _genId,
    DEFAULT_HABITS,
  };

})();
