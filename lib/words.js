// Clean the word rows coming from the Sheet before using them anywhere.
const HAS_LETTER = /[\p{L}\p{N}]/u;

// ids and words become trimmed strings (hand-typed rows may hold numbers), rows without an id or
// without any letter are dropped (their card could never be answered), repeated ids keep the first.
export function cleanWords(rows) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    const id = String(row.id ?? '').trim();
    const word = String(row.word ?? '').replace(/\s+/g, ' ').trim();
    if (!id || !HAS_LETTER.test(word) || seen.has(id)) continue;
    seen.add(id);
    out.push({ ...row, id, word });
  }
  return out;
}
