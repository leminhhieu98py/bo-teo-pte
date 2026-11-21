// Achievement medals as inline SVG: a ribbon, a metal disc for the tier and the category icon.
// tier = -1 draws a locked (grey) medal. Styles for the shine live in ui/theme.css (.medal).

export const CATEGORY_ICONS = {
  flame: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  sparkle: '<path d="M12 3l2 6.5 6.5 2.5-6.5 2.5L12 21l-2-6.5L3.5 12 10 9.5z"/><path d="M19 3v3M17.5 4.5h3"/>',
  hanger: '<path d="M10 6a2 2 0 1 1 3 1.7c-.6.4-1 .9-1 1.6V10"/><path d="M12 10l-8.5 6.2c-.8.6-.4 1.8.6 1.8h15.8c1 0 1.4-1.2.6-1.8z"/>',
  book: '<path d="M4 5h5a3 3 0 0 1 3 3v11a2.5 2.5 0 0 0-2.5-2.5H4z"/><path d="M20 5h-5a3 3 0 0 0-3 3v11a2.5 2.5 0 0 1 2.5-2.5H20z"/>',
  note: '<path d="M9 17.5V5.5l10-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  bolt: '<path d="M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z"/>',
  coins: '<ellipse cx="12" cy="6.5" rx="6.5" ry="2.8"/><path d="M5.5 6.5v5c0 1.6 2.9 2.8 6.5 2.8s6.5-1.2 6.5-2.8v-5"/><path d="M5.5 11.5v5c0 1.6 2.9 2.8 6.5 2.8s6.5-1.2 6.5-2.8v-5"/>',
};

// [rim dark, rim light, face, face light, icon color, ribbon A, ribbon B]
const METALS = [
  ['#A7612A', '#E3A066', '#F2B880', '#FFE0C2', '#7A3E12', '#7C5CFF', '#FF8FB1'], // bronze
  ['#8E99A8', '#E4E9F0', '#D9DFE7', '#FFFFFF', '#4E5A6B', '#4EA8FF', '#7C5CFF'], // silver
  ['#D08F00', '#FFE07A', '#FFD24D', '#FFF3BF', '#8A5A00', '#FF6B8A', '#FFC94D'], // gold
  ['#3FA9A0', '#BFF3EE', '#9BE6DE', '#E9FFFC', '#1D6B64', '#2FC79A', '#4EA8FF'], // platinum
  ['#4D7CFE', '#D6E6FF', '#A9CBFF', '#F2F8FF', '#2949A8', '#7C5CFF', '#4DD7FF'], // diamond
];
const LOCKED = ['#C9C2DD', '#EEEAF7', '#E4DEF2', '#F6F3FC', '#A99FC4', '#DDD6EE', '#E9E4F4'];

let uid = 0;

export function medalSvg(tier, icon, { size = 72, shine = true } = {}) {
  const [rimA, rimB, face, faceB, ink, ribA, ribB] = tier >= 0 ? METALS[Math.min(tier, METALS.length - 1)] : LOCKED;
  const id = `md${++uid}`;
  const diamond = tier === 4
    ? '<path d="M60 66l6 8-6 8-6-8z" fill="#fff" opacity=".55"/><path d="M40 92l4 5-4 5-4-5zM80 92l4 5-4 5-4-5z" fill="#fff" opacity=".45"/>'
    : '';
  return `<svg class="medal${tier < 0 ? ' locked' : ''}" viewBox="0 0 120 150" width="${size}" height="${size * 1.25}" aria-hidden="true">
  <defs>
    <linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${rimB}"/><stop offset="1" stop-color="${rimA}"/></linearGradient>
    <radialGradient id="${id}f" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${faceB}"/><stop offset="1" stop-color="${face}"/></radialGradient>
    <clipPath id="${id}c"><circle cx="60" cy="96" r="40"/></clipPath>
  </defs>
  <path d="M34 4h22l12 46H46z" fill="${ribA}"/><path d="M86 4H64L52 50h22z" fill="${ribB}"/>
  <path d="M46 50h28v8H46z" fill="${rimA}" opacity=".35"/>
  <circle cx="60" cy="96" r="44" fill="url(#${id}r)"/>
  <circle cx="60" cy="96" r="35" fill="url(#${id}f)" stroke="${rimA}" stroke-width="2" stroke-opacity=".35"/>
  ${diamond}
  <g transform="translate(39 75) scale(1.75)" fill="none" stroke="${ink}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" color="${ink}">${CATEGORY_ICONS[icon] || ''}</g>
  ${tier >= 0 && shine ? `<g clip-path="url(#${id}c)"><g transform="rotate(25 60 96)"><rect class="medal-shine" x="-30" y="30" width="20" height="140" fill="#fff" opacity=".55"/></g></g>` : ''}
</svg>`;
}
