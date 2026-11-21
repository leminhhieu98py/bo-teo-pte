// Claims every achievement tier the learner reached and celebrates each one with a popup.
// Used after a practice round and when the Achievements page opens. Offline: nothing happens.
import { ACHIEVEMENTS, TIERS, newlyReached, goalText } from '../lib/achievements.js';
import { getStats, claimAchievement } from '../lib/sheet.js';
import { todayKey } from '../lib/daily.js';
import { formatMoney } from '../lib/xp.js';
import { medalSvg } from './medals.js';
import { setMood } from './mascot.js';
import { getCelebrated, saveCelebrated } from '../lib/storage.js';

const RECENT_MS = 3 * 24 * 3600 * 1000; // a claim the app missed is still celebrated for 3 days

// Claims every reached tier. Returns { stats, claimed, won, toCelebrate, xp } (stats/claimed null when the
// Sheet could not be read; xp = balance after the claims). won = tiers paid now; toCelebrate also has
// recent tiers that were paid while the app missed the answer (timeout, page closed).
// onReward(newBalance, reward) runs after each paid tier.
export async function checkAchievements(settings, { onReward } = {}) {
  const base = { url: settings.sheetUrl, token: settings.token, userId: settings.userId, date: todayKey() };
  let data;
  try {
    data = await getStats(base);
  } catch (err) {
    return { stats: null, claimed: null, won: [], toCelebrate: [], xp: null, error: err };
  }
  const claimed = [...data.claimed];
  const won = [];
  let xp = data.xp;
  for (const item of newlyReached(data.stats, data.claimed)) {
    try {
      const paid = await claimAchievement({ ...base, achievementId: item.id, tier: item.tier });
      claimed.push({ id: item.id, tier: item.tier, unlocked_at: new Date().toISOString() });
      xp = paid.xp;
      if (paid.reward > 0) {
        won.push({ ...item, reward: paid.reward });
        await onReward?.(paid.xp, paid.reward);
      }
    } catch {
      // Not reached on the Sheet (stale numbers) or offline: try again next time.
    }
  }
  const seen = await celebratedKeys(settings.userId);
  const now = Date.now();
  const missed = data.claimed
    .filter((c) => !seen.has(`${c.id}:${Number(c.tier)}`) && now - new Date(c.unlocked_at).getTime() < RECENT_MS)
    .map((c) => ({ id: c.id, tier: Number(c.tier), reward: TIERS[Number(c.tier)]?.reward || 0 }));
  return { stats: data.stats, claimed, won, toCelebrate: [...missed, ...won], xp };
}

async function celebratedKeys(userId) {
  const saved = await getCelebrated();
  return new Set(saved && saved.userId === userId ? saved.keys : []);
}

// Shows the popups one after another and remembers them, so each tier is celebrated once.
export async function celebrate(settings, list) {
  for (const item of list) {
    await showUnlocked(item);
    const keys = await celebratedKeys(settings.userId);
    keys.add(`${item.id}:${item.tier}`);
    await saveCelebrated({ userId: settings.userId, keys: [...keys] });
  }
}

export function showUnlocked({ id, tier, reward }) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return Promise.resolve();
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'leave-overlay unlock-overlay';
    overlay.innerHTML = `
      <div class="leave-card card unlock-card" role="dialog" aria-modal="true" aria-labelledby="unlockTitle">
        <div class="unlock-rays" aria-hidden="true"></div>
        <div class="unlock-medal">${medalSvg(tier, a.icon, { size: 110 })}</div>
        <p class="unlock-kicker">Achievement unlocked!</p>
        <h2 id="unlockTitle"></h2>
        <p class="unlock-goal"></p>
        <div class="unlock-reward"></div>
        <div class="leave-actions"><button type="button" class="btn btn-primary">Yay!</button></div>
        <div class="mascot unlock-mascot"></div>
      </div>`;
    overlay.querySelector('h2').textContent = `${a.name} · ${TIERS[tier].name}`;
    overlay.querySelector('.unlock-goal').textContent = `${goalText(a, a.thresholds[tier])}`;
    overlay.querySelector('.unlock-reward').textContent = `+${formatMoney(reward)}`;
    setMood(overlay.querySelector('.unlock-mascot'), 'wow');
    const before = document.activeElement; // focus goes back there (the answer box on Practice)
    const close = () => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (before && before.isConnected && typeof before.focus === 'function') before.focus();
      resolve();
    };
    const onKey = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') close();
    };
    overlay.querySelector('button').addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    overlay.querySelector('button').focus();
  });
}
