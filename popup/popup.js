import { setMood } from '../ui/mascot.js';
import { getSession, getStreak, getSettings, getWallet, saveWallet, outbox } from '../lib/storage.js';
import { walletGet } from '../lib/sheet.js';
import { DAY_CAP, formatMoney, withPending } from '../lib/xp.js';
import { todayKey } from '../lib/daily.js';
import { currentStreak, todayStats, progressLabel } from '../lib/progress.js';

const $ = (id) => document.getElementById(id);

async function render() {
  const today = todayKey();
  const [session, streak, settings] = await Promise.all([getSession(), getStreak(), getSettings()]);
  const cached = await getWallet();
  const wallet = cached && cached.userId === settings.userId ? cached : null;

  $('streak').textContent = currentStreak(streak, today);

  const stats = todayStats(session, today, wallet);
  const { total, done } = stats;
  $('xp').textContent = formatMoney(stats.xp);
  $('xpLabel').textContent = `of ${formatMoney(DAY_CAP)} today`;
  $('wallet').textContent = stats.balance === null ? '$...' : formatMoney(stats.balance);
  $('progressText').textContent = progressLabel(stats);
  $('progressBar').style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';

  if (total && done >= total) {
    setMood($('mascot'), 'happy');
    $('greeting').textContent = 'All done today. Amazing!';
    $('start').textContent = 'See today\'s result';
  } else if (done > 0) {
    setMood($('mascot'), 'wow');
    $('greeting').textContent = 'Keep going, you are doing great!';
    $('start').textContent = 'Continue practice';
  } else {
    setMood($('mascot'), 'idle');
  }

  const { userName } = await getSettings();
  if (userName && !(total && done >= total) && !(done > 0)) $('greeting').textContent = `Ready to learn, ${userName}?`;

  const commands = await chrome.commands.getAll();
  const save = commands.find((c) => c.name === 'save-word');
  $('shortcut').textContent = save?.shortcut || 'not set';
}

// Focus the review tab if it is already open; two review tabs would overwrite each other.
$('start').addEventListener('click', async () => {
  const url = chrome.runtime.getURL('review/review.html');
  const [open] = chrome.runtime.getContexts ? await chrome.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [url] }) : [];
  if (open && open.tabId >= 0) {
    await chrome.tabs.update(open.tabId, { active: true });
    await chrome.windows.update(open.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
  window.close();
});
$('settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

// Show the cache at once, then the Sheet's wallet (plus writes still waiting to be sent).
async function refreshWallet() {
  const settings = await getSettings();
  if (!settings.sheetUrl || !settings.token || !settings.userId) return;
  const today = todayKey();
  try {
    const server = await walletGet({ url: settings.sheetUrl, token: settings.token, userId: settings.userId, date: today });
    const pending = (await outbox.all()).filter((i) => i.payload?.userId === settings.userId);
    await saveWallet(withPending({ userId: settings.userId, date: today, ...server }, pending, today));
    await render();
  } catch {
    // Offline: the cached numbers stay.
  }
}

render().then(refreshWallet);

$('history').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
  window.close();
});

// Mac app: offer a waiting update right here.
if (window.boNative) {
  window.boNative.call('app.info').then((info) => {
    if (!info.update) return;
    $('updateBtn').hidden = false;
    $('updateBtn').textContent = `Update to v${info.update}`;
    $('updateBtn').addEventListener('click', async () => {
      $('updateBtn').textContent = 'Updating...';
      const result = await window.boNative.call('update.install');
      if (result !== 'ok') $('updateBtn').textContent = 'Update failed. Try in Settings.';
    });
  });
}
