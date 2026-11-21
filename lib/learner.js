// Learner ids: made once from the first name the learner typed, then never changed (a rename only
// changes the display name). Example: "Bo" -> "bo_k3x9q2mf".

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function slugName(name) {
  const slug = String(name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .join('-')
    .slice(0, 20)
    .replace(/-+$/, '');
  return slug || 'learner';
}

export function makeLearnerId(name, rng = Math.random) {
  let suffix = '';
  for (let i = 0; i < 8; i++) suffix += ID_CHARS[Math.floor(rng() * ID_CHARS.length) % ID_CHARS.length];
  return `${slugName(name)}_${suffix}`;
}
