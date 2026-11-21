import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const data = {};
globalThis.chrome = {
  storage: { local: {
    get: async (key) => (key in data ? { [key]: structuredClone(data[key]) } : {}),
    set: async (items) => { Object.assign(data, structuredClone(items)); },
  } },
  runtime: { getURL: (p) => `test://${p}` },
};
globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
const { getSettings, saveSettings, missingSettings } = await import('../lib/storage.js');

beforeEach(() => { for (const k of Object.keys(data)) delete data[k]; });

test('a learner is required like the connection values', async () => {
  const settings = await saveSettings({ sheetUrl: 'u', token: 't', apiKey: 'k' });
  assert.deepEqual(missingSettings(settings), ['Learner']);
  assert.deepEqual(missingSettings({ ...settings, userId: 'bo_12345678', userName: 'Bo' }), []);
});

test('settings keep the learner id and name', async () => {
  await saveSettings({ userId: 'bo_12345678', userName: 'Bo' });
  const s = await getSettings();
  assert.equal(s.userId, 'bo_12345678');
  assert.equal(s.userName, 'Bo');
});

test('switching learner clears the local session and streak, renaming does not', async () => {
  await saveSettings({ userId: 'bo_12345678', userName: 'Bo' });
  data.session = { date: '2026-11-21' };
  data.streak = { count: 3, lastDate: '2026-11-21' };
  await saveSettings({ userName: 'Bo Bo' });
  assert.ok(data.session);
  await saveSettings({ userId: 'an_87654321', userName: 'An' });
  assert.equal(data.session, null);
  assert.deepEqual(data.streak, { count: 0, lastDate: '' });
});
