// Outbox for Sheet writes: an item is stored BEFORE it is sent and removed only after the Sheet
// accepted it, so closing the page mid-request never loses a write (the Sheet ignores repeats).
// store: { get(key) -> Promise<value>, set(key, value) -> Promise }.

export function createOutbox(store, key = 'outbox') {
  let chain = Promise.resolve();
  // Run read-modify-write steps one at a time so parallel adds do not overwrite each other.
  const locked = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };
  const read = async () => (await store.get(key)) || [];

  async function add(kind, payload) {
    const item = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, kind, payload };
    await locked(async () => store.set(key, [...(await read()), item]));
    return item;
  }

  async function remove(id) {
    await locked(async () => store.set(key, (await read()).filter((i) => i.id !== id)));
  }

  async function send(item, sendFn) {
    try {
      await sendFn(item);
      await remove(item.id);
      return true;
    } catch {
      return false;
    }
  }

  async function flush(sendFn) {
    let sent = 0;
    let failed = 0;
    for (const item of await read()) {
      if (await send(item, sendFn)) sent++;
      else failed++;
    }
    return { sent, failed };
  }

  return { add, remove, send, flush, all: read };
}
