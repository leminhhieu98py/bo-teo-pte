import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PETS } from '../lib/shop.js';
import { petSvg, PET_MOODS } from '../ui/pets.js';

const INK = '#3D2B78';

test('the eight moods', () => {
  assert.deepEqual(PET_MOODS, ['idle', 'happy', 'oops', 'think', 'wow', 'listen', 'bye', 'sad']);
});

for (const pet of PETS) {
  test(`${pet.id} draws every mood with the shared outline and inside the frame`, () => {
    const seen = new Set();
    for (const mood of PET_MOODS) {
      const svg = petSvg(pet.id, mood);
      assert.match(svg, /^<svg class="pet mood-[a-z]+ pet-[a-z-]+" viewBox="0 0 220 200"/, `${pet.id} ${mood}`);
      assert.ok(svg.includes(`mood-${mood}`), `${pet.id} ${mood} class`);
      // Same outline as Mochi: ink color, width 5 for the body.
      assert.ok(svg.includes(`stroke="${INK}" stroke-width="5"`), `${pet.id} ${mood} outline`);
      // Parts the animations move.
      for (const part of ['class="eyes"', 'class="mouth"', 'class="head"']) assert.ok(svg.includes(part), `${pet.id} ${mood} ${part}`);
      if (mood === 'listen') assert.ok(svg.includes('class="ears"'), `${pet.id} ears for listening`);
      if (mood === 'bye') assert.ok(svg.includes('class="wave"'), `${pet.id} waving paw`);
      if (mood === 'sad') assert.ok(svg.includes('class="tear"'), `${pet.id} tear`);
      // No number in a path or shape may leave the 220 x 200 frame.
      for (const [, attr, value] of svg.matchAll(/\s(cx|cy|x|y|x1|y1|x2|y2)="(-?[\d.]+)"/g)) {
        const v = Number(value);
        const max = attr.startsWith('x') || attr === 'cx' ? 220 : 200;
        assert.ok(v >= 0 && v <= max, `${pet.id} ${mood}: ${attr}=${v}`);
      }
      // No placeholder or broken values.
      assert.ok(!/undefined|NaN|null/.test(svg), `${pet.id} ${mood} has no undefined/NaN`);
      seen.add(svg);
    }
    assert.equal(seen.size, PET_MOODS.length, `${pet.id}: every mood looks different`);
  });
}

test('boy and girl of a kind look different', () => {
  for (const pet of PETS.filter((p) => p.gender === 'boy')) {
    const girl = pet.id.replace('-boy', '-girl');
    assert.notEqual(petSvg(pet.id, 'idle'), petSvg(girl, 'idle'), pet.id);
  }
});

test('an unknown pet or mood falls back to Mochi idle', () => {
  assert.equal(petSvg('unicorn', 'idle'), petSvg('mochi', 'idle'));
  assert.equal(petSvg('mochi', 'dance'), petSvg('mochi', 'idle'));
});

test('each pet has its own gradient and clip ids, so two pets can share a page', () => {
  const ids = (svg) => [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  const a = ids(petSvg('fox-boy', 'idle'));
  const b = ids(petSvg('fox-boy', 'idle'));
  for (const id of a) assert.ok(!b.includes(id), id);
});
