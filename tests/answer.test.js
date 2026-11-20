import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, isCorrect, levenshtein, isAlmost, maskWord } from '../lib/answer.js';

test('normalize lowercases, trims, collapses spaces and unifies apostrophes', () => {
  assert.equal(normalize('  Don’t   Stop. '), "don't stop");
});

test('isCorrect accepts case, spacing, apostrophe and edge punctuation differences', () => {
  assert.equal(isCorrect('Don’t.', "don't"), true);
  assert.equal(isCorrect('  LOOK   up ', 'look up'), true);
  assert.equal(isCorrect('look', 'look up'), false);
  assert.equal(isCorrect('', 'look'), false);
});

test('levenshtein computes edit distance', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('same', 'same'), 0);
});

test('isAlmost is true for close misses on words of length >= 4', () => {
  assert.equal(isAlmost('helo', 'hello'), true);
  assert.equal(isAlmost('beautifull', 'beautiful'), true);
  assert.equal(isAlmost('cat', 'car'), false);
  assert.equal(isAlmost('hello', 'hello'), false);
  assert.equal(isAlmost('xyzzy', 'hello'), false);
});

test('maskWord hides the word and its common suffixes', () => {
  assert.equal(maskWord('He runs every day.', 'run'), 'He ____ every day.');
  assert.equal(maskWord('Please Look up the word.', 'look up'), 'Please ____ the word.');
  assert.equal(maskWord('She smiled at me.', 'smile'), 'She ____ at me.');
  assert.equal(maskWord('Nothing to hide.', 'apple'), 'Nothing to hide.');
  assert.equal(maskWord('', 'apple'), '');
});

test('answers ignore accents', () => {
  assert.equal(isCorrect('cafe', 'café'), true);
  assert.equal(isCorrect('naive', 'naïve'), true);
  assert.equal(isCorrect('cafe', 'cafes'), false);
});

test('maskWord hides endings on every word of a phrase and curly apostrophes', () => {
  assert.equal(maskWord('She looked up the word.', 'look up'), 'She ____ the word.');
  assert.equal(maskWord('I don’t know.', "don't"), 'I ____ know.');
  assert.equal(maskWord('A nice café here.', 'cafe'), 'A nice ____ here.');
});
