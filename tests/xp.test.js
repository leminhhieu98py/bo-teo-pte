import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_CAP, ROUND_CAP, HINT_COST, HINT_CAP_PER_CARD, START_XP, wordShare, nextHintCost, payHint, settleEarn } from '../lib/xp.js';

test('XP constants', () => {
  assert.deepEqual([DAY_CAP, ROUND_CAP, HINT_COST, HINT_CAP_PER_CARD, START_XP], [200, 200, 5, 15, 2000]);
});

test('wordShare splits 200 and gives the remainder to the last word', () => {
  assert.deepEqual([0, 1, 2].map((i) => wordShare(i, 3)), [66, 66, 68]);
  assert.equal([...Array(50).keys()].reduce((s, i) => s + wordShare(i, 50), 0), 200);
  assert.equal(wordShare(0, 1), 200);
  assert.equal(wordShare(0, 0), 0);
});

test('hint costs 5 up to 15 per card', () => {
  assert.deepEqual([0, 5, 10, 15, 20].map(nextHintCost), [5, 5, 5, 0, 0]);
});

test('payHint takes the wallet only when it covers the whole cost', () => {
  assert.deepEqual(payHint({ balance: 12, cost: 5 }), { fromWallet: 5, toDebt: 0 });
  assert.deepEqual(payHint({ balance: 5, cost: 5 }), { fromWallet: 5, toDebt: 0 });
  assert.deepEqual(payHint({ balance: 3, cost: 5 }), { fromWallet: 0, toDebt: 5 });
  assert.deepEqual(payHint({ balance: 0, cost: 0 }), { fromWallet: 0, toDebt: 0 });
});

test('settleEarn pays the round debt first and respects the day cap', () => {
  assert.deepEqual(settleEarn({ share: 50, debt: 10, earnedToday: 0 }), { amount: 40, debt: 0 });
  assert.deepEqual(settleEarn({ share: 4, debt: 10, earnedToday: 0 }), { amount: 0, debt: 6 });
  assert.deepEqual(settleEarn({ share: 50, debt: 0, earnedToday: 190 }), { amount: 10, debt: 0 });
  assert.deepEqual(settleEarn({ share: 50, debt: 0, earnedToday: 200 }), { amount: 0, debt: 0 });
  assert.deepEqual(settleEarn({ share: 0, debt: 5, earnedToday: 0 }), { amount: 0, debt: 5 });
});
