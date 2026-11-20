import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSelection, extractSentence } from '../lib/text.js';

test('validateSelection trims and strips edge punctuation', () => {
  assert.deepEqual(validateSelection('  hello, '), { ok: true, value: 'hello' });
  assert.deepEqual(validateSelection('"well-being."'), { ok: true, value: 'well-being' });
  assert.deepEqual(validateSelection("don't"), { ok: true, value: "don't" });
});

test('validateSelection collapses inner whitespace', () => {
  assert.deepEqual(validateSelection('look \n  up'), { ok: true, value: 'look up' });
});

test('validateSelection rejects empty input', () => {
  assert.deepEqual(validateSelection(''), { ok: false, reason: 'empty' });
  assert.deepEqual(validateSelection('  ...  '), { ok: false, reason: 'empty' });
  assert.deepEqual(validateSelection(undefined), { ok: false, reason: 'empty' });
});

test('validateSelection rejects more than 6 words', () => {
  assert.deepEqual(validateSelection('one two three four five six seven'), { ok: false, reason: 'too_long' });
  assert.equal(validateSelection('one two three four five six').ok, true);
});

test('validateSelection rejects more than 60 characters', () => {
  assert.deepEqual(validateSelection('a'.repeat(61)), { ok: false, reason: 'too_long' });
  assert.equal(validateSelection('a'.repeat(60)).ok, true);
});

test('extractSentence returns the sentence containing the selection', () => {
  const text = 'This is the first one. I want to look up this word. And then more!';
  assert.equal(extractSentence(text, 'look up'), 'I want to look up this word.');
});

test('extractSentence is case-insensitive and collapses whitespace', () => {
  const text = 'Hello there.\n  The   Weather is nice today?  Yes.';
  assert.equal(extractSentence(text, 'weather'), 'The Weather is nice today?');
});

test('extractSentence returns empty string when not found', () => {
  assert.equal(extractSentence('Nothing here.', 'banana'), '');
  assert.equal(extractSentence('', 'banana'), '');
});

test('extractSentence caps length at 300 characters', () => {
  const long = 'word '.repeat(200) + 'target ' + 'word '.repeat(200);
  assert.ok(extractSentence(long, 'target').length <= 300);
  assert.ok(extractSentence(long, 'target').includes('target'));
});
