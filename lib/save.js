// Saving one word: Gemini enrichment + Google Sheet append. Runs in the offscreen document
// because a slow Gemini answer (> 30s) would get the extension service worker terminated.
import { enrichWord, enrichFromImage } from './gemini.js';
import { addWord } from './sheet.js';
import { formatDetail } from './errors.js';

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
    return { ok: false, error: errorPayload(err, { where: 'save', model: settings.model, word }) };
  }
}

// Same as runSaveJob, but Gemini reads the word card from a cropped screenshot.
export async function runImageJob({ base64, mimeType, url, settings }, { fetchImpl } = {}) {
  try {
    const card = await enrichFromImage({ apiKey: settings.apiKey, model: settings.model, base64, mimeType, fetchImpl });
    const { status, word: saved } = await addWord({
      url: settings.sheetUrl,
      token: settings.token,
      word: { ...card, source_url: url || '' },
      fetchImpl,
    });
    return { ok: true, status, word: saved };
  } catch (err) {
    return { ok: false, error: errorPayload(err, { where: 'save-image', model: settings.model }) };
  }
}

// Plain (message-safe) error object with everything needed for the error log.
export function errorPayload(err, { where = '', model = '', word = '' } = {}) {
  return {
    name: err?.name || 'Error',
    code: err?.code || '',
    status: Number(err?.status) || 0,
    message: err?.message || String(err),
    model: err?.name === 'SheetError' ? '' : model || '',
    where,
    word: word || '',
  };
}

// Turns a job result (or a serialized error) into the toast text.
export function describeSaveResult(result) {
  if (result.ok) {
    const { word, meaning_vi: meaning } = result.word || {};
    return result.status === 'exists'
      ? { message: `"${word}" is already in your list: ${meaning}`, kind: 'info', detail: '' }
      : { message: `Saved "${word}" - ${meaning}`, kind: 'success', detail: '' };
  }
  const error = result.error || {};
  return { message: friendlyError(error), kind: 'error', detail: formatDetail(error) };
}

function friendlyError({ name, code, status, message }) {
  if (name === 'SetupError') return `Bo cố lên needs setup. ${message}`;
  if (code === 'not_enough_info') return 'Not enough information in the picture. Try a bigger area around the word.';
  if (code === 'too_small') return 'The selected area is too small. Drag around the whole explanation.';
  if (code === 'timeout') return 'Gemini took too long to answer. Please try again.';
  if (code === 'quota') return 'Gemini is busy (quota). Try again in a minute.';
  if (code === 'auth') return 'Gemini API key is not valid. Check Settings.';
  if (status === 503) return 'Gemini is overloaded right now. Try again in a minute.';
  if (name === 'SheetError') return `Google Sheet: ${message}`;
  return 'Could not save the word.';
}
