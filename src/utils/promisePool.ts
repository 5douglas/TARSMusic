/**
 * Bounded-concurrency promise pool. Runs `worker` against every item in `items`
 * with at most `concurrency` in flight at once. One worker failure does NOT
 * kill the pool — all items are attempted, and the returned object separates
 * fulfilled from rejected results.
 *
 * Abort: when `signal` fires, in-flight workers receive a forked AbortSignal
 * (so they can cancel their fetch/stream work) and no new workers are started.
 * The result surfaces `aborted: true` in that case.
 *
 * Order is NOT preserved — fulfilled/rejected arrays are in completion order.
 */
export interface PoolItemSuccess<T, R> {
  item: T;
  value: R;
}

export interface PoolItemFailure<T> {
  item: T;
  error: unknown;
}

export interface PoolResult<T, R> {
  fulfilled: Array<PoolItemSuccess<T, R>>;
  rejected: Array<PoolItemFailure<T>>;
  aborted: boolean;
}

export interface PoolOptions {
  concurrency: number;
  signal?: AbortSignal;
}

export async function runPool<T, R>(
  items: readonly T[],
  worker: (item: T, signal: AbortSignal) => Promise<R>,
  options: PoolOptions,
): Promise<PoolResult<T, R>> {
  const fulfilled: Array<PoolItemSuccess<T, R>> = [];
  const rejected: Array<PoolItemFailure<T>> = [];
  const concurrency = Math.max(1, Math.floor(options.concurrency));
  const parentSignal = options.signal;

  if (items.length === 0) {
    return { fulfilled, rejected, aborted: parentSignal?.aborted ?? false };
  }

  let cursor = 0;
  let aborted = parentSignal?.aborted ?? false;

  const runNext = async (): Promise<void> => {
    while (true) {
      if (aborted || parentSignal?.aborted) {
        aborted = true;
        return;
      }
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      // Fork a per-item AbortController so workers can observe aborts.
      const ctrl = new AbortController();
      const onParentAbort = () => ctrl.abort();
      if (parentSignal) {
        if (parentSignal.aborted) ctrl.abort();
        else parentSignal.addEventListener('abort', onParentAbort, { once: true });
      }
      try {
        const value = await worker(item, ctrl.signal);
        fulfilled.push({ item, value });
      } catch (error) {
        rejected.push({ item, error });
      } finally {
        if (parentSignal) {
          parentSignal.removeEventListener('abort', onParentAbort);
        }
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, runNext);
  await Promise.all(workers);

  return { fulfilled, rejected, aborted: aborted || (parentSignal?.aborted ?? false) };
}
