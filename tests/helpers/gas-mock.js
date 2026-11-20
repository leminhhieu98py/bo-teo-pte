// Runs apps-script/Code.gs in Node with a tiny in-memory SpreadsheetApp, for tests only.
import { readFileSync } from 'node:fs';

export function makeSheet(rows = []) {
  return {
    rows,
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((m, r) => Math.max(m, r.length), 0),
    appendRow: (r) => rows.push([...r]),
    setFrozenRows: () => {},
    getRange: (r, c, nr = 1, nc = 1) => ({
      setFontWeight() { return this; },
      setNumberFormat() { return this; },
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => rows[r - 1 + i]?.[c - 1 + j] ?? '')),
      setValues: (vals) => vals.forEach((v, i) => {
        rows[r - 1 + i] = rows[r - 1 + i] || [];
        v.forEach((cell, j) => { rows[r - 1 + i][c - 1 + j] = cell; });
      }),
      setValue: (v) => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = v; },
    }),
  };
}

export function loadCodeGs(sheets = {}) {
  const src = readFileSync(new URL('../../apps-script/Code.gs', import.meta.url), 'utf8')
    .replace("const TOKEN = 'CHANGE_ME';", "const TOKEN = 'tok';");
  const ss = { getSheetByName: (n) => sheets[n], insertSheet: (n) => (sheets[n] = makeSheet()) };
  let uuid = 0;
  const api = new Function('SpreadsheetApp', 'ContentService', 'LockService', 'Utilities', 'Session', `${src}\nreturn { doPost };`)(
    { getActiveSpreadsheet: () => ss, openById: () => ss },
    { createTextOutput: (t) => ({ setMimeType: () => t }), MimeType: { JSON: 'json' } },
    { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    { getUuid: () => `id-${++uuid}`, formatDate: (d) => d.toISOString().slice(0, 10) },
    { getScriptTimeZone: () => 'UTC' },
  );
  const post = (body) => JSON.parse(api.doPost({ postData: { contents: JSON.stringify({ token: 'tok', ...body }) } }));
  return { post, sheets };
}
