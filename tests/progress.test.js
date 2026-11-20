import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateStreak, currentStreak, starsForScore, xpForCard, pickMessage, MESSAGE_KINDS } from '../lib/progress.js';

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

test('xpForCard rewards first-try passes most', () => {
  assert.equal(xpForCard({ passed: true, skipped: false, typingWrong: 0, pronFails: 0 }), 30);
  assert.equal(xpForCard({ passed: true, skipped: false, typingWrong: 1, pronFails: 0 }), 20);
  assert.equal(xpForCard({ passed: true, skipped: false, typingWrong: 0, pronFails: 2 }), 20);
  assert.equal(xpForCard({ passed: true, skipped: false, typingWrong: 0, pronFails: 0, hints: 1 }), 20);
  assert.equal(xpForCard({ passed: false, skipped: true, typingWrong: 0, pronFails: 3 }), 5);
});

test('pickMessage returns a non-empty string for every kind', () => {
  for (const kind of MESSAGE_KINDS) {
    const msg = pickMessage(kind, () => 0.5);
    assert.equal(typeof msg, 'string');
    assert.ok(msg.length > 0, kind);
  }
});
