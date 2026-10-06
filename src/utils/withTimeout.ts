/**
 * Run an async operation with a timeout. Returns the operation's result on
 * success, or the literal string `'timeout'` if the timeout elapses first.
 *
 * Implemented as a `Promise.race` so a timeout resolves even when the work
 * itself never settles (e.g. a bare fetch with no abort wiring). The operation
 * also receives an AbortSignal that fires on timeout; it should propagate the
 * signal to any fetch/axios/XHR calls it makes so in-flight requests are
 * actually cancelled rather than orphaned — but the caller is protected either
 * way.
 *
 * Non-timeout errors from the work body bubble up unchanged.
 */
export async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T | 'timeout'> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      ctrl.abort();
      resolve('timeout');
    }, ms);
  });
  try {
    return await Promise.race([work(ctrl.signal), timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
