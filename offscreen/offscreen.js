// Hidden page that runs slow network work (Gemini can take > 30s), which would get the
// extension service worker terminated. Only chrome.runtime is available here.
import { runSaveJob, runImageJob } from '../lib/save.js';
import { cropPlan } from '../lib/capture.js';
import { bytesToBase64 } from '../lib/wav.js';

const HEARTBEAT_MS = 15000;
const JOBS = { 'save-word': runSaveJob, 'save-image': runCaptureJob };

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== 'offscreen' || !JOBS[message.type]) return;
  sendResponse({ accepted: true });
  handle(JOBS[message.type], message.job);
});

async function handle(run, job) {
  // Messages from an offscreen document reset the service worker idle timer.
  const beat = setInterval(() => chrome.runtime.sendMessage({ type: 'keepalive' }).catch(() => {}), HEARTBEAT_MS);
  try {
    const result = await run(job);
    // A new message also revives the service worker if it went dormant meanwhile.
    await chrome.runtime.sendMessage({ type: 'save-result', tabId: job.tabId, result }).catch(() => {});
  } finally {
    clearInterval(beat);
  }
}

// Crops the dragged area out of the tab screenshot, then lets Gemini read it.
async function runCaptureJob({ dataUrl, rect, url, settings }) {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const plan = cropPlan(rect, rect.viewportWidth, bitmap.width, bitmap.height);
  if (!plan) {
    return { ok: false, error: { name: 'CaptureError', code: 'too_small', status: 0, message: 'Selected area is too small', model: '', where: 'save-image', word: '' } };
  }
  const canvas = new OffscreenCanvas(plan.dw, plan.dh);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, plan.dw, plan.dh);
  ctx.drawImage(bitmap, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, plan.dw, plan.dh);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  const base64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
  return runImageJob({ base64, mimeType: 'image/jpeg', url, settings });
}
