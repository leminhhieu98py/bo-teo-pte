import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCardState, applyTyping, shouldAutoHint, applyGrade, canSkip, skipCard, needsReview,
  PASS_SCORE, MAX_TYPING_TRIES, MAX_PRON_FAILS,
} from '../lib/card.js';

test('constants match the spec', () => {
  assert.equal(PASS_SCORE, 70);
  assert.equal(MAX_TYPING_TRIES, 3);
  assert.equal(MAX_PRON_FAILS, 3);
});

test('correct typing moves to speaking', () => {
  const { state, result } = applyTyping(createCardState(), 'Hello', 'hello');
  assert.equal(result, 'correct');
  assert.equal(state.phase, 'speaking');
});

test('wrong and almost typing stay in typing and count tries', () => {
  let r = applyTyping(createCardState(), 'helo', 'hello');
  assert.equal(r.result, 'almost');
  assert.equal(r.state.typingWrong, 1);
  r = applyTyping(r.state, 'xyz', 'hello');
  assert.equal(r.result, 'wrong');
  assert.equal(r.state.phase, 'typing');
  assert.equal(shouldAutoHint(r.state), true);
});

test('third wrong typing reveals the word, then the learner must type it', () => {
  let s = createCardState();
  s = applyTyping(s, 'a', 'hello').state;
  s = applyTyping(s, 'b', 'hello').state;
  const r = applyTyping(s, 'c', 'hello');
  assert.equal(r.result, 'reveal');
  assert.equal(r.state.revealed, true);
  const again = applyTyping(r.state, 'd', 'hello');
  assert.equal(again.result, 'wrong');
  const ok = applyTyping(again.state, 'hello', 'hello');
  assert.equal(ok.result, 'correct');
  assert.equal(needsReview(ok.state), true);
});

test('does not mutate the previous state', () => {
  const s = createCardState();
  applyTyping(s, 'x', 'hello');
  assert.equal(s.typingWrong, 0);
});

test('pronunciation pass finishes the card', () => {
  let s = applyTyping(createCardState(), 'hello', 'hello').state;
  const r = applyGrade(s, { passed: true, score: 88 });
  assert.equal(r.result, 'pass');
  assert.equal(r.state.phase, 'done');
  assert.equal(r.state.passed, true);
  assert.equal(r.state.bestScore, 88);
  assert.equal(needsReview(r.state), false);
});

test('three failed pronunciations allow skip, skip flags the word', () => {
  let s = applyTyping(createCardState(), 'hello', 'hello').state;
  s = applyGrade(s, { passed: false, score: 40 }).state;
  s = applyGrade(s, { passed: false, score: 60 }).state;
  assert.equal(canSkip(s), false);
  s = applyGrade(s, { passed: false, score: 50 }).state;
  assert.equal(canSkip(s), true);
  assert.equal(s.bestScore, 60);
  const done = skipCard(s);
  assert.equal(done.phase, 'done');
  assert.equal(done.skipped, true);
  assert.equal(needsReview(done), true);
});
