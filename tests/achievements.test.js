import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIERS, ACHIEVEMENTS, reachedTier, progress, newlyReached, roundCounters } from '../lib/achievements.js';

test('tiers and their rewards', () => {
  assert.deepEqual(TIERS.map((t) => [t.id, t.name, t.reward]), [
    ['bronze', 'Bronze', 50], ['silver', 'Silver', 100], ['gold', 'Gold', 200], ['platinum', 'Platinum', 400], ['diamond', 'Diamond', 800],
  ]);
});

test('the eight categories with their measures and thresholds', () => {
  assert.deepEqual(ACHIEVEMENTS.map((a) => [a.id, a.measure, a.thresholds]), [
    ['hard-working', 'streak_best', [3, 7, 14, 30, 60]],
    ['sharp', 'rounds_no_hint', [1, 5, 20, 50, 100]],
    ['flawless', 'flawless_best', [2, 5, 10, 20]],
    ['fashion', 'owned', [1, 3, 6, 12, 25]],
    ['word-hunter', 'words', [10, 50, 100, 250, 500]],
    ['golden-voice', 'great_words', [10, 50, 150, 400, 1000]],
    ['full-charge', 'full_days', [1, 5, 15, 40]],
    ['big-earner', 'earned_total', [1000, 5000, 15000, 40000, 100000]],
  ]);
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.name && a.description && a.icon, a.id);
    assert.ok(a.thresholds.length <= TIERS.length, a.id);
  }
});

test('reachedTier and progress', () => {
  const t = [3, 7, 14];
  assert.deepEqual([0, 2, 3, 6, 7, 14, 99].map((v) => reachedTier(v, t)), [-1, -1, 0, 0, 1, 2, 2]);
  assert.deepEqual(progress(5, t), { tier: 0, next: 7, ratio: 0.5 });
  assert.deepEqual(progress(0, t), { tier: -1, next: 3, ratio: 0 });
  assert.deepEqual(progress(20, t), { tier: 2, next: null, ratio: 1 });
});

test('newlyReached lists every reached tier not claimed yet, in catalog order', () => {
  const stats = { streak_best: 8, rounds_no_hint: 1, flawless_best: 0, owned: 0, words: 12, great_words: 0, full_days: 0, earned_total: 0 };
  const claimed = [{ id: 'hard-working', tier: 0 }];
  assert.deepEqual(newlyReached(stats, claimed), [
    { id: 'hard-working', tier: 1, reward: 100 },
    { id: 'sharp', tier: 0, reward: 50 },
    { id: 'word-hunter', tier: 0, reward: 50 },
  ]);
  assert.deepEqual(newlyReached({}, []), []);
  assert.deepEqual(newlyReached(stats, [{ id: 'hard-working', tier: '1' }, { id: 'hard-working', tier: 0 }, { id: 'sharp', tier: 0 }, { id: 'word-hunter', tier: 0 }]), []);
});

test('roundCounters: no hint, flawless and great words', () => {
  const s = {
    ids: ['a', 'b', 'c'],
    results: {
      a: { passed: true, score: 95, hints: 0 },
      b: { passed: true, score: 80, hints: 0 },
      c: { passed: true, score: 90 },
    },
  };
  assert.deepEqual(roundCounters(s), { noHint: true, flawless: true, great: 2 });
  assert.deepEqual(roundCounters({ ...s, results: { ...s.results, b: { passed: false, score: 40, hints: 0 } } }), { noHint: true, flawless: false, great: 2 });
  assert.deepEqual(roundCounters({ ...s, results: { ...s.results, b: { passed: true, score: 99, hints: 1 } } }), { noHint: false, flawless: false, great: 3 });
  assert.deepEqual(roundCounters({ ids: [], results: {} }), { noHint: false, flawless: false, great: 0 });
});
