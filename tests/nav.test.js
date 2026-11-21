import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV_ITEMS, activeNav, createLeaveGuard } from '../lib/nav.js';

test('NAV_ITEMS lists Practice, History, Achievements and Settings in that order', () => {
  assert.deepEqual(NAV_ITEMS.map((i) => [i.id, i.label, i.page]), [
    ['practice', 'Practice', 'review/review.html'],
    ['history', 'History', 'history/history.html'],
    ['achievements', 'Achievements', 'achievements/achievements.html'],
    ['settings', 'Settings', 'options/options.html'],
  ]);
});

test('activeNav finds the item of the current page', () => {
  assert.equal(activeNav('/review/review.html'), 'practice');
  assert.equal(activeNav('/abc/history/history.html'), 'history');
  assert.equal(activeNav('/options/options.html'), 'settings');
  assert.equal(activeNav('/popup/popup.html'), '');
});

test('confirmLeave does not ask when not busy', async () => {
  let asked = 0;
  const confirmLeave = createLeaveGuard({ isBusy: () => false, ask: async () => { asked++; return false; } });
  assert.equal(await confirmLeave(), true);
  assert.equal(asked, 0);
});

test('confirmLeave asks when busy and returns the answer', async () => {
  const stay = createLeaveGuard({ isBusy: () => true, ask: async () => false });
  assert.equal(await stay(), false);
  const leave = createLeaveGuard({ isBusy: () => true, ask: async () => true });
  assert.equal(await leave(), true);
});

test('confirmLeave shares one popup between callers until it is answered', async () => {
  let asked = 0;
  let answer;
  const confirmLeave = createLeaveGuard({
    isBusy: () => true,
    ask: () => { asked++; return new Promise((resolve) => { answer = resolve; }); },
  });
  const a = confirmLeave();
  const b = confirmLeave();
  answer(true);
  assert.deepEqual(await Promise.all([a, b]), [true, true]);
  assert.equal(asked, 1);
  const c = confirmLeave();
  answer(false);
  assert.equal(await c, false);
  assert.equal(asked, 2);
});

test('confirmLeave leaves when the popup fails', async () => {
  const confirmLeave = createLeaveGuard({ isBusy: () => true, ask: async () => { throw new Error('x'); } });
  assert.equal(await confirmLeave(), true);
});
