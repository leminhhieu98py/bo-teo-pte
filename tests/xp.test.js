import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_CAP, ROUND_CAP, HINT_COST, HINT_CAP_PER_CARD, START_XP, wordShare, nextHintCost, payHint, settleEarn, formatMoney, withPending } from '../lib/xp.js';

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

test('formatMoney shows dollars with thousands separators', () => {
  assert.equal(formatMoney(2000), '$2,000');
  assert.equal(formatMoney(50), '$50');
  assert.equal(formatMoney(0), '$0');
  assert.equal(formatMoney(-5), '-$5');
  assert.equal(formatMoney(1234567), '$1,234,567');
  assert.equal(formatMoney('15'), '$15');
  assert.equal(formatMoney(undefined), '$0');
});

test('withPending adds wallet writes still waiting in the outbox', () => {
  const server = { xp: 2000, earnedToday: 150, owned: [], date: '2026-11-21' };
  const items = [
    { kind: 'earn', payload: { date: '2026-11-21', amount: 30 } },
    { kind: 'hint', payload: { date: '2026-11-21', amount: 5 } },
    { kind: 'earn', payload: { date: '2026-11-21', amount: 40 } }, // only 20 fit under the cap
    { kind: 'review', payload: {} },
  ];
  assert.deepEqual(withPending(server, items, '2026-11-21'), { xp: 2045, earnedToday: 200, owned: [], date: '2026-11-21' });
  assert.deepEqual(withPending({ xp: 3, earnedToday: 0 }, [{ kind: 'hint', payload: { amount: 5 } }], '2026-11-21'), { xp: 0, earnedToday: 0 });
  assert.deepEqual(withPending({ xp: 10, earnedToday: 0 }, [{ kind: 'earn', payload: { date: '2026-11-20', amount: 7 } }], '2026-11-21'), { xp: 17, earnedToday: 0 });
});
