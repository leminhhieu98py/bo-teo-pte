// Achievements page: every category with its medals, progress to the next one, and the rewards.
import { setMood } from '../ui/mascot.js';
import { mountNav } from '../ui/nav.js';
import { medalSvg } from '../ui/medals.js';
import { checkAchievements, celebrate } from '../ui/achievements-check.js';
import { ACHIEVEMENTS, TIERS, progress, goalText } from '../lib/achievements.js';
import { getSettings, missingSettings, getWallet, saveWallet } from '../lib/storage.js';
import { formatMoney } from '../lib/xp.js';

const $ = (id) => document.getElementById(id);

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function niceDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function card(a, value, unlocked) {
  const p = progress(value, a.thresholds);
  const got = Math.max(p.tier, ...a.thresholds.map((_, i) => (unlocked.has(i) ? i : -1)));
  const box = el('article', 'ach');
  const top = el('div', 'ach-top');
  const medal = el('div');
  medal.innerHTML = medalSvg(got, a.icon, { size: 64 });
  const text = el('div');
  text.append(el('h2', '', a.name), el('p', '', a.description));
  top.append(medal, text);
  if (p.next === null) top.append(el('span', 'done', 'All medals!'));
  box.append(top);

  const tiers = el('div', 'tiers');
  a.thresholds.forEach((goal, i) => {
    const has = unlocked.has(i);
    const tier = el('div', `tier${has ? ' got' : ''}${i === p.tier + 1 ? ' next' : ''}`);
    const m = el('div');
    m.innerHTML = medalSvg(has ? i : -1, a.icon, { size: 40, shine: false });
    tier.append(m, el('b', '', TIERS[i].name), el('span', '', goalText(a, goal)), el('span', '', `+${formatMoney(TIERS[i].reward)}`));
    tier.title = has ? `${TIERS[i].name} - unlocked ${niceDate(unlocked.get(i))}` : `${TIERS[i].name} - ${goalText(a, goal)} to unlock`;
    tiers.append(tier);
  });
  box.append(tiers);

  if (p.next !== null) {
    const bar = el('div', 'bar');
    const fill = el('i');
    fill.style.width = `${Math.round(p.ratio * 100)}%`;
    bar.append(fill);
    const show = (v) => (a.measure === 'earned_total' ? formatMoney(v) : String(v));
    const label = el('div', 'bar-label');
    label.append(el('span', '', `Now: ${show(Number(value) || 0)}`), el('span', '', `Next: ${goalText(a, p.next)}`));
    box.append(bar, label);
  }
  return box;
}

function render(stats, claimed) {
  const byId = new Map();
  for (const c of claimed || []) {
    if (!byId.has(c.id)) byId.set(c.id, new Map());
    byId.get(c.id).set(Number(c.tier), c.unlocked_at);
  }
  $('list').replaceChildren(...ACHIEVEMENTS.map((a) => card(a, stats?.[a.measure], byId.get(a.id) || new Map())));
  const count = (claimed || []).length;
  $('medalCount').textContent = count;
  $('medalTotal').textContent = ACHIEVEMENTS.reduce((sum, a) => sum + a.thresholds.length, 0);
  setMood($('mascot'), count >= 10 ? 'wow' : count > 0 ? 'happy' : 'idle');
}

async function init() {
  mountNav();
  setMood($('mascot'), 'think');
  const settings = await getSettings();
  if (missingSettings(settings).length) {
    $('loading').hidden = true;
    $('status').textContent = 'Settings are missing. Open Settings first.';
    return;
  }
  const cached = await getWallet();
  const mine = cached && cached.userId === settings.userId ? cached : null;
  if (mine) $('wallet').textContent = formatMoney(mine.xp);

  // Claim first so the page already shows the new medals behind the celebration.
  const result = await checkAchievements(settings);
  $('list').setAttribute('aria-busy', 'false');
  if (!result.stats) {
    $('loading').hidden = true;
    $('status').textContent = 'Could not load your achievements. Check the internet and try again.';
    render({}, []);
    return;
  }
  // Rewards are added to the cached wallet (which also counts writes still waiting to be sent).
  const rewards = result.won.reduce((sum, w) => sum + w.reward, 0);
  if (mine) {
    const wallet = { ...mine, xp: mine.xp + rewards };
    await saveWallet(wallet);
    $('wallet').textContent = formatMoney(wallet.xp);
  } else if (result.xp !== null) {
    $('wallet').textContent = formatMoney(result.xp);
  }
  render(result.stats, result.claimed);
  await celebrate(settings, result.toCelebrate);
}

init();
