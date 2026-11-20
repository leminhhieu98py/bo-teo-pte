import { setMood } from '../ui/mascot.js';
import { getSession, getStreak } from '../lib/storage.js';
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
    $('start').textContent = 'Continue review';
  } else {
    setMood($('mascot'), 'idle');
  }

  const commands = await chrome.commands.getAll();
  const save = commands.find((c) => c.name === 'save-word');
  $('shortcut').textContent = save?.shortcut || 'not set';
}

$('start').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('review/review.html') });
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
