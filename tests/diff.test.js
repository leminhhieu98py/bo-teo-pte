import { test } from 'node:test';
import assert from 'node:assert/strict';
import { letterDiff } from '../lib/diff.js';

const count = (ops, type) => ops.filter((o) => o.type === type).length;
const show = (ops) => ops.map((o) => ({ match: o.ch, wrong: `[${o.ch}>${o.expected}]`, extra: `+${o.ch}`, missing: `-${o.expected}` }[o.type])).join('');

test('letterDiff marks every letter as match for the right answer', () => {
  const ops = letterDiff('Occasion', 'occasion');
  assert.equal(ops.length, 8);
  assert.equal(count(ops, 'match'), 8);
});

test('letterDiff finds one missing letter without breaking the rest', () => {
  const ops = letterDiff('ocasion', 'occasion');
  assert.equal(count(ops, 'missing'), 1);
  assert.equal(count(ops, 'match'), 7);
  assert.equal(ops.find((o) => o.type === 'missing').expected, 'c');
});

test('letterDiff finds an extra letter', () => {
  const ops = letterDiff('occassion', 'occasion');
  assert.equal(count(ops, 'extra'), 1);
  assert.equal(ops.find((o) => o.type === 'extra').ch, 's');
  assert.equal(count(ops, 'match'), 8);
});

test('letterDiff shows wrong letters with the expected one', () => {
  assert.equal(show(letterDiff('okkasion', 'occasion')), 'o[k>c][k>c]asion');
  assert.equal(show(letterDiff('occation', 'occasion')), 'occa[t>s]ion');
});

test('letterDiff handles phrases and empty answers', () => {
  assert.equal(show(letterDiff('lok up', 'look up')), 'lo-ok up');
  assert.equal(show(letterDiff('', 'cat')), '-c-a-t');
});
