// Today's review session: which words, which round, where to resume.
import { buildDailySet, shuffle } from './daily.js';

function firstUnfinished(session) {
  const i = session.ids.findIndex((id) => !session.results[id]);
  return i === -1 ? session.ids.length : i;
}

function newDay(words, today, rng) {
  return { date: today, ids: buildDailySet(words, { rng }), results: {}, xp: 0, combo: 0, round: 1, index: 0 };
}

// Returns { session, fresh }. fresh = the word set was (re)built.
export function resolveSession(saved, words, today, rng = Math.random) {
  if (!saved || saved.date !== today) return { session: newDay(words, today, rng), fresh: true };

  const existing = new Set(words.map((w) => w.id));
  const ids = (saved.ids || []).filter((id) => existing.has(id));
  const results = Object.fromEntries(Object.entries(saved.results || {}).filter(([id]) => ids.includes(id)));
  const started = Object.keys(results).length > 0;

  // Rebuild when no saved word exists any more (otherwise the round looks finished with 0 cards),
  // or when round 1 has not started yet (words saved since then should be included).
  if (ids.length === 0 || (!started && (saved.round || 1) <= 1)) {
    const session = { ...saved, ids: buildDailySet(words, { rng }), results: {}, xp: 0, combo: 0, round: saved.round || 1, index: 0 };
    return { session, fresh: true };
  }

  const session = { ...saved, ids, results };
  session.index = firstUnfinished(session);
  return { session, fresh: false };
}

// A new round with today's words reshuffled. Rebuilds the set when it is empty or the day changed.
export function nextRoundSession(prev, words, today, rng = Math.random) {
  if (!prev || prev.date !== today) return newDay(words, today, rng);
  const existing = new Set(words.map((w) => w.id));
  const ids = (prev.ids || []).filter((id) => existing.has(id));
  return {
    date: today,
    ids: ids.length ? shuffle(ids, rng) : buildDailySet(words, { rng }),
    results: {},
    xp: 0,
    combo: 0,
    index: 0,
    round: (prev.round || 1) + 1,
    best: prev.best,
  };
}
