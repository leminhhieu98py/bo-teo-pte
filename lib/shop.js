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

// Mochi is free for everyone; the 20 shop pets are 10 personalities, each with a boy and a girl.
export const PETS = [
  { id: 'mochi', name: 'Mochi', price: 0, personality: 'Cheerful', animal: 'cat', gender: '', description: 'The cat who started it all.' },
  { id: 'bunny-boy', name: 'Bunbun', price: PET_PRICE, personality: 'Cute', animal: 'bunny', gender: 'boy', description: 'Cute bunny with big sparkly eyes and long floppy ears.' },
  { id: 'bunny-girl', name: 'Momo', price: PET_PRICE, personality: 'Cute', animal: 'bunny', gender: 'girl', description: 'Cute bunny with big sparkly eyes and long floppy ears.' },
  { id: 'fox-boy', name: 'Blaze', price: PET_PRICE, personality: 'Cool', animal: 'fox', gender: 'boy', description: 'Cool fox with sunglasses and a confident smirk.' },
  { id: 'fox-girl', name: 'Roxy', price: PET_PRICE, personality: 'Cool', animal: 'fox', gender: 'girl', description: 'Cool fox with sunglasses and a confident smirk.' },
  { id: 'pug-boy', name: 'Doodle', price: PET_PRICE, personality: 'Derpy', animal: 'pug', gender: 'boy', description: 'Derpy pug with crossed eyes and a tongue that never goes back in.' },
  { id: 'pug-girl', name: 'Noodle', price: PET_PRICE, personality: 'Derpy', animal: 'pug', gender: 'girl', description: 'Derpy pug with crossed eyes and a tongue that never goes back in.' },
  { id: 'frog-boy', name: 'Ribbit', price: PET_PRICE, personality: 'Goofy', animal: 'frog', gender: 'boy', description: 'Goofy frog with a huge grin and wobbly eyes.' },
  { id: 'frog-girl', name: 'Lily', price: PET_PRICE, personality: 'Goofy', animal: 'frog', gender: 'girl', description: 'Goofy frog with a huge grin and wobbly eyes.' },
  { id: 'bear-boy', name: 'Tank', price: PET_PRICE, personality: 'Buff', animal: 'bear', gender: 'boy', description: 'Buff bear with big muscles and a sweatband.' },
  { id: 'bear-girl', name: 'Bella', price: PET_PRICE, personality: 'Buff', animal: 'bear', gender: 'girl', description: 'Buff bear with big muscles and a sweatband.' },
  { id: 'dragon-boy', name: 'Spike', price: PET_PRICE, personality: 'Rebel', animal: 'dragon', gender: 'boy', description: 'Rebel dragon with a spiky mohawk and an earring.' },
  { id: 'dragon-girl', name: 'Ember', price: PET_PRICE, personality: 'Rebel', animal: 'dragon', gender: 'girl', description: 'Rebel dragon with a spiky mohawk and an earring.' },
  { id: 'owl-boy', name: 'Hoot', price: PET_PRICE, personality: 'Nerdy', animal: 'owl', gender: 'boy', description: 'Nerdy owl with round glasses and a favorite book.' },
  { id: 'owl-girl', name: 'Olive', price: PET_PRICE, personality: 'Nerdy', animal: 'owl', gender: 'girl', description: 'Nerdy owl with round glasses and a favorite book.' },
  { id: 'panda-boy', name: 'Snooze', price: PET_PRICE, personality: 'Sleepy', animal: 'panda', gender: 'boy', description: 'Sleepy panda with sleepy eyes and a nightcap.' },
  { id: 'panda-girl', name: 'Mimi', price: PET_PRICE, personality: 'Sleepy', animal: 'panda', gender: 'girl', description: 'Sleepy panda with sleepy eyes and a nightcap.' },
  { id: 'lion-boy', name: 'Leo', price: PET_PRICE, personality: 'Royal', animal: 'lion', gender: 'boy', description: 'Royal lion with a golden crown and a proud chin.' },
  { id: 'lion-girl', name: 'Queenie', price: PET_PRICE, personality: 'Royal', animal: 'lion', gender: 'girl', description: 'Royal lion with a golden crown and a proud chin.' },
  { id: 'hamster-boy', name: 'Peanut', price: PET_PRICE, personality: 'Shy', animal: 'hamster', gender: 'boy', description: 'Shy hamster with rosy cheeks and paws over the face.' },
  { id: 'hamster-girl', name: 'Cookie', price: PET_PRICE, personality: 'Shy', animal: 'hamster', gender: 'girl', description: 'Shy hamster with rosy cheeks and paws over the face.' },
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
