import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterFlashModels, pickDefaultModel, extractJson, buildEnrichBody, parseEnrich,
  buildGradeBody, parseGrade, generate, listModels, GeminiError, buildImageBody, parseImageResult,
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

test('filterFlashModels keeps flash and flash-lite text models', () => {
  assert.deepEqual(filterFlashModels(MODELS), ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-preview']);
});

test('pickDefaultModel prefers the newest stable flash model', () => {
  assert.equal(pickDefaultModel(MODELS), 'gemini-2.5-flash');
  assert.equal(pickDefaultModel([...MODELS, { name: 'models/gemini-3-flash', supportedGenerationMethods: GC }]), 'gemini-3-flash');
});

test('pickDefaultModel prefers gemini-3.1-flash-lite when available', () => {
  const withNewer = [...MODELS,
    { name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: GC },
    { name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: GC },
    { name: 'models/gemini-3.8-flash', supportedGenerationMethods: GC }];
  assert.equal(pickDefaultModel(withNewer), 'gemini-3.1-flash-lite');
});

test('request bodies turn thinking off', () => {
  assert.deepEqual(buildEnrichBody('a', '').generationConfig.thinkingConfig, { thinkingBudget: 0 });
  assert.deepEqual(buildGradeBody('a', '', 'QQ==').generationConfig.thinkingConfig, { thinkingBudget: 0 });
});

function failThenOk(failures) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push(JSON.parse(init.body));
    const failure = failures[calls.length - 1];
    if (failure) return { ok: false, status: failure[0], json: async () => ({ error: { message: failure[1] } }) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ok":1}' }] } }] }) };
  };
  impl.calls = calls;
  return impl;
}

test('generate falls back through thinking settings on HTTP 400', async () => {
  const fetchImpl = failThenOk([[400, 'Request contains an invalid argument.'], [400, 'Thinking level MINIMAL is not supported.']]);
  const body = { generationConfig: { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } } };
  assert.deepEqual(await generate({ apiKey: 'k', model: 'm', body, fetchImpl }), { ok: 1 });
  const configs = fetchImpl.calls.map((c) => c.generationConfig.thinkingConfig);
  assert.deepEqual(configs, [{ thinkingBudget: 0 }, { thinkingLevel: 'minimal' }, undefined]);
  assert.equal(fetchImpl.calls[2].generationConfig.temperature, 0.2);
});

test('generate does not retry other errors such as high demand', async () => {
  const fetchImpl = failThenOk([[503, 'This model is currently experiencing high demand.']]);
  const body = { generationConfig: { thinkingConfig: { thinkingBudget: 0 } } };
  await assert.rejects(generate({ apiKey: 'k', model: 'm', body, fetchImpl }), (e) => e.code === 'other');
  assert.equal(fetchImpl.calls.length, 1);
});

test('generate gives up after the timeout with code timeout', async () => {
  const hang = (url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  });
  await assert.rejects(
    generate({ apiKey: 'k', model: 'm', body: {}, fetchImpl: hang, timeoutMs: 20 }),
    (e) => e instanceof GeminiError && e.code === 'timeout'
  );
});

test('buildImageBody sends the picture and asks for ok + word card fields', () => {
  const body = buildImageBody('QUJD', 'image/jpeg');
  const parts = body.contents[0].parts;
  assert.deepEqual(parts.find((p) => p.inlineData).inlineData, { mimeType: 'image/jpeg', data: 'QUJD' });
  assert.match(parts.find((p) => p.text).text, /not enough/i);
  const required = body.generationConfig.responseSchema.required;
  for (const field of ['ok', 'reason', 'word', 'meaning_vi']) assert.ok(required.includes(field), field);
  assert.deepEqual(body.generationConfig.thinkingConfig, { thinkingBudget: 0 });
});

test('parseImageResult returns the word card when the picture is good', () => {
  const card = parseImageResult({ ok: true, word: 'look up', meaning_vi: 'tra cứu', ipa: '/lʊk ʌp/' });
  assert.equal(card.word, 'look up');
  assert.equal(card.meaning_vi, 'tra cứu');
  assert.equal(card.example_en, '');
});

test('parseImageResult rejects pictures without enough information', () => {
  const isNotEnough = (e) => e instanceof GeminiError && e.code === 'not_enough_info';
  assert.throws(() => parseImageResult({ ok: false, reason: 'The picture is a menu bar.' }), (e) => isNotEnough(e) && /menu bar/.test(e.message));
  assert.throws(() => parseImageResult({ ok: true, word: '', meaning_vi: 'x' }), isNotEnough);
  assert.throws(() => parseImageResult({ ok: 'true', word: 'a', meaning_vi: '' }), isNotEnough);
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
