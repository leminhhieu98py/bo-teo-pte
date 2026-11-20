// Client for the Google Apps Script web app that stores words in the Google Sheet.

export class SheetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SheetError';
  }
}

async function call({ url, token, fetchImpl = fetch, ...payload }) {
  let res;
  try {
    // text/plain keeps the request "simple" for Apps Script; it reads e.postData.contents.
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, ...payload }),
      redirect: 'follow',
    });
  } catch (err) {
    throw new SheetError(`Cannot reach Google Sheet: ${err.message}`);
  }
  if (!res.ok) throw new SheetError(`Google Sheet HTTP ${res.status}`);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new SheetError('Google Sheet returned an unexpected answer. Check the Apps Script URL.');
  }
  if (!data || data.ok !== true) throw new SheetError(data?.error || 'Google Sheet request failed');
  return data;
}

export async function listWords({ url, token, fetchImpl }) {
  const data = await call({ url, token, fetchImpl, action: 'list' });
  return data.words || [];
}

export async function addWord({ url, token, word, fetchImpl }) {
  const data = await call({ url, token, fetchImpl, action: 'add', word });
  return { status: data.status, word: data.word };
}

export async function postReview({ url, token, results, fetchImpl }) {
  return call({ url, token, fetchImpl, action: 'review', results });
}
