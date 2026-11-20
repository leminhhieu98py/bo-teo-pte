// Injected at document start into every page of the Mac app. It provides the small part of the
// chrome.* extension API that the pages use, backed by the native app through the "bocolen"
// message handler (each postMessage returns a Promise with the native reply). In the Chrome
// extension this file is never loaded, so the same pages work in both places.
(function () {
  const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bocolen;
  if (!handler) return;

  const call = (action, data = {}) => handler.postMessage({ action, ...data });
  const listeners = [];
  const base = 'bocolen://app/';

  // The app calls this when any window changed storage (like chrome.storage.onChanged).
  window.__boStorageChanged = (changes) => listeners.forEach((fn) => fn(changes, 'local'));

  window.chrome = {
    storage: {
      local: {
        get: (key) => call('storage.get', { key }),
        // Plain JSON values, like chrome.storage (NaN -> null, undefined dropped, Date -> text).
        set: (items) => call('storage.set', { items: JSON.parse(JSON.stringify(items)) }),
      },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
    runtime: {
      getURL: (path) => base + String(path).replace(/^\/+/, ''),
      openOptionsPage: () => call('window.open', { page: 'options/options.html' }),
      getContexts: ({ documentUrls } = {}) => call('window.find', { urls: documentUrls || [] }),
      sendMessage: async () => undefined,
      onMessage: { addListener() {} },
    },
    tabs: {
      // chrome:// pages do not exist here: the shortcut page means the app's shortcut settings.
      create: ({ url }) => (String(url).startsWith('chrome://') ? call('settings.shortcut') : call('window.open', { url })),
      getCurrent: (cb) => call('window.current').then((id) => cb({ id })),
      remove: (id) => call('window.close', { id }),
      update: (id) => call('window.focus', { id }),
    },
    windows: {
      update: (id) => call('window.focus', { id }),
    },
    commands: {
      getAll: async () => [{ name: 'save-word', shortcut: await call('shortcut.get') }],
    },
  };

  // Native-only features (shortcut presets, permissions, updates) for the Settings page.
  window.boNative = { call };
})();
