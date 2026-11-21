import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSlots, letterCount, sanitizeTyped, composeSlots, typedEdit, caretOffset } from '../lib/slots.js';

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

test('composeSlots blinks on the slot at the caret', () => {
  const slots = buildSlots('look up');
  assert.equal(composeSlots(slots, 0, 'lok', 1).cursor, 1);
  assert.equal(composeSlots(slots, 0, 'lok', 0).cursor, 0);
  assert.equal(composeSlots(slots, 0, 'lok', 3).cursor, 3);
  // Fixed characters are skipped: letter 4 is after the space.
  assert.equal(composeSlots(slots, 0, 'lookup', 4).cursor, 5);
  // Hints come first, so the caret counts from the first typed slot.
  assert.equal(composeSlots(buildSlots('Exclamation'), 2, 'cl', 0).cursor, 2);
  // Without a caret it stays at the end of the typed letters.
  assert.equal(composeSlots(slots, 0, 'lok').cursor, 3);
});

test('composeSlots is complete when every slot is filled, wherever the caret is', () => {
  const out = composeSlots(buildSlots('cat'), 0, 'cat', 1);
  assert.equal(out.complete, true);
  assert.equal(out.cursor, 1);
  assert.equal(composeSlots(buildSlots('cat'), 0, 'cat', 3).cursor, -1);
});

test('typedEdit keeps letters only and keeps the caret among the letters', () => {
  assert.deepEqual(typedEdit('C-at', 2, 5, { typed: 'cat', caret: 1 }), { typed: 'cat', caret: 1 });
  assert.deepEqual(typedEdit('cta', 2, 5, { typed: 'ca', caret: 1 }), { typed: 'cta', caret: 2 });
  assert.deepEqual(typedEdit('ca', 1, 5, { typed: 'cta', caret: 2 }), { typed: 'ca', caret: 1 });
});

test('typedEdit ignores a new letter when every slot is full', () => {
  assert.deepEqual(typedEdit('cxat', 2, 3, { typed: 'cat', caret: 1 }), { typed: 'cat', caret: 1 });
  assert.deepEqual(typedEdit('catx', 4, 3, { typed: 'cat', caret: 3 }), { typed: 'cat', caret: 3 });
});

test('typedEdit cuts at max while an input method is composing', () => {
  assert.deepEqual(typedEdit('cxat', 2, 3, { typed: 'cat', caret: 1 }, { composing: true }), { typed: 'cxa', caret: 2 });
});

test('caretOffset turns a letter caret into an input offset', () => {
  assert.equal(caretOffset('cat', 2), 2);
  assert.equal(caretOffset('cat', 9), 3);
  assert.equal(caretOffset('cat', -1), 0);
});
