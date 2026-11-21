// Month calendar of daily results, read from the Sheet "History" tab.
import { setMood } from '../ui/mascot.js';
import { mountNav } from '../ui/nav.js';
import { getSettings, missingSettings, appendErrorLog } from '../lib/storage.js';
import { listHistory } from '../lib/sheet.js';
import { monthGrid, dayLevel, dayXp, monthTotals } from '../lib/history.js';
import { formatMoney } from '../lib/xp.js';
import { todayKey } from '../lib/daily.js';
import { errorEntry, formatDetail } from '../lib/errors.js';

const $ = (id) => document.getElementById(id);
const now = new Date();
const state = { year: now.getFullYear(), month: now.getMonth(), days: new Map(), selected: todayKey() };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderMonth() {
  const title = new Date(state.year, state.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  $('monthTitle').textContent = title;

  const today = todayKey();
  const cells = monthGrid(state.year, state.month).flat().map(({ date, inMonth }) => {
    const row = state.days.get(date);
    const button = el('button', `day lv${dayLevel(row)}${inMonth ? '' : ' out'}${date === today ? ' today' : ''}${date === state.selected ? ' selected' : ''}`, String(Number(date.slice(8))));
    button.title = row ? `${date}: ${row.best_passed || 0}/${row.total || 0} passed, ${formatMoney(dayXp(row))} earned` : date;
    button.addEventListener('click', () => {
      state.selected = date;
      renderMonth();
      renderDetail();
    });
    return button;
  });
  $('grid').replaceChildren(...cells);

  const totals = monthTotals([...state.days.values()], state.year, state.month);
  $('totDays').textContent = totals.days;
  $('totPassed').textContent = totals.passed;
  $('totXp').textContent = formatMoney(totals.xp);
  setMood($('mascot'), totals.days >= 10 ? 'wow' : totals.days > 0 ? 'happy' : 'idle');
}

function renderDetail() {
  const date = state.selected;
  const row = state.days.get(date);
  const nice = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
  const parts = [el('h3', '', nice)];
  if (!row) {
    parts.push(el('p', '', date === todayKey() ? 'No practice yet today. Let us do one!' : 'No study on this day.'));
  } else {
    const stats = el('div', 'stats');
    stats.append(
      el('span', 'pill', `${row.rounds} round${Number(row.rounds) === 1 ? '' : 's'}`),
      el('span', 'pill', `Earned: ${formatMoney(dayXp(row))}`),
      el('span', 'pill', `${row.best_passed || 0} / ${row.total || 0} passed`),
      el('span', 'pill', `Avg score ${row.best_avg_score || 0}`),
    );
    parts.push(stats);
    const again = String(row.again_words || '').split(',').map((w) => w.trim()).filter(Boolean);
    if (again.length) {
      parts.push(el('p', '', 'Words to practice again:'));
      const chips = el('div', 'chips');
      chips.append(...again.map((w) => el('span', '', w)));
      parts.push(chips);
    } else {
      parts.push(el('p', '', 'Every word passed in the best round. Amazing!'));
    }
  }
  $('detail').replaceChildren(...parts);
}

function moveMonth(step) {
  const d = new Date(state.year, state.month + step, 1);
  state.year = d.getFullYear();
  state.month = d.getMonth();
  renderMonth();
}

// The Sheet can take a second or two: cover the calendar and show it is loading.
function setLoading(on) {
  $('loading').hidden = !on;
  if (on) {
    ['totDays', 'totPassed', 'totXp'].forEach((id) => { $(id).textContent = '…'; });
    $('subtitle').textContent = 'Loading...';
    setMood($('mascot'), 'think');
  } else {
    $('subtitle').textContent = 'Every day you study turns a box colorful.';
  }
}

async function init() {
  setMood($('mascot'), 'think');
  renderMonth();
  renderDetail();
  setLoading(true);
  const settings = await getSettings();
  if (missingSettings(settings).length) {
    setLoading(false);
    $('status').textContent = 'Settings are missing. Open Settings first.';
    return;
  }
  try {
    const rows = await listHistory({ url: settings.sheetUrl, token: settings.token, userId: settings.userId });
    state.days = new Map(rows.map((r) => [String(r.date), r]));
    $('status').textContent = '';
  } catch (err) {
    const entry = errorEntry(err, { where: 'history' });
    appendErrorLog(entry);
    $('status').textContent = `Could not load history. ${formatDetail(entry)}`;
  } finally {
    setLoading(false);
  }
  renderMonth();
  renderDetail();
}

$('prevMonth').addEventListener('click', () => moveMonth(-1));
$('nextMonth').addEventListener('click', () => moveMonth(1));
mountNav();
init();
