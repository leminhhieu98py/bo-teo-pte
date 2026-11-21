// chrome.storage.local wrappers + first-run seeding from config.local.json.
import { listModels, pickDefaultModel } from './gemini.js';
import { pushLog } from './errors.js';
import { createOutbox } from './outbox.js';

const SETTING_KEYS = ['sheetUrl', 'token', 'apiKey', 'model', 'userId', 'userName'];

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

  // config.local.json wins whenever it changed since it was last imported (start.sh was run
  // again with new values); edits made in Options are kept while the file stays the same.
  const file = await readConfigFile();
  const stamp = JSON.stringify(file);
  let changed = false;
  if (Object.keys(file).length && stamp !== saved.configStamp) {
    for (const k of SETTING_KEYS) {
      if (file[k] && String(file[k]).trim() !== settings[k]) {
        settings[k] = String(file[k]).trim();
        changed = true;
      }
    }
    changed = true;
  }
  if (changed) await writeLocal('settings', { ...settings, configStamp: stamp });
  return settings;
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  const saved = await readLocal('settings', {});
  await writeLocal('settings', { ...next, configStamp: saved.configStamp });
  // Another learner on this Mac: today's local session and streak cache belonged to the previous one.
  if (partial.userId && partial.userId !== current.userId && current.userId) {
    await writeLocal('session', null);
    await writeLocal('streak', { count: 0, lastDate: '' });
    await writeLocal('wallet', null);
  }
  return next;
}

export function missingSettings(settings) {
  const missing = [];
  if (!settings.sheetUrl) missing.push('Google Sheet URL');
  if (!settings.token) missing.push('Sheet token');
  if (!settings.apiKey) missing.push('Gemini API key');
  if (!settings.userId) missing.push('Learner');
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
// Cache of the learner's XP wallet ({ userId, xp, earnedToday, date, owned, pet, theme }); the Sheet is the truth.
export const getWallet = () => readLocal('wallet', null);
export const saveWallet = (wallet) => writeLocal('wallet', wallet);
// Changes only some fields, so a page never writes back another page's older theme, pet or owned items.
export async function patchWallet(userId, fields) {
  const current = await readLocal('wallet', null);
  const base = current && current.userId === userId ? current : { userId };
  const next = { ...base, ...fields, userId };
  await writeLocal('wallet', next);
  return next;
}
// Achievement tiers this learner has already seen the popup for ({ userId, keys: ['id:tier'] }).
export const getCelebrated = () => readLocal('celebrated', null);
export const saveCelebrated = (value) => writeLocal('celebrated', value);
export const getPrefs = () => readLocal('prefs', { muted: false });
export const savePrefs = (prefs) => writeLocal('prefs', prefs);

export const getErrorLog = () => readLocal('errorLog', []);
export const clearErrorLog = () => writeLocal('errorLog', []);
export async function appendErrorLog(entry) {
  await writeLocal('errorLog', pushLog(await getErrorLog(), entry));
}

// Sheet writes waiting to be sent (see lib/outbox.js). Kept until the Sheet accepts them.
export const outbox = createOutbox({ get: (k) => readLocal(k, []), set: writeLocal }, 'outbox');

// Queues from older versions are moved into the outbox once, then cleared.
export async function migrateLegacyQueues() {
  const reviews = await readLocal('reviewQueue', []);
  const history = await readLocal('historyQueue', []);
  for (const result of reviews) await outbox.add('review', result);
  for (const item of history) await outbox.add('history', item);
  if (reviews.length) await writeLocal('reviewQueue', []);
  if (history.length) await writeLocal('historyQueue', []);
}
