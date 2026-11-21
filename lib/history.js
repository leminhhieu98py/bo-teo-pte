// Daily learning history: one row per day with the best round. mergeDay mirrors Code.gs.
import { todayKey } from './daily.js';

const num = (v) => Number(v) || 0;

export function roundSummary(session, wordsById) {
  const results = Object.entries(session.results || {});
  const scores = results.map(([, r]) => num(r.score)).filter((n) => n > 0);
  const points = num(session.points);
  return {
    points,
    xp: points, // older Code.gs versions read xp
    passed: results.filter(([, r]) => r.passed).length,
    total: (session.ids || []).length,
    avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
    again: results.filter(([, r]) => r.skipped || r.revealed).map(([id]) => wordsById.get(id)?.word).filter(Boolean),
  };
}

const hasPoints = (r) => typeof r?.points === 'number' || (r?.points !== undefined && r?.points !== '' && !Number.isNaN(Number(r?.points)));

// Is round a better than round b? More points (old rounds: XP), then more passed, then higher average
// score. A round with points always beats a best saved on the old XP scale.
export function isBetterRound(a, b) {
  if (!b) return true;
  if (hasPoints(a)) {
    if (!hasPoints(b)) return true;
    if (num(a.points) !== num(b.points)) return num(a.points) > num(b.points);
  } else if (num(a.xp) !== num(b.xp)) return num(a.xp) > num(b.xp);
  if (num(a.passed) !== num(b.passed)) return num(a.passed) > num(b.passed);
  return num(a.avgScore) > num(b.avgScore);
}

export function mergeDay(row, date, round, nowIso) {
  const usePoints = hasPoints(round);
  const best = {
    ...(usePoints ? { best_points: num(round.points) } : { best_xp: num(round.xp) }),
    best_passed: num(round.passed),
    total: num(round.total),
    best_avg_score: num(round.avgScore),
    again_words: (round.again || []).join(', '),
  };
  if (!row) return { date, rounds: 1, ...best, updated_at: nowIso };
  const current = usePoints
    ? (hasPoints({ points: row.best_points }) ? { points: num(row.best_points), passed: row.best_passed, avgScore: row.best_avg_score } : null)
    : { xp: row.best_xp, passed: row.best_passed, avgScore: row.best_avg_score };
  const kept = {
    ...(usePoints ? { best_points: num(row.best_points) } : { best_xp: num(row.best_xp) }),
    best_passed: num(row.best_passed),
    total: num(row.total),
    best_avg_score: num(row.best_avg_score),
    again_words: String(row.again_words ?? ''),
  };
  return {
    ...row,
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

const hasXpEarned = (row) => row && row.xp_earned !== undefined && row.xp_earned !== '';

// XP shown for a day: XP earned (wallet era), or the old best XP for older days.
export function dayXp(row) {
  return hasXpEarned(row) ? num(row.xp_earned) : num(row?.best_xp);
}

const practiced = (row) => Boolean(row) && (num(row.rounds) > 0 || (hasXpEarned(row) && num(row.xp_earned) > 0));

// 0 = not studied, 1..4 = XP earned that day (older days: how many words passed in the best round).
// A practiced day is never 0, so the calendar agrees with the streak.
export function dayLevel(row) {
  if (!practiced(row)) return 0;
  if (hasXpEarned(row)) {
    const xp = num(row.xp_earned);
    if (xp < 50) return 1;
    if (xp < 100) return 2;
    if (xp < 150) return 3;
    return 4;
  }
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
  const inMonth = (rows || []).filter((r) => String(r.date).startsWith(prefix) && practiced(r));
  return {
    days: inMonth.length,
    xp: inMonth.reduce((sum, r) => sum + dayXp(r), 0),
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
  const days = new Set((rows || []).filter(practiced).map((r) => String(r.date)));
  const lastDate = [...days].sort().pop() || '';
  let day = days.has(today) ? today : shiftDay(today, -1);
  let count = 0;
  while (days.has(day)) {
    count++;
    day = shiftDay(day, -1);
  }
  return { count, lastDate };
}
