// Shop: buy pets and themes with the money in the wallet; switch between owned ones for free.
import { setMood, setPet } from '../ui/mascot.js';
import { mountNav } from '../ui/nav.js';
import { petSvg } from '../ui/pets.js';
import { applyTheme } from '../ui/theme-sync.js';
import { showConfirm, showNotice } from '../ui/notice.js';
import { checkAchievements, celebrate } from '../ui/achievements-check.js';
import { PETS, THEMES, isOwned } from '../lib/shop.js';
import { getSettings, missingSettings, getWallet, saveWallet, outbox } from '../lib/storage.js';
import { walletGet, shopBuy, shopEquip } from '../lib/sheet.js';
import { formatMoney, withPending } from '../lib/xp.js';
import { todayKey } from '../lib/daily.js';

const $ = (id) => document.getElementById(id);
const state = { settings: null, wallet: null, tab: 'pets', busy: false };

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

const using = (item, kind) => (kind === 'pet' ? (state.wallet?.pet || 'mochi') : (state.wallet?.theme || 'lavender')) === item.id;

async function setWallet(wallet) {
  state.wallet = wallet;
  await saveWallet(wallet);
  $('wallet').textContent = formatMoney(wallet.xp);
}

async function loadWallet() {
  const cached = await getWallet();
  if (cached && cached.userId === state.settings.userId) {
    state.wallet = cached;
    $('wallet').textContent = formatMoney(cached.xp);
  }
  render();
  const today = todayKey();
  try {
    const server = await walletGet({ url: state.settings.sheetUrl, token: state.settings.token, userId: state.settings.userId, date: today });
    const pending = (await outbox.all()).filter((i) => i.payload?.userId === state.settings.userId);
    await setWallet(withPending({ userId: state.settings.userId, date: today, ...server }, pending, today));
    $('status').textContent = '';
  } catch {
    if (!state.wallet) $('status').textContent = 'Could not open your wallet. Check the internet and try again.';
  }
  render();
}

function petPreview(pet) {
  const box = el('div', 'mascot');
  box.dataset.fixedPet = pet.id;
  box.innerHTML = petSvg(pet.id, 'idle');
  return box;
}

function themePreview(theme) {
  const box = el('div', 'mini');
  box.dataset.theme = theme.id;
  box.innerHTML = '<div class="bar"><i class="dot"></i><i class="track"></i><span class="pill">$2,000</span></div>'
    + '<div class="card-mini"><b>con mèo</b><div class="slots"><i></i><i></i><i></i></div>'
    + '<div class="btns"><span class="g">Show a letter</span><span class="p">Check</span></div></div>';
  return box;
}

function card(item, kind) {
  const box = el('article', `item${using(item, kind) ? ' using' : ''}`);
  const preview = kind === 'pet' ? petPreview(item) : themePreview(item);
  box.append(preview);
  if (kind === 'pet') {
    box.addEventListener('mouseenter', () => { preview.innerHTML = petSvg(item.id, 'happy'); });
    box.addEventListener('mouseleave', () => { preview.innerHTML = petSvg(item.id, 'idle'); });
  }
  const kindText = kind === 'pet' ? `${item.personality} ${item.animal}${item.gender ? ` · ${item.gender}` : ''}` : 'Theme';
  box.append(el('h3', '', item.name), el('span', 'kind', kindText), el('p', '', item.description));

  const owned = isOwned(item.id, state.wallet?.owned);
  if (using(item, kind)) box.append(el('span', 'tag', 'In use'));
  const btn = el('button', 'btn');
  if (!state.wallet) {
    btn.className = 'btn btn-ghost';
    btn.textContent = '...';
    btn.disabled = true;
  } else if (using(item, kind)) {
    box.append(el('div', 'in-use', kind === 'pet' ? 'Your pet now' : 'Your colors now'));
    return box;
  } else if (owned) {
    btn.className = 'btn btn-ghost';
    btn.textContent = 'Use';
    btn.addEventListener('click', () => equip(item, kind));
  } else {
    btn.className = 'btn btn-primary';
    btn.textContent = `Buy ${formatMoney(item.price)}`;
    const short = item.price - state.wallet.xp;
    if (short > 0) {
      btn.disabled = true;
      box.append(btn, el('span', 'need', `Need ${formatMoney(short)} more`));
      return box;
    }
    btn.addEventListener('click', () => buy(item, kind));
  }
  box.append(btn);
  return box;
}

function render() {
  const items = state.tab === 'pets' ? PETS.map((p) => card(p, 'pet')) : THEMES.map((t) => card(t, 'theme'));
  $('grid').replaceChildren(...items);
  $('tabPets').classList.toggle('on', state.tab === 'pets');
  $('tabThemes').classList.toggle('on', state.tab === 'themes');
  $('tabPets').setAttribute('aria-selected', String(state.tab === 'pets'));
  $('tabThemes').setAttribute('aria-selected', String(state.tab === 'themes'));
}

async function equip(item, kind) {
  if (state.busy) return;
  state.busy = true;
  try {
    const out = await shopEquip({ url: state.settings.sheetUrl, token: state.settings.token, userId: state.settings.userId, kind, itemId: item.id });
    await setWallet({ ...state.wallet, pet: out.pet, theme: out.theme });
    if (kind === 'theme') applyTheme(out.theme);
    else setPet(out.pet || 'mochi');
    setMood($('mascot'), 'happy');
    $('status').textContent = '';
  } catch (err) {
    $('status').textContent = `Could not switch: ${err.message}`;
  } finally {
    state.busy = false;
    render();
  }
}

async function buy(item, kind) {
  if (state.busy) return;
  const yes = await showConfirm({
    title: `Buy ${item.name}?`,
    text: `${item.name} costs ${formatMoney(item.price)}. You will have ${formatMoney(state.wallet.xp - item.price)} left.`,
    yes: `Buy for ${formatMoney(item.price)}`,
    no: 'Not now',
    preview: kind === 'pet' ? `<div class="mascot" data-fixed-pet="${item.id}">${petSvg(item.id, 'wow')}</div>` : themePreview(item).outerHTML,
  });
  if (!yes) return;
  state.busy = true;
  let bought = false;
  try {
    const out = await shopBuy({ url: state.settings.sheetUrl, token: state.settings.token, userId: state.settings.userId, itemId: item.id, date: todayKey() });
    await setWallet({ ...state.wallet, xp: out.xp, owned: out.owned });
    if (out.ok) bought = true;
    else if (out.error === 'not_enough_xp') {
      await showNotice({ title: 'Not enough money yet', text: `You need ${formatMoney(item.price)}. Practice more to earn money, or ask the admin.`, mood: 'sad', button: 'OK' });
    }
    // already_owned: the wallet above now shows it as owned.
  } catch (err) {
    $('status').textContent = `Could not buy: ${err.message}`;
  } finally {
    state.busy = false;
    render();
  }
  if (!bought) return;
  setMood($('mascot'), 'wow');
  await equip(item, kind); // a new pet or theme is used right away
  // Fashion achievements count pets and themes.
  const result = await checkAchievements(state.settings);
  if (result.won.length) await setWallet({ ...state.wallet, xp: state.wallet.xp + result.won.reduce((s, w) => s + w.reward, 0) });
  await celebrate(state.settings, result.toCelebrate);
}

async function init() {
  mountNav();
  setMood($('mascot'), 'happy');
  state.settings = await getSettings();
  if (missingSettings(state.settings).length) {
    $('status').textContent = 'Settings are missing. Open Settings first.';
    return;
  }
  await loadWallet();
}

$('tabPets').addEventListener('click', () => { state.tab = 'pets'; render(); });
$('tabThemes').addEventListener('click', () => { state.tab = 'themes'; render(); });
init();
