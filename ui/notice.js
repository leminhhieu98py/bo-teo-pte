// Popups in the app style: a question (showConfirm) and a message (showNotice).
import { setMood } from './mascot.js';

// A two-button question in the same look. Resolves true for yes.
export function showConfirm({ title, text, mood = 'think', yes = 'Yes', no = 'Not now', preview = '' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'leave-overlay';
    overlay.innerHTML = `<div class="leave-card card" role="dialog" aria-modal="true">
      ${preview ? `<div class="confirm-preview">${preview}</div>` : '<div class="mascot leave-mascot"></div>'}
      <h2></h2><p></p>
      <div class="leave-actions"><button type="button" class="btn btn-ghost" data-answer="no"></button><button type="button" class="btn btn-primary" data-answer="yes"></button></div>
    </div>`;
    overlay.querySelector('h2').textContent = title;
    overlay.querySelector('p').textContent = text;
    overlay.querySelector('[data-answer="yes"]').textContent = yes;
    overlay.querySelector('[data-answer="no"]').textContent = no;
    if (!preview) setMood(overlay.querySelector('.leave-mascot'), mood);
    const before = document.activeElement;
    const finish = (answer) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (before && before.isConnected && typeof before.focus === 'function') before.focus();
      resolve(answer);
    };
    const onKey = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') finish(false);
    };
    // The second click of a double-click lands on the backdrop: ignore it instead of answering no.
    const opened = Date.now();
    overlay.addEventListener('click', (e) => {
      const answer = e.target.closest('[data-answer]')?.dataset.answer;
      if (answer && Date.now() - opened > 250) finish(answer === 'yes');
      else if (e.target === overlay && Date.now() - opened > 400) finish(false);
    });
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    overlay.querySelector('[data-answer="yes"]').focus();
  });
}

// A cute one-button popup (same look as the "Leave practice?" popup). Resolves when closed.

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
