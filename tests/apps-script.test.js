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
