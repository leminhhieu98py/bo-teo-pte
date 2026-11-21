import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listWords, addWord, postReview, saveHistory, listHistory, listUsers, createUser, renameUser, walletGet, walletEarn, walletSpend, getStats, claimAchievement, shopBuy, shopEquip, SheetError } from '../lib/sheet.js';

function fakeFetch(body, status = 200) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init, payload: JSON.parse(init.body) });
    return { ok: status === 200, status, json: async () => body };
  };
  impl.calls = calls;
  return impl;
}

const url = 'https://script.google.com/macros/s/abc/exec';

test('addWord posts the word as text/plain JSON with the token', async () => {
  const fetchImpl = fakeFetch({ ok: true, status: 'added', word: { id: '1', word: 'hello' } });
  const out = await addWord({ url, token: 't', word: { word: 'hello' }, fetchImpl });
  assert.deepEqual(out, { status: 'added', word: { id: '1', word: 'hello' } });
  const call = fetchImpl.calls[0];
  assert.equal(call.url, url);
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(call.payload, { token: 't', action: 'add', word: { word: 'hello' } });
});

test('listWords returns the words array', async () => {
  const fetchImpl = fakeFetch({ ok: true, words: [{ id: '1' }] });
  assert.deepEqual(await listWords({ url, token: 't', fetchImpl }), [{ id: '1' }]);
  assert.equal(fetchImpl.calls[0].payload.action, 'list');
});

test('postReview sends results', async () => {
  const fetchImpl = fakeFetch({ ok: true, updated: 1 });
  await postReview({ url, token: 't', results: [{ id: '1', needsReview: false }], fetchImpl });
  assert.deepEqual(fetchImpl.calls[0].payload.results, [{ id: '1', needsReview: false }]);
});

test('saveHistory sends the day and the round', async () => {
  const fetchImpl = fakeFetch({ ok: true, day: { date: '2026-11-20', rounds: 1 } });
  const round = { xp: 10, passed: 1, total: 2, avgScore: 80, again: [] };
  assert.deepEqual(await saveHistory({ url, token: 't', date: '2026-11-20', round, fetchImpl }), { date: '2026-11-20', rounds: 1 });
  assert.deepEqual(fetchImpl.calls[0].payload, { token: 't', action: 'history-save', date: '2026-11-20', round });
});

test('listHistory returns the days', async () => {
  const fetchImpl = fakeFetch({ ok: true, days: [{ date: '2026-11-20' }] });
  assert.deepEqual(await listHistory({ url, token: 't', fetchImpl }), [{ date: '2026-11-20' }]);
  assert.equal(fetchImpl.calls[0].payload.action, 'history-list');
});

test('a request that never answers times out as SheetError', async () => {
  const hang = (u, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  });
  await assert.rejects(listWords({ url, token: 't', fetchImpl: hang, timeoutMs: 20 }),
    (e) => e instanceof SheetError && /did not answer/.test(e.message));
});

test('errors from the script or HTTP become SheetError', async () => {
  await assert.rejects(listWords({ url, token: 'bad', fetchImpl: fakeFetch({ ok: false, error: 'bad token' }) }),
    (e) => e instanceof SheetError && e.message === 'bad token');
  await assert.rejects(listWords({ url, token: 't', fetchImpl: fakeFetch({}, 500) }), SheetError);
});

test('every call carries the learner id when given', async () => {
  const fetchImpl = fakeFetch({ ok: true, words: [], days: [], status: 'added', word: {} });
  await listWords({ url, token: 't', userId: 'bo_1', fetchImpl });
  await addWord({ url, token: 't', userId: 'bo_1', word: { word: 'x' }, fetchImpl });
  await postReview({ url, token: 't', userId: 'bo_1', results: [], fetchImpl });
  await saveHistory({ url, token: 't', userId: 'bo_1', date: '2026-11-21', round: {}, fetchImpl });
  await listHistory({ url, token: 't', userId: 'bo_1', fetchImpl });
  assert.deepEqual(fetchImpl.calls.map((c) => c.payload.userId), ['bo_1', 'bo_1', 'bo_1', 'bo_1', 'bo_1']);
  await listWords({ url, token: 't', fetchImpl });
  assert.equal('userId' in fetchImpl.calls[5].payload, false);
});

test('learner actions', async () => {
  const fetchImpl = fakeFetch({ ok: true, users: [{ id: 'bo_1', name: 'Bo' }], user: { id: 'bo_1', name: 'Bo' } });
  assert.deepEqual(await listUsers({ url, token: 't', fetchImpl }), [{ id: 'bo_1', name: 'Bo' }]);
  assert.deepEqual(await createUser({ url, token: 't', id: 'bo_1', name: 'Bo', fetchImpl }), { id: 'bo_1', name: 'Bo' });
  await renameUser({ url, token: 't', id: 'bo_1', name: 'Bo Bo', fetchImpl });
  assert.deepEqual(fetchImpl.calls.map((c) => c.payload.action), ['users-list', 'users-create', 'users-rename']);
  assert.deepEqual(fetchImpl.calls[2].payload, { token: 't', action: 'users-rename', id: 'bo_1', name: 'Bo Bo' });
});

test('wallet calls', async () => {
  const fetchImpl = fakeFetch({ ok: true, xp: 2050, earnedToday: 50, credited: 50, owned: [], pet: '', theme: '' });
  assert.deepEqual(await walletGet({ url, token: 't', userId: 'bo_1', date: '2026-11-21', fetchImpl }),
    { xp: 2050, earnedToday: 50, owned: [], pet: '', theme: '' });
  assert.deepEqual(await walletEarn({ url, token: 't', userId: 'bo_1', txId: 'k:w:earn', date: '2026-11-21', amount: 50, ref: 'w', fetchImpl }),
    { credited: 50, xp: 2050, earnedToday: 50 });
  assert.deepEqual(fetchImpl.calls[1].payload, { token: 't', action: 'wallet-earn', userId: 'bo_1', txId: 'k:w:earn', date: '2026-11-21', amount: 50, ref: 'w' });
  await walletSpend({ url, token: 't', userId: 'bo_1', txId: 'k:w:hint1', date: '2026-11-21', amount: 5, kind: 'hint', ref: 'w', fetchImpl });
  assert.deepEqual(fetchImpl.calls.map((c) => c.payload.action), ['wallet-get', 'wallet-earn', 'wallet-spend']);
});

test('walletSpend reports a short wallet without throwing', async () => {
  const short = fakeFetch({ ok: false, error: 'not_enough_xp', xp: 3 });
  assert.deepEqual(await walletSpend({ url, token: 't', userId: 'bo_1', txId: 'x', date: '2026-11-21', amount: 5, kind: 'hint', fetchImpl: short }),
    { ok: false, error: 'not_enough_xp', xp: 3 });
  await assert.rejects(walletSpend({ url, token: 't', userId: 'bo_1', txId: 'x', date: '2026-11-21', amount: 5, kind: 'hint', fetchImpl: fakeFetch({ ok: false, error: 'Wrong token' }) }), SheetError);
});

test('achievement calls', async () => {
  const fetchImpl = fakeFetch({ ok: true, stats: { words: 3 }, claimed: [{ id: 'sharp', tier: 0 }], xp: 2050, reward: 50 });
  assert.deepEqual(await getStats({ url, token: 't', userId: 'bo_1', date: '2026-11-21', fetchImpl }),
    { stats: { words: 3 }, claimed: [{ id: 'sharp', tier: 0 }], xp: 2050 });
  assert.deepEqual(await claimAchievement({ url, token: 't', userId: 'bo_1', achievementId: 'sharp', tier: 0, date: '2026-11-21', fetchImpl }),
    { reward: 50, xp: 2050 });
  assert.deepEqual(fetchImpl.calls[1].payload, { token: 't', action: 'achievement-claim', userId: 'bo_1', achievementId: 'sharp', tier: 0, date: '2026-11-21' });
});

test('shop calls: a refused purchase is an answer, not an error', async () => {
  const ok = fakeFetch({ ok: true, xp: 500, owned: ['night'] });
  assert.deepEqual(await shopBuy({ url, token: 't', userId: 'bo_1', itemId: 'night', date: '2026-11-21', fetchImpl: ok }), { ok: true, xp: 500, owned: ['night'] });
  assert.deepEqual(ok.calls[0].payload, { token: 't', action: 'shop-buy', userId: 'bo_1', itemId: 'night', date: '2026-11-21' });
  const poor = fakeFetch({ ok: false, error: 'not_enough_xp', xp: 20, owned: [] });
  assert.deepEqual(await shopBuy({ url, token: 't', userId: 'bo_1', itemId: 'night', date: '2026-11-21', fetchImpl: poor }), { ok: false, error: 'not_enough_xp', xp: 20, owned: [] });
  await assert.rejects(shopBuy({ url, token: 't', userId: 'bo_1', itemId: 'x', date: '2026-11-21', fetchImpl: fakeFetch({ ok: false, error: 'Unknown item' }) }), SheetError);
  const eq = fakeFetch({ ok: true, pet: 'fox-girl', theme: 'night' });
  assert.deepEqual(await shopEquip({ url, token: 't', userId: 'bo_1', kind: 'pet', itemId: 'fox-girl', fetchImpl: eq }), { pet: 'fox-girl', theme: 'night' });
});
