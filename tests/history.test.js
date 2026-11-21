import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundSummary, isBetterRound, mergeDay, monthGrid, dayLevel, dayXp, monthTotals, streakFromHistory } from '../lib/history.js';

const words = new Map([['a', { word: 'apple' }], ['b', { word: 'look up' }], ['c', { word: 'banana' }]]);

test('roundSummary counts passed words, average score and words to revisit', () => {
  const session = {
    ids: ['a', 'b', 'c'],
    points: 55,
    results: {
      a: { passed: true, skipped: false, revealed: false, score: 92 },
      b: { passed: false, skipped: true, revealed: false, score: 55 },
      c: { passed: true, skipped: false, revealed: true, score: 0 },
    },
  };
  assert.deepEqual(roundSummary(session, words), { points: 55, xp: 55, passed: 2, total: 3, avgScore: 74, again: ['look up', 'banana'] });
});

test('isBetterRound compares xp, then passed, then average score', () => {
  const base = { xp: 50, passed: 3, avgScore: 80 };
  assert.equal(isBetterRound(base, null), true);
  assert.equal(isBetterRound({ ...base, xp: 60 }, base), true);
  assert.equal(isBetterRound({ ...base, xp: 40, passed: 9 }, base), false);
  assert.equal(isBetterRound({ ...base, passed: 4 }, base), true);
  assert.equal(isBetterRound({ ...base, avgScore: 81 }, base), true);
  assert.equal(isBetterRound(base, base), false);
});

test('mergeDay creates a row for the first round', () => {
  const round = { xp: 55, passed: 2, total: 3, avgScore: 74, again: ['look up', 'banana'] };
  assert.deepEqual(mergeDay(null, '2026-11-20', round, 'T1'), {
    date: '2026-11-20', rounds: 1, best_xp: 55, best_passed: 2, total: 3, best_avg_score: 74,
    again_words: 'look up, banana', updated_at: 'T1',
  });
});

test('mergeDay keeps the best round and counts every round (values may be strings)', () => {
  const row = { date: '2026-11-20', rounds: '1', best_xp: '55', best_passed: '2', total: '3', best_avg_score: '74', again_words: 'x', updated_at: 'T1' };
  const worse = mergeDay(row, '2026-11-20', { xp: 30, passed: 1, total: 3, avgScore: 60, again: [] }, 'T2');
  assert.equal(worse.rounds, 2);
  assert.equal(worse.best_xp, 55);
  assert.equal(worse.again_words, 'x');
  assert.equal(worse.updated_at, 'T2');
  const better = mergeDay(worse, '2026-11-20', { xp: 90, passed: 3, total: 3, avgScore: 95, again: [] }, 'T3');
  assert.equal(better.rounds, 3);
  assert.equal(better.best_xp, 90);
  assert.equal(better.best_passed, 3);
  assert.equal(better.again_words, '');
});

test('monthGrid starts on Monday and covers the whole month', () => {
  const grid = monthGrid(2026, 10); // November 2026
  assert.equal(grid.length, 6);
  assert.deepEqual(grid[0][0], { date: '2026-10-26', inMonth: false });
  assert.deepEqual(grid[0][6], { date: '2026-11-01', inMonth: true });
  assert.deepEqual(grid[5][0], { date: '2026-11-30', inMonth: true });
  assert.equal(grid.every((week) => week.length === 7), true);
});

test('dayLevel colors days by best passed ratio', () => {
  assert.equal(dayLevel(null), 0);
  assert.equal(dayLevel({ rounds: 1, best_passed: 0, total: 0 }), 1);
  assert.equal(dayLevel({ rounds: 1, best_passed: 1, total: 10 }), 1);
  assert.equal(dayLevel({ rounds: 1, best_passed: 3, total: 10 }), 2);
  assert.equal(dayLevel({ rounds: 1, best_passed: '6', total: '10' }), 3);
  assert.equal(dayLevel({ rounds: 1, best_passed: 8, total: 10 }), 4);
});

test('monthTotals sums the best results of the month', () => {
  const rows = [
    { date: '2026-11-01', rounds: 1, best_xp: '40', best_passed: '3' },
    { date: '2026-11-20', rounds: '2', best_xp: 60, best_passed: 5 },
    { date: '2026-10-31', rounds: 1, best_xp: 99, best_passed: 9 },
  ];
  assert.deepEqual(monthTotals(rows, 2026, 10), { days: 2, xp: 100, passed: 8 });
});

test('streakFromHistory counts consecutive studied days ending today or yesterday', () => {
  const rows = [{ date: '2026-11-18', rounds: 1 }, { date: '2026-11-19', rounds: '2' }, { date: '2026-11-20', rounds: 1 }, { date: '2026-11-15', rounds: 1 }];
  assert.deepEqual(streakFromHistory(rows, '2026-11-20'), { count: 3, lastDate: '2026-11-20' });
  assert.deepEqual(streakFromHistory(rows, '2026-11-21'), { count: 3, lastDate: '2026-11-20' });
  assert.deepEqual(streakFromHistory(rows, '2026-11-22'), { count: 0, lastDate: '2026-11-20' });
  assert.deepEqual(streakFromHistory([], '2026-11-20'), { count: 0, lastDate: '' });
  assert.deepEqual(streakFromHistory([{ date: '2026-10-31', rounds: 1 }, { date: '2026-11-01', rounds: 1 }], '2026-11-01'), { count: 2, lastDate: '2026-11-01' });
});

test('rounds with points beat a best saved without points (old scale)', () => {
  assert.equal(isBetterRound({ points: 10, passed: 1 }, { xp: 300, passed: 3 }), true);
  assert.equal(isBetterRound({ points: 10 }, { points: 20 }), false);
  assert.equal(isBetterRound({ points: 20, passed: 1 }, { points: 20, passed: 2 }), false);
  assert.equal(isBetterRound({ points: 30 }, { points: 20 }), true);
});

test('dayLevel colors days by XP earned when the day has it', () => {
  assert.equal(dayLevel({ rounds: 0, xp_earned: 0 }), 0);
  assert.equal(dayLevel({ rounds: 1, xp_earned: 0 }), 1);
  assert.equal(dayLevel({ rounds: 0, xp_earned: 30 }), 1);
  assert.equal(dayLevel({ rounds: 1, xp_earned: '49' }), 1);
  assert.equal(dayLevel({ rounds: 1, xp_earned: 50 }), 2);
  assert.equal(dayLevel({ rounds: 1, xp_earned: 120 }), 3);
  assert.equal(dayLevel({ rounds: 2, xp_earned: 200 }), 4);
  assert.equal(dayLevel({ rounds: 1, xp_earned: '', best_passed: 8, total: 10 }), 4);
});

test('dayXp prefers XP earned and falls back to the old best XP', () => {
  assert.equal(dayXp({ best_xp: 300 }), 300);
  assert.equal(dayXp({ xp_earned: 80, best_xp: 300 }), 80);
  assert.equal(dayXp({ xp_earned: '0', best_xp: 300 }), 0);
  const rows = [
    { date: '2026-11-01', best_xp: 40, rounds: 1 },
    { date: '2026-11-02', xp_earned: 150, best_xp: 999, rounds: 1 },
    { date: '2026-11-03', xp_earned: 0, rounds: 0 },
  ];
  assert.deepEqual(monthTotals(rows, 2026, 10).xp, 190);
  assert.equal(monthTotals(rows, 2026, 10).days, 2);
});

test('mergeDay with points keeps best_points and leaves best_xp', () => {
  const row = { date: '2026-11-21', rounds: 1, best_xp: 300, best_passed: 3, total: 3, best_avg_score: 90, again_words: '' };
  const merged = mergeDay(row, '2026-11-21', { points: 120, passed: 2, total: 3, avgScore: 80, again: [] }, 'T');
  assert.deepEqual([merged.best_points, merged.best_xp, merged.best_passed, merged.rounds], [120, 300, 2, 2]);
  const kept = mergeDay(merged, '2026-11-21', { points: 80, passed: 3, total: 3, avgScore: 99, again: [] }, 'T2');
  assert.deepEqual([kept.best_points, kept.best_passed, kept.rounds], [120, 2, 3]);
});

test('a day with money earned counts for the streak like a finished round', () => {
  const rows = [{ date: '2026-11-19', rounds: 1 }, { date: '2026-11-20', rounds: 0, xp_earned: 40 }];
  assert.equal(streakFromHistory(rows, '2026-11-20').count, 2);
  assert.equal(streakFromHistory([{ date: '2026-11-20', rounds: 0, xp_earned: 0 }], '2026-11-20').count, 0);
});
