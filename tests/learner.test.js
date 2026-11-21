import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugName, makeLearnerId } from '../lib/learner.js';

test('slugName lowercases, drops accents and joins words with -', () => {
  assert.equal(slugName('Bo'), 'bo');
  assert.equal(slugName('  Bé   Ánh '), 'be-anh');
  assert.equal(slugName("Đức O'Neil"), 'duc-oneil');
});

test('slugName falls back to learner and stays short', () => {
  assert.equal(slugName('   '), 'learner');
  assert.equal(slugName('😀🎉'), 'learner');
  assert.ok(slugName('a very very long learner name here').length <= 20);
});

test('makeLearnerId is slug + _ + 8 lowercase letters or digits', () => {
  let i = 0;
  const rng = () => [0.1, 0.5, 0.9, 0.3][i++ % 4];
  const id = makeLearnerId('Bo', rng);
  assert.match(id, /^bo_[a-z0-9]{8}$/);
  assert.match(makeLearnerId('Bo Bo'), /^bo-bo_[a-z0-9]{8}$/);
  assert.notEqual(makeLearnerId('Bo'), makeLearnerId('Bo'));
});
