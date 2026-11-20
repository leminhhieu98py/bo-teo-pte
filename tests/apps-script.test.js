import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCodeGs, makeSheet } from './helpers/gas-mock.js';

test('add, duplicate add and list', () => {
  const { post } = loadCodeGs();
  assert.equal(post({ action: 'add', word: { word: 'Cat', meaning_vi: 'meo' } }).status, 'added');
  assert.equal(post({ action: 'add', word: { word: 'cat' } }).status, 'exists');
  const words = post({ action: 'list' }).words;
  assert.equal(words.length, 1);
  assert.equal(words[0].meaning_vi, 'meo');
});

test('a review sent twice with the same rid is counted once', () => {
  const { post, sheets } = loadCodeGs();
  const id = post({ action: 'add', word: { word: 'dog' } }).word.id;
  post({ action: 'review', results: [{ id, needsReview: true, rid: 'r1' }] });
  post({ action: 'review', results: [{ id, needsReview: true, rid: 'r1' }] });
  post({ action: 'review', results: [{ id, needsReview: false, rid: 'r2' }] });
  const word = post({ action: 'list' }).words[0];
  assert.equal(Number(word.review_count), 2);
  assert.equal(Number(word.fail_count), 1);
  assert.equal(String(word.flagged), 'false');
  assert.ok(sheets.Words.rows[0].includes('last_review_id'));
});

test('columns are found by header name, extra user columns are kept', () => {
  const words = makeSheet([
    ['word', 'notes', 'id', 'meaning_vi', 'review_count', 'fail_count', 'flagged', 'last_reviewed', 'added_at'],
    ['bird', 'my note', 'w1', 'chim', 0, 0, false, '', '2026-11-01'],
  ]);
  const { post } = loadCodeGs({ Words: words });
  const listed = post({ action: 'list' }).words[0];
  assert.equal(listed.id, 'w1');
  assert.equal(listed.meaning_vi, 'chim');
  post({ action: 'review', results: [{ id: 'w1', needsReview: false, rid: 'x' }] });
  assert.equal(words.rows[1][1], 'my note');
  assert.equal(words.rows[1][0], 'bird');
  assert.equal(Number(words.rows[1][4]), 1);
});

test('blank rows do not shift which row gets updated', () => {
  const history = makeSheet([
    ['date', 'rounds', 'best_xp', 'best_passed', 'total', 'best_avg_score', 'again_words', 'updated_at', 'last_round_key'],
    ['2026-11-01', 1, 10, 1, 3, 50, '', '', 'k1'],
    ['', '', '', '', '', '', '', '', ''],
    ['2026-11-03', 1, 20, 2, 3, 60, '', '', 'k3'],
  ]);
  const { post } = loadCodeGs({ History: history });
  post({ action: 'history-save', date: '2026-11-03', round: { key: 'k3b', xp: 50, passed: 3, total: 3, avgScore: 90, again: [] } });
  assert.equal(history.rows[1][2], 10);
  assert.equal(history.rows[3][2], 50);
  assert.equal(history.rows[3][1], 2);
});

test('the same round saved twice is counted once', () => {
  const { post } = loadCodeGs();
  const round = { key: '2026-11-20#1', xp: 30, passed: 1, total: 2, avgScore: 80, again: ['x'] };
  post({ action: 'history-save', date: '2026-11-20', round });
  const second = post({ action: 'history-save', date: '2026-11-20', round });
  assert.equal(second.day.rounds, 1);
  assert.equal(post({ action: 'history-list' }).days.length, 1);
});

test('wrong token is refused', () => {
  const { post } = loadCodeGs();
  assert.equal(post({ token: 'nope', action: 'list' }).ok, false);
});
