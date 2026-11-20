// Service worker: saves the selected word when the shortcut or the context menu is used.
import { validateSelection, extractSentence } from './lib/text.js';
import { enrichWord, GeminiError } from './lib/gemini.js';
import { addWord } from './lib/sheet.js';
import { getReadySettings, getSettings, missingSettings, SetupError } from './lib/storage.js';

const MENU_ID = 'save-word';

chrome.runtime.onInstalled.addListener(async () => {
  // onInstalled also fires on reload/update; remove first to avoid a duplicate-id error.
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: MENU_ID, title: 'Save "%s" to Bo cố lên', contexts: ['selection'] });
  const settings = await getSettings();
  if (missingSettings(settings).length) chrome.runtime.openOptionsPage();
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'save-word' && tab?.id) saveFromTab(tab);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id) saveFromTab(tab, info.selectionText);
});

// Runs inside the page (every frame). Must be self-contained.
function readSelectionInPage() {
  const selection = window.getSelection();
  const text = selection ? selection.toString() : '';
  if (!text.trim()) return null;
  let node = selection.anchorNode;
  if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  const block = node && node.closest ? node.closest('p, li, td, div, section, article, blockquote, h1, h2, h3, h4, span') : null;
  const context = (block && block.innerText) || (node && node.textContent) || '';
  return { text, context: context.slice(0, 2000) };
}

// Runs inside the page (top frame). Must be self-contained.
function showToastInPage(message, kind) {
  const HOST_ID = 'word-buddy-toast-host';
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;';
    host.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(host);
  }
  const colors = {
    loading: ['#7C5CFF', '#F1ECFF'],
    success: ['#14A37F', '#E3FBF3'],
    info: ['#C98A00', '#FFF6DA'],
    error: ['#E0466B', '#FFE8EE'],
  }[kind] || ['#7C5CFF', '#F1ECFF'];
  host.shadowRoot.innerHTML = `
    <style>
      .toast { font: 600 15px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #2D2250; background: ${colors[1]}; border: 2px solid ${colors[0]};
        border-radius: 18px; padding: 12px 16px; max-width: 340px; display: flex; gap: 10px;
        align-items: center; box-shadow: 0 10px 30px rgba(60, 40, 140, .25);
        animation: pop .35s cubic-bezier(.2, 1.6, .4, 1); }
      .dot { flex: none; width: 34px; height: 34px; border-radius: 50%; background: ${colors[0]};
        display: grid; place-items: center; color: #fff; font-size: 18px; }
      .spin { width: 16px; height: 16px; border: 3px solid rgba(255,255,255,.4);
        border-top-color: #fff; border-radius: 50%; animation: spin .8s linear infinite; }
      @keyframes pop { from { transform: translateY(-12px) scale(.9); opacity: 0; } }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
    <div class="toast"><div class="dot">${kind === 'loading' ? '<div class="spin"></div>' : kind === 'success' ? '&#10003;' : '!'}</div><div class="msg"></div></div>`;
  host.shadowRoot.querySelector('.msg').textContent = message;
  clearTimeout(window.__wordBuddyToastTimer);
  if (kind !== 'loading') {
    window.__wordBuddyToastTimer = setTimeout(() => host.remove(), kind === 'error' ? 6000 : 4000);
  }
}

async function toast(tabId, message, kind) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, func: showToastInPage, args: [message, kind] });
  } catch {
    // Pages like chrome:// cannot be scripted; nothing else to do.
  }
}

async function readSelection(tabId, fallbackText) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: readSelectionInPage,
    });
    const hit = results.map((r) => r.result).find(Boolean);
    if (hit) return hit;
  } catch {
    // Fall through to the context menu text.
  }
  return fallbackText ? { text: fallbackText, context: '' } : null;
}

function errorMessage(err) {
  if (err instanceof SetupError) return `Bo cố lên needs setup. ${err.message}`;
  if (err instanceof GeminiError && err.code === 'quota') return 'Gemini is busy (quota). Try again in a minute.';
  if (err instanceof GeminiError && err.code === 'auth') return 'Gemini API key is not valid. Check Settings.';
  return `Could not save: ${err.message}`;
}

async function saveFromTab(tab, fallbackText) {
  const tabId = tab.id;
  const picked = await readSelection(tabId, fallbackText);
  const check = validateSelection(picked?.text);
  if (!check.ok) {
    const msg = check.reason === 'empty'
      ? 'Highlight a word first, then press the shortcut.'
      : 'That is too long. Pick a word or a short phrase (max 6 words).';
    await toast(tabId, msg, 'info');
    return;
  }

  const word = check.value;
  await toast(tabId, `Saving "${word}"...`, 'loading');
  try {
    const settings = await getReadySettings();
    const context = extractSentence(picked.context, word);
    const enriched = await enrichWord({ apiKey: settings.apiKey, model: settings.model, word, context });
    const { status, word: saved } = await addWord({
      url: settings.sheetUrl,
      token: settings.token,
      word: { ...enriched, source_url: tab.url || '' },
    });
    if (status === 'exists') {
      await toast(tabId, `"${saved.word}" is already in your list: ${saved.meaning_vi}`, 'info');
    } else {
      await toast(tabId, `Saved "${saved.word}" - ${saved.meaning_vi}`, 'success');
    }
  } catch (err) {
    await toast(tabId, errorMessage(err), 'error');
    if (err instanceof SetupError) chrome.runtime.openOptionsPage();
  }
}
