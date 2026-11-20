// Helpers for the text the learner selects on a web page.

export const MAX_WORDS = 6;
export const MAX_CHARS = 60;
const MAX_SENTENCE_CHARS = 300;

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

export function collapseSpaces(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

export function validateSelection(raw) {
  const value = collapseSpaces(raw).replace(EDGE_PUNCTUATION, '');
  if (!value) return { ok: false, reason: 'empty' };
  if (value.length > MAX_CHARS || value.split(' ').length > MAX_WORDS) {
    return { ok: false, reason: 'too_long' };
  }
  return { ok: true, value };
}

export function extractSentence(fullText, selected) {
  const text = collapseSpaces(fullText);
  const needle = collapseSpaces(selected).toLowerCase();
  if (!text || !needle) return '';

  const sentences = text.match(/[^.!?]+[.!?]*/g) || [];
  const sentence = sentences.map((s) => s.trim()).find((s) => s.toLowerCase().includes(needle));
  if (!sentence) return '';
  if (sentence.length <= MAX_SENTENCE_CHARS) return sentence;

  // Very long "sentence" (no punctuation): keep a window around the selection.
  const at = sentence.toLowerCase().indexOf(needle);
  const half = Math.floor((MAX_SENTENCE_CHARS - needle.length) / 2);
  const start = Math.max(0, at - half);
  return sentence.slice(start, start + MAX_SENTENCE_CHARS).trim();
}
