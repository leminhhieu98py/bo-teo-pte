// Daily review: type the word from its Vietnamese meaning, then say it out loud.
import { setMood } from '../ui/mascot.js';
import { ICONS, starSvg } from '../ui/icons.js';
import {
  getSettings, getReadySettings, missingSettings, SetupError, getSession, saveSession,
  getStreak, saveStreak, getPrefs, savePrefs, appendErrorLog, outbox, migrateLegacyQueues, getWallet, saveWallet,
} from '../lib/storage.js';
import { listWords, postReview, saveHistory, listHistory, walletGet, walletEarn, walletSpend } from '../lib/sheet.js';
import { DAY_CAP, wordShare, nextHintCost, payHint, settleEarn, formatMoney, withPending } from '../lib/xp.js';
import { roundSummary, isBetterRound, streakFromHistory } from '../lib/history.js';
import { errorEntry, formatDetail } from '../lib/errors.js';
import { gradePronunciation, GeminiError } from '../lib/gemini.js';
import { todayKey, toBool } from '../lib/daily.js';
import { resolveSession, nextRoundSession, restoreCard, withCurrentCard, needsCompletion } from '../lib/session.js';
import {
  createCardState, applyTyping, shouldAutoHint, applyGrade, canSkip, skipCard, needsReview,
  applyHint, revealAll,
} from '../lib/card.js';
import { maskWord } from '../lib/answer.js';
import { buildSlots, letterCount, sanitizeTyped, composeSlots, typedEdit, caretOffset } from '../lib/slots.js';
import { letterDiff } from '../lib/diff.js';
import { cleanWords } from '../lib/words.js';
import { stableStringify } from '../lib/stable.js';
import { updateStreak, currentStreak, starsForScore, pickMessage } from '../lib/progress.js';
import { confetti, playSound, setMuted, floatXp } from './effects.js';
import { Recorder } from './recorder.js';
import { speak } from './speech.js';
import { mountNav } from '../ui/nav.js';
import { showNotice } from '../ui/notice.js';
import { checkAchievements } from '../ui/achievements-check.js';

// Leaving while a card is on screen asks first (the round is saved and resumes later).
const nav = mountNav({ isBusy: () => !document.getElementById('screenCard').hidden });

const $ = (id) => document.getElementById(id);
const SCREENS = ['screenLoading', 'screenMessage', 'screenCard', 'screenSummary'];
const MAX_RECORD_MS = 4000;
const MIN_VOICED_SECONDS = 0.25;
const RING_LENGTH = 326.7;

const app = {
  settings: null,
  words: new Map(),
  session: null,
  streak: { count: 0, lastDate: '' },
  wallet: null, // { userId, date, xp, earnedToday, owned, pet, theme } - the Sheet is the truth
  pendingAdjust: [], // earn answers that arrived before the session was loaded
  card: null,
  word: null,
  slots: [],
  lastTyped: null, // last accepted { typed, caret } of the hidden input
  recorder: null,
  recordTimer: 0,
  busy: false,
  starting: false,
  muted: false,
};

// ---------- small UI helpers ----------

function restartAnimation(el) {
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
}

function show(id) {
  for (const s of SCREENS) $(s).hidden = s !== id;
  restartAnimation($(id));
}

function say(text, mood) {
  $('bubble').textContent = text;
  restartAnimation($('bubble'));
  if (mood) setMood($('mascot'), mood);
}

function toastLine(text, kind = '', detail = '') {
  $('toastLine').textContent = text;
  $('toastLine').className = `toast-line ${kind}`;
  $('toastDetail').textContent = detail;
}

// Logs the error (Settings > Error log) and returns the technical detail line.
function logError(err, where) {
  const entry = errorEntry(err, { where, model: err?.name === 'SheetError' ? '' : app.settings?.model, word: app.word?.word });
  appendErrorLog(entry);
  return formatDetail(entry);
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

function showMessage(title, text, actionLabel, action, mood = 'think') {
  $('msgTitle').textContent = title;
  $('msgText').textContent = text;
  $('msgAction').textContent = actionLabel;
  $('msgAction').onclick = action;
  say(title, mood);
  show('screenMessage');
}

function closeTab() {
  chrome.tabs.getCurrent((tab) => (tab ? chrome.tabs.remove(tab.id) : window.close()));
}

function updateTopbar() {
  const s = app.session;
  const total = s ? s.ids.length : 0;
  const done = s ? Math.min(s.index, total) : 0;
  const pct = total ? (done / total) * 100 : 0;
  $('trackFill').style.width = `${pct}%`;
  $('trackRunner').style.left = `${pct}%`;
  $('counter').textContent = `${done} / ${total}`;
  $('xpPill').textContent = app.wallet ? formatMoney(app.wallet.xp) : '$...';
  const days = currentStreak(app.streak, todayKey());
  $('streakPill').textContent = `${days} day${days === 1 ? '' : 's'}`;
}

function renderMute() {
  $('muteBtn').innerHTML = app.muted ? ICONS.soundOff : ICONS.soundOn;
  setMuted(app.muted);
}

function errorText(err) {
  if (err instanceof SetupError) return `Setup needed: ${err.message}`;
  if (err instanceof GeminiError && err.code === 'quota') return 'Gemini is busy right now. Wait 10 seconds and try again.';
  if (err instanceof GeminiError && err.code === 'auth') return 'The Gemini API key does not work. Please check Settings.';
  if (err instanceof GeminiError && err.code === 'timeout') return 'Gemini took too long to answer. Please try again.';
  if (err instanceof GeminiError && err.status === 503) return 'Gemini is overloaded right now. Try again in a minute.';
  return 'Mochi could not grade this time. Please try again.';
}

function micErrorText(err) {
  if (err?.name === 'NotAllowedError') {
    return 'The microphone is blocked. Allow it in the address bar, and on Mac check System Settings > Privacy & Security > Microphone > Google Chrome.';
  }
  if (err?.name === 'NotFoundError') return 'No microphone found.';
  return `Microphone error: ${err?.message || err}`;
}

// ---------- sheet sync ----------

// Sends one outbox item to the Sheet. Errors are logged and re-thrown so the item stays queued.
async function sendItem(item) {
  try {
    const { sheetUrl: url, token } = app.settings;
    if (item.kind === 'review') await postReview({ url, token, userId: item.payload.userId, results: [item.payload] });
    else if (item.kind === 'history') await saveHistory({ url, token, ...item.payload });
    else if (item.kind === 'earn') await walletAnswered(item, await walletEarn({ url, token, ...item.payload }));
    else if (item.kind === 'hint') await walletAnswered(item, await walletSpend({ url, token, ...item.payload }));
  } catch (err) {
    logError(err, item.kind === 'history' ? 'history' : item.kind === 'earn' || item.kind === 'hint' ? 'wallet' : 'sheet');
    throw err;
  }
}

// ---------- wallet ----------

// date#round, plus the round's random nonce so ids never repeat (learner switch, cleared storage).
const roundKey = (s) => `${s.date}#${s.round || 1}${s.nonce ? `#${s.nonce}` : ''}`;

async function setWallet(wallet) {
  app.wallet = wallet;
  if (wallet) await saveWallet(wallet);
  updateTopbar();
}

// The cached wallet first (instant), today's numbers only when it is from today.
async function loadCachedWallet() {
  const cached = await getWallet();
  const today = todayKey();
  if (!cached || cached.userId !== app.settings.userId) return;
  app.wallet = cached.date === today ? cached : { ...cached, date: today, earnedToday: 0 };
  updateTopbar();
}

// The Sheet's wallet plus what is still waiting in the outbox.
async function refreshWallet() {
  const today = todayKey();
  try {
    const server = await walletGet({ url: app.settings.sheetUrl, token: app.settings.token, userId: app.settings.userId, date: today });
    const pending = (await outbox.all()).filter((i) => i.payload?.userId === app.settings.userId);
    await setWallet(withPending({ userId: app.settings.userId, date: today, ...server }, pending, today));
  } catch (err) {
    logError(err, 'wallet'); // offline: keep the cached wallet
  }
}

// The round showed `shown` for a word; the Sheet credited what the day cap allowed. Fix the round's
// earned money once per txId (answers can repeat; the session may not be loaded yet at start-up).
async function adjustRoundEarned(payload, credited) {
  const s = app.session;
  if (!s) {
    app.pendingAdjust.push([payload, credited]);
    return;
  }
  if (payload.roundKey !== roundKey(s) || s.adjusted?.[payload.txId]) return;
  const diff = credited - (payload.shown ?? payload.amount);
  s.adjusted = { ...(s.adjusted || {}), [payload.txId]: true };
  if (diff) s.earned = Math.max(0, (s.earned || 0) + diff);
  await saveSessionHere(s);
}

// The Sheet answered an earn/hint: take its balance, plus the writes that are still queued.
async function walletAnswered(item, answer) {
  if (item.kind === 'earn') await adjustRoundEarned(item.payload, answer.credited);
  if (!app.wallet || item.payload.userId !== app.settings.userId) return;
  const today = todayKey();
  const rest = (await outbox.all()).filter((i) => i.id !== item.id && i.payload?.userId === app.settings.userId);
  const base = { ...app.wallet, xp: answer.xp };
  if (item.kind === 'earn' && item.payload.date === today) base.earnedToday = answer.earnedToday;
  await setWallet(withPending(base, rest, today));
}

// A page left open past midnight: the new day starts with nothing earned yet.
function walletForDay(date) {
  if (!app.wallet || app.wallet.date === date) return;
  app.wallet = { ...app.wallet, date, earnedToday: 0 };
  refreshWallet();
}

// An achievement paid a reward: the Sheet's new balance plus what is still queued.
async function rewardWallet(xp) {
  const today = todayKey();
  const pending = (await outbox.all()).filter((i) => i.payload?.userId === app.settings.userId);
  const base = app.wallet || { userId: app.settings.userId, date: today, earnedToday: 0, owned: [], pet: '', theme: '' };
  await setWallet(withPending({ ...base, xp }, pending, today));
}

async function changeWallet(delta, earned = 0) {
  if (!app.wallet) return;
  await setWallet({ ...app.wallet, xp: Math.max(0, app.wallet.xp + delta), earnedToday: app.wallet.earnedToday + earned });
}

function floatMoney(text, anchor, minus = false) {
  $('xpFloat').classList.toggle('minus', minus);
  floatXp($('xpFloat'), anchor, text);
}

// A hint costs $5 (at most $15 per card). An empty wallet never blocks it: the round pays later.
function chargeHint() {
  const cost = nextHintCost(app.card.hintPaid || 0);
  if (!cost) return;
  const s = app.session;
  app.card = { ...app.card, hintPaid: (app.card.hintPaid || 0) + cost };
  // Wallet not loaded yet (first start offline, old Code.gs): let the Sheet decide, never claim it is empty.
  const { fromWallet, toDebt } = app.wallet ? payHint({ balance: app.wallet.xp, cost }) : { fromWallet: cost, toDebt: 0 };
  if (fromWallet) {
    const payload = {
      userId: app.settings.userId, txId: `${roundKey(s)}:${app.word.id}:hint${app.card.hints}`,
      date: s.date, amount: fromWallet, kind: 'hint', ref: app.word.id,
    };
    outbox.add('hint', payload).then((item) => outbox.send(item, sendItem));
    changeWallet(-fromWallet);
    floatMoney(`-${formatMoney(cost)}`, $('xpPill'), true);
    shake($('xpPill'));
    return;
  }
  s.debt = (s.debt || 0) + toDebt;
  floatMoney(`-${formatMoney(cost)}`, $('counter'), true);
  if (!s.debtNoticeShown) {
    s.debtNoticeShown = true;
    showNotice({
      title: 'Your wallet is empty',
      text: `This hint is paid from the money you earn in this practice. Practice more to earn money, or ask the admin.`,
      mood: 'oops',
      button: 'Got it',
    }).then(() => $('answerInput').focus());
  }
}

// The streak comes from the Sheet History (plus rounds still waiting in the outbox), so it
// matches what the History page shows. The local copy is only a cache for the popup.
async function syncStreak() {
  try {
    const rows = await listHistory({ url: app.settings.sheetUrl, token: app.settings.token, userId: app.settings.userId });
    const pending = (await outbox.all()).filter((i) => i.kind === 'history').map((i) => ({ date: i.payload.date, rounds: 1 }));
    app.streak = streakFromHistory([...rows, ...pending], todayKey());
    await saveStreak(app.streak);
    updateTopbar();
  } catch {
    // Offline or old Code.gs: keep the cached streak.
  }
}

async function flushQueue() {
  await migrateLegacyQueues();
  await outbox.flush(sendItem);
}


// Remembers what this tab saved, so a change made by another review tab can be noticed.
function saveSessionHere(session) {
  // Keep the last few: change events of quick successive saves arrive after the next save.
  app.ownSessionJson = [...(app.ownSessionJson || []), stableStringify(session)].slice(-10);
  return saveSession(session);
}

// Two review tabs would overwrite each other's progress: stop this one if another tab saves.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.session || !app.ownSessionJson) return;
  if (app.ownSessionJson.includes(stableStringify(changes.session.newValue))) return; // key order may differ
  app.ownSessionJson = null;
  app.recorder?.cancel();
  showMessage('This review is open in another tab', 'To keep your progress safe, continue in the other tab, or reload this one.',
    'Reload here', () => location.reload(), 'think');
});

// ---------- start ----------

function firstUnfinished(session) {
  const i = session.ids.findIndex((id) => !session.results[id]);
  return i === -1 ? session.ids.length : i;
}

async function init() {
  app.muted = (await getPrefs()).muted;
  renderMute();
  setMood($('mascot'), 'idle');
  $('speakBtn').innerHTML = ICONS.speaker;
  $('slowBtn').innerHTML = ICONS.slow;
  $('micIcon').innerHTML = ICONS.mic;
  show('screenLoading');

  const settings = await getSettings();
  const missing = missingSettings(settings);
  if (missing.length) {
    showMessage('Mochi needs a quick setup', `Missing: ${missing.join(', ')}. Open Settings and fill them in (ask your brother for the values).`,
      'Open Settings', () => nav.go('options/options.html'), 'oops');
    return;
  }
  app.settings = settings;
  app.streak = await getStreak();
  await loadCachedWallet();
  flushQueue().then(() => Promise.all([syncStreak(), refreshWallet()]));

  let words;
  try {
    words = cleanWords(await listWords({ url: settings.sheetUrl, token: settings.token, userId: settings.userId }));
  } catch (err) {
    showMessage('Cannot open your word list', logError(err, 'sheet'), 'Try again', () => location.reload(), 'oops');
    return;
  }
  if (!words.length) {
    const commands = await chrome.commands.getAll();
    const shortcut = commands.find((c) => c.name === 'save-word')?.shortcut || 'the shortcut';
    showMessage('No words yet', `Highlight a word on any page and press ${shortcut} to save it. Then come back here!`,
      'Got it', closeTab, 'think');
    return;
  }
  app.words = new Map(words.map((w) => [w.id, w]));

  const today = todayKey();
  const { session, fresh } = resolveSession(await getSession(), words, today);
  app.session = session;
  await saveSessionHere(session);
  for (const [payload, credited] of app.pendingAdjust.splice(0)) await adjustRoundEarned(payload, credited);
  updateTopbar();

  if (needsCompletion(session)) {
    await completeDay(false); // closed right after the last card: save streak and history now
  } else if (session.index >= session.ids.length) {
    showSummary(false);
  } else {
    const name = settings.userName ? ` ${settings.userName}` : '';
    say(fresh ? `Hi${name}! ${session.ids.length} words today. Let's go!` : `Welcome back${name}! Let's continue.`, 'happy');
    showCard();
  }
}

// ---------- typing phase ----------

function showCard() {
  const s = app.session;
  const w = app.words.get(s.ids[s.index]);
  app.word = w;
  // After a reload, continue the same card with its wrong tries, hints and failed recordings.
  app.card = restoreCard(s, w.id) || createCardState();

  $('pos').textContent = w.part_of_speech || '';
  $('pos').hidden = !w.part_of_speech;
  $('againPill').hidden = !toBool(w.flagged);
  $('meaning').textContent = w.meaning_vi || '(no meaning saved)';
  $('desc').textContent = w.description_vi || '';
  $('exampleMasked').textContent = maskWord(w.example_en, w.word);
  $('exampleVi').textContent = w.example_vi || '';
  app.slots = buildSlots(w.word);
  $('answerInput').value = '';
  $('answerInput').disabled = false;
  $('typingPart').hidden = false;
  $('answerForm').hidden = false;
  $('attempts').hidden = true;
  $('continueBtn').hidden = true;
  $('speakingPart').hidden = true;
  $('combo').hidden = (s.combo || 0) < 3;
  toastLine('');
  show('screenCard');
  $('answerInput').focus();
  renderSlots();
  updateTopbar();
  // A restored card may already be past typing.
  if (app.card.phase === 'speaking') goSpeaking();
  else if (app.card.phase === 'done') finishCard();
}

// Saves the card being answered so a reload cannot reset wrong tries, hints or failed recordings.
function persistCard() {
  app.session = withCurrentCard(app.session, app.word.id, app.card);
  saveSessionHere(app.session);
}

const totalLetters = () => letterCount(app.slots);

// Draws one slot per letter. The hidden input only holds the typed letters (never the hints),
// so Backspace cannot remove a hinted letter.
function renderSlots(status = '') {
  const hints = app.card.hints || 0;
  const typed = sanitizeTyped($('answerInput').value, totalLetters() - hints);
  if ($('answerInput').value !== typed) $('answerInput').value = typed;
  const caret = inputCaret();
  app.lastTyped = { typed, caret };
  const { cells, cursor } = composeSlots(app.slots, hints, typed, caret);

  const groups = [];
  let letter = 0;
  let group = document.createElement('span');
  group.className = 'slot-word';
  cells.forEach((cell, i) => {
    if (cell.kind === 'fixed' && cell.ch === ' ') {
      groups.push(group);
      group = document.createElement('span');
      group.className = 'slot-word';
      return;
    }
    const el = document.createElement('span');
    el.className = `slot ${cell.kind}${i === cursor ? ' cursor' : ''}`;
    if (cell.kind !== 'fixed') el.dataset.letter = String(letter++); // a click puts the caret here
    el.textContent = cell.ch;
    group.append(el);
  });
  groups.push(group);

  const focused = document.activeElement === $('answerInput');
  $('slots').replaceChildren(...groups);
  $('slots').className = ['slots', totalLetters() > 12 ? 'small' : '', focused ? 'focused' : '', status].filter(Boolean).join(' ');
  $('hintBtn').disabled = hints >= totalLetters() || app.card.phase !== 'typing';
}

// Typed letters before the caret of the hidden input (its value holds letters only).
function inputCaret() {
  const input = $('answerInput');
  return [...input.value.slice(0, input.selectionStart ?? input.value.length)].length;
}

function setInputCaret(caret) {
  const input = $('answerInput');
  const offset = caretOffset(input.value, caret);
  if (input.selectionStart !== offset || input.selectionEnd !== offset) input.setSelectionRange(offset, offset);
}

// Arrow keys, Home/End or a click moved the caret: redraw the blinking slot.
function refreshCaret() {
  if (app.card?.phase !== 'typing' || !app.lastTyped) return;
  if (inputCaret() !== app.lastTyped.caret) renderSlots();
}

function onTypedInput(e) {
  const input = $('answerInput');
  const max = totalLetters() - (app.card.hints || 0);
  const next = typedEdit(input.value, input.selectionStart, max, app.lastTyped, { composing: e.isComposing });
  if (input.value !== next.typed) input.value = next.typed;
  if (!e.isComposing) setInputCaret(next.caret);
  renderSlots();
}

function onSlotClick(e) {
  const input = $('answerInput');
  input.focus();
  const slot = e.target.closest('.slot[data-letter]');
  if (!slot || input.disabled || app.card?.phase !== 'typing') return;
  setInputCaret(Math.max(0, Number(slot.dataset.letter) - (app.card.hints || 0)));
  refreshCaret();
}

function finishRevealed() {
  // Every letter is shown: the word counts as not passed and comes back tomorrow.
  $('answerInput').value = '';
  const { answer } = composeSlots(app.slots, totalLetters(), '');
  app.card = applyTyping(app.card, answer, app.word.word).state;
  persistCard();
  $('answerInput').disabled = true;
  renderSlots('reveal');
  renderAttempts(app.card.attempts || []);
  $('answerForm').hidden = true;
  $('continueBtn').hidden = false;
  $('continueBtn').focus();
  say(pickMessage('reveal'), 'think');
  toastLine('This word will come back tomorrow.', 'info');
}

function letterEl(className, text, below) {
  const span = document.createElement('span');
  span.className = `letter ${className}`;
  span.textContent = text || '';
  if (below) {
    const small = document.createElement('small');
    small.textContent = below;
    span.append(small);
  }
  return span;
}

// Shows each wrong answer under the right word: green = right letter, red = wrong letter (with the
// right one below), struck = extra letter, dashed box = missing letter.
function renderAttempts(attempts) {
  if (!attempts.length) {
    $('attempts').hidden = true;
    return;
  }
  const row = (label, letters) => {
    const div = document.createElement('div');
    div.className = 'attempt-row';
    const name = document.createElement('span');
    name.className = 'label';
    name.textContent = label;
    const box = document.createElement('span');
    box.className = 'letters';
    box.append(...letters);
    div.append(name, box);
    return div;
  };
  const correct = [...app.word.word.toLowerCase()].map((ch) => letterEl(ch === ' ' ? 'space' : 'right', ch));
  const tries = attempts.map((attempt, n) => row(`Try ${n + 1}`, letterDiff(attempt, app.word.word).map((op) => {
    if (op.type === 'match') return letterEl(op.ch === ' ' ? 'space' : 'ok', op.ch);
    if (op.type === 'wrong') return letterEl('bad', op.ch, op.expected);
    if (op.type === 'extra') return letterEl('extra', op.ch);
    return letterEl('missing', '', op.expected);
  })));
  $('attempts').replaceChildren(row('Correct', correct), ...tries);
  $('attempts').hidden = false;
}

function continueAfterReveal() {
  $('continueBtn').hidden = true;
  $('attempts').hidden = true;
  $('answerForm').hidden = false;
  goSpeaking();
}

function giveHint(auto = false) {
  if (app.card.phase !== 'typing') return;
  const { state, result } = applyHint(app.card, totalLetters());
  if (result === 'none') return;
  app.card = state;
  chargeHint();
  persistCard();
  // The hinted letter takes the first typed slot, so a correct prefix stays correct.
  const caret = inputCaret();
  $('answerInput').value = $('answerInput').value.slice(1);
  setInputCaret(Math.max(0, caret - 1));
  if (result === 'full') {
    finishRevealed();
    return;
  }
  renderSlots();
  say(auto ? 'Here is a little help!' : 'Here is one letter. You can do it!', 'think');
  $('answerInput').focus();
}

function onAnswer(e) {
  e.preventDefault();
  if (app.card.phase !== 'typing') return;
  const { answer, complete } = composeSlots(app.slots, app.card.hints || 0, $('answerInput').value);
  if (!complete) {
    shake($('slots'));
    toastLine('Fill all the letters first.', 'info');
    $('answerInput').focus();
    return;
  }

  const { state, result } = applyTyping(app.card, answer, app.word.word);
  app.card = state;
  persistCard();

  if (result === 'correct') {
    $('answerInput').disabled = true;
    renderSlots('good');
    playSound('correct');
    confetti($('confetti'), { count: 40, originY: 0.45 });
    say(pickMessage('correct'), 'happy');
    toastLine('Correct!', 'good');
    setTimeout(goSpeaking, 900);
    return;
  }

  playSound('wrong');
  if (result === 'reveal') {
    app.card = revealAll(app.card, totalLetters());
    finishRevealed();
    shake($('slots'));
    return;
  }
  $('answerInput').value = ''; // retype; hinted letters stay
  renderSlots();
  shake($('slots'));
  if (result === 'almost') {
    say(pickMessage('almost'), 'think');
    toastLine('So close!', 'info');
  } else {
    say(pickMessage('wrong'), 'oops');
    toastLine('Not quite.', 'bad');
  }
  if (shouldAutoHint(app.card)) giveHint(true);
}

// ---------- speaking phase ----------

function playReference(rate, button) {
  // The mic would record the computer's own voice and Gemini would pass it.
  if (app.starting || app.recorder?.recording) return;
  const btn = button || $('speakBtn');
  btn.classList.add('playing');
  speak(app.word.word, { rate, onEnd: () => btn.classList.remove('playing') });
}

function goSpeaking() {
  document.activeElement?.blur();
  $('typingPart').hidden = true;
  $('speakingPart').hidden = false;
  $('word').textContent = app.word.word;
  $('ipa').textContent = app.word.ipa || '';
  $('exampleFull').textContent = app.word.example_en || '';
  $('micZone').hidden = false;
  $('grading').hidden = true;
  $('result').hidden = true;
  resetMic();
  toastLine('');
  say('Listen to me first, then say it the same way!', 'listen');
  clearTimeout(app.refTimer);
  app.refTimer = setTimeout(() => playReference(1), 350);
}

function setListenEnabled(on) {
  $('speakBtn').disabled = !on;
  $('slowBtn').disabled = !on;
}

function resetMic() {
  setListenEnabled(true);
  $('micBtn').classList.remove('recording');
  $('micIcon').innerHTML = ICONS.mic;
  $('micLabel').textContent = 'Tap the mic (or press Space)';
  $('micRing').style.transform = 'scale(1)';
}

async function toggleRecord() {
  // While the mic is opening, ignore clicks: a second click used to start a second recorder.
  if (app.busy || app.starting || $('micZone').hidden) return;
  if (app.recorder?.recording) {
    stopRecord();
    return;
  }
  speechSynthesis.cancel();
  app.starting = true;
  clearTimeout(app.refTimer);
  setListenEnabled(false);
  app.recorder = new Recorder({
    onLevel: (level) => { $('micRing').style.transform = `scale(${1 + Math.min(level * 1.6, 0.6)})`; },
    onLost: () => {
      // The mic disappeared (for example AirPods disconnected): reset instead of staying stuck.
      clearTimeout(app.recordTimer);
      app.recorder?.cancel();
      resetMic();
      say('The microphone stopped. Please try again.', 'oops');
    },
  });
  try {
    await app.recorder.start();
  } catch (err) {
    say('I need your microphone to hear you!', 'oops');
    toastLine(micErrorText(err), 'bad');
    return;
  } finally {
    app.starting = false;
  }
  $('micBtn').classList.add('recording');
  $('micIcon').innerHTML = ICONS.stop;
  $('micLabel').textContent = 'Listening... tap again when you finish';
  say('I am listening...', 'listen');
  toastLine('');
  app.recordTimer = setTimeout(stopRecord, MAX_RECORD_MS);
}

async function stopRecord() {
  clearTimeout(app.recordTimer);
  if (!app.recorder?.recording) return;
  app.busy = true;
  resetMic();

  let rec;
  try {
    rec = await app.recorder.stop();
  } catch {
    app.busy = false;
    toastLine('Recording failed. Please try again.', 'bad');
    return;
  }
  // Gemini "hears" the target word even in silence, so never send audio without a real voice.
  if (rec.voiced < MIN_VOICED_SECONDS) {
    app.busy = false;
    say('I could not hear your voice. Say the whole word clearly into the mic!', 'oops');
    toastLine('Not counted. Try again and speak a bit louder.', 'info');
    return;
  }

  $('micZone').hidden = true;
  $('grading').hidden = false;
  say('Hmm, let me listen carefully...', 'think');
  try {
    app.settings = await getReadySettings();
    const grade = await gradePronunciation({
      apiKey: app.settings.apiKey,
      model: app.settings.model,
      word: app.word.word,
      ipa: app.word.ipa,
      wavBase64: rec.wavBase64,
    });
    showGrade(grade);
  } catch (err) {
    $('grading').hidden = true;
    $('micZone').hidden = false;
    say('Something went wrong, not your fault!', 'oops');
    toastLine(errorText(err), 'bad', logError(err, 'grade'));
  } finally {
    app.busy = false;
  }
}

function animateScore(score) {
  const color = score >= 90 ? 'var(--mint)' : score >= 70 ? 'var(--primary)' : 'var(--red)';
  const fg = $('ringFg');
  fg.style.stroke = color;
  fg.style.transition = 'none';
  fg.style.strokeDashoffset = RING_LENGTH;
  void fg.getBoundingClientRect();
  fg.style.transition = '';
  requestAnimationFrame(() => { fg.style.strokeDashoffset = RING_LENGTH * (1 - score / 100); });

  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / 1000);
    $('ringNum').textContent = Math.round(score * (1 - (1 - t) ** 3));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function showGrade(grade) {
  const { state, result } = applyGrade(app.card, grade);
  app.card = state;
  persistCard();

  $('grading').hidden = true;
  $('result').hidden = false;
  restartAnimation($('result'));
  animateScore(grade.score);

  const stars = starsForScore(grade.passed ? grade.score : 0);
  $('stars').innerHTML = [1, 2, 3].map((i) => starSvg(i <= stars)).join('');
  [...$('stars').querySelectorAll('.on')].forEach((el, i) => { el.style.animationDelay = `${0.6 + i * 0.2}s`; });

  $('heard').textContent = grade.heard || '...';
  $('stress').textContent = grade.stressCorrect ? 'Stress: correct' : 'Stress: check the strong syllable';
  $('stress').className = `stress ${grade.stressCorrect ? 'ok' : 'bad'}`;

  const items = [['Sounds', grade.soundsFeedback], ['Stress', grade.stressFeedback], ['Tip', grade.tip]].filter(([, v]) => v);
  $('feedback').replaceChildren(...items.map(([label, text]) => {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = `${label}: `;
    li.append(b, text);
    return li;
  }));

  if (result === 'pass') {
    playSound('pass');
    setTimeout(() => confetti($('confetti'), { count: 130, originY: 0.3, spread: 1.4 }), 300);
    say(pickMessage('pass'), 'wow');
    $('retryBtn').hidden = true;
    $('skipBtn').hidden = true;
    $('nextBtn').hidden = false;
    $('nextBtn').focus();
    toastLine('');
  } else {
    playSound('wrong');
    say(pickMessage('fail'), 'oops');
    $('retryBtn').hidden = false;
    $('nextBtn').hidden = true;
    $('skipBtn').hidden = !canSkip(app.card);
    toastLine(canSkip(app.card) ? 'You can skip this word. It will come back tomorrow.' : '', 'info');
  }
}

function retry() {
  $('result').hidden = true;
  $('micZone').hidden = false;
  toastLine('');
  say('Listen again and copy the strong syllable!', 'listen');
  playReference(0.8);
}

// ---------- finishing ----------

async function finishCard() {
  if (app.card.phase !== 'done' || app.card.finished) return;
  app.card = { ...app.card, finished: true }; // guard against double clicks
  const s = app.session;
  const st = app.card;
  const id = app.word.id;
  const firstTry = st.passed && st.typingWrong === 0 && st.pronFails === 0 && !st.hints;
  // Each word is worth its part of $200 (fixed when the round was built); hint debt is paid first.
  // The Sheet applies the $200-a-day cap: the full amount is always sent, the cap only shapes what is shown.
  const price = s.shares?.[id] ?? wordShare(s.ids.indexOf(id), s.ids.length);
  const share = st.passed ? price : 0;
  walletForDay(s.date);
  const earnedBefore = app.wallet?.earnedToday ?? 0;
  const net = share - Math.min(share, s.debt || 0);
  const { amount, debt } = settleEarn({ share, debt: s.debt || 0, earnedToday: earnedBefore });

  s.combo = firstTry ? (s.combo || 0) + 1 : 0;
  s.points = (s.points || 0) + share;
  s.debt = debt;
  s.earned = (s.earned || 0) + amount;
  s.results[id] = { passed: st.passed, skipped: st.skipped, revealed: st.revealed, score: st.bestScore, hints: st.hints || 0, points: share, earned: amount };
  s.current = null;
  s.index = firstUnfinished(s);
  // Queue the Sheet updates before saving, so closing the page right now cannot lose them.
  // The rid / txId lets the Sheet ignore the same write if it is sent twice.
  const item = await outbox.add('review', { id, needsReview: needsReview(st), rid: `${roundKey(s)}#${id}`, userId: app.settings.userId });
  const earn = net > 0
    ? await outbox.add('earn', { userId: app.settings.userId, txId: `${roundKey(s)}:${id}:earn`, date: s.date, amount: net, shown: amount, ref: id, roundKey: roundKey(s) })
    : null;
  await saveSessionHere(s);
  outbox.send(item, sendItem);
  if (earn) outbox.send(earn, sendItem);

  if (amount > 0) {
    await changeWallet(amount, amount);
    floatMoney(`+${formatMoney(amount)}`, $('xpPill'));
  } else if (share > 0 && earnedBefore >= DAY_CAP) {
    toastLine(`You already earned ${formatMoney(DAY_CAP)} today. Amazing!`, 'info');
  }
  updateTopbar();

  if (s.index >= s.ids.length) {
    await completeDay();
    return;
  }
  showCard();
  if (s.combo >= 3) {
    $('comboCount').textContent = s.combo;
    restartAnimation($('combo'));
    playSound('combo');
    say(`${pickMessage('combo')} Combo x${s.combo}!`, 'wow');
  } else {
    say('What is this word in English?', 'idle');
  }
}

async function completeDay(celebrate = true) {
  const s = app.session;
  if (s.completed) return;
  s.completed = true; // saved together with the best round, so a reload cannot count it twice
  const round = { ...roundSummary(s, app.words), key: roundKey(s) };
  // The History row (best round per day) is queued first; the key makes a repeat harmless.
  const item = await outbox.add('history', { date: s.date, round, userId: app.settings.userId });
  app.streak = updateStreak(await getStreak(), s.date);
  await saveStreak(app.streak);
  const newBest = isBetterRound(round, s.best);
  if (newBest) s.best = round;
  await saveSessionHere(s);
  // Once the round is in the Sheet, pay and celebrate any achievement it unlocked.
  outbox.send(item, sendItem).then((sent) => sent && checkAchievements(app.settings, { onReward: rewardWallet }));
  updateTopbar();
  showSummary(celebrate, newBest);
}

async function reviewAgain() {
  if (app.startingRound) return; // a second click would skip a round number
  app.startingRound = true;
  setTimeout(() => { app.startingRound = false; }, 1500);
  const prev = app.session;
  app.session = nextRoundSession(prev, [...app.words.values()], todayKey());
  await saveSessionHere(app.session);
  updateTopbar();
  showCard();
  const best = typeof prev.best?.points === 'number' ? formatMoney(prev.best.points) : 'your best';
  say(`Round ${app.session.round}! Can you beat ${best}?`, 'happy');
}

function showSummary(celebrate, newBest = false) {
  const s = app.session;
  const round = roundSummary(s, app.words);

  $('summaryTitle').textContent = newBest && (s.round || 1) > 1 ? 'New best today!' : pickMessage('done');
  const earnedToday = app.wallet?.earnedToday ?? s.earned ?? 0;
  $('roundInfo').textContent = `Round ${s.round || 1} · Best today: ${formatMoney(s.best?.points ?? round.points)} · `
    + `Earned today: ${formatMoney(earnedToday)} / ${formatMoney(DAY_CAP)}`;
  $('sumCards').textContent = round.total;
  $('sumPassed').textContent = round.passed;
  $('sumScore').textContent = round.avgScore;
  $('sumXp').textContent = formatMoney(s.earned || 0);
  $('sumStreak').textContent = currentStreak(app.streak, todayKey());

  const again = round.again;
  $('againBox').hidden = again.length === 0;
  $('againList').replaceChildren(...again.map((w) => {
    const span = document.createElement('span');
    span.textContent = w;
    return span;
  }));

  $('combo').hidden = true;
  show('screenSummary');
  say('You are a superstar! See you tomorrow!', 'happy');
  if (celebrate) {
    playSound('fanfare');
    [0, 500, 1000].forEach((delay) => setTimeout(() => confetti($('confetti'), { count: 120, originY: 0.25, spread: 1.6 }), delay));
  }
}

// ---------- events ----------

$('answerForm').addEventListener('submit', onAnswer);
$('hintBtn').addEventListener('click', () => giveHint(false));
$('answerInput').addEventListener('input', onTypedInput);
['keyup', 'click', 'select'].forEach((type) => $('answerInput').addEventListener(type, refreshCaret));
document.addEventListener('selectionchange', refreshCaret);
$('answerInput').addEventListener('focus', () => $('slots').classList.add('focused'));
$('answerInput').addEventListener('blur', () => $('slots').classList.remove('focused'));
$('slots').addEventListener('click', onSlotClick);
$('speakBtn').addEventListener('click', () => { playReference(1, $('speakBtn')); $('speakBtn').blur(); });
$('slowBtn').addEventListener('click', () => { playReference(0.6, $('slowBtn')); $('slowBtn').blur(); });
$('micBtn').addEventListener('click', toggleRecord);
$('retryBtn').addEventListener('click', retry);
$('skipBtn').addEventListener('click', () => { app.card = skipCard(app.card); finishCard(); });
$('nextBtn').addEventListener('click', finishCard);
$('closeBtn').addEventListener('click', closeTab);
$('againBtn').addEventListener('click', reviewAgain);
$('continueBtn').addEventListener('click', continueAfterReveal);
$('historyBtn').addEventListener('click', () => nav.go('history/history.html'));
$('muteBtn').addEventListener('click', async () => {
  app.muted = !app.muted;
  renderMute();
  await savePrefs({ muted: app.muted });
});

document.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'BUTTON' || $('screenCard').hidden) return;
  if (e.code === 'Space' && !$('speakingPart').hidden && !$('micZone').hidden) {
    e.preventDefault();
    toggleRecord();
  } else if (e.key === 'Enter' && !$('nextBtn').hidden && !$('result').hidden) {
    finishCard();
  }
});

init();
