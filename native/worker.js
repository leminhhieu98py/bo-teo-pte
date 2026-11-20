// Hidden page of the Mac app: saves a highlighted word or a picture with the same code as the
// Chrome extension (lib/save.js) and returns the toast text for the native side.
import { validateSelection, extractSentence } from '../lib/text.js';
import { runSaveJob, runImageJob, describeSaveResult, errorPayload } from '../lib/save.js';
import { getReadySettings, appendErrorLog } from '../lib/storage.js';
import { errorEntry } from '../lib/errors.js';

async function finish(result) {
  const out = describeSaveResult(result);
  if (!result.ok) await appendErrorLog(errorEntry(result.error, { where: result.error.where }));
  return { ...out, openSettings: !result.ok && result.error.name === 'SetupError' };
}

async function settingsOr(where, word) {
  try {
    return { settings: await getReadySettings() };
  } catch (err) {
    return { failed: await finish({ ok: false, error: errorPayload(err, { where, word }) }) };
  }
}

window.boWorker = {
  async saveText({ text, context, source }) {
    const check = validateSelection(text);
    if (!check.ok) {
      const message = check.reason === 'empty'
        ? 'Highlight a word first, then press the shortcut.'
        : 'That is too long. Pick a word or a short phrase (max 6 words).';
      return { message, kind: 'info', detail: '' };
    }
    const { settings, failed } = await settingsOr('save', check.value);
    if (failed) return failed;
    const job = { word: check.value, context: extractSentence(context, check.value), url: source || '', settings };
    return finish(await runSaveJob(job));
  },

  async saveImage({ base64, source }) {
    const { settings, failed } = await settingsOr('save-image', '');
    if (failed) return failed;
    return finish(await runImageJob({ base64, mimeType: 'image/jpeg', url: source || '', settings }));
  },
};
