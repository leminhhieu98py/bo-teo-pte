import { setMood } from '../ui/mascot.js';
import { getSettings, saveSettings, getErrorLog, clearErrorLog } from '../lib/storage.js';
import { errorEntry, formatDetail } from '../lib/errors.js';
import { listModels, filterFlashModels, pickDefaultModel } from '../lib/gemini.js';
import { listWords } from '../lib/sheet.js';

const $ = (id) => document.getElementById(id);
const FIELDS = ['sheetUrl', 'token', 'apiKey'];

function status(text, kind = '') {
  $('status').textContent = text;
  $('status').className = `status ${kind}`;
  setMood($('mascot'), kind === 'ok' ? 'happy' : kind === 'err' ? 'oops' : 'think');
}

function addModelOption(name) {
  if ([...$('model').options].some((o) => o.value === name)) return;
  const opt = document.createElement('option');
  opt.value = name;
  opt.textContent = name;
  $('model').appendChild(opt);
}

async function load() {
  setMood($('mascot'), 'idle');
  const settings = await getSettings();
  for (const f of FIELDS) $(f).value = settings[f] || '';
  if (settings.model) addModelOption(settings.model);
  $('model').value = settings.model || '';

  const commands = await chrome.commands.getAll();
  $('shortcut').textContent = commands.find((c) => c.name === 'save-word')?.shortcut || 'not set';
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const values = Object.fromEntries(FIELDS.map((f) => [f, $(f).value.trim()]));
  await saveSettings({ ...values, model: $('model').value });
  status('Saved!', 'ok');
});

$('loadModels').addEventListener('click', async () => {
  const apiKey = $('apiKey').value.trim();
  if (!apiKey) return status('Enter the Gemini API key first.', 'err');
  status('Loading models...');
  try {
    const models = await listModels({ apiKey });
    const names = filterFlashModels(models);
    names.forEach(addModelOption);
    const best = pickDefaultModel(models);
    if (best && !$('model').value) $('model').value = best;
    status(`Found ${names.length} flash models. Press Save.`, 'ok');
  } catch (err) {
    status(formatDetail(errorEntry(err, { where: 'models' })), 'err');
  }
});

$('testSheet').addEventListener('click', async () => {
  status('Talking to Google Sheet...');
  try {
    const words = await listWords({ url: $('sheetUrl').value.trim(), token: $('token').value.trim() });
    status(`Connected! ${words.length} words in the sheet.`, 'ok');
  } catch (err) {
    status(formatDetail(errorEntry(err, { where: 'sheet' })), 'err');
  }
});

$('changeShortcut').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

function logLine(entry) {
  const when = new Date(entry.time).toLocaleString();
  return `${when} | ${entry.where || '-'} | word: ${entry.word || '-'} | ${formatDetail(entry)}`;
}

async function renderLog() {
  const log = await getErrorLog();
  if (!log.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No errors. Everything is fine!';
    $('errorLog').replaceChildren(li);
    return;
  }
  $('errorLog').replaceChildren(...log.map((entry) => {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = `${new Date(entry.time).toLocaleString()} · ${entry.where || '-'}${entry.word ? ` · "${entry.word}"` : ''}`;
    li.append(b, document.createElement('br'), formatDetail(entry));
    return li;
  }));
}

$('copyLog').addEventListener('click', async () => {
  const log = await getErrorLog();
  const text = log.length ? log.map(logLine).join('\n') : 'No errors.';
  try {
    await navigator.clipboard.writeText(text);
    $('logStatus').textContent = 'Copied!';
    $('logStatus').className = 'status ok';
  } catch {
    $('logStatus').textContent = 'Could not copy. Select the text below instead.';
    $('logStatus').className = 'status err';
  }
});

$('clearLog').addEventListener('click', async () => {
  await clearErrorLog();
  $('logStatus').textContent = '';
  renderLog();
});

// ---------- Mac app only (window.boNative comes from native/chrome-shim.js) ----------

const PERMISSIONS = [
  ['accessibility', 'Accessibility', 'to read the highlighted word'],
  ['screen', 'Screen Recording', 'to save from a picture'],
  ['microphone', 'Microphone', 'to say the words'],
];

async function renderPermissions() {
  const status = await window.boNative.call('perm.status');
  $('perms').replaceChildren(...PERMISSIONS.map(([kind, name, why]) => {
    const li = document.createElement('li');
    const what = document.createElement('span');
    what.className = 'what';
    what.textContent = `${name} - ${why}`;
    li.append(what);
    if (status[kind] === 'granted') {
      const ok = document.createElement('span');
      ok.className = 'ok';
      ok.textContent = 'Allowed';
      li.append(ok);
    } else {
      const button = document.createElement('button');
      button.className = 'btn btn-primary small';
      button.type = 'button';
      button.textContent = 'Allow';
      button.addEventListener('click', () => window.boNative.call('perm.request', { kind }));
      li.append(button);
    }
    return li;
  }));
}

async function setUpMacApp() {
  const call = window.boNative.call;
  $('macCard').hidden = false;
  $('shortcutCard').hidden = true;
  $('subtitle').textContent = 'Ask your brother for the values below, then press Save.';

  const presets = await call('shortcut.list');
  const current = await call('shortcut.get');
  $('hotkey').replaceChildren(...presets.map((p) => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.label;
    option.selected = p.label === current;
    return option;
  }));
  $('hotkey').addEventListener('change', async () => {
    const result = await call('shortcut.set', { id: $('hotkey').value });
    $('shortcut').textContent = result.label;
    $('hotkey').value = result.id;
    if (!result.ok) status(`That shortcut is used by another app. Still using ${result.label}.`, 'err');
  });

  const info = await call('app.info');
  $('version').textContent = `v${info.version}`;
  $('loginItem').checked = Boolean(info.launchAtLogin);
  $('loginItem').addEventListener('change', async () => {
    $('loginItem').checked = await call('login.set', { on: $('loginItem').checked });
  });
  const showUpdate = (version) => {
    $('installUpdate').hidden = !version;
    $('installUpdate').textContent = `Install v${version}`;
  };
  showUpdate(info.update);
  $('checkUpdate').addEventListener('click', async () => {
    $('updateStatus').textContent = 'Checking...';
    $('updateStatus').className = 'status';
    const result = await call('update.check');
    const latest = await call('app.info');
    showUpdate(latest.update);
    $('updateStatus').textContent = result === 'available' ? `Version ${latest.update} is ready.` : result === 'latest' ? 'You have the newest version.' : result;
    $('updateStatus').className = `status ${result === 'available' || result === 'latest' ? 'ok' : 'err'}`;
  });
  $('installUpdate').addEventListener('click', async () => {
    $('updateStatus').textContent = 'Installing... the app will restart.';
    const result = await call('update.install');
    if (result !== 'ok') {
      $('updateStatus').textContent = result;
      $('updateStatus').className = 'status err';
    }
  });

  await renderPermissions();
  // Permissions are granted in System Settings: refresh while this page is open.
  setInterval(() => { if (!document.hidden) renderPermissions(); }, 2000);
  if (location.hash === '#shortcut') $('macCard').scrollIntoView({ behavior: 'smooth' });
}

load();
renderLog();
if (window.boNative) setUpMacApp();
