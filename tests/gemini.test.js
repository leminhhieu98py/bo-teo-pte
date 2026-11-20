import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterFlashModels, pickDefaultModel, extractJson, buildEnrichBody, parseEnrich,
  buildGradeBody, parseGrade, generate, listModels, GeminiError,
} from '../lib/gemini.js';

const GC = ['generateContent', 'countTokens'];
const MODELS = [
  { name: 'models/gemini-2.0-flash', supportedGenerationMethods: GC },
  { name: 'models/gemini-2.5-flash', supportedGenerationMethods: GC },
  { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: GC },
  { name: 'models/gemini-3-flash-preview', supportedGenerationMethods: GC },
  { name: 'models/gemini-2.5-pro', supportedGenerationMethods: GC },
  { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: GC },
  { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: GC },
  { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
];

function fakeFetch(status, body) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
  };
  impl.calls = calls;
  return impl;
}

test('filterFlashModels keeps only plain flash models', () => {
  assert.deepEqual(filterFlashModels(MODELS), ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-3-flash-preview']);
});

test('pickDefaultModel prefers the newest stable flash model', () => {
  assert.equal(pickDefaultModel(MODELS), 'gemini-2.5-flash');
  assert.equal(pickDefaultModel([...MODELS, { name: 'models/gemini-3-flash', supportedGenerationMethods: GC }]), 'gemini-3-flash');
});

test('pickDefaultModel falls back to preview, then null', () => {
  assert.equal(pickDefaultModel([MODELS[3]]), 'gemini-3-flash-preview');
  assert.equal(pickDefaultModel([MODELS[4]]), null);
  assert.equal(pickDefaultModel([]), null);
});

test('extractJson handles fences and surrounding text', () => {
  assert.deepEqual(extractJson('```json\n{"a": 1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here you go: {"a": {"b": 2}} thanks'), { a: { b: 2 } });
  assert.throws(() => extractJson('no json'), GeminiError);
});

test('buildEnrichBody asks for JSON and includes word and context', () => {
  const body = buildEnrichBody('look up', 'I look up words.');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  const prompt = body.contents[0].parts[0].text;
  assert.ok(prompt.includes('look up'));
  assert.ok(prompt.includes('I look up words.'));
  assert.ok(body.generationConfig.responseSchema.required.includes('meaning_vi'));
});

test('parseEnrich fills defaults and requires meaning_vi', () => {
  const out = parseEnrich({ meaning_vi: 'tra cuu', ipa: '/lʊk ʌp/' }, 'look up');
  assert.equal(out.word, 'look up');
  assert.equal(out.meaning_vi, 'tra cuu');
  assert.equal(out.example_en, '');
  assert.throws(() => parseEnrich({ word: 'x' }, 'x'), GeminiError);
});

test('buildGradeBody sends wav audio inline and mentions stress', () => {
  const body = buildGradeBody('banana', '/bəˈnɑːnə/', 'QUJD');
  const parts = body.contents[0].parts;
  const audio = parts.find((p) => p.inlineData);
  assert.equal(audio.inlineData.mimeType, 'audio/wav');
  assert.equal(audio.inlineData.data, 'QUJD');
  const prompt = parts.find((p) => p.text).text;
  assert.ok(prompt.includes('banana'));
  assert.ok(/stress/i.test(prompt));
});

test('parseGrade clamps score and requires correct stress to pass', () => {
  const g = parseGrade({ heard: 'banana', score: '120', stress_correct: true, tip_vi: 'tot' });
  assert.equal(g.score, 100);
  assert.equal(g.passed, true);
  assert.equal(g.tip, 'tot');

  const noStress = parseGrade({ heard: 'banana', score: 95 });
  assert.equal(noStress.stressCorrect, false);
  assert.equal(noStress.passed, false);

  const low = parseGrade({ score: 69.6, stress_correct: true });
  assert.equal(low.score, 70);
  assert.equal(low.passed, true);

  assert.equal(parseGrade({ score: -5, stress_correct: true }).score, 0);
  assert.equal(parseGrade({ score: 'abc', stress_correct: 'true' }).score, 0);
});

test('generate posts to the model endpoint with the key header and returns parsed JSON', async () => {
  const fetchImpl = fakeFetch(200, { candidates: [{ content: { parts: [{ text: '{"ok": true}' }] } }] });
  const out = await generate({ apiKey: 'k', model: 'gemini-2.5-flash', body: { x: 1 }, fetchImpl });
  assert.deepEqual(out, { ok: true });
  assert.ok(fetchImpl.calls[0].url.endsWith('/v1beta/models/gemini-2.5-flash:generateContent'));
  assert.equal(fetchImpl.calls[0].init.headers['x-goog-api-key'], 'k');
});

test('generate maps HTTP errors to codes', async () => {
  await assert.rejects(
    generate({ apiKey: 'k', model: 'm', body: {}, fetchImpl: fakeFetch(429, { error: { status: 'RESOURCE_EXHAUSTED' } }) }),
    (e) => e instanceof GeminiError && e.code === 'quota'
  );
  await assert.rejects(
    generate({ apiKey: 'k', model: 'm', body: {}, fetchImpl: fakeFetch(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }) }),
    (e) => e.code === 'auth'
  );
  await assert.rejects(
    generate({ apiKey: 'k', model: 'm', body: {}, fetchImpl: fakeFetch(500, { error: { message: 'boom' } }) }),
    (e) => e.code === 'other'
  );
});

test('generate rejects an empty candidate', async () => {
  await assert.rejects(
    generate({ apiKey: 'k', model: 'm', body: {}, fetchImpl: fakeFetch(200, { candidates: [] }) }),
    (e) => e instanceof GeminiError
  );
});

test('listModels returns the models array', async () => {
  const fetchImpl = fakeFetch(200, { models: MODELS });
  const out = await listModels({ apiKey: 'k', fetchImpl });
  assert.equal(out.length, MODELS.length);
  assert.equal(fetchImpl.calls[0].init.headers['x-goog-api-key'], 'k');
});
