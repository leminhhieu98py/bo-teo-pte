import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanWords } from '../lib/words.js';

test('cleanWords turns ids and words into trimmed strings', () => {
  const out = cleanWords([{ id: 1, word: 42, meaning_vi: 'x' }, { id: ' b ', word: '  look  up ' }]);
  assert.deepEqual(out.map((w) => [w.id, w.word]), [['1', '42'], ['b', 'look up']]);
});

test('cleanWords drops rows without id or without any letter', () => {
  const out = cleanWords([{ id: 'a', word: '...' }, { id: '', word: 'cat' }, { id: 'c', word: '—' }, { id: 'd', word: 'dog' }, null]);
  assert.deepEqual(out.map((w) => w.id), ['d']);
});

test('cleanWords keeps the first row when ids repeat', () => {
  const out = cleanWords([{ id: 'a', word: 'one' }, { id: 'a', word: 'two' }]);
  assert.deepEqual(out.map((w) => w.word), ['one']);
});
