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

// cells: what each slot shows. answer: the text to check. cursor: first empty slot or -1.
export function composeSlots(slots, hints, typed) {
  const typedChars = [...String(typed ?? '')];
  let letterIndex = 0;
  let typedIndex = 0;
  const cells = slots.map((slot) => {
    if (!slot.fillable) return { ch: slot.ch, kind: 'fixed' };
    const i = letterIndex++;
    if (i < hints) return { ch: slot.ch, kind: 'hint' };
    if (typedIndex < typedChars.length) return { ch: typedChars[typedIndex++], kind: 'typed' };
    return { ch: '', kind: 'empty' };
  });
  const cursor = cells.findIndex((c) => c.kind === 'empty');
  return { cells, answer: cells.map((c) => c.ch).join(''), complete: cursor === -1, cursor };
}
