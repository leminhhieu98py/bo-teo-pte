import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundSummary, isBetterRound, mergeDay, monthGrid, dayLevel, monthTotals } from '../lib/history.js';

const words = new Map([['a', { word: 'apple' }], ['b', { word: 'look up' }], ['c', { word: 'banana' }]]);

test('roundSummary counts passed words, average score and words to revisit', () => {
  const session = {
    ids: ['a', 'b', 'c'],
    xp: 55,
    results: {
      a: { passed: true, skipped: false, revealed: false, score: 92 },
      b: { passed: false, skipped: true, revealed: false, score: 55 },
      c: { passed: true, skipped: false, revealed: true, score: 0 },
    },
  };
  assert.deepEqual(roundSummary(session, words), { xp: 55, passed: 2, total: 3, avgScore: 74, again: ['look up', 'banana'] });
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
    { date: '2026-11-01', best_xp: '40', best_passed: '3' },
    { date: '2026-11-20', best_xp: 60, best_passed: 5 },
    { date: '2026-10-31', best_xp: 99, best_passed: 9 },
  ];
  assert.deepEqual(monthTotals(rows, 2026, 10), { days: 2, xp: 100, passed: 8 });
});
