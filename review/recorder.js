// Records the learner's voice and returns a 16 kHz mono WAV as base64.
import { downsample, encodeWav, bytesToBase64, voicedSeconds } from '../lib/wav.js';

const TARGET_RATE = 16000;

export class Recorder {
  constructor({ onLevel } = {}) {
    this.onLevel = onLevel;
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.meterCtx = null;
    this.raf = 0;
  }

  get recording() {
    return this.mediaRecorder?.state === 'recording';
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.mediaRecorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.mediaRecorder.start();
    this.startMeter();
  }

  startMeter() {
    if (!this.onLevel) return;
    this.meterCtx = new AudioContext();
    const analyser = this.meterCtx.createAnalyser();
    analyser.fftSize = 512;
    this.meterCtx.createMediaStreamSource(this.stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
      this.onLevel(peak);
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  stopMeter() {
    cancelAnimationFrame(this.raf);
    this.meterCtx?.close();
    this.meterCtx = null;
    this.onLevel?.(0);
  }

  // Returns { wavBase64, peak, seconds }.
  async stop() {
    if (!this.mediaRecorder) throw new Error('Not recording');
    const stopped = new Promise((resolve) => { this.mediaRecorder.onstop = resolve; });
    this.mediaRecorder.stop();
    await stopped;
    this.stopMeter();
    this.stream.getTracks().forEach((t) => t.stop());

    const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
    this.mediaRecorder = null;
    const decodeCtx = new AudioContext();
    try {
      const audio = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
      const samples = downsample(audio.getChannelData(0), audio.sampleRate, TARGET_RATE);
      let peak = 0;
      for (const s of samples) peak = Math.max(peak, Math.abs(s));
      return {
        wavBase64: bytesToBase64(encodeWav(samples, TARGET_RATE)),
        peak,
        seconds: samples.length / TARGET_RATE,
        voiced: voicedSeconds(samples, TARGET_RATE),
      };
    } finally {
      decodeCtx.close();
    }
  }

  cancel() {
    try {
      this.mediaRecorder?.stop();
    } catch { /* already stopped */ }
    this.stopMeter();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.mediaRecorder = null;
  }
}
