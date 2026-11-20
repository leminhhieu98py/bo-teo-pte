// Reference pronunciation using the voices built into macOS / Chrome.

const PREFERRED = ['Google US English', 'Samantha', 'Alex', 'Ava', 'Allison'];
let voicePromise = null;

function loadVoices() {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) return resolve(voices);
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

async function pickVoice() {
  const voices = await loadVoices();
  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  for (const name of PREFERRED) {
    const hit = english.find((v) => v.name.startsWith(name) && v.lang === 'en-US');
    if (hit) return hit;
  }
  return english.find((v) => v.lang === 'en-US') || english[0] || null;
}

export function speak(text, { rate = 1, onEnd } = {}) {
  voicePromise = voicePromise || pickVoice();
  voicePromise.then((voice) => {
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    if (voice) utter.voice = voice;
    utter.lang = voice?.lang || 'en-US';
    utter.rate = rate;
    utter.onend = () => onEnd?.();
    utter.onerror = () => onEnd?.();
    speechSynthesis.speak(utter);
  });
}
