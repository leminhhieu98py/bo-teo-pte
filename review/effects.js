// Confetti, little sounds and floating XP.

const COLORS = ['#7C5CFF', '#FF8FB1', '#FFC94D', '#2FC79A', '#5BC8FF'];
let particles = [];
let running = false;

export function confetti(canvas, { count = 80, originY = 0.35, spread = 1 } = {}) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const cx = window.innerWidth / 2;
  const cy = window.innerHeight * originY;
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * spread;
    const speed = 6 + Math.random() * 9;
    particles.push({
      x: cx + (Math.random() - 0.5) * 80,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 7,
      color: COLORS[i % COLORS.length],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      round: Math.random() < 0.35,
      life: 0,
    });
  }
  if (running) return;
  running = true;

  const step = () => {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    particles = particles.filter((p) => p.y < window.innerHeight + 40 && p.life < 260);
    for (const p of particles) {
      p.life++;
      p.vy += 0.28;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    if (particles.length) {
      requestAnimationFrame(step);
    } else {
      running = false;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  };
  requestAnimationFrame(step);
}

let audioCtx = null;
let muted = false;

export function setMuted(value) {
  muted = Boolean(value);
}

function tone(freq, start, duration, { type = 'sine', gain = 0.18 } = {}) {
  audioCtx = audioCtx || new AudioContext();
  const t0 = audioCtx.currentTime + start;
  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(amp).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

const SOUNDS = {
  correct: () => { tone(660, 0, 0.18); tone(990, 0.1, 0.25); },
  wrong: () => { tone(300, 0, 0.18, { type: 'triangle', gain: 0.12 }); tone(240, 0.12, 0.25, { type: 'triangle', gain: 0.12 }); },
  pass: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.3)); },
  combo: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.25, { type: 'square', gain: 0.06 })); },
  start: () => { tone(880, 0, 0.12, { gain: 0.1 }); },
  fanfare: () => { [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.35, { type: 'triangle', gain: 0.16 })); },
};

export function playSound(name) {
  if (muted || !SOUNDS[name]) return;
  try {
    SOUNDS[name]();
  } catch {
    // Audio is optional.
  }
}

export function floatXp(el, anchor, text) {
  const rect = anchor.getBoundingClientRect();
  el.textContent = text;
  el.style.left = `${rect.left + rect.width / 2 - 40}px`;
  el.style.top = `${rect.top - 10}px`;
  el.classList.remove('go');
  void el.offsetWidth; // restart animation
  el.classList.add('go');
}
