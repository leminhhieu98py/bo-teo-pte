// The learner's pet in every mascot box. Mochi until another pet is equipped in the Shop
// (ui/theme-sync.js calls setPet with the equipped pet).
import { petSvg, PET_MOODS } from './pets.js';

export const MOODS = PET_MOODS;

// The last equipped pet is cached, so the first drawing is already the right pet (no Mochi flash).
let currentPet = (() => {
  try {
    return globalThis.localStorage?.getItem('bo-pet') || 'mochi';
  } catch {
    return 'mochi';
  }
})();

export function mascotSvg(mood = 'idle') {
  return petSvg(currentPet, mood);
}

export function setMood(el, mood) {
  if (!el) return;
  el.innerHTML = petSvg(currentPet, mood);
  el.dataset.mood = mood;
}

export function currentPetId() {
  return currentPet;
}

// Draws the new pet in every mascot box on the page, keeping each box's mood.
export function setPet(id) {
  const next = id || 'mochi';
  try {
    localStorage.setItem('bo-pet', next);
  } catch {
    // No cache: the next page shows Mochi for a moment.
  }
  if (next === currentPet) return;
  currentPet = next;
  document.querySelectorAll('[data-mood]').forEach((el) => {
    if (!el.closest('[data-fixed-pet]')) el.innerHTML = petSvg(currentPet, el.dataset.mood);
  });
}
