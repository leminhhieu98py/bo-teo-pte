// Client for the Google Apps Script web app that stores words in the Google Sheet.
import { timeoutSignal } from './timeout.js';

export class SheetError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'SheetError';
    this.status = status;
  }
}

export const SHEET_TIMEOUT_MS = 60000;

async function call({ url, token, fetchImpl = fetch, timeoutMs = SHEET_TIMEOUT_MS, ...payload }) {
  const { signal, done } = timeoutSignal(timeoutMs);
  try {
    return await callWithSignal({ url, token, fetchImpl, timeoutMs, signal, payload });
  } finally {
    done();
  }
}

async function callWithSignal({ url, token, fetchImpl, timeoutMs, signal, payload }) {
  const timedOut = () => new SheetError(`Google Sheet did not answer within ${Math.round(timeoutMs / 1000)}s`);
  let res;
  try {
    // text/plain keeps the request "simple" for Apps Script; it reads e.postData.contents.
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, ...payload }),
      redirect: 'follow',
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw timedOut();
    throw new SheetError(`Cannot reach Google Sheet: ${err.message}`);
  }
  if (!res.ok) throw new SheetError(`Google Sheet HTTP ${res.status}`, res.status);
  let data;
  try {
    data = await res.json();
  } catch {
    if (signal.aborted) throw timedOut();
    throw new SheetError('Google Sheet returned an unexpected answer. Check the Apps Script URL.');
  }
  if (!data || data.ok !== true) {
    const err = new SheetError(data?.error || 'Google Sheet request failed');
    err.data = data || {};
    throw err;
  }
  return data;
}

// Only send userId when there is one: older setups without learners keep working.
const who = (userId) => (userId ? { userId } : {});

export async function listWords({ url, token, userId, fetchImpl }) {
  const data = await call({ url, token, fetchImpl, action: 'list', ...who(userId) });
  return data.words || [];
}

export async function addWord({ url, token, userId, word, fetchImpl }) {
  const data = await call({ url, token, fetchImpl, action: 'add', ...who(userId), word });
  return { status: data.status, word: data.word };
}

export async function postReview({ url, token, userId, results, fetchImpl }) {
  return call({ url, token, fetchImpl, action: 'review', ...who(userId), results });
}

export async function saveHistory({ url, token, userId, date, round, fetchImpl }) {
  const data = await call({ url, token, fetchImpl, action: 'history-save', ...who(userId), date, round });
  return data.day;
}

export async function listHistory({ url, token, userId, fetchImpl }) {
  const data = await call({ url, token, fetchImpl, action: 'history-list', ...who(userId) });
  return data.days || [];
}

// ---------- XP wallet (Users.xp + Ledger) ----------

export async function walletGet({ url, token, userId, date, fetchImpl }) {
  const data = await call({ url, token, fetchImpl, action: 'wallet-get', userId, date });
  return { xp: Number(data.xp) || 0, earnedToday: Number(data.earnedToday) || 0, owned: data.owned || [], pet: data.pet || '', theme: data.theme || '' };
}

export async function walletEarn({ url, token, userId, txId, date, amount, ref, fetchImpl }) {
  const data = await call({ url, token, fetchImpl, action: 'wallet-earn', userId, txId, date, amount, ref });
  return { credited: Number(data.credited) || 0, xp: Number(data.xp) || 0, earnedToday: Number(data.earnedToday) || 0 };
}

// A wallet that cannot pay is an answer, not an error: { ok: false, error: 'not_enough_xp', xp }.
export async function walletSpend({ url, token, userId, txId, date, amount, kind, ref, fetchImpl }) {
  try {
    const data = await call({ url, token, fetchImpl, action: 'wallet-spend', userId, txId, date, amount, kind, ref });
    return { ok: true, xp: Number(data.xp) || 0 };
  } catch (err) {
    if (err instanceof SheetError && err.message === 'not_enough_xp') return { ok: false, error: 'not_enough_xp', xp: Number(err.data?.xp) || 0 };
    throw err;
  }
}

// ---------- achievements ----------

export async function getStats({ url, token, userId, date, fetchImpl }) {
  const data = await call({ url, token, fetchImpl, action: 'stats', userId, date });
  return { stats: data.stats || {}, claimed: data.claimed || [], xp: Number(data.xp) || 0 };
}

// Pays the tier once ({ reward: 0 } when it was already paid); a tier not reached is a SheetError.
export async function claimAchievement({ url, token, userId, achievementId, tier, date, fetchImpl }) {
  const data = await call({ url, token, fetchImpl, action: 'achievement-claim', userId, achievementId, tier, date });
  return { reward: Number(data.reward) || 0, xp: Number(data.xp) || 0 };
}

// ---------- learners (tab Users) ----------

export async function listUsers({ url, token, fetchImpl }) {
  const data = await call({ url, token, fetchImpl, action: 'users-list' });
  return data.users || [];
}

export async function createUser({ url, token, id, name, fetchImpl }) {
  const data = await call({ url, token, fetchImpl, action: 'users-create', id, name });
  return data.user;
}

export async function renameUser({ url, token, id, name, fetchImpl }) {
  const data = await call({ url, token, fetchImpl, action: 'users-rename', id, name });
  return data.user;
}
