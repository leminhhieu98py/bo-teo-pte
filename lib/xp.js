// XP wallet rules. The Sheet (Code.gs) enforces the same day cap; this file decides what the app shows
// and sends.

export const DAY_CAP = 200; // XP a learner can earn from practice in one day
export const ROUND_CAP = 200; // points a perfect round is worth
export const HINT_COST = 5;
export const HINT_CAP_PER_CARD = 15; // hints after this are free on the same card
export const START_XP = 2000; // a new learner's wallet

// Points for the word at `index` in a round of `count` words: an even split of 200 (the first words
// take the remainder, one each), so a perfect round is exactly 200 and no word is worth more than another
// by more than 1.
export function wordShare(index, count) {
  if (!count) return 0;
  const each = Math.floor(ROUND_CAP / count);
  return each + (index < ROUND_CAP - each * count ? 1 : 0);
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

// What the learner should see: the Sheet's wallet plus earn/hint writes still waiting in the outbox.
export function withPending(server, items, today) {
  let xp = Number(server.xp) || 0;
  let earnedToday = Number(server.earnedToday) || 0;
  for (const item of items || []) {
    const amount = Math.max(0, Number(item.payload?.amount) || 0);
    if (item.kind === 'earn' && item.payload.date === today) {
      const add = Math.min(amount, Math.max(0, DAY_CAP - earnedToday));
      xp += add;
      earnedToday += add;
    } else if (item.kind === 'earn') {
      xp += amount; // another day: its cap is not known here
    } else if (item.kind === 'hint') {
      xp = Math.max(0, xp - amount);
    }
  }
  return { ...server, xp, earnedToday };
}

// Every amount the learner sees is money: $2,000, -$5.
export function formatMoney(value) {
  const n = Math.round(Number(value) || 0);
  const text = `$${Math.abs(n).toLocaleString('en-US')}`;
  return n < 0 ? `-${text}` : text;
}
