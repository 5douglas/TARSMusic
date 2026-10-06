import { withTimeout } from '../withTimeout';

describe('withTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves with the work value when it finishes before the timeout', async () => {
    const promise = withTimeout(async () => 'ok', 1000);
    await expect(promise).resolves.toBe('ok');
  });

  it('returns "timeout" when the work does not settle in time', async () => {
    const promise = withTimeout(
      () => new Promise<string>(() => { /* never resolves */ }),
      1000,
    );
    jest.advanceTimersByTime(1000);
    await expect(promise).resolves.toBe('timeout');
  });

  it('propagates non-timeout errors unchanged', async () => {
    const promise = withTimeout(async () => {
      throw new Error('boom');
    }, 1000);
    await expect(promise).rejects.toThrow('boom');
  });

  it('passes an AbortSignal that fires on timeout', async () => {
    let observedSignal: AbortSignal | null = null;
    const promise = withTimeout(
      (signal) => {
        observedSignal = signal;
        return new Promise<string>(() => { /* never resolves */ });
      },
      500,
    );
    jest.advanceTimersByTime(500);
    await expect(promise).resolves.toBe('timeout');
    expect(observedSignal).not.toBeNull();
    expect(observedSignal!.aborted).toBe(true);
  });

  it('does not fire the timeout if work resolves quickly', async () => {
    const result = await withTimeout(async () => 42, 1000);
    expect(result).toBe(42);
    // Advancing past the timeout after resolution must not change anything
    jest.advanceTimersByTime(2000);
  });
});
