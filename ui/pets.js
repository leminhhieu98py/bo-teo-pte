// The pets: Mochi and 20 shop pets (10 personalities x boy/girl), drawn as inline SVG.
//
// Every pet is drawn by hand (its own silhouette, ears, fur and accessories) on the same frame as Mochi
// (viewBox 0 0 220 200, ink outline #3D2B78 width 5). Faces share one expression grammar taken from Mochi,
// tuned per personality, so every pet has all 8 moods. Animations live in ui/theme.css (.pet ...):
// .eyes blink, .ears wiggle (listen), .wave waves (bye), .tear falls (sad), .head tilts (think),
// .sparkle twinkles, .float floats.

export const PET_MOODS = ['idle', 'happy', 'oops', 'think', 'wow', 'listen', 'bye', 'sad'];

const INK = '#3D2B78';
const PINK = '#FF9EBE';
const TONGUE = '#FF7A9C';
const LINE = `stroke="${INK}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"`;
const THIN = `stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;

// ---------- face grammar (from Mochi: eyes at cx +/- gap, mouth at my) ----------

function dotEye(x, y, { r = 9, ink = INK, hl = '#fff' } = {}) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${ink}" stroke="none"/><circle cx="${x + r / 3}" cy="${y - r / 2.2}" r="${Math.max(2.5, r / 3)}" fill="${hl}" stroke="none"/>`;
}

function sparkleEye(x, y, o) {
  return `<circle cx="${x}" cy="${y}" r="11" fill="${o.ink}" stroke="none"/><circle cx="${x + 4}" cy="${y - 5}" r="4.5" fill="${o.hl}" stroke="none"/><circle cx="${x - 4}" cy="${y + 4}" r="2" fill="${o.hl}" stroke="none"/>`;
}

function lashes(lx, rx, y) {
  return `<g stroke="${INK}" stroke-width="3.5" stroke-linecap="round" fill="none">`
    + `<path d="M${lx - 9} ${y - 7} l-6 -5"/><path d="M${lx - 3} ${y - 10} l-3 -6"/>`
    + `<path d="M${rx + 9} ${y - 7} l6 -5"/><path d="M${rx + 3} ${y - 10} l3 -6"/></g>`;
}

function openEyes(f, { r = 9, y = f.ey } = {}) {
  if (f.style === 'sparkle') return sparkleEye(f.lx, y, f) + sparkleEye(f.rx, y, f);
  return dotEye(f.lx, y, { r, ink: f.ink, hl: f.hl }) + dotEye(f.rx, y, { r, ink: f.ink, hl: f.hl });
}

const arcUp = (x, y, ink) => `<path d="M${x - 12} ${y} q12 -14 24 0" stroke="${ink}" fill="none"/>`;
const arcDown = (x, y, ink) => `<path d="M${x - 12} ${y + 2} q12 8 24 0" stroke="${ink}" fill="none"/>`;

function eyesFor(f, mood) {
  const { lx, rx, ey, ink } = f;
  const girlLashes = f.lashes ? lashes(lx, rx, ey) : '';
  // Personality looks for the calm moods.
  if (mood === 'idle') {
    if (f.style === 'crossed') {
      return `<g ${THIN} fill="#fff"><circle cx="${lx}" cy="${ey}" r="13"/><circle cx="${rx}" cy="${ey}" r="13"/></g>`
        + `<circle cx="${lx + 6}" cy="${ey + 2}" r="6" fill="${INK}"/><circle cx="${rx - 6}" cy="${ey + 2}" r="6" fill="${INK}"/>${girlLashes}`;
    }
    if (f.style === 'wobbly') {
      return `<g ${THIN} fill="#fff"><circle cx="${lx}" cy="${ey}" r="15"/><circle cx="${rx}" cy="${ey}" r="15"/></g>`
        + `<circle cx="${lx - 5}" cy="${ey - 5}" r="7" fill="${INK}"/><circle cx="${rx + 6}" cy="${ey + 5}" r="7" fill="${INK}"/>${girlLashes}`;
    }
    if (f.style === 'sleepy') {
      return `<g stroke="${ink}" fill="none"><path d="M${lx - 12} ${ey} q12 7 24 0"/><path d="M${rx - 12} ${ey} q12 7 24 0"/></g>${girlLashes}`;
    }
    if (f.style === 'proud') {
      return `${dotEye(lx, ey + 2, { r: 8, ink, hl: f.hl })}${dotEye(rx, ey + 2, { r: 8, ink, hl: f.hl })}`
        + `<g stroke="${INK}" fill="none"><path d="M${lx - 12} ${ey - 4} h24"/><path d="M${rx - 12} ${ey - 4} h24"/></g>${girlLashes}`;
    }
    if (f.style === 'shy') {
      return `${dotEye(lx - 3, ey + 4, { r: 8, ink, hl: f.hl })}${dotEye(rx - 3, ey + 4, { r: 8, ink, hl: f.hl })}${girlLashes}`;
    }
    if (f.style === 'buff') {
      return `${openEyes(f)}<g stroke="${INK}" fill="none"><path d="M${lx - 13} ${ey - 19} l22 7"/><path d="M${rx + 13} ${ey - 19} l-22 7"/></g>${girlLashes}`;
    }
    if (f.style === 'rebel') {
      return `${dotEye(lx, ey, { ink, hl: f.hl })}<path d="M${rx - 12} ${ey} h24" stroke="${ink}" fill="none"/>`
        + `<path d="M${lx - 13} ${ey - 18} q13 -9 26 0" stroke="${INK}" fill="none"/>${girlLashes}`;
    }
    return openEyes(f) + girlLashes;
  }
  if (mood === 'happy') return arcUp(lx, ey, ink) + arcUp(rx, ey, ink);
  if (mood === 'wow') {
    return `<circle cx="${lx}" cy="${ey - 2}" r="12" fill="${ink}" stroke="none"/><circle cx="${rx}" cy="${ey - 2}" r="12" fill="${ink}" stroke="none"/>`
      + `<circle cx="${lx + 4}" cy="${ey - 7}" r="4" fill="${f.hl}" stroke="none"/><circle cx="${rx + 4}" cy="${ey - 7}" r="4" fill="${f.hl}" stroke="none"/>${girlLashes}`;
  }
  if (mood === 'think') {
    return `<path d="M${lx - 10} ${ey} h20" stroke="${ink}" fill="none"/>${dotEye(rx + 2, ey - 3, { ink, hl: f.hl })}${f.lashes ? lashes(rx + 2, rx + 2, ey - 3).replace(/<path d="M[^"]*l-6 -5"\/><path d="M[^"]*l-3 -6"\/>/, '') : ''}`;
  }
  if (mood === 'oops') {
    return `<g stroke="${ink}" fill="none"><path d="M${lx - 10} ${ey - 8} l18 10 M${lx - 10} ${ey + 8} l18 -6"/><path d="M${rx + 10} ${ey - 8} l-18 10 M${rx + 10} ${ey + 8} l-18 -6"/></g>`;
  }
  if (mood === 'listen') return arcDown(lx, ey, ink) + arcDown(rx, ey, ink);
  if (mood === 'bye') return arcUp(lx, ey, ink) + dotEye(rx, ey, { ink, hl: f.hl }) + (f.lashes ? lashes(rx, rx, ey).replace(/<path d="M[^"]*l-6 -5"\/><path d="M[^"]*l-3 -6"\/>/, '') : '');
  // sad: eyes look down, brows tilt up in the middle
  return `${dotEye(lx, ey + 3, { r: 8, ink, hl: f.hl })}${dotEye(rx, ey + 3, { r: 8, ink, hl: f.hl })}`
    + `<g stroke="${INK}" fill="none"><path d="M${lx - 12} ${ey - 10} l22 -7"/><path d="M${rx + 12} ${ey - 10} l-22 -7"/></g>${girlLashes}`;
}

function mouthFor(f, mood) {
  const { cx, my } = f;
  if (mood === 'idle') {
    if (f.style === 'crossed') return `<path d="M${cx - 12} ${my} q6 7 12 0 q6 7 12 0" fill="none"/><path d="M${cx + 1} ${my + 4} q8 20 17 2" fill="${TONGUE}"/>`;
    if (f.style === 'wobbly') return `<path d="M${cx - 30} ${my - 4} q30 30 60 0 Z" fill="${TONGUE}"/><path d="M${cx - 24} ${my} h48" stroke="#fff" stroke-width="3"/>`;
    if (f.style === 'proud' || f.style === 'rebel') return `<path d="M${cx - 12} ${my + 4} q14 8 26 -6" fill="none"/>`;
    if (f.style === 'shy') return `<path d="M${cx - 8} ${my + 2} q4 -4 8 0 q4 4 8 0" fill="none"/>`;
    if (f.style === 'buff') return `<path d="M${cx - 16} ${my} q16 16 32 0 Z" fill="#fff"/><path d="M${cx - 12} ${my + 4} h24" stroke-width="2.5"/>`;
    if (f.style === 'sleepy') return `<ellipse cx="${cx}" cy="${my + 4}" rx="5" ry="4" fill="${TONGUE}"/>`;
    return `<path d="M${cx - 12} ${my} q6 7 12 0 q6 7 12 0" fill="none"/>`;
  }
  if (mood === 'happy') {
    const tongue = f.style === 'crossed' ? `<path d="M${cx + 2} ${my + 9} q7 16 14 0" fill="${TONGUE}"/>` : '';
    return `<path d="M${cx - 14} ${my + 2} q14 18 28 0" fill="${TONGUE}"/>${tongue}`;
  }
  if (mood === 'wow') return `<ellipse cx="${cx}" cy="${my + 6}" rx="10" ry="12" fill="${TONGUE}"/>`;
  if (mood === 'think') return `<path d="M${cx - 8} ${my + 5} q8 -4 16 -2" fill="none"/>`;
  if (mood === 'oops') return `<path d="M${cx - 13} ${my + 8} q6 -8 13 0 q6 8 13 0" fill="none"/>`;
  if (mood === 'listen') return `<circle cx="${cx}" cy="${my + 4}" r="6" fill="${TONGUE}"/>`;
  if (mood === 'bye') return `<path d="M${cx - 12} ${my} q12 14 24 0" fill="${TONGUE}"/>`;
  return `<path d="M${cx - 12} ${my + 9} q12 -11 24 0" fill="none"/>`;
}

// Glasses and shades sit on top of the eyes.
function eyewear(f, mood) {
  const { lx, rx, ey } = f;
  if (f.style === 'glasses') {
    return `<g stroke="${INK}" stroke-width="4" fill="#fff" fill-opacity=".18"><circle cx="${lx}" cy="${ey}" r="18"/><circle cx="${rx}" cy="${ey}" r="18"/></g>`
      + `<path d="M${lx + 18} ${ey - 2} q${(rx - lx - 36) / 2} -8 ${rx - lx - 36} 0" stroke="${INK}" stroke-width="4" fill="none"/>`;
  }
  if (f.style !== 'sunglasses') return '';
  const shades = (y, tilt = 0) => `<g transform="rotate(${tilt} ${(lx + rx) / 2} ${y})">`
    + `<path d="M${lx - 22} ${y - 10} h44 v8 q0 16 -22 16 q-22 0 -22 -16 Z" fill="#2D2250" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`
    + `<path d="M${rx - 22} ${y - 10} h44 v8 q0 16 -22 16 q-22 0 -22 -16 Z" fill="#2D2250" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`
    + `<path d="M${lx + 22} ${y - 8} h${rx - lx - 44}" stroke="${INK}" stroke-width="4"/>`
    + `<path d="M${lx - 14} ${y - 6} l8 0 M${rx - 14} ${y - 6} l8 0" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/></g>`;
  if (mood === 'wow') return shades(ey - 34); // pushed up: the big eyes show
  if (mood === 'oops') return shades(ey + 2, 10); // knocked crooked
  if (mood === 'happy' || mood === 'bye') return ''; // smiling eyes show
  return shades(ey);
}

function cheeks(f) {
  if (!f.cheeks) return '';
  const rx = f.style === 'shy' ? 18 : 14;
  return `<ellipse cx="${f.cx - f.gap - 24}" cy="${f.ey + 28}" rx="${rx}" ry="8" fill="${f.cheeks}" opacity=".8"/>`
    + `<ellipse cx="${f.cx + f.gap + 24}" cy="${f.ey + 28}" rx="${rx}" ry="8" fill="${f.cheeks}" opacity=".8"/>`;
}

function face(f, mood) {
  return `${cheeks(f)}<g class="eyes" stroke-width="5" stroke-linecap="round">${eyesFor(f, mood)}</g>${eyewear(f, mood)}`
    + `<g class="mouth" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${mouthFor(f, mood)}</g>`;
}

// ---------- extras per mood ----------

function star(x, y, s, fill = '#FFC94D') {
  return `<path class="sparkle" d="M${x} ${y - s} l${s * 0.3} ${s * 0.7} ${s * 0.7} ${s * 0.3} ${-s * 0.7} ${s * 0.3} ${-s * 0.3} ${s * 0.7} ${-s * 0.3} ${-s * 0.7} ${-s * 0.7} ${-s * 0.3} ${s * 0.7} ${-s * 0.3}z" fill="${fill}"/>`;
}

function extras(f, mood, paw) {
  const tearX = f.lx - 8;
  if (mood === 'happy') return star(28, 46, 10) + star(192, 36, 8);
  if (mood === 'wow') return star(24, 40, 12) + star(196, 30, 10) + star(200, 92, 7) + star(18, 98, 6);
  if (mood === 'think') return `<g class="float" fill="#C9BCFF"><circle cx="196" cy="44" r="10"/><circle cx="180" cy="66" r="6"/><circle cx="170" cy="80" r="3.5"/></g>`;
  if (mood === 'listen') return `<g class="float" fill="none" stroke="#7C5CFF" stroke-width="5" stroke-linecap="round"><path d="M196 92 q10 20 0 40"/><path d="M208 82 q16 30 0 60"/></g>`;
  if (mood === 'oops') return `<path class="float" d="M186 54 q8 12 0 18 q-8 -6 0 -18z" fill="#8FD3FF" stroke="${INK}" stroke-width="3"/>`;
  if (mood === 'sad') return `<path class="tear" d="M${tearX} ${f.ey + 14} q7 10 0 16 q-7 -6 0 -16z" fill="#8FD3FF" stroke="${INK}" stroke-width="2.5"/>`;
  if (mood === 'bye') {
    return `<g class="wave"><ellipse cx="194" cy="118" rx="15" ry="18" fill="${paw}" ${LINE}/>`
      + `<path d="M186 104 v-6 M194 101 v-7 M202 104 v-6" stroke="${INK}" stroke-width="3" stroke-linecap="round"/></g>`
      + `<g stroke="#C9BCFF" stroke-width="4" stroke-linecap="round" fill="none"><path d="M208 96 q8 8 4 18"/><path d="M178 92 q-8 6 -6 16"/></g>`;
  }
  if (mood === 'idle' && f.style === 'sleepy') {
    return `<g class="float" fill="#9C8CFF" font-family="Nunito, sans-serif" font-weight="900"><text x="176" y="48" font-size="22">Z</text><text x="196" y="30" font-size="15">z</text></g>`;
  }
  return '';
}

// ---------- small accessories ----------

const bow = (x, y, color) => `<g ${THIN}><path d="M${x} ${y} l-16 -10 v20 z" fill="${color}"/><path d="M${x} ${y} l16 -10 v20 z" fill="${color}"/><circle cx="${x}" cy="${y}" r="5" fill="${color}"/></g>`;
const bowTie = (x, y, color) => `<g ${THIN}><path d="M${x} ${y} l-14 -9 v18 z" fill="${color}"/><path d="M${x} ${y} l14 -9 v18 z" fill="${color}"/><circle cx="${x}" cy="${y}" r="4.5" fill="${color}"/></g>`;
const flower = (x, y, petal, mid = '#FFC94D') => `<g ${THIN} fill="${petal}">${[0, 72, 144, 216, 288].map((a) => {
  const r = (a * Math.PI) / 180;
  return `<circle cx="${(x + Math.cos(r) * 8).toFixed(1)}" cy="${(y + Math.sin(r) * 8).toFixed(1)}" r="6"/>`;
}).join('')}<circle cx="${x}" cy="${y}" r="5" fill="${mid}"/></g>`;
const shadow = '<ellipse cx="110" cy="191" rx="62" ry="7" fill="#3D2B78" opacity=".08"/>';

// ---------- the pets ----------
// Each returns { back, head, front, face, paw }: back = behind the head (ears, mane, wings),
// head = the head/body, front = in front of the face (paws, book), face = face options.

const PETS = {
  mochi() {
    const fur = '#FFF7EC';
    return {
      back: `<g class="ears"><path d="M48 70 L58 14 L96 46 Z" fill="${fur}" ${LINE}/><path d="M172 70 L162 14 L124 46 Z" fill="${fur}" ${LINE}/>`
        + `<path d="M60 56 L64 30 L82 46 Z" fill="${PINK}"/><path d="M160 56 L156 30 L138 46 Z" fill="${PINK}"/></g>`,
      head: `<ellipse cx="110" cy="112" rx="82" ry="72" fill="${fur}" ${LINE}/>`,
      face: { cx: 110, ey: 100, gap: 28, my: 120, cheeks: PINK },
      paw: fur,
    };
  },

  bunny(g) {
    const fur = g === 'girl' ? '#FFF4FA' : '#F3F7FF';
    const inner = g === 'girl' ? '#FFAFCB' : '#A9CCFF';
    const ear = (x, tilt) => `<ellipse cx="${x}" cy="48" rx="17" ry="42" transform="rotate(${tilt} ${x} 48)" fill="${fur}" ${LINE}/>`
      + `<ellipse cx="${x}" cy="52" rx="8" ry="28" transform="rotate(${tilt} ${x} 52)" fill="${inner}"/>`;
    return {
      back: `<g class="ears">${ear(80, -10)}${ear(140, 12)}${g === 'girl' ? bow(150, 18, '#FF6FA3') : ''}</g>`,
      head: `<ellipse cx="110" cy="122" rx="80" ry="64" fill="${fur}" ${LINE}/>`
        + `<path d="M104 134 q6 6 12 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
      front: g === 'boy' ? bowTie(110, 180, '#5AA2FF') : flower(46, 92, '#FFC2D8'),
      face: { cx: 110, ey: 112, gap: 30, my: 140, cheeks: PINK, style: 'sparkle' },
      paw: fur,
    };
  },

  fox(g) {
    const fur = g === 'girl' ? '#FF8A66' : '#FF9A45';
    const cream = '#FFF7EC';
    return {
      back: `<path d="M182 168 C214 150 214 104 196 92 C200 122 188 144 166 156 Z" fill="${fur}" ${LINE}/><path d="M200 112 C206 128 202 146 188 158" stroke="${cream}" stroke-width="6" fill="none" stroke-linecap="round"/>`
        + `<g class="ears"><path d="M40 82 L50 10 L96 52 Z" fill="${fur}" ${LINE}/><path d="M180 82 L170 10 L124 52 Z" fill="${fur}" ${LINE}/>`
        + `<path d="M54 64 L57 30 L80 52 Z" fill="#5A3A3A"/><path d="M166 64 L163 30 L140 52 Z" fill="#5A3A3A"/></g>`,
      head: `<path d="M110 186 C58 186 28 150 30 112 C32 72 68 48 110 48 C152 48 188 72 190 112 C192 150 162 186 110 186 Z" fill="${fur}" ${LINE}/>`
        + `<path d="M110 184 C84 184 64 168 58 142 C78 150 98 146 110 132 C122 146 142 150 162 142 C156 168 136 184 110 184 Z" fill="${cream}"/>`
        + `<ellipse cx="110" cy="126" rx="7" ry="5" fill="${INK}"/>`
        + (g === 'boy' ? `<path d="M96 52 l6 -22 l8 16 l8 -20 l6 26" fill="${fur}" ${THIN}/>` : flower(62, 44, '#FFE066', '#FF8A66')),
      face: { cx: 110, ey: 104, gap: 30, my: 136, cheeks: '#FF6F7F', style: 'sunglasses' },
      paw: fur,
    };
  },

  pug(g) {
    const fur = '#F2D3A2';
    const dark = '#6B4F3E';
    const collar = g === 'girl' ? '#FF7AA8' : '#4E9BFF';
    return {
      back: `<g class="ears"><path d="M40 82 C26 56 44 34 72 46 L66 92 Z" fill="${dark}" ${LINE}/><path d="M180 82 C194 56 176 34 148 46 L154 92 Z" fill="${dark}" ${LINE}/></g>`,
      head: `<ellipse cx="110" cy="116" rx="84" ry="68" fill="${fur}" ${LINE}/>`
        + `<g stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".55"><path d="M92 66 q18 -8 36 0"/><path d="M98 78 q12 -5 24 0"/></g>`
        + `<ellipse cx="110" cy="146" rx="42" ry="30" fill="#E6BC88"/><ellipse cx="110" cy="128" rx="11" ry="7" fill="${dark}"/>`
        + `<path d="M40 172 Q110 196 180 172" stroke="${collar}" stroke-width="10" fill="none" stroke-linecap="round"/>`
        + (g === 'girl' ? bow(150, 178, '#FF7AA8') : `<circle cx="110" cy="190" r="7" fill="#FFC94D" ${THIN}/>`),
      face: { cx: 110, ey: 104, gap: 32, my: 142, cheeks: '#FF9E9E', style: 'crossed' },
      paw: fur,
    };
  },

  frog(g) {
    const skin = g === 'girl' ? '#9BE3A0' : '#7FD36C';
    const belly = '#E9FBD9';
    // The eye bumps sit on top of the head, so the head outline never crosses the eyes.
    return {
      head: `<ellipse cx="110" cy="128" rx="90" ry="58" fill="${skin}" ${LINE}/><ellipse cx="110" cy="156" rx="52" ry="26" fill="${belly}"/>`
        + `<g fill="#5DB64E" opacity=".6"><circle cx="46" cy="118" r="5"/><circle cx="176" cy="112" r="6"/><circle cx="160" cy="150" r="4"/></g>`
        + `<g class="ears"><circle cx="70" cy="74" r="32" fill="${skin}"/><circle cx="150" cy="74" r="32" fill="${skin}"/>`
        + `<path d="M39 82 A32 32 0 0 1 101 82 M119 82 A32 32 0 0 1 181 82" fill="none" ${LINE}/></g>`
        + (g === 'girl' ? flower(150, 40, '#FF9EC4') : `<path d="M86 50 q24 -26 48 0 Z" fill="#4E9BFF" ${THIN}/><path d="M128 50 h20" ${THIN}/>`),
      face: { cx: 110, ey: 74, gap: 40, my: 128, cheeks: '#FF8FA8', style: 'wobbly' },
      paw: skin,
    };
  },

  bear(g) {
    const fur = g === 'girl' ? '#D7A273' : '#C08752';
    const light = '#EFCFA6';
    const band = g === 'girl' ? '#FF7AA8' : '#FF5C6C';
    const arm = (s) => `<path d="M${110 + s * 58} 168 C${110 + s * 92} 168 ${110 + s * 100} 136 ${110 + s * 94} 112" fill="none" ${LINE}/>`
      + `<path d="M${110 + s * 60} 170 C${110 + s * 96} 172 ${110 + s * 104} 138 ${110 + s * 96} 110 C${110 + s * 88} 96 ${110 + s * 70} 102 ${110 + s * 74} 122 C${110 + s * 78} 138 ${110 + s * 70} 150 ${110 + s * 58} 150 Z" fill="${fur}" ${LINE}/>`
      + `<circle cx="${110 + s * 86}" cy="102" r="15" fill="${fur}" ${LINE}/>`;
    return {
      back: `<g class="ears"><circle cx="50" cy="58" r="22" fill="${fur}" ${LINE}/><circle cx="170" cy="58" r="22" fill="${fur}" ${LINE}/>`
        + `<circle cx="50" cy="58" r="11" fill="${light}"/><circle cx="170" cy="58" r="11" fill="${light}"/></g>`,
      head: `<ellipse cx="110" cy="116" rx="80" ry="68" fill="${fur}" ${LINE}/>`
        + `<path d="M38 92 Q110 54 182 92 L178 108 Q110 72 42 108 Z" fill="${band}" ${THIN}/><path d="M48 98 Q110 66 172 98" stroke="#fff" stroke-width="3" fill="none" opacity=".8"/>`
        + `<ellipse cx="110" cy="146" rx="32" ry="24" fill="${light}"/><ellipse cx="110" cy="134" rx="10" ry="7" fill="${INK}"/>`
        + (g === 'girl' ? bow(170, 88, '#FF7AA8') : ''),
      front: arm(-1) + arm(1),
      face: { cx: 110, ey: 108, gap: 30, my: 144, cheeks: '#FF9E9E', style: 'buff' },
      paw: fur,
    };
  },

  dragon(g) {
    const scale = g === 'girl' ? '#C6A6FF' : '#64D1BD';
    const belly = g === 'girl' ? '#F1E6FF' : '#DDF8F1';
    const crest = g === 'girl' ? '#FF6FC2' : '#FF5C5C';
    const wing = g === 'girl' ? '#A37CF2' : '#3FB39D';
    return {
      back: `<path d="M38 112 L6 84 L16 120 L2 132 L36 140 Z" fill="${wing}" ${LINE}/><path d="M182 112 L214 84 L204 120 L218 132 L184 140 Z" fill="${wing}" ${LINE}/>`
        + `<g class="ears"><path d="M66 66 C52 44 56 22 72 12 C74 32 82 46 92 56 Z" fill="#FFF1C9" ${LINE}/><path d="M154 66 C168 44 164 22 148 12 C146 32 138 46 128 56 Z" fill="#FFF1C9" ${LINE}/></g>`
        + `<path d="M84 60 L90 26 L102 52 L110 14 L118 52 L130 26 L136 60 Z" fill="${crest}" ${LINE}/>`,
      head: `<ellipse cx="110" cy="120" rx="80" ry="66" fill="${scale}" ${LINE}/><ellipse cx="110" cy="152" rx="40" ry="26" fill="${belly}"/>`
        + `<g fill="${INK}"><circle cx="102" cy="138" r="3"/><circle cx="118" cy="138" r="3"/></g>`
        + `<circle cx="34" cy="132" r="7" fill="none" stroke="#FFC94D" stroke-width="4"/>`
        + (g === 'girl' ? `<circle cx="186" cy="132" r="7" fill="none" stroke="#FFC94D" stroke-width="4"/>` : `<path d="M150 82 l10 -6 l4 10 z" fill="#2D2250"/>`),
      face: { cx: 110, ey: 108, gap: 30, my: 144, cheeks: '#FF8FA8', style: 'rebel' },
      paw: scale,
    };
  },

  owl(g) {
    const feather = g === 'girl' ? '#C6A6D8' : '#B4977E';
    const disc = '#F6EBDD';
    const cover = g === 'girl' ? '#FF7AA8' : '#4E9BFF';
    return {
      back: `<g class="ears"><path d="M46 72 L40 24 L78 52 Z" fill="${feather}" ${LINE}/><path d="M174 72 L180 24 L142 52 Z" fill="${feather}" ${LINE}/></g>`
        + `<path d="M34 118 C18 132 20 160 40 170 C40 148 44 132 52 120 Z" fill="${feather}" ${LINE}/><path d="M186 118 C202 132 200 160 180 170 C180 148 176 132 168 120 Z" fill="${feather}" ${LINE}/>`,
      head: `<ellipse cx="110" cy="116" rx="78" ry="70" fill="${feather}" ${LINE}/>`
        + `<circle cx="80" cy="102" r="30" fill="${disc}"/><circle cx="140" cy="102" r="30" fill="${disc}"/>`
        + `<path d="M102 116 L118 116 L110 130 Z" fill="#FFB347" ${THIN}/>`
        + (g === 'girl' ? bow(170, 40, '#FF6FA3') : `<path d="M74 44 L110 30 L146 44 L110 58 Z" fill="#2D2250" ${THIN}/><path d="M146 44 v18" ${THIN}/><circle cx="146" cy="64" r="4" fill="#FFC94D"/>`),
      front: `<g ${THIN}><path d="M70 160 L110 168 L150 160 L150 188 L110 196 L70 188 Z" fill="#fff"/><path d="M110 168 V196" fill="none"/>`
        + `<path d="M66 158 L110 166 L154 158 L154 162 L110 170 L66 162 Z" fill="${cover}"/></g>`
        + `<g stroke="${INK}" stroke-width="2" opacity=".5"><path d="M80 174 h20 M80 181 h18 M120 174 h20 M120 181 h18"/></g>`,
      face: { cx: 110, ey: 100, gap: 30, my: 138, cheeks: '#FF9EBE', style: 'glasses' },
      paw: feather,
    };
  },

  panda(g) {
    const patch = '#3B3550';
    const cap = g === 'girl' ? '#FF8FC0' : '#6C8CFF';
    const mark = g === 'girl'
      ? `<path d="M118 34 c-3 -5 -10 -3 -9 2 c1 4 9 8 9 8 s8 -4 9 -8 c1 -5 -6 -7 -9 -2z" fill="#fff"/>`
      : `${'<path d="M124 30 l2 5 5 1 -4 3 1 5 -4 -3 -4 3 1 -5 -4 -3 5 -1z" fill="#FFE066"/>'}`;
    return {
      back: `<g class="ears"><circle cx="52" cy="60" r="21" fill="${patch}" ${LINE}/><circle cx="168" cy="60" r="21" fill="${patch}" ${LINE}/></g>`,
      head: `<ellipse cx="110" cy="118" rx="80" ry="68" fill="#FFFFFF" ${LINE}/>`
        + `<ellipse cx="80" cy="112" rx="19" ry="23" transform="rotate(-24 80 112)" fill="${patch}"/><ellipse cx="140" cy="112" rx="19" ry="23" transform="rotate(24 140 112)" fill="${patch}"/>`
        + `<ellipse cx="110" cy="136" rx="9" ry="6" fill="${patch}"/>`
        + `<path d="M58 70 C66 30 116 6 170 18 C152 26 142 42 140 62 Z" fill="${cap}" ${LINE}/>${mark}<circle cx="174" cy="20" r="11" fill="#fff" ${THIN}/>`,
      face: { cx: 110, ey: 110, gap: 30, my: 146, cheeks: '#FFB3C9', style: 'sleepy', ink: '#FFFFFF', hl: patch },
      paw: patch,
    };
  },

  lion(g) {
    const mane = g === 'girl' ? '#F6C46A' : '#EE8A2C';
    const fur = '#FFD27A';
    const scallops = Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      const ring = g === 'girl' ? 56 : 66;
      return `<circle cx="${(110 + Math.cos(a) * ring).toFixed(1)}" cy="${(108 + Math.sin(a) * ring).toFixed(1)}" r="${g === 'girl' ? 18 : 22}"/>`;
    }).join('');
    const crown = g === 'girl'
      ? `<path d="M82 64 L88 44 L99 55 L110 32 L121 55 L132 44 L138 64 Q110 56 82 64 Z" fill="#FFE27A" ${THIN}/><path d="M110 46 c-3 -5 -10 -3 -9 2 c1 4 9 8 9 8 s8 -4 9 -8 c1 -5 -6 -7 -9 -2z" fill="#FF6FA3" ${THIN}/>`
      : `<path d="M78 58 L82 26 L98 42 L110 18 L122 42 L138 26 L142 58 Z" fill="#FFC94D" ${LINE}/><circle cx="110" cy="46" r="5" fill="#FF5C6C"/><circle cx="92" cy="50" r="3.5" fill="#4E9BFF"/><circle cx="128" cy="50" r="3.5" fill="#4E9BFF"/>`;
    return {
      back: `<g fill="${mane}" stroke="${INK}" stroke-width="5">${scallops}</g><circle cx="110" cy="108" r="${g === 'girl' ? 56 : 66}" fill="${mane}"/>`
        + `<g class="ears"><circle cx="66" cy="70" r="14" fill="${fur}" ${LINE}/><circle cx="154" cy="70" r="14" fill="${fur}" ${LINE}/></g>`,
      head: `<ellipse cx="110" cy="116" rx="62" ry="58" fill="${fur}" ${LINE}/><ellipse cx="110" cy="144" rx="28" ry="20" fill="#FFF1D0"/>`
        + `<path d="M102 130 L118 130 L110 138 Z" fill="#8A4B2A"/>${crown}`,
      face: { cx: 110, ey: 108, gap: 26, my: 142, cheeks: '#FF9E9E', style: 'proud' },
      paw: fur,
    };
  },

  hamster(g) {
    const fur = g === 'girl' ? '#F7C6A3' : '#EDB27A';
    const cream = '#FFF6EC';
    return {
      back: `<g class="ears"><circle cx="60" cy="50" r="17" fill="${fur}" ${LINE}/><circle cx="160" cy="50" r="17" fill="${fur}" ${LINE}/>`
        + `<circle cx="60" cy="50" r="8" fill="${PINK}"/><circle cx="160" cy="50" r="8" fill="${PINK}"/></g>`,
      head: `<path d="M110 34 C164 34 196 76 196 122 C196 164 160 190 110 190 C60 190 24 164 24 122 C24 76 56 34 110 34 Z" fill="${fur}" ${LINE}/>`
        + `<ellipse cx="110" cy="134" rx="62" ry="50" fill="${cream}"/><ellipse cx="110" cy="124" rx="8" ry="5" fill="#E07A8F"/>`
        + (g === 'girl' ? `<path d="M140 44 l8 -10 l4 12 l12 -2 l-8 10 z" fill="#FF6FA3" ${THIN}/>` : bowTie(110, 182, '#3FB39D')),
      front: `<g fill="${fur}" ${THIN}><ellipse cx="92" cy="156" rx="13" ry="10"/><ellipse cx="128" cy="156" rx="13" ry="10"/></g>`,
      face: { cx: 110, ey: 106, gap: 28, my: 130, cheeks: '#FF8FA8', style: 'shy' },
      paw: fur,
    };
  },
};

// petSvg('fox-girl', 'bye') -> the SVG text. Unknown pets/moods fall back to Mochi / idle.
export function petSvg(id, mood = 'idle') {
  const m = PET_MOODS.includes(mood) ? mood : 'idle';
  const [animal, gender] = String(id || '').split('-');
  const draw = PETS[animal] && (animal === 'mochi' || gender === 'boy' || gender === 'girl') ? PETS[animal] : PETS.mochi;
  const key = draw === PETS.mochi ? 'mochi' : `${animal}-${gender}`;
  const p = draw(gender);
  const f = { ink: INK, hl: '#fff', lashes: gender === 'girl', ...p.face };
  f.lx = f.cx - f.gap;
  f.rx = f.cx + f.gap;
  return `<svg class="pet mood-${m} pet-${key}" viewBox="0 0 220 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
    + `${shadow}<g class="head">${p.back || ''}${p.head}${face(f, m)}${p.front || ''}${extras(f, m, p.paw)}</g></svg>`;
}
