import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayKey, toBool, buildDailySet } from '../lib/daily.js';

function makeWords(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `w${i}`,
    added_at: new Date(Date.UTC(2026, 0, 1) + i * 3600_000).toISOString(),
    flagged: false,
  }));
}

function seededRng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

test('todayKey formats local date', () => {
  assert.equal(todayKey(new Date(2026, 10, 5, 23, 59)), '2026-11-05');
});

test('toBool understands sheet values', () => {
  assert.equal(toBool(true), true);
  assert.equal(toBool('TRUE'), true);
  assert.equal(toBool('true'), true);
  assert.equal(toBool(1), true);
  assert.equal(toBool('FALSE'), false);
  assert.equal(toBool(''), false);
  assert.equal(toBool(undefined), false);
});

test('buildDailySet returns 30 latest + 20 random without duplicates', () => {
  const words = makeWords(100);
  const ids = buildDailySet(words, { rng: seededRng() });
  assert.equal(ids.length, 50);
  assert.equal(new Set(ids).size, 50);
  for (let i = 70; i < 100; i++) assert.ok(ids.includes(`w${i}`), `latest w${i} missing`);
});

test('buildDailySet returns every word when there are fewer than 50', () => {
  const ids = buildDailySet(makeWords(10), { rng: seededRng() });
  assert.equal(ids.length, 10);
  assert.equal(new Set(ids).size, 10);
});

test('buildDailySet always includes flagged words, even old ones given as strings', () => {
  const words = makeWords(100);
  words[0].flagged = 'TRUE';
  words[75].flagged = true; // also in latest: must not duplicate
  const ids = buildDailySet(words, { rng: seededRng() });
  assert.ok(ids.includes('w0'));
  assert.equal(ids.filter((id) => id === 'w75').length, 1);
  assert.equal(ids.length, 51);
});

test('buildDailySet handles empty input', () => {
  assert.deepEqual(buildDailySet([], {}), []);
});
