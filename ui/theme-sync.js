// Applies the learner's equipped theme (from the cached wallet) and follows later changes,
// for example a theme equipped in the Shop while another page is open.
import { THEMES } from '../lib/shop.js';

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

async function current() {
  // One key per call: the Mac app's storage bridge reads a single key.
  const { wallet } = await chrome.storage.local.get('wallet');
  const { settings } = await chrome.storage.local.get('settings');
  return wallet && settings && wallet.userId === settings.userId ? wallet.theme : '';
}

export async function syncTheme() {
  applyTheme(await current());
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === 'local' && (changes.wallet || changes.settings)) current().then(applyTheme);
  });
}
