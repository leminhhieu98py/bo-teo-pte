import { formatMoney } from './xp.js';

// Achievements: categories of tiered medals. Code.gs keeps the same thresholds and rewards
// (ACHIEVEMENT_CATALOG / TIER_REWARDS; a test checks they match) and pays each tier once.

export const TIERS = [
  { id: 'bronze', name: 'Bronze', reward: 50 },
  { id: 'silver', name: 'Silver', reward: 100 },
  { id: 'gold', name: 'Gold', reward: 200 },
  { id: 'platinum', name: 'Platinum', reward: 400 },
  { id: 'diamond', name: 'Diamond', reward: 800 },
];

export const ACHIEVEMENTS = [
  { id: 'hard-working', name: 'Hard-working', icon: 'flame', measure: 'streak_best', unit: 'days in a row', unitOne: 'day in a row',
    description: 'Practice many days in a row.', thresholds: [3, 7, 14, 30, 60] },
  { id: 'sharp', name: 'Sharp', icon: 'target', measure: 'rounds_no_hint', unit: 'rounds without hints', unitOne: 'round without hints',
    description: 'Finish a practice without using any hint.', thresholds: [1, 5, 20, 50, 100] },
  { id: 'flawless', name: 'Flawless', icon: 'sparkle', measure: 'flawless_best', unit: 'perfect rounds in a row', unitOne: 'perfect round in a row',
    description: 'Perfect practices in a row: no hint and every word passed.', thresholds: [2, 5, 10, 20] },
  { id: 'fashion', name: 'Fashion', icon: 'hanger', measure: 'owned', unit: 'pets and themes', unitOne: 'pet or theme',
    description: 'Collect pets and themes in the Shop.', thresholds: [1, 3, 6, 12, 25] },
  { id: 'word-hunter', name: 'Word hunter', icon: 'book', measure: 'words', unit: 'words saved', unitOne: 'word saved',
    description: 'Save new words while you read.', thresholds: [10, 50, 100, 250, 500] },
  { id: 'golden-voice', name: 'Golden voice', icon: 'note', measure: 'great_words', unit: 'words scored 90+', unitOne: 'word scored 90+',
    description: 'Say words so well that they score 90 or more.', thresholds: [10, 50, 150, 400, 1000] },
  { id: 'full-charge', name: 'Full charge', icon: 'bolt', measure: 'full_days', unit: 'days at $200', unitOne: 'day at $200',
    description: 'Earn the full $200 in one day.', thresholds: [1, 5, 15, 40] },
  { id: 'big-earner', name: 'Big earner', icon: 'coins', measure: 'earned_total', unit: 'earned in total', unitOne: 'earned in total',
    description: 'Earn money from practice, all time.', thresholds: [1000, 5000, 15000, 40000, 100000] },
];

// "3 days in a row", "1 round without hints", "$1,000 earned in total".
export function goalText(a, value) {
  if (a.measure === 'earned_total') return `${formatMoney(value)} ${a.unit}`;
  return `${value} ${Number(value) === 1 ? a.unitOne : a.unit}`;
}

// Highest tier index reached (-1 = none yet).
export function reachedTier(value, thresholds) {
  const v = Number(value) || 0;
  let tier = -1;
  thresholds.forEach((t, i) => { if (v >= t) tier = i; });
  return tier;
}

// Where the learner stands: reached tier, next threshold (null when every tier is done), and how far
// along the way from the reached tier to the next one (0..1).
export function progress(value, thresholds) {
  const v = Number(value) || 0;
  const tier = reachedTier(v, thresholds);
  const next = thresholds[tier + 1] ?? null;
  if (next === null) return { tier, next, ratio: 1 };
  const base = tier >= 0 ? thresholds[tier] : 0;
  return { tier, next, ratio: Math.max(0, Math.min(1, (v - base) / (next - base))) };
}

// Every reached tier that is not claimed yet, in catalog order.
export function newlyReached(stats, claimed) {
  const have = new Set((claimed || []).map((c) => `${c.id}:${Number(c.tier)}`));
  const out = [];
  for (const a of ACHIEVEMENTS) {
    const top = reachedTier(stats?.[a.measure], a.thresholds);
    for (let tier = 0; tier <= top; tier++) {
      if (!have.has(`${a.id}:${tier}`)) out.push({ id: a.id, tier, reward: TIERS[tier].reward });
    }
  }
  return out;
}

// Counters for History: no hint in the whole round, flawless (no hint and all passed), great words.
export function roundCounters(session) {
  const results = Object.values(session?.results || {});
  // Rounds saved before hints were recorded do not count, and a round must pass at least one word.
  const noHint = results.some((r) => r.passed) && results.every((r) => typeof r.hints === 'number' && r.hints === 0);
  const allPassed = results.length > 0 && results.length === (session.ids || []).length && results.every((r) => r.passed);
  return {
    noHint,
    flawless: noHint && allPassed,
    great: results.filter((r) => r.passed && (Number(r.score) || 0) >= 90).length,
  };
}
