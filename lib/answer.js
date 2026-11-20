// Checking what the learner types against the saved English word.

// Lowercase, unify apostrophes and drop accents (café = cafe).
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[‘’ʼ`]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

export function isCorrect(input, word) {
  const a = normalize(input);
  return a.length > 0 && a === normalize(word);
}

export function levenshtein(a, b) {
  const s = String(a);
  const t = String(b);
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const curr = [i];
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[t.length];
}

export function isAlmost(input, word) {
  const a = normalize(input);
  const b = normalize(word);
  if (!a || a === b || b.length < 4) return false;
  return levenshtein(a, b) <= 2;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pattern for one word that also catches common inflections:
// run -> runs/running, smile -> smiled/smiling, study -> studied, look -> looked.
function tokenPattern(token) {
  const alternatives = [escapeRegex(token)];
  if (token.length > 2 && token.endsWith('e')) alternatives.push(`${escapeRegex(token.slice(0, -1))}(?=ing)`);
  if (token.length > 2 && token.endsWith('y')) alternatives.push(`${escapeRegex(token.slice(0, -1))}(?=ie)`);
  return `(?:${alternatives.join('|')})[\\p{L}']*`;
}

// One character folded like normalize() (no accent, lowercase, straight apostrophe), keeping the
// same length so match positions map back to the original sentence.
function foldChar(ch) {
  const folded = ch.normalize('NFD').replace(/\p{M}/gu, '').replace(/[‘’ʼ`]/g, "'").toLowerCase();
  return folded.length === 1 ? folded : ch;
}

export function maskWord(sentence, word) {
  const text = String(sentence ?? '');
  const tokens = normalize(word).split(' ').filter(Boolean);
  if (!text || tokens.length === 0) return text;
  const chars = [...text];
  const folded = chars.map(foldChar).join('');
  const pattern = new RegExp(`(?<![\\p{L}])${tokens.map(tokenPattern).join('\\s+')}`, 'gu');
  let out = '';
  let last = 0;
  for (const m of folded.matchAll(pattern)) {
    const start = [...folded.slice(0, m.index)].length;
    const end = start + [...m[0]].length;
    out += chars.slice(last, start).join('') + '____';
    last = end;
  }
  return out + chars.slice(last).join('');
}
