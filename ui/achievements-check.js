// Claims every achievement tier the learner reached and celebrates each one with a popup.
// Used after a practice round and when the Achievements page opens. Offline: nothing happens.
import { ACHIEVEMENTS, TIERS, newlyReached } from '../lib/achievements.js';
import { getStats, claimAchievement } from '../lib/sheet.js';
import { todayKey } from '../lib/daily.js';
import { formatMoney } from '../lib/xp.js';
import { medalSvg } from './medals.js';
import { setMood } from './mascot.js';

// Returns { stats, claimed, won } (stats/claimed null when the Sheet could not be read).
// onReward(newBalance) runs after each paid tier, before its popup.
export async function checkAchievements(settings, { onReward, celebrate = true } = {}) {
  const base = { url: settings.sheetUrl, token: settings.token, userId: settings.userId, date: todayKey() };
  let data;
  try {
    data = await getStats(base);
  } catch {
    return { stats: null, claimed: null, won: [] };
  }
  const claimed = [...data.claimed];
  const won = [];
  for (const item of newlyReached(data.stats, data.claimed)) {
    try {
      const paid = await claimAchievement({ ...base, achievementId: item.id, tier: item.tier });
      claimed.push({ id: item.id, tier: item.tier, unlocked_at: new Date().toISOString() });
      if (paid.reward > 0) won.push({ ...item, reward: paid.reward, xp: paid.xp });
    } catch {
      // Not reached on the Sheet (stale numbers) or offline: try again next time.
    }
  }
  for (const w of won) {
    await onReward?.(w.xp);
    if (celebrate) await showUnlocked(w);
  }
  return { stats: data.stats, claimed, won };
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
    const close = () => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
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

export function goalText(a, value) {
  return a.measure === 'earned_total' ? `${formatMoney(value)} ${a.unit}` : `${value} ${a.unit}`;
}
