import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import '../../../js/core/utils.js';
import '../../../js/core/state.js';
import '../../../js/modules/habits/habits-data.js';
import '../../../js/modules/habits/habits.js';

// ── Helpers ────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function makeHabitWithLogs(logs = []) {
  const habitId = 'test-habit-1';
  App.State.setHabitsData({
    habits: [{ id: habitId, name: 'Test', icon: '⭐', color: '#fff', createdAt: daysAgoISO(90), archivedAt: null }],
    logs,
  });
  return habitId;
}

// ── Tests ──────────────────────────────────────────────────────────

beforeEach(() => {
  window.App.HabitsUI = { render: vi.fn(), setupEventListeners: vi.fn() };
  App.State.init();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App.Habits — streak calculation', () => {

  it('returns 0 streak when no check-ins', () => {
    const id = makeHabitWithLogs([]);
    const { current, longest } = App.Habits.getStreakInfo(id);
    expect(current).toBe(0);
    expect(longest).toBe(0);
  });

  it('returns streak of 1 for today only', () => {
    const id = makeHabitWithLogs([{ id: 'l1', habitId: 'test-habit-1', date: todayISO() }]);
    const { current, checkedToday } = App.Habits.getStreakInfo(id);
    expect(current).toBe(1);
    expect(checkedToday).toBe(true);
  });

  it('returns streak of 1 for yesterday only (grace period)', () => {
    const id = makeHabitWithLogs([{ id: 'l1', habitId: 'test-habit-1', date: daysAgoISO(1) }]);
    const { current, checkedToday } = App.Habits.getStreakInfo(id);
    expect(current).toBe(1);
    expect(checkedToday).toBe(false);
  });

  it('counts consecutive days including today', () => {
    const logs = [0, 1, 2, 3].map((n, i) => ({
      id: `l${i}`, habitId: 'test-habit-1', date: daysAgoISO(n),
    }));
    const id = makeHabitWithLogs(logs);
    expect(App.Habits.getStreakInfo(id).current).toBe(4);
  });

  it('counts consecutive days starting from yesterday (not checked today)', () => {
    const logs = [1, 2, 3, 4].map((n, i) => ({
      id: `l${i}`, habitId: 'test-habit-1', date: daysAgoISO(n),
    }));
    const id = makeHabitWithLogs(logs);
    expect(App.Habits.getStreakInfo(id).current).toBe(4);
  });

  it('breaks streak at gap', () => {
    // Today + 1 day ago + (3 days ago, gap at 2)
    const logs = [0, 1, 3].map((n, i) => ({
      id: `l${i}`, habitId: 'test-habit-1', date: daysAgoISO(n),
    }));
    const id = makeHabitWithLogs(logs);
    expect(App.Habits.getStreakInfo(id).current).toBe(2); // only today + yesterday
  });

  it('correctly calculates longest streak from historical data', () => {
    // 5-day streak ending 10 days ago, 3-day streak ending 2 days ago
    const fiveDayStreak = [10, 11, 12, 13, 14].map((n, i) => ({
      id: `la${i}`, habitId: 'test-habit-1', date: daysAgoISO(n),
    }));
    const threeDayStreak = [0, 1, 2].map((n, i) => ({
      id: `lb${i}`, habitId: 'test-habit-1', date: daysAgoISO(n),
    }));
    const id = makeHabitWithLogs([...fiveDayStreak, ...threeDayStreak]);
    expect(App.Habits.getStreakInfo(id).longest).toBe(5);
  });

  it('longest equals current when only one continuous streak', () => {
    const logs = [0, 1, 2, 3, 4].map((n, i) => ({
      id: `l${i}`, habitId: 'test-habit-1', date: daysAgoISO(n),
    }));
    const id = makeHabitWithLogs(logs);
    const { current, longest } = App.Habits.getStreakInfo(id);
    expect(current).toBe(5);
    expect(longest).toBe(5);
  });

  it('does not double-count today', () => {
    // Regression test for the off-by-one the while-loop fixed
    const logs = [0, 1].map((n, i) => ({
      id: `l${i}`, habitId: 'test-habit-1', date: daysAgoISO(n),
    }));
    const id = makeHabitWithLogs(logs);
    expect(App.Habits.getStreakInfo(id).current).toBe(2); // not 3
  });

});

describe('App.Habits — toggleCheckIn', () => {

  it('checks in for today when not already checked', () => {
    const id = makeHabitWithLogs([]);
    const result = App.Habits.toggleCheckIn(id);
    expect(result.checkedIn).toBe(true);
    expect(App.Habits.getStreakInfo(id).checkedToday).toBe(true);
  });

  it('unchecks today when already checked', () => {
    const id = makeHabitWithLogs([{ id: 'l1', habitId: 'test-habit-1', date: todayISO() }]);
    const result = App.Habits.toggleCheckIn(id);
    expect(result.checkedIn).toBe(false);
    expect(App.Habits.getStreakInfo(id).checkedToday).toBe(false);
  });

  it('persists check-in to state', () => {
    const id = makeHabitWithLogs([]);
    App.Habits.toggleCheckIn(id);
    const { logs } = App.State.getHabitsData();
    expect(logs.some(l => l.habitId === id && l.date === todayISO())).toBe(true);
  });

});

describe('App.Habits — addHabit / deleteHabit', () => {

  it('addHabit creates a habit with correct fields', () => {
    App.State.setHabitsData({ habits: [], logs: [] });
    App.Habits.addHabit({ name: 'Meditate', icon: '🧘', color: '#ffaa20' });
    const { habits } = App.State.getHabitsData();
    expect(habits).toHaveLength(1);
    expect(habits[0].name).toBe('Meditate');
    expect(habits[0].icon).toBe('🧘');
    expect(habits[0].archivedAt).toBeNull();
  });

  it('deleteHabit removes habit and its logs', () => {
    const id = makeHabitWithLogs([
      { id: 'l1', habitId: 'test-habit-1', date: todayISO() },
    ]);
    App.Habits.deleteHabit(id);
    const { habits, logs } = App.State.getHabitsData();
    expect(habits.find(h => h.id === id)).toBeUndefined();
    expect(logs.find(l => l.habitId === id)).toBeUndefined();
  });

});

describe('App.Habits — getCompletionRate', () => {

  it('returns 100 when checked every day in window', () => {
    const logs = [0, 1, 2, 3, 4, 5, 6].map((n, i) => ({
      id: `l${i}`, habitId: 'test-habit-1', date: daysAgoISO(n),
    }));
    const id = makeHabitWithLogs(logs);
    expect(App.Habits.getCompletionRate(id, 7)).toBe(100);
  });

  it('returns 0 when never checked', () => {
    const id = makeHabitWithLogs([]);
    expect(App.Habits.getCompletionRate(id, 7)).toBe(0);
  });

  it('returns roughly 50 for every other day', () => {
    const logs = [0, 2, 4, 6].map((n, i) => ({
      id: `l${i}`, habitId: 'test-habit-1', date: daysAgoISO(n),
    }));
    const id = makeHabitWithLogs(logs);
    const rate = App.Habits.getCompletionRate(id, 7);
    expect(rate).toBeGreaterThanOrEqual(50);
    expect(rate).toBeLessThanOrEqual(60);
  });

});
