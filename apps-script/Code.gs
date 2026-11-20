/**
 * Word Buddy - Google Apps Script backend.
 *
 * Paste this file into Extensions > Apps Script of your Google Sheet,
 * change TOKEN below to your own secret, then Deploy > New deployment > Web app
 * (Execute as: Me, Who has access: Anyone). See README.md.
 */
const TOKEN = 'CHANGE_ME';
// Optional: the ID from the sheet URL (.../spreadsheets/d/<ID>/edit). Needed only when this
// script was NOT opened from the sheet via Extensions > Apps Script.
const SHEET_ID = '';
const SHEET_NAME = 'Words';
const HEADERS = [
  'id', 'word', 'ipa', 'part_of_speech', 'meaning_vi', 'description_vi', 'example_en', 'example_vi',
  'source_url', 'added_at', 'last_reviewed', 'review_count', 'fail_count', 'flagged',
];

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (TOKEN === 'CHANGE_ME') return reply({ ok: false, error: 'Set TOKEN in Code.gs and deploy again.' });
    if (body.token !== TOKEN) return reply({ ok: false, error: 'Wrong token. Check Word Buddy settings.' });

    if (body.action === 'list') return reply({ ok: true, words: readWords() });
    if (body.action === 'add') return reply(withLock(() => addWord(body.word || {})));
    if (body.action === 'review') return reply(withLock(() => applyReviews(body.results || [])));
    return reply({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doGet() {
  return reply({ ok: true, message: 'Word Buddy backend is running.' });
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

function getSheet() {
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No spreadsheet. Open Apps Script from the sheet or set SHEET_ID.');
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function readRows(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
}

function rowToWord(row) {
  const word = {};
  HEADERS.forEach((h, i) => {
    const v = row[i];
    word[h] = v instanceof Date ? v.toISOString() : v;
  });
  return word;
}

function readWords() {
  return readRows(getSheet()).filter((r) => r[0]).map(rowToWord);
}

function addWord(input) {
  const text = String(input.word || '').trim();
  if (!text) return { ok: false, error: 'Missing word' };
  const sheet = getSheet();
  const rows = readRows(sheet);
  const existing = rows.find((r) => String(r[1]).trim().toLowerCase() === text.toLowerCase());
  if (existing) return { ok: true, status: 'exists', word: rowToWord(existing) };

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
  };
  // Store everything as plain text so Sheets does not auto-convert dates or numbers in meanings.
  const row = HEADERS.map((h) => word[h]);
  const range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, HEADERS.length);
  range.setNumberFormat('@');
  range.setValues([row]);
  return { ok: true, status: 'added', word: word };
}

function applyReviews(results) {
  const sheet = getSheet();
  const rows = readRows(sheet);
  const now = new Date().toISOString();
  const col = (name) => HEADERS.indexOf(name);
  let updated = 0;

  results.forEach((result) => {
    const index = rows.findIndex((r) => r[0] === result.id);
    if (index === -1) return;
    const row = rows[index];
    row[col('last_reviewed')] = now;
    row[col('review_count')] = Number(row[col('review_count')] || 0) + 1;
    if (result.needsReview) row[col('fail_count')] = Number(row[col('fail_count')] || 0) + 1;
    row[col('flagged')] = Boolean(result.needsReview);
    sheet.getRange(index + 2, 1, 1, HEADERS.length).setValues([row]);
    updated++;
  });
  return { ok: true, updated: updated };
}
