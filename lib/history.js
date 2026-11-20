// Daily learning history: one row per day with the best round. mergeDay mirrors Code.gs.
import { todayKey } from './daily.js';

const num = (v) => Number(v) || 0;

export function roundSummary(session, wordsById) {
  const results = Object.entries(session.results || {});
  const scores = results.map(([, r]) => num(r.score)).filter((n) => n > 0);
  return {
    xp: num(session.xp),
    passed: results.filter(([, r]) => r.passed).length,
    total: (session.ids || []).length,
    avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    again: results.filter(([, r]) => r.skipped || r.revealed).map(([id]) => wordsById.get(id)?.word).filter(Boolean),
  };
}

// Is round a better than round b? Higher XP, then more passed, then higher average score.
export function isBetterRound(a, b) {
  if (!b) return true;
  if (num(a.xp) !== num(b.xp)) return num(a.xp) > num(b.xp);
  if (num(a.passed) !== num(b.passed)) return num(a.passed) > num(b.passed);
  return num(a.avgScore) > num(b.avgScore);
}

export function mergeDay(row, date, round, nowIso) {
  const best = {
    best_xp: num(round.xp),
    best_passed: num(round.passed),
    total: num(round.total),
    best_avg_score: num(round.avgScore),
    again_words: (round.again || []).join(', '),
  };
  if (!row) return { date, rounds: 1, ...best, updated_at: nowIso };
  const current = { xp: row.best_xp, passed: row.best_passed, avgScore: row.best_avg_score };
  const kept = {
    best_xp: num(row.best_xp),
    best_passed: num(row.best_passed),
    total: num(row.total),
    best_avg_score: num(row.best_avg_score),
    again_words: String(row.again_words ?? ''),
  };
  return {
    date,
    rounds: num(row.rounds) + 1,
    ...(isBetterRound(round, current) ? best : kept),
    updated_at: nowIso,
  };
}

// Calendar weeks (Monday first) covering the month. monthIndex is 0-based like Date.
export function monthGrid(year, monthIndex) {
  const first = new Date(year, monthIndex, 1, 12);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const weeks = [];
  const cursor = new Date(start);
  do {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push({ date: todayKey(cursor), inMonth: cursor.getMonth() === monthIndex });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getMonth() === monthIndex);
  return weeks;
}

// 0 = not studied, 1..4 = how many words passed in the best round.
export function dayLevel(row) {
  if (!row || num(row.rounds) === 0) return 0;
  const total = num(row.total);
  if (!total) return 1;
  const ratio = num(row.best_passed) / total;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.8) return 3;
  return 4;
}

export function monthTotals(rows, year, monthIndex) {
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}-`;
  const inMonth = (rows || []).filter((r) => String(r.date).startsWith(prefix));
  return {
    days: inMonth.length,
    xp: inMonth.reduce((sum, r) => sum + num(r.best_xp), 0),
    passed: inMonth.reduce((sum, r) => sum + num(r.best_passed), 0),
  };
}

function shiftDay(dateKey, days) {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayKey(d);
}

// The Sheet History is the source of truth for the streak (the local streak is only a cache):
// consecutive studied days ending today, or yesterday when today is not done yet.
export function streakFromHistory(rows, today) {
  const days = new Set((rows || []).filter((r) => num(r.rounds) > 0).map((r) => String(r.date)));
  const lastDate = [...days].sort().pop() || '';
  let day = days.has(today) ? today : shiftDay(today, -1);
  let count = 0;
  while (days.has(day)) {
    count++;
    day = shiftDay(day, -1);
  }
  return { count, lastDate };
}
