import { runPool } from '../promisePool';

describe('runPool', () => {
  it('returns an empty result for empty input', async () => {
    const worker = jest.fn();
    const result = await runPool([], worker, { concurrency: 4 });
    expect(result.fulfilled).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.aborted).toBe(false);
    expect(worker).not.toHaveBeenCalled();
  });

  it('runs every item through the worker', async () => {
    const items = [1, 2, 3, 4, 5];
    const result = await runPool(items, async (n) => n * 2, { concurrency: 2 });
    expect(result.fulfilled).toHaveLength(5);
    expect(result.rejected).toHaveLength(0);
    const values = result.fulfilled.map((f) => f.value).sort((a, b) => a - b);
    expect(values).toEqual([2, 4, 6, 8, 10]);
  });

  it('respects the concurrency cap', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);
    await runPool(
      items,
      async () => {
        inFlight++;
        if (inFlight > maxInFlight) maxInFlight = inFlight;
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
      },
      { concurrency: 3 },
    );
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(0);
  });

  it('isolates worker errors; pool keeps draining', async () => {
    const items = ['ok1', 'fail', 'ok2', 'fail', 'ok3'];
    const result = await runPool(
      items,
      async (item) => {
        if (item === 'fail') throw new Error('boom');
        return item;
      },
      { concurrency: 2 },
    );
    expect(result.fulfilled.map((f) => f.value).sort()).toEqual(['ok1', 'ok2', 'ok3']);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0].error).toBeInstanceOf(Error);
    expect(result.aborted).toBe(false);
  });

  it('does not start new workers after abort is fired', async () => {
    const controller = new AbortController();
    const started: number[] = [];
    const items = Array.from({ length: 10 }, (_, i) => i);
    const promise = runPool(
      items,
      async (n) => {
        started.push(n);
        await new Promise((r) => setTimeout(r, 10));
        return n;
      },
      { concurrency: 2, signal: controller.signal },
    );
    // Abort after the first iteration's workers kick off.
    await new Promise((r) => setTimeout(r, 1));
    controller.abort();
    const result = await promise;
    expect(result.aborted).toBe(true);
    // Workers that had already begun complete and land in fulfilled; the
    // important invariant is we didn't launch all 10.
    expect(started.length).toBeLessThan(items.length);
  });

  it('returns aborted=true immediately if signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const worker = jest.fn();
    const items = [1, 2, 3];
    const result = await runPool(items, worker, {
      concurrency: 2,
      signal: controller.signal,
    });
    expect(result.aborted).toBe(true);
    // No work should dispatch past the immediate-abort check.
    expect(worker).not.toHaveBeenCalled();
    expect(result.fulfilled).toHaveLength(0);
    expect(result.rejected).toHaveLength(0);
  });

  it('forwards a per-item signal that fires when the parent aborts', async () => {
    const controller = new AbortController();
    let workerSignal: AbortSignal | undefined;
    const items = [1];
    const promise = runPool(
      items,
      async (_n, signal) => {
        workerSignal = signal;
        await new Promise((resolve) => {
          signal.addEventListener('abort', resolve);
        });
        throw new Error('cancelled');
      },
      { concurrency: 1, signal: controller.signal },
    );
    await new Promise((r) => setTimeout(r, 1));
    controller.abort();
    await promise;
    expect(workerSignal?.aborted).toBe(true);
  });

  it('normalises bad concurrency values', async () => {
    const items = [1, 2, 3];
    const result = await runPool(items, async (n) => n, { concurrency: 0 });
    expect(result.fulfilled).toHaveLength(3);
  });

  it('caps workers to item count when concurrency > items.length', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = [1, 2];
    await runPool(
      items,
      async () => {
        inFlight++;
        if (inFlight > maxInFlight) maxInFlight = inFlight;
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
      },
      { concurrency: 10 },
    );
    expect(maxInFlight).toBeLessThanOrEqual(items.length);
  });
});
