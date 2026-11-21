import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCodeGs, makeSheet } from './helpers/gas-mock.js';

test('add, duplicate add and list', () => {
  const { post } = loadCodeGs();
  assert.equal(post({ action: 'add', word: { word: 'Cat', meaning_vi: 'meo' } }).status, 'added');
  assert.equal(post({ action: 'add', word: { word: 'cat' } }).status, 'exists');
  const words = post({ action: 'list' }).words;
  assert.equal(words.length, 1);
  assert.equal(words[0].meaning_vi, 'meo');
});

test('a review sent twice with the same rid is counted once', () => {
  const { post, sheets } = loadCodeGs();
  const id = post({ action: 'add', word: { word: 'dog' } }).word.id;
  post({ action: 'review', results: [{ id, needsReview: true, rid: 'r1' }] });
  post({ action: 'review', results: [{ id, needsReview: true, rid: 'r1' }] });
  post({ action: 'review', results: [{ id, needsReview: false, rid: 'r2' }] });
  const word = post({ action: 'list' }).words[0];
  assert.equal(Number(word.review_count), 2);
  assert.equal(Number(word.fail_count), 1);
  assert.equal(String(word.flagged), 'false');
  assert.ok(sheets.Words.rows[0].includes('last_review_id'));
});

test('columns are found by header name, extra user columns are kept', () => {
  const words = makeSheet([
    ['word', 'notes', 'id', 'meaning_vi', 'review_count', 'fail_count', 'flagged', 'last_reviewed', 'added_at'],
    ['bird', 'my note', 'w1', 'chim', 0, 0, false, '', '2026-11-01'],
  ]);
  const { post } = loadCodeGs({ Words: words });
  const listed = post({ action: 'list' }).words[0];
  assert.equal(listed.id, 'w1');
  assert.equal(listed.meaning_vi, 'chim');
  post({ action: 'review', results: [{ id: 'w1', needsReview: false, rid: 'x' }] });
  assert.equal(words.rows[1][1], 'my note');
  assert.equal(words.rows[1][0], 'bird');
  assert.equal(Number(words.rows[1][4]), 1);
});

test('blank rows do not shift which row gets updated', () => {
  const history = makeSheet([
    ['date', 'rounds', 'best_xp', 'best_passed', 'total', 'best_avg_score', 'again_words', 'updated_at', 'last_round_key'],
    ['2026-11-01', 1, 10, 1, 3, 50, '', '', 'k1'],
    ['', '', '', '', '', '', '', '', ''],
    ['2026-11-03', 1, 20, 2, 3, 60, '', '', 'k3'],
  ]);
  const { post } = loadCodeGs({ History: history });
  post({ action: 'history-save', date: '2026-11-03', round: { key: 'k3b', xp: 50, passed: 3, total: 3, avgScore: 90, again: [] } });
  assert.equal(history.rows[1][2], 10);
  assert.equal(history.rows[3][2], 50);
  assert.equal(history.rows[3][1], 2);
});

test('the same round saved twice is counted once', () => {
  const { post } = loadCodeGs();
  const round = { key: '2026-11-20#1', xp: 30, passed: 1, total: 2, avgScore: 80, again: ['x'] };
  post({ action: 'history-save', date: '2026-11-20', round });
  const second = post({ action: 'history-save', date: '2026-11-20', round });
  assert.equal(second.day.rounds, 1);
  assert.equal(post({ action: 'history-list' }).days.length, 1);
});

test('wrong token is refused', () => {
  const { post } = loadCodeGs();
  assert.equal(post({ token: 'nope', action: 'list' }).ok, false);
});

// ---------- learners ----------

test('the first learner claims rows saved before learners existed', () => {
  const { post } = loadCodeGs();
  post({ action: 'add', word: { word: 'cat' } });
  post({ action: 'history-save', date: '2026-11-20', round: { key: 'k', xp: 10, passed: 1, total: 1, avgScore: 80, again: [] } });
  const created = post({ action: 'users-create', id: 'bo_abcd1234', name: 'Bo' });
  assert.equal(created.user.id, 'bo_abcd1234');
  assert.equal(created.claimed, 2);
  assert.deepEqual(post({ action: 'list', userId: 'bo_abcd1234' }).words.map((w) => w.word), ['cat']);
  assert.equal(post({ action: 'history-list', userId: 'bo_abcd1234' }).days.length, 1);
  assert.equal(post({ action: 'users-create', id: 'an_abcd1234', name: 'An' }).claimed, 0);
});

test('each learner sees and changes only their own words and history', () => {
  const { post } = loadCodeGs();
  post({ action: 'users-create', id: 'bo_abcd1234', name: 'Bo' });
  post({ action: 'users-create', id: 'an_abcd1234', name: 'An' });
  const bo = post({ action: 'add', userId: 'bo_abcd1234', word: { word: 'cat' } });
  assert.equal(post({ action: 'add', userId: 'an_abcd1234', word: { word: 'Cat' } }).status, 'added');
  assert.equal(post({ action: 'add', userId: 'bo_abcd1234', word: { word: 'cat' } }).status, 'exists');
  assert.equal(post({ action: 'list', userId: 'bo_abcd1234' }).words.length, 1);
  assert.equal(post({ action: 'list', userId: 'an_abcd1234' }).words.length, 1);

  // An cannot review Bo's word.
  assert.equal(post({ action: 'review', userId: 'an_abcd1234', results: [{ id: bo.word.id, needsReview: true, rid: 'r' }] }).updated, 0);
  assert.equal(post({ action: 'review', userId: 'bo_abcd1234', results: [{ id: bo.word.id, needsReview: true, rid: 'r' }] }).updated, 1);

  const round = { key: 'k1', xp: 10, passed: 1, total: 1, avgScore: 80, again: [] };
  post({ action: 'history-save', userId: 'bo_abcd1234', date: '2026-11-21', round });
  post({ action: 'history-save', userId: 'an_abcd1234', date: '2026-11-21', round: { ...round, xp: 50 } });
  assert.equal(Number(post({ action: 'history-list', userId: 'bo_abcd1234' }).days[0].best_xp), 10);
  assert.equal(Number(post({ action: 'history-list', userId: 'an_abcd1234' }).days[0].best_xp), 50);
});

test('renaming keeps the id; users-create is safe to repeat; bad ids are refused', () => {
  const { post } = loadCodeGs();
  post({ action: 'users-create', id: 'bo_abcd1234', name: 'Bo' });
  assert.equal(post({ action: 'users-create', id: 'bo_abcd1234', name: 'Other' }).user.name, 'Bo');
  assert.equal(post({ action: 'users-rename', id: 'bo_abcd1234', name: 'Bo Bo' }).user.name, 'Bo Bo');
  assert.deepEqual(post({ action: 'users-list' }).users.map((u) => [u.id, u.name]), [['bo_abcd1234', 'Bo Bo']]);
  assert.equal(post({ action: 'users-create', id: 'Bad Id', name: 'X' }).ok, false);
  assert.equal(post({ action: 'users-create', id: 'x_abcd1234', name: '   ' }).ok, false);
  assert.equal(post({ action: 'users-rename', id: 'nobody_abcd1234', name: 'X' }).ok, false);
});

test('requests without a learner keep the old behaviour', () => {
  const { post } = loadCodeGs();
  post({ action: 'users-create', id: 'bo_abcd1234', name: 'Bo' });
  post({ action: 'add', userId: 'bo_abcd1234', word: { word: 'cat' } });
  assert.equal(post({ action: 'list' }).words.length, 1);
});

// ---------- XP wallet ----------

const objects = (sheet) => {
  const [head, ...rows] = sheet.rows;
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
};
const BO = 'bo_abcd1234';
const D = '2026-11-21';
const newLearner = () => {
  const gs = loadCodeGs();
  gs.post({ action: 'users-create', id: BO, name: 'Bo' });
  return gs;
};

test('new learner starts with 2000 XP and one grant row', () => {
  const { post, sheets } = newLearner();
  const w = post({ action: 'wallet-get', userId: BO, date: D });
  assert.equal(w.ok, true);
  assert.equal(w.xp, 2000);
  assert.equal(w.earnedToday, 0);
  assert.deepEqual(w.owned, []);
  const ledger = objects(sheets.Ledger);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].kind, 'grant');
  assert.equal(Number(ledger[0].amount), 2000);
});

test('older learner with an empty xp cell is granted 2000 once', () => {
  const users = makeSheet([['id', 'name', 'created_at', 'updated_at'], [BO, 'Bo', '', '']]);
  const { post, sheets } = loadCodeGs({ Users: users });
  assert.equal(post({ action: 'wallet-get', userId: BO, date: D }).xp, 2000);
  assert.equal(post({ action: 'wallet-get', userId: BO, date: D }).xp, 2000);
  assert.equal(objects(sheets.Ledger).filter((r) => r.kind === 'grant').length, 1);
  assert.equal(post({ action: 'wallet-get', userId: 'zz_abcd1234', date: D }).ok, false);
});

test('earn is credited once per tx id', () => {
  const { post, sheets } = newLearner();
  const a = post({ action: 'wallet-earn', userId: BO, txId: 't1', date: D, amount: 50, ref: 'w1' });
  const b = post({ action: 'wallet-earn', userId: BO, txId: 't1', date: D, amount: 50, ref: 'w1' });
  assert.deepEqual([a.credited, a.xp, a.earnedToday], [50, 2050, 50]);
  assert.deepEqual([b.credited, b.xp, b.earnedToday], [50, 2050, 50]);
  assert.equal(objects(sheets.Ledger).filter((r) => r.kind === 'earn').length, 1);
  const day = objects(sheets.History).find((r) => r.date === D && r.user_id === BO);
  assert.equal(Number(day.xp_earned), 50);
  assert.equal(Number(day.rounds), 0);
});

test('earn stops at 200 a day and a new day starts a new cap', () => {
  const { post } = newLearner();
  post({ action: 'wallet-earn', userId: BO, txId: 't1', date: D, amount: 150 });
  const capped = post({ action: 'wallet-earn', userId: BO, txId: 't2', date: D, amount: 100 });
  assert.deepEqual([capped.credited, capped.earnedToday, capped.xp], [50, 200, 2200]);
  const none = post({ action: 'wallet-earn', userId: BO, txId: 't3', date: D, amount: 10 });
  assert.deepEqual([none.credited, none.xp], [0, 2200]);
  const next = post({ action: 'wallet-earn', userId: BO, txId: 't4', date: '2026-11-22', amount: 100 });
  assert.deepEqual([next.credited, next.earnedToday, next.xp], [100, 100, 2300]);
  assert.equal(post({ action: 'wallet-get', userId: BO, date: D }).earnedToday, 200);
});

test('spend refuses when the wallet is short and counts each tx once', () => {
  const { post, sheets } = newLearner();
  const once = post({ action: 'wallet-spend', userId: BO, txId: 'h1', date: D, amount: 5, kind: 'hint', ref: 'w1' });
  const twice = post({ action: 'wallet-spend', userId: BO, txId: 'h1', date: D, amount: 5, kind: 'hint', ref: 'w1' });
  assert.deepEqual([once.ok, once.xp, twice.ok, twice.xp], [true, 1995, true, 1995]);
  const users = sheets.Users;
  const xpCol = users.rows[0].indexOf('xp');
  users.rows[1][xpCol] = 3; // the admin edits the wallet in the Sheet
  const short = post({ action: 'wallet-spend', userId: BO, txId: 'h2', date: D, amount: 5, kind: 'hint' });
  assert.deepEqual([short.ok, short.error, short.xp], [false, 'not_enough_xp', 3]);
  assert.equal(objects(sheets.Ledger).filter((r) => r.kind === 'hint').length, 1);
  // Hints never count toward the day's earnings.
  assert.equal(post({ action: 'wallet-get', userId: BO, date: D }).earnedToday, 0);
});

test('history with points keeps the best points and leaves best_xp alone', () => {
  const { post, sheets } = newLearner();
  post({ action: 'history-save', userId: BO, date: D, round: { key: 'old', xp: 300, passed: 3, total: 3, avgScore: 90, again: [] } });
  post({ action: 'wallet-earn', userId: BO, txId: 't1', date: D, amount: 40 });
  post({ action: 'history-save', userId: BO, date: D, round: { key: 'r2', points: 120, xp: 120, passed: 2, total: 3, avgScore: 80, again: [] } });
  post({ action: 'history-save', userId: BO, date: D, round: { key: 'r3', points: 80, xp: 80, passed: 3, total: 3, avgScore: 99, again: [] } });
  const day = objects(sheets.History).filter((r) => r.date === D && r.user_id === BO);
  assert.equal(day.length, 1);
  assert.deepEqual([Number(day[0].best_points), Number(day[0].best_xp), Number(day[0].rounds), Number(day[0].xp_earned)], [120, 300, 3, 40]);
  assert.equal(Number(day[0].best_passed), 2);
});

// ---------- achievements ----------

import { readFileSync } from 'node:fs';
import { ACHIEVEMENTS, TIERS } from '../lib/achievements.js';

const round = (key, extra = {}) => ({ key, points: 100, xp: 100, passed: 2, total: 2, avgScore: 90, again: [], noHint: true, flawless: true, great: 2, ...extra });

test('Code.gs uses the same achievement thresholds and rewards as the app', () => {
  const src = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
  const catalog = JSON.parse(src.match(/const ACHIEVEMENT_CATALOG = (\{[\s\S]*?\});/)[1]);
  const rewards = JSON.parse(src.match(/const TIER_REWARDS = (\[[^\]]*\]);/)[1]);
  assert.deepEqual(rewards, TIERS.map((t) => t.reward));
  assert.deepEqual(catalog, Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, { measure: a.measure, thresholds: a.thresholds }])));
});

test('stats start at zero for a new learner', () => {
  const { post } = newLearner();
  const out = post({ action: 'stats', userId: BO, date: D });
  assert.equal(out.ok, true);
  assert.deepEqual(out.stats, { streak_best: 0, rounds_no_hint: 0, flawless_best: 0, owned: 0, words: 0, great_words: 0, full_days: 0, earned_total: 0 });
  assert.deepEqual(out.claimed, []);
  assert.equal(out.xp, 2000);
});

test('stats count rounds, runs, streaks, words and money; repeats count once', () => {
  const { post, sheets } = newLearner();
  post({ action: 'add', userId: BO, word: { word: 'cat' } });
  post({ action: 'add', userId: BO, word: { word: 'dog' } });
  post({ action: 'add', word: { word: 'legacy' } }); // no learner: not counted
  post({ action: 'history-save', userId: BO, date: '2026-11-19', round: round('a') });
  post({ action: 'history-save', userId: BO, date: '2026-11-20', round: round('b') });
  post({ action: 'history-save', userId: BO, date: '2026-11-20', round: round('b') }); // retry
  post({ action: 'history-save', userId: BO, date: '2026-11-21', round: round('c', { flawless: false, noHint: true, great: 1 }) });
  post({ action: 'history-save', userId: BO, date: '2026-11-21', round: round('d') });
  post({ action: 'wallet-earn', userId: BO, txId: 'e1', date: '2026-11-21', amount: 200 });
  post({ action: 'wallet-earn', userId: BO, txId: 'e2', date: '2026-11-20', amount: 30 });
  const { stats } = post({ action: 'stats', userId: BO, date: D });
  assert.deepEqual(stats, { streak_best: 3, rounds_no_hint: 4, flawless_best: 2, owned: 0, words: 2, great_words: 7, full_days: 1, earned_total: 230 });
  const users = objects(sheets.Users);
  assert.deepEqual([Number(users[0].flawless_run), Number(users[0].flawless_best)], [1, 2]);
});

test('a claim pays the tier reward once and refuses tiers not reached', () => {
  const { post, sheets } = newLearner();
  post({ action: 'history-save', userId: BO, date: D, round: round('a') });
  const first = post({ action: 'achievement-claim', userId: BO, achievementId: 'sharp', tier: 0, date: D });
  assert.deepEqual([first.ok, first.reward, first.xp], [true, 50, 2050]);
  const again = post({ action: 'achievement-claim', userId: BO, achievementId: 'sharp', tier: 0, date: D });
  assert.deepEqual([again.ok, again.reward, again.xp], [true, 0, 2050]);
  const early = post({ action: 'achievement-claim', userId: BO, achievementId: 'sharp', tier: 1, date: D });
  assert.deepEqual([early.ok, early.error], [false, 'not_reached']);
  assert.equal(post({ action: 'achievement-claim', userId: BO, achievementId: 'nope', tier: 0, date: D }).ok, false);
  assert.equal(post({ action: 'achievement-claim', userId: BO, achievementId: 'sharp', tier: 9, date: D }).ok, false);
  const { claimed } = post({ action: 'stats', userId: BO, date: D });
  assert.deepEqual(claimed.map((c) => [c.id, Number(c.tier)]), [['sharp', 0]]);
  assert.equal(objects(sheets.Ledger).filter((r) => r.kind === 'reward').length, 1);
  // Rewards are not practice earnings.
  assert.equal(post({ action: 'wallet-get', userId: BO, date: D }).earnedToday, 0);
});

test('an older round sent again after a newer one is not counted twice', () => {
  const { post } = newLearner();
  post({ action: 'history-save', userId: BO, date: D, round: round('r1') });
  post({ action: 'history-save', userId: BO, date: D, round: round('r2', { flawless: false }) });
  post({ action: 'history-save', userId: BO, date: D, round: round('r1') }); // reply was lost, outbox sends it again
  const { stats } = post({ action: 'stats', userId: BO, date: D });
  assert.deepEqual([stats.rounds_no_hint, stats.great_words, stats.flawless_best], [2, 4, 1]);
  assert.equal(Number(post({ action: 'history-list', userId: BO }).days[0].rounds), 2);
});

// ---------- shop ----------

import { PETS, THEMES } from '../lib/shop.js';

test('Code.gs sells the same items at the same prices as the app', () => {
  const src = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
  const prices = JSON.parse(src.match(/const SHOP_PRICES = (\{[\s\S]*?\});/)[1]);
  const free = JSON.parse(src.match(/const FREE_ITEMS = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
  const app = [...PETS, ...THEMES];
  assert.deepEqual(prices, Object.fromEntries(app.filter((i) => i.price > 0).map((i) => [i.id, i.price])));
  assert.deepEqual(free.sort(), app.filter((i) => i.price === 0).map((i) => i.id).sort());
});

test('buying takes the price once, adds the item and counts for Fashion', () => {
  const { post, sheets } = newLearner();
  post({ action: 'wallet-earn', userId: BO, txId: 'e', date: D, amount: 200 });
  const users = sheets.Users;
  users.rows[1][users.rows[0].indexOf('xp')] = 6000; // the admin gives money
  const pet = post({ action: 'shop-buy', userId: BO, itemId: 'fox-girl', date: D });
  assert.deepEqual([pet.ok, pet.xp, pet.owned], [true, 4500, ['fox-girl']]);
  const theme = post({ action: 'shop-buy', userId: BO, itemId: 'night', date: D });
  assert.deepEqual([theme.ok, theme.xp, theme.owned], [true, 500, ['fox-girl', 'night']]);
  const again = post({ action: 'shop-buy', userId: BO, itemId: 'night', date: D });
  assert.deepEqual([again.ok, again.error, again.xp], [false, 'already_owned', 500]);
  const poor = post({ action: 'shop-buy', userId: BO, itemId: 'bear-boy', date: D });
  assert.deepEqual([poor.ok, poor.error, poor.xp], [false, 'not_enough_xp', 500]);
  assert.equal(post({ action: 'shop-buy', userId: BO, itemId: 'mochi', date: D }).ok, false);
  assert.equal(post({ action: 'shop-buy', userId: BO, itemId: 'unicorn', date: D }).ok, false);
  assert.equal(objects(sheets.Ledger).filter((r) => r.kind === 'buy').length, 2);
  assert.equal(post({ action: 'stats', userId: BO, date: D }).stats.owned, 2);
  assert.deepEqual(post({ action: 'wallet-get', userId: BO, date: D }).owned, ['fox-girl', 'night']);
});

test('equipping needs an owned or free item and is saved for the learner', () => {
  const { post, sheets } = newLearner();
  sheets.Users.rows[1][sheets.Users.rows[0].indexOf('xp')] = 5000;
  assert.equal(post({ action: 'shop-equip', userId: BO, kind: 'theme', itemId: 'night' }).ok, false);
  post({ action: 'shop-buy', userId: BO, itemId: 'night', date: D });
  const on = post({ action: 'shop-equip', userId: BO, kind: 'theme', itemId: 'night' });
  assert.deepEqual([on.ok, on.theme, on.pet], [true, 'night', '']);
  assert.equal(post({ action: 'shop-equip', userId: BO, kind: 'pet', itemId: 'mochi' }).ok, true);
  assert.equal(post({ action: 'shop-equip', userId: BO, kind: 'pet', itemId: 'night' }).ok, false); // a theme is not a pet
  assert.equal(post({ action: 'shop-equip', userId: BO, kind: 'theme', itemId: 'lavender' }).theme, 'lavender');
  const w = post({ action: 'wallet-get', userId: BO, date: D });
  assert.deepEqual([w.theme, w.pet], ['lavender', 'mochi']);
});
