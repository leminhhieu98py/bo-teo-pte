// Hidden page that runs slow network work (Gemini can take > 30s), which would get the
// extension service worker terminated. Only chrome.runtime is available here.
import { runSaveJob } from '../lib/save.js';

const HEARTBEAT_MS = 15000;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== 'offscreen' || message.type !== 'save-word') return;
  sendResponse({ accepted: true });
  handleSave(message.job);
});

async function handleSave(job) {
  // Messages from an offscreen document reset the service worker idle timer.
  const beat = setInterval(() => chrome.runtime.sendMessage({ type: 'keepalive' }).catch(() => {}), HEARTBEAT_MS);
  try {
    const result = await runSaveJob(job);
    // A new message also revives the service worker if it went dormant meanwhile.
    await chrome.runtime.sendMessage({ type: 'save-result', tabId: job.tabId, result }).catch(() => {});
  } finally {
    clearInterval(beat);
  }
}
