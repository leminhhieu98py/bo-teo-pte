// XP wallet rules. The Sheet (Code.gs) enforces the same day cap; this file decides what the app shows
// and sends.

export const DAY_CAP = 200; // XP a learner can earn from practice in one day
export const ROUND_CAP = 200; // points a perfect round is worth
export const HINT_COST = 5;
export const HINT_CAP_PER_CARD = 15; // hints after this are free on the same card
export const START_XP = 2000; // a new learner's wallet

// Points for the word at `index` in a round of `count` words: an even split of 200, the last word gets
// the remainder so a perfect round is exactly 200.
export function wordShare(index, count) {
  if (!count) return 0;
  const each = Math.floor(ROUND_CAP / count);
  return index === count - 1 ? ROUND_CAP - each * (count - 1) : each;
}

// Cost of the next hint on a card that has already paid `paidOnCard` XP for hints.
export function nextHintCost(paidOnCard) {
  return (Number(paidOnCard) || 0) < HINT_CAP_PER_CARD ? HINT_COST : 0;
}

// The wallet pays a hint only when it covers the whole cost; otherwise the round owes it (debt).
export function payHint({ balance, cost }) {
  return (Number(balance) || 0) >= cost ? { fromWallet: cost, toDebt: 0 } : { fromWallet: 0, toDebt: cost };
}

// XP to send for a finished word: the round's hint debt is paid first, then the day cap applies.
export function settleEarn({ share, debt, earnedToday }) {
  const use = Math.min(share, debt);
  const room = Math.max(0, DAY_CAP - (Number(earnedToday) || 0));
  return { amount: Math.min(share - use, room), debt: debt - use };
}
