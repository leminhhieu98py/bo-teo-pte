import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSession, nextRoundSession, restoreCard, withCurrentCard, needsCompletion } from '../lib/session.js';

const words = ['a', 'b', 'c'].map((id, i) => ({ id, word: id, added_at: `2026-11-1${i}`, flagged: false }));
const rng = () => 0.42;
const today = '2026-11-20';

test('resolveSession starts round 1 on a new day', () => {
  const { session, fresh } = resolveSession({ date: '2026-11-19', ids: ['a'], results: { a: {} }, round: 3 }, words, today, rng);
  assert.equal(fresh, true);
  assert.equal(session.date, today);
  assert.equal(session.round, 1);
  assert.deepEqual([...session.ids].sort(), ['a', 'b', 'c']);
  assert.equal(session.index, 0);
});

test('resolveSession keeps a started session and resumes at the first unfinished card', () => {
  const saved = { date: today, ids: ['b', 'a', 'c'], results: { b: { passed: true } }, xp: 30, round: 1 };
  const { session, fresh } = resolveSession(saved, words, today, rng);
  assert.equal(fresh, false);
  assert.deepEqual(session.ids, ['b', 'a', 'c']);
  assert.equal(session.index, 1);
});

test('resolveSession rebuilds when every saved word is gone (the 0 / 0 bug)', () => {
  const saved = { date: today, ids: ['old1', 'old2'], results: {}, xp: 0, round: 2, best: { xp: 40 } };
  const { session, fresh } = resolveSession(saved, words, today, rng);
  assert.equal(fresh, true);
  assert.equal(session.ids.length, 3);
  assert.equal(session.round, 2);
  assert.deepEqual(session.best, { xp: 40 });
  assert.equal(session.index, 0);
});

test('resolveSession drops deleted words but keeps the rest', () => {
  const saved = { date: today, ids: ['a', 'gone', 'b'], results: { a: { passed: true } }, round: 1 };
  const { session } = resolveSession(saved, words, today, rng);
  assert.deepEqual(session.ids, ['a', 'b']);
  assert.equal(session.index, 1);
});

test('resolveSession rebuilds an unstarted round 1 so new words are included', () => {
  const { fresh } = resolveSession({ date: today, ids: ['a'], results: {}, round: 1 }, words, today, rng);
  assert.equal(fresh, true);
});

test('nextRoundSession reuses today\'s words in a new round and keeps the best', () => {
  const prev = { date: today, ids: ['a', 'b'], results: { a: {}, b: {} }, xp: 60, round: 1, best: { xp: 60 } };
  const next = nextRoundSession(prev, words, today, rng);
  assert.equal(next.round, 2);
  assert.deepEqual([...next.ids].sort(), ['a', 'b']);
  assert.deepEqual(next.results, {});
  assert.equal(next.xp, 0);
  assert.deepEqual(next.best, { xp: 60 });
});

test('nextRoundSession rebuilds the set when the previous one is empty', () => {
  const next = nextRoundSession({ date: today, ids: [], results: {}, round: 2 }, words, today, rng);
  assert.equal(next.ids.length, 3);
  assert.equal(next.round, 3);
});

test('nextRoundSession starts a new day after midnight', () => {
  const next = nextRoundSession({ date: '2026-11-19', ids: ['a'], results: {}, round: 4 }, words, today, rng);
  assert.equal(next.date, today);
  assert.equal(next.round, 1);
});

test('restoreCard returns the saved card only for the card being shown', () => {
  const card = { phase: 'speaking', typingWrong: 2, hints: 1, pronFails: 1, attempts: ['x'] };
  const session = withCurrentCard({ date: today, ids: ['a', 'b'], results: {}, index: 0 }, 'a', card);
  assert.deepEqual(session.current, { id: 'a', card });
  assert.deepEqual(restoreCard(session, 'a'), card);
  assert.equal(restoreCard(session, 'b'), null);
  assert.equal(restoreCard({ ids: ['a'], results: {} }, 'a'), null);
});

test('restoreCard ignores a saved card whose word is already finished', () => {
  const session = { ids: ['a'], results: { a: { passed: true } }, current: { id: 'a', card: { phase: 'done' } } };
  assert.equal(restoreCard(session, 'a'), null);
});

test('withCurrentCard(null) clears the in-progress card', () => {
  const session = withCurrentCard({ current: { id: 'a', card: {} } }, null, null);
  assert.equal(session.current, null);
});

test('resolveSession keeps the in-progress card across reloads', () => {
  const saved = { date: today, ids: ['a', 'b'], results: {}, round: 1, current: { id: 'a', card: { phase: 'typing', typingWrong: 2 } } };
  const { session, fresh } = resolveSession(saved, words, today, rng);
  assert.equal(fresh, false);
  assert.deepEqual(session.current, saved.current);
});

test('resolveSession drops an in-progress card on a new day', () => {
  const saved = { date: '2026-11-19', ids: ['a'], results: {}, round: 1, current: { id: 'a', card: {} } };
  assert.equal(resolveSession(saved, words, today, rng).session.current, undefined);
});

test('needsCompletion is true only for a finished round that was not closed', () => {
  assert.equal(needsCompletion({ ids: ['a'], results: { a: {} }, completed: false }), true);
  assert.equal(needsCompletion({ ids: ['a'], results: { a: {} }, completed: true }), false);
  assert.equal(needsCompletion({ ids: ['a', 'b'], results: { a: {} } }), false);
  assert.equal(needsCompletion({ ids: [], results: {} }), false);
});
