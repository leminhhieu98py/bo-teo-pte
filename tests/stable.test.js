import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stableStringify } from '../lib/stable.js';

test('stableStringify ignores key order at every level', () => {
  const a = { date: 'd', results: { b: { x: 1, y: 2 }, a: {} }, ids: ['b', 'a'] };
  const b = { ids: ['b', 'a'], results: { a: {}, b: { y: 2, x: 1 } }, date: 'd' };
  assert.equal(stableStringify(a), stableStringify(b));
});

test('stableStringify keeps array order and drops undefined like JSON', () => {
  assert.notEqual(stableStringify(['a', 'b']), stableStringify(['b', 'a']));
  assert.equal(stableStringify({ a: undefined, b: null }), '{"b":null}');
  assert.equal(stableStringify(null), 'null');
});
