// Saving one word: Gemini enrichment + Google Sheet append. Runs in the offscreen document
// because a slow Gemini answer (> 30s) would get the extension service worker terminated.
import { enrichWord } from './gemini.js';
import { addWord } from './sheet.js';

export async function runSaveJob({ word, context, url, settings }, { fetchImpl } = {}) {
  try {
    const enriched = await enrichWord({ apiKey: settings.apiKey, model: settings.model, word, context, fetchImpl });
    const { status, word: saved } = await addWord({
      url: settings.sheetUrl,
      token: settings.token,
      word: { ...enriched, source_url: url || '' },
      fetchImpl,
    });
    return { ok: true, status, word: saved };
  } catch (err) {
    return { ok: false, error: { name: err?.name || 'Error', code: err?.code || '', message: err?.message || String(err) } };
  }
}

// Turns a job result (or a serialized error) into the toast text.
export function describeSaveResult(result) {
  if (result.ok) {
    const { word, meaning_vi: meaning } = result.word || {};
    return result.status === 'exists'
      ? { message: `"${word}" is already in your list: ${meaning}`, kind: 'info' }
      : { message: `Saved "${word}" - ${meaning}`, kind: 'success' };
  }
  const { name, code, message } = result.error || {};
  if (name === 'SetupError') return { message: `Bo cố lên needs setup. ${message}`, kind: 'error' };
  if (code === 'timeout') return { message: 'Gemini took too long to answer. Please try again.', kind: 'error' };
  if (code === 'quota') return { message: 'Gemini is busy (quota). Try again in a minute.', kind: 'error' };
  if (code === 'auth') return { message: 'Gemini API key is not valid. Check Settings.', kind: 'error' };
  return { message: `Could not save: ${message}`, kind: 'error' };
}
