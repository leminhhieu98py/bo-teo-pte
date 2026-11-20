// Small inline SVG icons (no emoji, no external assets).
const wrap = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  speaker: wrap('<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>'),
  slow: wrap('<path d="M3 15c0-4 3.5-7 8-7s8 3 8 7z" fill="currentColor" opacity=".25"/><path d="M3 15c0-4 3.5-7 8-7s8 3 8 7z"/><path d="M19 13h2.5"/><path d="M6 15v3M16 15v3"/><path d="M8 11l3 4 3-4"/>'),
  mic: wrap('<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>'),
  stop: wrap('<rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor"/>'),
  soundOn: wrap('<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M17 9a4 4 0 0 1 0 6"/>'),
  soundOff: wrap('<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M17 9l4 6M21 9l-4 6"/>'),
};

export function starSvg(on) {
  return `<svg viewBox="0 0 24 24" class="${on ? 'on' : ''}" aria-hidden="true"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" fill="${on ? '#FFC94D' : '#EEE8FF'}" stroke="${on ? '#E59A00' : '#DDD4FF'}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}
