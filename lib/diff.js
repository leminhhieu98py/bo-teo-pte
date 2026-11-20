// Letter-by-letter comparison of a typed answer with the correct word, aligned like an edit
// distance so one missing or extra letter does not mark every following letter as wrong.
import { normalize } from './answer.js';

// Returns [{ type: 'match' | 'wrong' | 'extra' | 'missing', ch?, expected? }]
export function letterDiff(typedRaw, targetRaw) {
  const a = [...normalize(typedRaw)];
  const b = [...normalize(targetRaw)];
  // d[i][j] = edits needed to turn a[i..] into b[j..]
  const d = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length; i >= 0; i--) {
    for (let j = b.length; j >= 0; j--) {
      if (i === a.length) d[i][j] = b.length - j;
      else if (j === b.length) d[i][j] = a.length - i;
      else if (a[i] === b[j]) d[i][j] = d[i + 1][j + 1];
      else d[i][j] = 1 + Math.min(d[i + 1][j + 1], d[i][j + 1], d[i + 1][j]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j] && d[i][j] === d[i + 1][j + 1]) {
      ops.push({ type: 'match', ch: a[i] });
      i++; j++;
    } else if (i < a.length && j < b.length && d[i][j] === 1 + d[i + 1][j + 1]) {
      ops.push({ type: 'wrong', ch: a[i], expected: b[j] });
      i++; j++;
    } else if (j < b.length && d[i][j] === 1 + d[i][j + 1]) {
      ops.push({ type: 'missing', expected: b[j] });
      j++;
    } else {
      ops.push({ type: 'extra', ch: a[i] });
      i++;
    }
  }
  return ops;
}
