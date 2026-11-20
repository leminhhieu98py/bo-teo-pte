// Picks which words to review today.

export const LATEST_COUNT = 30;
export const RANDOM_COUNT = 20;

export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toBool(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return false;
}

export function shuffle(items, rng = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Flagged words (skipped or revealed before) + 30 most recent + 20 random older ones.
export function buildDailySet(words, { latest = LATEST_COUNT, random = RANDOM_COUNT, rng = Math.random } = {}) {
  const list = Array.isArray(words) ? words.filter((w) => w && w.id) : [];
  const byNewest = [...list].sort((a, b) => String(b.added_at).localeCompare(String(a.added_at)));

  const picked = new Set();
  for (const w of list) if (toBool(w.flagged)) picked.add(w.id);
  for (const w of byNewest.slice(0, latest)) picked.add(w.id);

  const rest = byNewest.slice(latest).filter((w) => !picked.has(w.id));
  for (const w of shuffle(rest, rng).slice(0, random)) picked.add(w.id);

  return shuffle([...picked], rng);
}
