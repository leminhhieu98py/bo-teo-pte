// Gemini REST client: word enrichment and pronunciation grading. Flash models only.
import { PASS_SCORE } from './card.js';
import { toBool } from './daily.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const EXCLUDED = /(lite|tts|image|live|embedding|audio|thinking)/i;
const UNSTABLE = /(preview|exp|latest)/i;

export class GeminiError extends Error {
  constructor(message, code = 'other') {
    super(message);
    this.name = 'GeminiError';
    this.code = code;
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
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: Object.fromEntries(ENRICH_FIELDS.map((f) => [f, { type: 'STRING' }])),
        required: ENRICH_FIELDS,
      },
    },
  };
}

export function parseEnrich(obj, fallbackWord) {
  const out = {};
  for (const field of ENRICH_FIELDS) out[field] = String(obj?.[field] ?? '').trim();
  if (!out.word) out.word = String(fallbackWord ?? '').trim();
  if (!out.meaning_vi) throw new GeminiError('Gemini did not return a Vietnamese meaning');
  return out;
}

export function buildGradeBody(word, ipa, wavBase64) {
  const prompt = [
    'You are a kind but honest English pronunciation teacher for a Vietnamese teenager.',
    `The learner tried to say the English word or phrase: "${word}"${ipa ? ` (target IPA ${ipa})` : ''}.`,
    'Listen to the audio and grade it. Focus most on:',
    '1. Word stress: is the stressed syllable the correct one? This matters a lot.',
    '2. Each sound: vowels, final consonants (Vietnamese speakers often drop them), th, r, l, s/sh, z.',
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

export function parseGrade(obj) {
  const n = Number(obj?.score);
  const score = Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
  const stressCorrect = toBool(obj?.stress_correct);
  return {
    heard: String(obj?.heard ?? ''),
    score,
    stressCorrect,
    soundsFeedback: String(obj?.sounds_feedback_vi ?? ''),
    stressFeedback: String(obj?.stress_feedback_vi ?? ''),
    tip: String(obj?.tip_vi ?? ''),
    passed: score >= PASS_SCORE && stressCorrect,
  };
}

async function readError(res) {
  let message = `Gemini HTTP ${res.status}`;
  try {
    const data = await res.json();
    message = data?.error?.message || data?.error?.status || message;
  } catch { /* keep default message */ }
  if (res.status === 429) return new GeminiError(message, 'quota');
  if (res.status === 401 || res.status === 403 || /api key/i.test(message)) return new GeminiError(message, 'auth');
  return new GeminiError(message, 'other');
}

export async function generate({ apiKey, model, body, fetchImpl = fetch }) {
  const res = await fetchImpl(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) throw new GeminiError('Gemini returned an empty answer');
  return extractJson(text);
}

export async function listModels({ apiKey, fetchImpl = fetch }) {
  const res = await fetchImpl(`${API_BASE}/models?pageSize=1000`, {
    method: 'GET',
    headers: { 'x-goog-api-key': apiKey },
  });
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  return data?.models || [];
}

export async function enrichWord({ apiKey, model, word, context, fetchImpl }) {
  const obj = await generate({ apiKey, model, body: buildEnrichBody(word, context), fetchImpl });
  return parseEnrich(obj, word);
}

export async function gradePronunciation({ apiKey, model, word, ipa, wavBase64, fetchImpl }) {
  const obj = await generate({ apiKey, model, body: buildGradeBody(word, ipa, wavBase64), fetchImpl });
  return parseGrade(obj);
}
