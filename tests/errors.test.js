import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorEntry, formatDetail, pushLog } from '../lib/errors.js';
import { GeminiError } from '../lib/gemini.js';
import { SheetError } from '../lib/sheet.js';

const now = new Date('2026-11-20T10:00:00Z');

test('errorEntry captures where, model, status, code, message and word', () => {
  const err = new GeminiError('This model is currently experiencing high demand.', 'other', 503);
  assert.deepEqual(errorEntry(err, { where: 'save', model: 'gemini-3.1-flash-lite', word: 'look up', now }), {
    time: '2026-11-20T10:00:00.000Z',
    where: 'save',
    model: 'gemini-3.1-flash-lite',
    status: 503,
    code: 'other',
    name: 'GeminiError',
    message: 'This model is currently experiencing high demand.',
    word: 'look up',
  });
});

test('errorEntry accepts a serialized error and fills defaults', () => {
  const entry = errorEntry({ name: 'SheetError', message: 'Wrong token', status: 0 }, { where: 'sheet', now });
  assert.equal(entry.code, '');
  assert.equal(entry.model, '');
  assert.equal(entry.word, '');
  assert.equal(entry.name, 'SheetError');
});

test('errorEntry cuts very long messages', () => {
  const entry = errorEntry(new SheetError('x'.repeat(1000)), { where: 'sheet', now });
  assert.ok(entry.message.length <= 300);
});

test('formatDetail joins the known parts', () => {
  const base = { model: 'gemini-3.1-flash-lite', status: 503, code: 'other', message: 'high demand' };
  assert.equal(formatDetail(base), 'gemini-3.1-flash-lite · HTTP 503 · other: high demand');
  assert.equal(formatDetail({ ...base, model: '', status: 0, code: '' }), 'high demand');
  assert.equal(formatDetail({ ...base, name: 'SheetError', model: '' }), 'Sheet · HTTP 503 · other: high demand');
});

test('pushLog keeps the newest entries first, max 20', () => {
  let log = [];
  for (let i = 0; i < 25; i++) log = pushLog(log, { message: String(i) });
  assert.equal(log.length, 20);
  assert.equal(log[0].message, '24');
  assert.equal(log[19].message, '5');
  assert.deepEqual(pushLog(undefined, { message: 'a' }), [{ message: 'a' }]);
});

test('SheetError keeps the HTTP status', () => {
  assert.equal(new SheetError('boom', 500).status, 500);
});
