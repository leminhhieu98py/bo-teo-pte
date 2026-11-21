// Letter slots for the typing card: one slot per letter, hints are a prefix of the letters.

const LETTER = /[\p{L}\p{N}]/u;

export function buildSlots(word) {
  const text = String(word ?? '').replace(/\s+/g, ' ').trim();
  return [...text].map((ch) => ({ ch, fillable: LETTER.test(ch) }));
}

export function letterCount(slots) {
  return slots.filter((s) => s.fillable).length;
}

// Only letters/digits can be typed; spaces and punctuation are already shown.
export function sanitizeTyped(raw, max) {
  return [...String(raw ?? '').toLowerCase()].filter((ch) => LETTER.test(ch)).slice(0, Math.max(0, max)).join('');
}

// cells: what each slot shows. answer: the text to check. caret: typed letters before the caret
// (default: after the last one). cursor: the slot at the caret, or -1 when the caret is past a full word.
export function composeSlots(slots, hints, typed, caret) {
  const typedChars = [...String(typed ?? '')];
  const at = Math.min(Math.max(0, caret ?? typedChars.length), typedChars.length);
  let letterIndex = 0;
  let typedIndex = 0;
  let cursor = -1;
  const cells = slots.map((slot, i) => {
    if (!slot.fillable) return { ch: slot.ch, kind: 'fixed' };
    const n = letterIndex++;
    if (n < hints) return { ch: slot.ch, kind: 'hint' };
    if (n - hints === at) cursor = i;
    if (typedIndex < typedChars.length) return { ch: typedChars[typedIndex++], kind: 'typed' };
    return { ch: '', kind: 'empty' };
  });
  const complete = !cells.some((c) => c.kind === 'empty');
  return { cells, answer: cells.map((c) => c.ch).join(''), complete, cursor };
}

// New typed letters and caret after the hidden input changed. raw/caret: the input value and its
// selectionStart. prev: the last accepted { typed, caret }. A letter typed into a full word is ignored,
// except while an input method is composing (then the word is cut at max).
export function typedEdit(raw, caret, max, prev, { composing = false } = {}) {
  const text = String(raw ?? '');
  const letters = [...text.toLowerCase()].filter((ch) => LETTER.test(ch));
  const before = [...text.slice(0, Math.max(0, caret ?? text.length)).toLowerCase()].filter((ch) => LETTER.test(ch)).length;
  if (letters.length > max && !composing && prev) return { typed: prev.typed, caret: prev.caret };
  const typed = letters.slice(0, Math.max(0, max)).join('');
  return { typed, caret: Math.min(before, [...typed].length) };
}

// Input offset (UTF-16) for a caret counted in letters.
export function caretOffset(typed, caret) {
  const chars = [...String(typed ?? '')];
  return chars.slice(0, Math.min(Math.max(0, caret), chars.length)).join('').length;
}
