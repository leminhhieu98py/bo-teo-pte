// chrome.storage.local wrappers + first-run seeding from config.local.json.
import { listModels, pickDefaultModel } from './gemini.js';
import { pushLog } from './errors.js';

const SETTING_KEYS = ['sheetUrl', 'token', 'apiKey', 'model'];

export class SetupError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SetupError';
  }
}

async function readLocal(key, fallback) {
  const data = await chrome.storage.local.get(key);
  return data[key] ?? fallback;
}

async function writeLocal(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

// config.local.json is created by start.sh and is git-ignored.
async function readConfigFile() {
  try {
    const res = await fetch(chrome.runtime.getURL('config.local.json'));
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

export async function getSettings() {
  const saved = await readLocal('settings', {});
  const settings = Object.fromEntries(SETTING_KEYS.map((k) => [k, String(saved[k] ?? '').trim()]));
  if (settings.sheetUrl && settings.token && settings.apiKey) return settings;

  const file = await readConfigFile();
  let changed = false;
  for (const k of SETTING_KEYS) {
    if (!settings[k] && file[k]) {
      settings[k] = String(file[k]).trim();
      changed = true;
    }
  }
  if (changed) await writeLocal('settings', settings);
  return settings;
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await writeLocal('settings', next);
  return next;
}

export function missingSettings(settings) {
  const missing = [];
  if (!settings.sheetUrl) missing.push('Google Sheet URL');
  if (!settings.token) missing.push('Sheet token');
  if (!settings.apiKey) missing.push('Gemini API key');
  return missing;
}

// Returns settings with a Gemini flash model chosen, or throws SetupError.
export async function getReadySettings() {
  const settings = await getSettings();
  const missing = missingSettings(settings);
  if (missing.length) throw new SetupError(`Missing: ${missing.join(', ')}`);
  if (!settings.model) {
    const model = pickDefaultModel(await listModels({ apiKey: settings.apiKey }));
    if (!model) throw new SetupError('No Gemini flash model is available for this API key.');
    return saveSettings({ model });
  }
  return settings;
}

export const getSession = () => readLocal('session', null);
export const saveSession = (session) => writeLocal('session', session);
export const getStreak = () => readLocal('streak', { count: 0, lastDate: '' });
export const saveStreak = (streak) => writeLocal('streak', streak);
export const getPrefs = () => readLocal('prefs', { muted: false });
export const savePrefs = (prefs) => writeLocal('prefs', prefs);

export const getErrorLog = () => readLocal('errorLog', []);
export const clearErrorLog = () => writeLocal('errorLog', []);
export async function appendErrorLog(entry) {
  await writeLocal('errorLog', pushLog(await getErrorLog(), entry));
}

export async function enqueueHistory(item) {
  const queue = await readLocal('historyQueue', []);
  await writeLocal('historyQueue', [...queue, item]);
}

export async function takeQueuedHistory() {
  const queue = await readLocal('historyQueue', []);
  await writeLocal('historyQueue', []);
  return queue;
}

export async function enqueueReviews(results) {
  const queue = await readLocal('reviewQueue', []);
  await writeLocal('reviewQueue', [...queue, ...results]);
}

export async function takeQueuedReviews() {
  const queue = await readLocal('reviewQueue', []);
  await writeLocal('reviewQueue', []);
  return queue;
}
