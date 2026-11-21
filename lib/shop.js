// Shop catalog. Prices live here and in Code.gs (SHOP_PRICES; a test compares them).
// Free items (price 0) belong to everyone and are never sold.

export const PET_PRICE = 1500;
export const THEME_PRICE = 4000;

export const THEMES = [
  { id: 'lavender', name: 'Lavender', price: 0, description: 'Soft purple, the classic Mochi look.' },
  { id: 'peach', name: 'Peach Sunset', price: THEME_PRICE, description: 'Warm orange like a summer evening.' },
  { id: 'mint', name: 'Mint Garden', price: THEME_PRICE, description: 'Fresh green leaves and calm mornings.' },
  { id: 'ocean', name: 'Ocean Pop', price: THEME_PRICE, description: 'Bright blue waves and sunny skies.' },
  { id: 'strawberry', name: 'Strawberry Milk', price: THEME_PRICE, description: 'Sweet pink, like a milkshake.' },
  { id: 'night', name: 'Night Sky', price: THEME_PRICE, description: 'Dark blue with shining stars. Easy on the eyes.' },
];

// Pets join this list in the pets release; Mochi is free for everyone.
export const PETS = [
  { id: 'mochi', name: 'Mochi', price: 0, personality: 'Cheerful', animal: 'cat', gender: '' },
];

export const FREE_ITEMS = [...THEMES, ...PETS].filter((i) => i.price === 0).map((i) => i.id);

export function findItem(id) {
  const pet = PETS.find((p) => p.id === id);
  if (pet) return { ...pet, kind: 'pet' };
  const theme = THEMES.find((t) => t.id === id);
  return theme ? { ...theme, kind: 'theme' } : null;
}

export function isOwned(id, owned) {
  return FREE_ITEMS.includes(id) || (owned || []).includes(id);
}
