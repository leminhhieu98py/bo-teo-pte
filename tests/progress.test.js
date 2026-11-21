import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateStreak, currentStreak, starsForScore, pickMessage, MESSAGE_KINDS, todayStats, progressLabel } from '../lib/progress.js';

test('updateStreak keeps the count on the same day', () => {
  assert.deepEqual(updateStreak({ count: 4, lastDate: '2026-11-20' }, '2026-11-20'), { count: 4, lastDate: '2026-11-20' });
});

test('updateStreak increments after yesterday, across month boundary', () => {
  assert.deepEqual(updateStreak({ count: 4, lastDate: '2026-10-31' }, '2026-11-01'), { count: 5, lastDate: '2026-11-01' });
});

test('updateStreak resets after a gap or with no history', () => {
  assert.deepEqual(updateStreak({ count: 9, lastDate: '2026-11-10' }, '2026-11-20'), { count: 1, lastDate: '2026-11-20' });
  assert.deepEqual(updateStreak(undefined, '2026-11-20'), { count: 1, lastDate: '2026-11-20' });
});

test('currentStreak shows the streak only while it is alive', () => {
  assert.equal(currentStreak({ count: 3, lastDate: '2026-11-20' }, '2026-11-20'), 3);
  assert.equal(currentStreak({ count: 3, lastDate: '2026-11-19' }, '2026-11-20'), 3);
  assert.equal(currentStreak({ count: 3, lastDate: '2026-11-18' }, '2026-11-20'), 0);
  assert.equal(currentStreak({ count: 0, lastDate: '' }, '2026-11-20'), 0);
});

test('starsForScore boundaries', () => {
  assert.equal(starsForScore(69), 0);
  assert.equal(starsForScore(70), 1);
  assert.equal(starsForScore(79), 1);
  assert.equal(starsForScore(80), 2);
  assert.equal(starsForScore(89), 2);
  assert.equal(starsForScore(90), 3);
});

test('pickMessage returns a non-empty string for every kind', () => {
  for (const kind of MESSAGE_KINDS) {
    const msg = pickMessage(kind, () => 0.5);
    assert.equal(typeof msg, 'string');
    assert.ok(msg.length > 0, kind);
  }
});

test('updateStreak never moves back to an older day', () => {
  assert.deepEqual(updateStreak({ count: 5, lastDate: '2026-11-20' }, '2026-11-19'), { count: 5, lastDate: '2026-11-20' });
});

test('todayStats shows XP earned today from the wallet and the balance', () => {
  const session = { date: '2026-11-21', ids: ['a', 'b', 'c', 'd'], results: { a: {} }, round: 2 };
  const wallet = { xp: 2150, earnedToday: 150, date: '2026-11-21' };
  assert.deepEqual(todayStats(session, '2026-11-21', wallet), { xp: 150, balance: 2150, done: 1, total: 4, round: 2 });
});

test('todayStats ignores yesterday and works without a wallet', () => {
  const old = { xp: 2150, earnedToday: 150, date: '2026-11-20' };
  assert.deepEqual(todayStats(null, '2026-11-21', old), { xp: 0, balance: 2150, done: 0, total: 0, round: 1 });
  assert.deepEqual(todayStats({ date: '2026-11-20', ids: ['a'] }, '2026-11-21', null), { xp: 0, balance: null, done: 0, total: 0, round: 1 });
});

test('progressLabel names the round from the second round', () => {
  assert.equal(progressLabel({ done: 0, total: 0, round: 1 }), 'not started');
  assert.equal(progressLabel({ done: 2, total: 4, round: 1 }), '2 / 4 cards');
  assert.equal(progressLabel({ done: 0, total: 4, round: 2 }), 'Round 2: 0 / 4 cards');
});
