import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downsample, encodeWav, bytesToBase64, voicedSeconds } from '../lib/wav.js';

function ascii(bytes, from, to) {
  return String.fromCharCode(...bytes.slice(from, to));
}

test('encodeWav writes a 16-bit mono PCM header', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const bytes = encodeWav(samples, 16000);
  const view = new DataView(bytes.buffer);
  assert.equal(bytes.length, 44 + samples.length * 2);
  assert.equal(ascii(bytes, 0, 4), 'RIFF');
  assert.equal(ascii(bytes, 8, 12), 'WAVE');
  assert.equal(ascii(bytes, 36, 40), 'data');
  assert.equal(view.getUint32(4, true), 36 + samples.length * 2);
  assert.equal(view.getUint16(22, true), 1); // mono
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getInt16(44 + 3 * 2, true), 32767);
  assert.equal(view.getInt16(44 + 4 * 2, true), -32768);
});

test('downsample reduces the sample count by the rate ratio', () => {
  const input = new Float32Array(48000).fill(0.25);
  const out = downsample(input, 48000, 16000);
  assert.equal(out.length, 16000);
  assert.ok(Math.abs(out[100] - 0.25) < 1e-6);
});

test('downsample returns the input when rates match', () => {
  const input = new Float32Array([0.1, 0.2]);
  assert.equal(downsample(input, 16000, 16000), input);
});

test('voicedSeconds is zero for silence, clicks and quiet room noise', () => {
  const rate = 16000;
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  const silence = new Float32Array(rate * 0.4);
  const click = new Float32Array(rate * 0.35).map((_, i) => (i > 800 && i < 900 ? rnd() * 0.8 : rnd() * 0.01));
  const noise = new Float32Array(rate * 0.5).map(() => rnd() * 0.02);
  assert.equal(voicedSeconds(silence, rate), 0);
  assert.ok(voicedSeconds(click, rate) <= 0.02);
  assert.equal(voicedSeconds(noise, rate), 0);
});

test('voicedSeconds measures how long someone is speaking', () => {
  const rate = 16000;
  const samples = new Float32Array(rate); // 1s: 0.3s silence, 0.5s voice-like tone, 0.2s silence
  for (let i = rate * 0.3; i < rate * 0.8; i++) samples[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / rate);
  const voiced = voicedSeconds(samples, rate);
  assert.ok(voiced >= 0.46 && voiced <= 0.54, String(voiced));
});

test('bytesToBase64 matches Buffer encoding for large input', () => {
  const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
  assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString('base64'));
});
