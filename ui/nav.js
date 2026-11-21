// Icon rail in the top-left corner: Practice, History, Settings in the same window.
// isBusy() true -> a cute "Leave practice?" popup before going to another page.
import { NAV_ITEMS, activeNav, createLeaveGuard } from '../lib/nav.js';
import { ICONS } from './icons.js';
import { setMood } from './mascot.js';
import { syncTheme } from './theme-sync.js';

export function mountNav({ isBusy = () => false } = {}) {
  syncTheme();
  const current = activeNav(location.pathname);
  const confirmLeave = createLeaveGuard({ isBusy, ask: askLeave });
  // The Mac app asks the page before loading another one in this window.
  window.__boConfirmLeave = confirmLeave;

  async function go(page) {
    if (await confirmLeave()) location.assign(chrome.runtime.getURL(page));
  }

  const rail = document.createElement('nav');
  rail.className = 'nav-rail';
  rail.setAttribute('aria-label', 'Pages');
  NAV_ITEMS.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `nav-btn${item.id === current ? ' active' : ''}`;
    btn.setAttribute('aria-label', item.label);
    if (item.id === current) btn.setAttribute('aria-current', 'page');
    btn.innerHTML = `${ICONS[item.icon]}<span class="nav-tip" role="tooltip">${item.label}</span>`;
    btn.addEventListener('click', () => {
      btn.blur();
      if (item.id !== current) go(item.page);
    });
    rail.append(btn);
  });
  document.body.prepend(rail);
  document.body.classList.add('has-nav');
  return { go };
}

function askLeave() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'leave-overlay';
    overlay.innerHTML = `
      <div class="leave-card card" role="dialog" aria-modal="true" aria-labelledby="leaveTitle">
        <div class="mascot leave-mascot"></div>
        <h2 id="leaveTitle">Leave practice?</h2>
        <p>You are in the middle of a practice. Your progress is saved, so you can come back and finish it later.</p>
        <div class="leave-actions">
          <button type="button" class="btn btn-ghost" data-answer="leave">Leave</button>
          <button type="button" class="btn btn-primary" data-answer="stay">Keep practicing</button>
        </div>
      </div>`;
    setMood(overlay.querySelector('.leave-mascot'), 'bye');
    const finish = (answer) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(answer);
    };
    // Esc or a click outside keeps practicing; keys never reach the practice page meanwhile.
    const onKey = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    };
    overlay.addEventListener('click', (e) => {
      const answer = e.target.closest('[data-answer]')?.dataset.answer;
      if (answer) finish(answer === 'leave');
      else if (e.target === overlay) finish(false);
    });
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    overlay.querySelector('[data-answer="stay"]').focus();
  });
}
