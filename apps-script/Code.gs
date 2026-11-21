/**
 * Bo co len - Google Apps Script backend.
 *
 * Paste this file into Extensions > Apps Script of your Google Sheet, change TOKEN below to your
 * own secret, then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 * Later updates: Deploy > Manage deployments > Edit > Version: New version (the URL stays the same).
 */
const TOKEN = 'CHANGE_ME';
// Optional: the ID from the sheet URL (.../spreadsheets/d/<ID>/edit). Needed only when this
// script was NOT opened from the sheet via Extensions > Apps Script.
const SHEET_ID = '';

const WORDS = {
  name: 'Words',
  headers: ['id', 'word', 'ipa', 'part_of_speech', 'meaning_vi', 'description_vi', 'example_en', 'example_vi',
    'source_url', 'added_at', 'last_reviewed', 'review_count', 'fail_count', 'flagged', 'last_review_id', 'user_id'],
  key: 'id',
};
const HISTORY = {
  name: 'History',
  headers: ['date', 'rounds', 'best_xp', 'best_passed', 'total', 'best_avg_score', 'again_words', 'updated_at', 'last_round_key', 'user_id'],
  key: 'date',
};
// One row per learner. The id is made once by the app (name_8chars) and never changes.
const USERS = {
  name: 'Users',
  headers: ['id', 'name', 'created_at', 'updated_at'],
  key: 'id',
};
const LEARNER_ID = /^[a-z0-9-]{1,20}_[a-z0-9]{8}$/;

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (TOKEN === 'CHANGE_ME') return reply({ ok: false, error: 'Set TOKEN in Code.gs and deploy again.' });
    if (body.token !== TOKEN) return reply({ ok: false, error: 'Wrong token. Check the app settings.' });

    // userId is optional: requests from older apps (no learners) keep working on every row.
    const userId = body.userId ? String(body.userId) : '';
    if (body.action === 'list') return reply({ ok: true, words: readObjects(WORDS, userId) });
    if (body.action === 'add') return reply(withLock(() => addWord(body.word || {}, userId)));
    if (body.action === 'review') return reply(withLock(() => applyReviews(body.results || [], userId)));
    if (body.action === 'history-save') return reply(withLock(() => saveHistory(String(body.date || ''), body.round || {}, userId)));
    if (body.action === 'history-list') return reply({ ok: true, days: readObjects(HISTORY, userId) });
    if (body.action === 'users-list') return reply({ ok: true, users: readObjects(USERS) });
    if (body.action === 'users-create') return reply(withLock(() => createUser(String(body.id || ''), String(body.name || ''))));
    if (body.action === 'users-rename') return reply(withLock(() => renameUser(String(body.id || ''), String(body.name || ''))));
    return reply({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doGet() {
  return reply({ ok: true, message: 'Bo co len backend is running.' });
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function spreadsheet() {
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No spreadsheet. Open Apps Script from the sheet or set SHEET_ID.');
  return ss;
}

// Returns the sheet with a header row that contains every expected header. Missing headers are
// added at the end, so columns the user added or moved are never overwritten.
function getTable(table) {
  const ss = spreadsheet();
  let sheet = ss.getSheetByName(table.name);
  if (!sheet) sheet = ss.insertSheet(table.name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(table.headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, table.headers.length).setFontWeight('bold');
  }
  const width = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0].map((h) => String(h).trim());
  table.headers.forEach((h) => {
    if (headers.indexOf(h) === -1) {
      headers.push(h);
      sheet.getRange(1, headers.length).setValue(h);
    }
  });
  const col = {};
  headers.forEach((h, i) => { if (h && col[h] === undefined) col[h] = i; });
  return { sheet: sheet, headers: headers, col: col };
}

function cellText(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  return value;
}

// Rows with an empty key are skipped, but every row keeps its real sheet row number.
function readRows(table) {
  const t = getTable(table);
  const lastRow = t.sheet.getLastRow();
  if (lastRow < 2) return { t: t, rows: [] };
  const values = t.sheet.getRange(2, 1, lastRow - 1, t.headers.length).getValues();
  const rows = [];
  values.forEach((v, i) => {
    const obj = {};
    table.headers.forEach((h) => { obj[h] = cellText(v[t.col[h]]); });
    if (table.key === 'date') obj.date = dateText(v[t.col.date]);
    if (String(obj[table.key] || '').trim()) rows.push({ rowNumber: i + 2, obj: obj });
  });
  return { t: t, rows: rows };
}

// With a learner id, only that learner's rows.
function ownedBy(userId) {
  return (row) => !userId || String(row.obj.user_id || '') === userId;
}

function readObjects(table, userId) {
  return readRows(table).rows.filter(ownedBy(userId)).map((r) => r.obj);
}

function writeCells(t, rowNumber, values) {
  Object.keys(values).forEach((h) => {
    const range = t.sheet.getRange(rowNumber, t.col[h] + 1);
    range.setNumberFormat('@');
    range.setValue(values[h]);
  });
}

function appendObject(t, obj) {
  const row = t.headers.map((h) => (obj[h] === undefined ? '' : obj[h]));
  const range = t.sheet.getRange(t.sheet.getLastRow() + 1, 1, 1, t.headers.length);
  range.setNumberFormat('@'); // plain text: Sheets must not turn meanings or dates into numbers
  range.setValues([row]);
}

function addWord(input, userId) {
  const text = String(input.word || '').trim();
  if (!text) return { ok: false, error: 'Missing word' };
  const data = readRows(WORDS);
  // Each learner has their own list: the same word can be saved by two learners.
  const existing = data.rows.filter(ownedBy(userId))
    .find((r) => String(r.obj.word).trim().toLowerCase() === text.toLowerCase());
  if (existing) return { ok: true, status: 'exists', word: existing.obj };

  const word = {
    id: Utilities.getUuid(),
    word: text,
    ipa: input.ipa || '',
    part_of_speech: input.part_of_speech || '',
    meaning_vi: input.meaning_vi || '',
    description_vi: input.description_vi || '',
    example_en: input.example_en || '',
    example_vi: input.example_vi || '',
    source_url: input.source_url || '',
    added_at: new Date().toISOString(),
    last_reviewed: '',
    review_count: 0,
    fail_count: 0,
    flagged: false,
    last_review_id: '',
    user_id: userId || '',
  };
  appendObject(data.t, word);
  return { ok: true, status: 'added', word: word };
}

// Each result carries a rid; a retried request with the same rid is not counted again.
function applyReviews(results, userId) {
  const data = readRows(WORDS);
  data.rows = data.rows.filter(ownedBy(userId));
  const now = new Date().toISOString();
  let updated = 0;
  results.forEach((result) => {
    const row = data.rows.find((r) => String(r.obj.id) === String(result.id));
    if (!row) return;
    if (result.rid && String(row.obj.last_review_id) === String(result.rid)) return;
    const values = {
      last_reviewed: now,
      review_count: (Number(row.obj.review_count) || 0) + 1,
      fail_count: (Number(row.obj.fail_count) || 0) + (result.needsReview ? 1 : 0),
      flagged: Boolean(result.needsReview),
      last_review_id: result.rid || '',
    };
    writeCells(data.t, row.rowNumber, values);
    Object.assign(row.obj, values);
    updated++;
  });
  return { ok: true, updated: updated };
}

// ---------- Daily history: one row per day with the best round (mirrors lib/history.js) ----------

function dateText(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(value);
}

function isBetterRound(a, b) {
  const n = (v) => Number(v) || 0;
  if (n(a.xp) !== n(b.xp)) return n(a.xp) > n(b.xp);
  if (n(a.passed) !== n(b.passed)) return n(a.passed) > n(b.passed);
  return n(a.avgScore) > n(b.avgScore);
}

function saveHistory(date, round, userId) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Bad date' };
  const n = (v) => Number(v) || 0;
  const data = readRows(HISTORY);
  // One row per learner and day (rows without a learner belong to older apps).
  const found = data.rows.find((r) => r.obj.date === date && String(r.obj.user_id || '') === (userId || ''));
  // The same round sent twice (a retry) is not counted again.
  if (found && round.key && String(found.obj.last_round_key) === String(round.key)) return { ok: true, day: found.obj };

  const now = new Date().toISOString();
  const best = {
    best_xp: n(round.xp),
    best_passed: n(round.passed),
    total: n(round.total),
    best_avg_score: n(round.avgScore),
    again_words: (round.again || []).join(', '),
  };
  if (!found) {
    const day = Object.assign({ date: date, rounds: 1 }, best, { updated_at: now, last_round_key: round.key || '', user_id: userId || '' });
    appendObject(data.t, day);
    return { ok: true, day: day };
  }
  const old = found.obj;
  const keep = isBetterRound(round, { xp: old.best_xp, passed: old.best_passed, avgScore: old.best_avg_score });
  const values = Object.assign({ rounds: n(old.rounds) + 1 }, keep ? best : {}, { updated_at: now, last_round_key: round.key || '' });
  writeCells(data.t, found.rowNumber, values);
  return { ok: true, day: Object.assign({}, old, values) };
}

// ---------- learners ----------

function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

// Creating the same id twice returns the first one. The very first learner also gets every row
// saved before learners existed (rows without user_id), so no history is lost.
function createUser(id, name) {
  const clean = cleanName(name);
  if (!LEARNER_ID.test(id)) return { ok: false, error: 'Bad learner id' };
  if (!clean) return { ok: false, error: 'Missing learner name' };
  const users = readRows(USERS);
  const existing = users.rows.find((r) => r.obj.id === id);
  if (existing) return { ok: true, user: existing.obj, claimed: 0 };

  const now = new Date().toISOString();
  const user = { id: id, name: clean, created_at: now, updated_at: now };
  appendObject(users.t, user);
  let claimed = 0;
  if (users.rows.length === 0) {
    [WORDS, HISTORY].forEach((table) => {
      const data = readRows(table);
      data.rows.filter((r) => !String(r.obj.user_id || '')).forEach((r) => {
        writeCells(data.t, r.rowNumber, { user_id: id });
        claimed++;
      });
    });
  }
  return { ok: true, user: user, claimed: claimed };
}

// Only the display name changes; the id stays the same forever.
function renameUser(id, name) {
  const clean = cleanName(name);
  if (!clean) return { ok: false, error: 'Missing learner name' };
  const users = readRows(USERS);
  const row = users.rows.find((r) => r.obj.id === id);
  if (!row) return { ok: false, error: 'Learner not found' };
  const values = { name: clean, updated_at: new Date().toISOString() };
  writeCells(users.t, row.rowNumber, values);
  return { ok: true, user: Object.assign({}, row.obj, values) };
}
