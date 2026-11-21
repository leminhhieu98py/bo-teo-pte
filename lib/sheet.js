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
  if (!data || data.ok !== true) throw new SheetError(data?.error || 'Google Sheet request failed');
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
