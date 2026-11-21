// Shop: buy pets and themes with the money in the wallet; switch between owned ones for free.
import { setMood, setPet } from '../ui/mascot.js';
import { mountNav } from '../ui/nav.js';
import { petSvg } from '../ui/pets.js';
import { applyTheme } from '../ui/theme-sync.js';
import { showConfirm, showNotice } from '../ui/notice.js';
import { checkAchievements, celebrate } from '../ui/achievements-check.js';
import { PETS, THEMES, isOwned } from '../lib/shop.js';
import { getSettings, missingSettings, getWallet, patchWallet, outbox } from '../lib/storage.js';
import { walletGet, shopBuy, shopEquip } from '../lib/sheet.js';
import { formatMoney, withPending } from '../lib/xp.js';
import { todayKey } from '../lib/daily.js';

const $ = (id) => document.getElementById(id);
const state = { settings: null, wallet: null, tab: 'pets', busy: false, buying: '' };
const ALL = ['xp', 'earnedToday', 'date', 'owned', 'pet', 'theme'];

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

const using = (item, kind) => (kind === 'pet' ? (state.wallet?.pet || 'mochi') : (state.wallet?.theme || 'lavender')) === item.id;

// Writes only `fields` to the shared cache, so this page never puts back an older value of another page.
async function setWallet(wallet, fields) {
  state.wallet = wallet;
  await patchWallet(state.settings.userId, Object.fromEntries(fields.map((f) => [f, wallet[f]])));
  $('wallet').textContent = formatMoney(wallet.xp);
}

// The Sheet's numbers plus the writes still waiting in the outbox.
async function fromServer(server) {
  const today = todayKey();
  const pending = (await outbox.all()).filter((i) => i.payload?.userId === state.settings.userId);
  return withPending({ userId: state.settings.userId, date: today, earnedToday: state.wallet?.earnedToday || 0, ...server }, pending, today);
}

async function loadWallet() {
  const cached = await getWallet();
  if (cached && cached.userId === state.settings.userId) {
    state.wallet = cached;
    $('wallet').textContent = formatMoney(cached.xp);
  }
  render();
  try {
    const server = await walletGet({ url: state.settings.sheetUrl, token: state.settings.token, userId: state.settings.userId, date: todayKey() });
    await setWallet(await fromServer(server), ALL);
    $('status').textContent = '';
  } catch (err) {
    if (!state.wallet) {
      $('wallet').textContent = '$—';
      $('status').textContent = err.code === 'old_script' ? err.message : 'Could not open your wallet. Check the internet and try again.';
    }
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
  if (state.buying === item.id) {
    btn.className = 'btn btn-primary';
    btn.textContent = 'Buying...';
    btn.disabled = true;
  } else if (!state.wallet) {
    btn.className = 'btn btn-ghost';
    btn.textContent = '...';
    btn.disabled = true;
  } else if (using(item, kind)) {
    box.append(el('div', 'in-use', kind === 'pet' ? 'Your pet now' : 'Your colors now'));
    return box;
  } else if (owned) {
    btn.className = 'btn btn-ghost';
    btn.textContent = 'Use';
    btn.disabled = state.busy;
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
    btn.disabled = state.busy;
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
    await setWallet({ ...state.wallet, pet: out.pet, theme: out.theme }, ['pet', 'theme']);
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
  if (!yes || state.busy) return;
  state.busy = true;
  state.buying = item.id;
  render();
  let bought = false;
  const base = { url: state.settings.sheetUrl, token: state.settings.token, userId: state.settings.userId };
  try {
    const out = await shopBuy({ ...base, itemId: item.id, date: todayKey() });
    await setWallet(await fromServer({ ...state.wallet, xp: out.xp, owned: out.owned }), ['xp', 'owned']);
    // already_owned: a lost answer to an earlier tap that did buy it.
    bought = out.ok || out.error === 'already_owned';
    if (out.error === 'not_enough_xp') {
      await showNotice({ title: 'Not enough money yet', text: `You need ${formatMoney(item.price)}. Practice more to earn money, or ask the admin.`, mood: 'sad', button: 'OK' });
    }
  } catch (err) {
    // The answer was lost (slow internet): the Sheet may have sold it anyway. Ask again before saying no.
    try {
      const server = await walletGet({ ...base, date: todayKey() });
      await setWallet(await fromServer(server), ALL);
      bought = isOwned(item.id, server.owned);
    } catch {
      // still offline
    }
    if (!bought) $('status').textContent = `Could not buy: ${err.message}`;
  } finally {
    state.busy = false;
    state.buying = '';
    render();
  }
  if (!bought) return;
  setMood($('mascot'), 'wow');
  await equip(item, kind); // a new pet or theme is used right away
  // Fashion achievements count pets and themes.
  const result = await checkAchievements(state.settings);
  const rewards = result.won.reduce((sum, w) => sum + w.reward, 0);
  if (rewards) await setWallet({ ...state.wallet, xp: state.wallet.xp + rewards }, ['xp']);
  await celebrate(state.settings, result.toCelebrate);
}

async function init() {
  mountNav();
  setMood($('mascot'), 'happy');
  state.settings = await getSettings();
  if (missingSettings(state.settings).length) {
    $('wallet').textContent = '$—';
    $('status').textContent = 'Settings are missing. Open Settings first.';
    return;
  }
  await loadWallet();
}

// Another learner chosen in Settings: this page must not keep buying for the previous one.
chrome.storage.onChanged?.addListener((changes, area) => {
  if (area === 'local' && changes.settings && state.settings
    && (changes.settings.newValue?.userId || '') !== state.settings.userId) location.reload();
});
$('tabPets').addEventListener('click', () => { state.tab = 'pets'; render(); });
$('tabThemes').addEventListener('click', () => { state.tab = 'themes'; render(); });
init();
