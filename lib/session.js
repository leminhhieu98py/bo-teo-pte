// Today's review session: which words, which round, where to resume.
import { buildDailySet } from './daily.js';

function firstUnfinished(session) {
  const i = session.ids.findIndex((id) => !session.results[id]);
  return i === -1 ? session.ids.length : i;
}

// Round XP: points (0-200, what the round is worth), earned (XP sent to the wallet), debt (hints the
// wallet could not pay, taken from this round's earnings).
const FRESH_ROUND = { points: 0, earned: 0, debt: 0, debtNoticeShown: false };

function newDay(words, today, rng) {
  return { date: today, ids: buildDailySet(words, { rng }), results: {}, ...FRESH_ROUND, combo: 0, round: 1, index: 0 };
}

// Returns { session, fresh }. fresh = the word set was (re)built.
export function resolveSession(saved, words, today, rng = Math.random) {
  if (!saved || saved.date !== today) return { session: newDay(words, today, rng), fresh: true };

  const existing = new Set(words.map((w) => w.id));
  const ids = (saved.ids || []).filter((id) => existing.has(id));
  const results = Object.fromEntries(Object.entries(saved.results || {}).filter(([id]) => ids.includes(id)));
  const current = saved.current && ids.includes(saved.current.id) ? saved.current : null;
  const started = Object.keys(results).length > 0 || Boolean(current);

  // Rebuild when no saved word exists any more (otherwise the round looks finished with 0 cards),
  // or when the round has not started yet (words saved since then should be included).
  if (ids.length === 0 || !started) {
    const session = {
      ...saved, ids: buildDailySet(words, { rng }), results: {}, ...FRESH_ROUND, combo: 0,
      round: saved.round || 1, index: 0, current: null, completed: false,
    };
    return { session, fresh: true };
  }

  const session = { ...saved, ids, results };
  session.index = firstUnfinished(session);
  return { session, fresh: false };
}

// A new round of today: the set is built again from the latest words, so words saved since the
// last round are included (fewer than 50 words: all of them, shuffled).
export function nextRoundSession(prev, words, today, rng = Math.random) {
  if (!prev || prev.date !== today) return newDay(words, today, rng);
  return {
    date: today,
    ids: buildDailySet(words, { rng }),
    results: {},
    ...FRESH_ROUND,
    combo: 0,
    index: 0,
    round: (prev.round || 1) + 1,
    best: prev.best,
  };
}

// The card being answered is saved in the session, so a reload continues it with the same wrong
// tries, hints and failed recordings instead of a clean card.
export function withCurrentCard(session, id, card) {
  return { ...session, current: id ? { id, card } : null };
}

export function restoreCard(session, id) {
  const current = session?.current;
  if (!current || current.id !== id || session.results?.[id]) return null;
  return current.card || null;
}

// A round whose cards are all answered but whose streak/history was not saved yet
// (for example the page was closed right after the last card).
export function needsCompletion(session) {
  const ids = session?.ids || [];
  return ids.length > 0 && ids.every((id) => session.results?.[id]) && !session.completed;
}
