import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downsample, encodeWav, bytesToBase64 } from '../lib/wav.js';

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

test('bytesToBase64 matches Buffer encoding for large input', () => {
  const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
  assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString('base64'));
});
