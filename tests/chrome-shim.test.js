import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Objects made inside the vm sandbox have another realm's prototypes: compare plain copies.
const plain = (v) => JSON.parse(JSON.stringify(v));
const source = readFileSync(new URL('../native/chrome-shim.js', import.meta.url), 'utf8');

function load(replies = {}) {
  const calls = [];
  const window = {
    webkit: { messageHandlers: { bocolen: { postMessage: async (msg) => { calls.push(msg); return replies[msg.action]; } } } },
  };
  vm.runInNewContext(source, { window });
  return { chrome: window.chrome, window, calls };
}

test('does nothing outside the Mac app', () => {
  const window = {};
  vm.runInNewContext(source, { window });
  assert.equal(window.chrome, undefined);
});

test('storage get/set go to the native store', async () => {
  const { chrome, calls } = load({ 'storage.get': { session: { a: 1 } } });
  assert.deepEqual(plain(await chrome.storage.local.get('session')), { session: { a: 1 } });
  await chrome.storage.local.set({ prefs: { muted: true } });
  assert.deepEqual(calls.map((c) => c.action), ['storage.get', 'storage.set']);
  assert.equal(calls[0].key, 'session');
  assert.deepEqual(plain(calls[1].items), { prefs: { muted: true } });
});

test('storage change events from native reach listeners', () => {
  const { chrome, window } = load();
  const seen = [];
  chrome.storage.onChanged.addListener((changes, area) => seen.push([changes, area]));
  window.__boStorageChanged({ session: { newValue: 1 } });
  assert.deepEqual(plain(seen), [[{ session: { newValue: 1 } }, 'local']]);
});

test('runtime and tabs map to app windows', async () => {
  const { chrome, calls } = load({ 'window.current': 7, 'window.find': [{ tabId: 3, windowId: 3 }], 'shortcut.get': '⌃⌥B' });
  assert.equal(chrome.runtime.getURL('review/review.html'), 'bocolen://app/review/review.html');
  assert.equal(chrome.runtime.getURL('/icons/icon32.png'), 'bocolen://app/icons/icon32.png');
  chrome.runtime.openOptionsPage();
  await chrome.tabs.create({ url: 'bocolen://app/history/history.html' });
  await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  const tab = await new Promise((resolve) => chrome.tabs.getCurrent(resolve));
  assert.deepEqual(plain(tab), { id: 7 });
  await chrome.tabs.remove(7);
  assert.deepEqual(plain(await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: ['x'] })), [{ tabId: 3, windowId: 3 }]);
  await chrome.tabs.update(3, { active: true });
  await chrome.windows.update(3, { focused: true });
  assert.deepEqual(plain(await chrome.commands.getAll()), [{ name: 'save-word', shortcut: '⌃⌥B' }]);
  assert.deepEqual(calls.map((c) => c.action), [
    'window.open', 'window.open', 'settings.shortcut', 'window.current', 'window.close', 'window.find', 'window.focus', 'window.focus', 'shortcut.get',
  ]);
  assert.equal(calls[0].page, 'options/options.html');
  assert.equal(calls[1].url, 'bocolen://app/history/history.html');
});

test('exposes boNative for native-only settings', async () => {
  const { window, calls } = load({ 'app.info': { version: '1.0.0' } });
  assert.deepEqual(plain(await window.boNative.call('app.info')), { version: '1.0.0' });
  assert.equal(calls[0].action, 'app.info');
});

test('values are cleaned like chrome.storage does (NaN -> null, undefined dropped)', async () => {
  const { chrome, calls } = load();
  await chrome.storage.local.set({ session: { xp: NaN, gone: undefined, when: 'x' } });
  const sent = calls[0].items.session; // raw object handed to the native bridge
  assert.equal(sent.xp, null);
  assert.equal('gone' in sent, false);
  assert.equal(sent.when, 'x');
});
