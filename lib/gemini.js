// Gemini REST client: word enrichment and pronunciation grading. Flash models only.
import { PASS_SCORE } from './card.js';
import { toBool } from './daily.js';
import { timeoutSignal } from './timeout.js';
import { normalize, levenshtein } from './answer.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
export const DEFAULT_TIMEOUT_MS = 60000;
// Grading must feel quick: both calls (transcribe + grade) share this budget.
export const GRADE_TIMEOUT_MS = 15000;
const NO_THINKING = { thinkingBudget: 0 };
// Models differ in which "thinking off" setting they accept; try these in order on HTTP 400.
const THINKING_FALLBACKS = [{ thinkingLevel: 'minimal' }, null];
const EXCLUDED = /(tts|image|live|embedding|audio|thinking)/i;
const UNSTABLE = /(preview|exp|latest)/i;

export class GeminiError extends Error {
  constructor(message, code = 'other', status = 0) {
    super(message);
    this.name = 'GeminiError';
    this.code = code;
    this.status = status;
  }
}

export function filterFlashModels(models) {
  return (models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name).replace(/^models\//, ''))
    .filter((name) => /flash/i.test(name) && !EXCLUDED.test(name));
}

function versionOf(name) {
  const match = name.match(/gemini-(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : 0;
}

export function pickDefaultModel(models) {
  const names = filterFlashModels(models);
  if (names.length === 0) return null;
  if (names.includes(DEFAULT_MODEL)) return DEFAULT_MODEL;
  const rank = (name) => [UNSTABLE.test(name) ? 0 : 1, versionOf(name), -name.length];
  return [...names].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return rb[i] - ra[i];
    return 0;
  })[0];
}

export function extractJson(text) {
  const raw = String(text ?? '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new GeminiError('Gemini did not return JSON');
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new GeminiError('Gemini returned invalid JSON');
  }
}

const ENRICH_FIELDS = ['word', 'ipa', 'part_of_speech', 'meaning_vi', 'description_vi', 'example_en', 'example_vi'];

export function buildEnrichBody(word, context) {
  const prompt = [
    'You help a Vietnamese teenager learn English vocabulary.',
    `The learner selected this English word or phrase: "${word}".`,
    context ? `It appeared in this sentence: "${context}". Use the meaning that fits this sentence.` : '',
    'Return JSON with:',
    '- word: the dictionary form (lemma) in lowercase unless it is a proper noun; keep phrases as phrases.',
    '- ipa: American English IPA with stress marks, between slashes.',
    '- part_of_speech: short English label, e.g. noun, verb, adjective, phrasal verb.',
    '- meaning_vi: short Vietnamese meaning (a few words).',
    '- description_vi: one simple Vietnamese sentence explaining when to use it.',
    '- example_en: one short, natural English example sentence that contains the word.',
    '- example_vi: Vietnamese translation of example_en.',
  ].filter(Boolean).join('\n');

  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      thinkingConfig: NO_THINKING,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: Object.fromEntries(ENRICH_FIELDS.map((f) => [f, { type: 'STRING' }])),
        required: ENRICH_FIELDS,
      },
    },
  };
}

// Letters that only Vietnamese uses (é in café stays allowed).
const VIETNAMESE = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i;

// Gemini sometimes puts the Vietnamese description into example_en: an English example must not
// contain Vietnamese letters, otherwise it is left empty.
function englishOnly(text) {
  return VIETNAMESE.test(text) ? '' : text;
}

export function parseEnrich(obj, fallbackWord) {
  const out = {};
  for (const field of ENRICH_FIELDS) out[field] = String(obj?.[field] ?? '').trim();
  if (!out.word) out.word = String(fallbackWord ?? '').trim();
  out.example_en = englishOnly(out.example_en);
  if (!out.meaning_vi) throw new GeminiError('Gemini did not return a Vietnamese meaning');
  return out;
}

export function buildImageBody(base64, mimeType = 'image/jpeg') {
  const prompt = [
    'You help a Vietnamese teenager learn English vocabulary.',
    'The picture is a screenshot from an English-learning website. It should show ONE English word',
    'or short phrase together with an explanation (for example a dictionary popup).',
    'Use the information in the picture as the source of truth:',
    '- word: the English word/phrase being explained, as shown.',
    '- meaning_vi: the meaning from the picture. If the picture explains it only in English,',
    '  translate that explanation into short Vietnamese. Do not invent a different sense.',
    '- description_vi: one simple Vietnamese sentence based on the explanation in the picture.',
    '- ipa, part_of_speech, example_en, example_vi: take them from the picture when present;',
    '  otherwise give a short, correct one (American IPA with stress marks).',
    'If the picture does not clearly show one English word or phrase with its explanation',
    '(blurry, cut off, unrelated, several words), there is not enough information:',
    'set ok=false, explain why in reason (short English) and leave the other fields empty.',
    'Otherwise set ok=true and reason="".',
  ].join('\n');

  return {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inlineData: { mimeType, data: base64 } },
      ],
    }],
    generationConfig: {
      temperature: 0.2,
      thinkingConfig: NO_THINKING,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          ok: { type: 'BOOLEAN' },
          reason: { type: 'STRING' },
          ...Object.fromEntries(ENRICH_FIELDS.map((f) => [f, { type: 'STRING' }])),
        },
        required: ['ok', 'reason', ...ENRICH_FIELDS],
      },
    },
  };
}

export function parseImageResult(obj) {
  const reason = String(obj?.reason ?? '').trim();
  const notEnough = (why) => new GeminiError(`Not enough information in the picture${why ? `: ${why}` : ''}`, 'not_enough_info');
  if (!toBool(obj?.ok)) throw notEnough(reason);
  const out = {};
  for (const field of ENRICH_FIELDS) out[field] = String(obj?.[field] ?? '').trim();
  out.example_en = englishOnly(out.example_en);
  if (!out.word || !out.meaning_vi) throw notEnough(reason || 'no word or meaning found');
  return out;
}

export async function enrichFromImage({ apiKey, model, base64, mimeType, fetchImpl }) {
  const obj = await generate({ apiKey, model, body: buildImageBody(base64, mimeType), fetchImpl });
  return parseImageResult(obj);
}

export function buildGradeBody(word, ipa, wavBase64) {
  const prompt = [
    'You are a kind but honest English pronunciation teacher for a Vietnamese teenager.',
    `The learner tried to say the English word or phrase: "${word}"${ipa ? ` (target IPA ${ipa})` : ''}.`,
    'Listen to the audio and grade it. Focus most on:',
    '1. Word stress: is the stressed syllable the correct one? This matters a lot.',
    '2. Each sound: vowels, final consonants (Vietnamese speakers often drop them), th, r, l, s/sh, z.',
    'First write in "heard" exactly what the voice in the audio says. Do not guess from the target word.',
    'If there is no human voice (silence, clicks, background noise) or it is too short to understand,',
    'set heard to "" and score to 0.',
    'Rules for score (0-100):',
    '- If you hear a different word, silence, or noise only: score <= 30.',
    '- If the word stress is wrong: stress_correct = false and score <= 65.',
    '- 90+ only for clear, natural pronunciation with correct stress.',
    'For one-syllable words, stress_correct is true when the word is recognisable.',
    'Write all feedback in simple, friendly Vietnamese, max 2 short sentences each.',
    'Return JSON with: heard (what you heard, in English), score (integer), stress_correct (boolean),',
    'sounds_feedback_vi, stress_feedback_vi, tip_vi (one concrete tip to improve).',
  ].join('\n');

  return {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inlineData: { mimeType: 'audio/wav', data: wavBase64 } },
      ],
    }],
    generationConfig: {
      temperature: 0.2,
      thinkingConfig: NO_THINKING,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          heard: { type: 'STRING' },
          score: { type: 'INTEGER' },
          stress_correct: { type: 'BOOLEAN' },
          sounds_feedback_vi: { type: 'STRING' },
          stress_feedback_vi: { type: 'STRING' },
          tip_vi: { type: 'STRING' },
        },
        required: ['heard', 'score', 'stress_correct', 'sounds_feedback_vi', 'stress_feedback_vi', 'tip_vi'],
      },
    },
  };
}

// Does what Gemini heard look like the target word? Allows small spelling differences.
export function heardMatches(heard, target) {
  const h = normalize(heard);
  const t = normalize(target);
  if (!h || !t) return false;
  if (` ${h} `.includes(` ${t} `)) return true;
  return levenshtein(h, t) <= Math.max(1, Math.floor(t.length * 0.3));
}

// With a target word, passing also requires that Gemini heard that word (guards against the
// model "hearing" the target in silence).
export function parseGrade(obj, target) {
  const n = Number(obj?.score);
  let score = Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
  const stressCorrect = toBool(obj?.stress_correct);
  const heard = String(obj?.heard ?? '').trim();
  if (target !== undefined && !heard) score = 0;
  const heardOk = target === undefined || heardMatches(heard, target);
  return {
    heard,
    score,
    stressCorrect,
    soundsFeedback: String(obj?.sounds_feedback_vi ?? ''),
    stressFeedback: String(obj?.stress_feedback_vi ?? ''),
    tip: String(obj?.tip_vi ?? ''),
    passed: score >= PASS_SCORE && stressCorrect && heardOk,
  };
}

async function readError(res) {
  let message = `Gemini HTTP ${res.status}`;
  try {
    const data = await res.json();
    message = data?.error?.message || data?.error?.status || message;
  } catch { /* keep default message */ }
  if (res.status === 429) return new GeminiError(message, 'quota', res.status);
  if (res.status === 401 || res.status === 403 || /api key/i.test(message)) return new GeminiError(message, 'auth', res.status);
  return new GeminiError(message, 'other', res.status);
}

// fetch + read JSON with a time limit (the signal also covers reading the body).
async function request(url, init, { fetchImpl, timeoutMs }) {
  const { signal, done } = timeoutSignal(timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal });
    if (!res.ok) throw await readError(res);
    return await res.json();
  } catch (err) {
    if (err instanceof GeminiError) throw err;
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError' || signal.aborted) {
      throw new GeminiError(`Gemini did not answer within ${Math.round(timeoutMs / 1000)}s`, 'timeout');
    }
    throw new GeminiError(`Cannot reach Gemini: ${err?.message || err}`, 'network');
  } finally {
    done();
  }
}

// The model rejected our thinking setting (HTTP 400): try the other variants, then none.
async function retryThinking(send, body, firstError) {
  const { thinkingConfig, ...rest } = body.generationConfig;
  let lastError = firstError;
  for (const fallback of THINKING_FALLBACKS) {
    const generationConfig = fallback ? { ...rest, thinkingConfig: fallback } : rest;
    try {
      return await send({ ...body, generationConfig });
    } catch (err) {
      if (!(err.status === 400 && err.code === 'other')) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

export async function generate({ apiKey, model, body, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const url = `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`;
  const send = (payload) => request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(payload),
  }, { fetchImpl, timeoutMs });

  let data;
  try {
    data = await send(body);
  } catch (err) {
    const config = body?.generationConfig;
    if (!(err.status === 400 && err.code === 'other' && config?.thinkingConfig)) throw err;
    data = await retryThinking(send, body, err);
  }
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) throw new GeminiError('Gemini returned an empty answer');
  return extractJson(text);
}

export async function listModels({ apiKey, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const data = await request(`${API_BASE}/models?pageSize=1000`, {
    method: 'GET',
    headers: { 'x-goog-api-key': apiKey },
  }, { fetchImpl, timeoutMs });
  return data?.models || [];
}

export async function enrichWord({ apiKey, model, word, context, fetchImpl }) {
  const obj = await generate({ apiKey, model, body: buildEnrichBody(word, context), fetchImpl });
  return parseEnrich(obj, word);
}

// Step 1 of grading: transcribe WITHOUT telling the model the target word. When the target is in
// the prompt, Gemini "hears" it even in silence (measured: silence scored 90-95).
export function buildTranscribeBody(wavBase64) {
  const prompt = [
    'Transcribe the English word or words spoken in this audio, exactly as heard.',
    'If there is no clear human speech (silence, noise, humming, a vowel sound only),',
    'return an empty string. Do not guess.',
  ].join(' ');
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'audio/wav', data: wavBase64 } }] }],
    generationConfig: {
      temperature: 0,
      thinkingConfig: NO_THINKING,
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { heard: { type: 'STRING' } }, required: ['heard'] },
    },
  };
}

export async function gradePronunciation({ apiKey, model, word, ipa, wavBase64, fetchImpl, timeoutMs = GRADE_TIMEOUT_MS }) {
  const deadline = Date.now() + timeoutMs;
  const left = () => {
    const ms = deadline - Date.now();
    if (ms <= 0) throw new GeminiError(`Gemini did not answer within ${Math.round(timeoutMs / 1000)}s`, 'timeout');
    return ms;
  };
  const transcript = await generate({ apiKey, model, body: buildTranscribeBody(wavBase64), fetchImpl, timeoutMs: left() });
  const heard = String(transcript?.heard ?? '').trim();
  if (!heardMatches(heard, word)) {
    return {
      heard,
      score: heard ? 10 : 0,
      stressCorrect: false,
      soundsFeedback: heard ? `Mochi nghe thấy "${heard}" chứ chưa phải "${word}".` : 'Mochi chưa nghe rõ em nói gì.',
      stressFeedback: '',
      tip: 'Hãy bấm loa nghe mẫu, rồi đọc rõ cả từ gần mic nhé.',
      passed: false,
    };
  }
  // Step 2: the voice said the word, now grade sounds and stress.
  const obj = await generate({ apiKey, model, body: buildGradeBody(word, ipa, wavBase64), fetchImpl, timeoutMs: left() });
  return { ...parseGrade({ ...obj, heard }, word), heard };
}
