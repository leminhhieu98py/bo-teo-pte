import { setMood } from '../ui/mascot.js';
import { getSettings, saveSettings } from '../lib/storage.js';
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
    status(err.message, 'err');
  }
});

$('testSheet').addEventListener('click', async () => {
  status('Talking to Google Sheet...');
  try {
    const words = await listWords({ url: $('sheetUrl').value.trim(), token: $('token').value.trim() });
    status(`Connected! ${words.length} words in the sheet.`, 'ok');
  } catch (err) {
    status(err.message, 'err');
  }
});

$('changeShortcut').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

load();
