// A cute one-button popup (same look as the "Leave practice?" popup). Resolves when closed.
import { setMood } from './mascot.js';

export function showNotice({ title, text, mood = 'think', button = 'OK' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'leave-overlay';
    const card = document.createElement('div');
    card.className = 'leave-card card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    const mascot = document.createElement('div');
    mascot.className = 'mascot leave-mascot';
    const h2 = document.createElement('h2');
    h2.textContent = title;
    const p = document.createElement('p');
    p.textContent = text;
    const actions = document.createElement('div');
    actions.className = 'leave-actions';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn btn-primary';
    ok.textContent = button;
    actions.append(ok);
    card.append(mascot, h2, p, actions);
    overlay.append(card);
    setMood(mascot, mood);

    const close = () => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve();
    };
    // Keys never reach the page behind the popup; Enter, Space and Esc close it.
    const onKey = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    ok.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    ok.focus();
  });
}
