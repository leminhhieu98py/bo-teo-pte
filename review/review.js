// Daily review: type the word from its Vietnamese meaning, then say it out loud.
import { setMood } from '../ui/mascot.js';
import { ICONS, starSvg } from '../ui/icons.js';
import {
  getSettings, getReadySettings, missingSettings, SetupError, getSession, saveSession,
  getStreak, saveStreak, getPrefs, savePrefs, enqueueReviews, takeQueuedReviews,
} from '../lib/storage.js';
import { listWords, postReview } from '../lib/sheet.js';
import { gradePronunciation, GeminiError } from '../lib/gemini.js';
import { buildDailySet, todayKey, toBool } from '../lib/daily.js';
import {
  createCardState, applyTyping, shouldAutoHint, applyGrade, canSkip, skipCard, needsReview,
  applyHint, revealAll,
} from '../lib/card.js';
import { maskWord } from '../lib/answer.js';
import { buildSlots, letterCount, sanitizeTyped, composeSlots } from '../lib/slots.js';
import { updateStreak, currentStreak, starsForScore, xpForCard, pickMessage } from '../lib/progress.js';
import { confetti, playSound, setMuted, floatXp } from './effects.js';
import { Recorder } from './recorder.js';
import { speak } from './speech.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['screenLoading', 'screenMessage', 'screenCard', 'screenSummary'];
const MAX_RECORD_MS = 4000;
const MIN_PEAK = 0.03;
const RING_LENGTH = 326.7;

const app = {
  settings: null,
  words: new Map(),
  session: null,
  streak: { count: 0, lastDate: '' },
  card: null,
  word: null,
  slots: [],
  recorder: null,
  recordTimer: 0,
  busy: false,
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

function toastLine(text, kind = '') {
  $('toastLine').textContent = text;
  $('toastLine').className = `toast-line ${kind}`;
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
  $('xpPill').textContent = `${s?.xp || 0} XP`;
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
  return `Oops: ${err.message}`;
}

function micErrorText(err) {
  if (err?.name === 'NotAllowedError') {
    return 'The microphone is blocked. Allow it in the address bar, and on Mac check System Settings > Privacy & Security > Microphone > Google Chrome.';
  }
  if (err?.name === 'NotFoundError') return 'No microphone found.';
  return `Microphone error: ${err?.message || err}`;
}

// ---------- sheet sync ----------

async function sendResults(results) {
  try {
    await postReview({ url: app.settings.sheetUrl, token: app.settings.token, results });
  } catch {
    await enqueueReviews(results);
  }
}

async function flushQueue() {
  const queued = await takeQueuedReviews();
  if (queued.length) await sendResults(queued);
}

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
    showMessage('Mochi needs a quick setup', `Missing: ${missing.join(', ')}. Ask your brother to run start.sh, or open Settings.`,
      'Open Settings', () => chrome.runtime.openOptionsPage(), 'oops');
    return;
  }
  app.settings = settings;
  app.streak = await getStreak();
  flushQueue();

  let words;
  try {
    words = (await listWords({ url: settings.sheetUrl, token: settings.token })).filter((w) => w.id && w.word);
  } catch (err) {
    showMessage('Cannot open your word list', err.message, 'Try again', () => location.reload(), 'oops');
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
  let session = await getSession();
  const fresh = !session || session.date !== today || Object.keys(session.results || {}).length === 0;
  if (fresh) session = { date: today, ids: buildDailySet(words), results: {}, xp: 0, combo: 0 };
  session.ids = session.ids.filter((id) => app.words.has(id));
  session.index = firstUnfinished(session);
  app.session = session;
  await saveSession(session);
  updateTopbar();

  if (session.index >= session.ids.length) {
    showSummary(false);
  } else {
    say(fresh ? `Hi! ${session.ids.length} words today. Let's go!` : "Welcome back! Let's continue.", 'happy');
    showCard();
  }
}

// ---------- typing phase ----------

function showCard() {
  const s = app.session;
  const w = app.words.get(s.ids[s.index]);
  app.word = w;
  app.card = createCardState();

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
  $('speakingPart').hidden = true;
  $('combo').hidden = (s.combo || 0) < 3;
  toastLine('');
  show('screenCard');
  $('answerInput').focus();
  renderSlots();
  updateTopbar();
}

const totalLetters = () => letterCount(app.slots);

// Draws one slot per letter. The hidden input only holds the typed letters (never the hints),
// so Backspace cannot remove a hinted letter.
function renderSlots(status = '') {
  const hints = app.card.hints || 0;
  const typed = sanitizeTyped($('answerInput').value, totalLetters() - hints);
  if ($('answerInput').value !== typed) $('answerInput').value = typed;
  const { cells, cursor } = composeSlots(app.slots, hints, typed);

  const groups = [];
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
    el.textContent = cell.ch;
    group.append(el);
  });
  groups.push(group);

  const focused = document.activeElement === $('answerInput');
  $('slots').replaceChildren(...groups);
  $('slots').className = ['slots', totalLetters() > 12 ? 'small' : '', focused ? 'focused' : '', status].filter(Boolean).join(' ');
  $('hintBtn').disabled = hints >= totalLetters() || app.card.phase !== 'typing';
}

function finishRevealed() {
  // Every letter is shown: the word counts as not passed and comes back tomorrow.
  $('answerInput').value = '';
  const { answer } = composeSlots(app.slots, totalLetters(), '');
  app.card = applyTyping(app.card, answer, app.word.word).state;
  $('answerInput').disabled = true;
  renderSlots('reveal');
  say(pickMessage('reveal'), 'think');
  toastLine('This word will come back tomorrow. Now let us say it!', 'info');
  setTimeout(goSpeaking, 2000);
}

function giveHint(auto = false) {
  if (app.card.phase !== 'typing') return;
  const { state, result } = applyHint(app.card, totalLetters());
  if (result === 'none') return;
  app.card = state;
  // The hinted letter takes the first typed slot, so a correct prefix stays correct.
  $('answerInput').value = $('answerInput').value.slice(1);
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
  setTimeout(() => playReference(1), 350);
}

function resetMic() {
  $('micBtn').classList.remove('recording');
  $('micIcon').innerHTML = ICONS.mic;
  $('micLabel').textContent = 'Tap the mic (or press Space)';
  $('micRing').style.transform = 'scale(1)';
}

async function toggleRecord() {
  if (app.busy || $('micZone').hidden) return;
  if (app.recorder?.recording) {
    stopRecord();
    return;
  }
  speechSynthesis.cancel();
  app.recorder = new Recorder({
    onLevel: (level) => { $('micRing').style.transform = `scale(${1 + Math.min(level * 1.6, 0.6)})`; },
  });
  try {
    await app.recorder.start();
  } catch (err) {
    say('I need your microphone to hear you!', 'oops');
    toastLine(micErrorText(err), 'bad');
    return;
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
  if (rec.peak < MIN_PEAK || rec.seconds < 0.3) {
    app.busy = false;
    say('I could not hear you. Speak a bit louder and closer!', 'oops');
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
    toastLine(errorText(err), 'bad');
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
  const xp = xpForCard(st);
  const firstTry = st.passed && st.typingWrong === 0 && st.pronFails === 0 && !st.hints;

  s.combo = firstTry ? (s.combo || 0) + 1 : 0;
  s.xp = (s.xp || 0) + xp;
  s.results[id] = { passed: st.passed, skipped: st.skipped, revealed: st.revealed, score: st.bestScore, xp };
  s.index = firstUnfinished(s);
  await saveSession(s);
  sendResults([{ id, needsReview: needsReview(st) }]);

  floatXp($('xpFloat'), $('xpPill'), `+${xp} XP`);
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

async function completeDay() {
  app.streak = updateStreak(await getStreak(), todayKey());
  await saveStreak(app.streak);
  updateTopbar();
  showSummary(true);
}

function showSummary(celebrate) {
  const s = app.session;
  const results = Object.entries(s.results);
  const passed = results.filter(([, r]) => r.passed).length;
  const scores = results.map(([, r]) => r.score).filter((n) => n > 0);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  $('summaryTitle').textContent = pickMessage('done');
  $('sumCards').textContent = results.length;
  $('sumPassed').textContent = passed;
  $('sumScore').textContent = avg;
  $('sumXp').textContent = s.xp || 0;
  $('sumStreak').textContent = currentStreak(app.streak, todayKey());

  const again = results.filter(([, r]) => r.skipped || r.revealed).map(([id]) => app.words.get(id)?.word).filter(Boolean);
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
$('answerInput').addEventListener('input', () => renderSlots());
$('answerInput').addEventListener('focus', () => $('slots').classList.add('focused'));
$('answerInput').addEventListener('blur', () => $('slots').classList.remove('focused'));
$('slots').addEventListener('click', () => $('answerInput').focus());
$('speakBtn').addEventListener('click', () => playReference(1, $('speakBtn')));
$('slowBtn').addEventListener('click', () => playReference(0.6, $('slowBtn')));
$('micBtn').addEventListener('click', toggleRecord);
$('retryBtn').addEventListener('click', retry);
$('skipBtn').addEventListener('click', () => { app.card = skipCard(app.card); finishCard(); });
$('nextBtn').addEventListener('click', finishCard);
$('closeBtn').addEventListener('click', closeTab);
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
