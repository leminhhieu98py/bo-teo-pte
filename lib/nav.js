// Pages reachable from the icon rail, and the "leave Practice?" guard. No DOM here.

export const NAV_ITEMS = [
  { id: 'practice', label: 'Practice', page: 'review/review.html', icon: 'practice' },
  { id: 'history', label: 'History', page: 'history/history.html', icon: 'history' },
  { id: 'settings', label: 'Settings', page: 'options/options.html', icon: 'settings' },
];

export function activeNav(pathname) {
  const path = String(pathname || '');
  return NAV_ITEMS.find((item) => path.endsWith(`/${item.page}`))?.id || '';
}

// Returns confirmLeave(): true when the page may be left. Asks only while isBusy(); callers that
// arrive while the popup is open share its answer. A broken popup never traps the learner.
export function createLeaveGuard({ isBusy, ask }) {
  let pending = null;
  return function confirmLeave() {
    if (!isBusy()) return Promise.resolve(true);
    if (!pending) {
      let asked;
      try {
        asked = Promise.resolve(ask()); // the popup shows right away
      } catch (err) {
        asked = Promise.reject(err);
      }
      pending = asked
        .then((answer) => answer === true, () => true)
        .finally(() => { pending = null; });
    }
    return pending;
  };
}
