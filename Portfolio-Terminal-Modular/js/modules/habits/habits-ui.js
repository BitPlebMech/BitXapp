'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════
 * HABITS / UI  —  All rendering and DOM interactions
 * ═══════════════════════════════════════════════════════════════════
 *
 * Renders:
 *   • Habit cards with today's check-in button, streak, and heatmap
 *   • Add Habit form (inline, in the module pane)
 *   • Summary row: total check-ins today / current streaks
 *
 * All state changes go through window.App.Habits (business logic).
 * ═══════════════════════════════════════════════════════════════════
 */
window.App = window.App || {};

window.App.HabitsUI = (() => {

  const H = () => window.App.Habits;

  function el(id) { return document.getElementById(id); }

  /* ── Add form state ───────────────────────────────────────────── */

  let _addFormOpen = false;

  /* ═══════════════════════════════════════════════════════════════
     MASTER RENDER
     ═══════════════════════════════════════════════════════════════ */

  function render() {
    const container = el('habits-content');
    if (!container) return;

    const data    = H().getData();
    const habits  = (data.habits || []).filter(h => !h.archivedAt);
    const today   = H().today();

    // PERF-01: pre-compute streak info once per habit — avoids a second
    // getStreakInfo() call inside _renderHabitCard (which previously called it again).
    const streakMap = {};
    for (const h of habits) {
      streakMap[h.id] = H().getStreakInfo(h.id);
    }

    // Count how many habits checked in today
    const doneToday = habits.filter(h => streakMap[h.id].checkedToday).length;

    container.innerHTML = `
      <div class="habits-header">
        <div class="habits-summary">
          <span class="habits-today-count">
            <strong>${doneToday}</strong> / ${habits.length} done today
          </span>
          ${doneToday === habits.length && habits.length > 0 ? '<span class="habits-congrats">🎉 All habits done!</span>' : ''}
        </div>
        <button class="btn-add-habit" id="btn-add-habit" onclick="App.HabitsUI.toggleAddForm()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Habit
        </button>
      </div>

      ${_addFormOpen ? _renderAddForm() : ''}

      <div class="habits-grid" id="habits-grid">
        ${habits.length === 0 ? _renderEmptyState() : habits.map(h => _renderHabitCard(h, streakMap[h.id])).join('')}
      </div>

      ${habits.length > 0 ? _renderArchivedSection(data.habits.filter(h => !!h.archivedAt)) : ''}
    `;
  }

  /* ── Empty state ──────────────────────────────────────────────── */

  function _renderEmptyState() {
    return `<div class="habits-empty">
      <div style="font-size:48px;margin-bottom:12px">✅</div>
      <h3>No habits yet</h3>
      <p>Click <strong>Add Habit</strong> to start tracking your daily routines.</p>
    </div>`;
  }

  /* ── Habit card ───────────────────────────────────────────────── */

  // PERF-01: info is pre-computed by render() via streakMap — no extra getStreakInfo() call here.
  function _renderHabitCard(habit, info) {
    const rate7       = H().getCompletionRate(habit.id, 7);
    const rate30      = H().getCompletionRate(habit.id, 30);
    const total       = H().getTotalCheckIns(habit.id);
    const recentDays  = H().getRecentDays(habit.id, 28);
    const isChecked   = info.checkedToday;
    const streakColor = info.current >= 7 ? 'var(--green)' : info.current >= 3 ? 'var(--amber)' : 'var(--muted)';

    return `
    <div class="habit-card ${isChecked ? 'habit-card--done' : ''}" style="--habit-color:${habit.color}">
      <div class="habit-card-top">
        <div class="habit-identity">
          <div class="habit-icon" style="background:${habit.color}20;color:${habit.color}">${habit.icon}</div>
          <div class="habit-name-group">
            <div class="habit-name">${habit.name}</div>
            <div class="habit-streak" style="color:${streakColor}">
              🔥 ${info.current} day streak
            </div>
          </div>
        </div>
        <button
          class="habit-checkin-btn ${isChecked ? 'habit-checkin-btn--done' : ''}"
          onclick="App.Habits.toggleCheckIn('${habit.id}')"
          title="${isChecked ? 'Mark as undone' : 'Mark as done for today'}"
          style="--habit-color:${habit.color}"
        >
          ${isChecked
            ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
            : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>`}
        </button>
      </div>

      <div class="habit-heatmap">
        ${recentDays.map(d => `<div class="heat-cell ${d.done ? 'heat-cell--done' : ''}" style="${d.done ? '--habit-color:' + habit.color : ''}" title="${d.date}"></div>`).join('')}
      </div>

      <div class="habit-stats">
        <div class="habit-stat">
          <div class="habit-stat-val">${info.current}</div>
          <div class="habit-stat-lbl">Streak</div>
        </div>
        <div class="habit-stat">
          <div class="habit-stat-val">${rate7}%</div>
          <div class="habit-stat-lbl">7d rate</div>
        </div>
        <div class="habit-stat habit-stat--secondary">
          <div class="habit-stat-val">${info.longest}</div>
          <div class="habit-stat-lbl">Best</div>
        </div>
        <div class="habit-stat habit-stat--secondary">
          <div class="habit-stat-val">${rate30}%</div>
          <div class="habit-stat-lbl">30d rate</div>
        </div>
        <div class="habit-stat habit-stat--secondary">
          <div class="habit-stat-val">${total}</div>
          <div class="habit-stat-lbl">Total</div>
        </div>
      </div>

      <div class="habit-actions">
        <button class="habit-action-btn" onclick="App.HabitsUI.openEditForm('${habit.id}')" title="Edit">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="habit-action-btn" onclick="App.HabitsUI.confirmArchive('${habit.id}')" title="Archive">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
        </button>
        <button class="habit-action-btn habit-action-btn--danger" onclick="App.HabitsUI.confirmDelete('${habit.id}')" title="Delete">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>`;
  }

  /* ── Add form ─────────────────────────────────────────────────── */

  function _renderAddForm() {
    const COLORS = ['#5b9cff','#00dba8','#a07cf8','#ffaa20','#ff6b9d','#00d4ff','#ff9848','#06b6d4'];
    const ICONS  = ['⭐','🏃','📚','💻','🧘','💪','🥗','🚶','🎯','✍️','🎸','🌿','💊','🛌','🚴'];

    return `
    <div class="habit-add-form" id="habit-add-form">
      <div class="hab-form-row">
        <div class="hab-form-field">
          <label class="hab-form-label">Habit Name</label>
          <input type="text" id="hab-new-name" placeholder="e.g. Morning run" maxlength="40"
            style="width:100%;background:var(--surf2);border:1px solid var(--b2);border-radius:6px;padding:8px 10px;color:var(--text);font-size:13px">
        </div>
        <div class="hab-form-field" style="min-width:100px">
          <label class="hab-form-label">Icon</label>
          <select id="hab-new-icon" style="width:100%;background:var(--surf2);border:1px solid var(--b2);border-radius:6px;padding:8px 10px;color:var(--text);font-size:16px">
            ${ICONS.map(icon => `<option value="${icon}">${icon}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="hab-form-field">
        <label class="hab-form-label">Color</label>
        <div class="hab-color-grid" id="hab-color-grid">
          ${COLORS.map((c, i) => `<div class="hab-color-swatch ${i === 0 ? 'selected' : ''}" style="background:${c}" data-color="${c}" onclick="App.HabitsUI.selectColor('${c}')"></div>`).join('')}
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn-primary" onclick="App.HabitsUI.submitAddForm()">Add Habit</button>
        <button class="btn-secondary" onclick="App.HabitsUI.toggleAddForm()">Cancel</button>
      </div>
    </div>`;
  }

  let _selectedColor = '#5b9cff';

  function selectColor(color) {
    _selectedColor = color;
    document.querySelectorAll('.hab-color-swatch').forEach(s => {
      s.classList.toggle('selected', s.dataset.color === color);
    });
  }

  function toggleAddForm() {
    _addFormOpen = !_addFormOpen;
    _selectedColor = '#5b9cff';
    render();
    if (_addFormOpen) setTimeout(() => el('hab-new-name')?.focus(), 80);
  }

  function submitAddForm() {
    const name = (el('hab-new-name')?.value || '').trim();
    const icon = el('hab-new-icon')?.value || '⭐';
    if (!name) {
      el('hab-new-name')?.focus();
      return;
    }
    H().addHabit({ name, icon, color: _selectedColor });
    _addFormOpen = false;
    // render() is called inside H().addHabit()
  }

  /* ── Edit form ────────────────────────────────────────────────── */

  function openEditForm(habitId) {
    const data  = H().getData();
    const habit = data.habits.find(h => h.id === habitId);
    if (!habit) return;

    const name  = prompt('Edit habit name:', habit.name);
    if (name === null) return;
    if (!name.trim()) { H().editHabit(habitId, { name: habit.name }); return; }
    H().editHabit(habitId, { name: name.trim() });
  }

  /* ── Confirm archive/delete ───────────────────────────────────── */

  /**
   * QUALITY-02 fix: replaced native browser confirm() with App.Shell.confirmAction()
   * for consistent UX and non-blocking behaviour.
   */
  function confirmArchive(habitId) {
    const data  = H().getData();
    const habit = data.habits.find(h => h.id === habitId);
    if (!habit) return;
    window.App.Shell.confirmAction(
      `Archive "${habit.name}"?`,
      'It will be hidden from the main view but all log history is preserved.',
      '📦', 'Archive',
      () => H().archiveHabit(habitId)
    );
  }

  function confirmDelete(habitId) {
    const data  = H().getData();
    const habit = data.habits.find(h => h.id === habitId);
    if (!habit) return;
    window.App.Shell.confirmAction(
      `Delete "${habit.name}"?`,
      'All check-in history will be permanently lost and cannot be recovered.',
      '🗑️', 'Delete',
      () => H().deleteHabit(habitId)
    );
  }

  /* ── Archived section ─────────────────────────────────────────── */

  function _renderArchivedSection(archived) {
    if (!archived.length) return '';
    return `
    <details class="archived-section" style="margin-top:24px">
      <summary style="cursor:pointer;color:var(--muted);font-size:12px;user-select:none">
        Archived Habits (${archived.length})
      </summary>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
        ${archived.map(h => `
        <div class="habit-archived-chip" style="background:var(--surf2);border-radius:6px;padding:6px 12px;display:flex;align-items:center;gap:8px">
          <span>${h.icon}</span>
          <span style="font-size:12px;color:var(--text2)">${h.name}</span>
          <button class="habit-action-btn" title="Restore" onclick="App.Habits.editHabit('${h.id}', {archivedAt: null})">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
          </button>
          <button class="habit-action-btn habit-action-btn--danger" title="Delete" onclick="App.HabitsUI.confirmDelete('${h.id}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>`).join('')}
      </div>
    </details>`;
  }

  /* ═══════════════════════════════════════════════════════════════
     EVENT LISTENERS
     ═══════════════════════════════════════════════════════════════ */

  function setupEventListeners() {
    // Keyboard shortcut: Enter in add form
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter' && document.activeElement?.id === 'hab-new-name') {
        submitAddForm();
      }
    });
  }

  /* ── Exports ──────────────────────────────────────────────────── */

  return {
    render,
    toggleAddForm,
    submitAddForm,
    selectColor,
    openEditForm,
    confirmArchive,
    confirmDelete,
    setupEventListeners,
  };

})();
