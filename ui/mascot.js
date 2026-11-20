// Mochi the cat, drawn as inline SVG with a few moods.

const EYES = {
  happy: '<path d="M70 100 q12 -14 24 0" /><path d="M126 100 q12 -14 24 0" />',
  idle: '<circle cx="82" cy="100" r="9" fill="#3D2B78" stroke="none"/><circle cx="138" cy="100" r="9" fill="#3D2B78" stroke="none"/><circle cx="85" cy="96" r="3" fill="#fff" stroke="none"/><circle cx="141" cy="96" r="3" fill="#fff" stroke="none"/>',
  wow: '<circle cx="82" cy="98" r="12" fill="#3D2B78" stroke="none"/><circle cx="138" cy="98" r="12" fill="#3D2B78" stroke="none"/><circle cx="86" cy="93" r="4" fill="#fff" stroke="none"/><circle cx="142" cy="93" r="4" fill="#fff" stroke="none"/>',
  think: '<path d="M72 100 h20" /><circle cx="138" cy="98" r="9" fill="#3D2B78" stroke="none"/><circle cx="141" cy="94" r="3" fill="#fff" stroke="none"/>',
  oops: '<path d="M72 92 l18 10 M72 108 l18 -6" /><path d="M148 92 l-18 10 M148 108 l-18 -6" />',
  listen: '<path d="M70 102 q12 8 24 0" /><path d="M126 102 q12 8 24 0" />',
};

const MOUTHS = {
  happy: '<path d="M96 122 q14 18 28 0" fill="#FF7A9C" stroke="#3D2B78"/>',
  idle: '<path d="M98 120 q6 7 12 0 q6 7 12 0" fill="none"/>',
  wow: '<ellipse cx="110" cy="126" rx="10" ry="12" fill="#FF7A9C" stroke="#3D2B78"/>',
  think: '<path d="M102 124 h16" />',
  oops: '<path d="M98 128 q12 -10 24 0" fill="none"/>',
  listen: '<circle cx="110" cy="124" r="6" fill="#FF7A9C" stroke="#3D2B78"/>',
};

export const MOODS = Object.keys(EYES);

export function mascotSvg(mood = 'idle') {
  const m = EYES[mood] ? mood : 'idle';
  const extra = m === 'think'
    ? '<g fill="#C9BCFF" stroke="none"><circle cx="190" cy="40" r="10"/><circle cx="172" cy="62" r="6"/></g>'
    : m === 'happy' || m === 'wow'
      ? '<g fill="#FFC94D" stroke="none"><path d="M30 40 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z"/><path d="M190 30 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/></g>'
      : m === 'listen'
        ? '<g fill="none" stroke="#7C5CFF" stroke-width="5" stroke-linecap="round"><path d="M196 90 q10 20 0 40"/><path d="M208 80 q18 30 0 60"/></g>'
        : '';
  return `
<svg viewBox="0 0 220 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <ellipse cx="110" cy="190" rx="60" ry="8" fill="#3D2B78" opacity=".08"/>
  <path d="M48 70 L58 14 L96 46 Z" fill="#FFF7EC" stroke="#3D2B78" stroke-width="5" stroke-linejoin="round"/>
  <path d="M172 70 L162 14 L124 46 Z" fill="#FFF7EC" stroke="#3D2B78" stroke-width="5" stroke-linejoin="round"/>
  <path d="M60 56 L64 30 L82 46 Z" fill="#FF9EBE"/>
  <path d="M160 56 L156 30 L138 46 Z" fill="#FF9EBE"/>
  <ellipse cx="110" cy="112" rx="82" ry="72" fill="#FFF7EC" stroke="#3D2B78" stroke-width="5"/>
  <ellipse cx="58" cy="128" rx="14" ry="8" fill="#FF9EBE" opacity=".8"/>
  <ellipse cx="162" cy="128" rx="14" ry="8" fill="#FF9EBE" opacity=".8"/>
  <g stroke="#3D2B78" stroke-width="5" stroke-linecap="round" fill="none">${EYES[m]}</g>
  <g stroke="#3D2B78" stroke-width="4" stroke-linecap="round">${MOUTHS[m]}</g>
  ${extra}
</svg>`;
}

export function setMood(el, mood) {
  if (!el) return;
  el.innerHTML = mascotSvg(mood);
  el.dataset.mood = mood;
}
