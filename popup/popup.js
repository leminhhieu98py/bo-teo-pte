import { setMood } from '../ui/mascot.js';
import { getSession, getStreak, getSettings } from '../lib/storage.js';
import { todayKey } from '../lib/daily.js';
import { currentStreak } from '../lib/progress.js';

const $ = (id) => document.getElementById(id);

async function render() {
  const today = todayKey();
  const [session, streak] = await Promise.all([getSession(), getStreak()]);

  $('streak').textContent = currentStreak(streak, today);

  const todays = session && session.date === today ? session : null;
  const total = todays ? todays.ids.length : 0;
  const done = todays ? Object.keys(todays.results || {}).length : 0;
  $('xp').textContent = todays ? todays.xp || 0 : 0;
  $('progressText').textContent = total ? `${done} / ${total} cards` : 'not started';
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

render();

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
