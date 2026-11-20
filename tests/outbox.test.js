import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOutbox } from '../lib/outbox.js';

function memoryStore() {
  const data = {};
  return {
    data,
    get: async (key) => { await new Promise((r) => setTimeout(r, 1)); return data[key]; },
    set: async (key, value) => { await new Promise((r) => setTimeout(r, 1)); data[key] = JSON.parse(JSON.stringify(value)); },
  };
}

test('add keeps items until they are sent', async () => {
  const store = memoryStore();
  const box = createOutbox(store, 'outbox');
  const item = await box.add('review', { id: 'a' });
  assert.equal(item.kind, 'review');
  assert.ok(item.id);
  assert.equal((await box.all()).length, 1);
});

test('parallel adds are not lost', async () => {
  const box = createOutbox(memoryStore(), 'outbox');
  await Promise.all([box.add('review', 1), box.add('review', 2), box.add('history', 3)]);
  assert.equal((await box.all()).length, 3);
});

test('flush removes only the items that were sent', async () => {
  const box = createOutbox(memoryStore(), 'outbox');
  await box.add('review', 'ok');
  await box.add('review', 'fail');
  await box.add('history', 'ok');
  const result = await box.flush(async (item) => { if (item.payload === 'fail') throw new Error('offline'); });
  assert.deepEqual(result, { sent: 2, failed: 1 });
  const left = await box.all();
  assert.deepEqual(left.map((i) => i.payload), ['fail']);
});

test('send(item) sends one item and removes it on success', async () => {
  const box = createOutbox(memoryStore(), 'outbox');
  const item = await box.add('review', 'x');
  assert.equal(await box.send(item, async () => {}), true);
  assert.equal((await box.all()).length, 0);
  const again = await box.add('review', 'y');
  assert.equal(await box.send(again, async () => { throw new Error('down'); }), false);
  assert.equal((await box.all()).length, 1);
});
