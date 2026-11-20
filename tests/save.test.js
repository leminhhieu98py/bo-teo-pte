import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSaveJob, describeSaveResult } from '../lib/save.js';

const settings = { apiKey: 'k', model: 'gemini-3.5-flash', sheetUrl: 'https://script.google.com/macros/s/x/exec', token: 't' };
const enriched = { word: 'exclamation', ipa: '/x/', part_of_speech: 'noun', meaning_vi: 'tieng thot len', description_vi: 'd', example_en: 'e', example_vi: 'v' };

function router({ gemini, sheet }) {
  const calls = [];
  const impl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    const [status, data] = url.includes('generativelanguage') ? gemini(body) : sheet(body);
    return { ok: status === 200, status, json: async () => data };
  };
  impl.calls = calls;
  return impl;
}

const geminiOk = () => [200, { candidates: [{ content: { parts: [{ text: JSON.stringify(enriched) }] } }] }];

test('runSaveJob enriches the word and adds it to the sheet with the source url', async () => {
  const fetchImpl = router({ gemini: geminiOk, sheet: (b) => [200, { ok: true, status: 'added', word: b.word }] });
  const result = await runSaveJob({ word: 'exclamation', context: 'An exclamation.', url: 'https://site/x', settings }, { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'added');
  assert.equal(result.word.meaning_vi, 'tieng thot len');
  assert.equal(fetchImpl.calls[1].body.word.source_url, 'https://site/x');
});

test('runSaveJob turns errors into a plain payload', async () => {
  const fetchImpl = router({ gemini: () => [429, { error: { message: 'quota' } }], sheet: () => [200, {}] });
  const result = await runSaveJob({ word: 'a', context: '', url: '', settings }, { fetchImpl });
  assert.deepEqual(result, {
    ok: false,
    error: { name: 'GeminiError', code: 'quota', status: 429, message: 'quota', model: 'gemini-3.5-flash', where: 'save', word: 'a' },
  });
});

test('describeSaveResult adds a detail line for errors', () => {
  const out = describeSaveResult({
    ok: false,
    error: { name: 'GeminiError', code: 'other', status: 503, message: 'high demand', model: 'gemini-3.1-flash-lite', where: 'save', word: 'a' },
  });
  assert.equal(out.detail, 'gemini-3.1-flash-lite · HTTP 503 · other: high demand');
  assert.equal(describeSaveResult({ ok: true, status: 'added', word: { word: 'a', meaning_vi: 'b' } }).detail, '');
});

test('describeSaveResult explains each outcome', () => {
  assert.deepEqual(describeSaveResult({ ok: true, status: 'added', word: { word: 'a', meaning_vi: 'b' } }), { message: 'Saved "a" - b', kind: 'success', detail: '' });
  assert.equal(describeSaveResult({ ok: true, status: 'exists', word: { word: 'a', meaning_vi: 'b' } }).kind, 'info');
  assert.match(describeSaveResult({ ok: false, error: { name: 'GeminiError', code: 'timeout', message: 'x' } }).message, /too long/);
  assert.match(describeSaveResult({ ok: false, error: { name: 'GeminiError', code: 'quota', message: 'x' } }).message, /quota/);
  assert.match(describeSaveResult({ ok: false, error: { name: 'GeminiError', code: 'auth', message: 'x' } }).message, /API key/);
  assert.match(describeSaveResult({ ok: false, error: { name: 'SetupError', code: '', message: 'Missing: key' } }).message, /needs setup/);
  assert.match(describeSaveResult({ ok: false, error: { name: 'SheetError', code: '', message: 'Wrong token' } }).message, /Wrong token/);
});
