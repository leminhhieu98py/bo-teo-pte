import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSlots, letterCount, sanitizeTyped, composeSlots } from '../lib/slots.js';

const kinds = (cells) => cells.map((c) => c.kind).join(',');
const chars = (cells) => cells.map((c) => c.ch || '_').join('');

test('buildSlots marks letters fillable and keeps spaces, apostrophes and hyphens fixed', () => {
  const slots = buildSlots(" Look  up ");
  assert.equal(slots.map((s) => (s.fillable ? '_' : s.ch)).join(''), '____ __');
  assert.equal(letterCount(slots), 6);
  assert.equal(buildSlots("don't").filter((s) => !s.fillable).map((s) => s.ch).join(''), "'");
  assert.equal(letterCount(buildSlots('well-being')), 9);
});

test('sanitizeTyped keeps only letters and digits, lowercased, up to max', () => {
  assert.equal(sanitizeTyped("Lo ok-U'p!", 10), 'lookup');
  assert.equal(sanitizeTyped('exclamations', 11), 'exclamation');
  assert.equal(sanitizeTyped('', 3), '');
  assert.equal(sanitizeTyped('abc', 0), '');
});

test('composeSlots shows empty slots before typing', () => {
  const out = composeSlots(buildSlots('look up'), 0, '');
  assert.equal(chars(out.cells), '____ __');
  assert.equal(out.complete, false);
  assert.equal(out.cursor, 0);
});

test('composeSlots fills typed letters left to right, skipping fixed characters', () => {
  const out = composeSlots(buildSlots('look up'), 0, 'lookup');
  assert.equal(out.answer, 'look up');
  assert.equal(out.complete, true);
  assert.equal(out.cursor, -1);
  assert.equal(kinds(out.cells), 'typed,typed,typed,typed,fixed,typed,typed');
});

test('composeSlots puts hinted letters first and typed letters after them', () => {
  const out = composeSlots(buildSlots('Exclamation'), 2, 'cl');
  assert.equal(chars(out.cells), 'Excl_______');
  assert.equal(kinds(out.cells.slice(0, 5)), 'hint,hint,typed,typed,empty');
  assert.equal(out.cursor, 4);
  assert.equal(out.complete, false);
});

test('composeSlots with a full hint is complete and equals the word', () => {
  const out = composeSlots(buildSlots("don't"), 4, '');
  assert.equal(out.answer, "don't");
  assert.equal(out.complete, true);
});
