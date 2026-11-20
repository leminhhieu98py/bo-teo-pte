// Streak, stars, XP and the cheering messages.

function dayBefore(today) {
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() - 1);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function updateStreak(streak, today) {
  if (!streak || !streak.lastDate) return { count: 1, lastDate: today };
  if (streak.lastDate >= today) return { count: streak.count, lastDate: streak.lastDate }; // same day, or an old tab finishing late
  const isConsecutive = streak.lastDate === dayBefore(today);
  return { count: isConsecutive ? streak.count + 1 : 1, lastDate: today };
}

// Streak to display: still counts if the last finished day was today or yesterday.
export function currentStreak(streak, today) {
  if (!streak || !streak.lastDate) return 0;
  return streak.lastDate === today || streak.lastDate === dayBefore(today) ? streak.count : 0;
}

export function starsForScore(score) {
  if (score >= 90) return 3;
  if (score >= 80) return 2;
  if (score >= 70) return 1;
  return 0;
}

export function xpForCard(state) {
  if (!state.passed) return 5;
  return state.typingWrong === 0 && state.pronFails === 0 && !state.hints ? 30 : 20;
}

const MESSAGES = {
  correct: ['Yes! You got it!', 'Correct! Nice memory!', 'Spot on!', 'You remembered it!', 'Perfect spelling!'],
  almost: ['So close! Check one or two letters.', 'Almost there! Look again.', 'Nearly! A tiny typo.'],
  wrong: ['Not quite. Try again!', 'Hmm, think again. You can do it!', 'Take a breath and try once more.'],
  reveal: ['Here it is! Remember it for next time.', "Let's learn this one together."],
  pass: ['Amazing pronunciation!', 'You sound great!', 'Wow, like a native speaker!', 'Super clear! Well done!', 'Mochi is so proud of you!'],
  fail: ['Good try! Listen once more and copy the stress.', 'Almost! Listen to the sample and try again.', 'Keep going, every try makes you better!'],
  combo: ['Combo! You are on fire!', 'Unstoppable!', 'What a streak of wins!'],
  done: ['You finished today! Great job!', 'All done! Your brain just got stronger!', 'Mission complete! See you tomorrow!'],
};

export const MESSAGE_KINDS = Object.keys(MESSAGES);

export function pickMessage(kind, rng = Math.random) {
  const list = MESSAGES[kind] || MESSAGES.correct;
  return list[Math.floor(rng() * list.length) % list.length];
}
