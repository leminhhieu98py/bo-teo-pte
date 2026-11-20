import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listWords, addWord, postReview, SheetError } from '../lib/sheet.js';

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
