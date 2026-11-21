import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEMES } from '../lib/shop.js';

const css = readFileSync(new URL('../ui/theme.css', import.meta.url), 'utf8');

const block = (re) => Object.fromEntries([...(css.match(re)?.[1] || '').matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const ownTokens = (id) => block(new RegExp(`\\[data-theme="${id}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`));

// Tokens of the default (:root) block, then each [data-theme="id"] block on top of it.
function tokens(id) {
  const base = block(/:root\s*\{([\s\S]*?)\n\}/);
  if (id === 'lavender') return base;
  const own = ownTokens(id);
  assert.ok(Object.keys(own).length, `theme ${id} has a block`);
  return { ...base, ...own };
}

function luminance(hex) {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? [...m].map((c) => c + c).join('') : m.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [text token, background token, minimum ratio] - 4.5 for body text, 3 for big bold text and buttons.
const PAIRS = [
  ['ink', 'card', 4.5], ['ink', 'bg', 4.5], ['ink-soft', 'card', 4.5], ['ink', 'soft', 4.5],
  ['primary', 'card', 3], ['#FFFFFF', 'primary', 3], ['gold-ink', 'gold-soft', 4.5],
  ['mint-ink', 'mint-soft', 4.5], ['pink-ink', 'pink-soft', 4.5], ['red', 'red-soft', 3], ['primary', 'soft-2', 3],
];

test('six themes: Lavender (free) and five for sale', () => {
  assert.deepEqual(THEMES.map((t) => t.id), ['lavender', 'peach', 'mint', 'ocean', 'strawberry', 'night']);
  assert.equal(THEMES[0].price, 0);
  for (const t of THEMES.slice(1)) assert.equal(t.price, 4000, t.id);
});

for (const theme of ['lavender', 'peach', 'mint', 'ocean', 'strawberry', 'night']) {
  test(`theme ${theme}: every text color is readable on its background`, () => {
    const t = tokens(theme);
    for (const [fg, bg, min] of PAIRS) {
      const a = fg.startsWith('#') ? fg : t[fg];
      const b = t[bg];
      assert.ok(/^#[0-9a-f]{6}$/i.test(a) && /^#[0-9a-f]{6}$/i.test(b), `${theme}: ${fg}=${a} ${bg}=${b} must be #rrggbb`);
      const ratio = contrast(a, b);
      assert.ok(ratio >= min, `${theme}: ${fg} on ${bg} is ${ratio.toFixed(2)} (needs ${min})`);
    }
  });
}

test('every theme defines every color token itself', () => {
  const names = Object.keys(tokens('lavender')).filter((n) => n !== 'radius').sort();
  for (const theme of ['peach', 'mint', 'ocean', 'strawberry', 'night']) {
    const own = Object.keys(ownTokens(theme)).sort();
    assert.deepEqual(own, names, theme);
  }
});
