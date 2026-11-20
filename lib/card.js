// State of one flashcard: typing -> speaking -> done. Every function returns a new state.
import { isCorrect, isAlmost } from './answer.js';

export const PASS_SCORE = 70;
export const MAX_TYPING_TRIES = 3;
export const MAX_PRON_FAILS = 3;

export function createCardState() {
  return {
    phase: 'typing',
    typingWrong: 0,
    attempts: [], // wrong answers, shown letter by letter when the word is revealed
    hints: 0,
    revealed: false,
    pronFails: 0,
    bestScore: 0,
    passed: false,
    skipped: false,
  };
}

export function applyTyping(state, input, word) {
  if (isCorrect(input, word)) {
    return { state: { ...state, phase: 'speaking' }, result: 'correct' };
  }
  const next = { ...state, typingWrong: state.typingWrong + 1, attempts: [...(state.attempts || []), input] };
  if (!state.revealed && next.typingWrong >= MAX_TYPING_TRIES) {
    return { state: { ...next, revealed: true }, result: 'reveal' };
  }
  const result = !state.revealed && isAlmost(input, word) ? 'almost' : 'wrong';
  return { state: next, result };
}

// Reveal one more letter. Revealing every letter counts as not passed (revealed).
export function applyHint(state, totalLetters) {
  const current = state.hints || 0;
  if (current >= totalLetters) return { state, result: 'none' };
  const hints = current + 1;
  if (hints >= totalLetters) return { state: { ...state, hints, revealed: true }, result: 'full' };
  return { state: { ...state, hints }, result: 'hint' };
}

export function revealAll(state, totalLetters) {
  return { ...state, hints: totalLetters, revealed: true };
}

export function shouldAutoHint(state) {
  return state.typingWrong >= 2;
}

export function applyGrade(state, grade) {
  const bestScore = Math.max(state.bestScore, Number(grade.score) || 0);
  if (grade.passed) {
    return { state: { ...state, bestScore, phase: 'done', passed: true }, result: 'pass' };
  }
  return { state: { ...state, bestScore, pronFails: state.pronFails + 1 }, result: 'fail' };
}

export function canSkip(state) {
  return state.phase === 'speaking' && state.pronFails >= MAX_PRON_FAILS;
}

export function skipCard(state) {
  return { ...state, phase: 'done', skipped: true };
}

export function needsReview(state) {
  return Boolean(state.skipped || state.revealed);
}
