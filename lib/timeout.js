// An abort signal that fires after `ms`. Call done() when the work finishes.
export function timeoutSignal(ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
  return { signal: controller.signal, done: () => clearTimeout(id) };
}
