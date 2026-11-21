// Applies the learner's equipped theme and pet (from the cached wallet) and follows later changes,
// for example a theme equipped in the Shop while another page is open.
import { THEMES, PETS } from '../lib/shop.js';
import { setPet } from './mascot.js';
import { walletGet } from '../lib/sheet.js';
import { patchWallet } from '../lib/storage.js';
import { todayKey } from '../lib/daily.js';

export function applyTheme(id) {
  const theme = THEMES.some((t) => t.id === id) ? id : 'lavender';
  if (theme === 'lavender') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('bo-theme', theme);
  } catch {
    // Without localStorage the page shows the default colors for a moment on load.
  }
}

let fetching = false;

// No cached wallet for this learner (new Mac, or the learner was just switched): ask the Sheet once.
// Saving it fires storage onChanged, which applies the learner's theme and pet.
async function fetchWallet(settings) {
  if (fetching || !settings?.sheetUrl || !settings.token || !settings.userId) return;
  fetching = true;
  try {
    const w = await walletGet({ url: settings.sheetUrl, token: settings.token, userId: settings.userId, date: todayKey() });
    await patchWallet(settings.userId, { xp: w.xp, earnedToday: w.earnedToday, date: todayKey(), owned: w.owned, pet: w.pet, theme: w.theme });
  } catch {
    // Offline: default look until a page with the wallet loads it.
  } finally {
    fetching = false;
  }
}

async function current() {
  // One key per call: the Mac app's storage bridge reads a single key.
  const { wallet } = await chrome.storage.local.get('wallet');
  const { settings } = await chrome.storage.local.get('settings');
  if (wallet && settings && wallet.userId === settings.userId) return wallet;
  fetchWallet(settings);
  return {};
}

function apply(wallet) {
  applyTheme(wallet.theme);
  setPet(PETS.some((p) => p.id === wallet.pet) ? wallet.pet : 'mochi');
}

export async function syncTheme() {
  apply(await current());
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === 'local' && (changes.wallet || changes.settings)) current().then(apply);
  });
}
