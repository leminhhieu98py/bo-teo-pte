// Service worker: saves the selected word when the shortcut or the context menu is used.
import { validateSelection, extractSentence } from './lib/text.js';
import { describeSaveResult, errorPayload } from './lib/save.js';
import { errorEntry } from './lib/errors.js';
import { MIN_AREA_PX } from './lib/capture.js';
import { getReadySettings, getSettings, missingSettings, appendErrorLog } from './lib/storage.js';

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

// Runs inside the page (top frame). Lets the learner drag a rectangle; resolves with the
// rectangle in page pixels, or null when cancelled. Must be self-contained.
function selectAreaInPage() {
  return new Promise((resolve) => {
    const ID = 'word-buddy-area-overlay';
    document.getElementById(ID)?.remove();
    const overlay = document.createElement('div');
    overlay.id = ID;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(45,34,80,.28);';
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;display:none;pointer-events:none;border:3px dashed #7C5CFF;border-radius:8px;box-shadow:0 0 0 9999px rgba(45,34,80,.35);';
    const tip = document.createElement('div');
    tip.textContent = 'Drag around the word explanation. Press Esc to cancel.';
    tip.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);pointer-events:none;background:#7C5CFF;color:#fff;font:700 14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;padding:10px 18px;border-radius:999px;box-shadow:0 8px 24px rgba(60,40,140,.3);';
    overlay.append(box, tip);
    document.documentElement.appendChild(overlay);

    let start = null;
    const area = (e) => ({
      x: Math.min(start.x, e.clientX),
      y: Math.min(start.y, e.clientY),
      width: Math.abs(e.clientX - start.x),
      height: Math.abs(e.clientY - start.y),
    });
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(null);
      }
    };
    const timer = setTimeout(() => finish(null), 120000);
    function finish(rect) {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      // Let the page repaint without the overlay before the screenshot is taken. The timeout
      // covers pages where animation frames are paused.
      let done = false;
      const settle = () => {
        if (!done) {
          done = true;
          resolve(rect);
        }
      };
      requestAnimationFrame(() => requestAnimationFrame(settle));
      setTimeout(settle, 150);
    }
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', (e) => {
      e.preventDefault();
      start = { x: e.clientX, y: e.clientY };
      overlay.style.background = 'transparent';
      tip.style.display = 'none';
      box.style.display = 'block';
    });
    overlay.addEventListener('mousemove', (e) => {
      if (!start) return;
      const r = area(e);
      Object.assign(box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
    });
    overlay.addEventListener('mouseup', (e) => {
      if (!start) return;
      finish({ ...area(e), viewportWidth: window.innerWidth });
    });
  });
}

// Runs inside the page (top frame). Must be self-contained.
function showToastInPage(message, kind, detail) {
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
      .detail { margin-top: 4px; font: 500 12px/1.35 ui-monospace, Menlo, monospace; color: #6E6590; word-break: break-word; }
      .detail:empty { display: none; }
      @keyframes pop { from { transform: translateY(-12px) scale(.9); opacity: 0; } }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
    <div class="toast"><div class="dot">${kind === 'loading' ? '<div class="spin"></div>' : kind === 'success' ? '&#10003;' : '!'}</div><div><div class="msg"></div><div class="detail"></div></div></div>`;
  host.shadowRoot.querySelector('.msg').textContent = message;
  host.shadowRoot.querySelector('.detail').textContent = detail || '';
  clearTimeout(window.__wordBuddyToastTimer);
  if (kind !== 'loading') {
    window.__wordBuddyToastTimer = setTimeout(() => host.remove(), kind === 'error' ? 10000 : 4000);
  }
}

async function toast(tabId, message, kind, detail = '') {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, func: showToastInPage, args: [message, kind, detail] });
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

const OFFSCREEN_URL = 'offscreen/offscreen.html';

// Slow Gemini answers (> 30s) would get this service worker terminated, so the network work
// runs in an offscreen document that reports back with a 'save-result' message.
async function ensureOffscreen() {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length) return;
  }
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['DOM_PARSER'],
      justification: 'Run slow Gemini and Google Sheets requests outside the service worker.',
    });
  } catch (err) {
    if (!/single offscreen/i.test(err.message)) throw err;
  }
}

async function showResult(tabId, result) {
  const { message, kind, detail } = describeSaveResult(result);
  await toast(tabId, message, kind, detail);
  if (!result.ok) {
    await appendErrorLog(errorEntry(result.error, { where: result.error.where }));
    if (result.error.name === 'SetupError') chrome.runtime.openOptionsPage();
  }
}

chrome.runtime.onMessage.addListener((message) => {
  // 'keepalive' messages need no handling: receiving them keeps this worker alive.
  if (message?.type === 'save-result') showResult(message.tabId, message.result);
});

async function captureArea(tab) {
  const tabId = tab.id;
  let rect;
  try {
    const [first] = await chrome.scripting.executeScript({ target: { tabId }, func: selectAreaInPage });
    rect = first?.result;
  } catch {
    return; // pages like chrome:// cannot be scripted
  }
  if (!rect) return; // cancelled with Esc
  if (rect.width < MIN_AREA_PX || rect.height < MIN_AREA_PX) {
    await showResult(tabId, { ok: false, error: { name: 'CaptureError', code: 'too_small', status: 0, message: 'Selected area is too small', model: '', where: 'save-image', word: '' } });
    return;
  }

  let settings;
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 92 });
    await toast(tabId, 'Reading the picture...', 'loading');
    settings = await getReadySettings();
    await ensureOffscreen();
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'save-image',
      job: { tabId, dataUrl, rect, url: tab.url || '', settings },
    });
  } catch (err) {
    await showResult(tabId, { ok: false, error: errorPayload(err, { where: 'save-image', model: settings?.model }) });
  }
}

async function saveFromTab(tab, fallbackText) {
  const tabId = tab.id;
  const picked = await readSelection(tabId, fallbackText);
  const check = validateSelection(picked?.text);
  if (!check.ok && check.reason === 'empty' && !fallbackText) {
    await captureArea(tab); // nothing highlighted: let the learner pick the explanation area
    return;
  }
  if (!check.ok) {
    const msg = check.reason === 'empty'
      ? 'Highlight a word first, then press the shortcut.'
      : 'That is too long. Pick a word or a short phrase (max 6 words).';
    await toast(tabId, msg, 'info');
    return;
  }

  const word = check.value;
  await toast(tabId, `Saving "${word}"...`, 'loading');
  let settings;
  try {
    settings = await getReadySettings();
    const context = extractSentence(picked.context, word);
    await ensureOffscreen();
    await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'save-word',
      job: { tabId, word, context, url: tab.url || '', settings },
    });
  } catch (err) {
    await showResult(tabId, { ok: false, error: errorPayload(err, { where: 'save', model: settings?.model, word }) });
  }
}
