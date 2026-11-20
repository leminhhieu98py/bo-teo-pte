// Error entries for the error log and the detail line shown under friendly messages.
// Never put API keys or tokens in here.

export const MAX_LOG = 20;
const MAX_MESSAGE = 300;

export function errorEntry(err, { where = '', model = '', word = '', now = new Date() } = {}) {
  return {
    time: now.toISOString(),
    where,
    model: model || err?.model || '',
    status: Number(err?.status) || 0,
    code: err?.code || '',
    name: err?.name || 'Error',
    message: String(err?.message ?? err ?? '').slice(0, MAX_MESSAGE),
    word: word || err?.word || '',
  };
}

// "gemini-3.1-flash-lite · HTTP 503 · other: This model is currently experiencing high demand."
export function formatDetail(entry) {
  const source = entry.model || (entry.name === 'SheetError' ? 'Sheet' : '');
  const parts = [source, entry.status ? `HTTP ${entry.status}` : '', entry.code || ''].filter(Boolean);
  return parts.length ? `${parts.join(' · ')}: ${entry.message}` : String(entry.message ?? '');
}

export function pushLog(log, entry, max = MAX_LOG) {
  return [entry, ...(Array.isArray(log) ? log : [])].slice(0, max);
}
