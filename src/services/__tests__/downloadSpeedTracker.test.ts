jest.mock('expo-async-fs', () => {
  const cbs: Array<(e: { downloadId: string; bytesWritten: number }) => void> = [];
  (global as any).__downloadProgressEmit = (id: string, bytes: number) => {
    cbs.forEach((cb) => cb({ downloadId: id, bytesWritten: bytes }));
  };
  return {
    addDownloadProgressListener: (cb: (e: { downloadId: string; bytesWritten: number }) => void) => {
      cbs.push(cb);
    },
  };
});

import {
  __resetForTesting,
  beginDownload,
  clearDownload,
  getActiveDownloadCount,
  getDownloadSpeed,
} from '../downloadSpeedTracker';

const emitProgress = (global as any).__downloadProgressEmit as (id: string, bytes: number) => void;

beforeEach(() => {
  jest.useFakeTimers();
  __resetForTesting();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('downloadSpeedTracker', () => {
  it('getActiveDownloadCount returns 0 initially', () => {
    expect(getActiveDownloadCount()).toBe(0);
  });

  it('beginDownload and clearDownload manage lifecycle', () => {
    beginDownload('dl-1');
    emitProgress('dl-1', 100);
    emitProgress('dl-1', 200);
    expect(getActiveDownloadCount()).toBe(1);

    clearDownload('dl-1');
    expect(getActiveDownloadCount()).toBe(0);
  });

  it('getDownloadSpeed returns 0 with fewer than 2 samples', () => {
    jest.advanceTimersByTime(15_000);
    beginDownload('dl-few');
    emitProgress('dl-few', 100);
    expect(getDownloadSpeed()).toBe(0);
    clearDownload('dl-few');
  });

  it('getDownloadSpeed calculates bytes per second', () => {
    beginDownload('dl-speed');
    emitProgress('dl-speed', 0);
    jest.advanceTimersByTime(1000);
    emitProgress('dl-speed', 1000);
    jest.advanceTimersByTime(1000);
    emitProgress('dl-speed', 2000);
    const speed = getDownloadSpeed();
    expect(speed).toBeGreaterThan(0);
    // First delta sample at t=1s (1000B), second at t=2s (1000B).
    // totalBytes=2000, elapsed = (t2 - t1) = 1s → 2000 B/s
    expect(speed).toBeCloseTo(2000, -1);
    clearDownload('dl-speed');
  });

  it('prunes samples outside the rolling 10s window', () => {
    beginDownload('dl-prune');
    emitProgress('dl-prune', 0);
    jest.advanceTimersByTime(1000);
    emitProgress('dl-prune', 1000);
    // Advance beyond the 10s window so old samples are pruned
    jest.advanceTimersByTime(11_000);
    expect(getDownloadSpeed()).toBe(0);
    clearDownload('dl-prune');
  });

  it('aggregates speed across multiple concurrent downloads', () => {
    beginDownload('dl-a');
    beginDownload('dl-b');
    emitProgress('dl-a', 0);
    emitProgress('dl-b', 0);
    jest.advanceTimersByTime(1000);
    emitProgress('dl-a', 500);
    jest.advanceTimersByTime(1000);
    emitProgress('dl-b', 500);
    expect(getActiveDownloadCount()).toBe(2);
    const speed = getDownloadSpeed();
    // dl-a: delta 500 at t=1s, dl-b: delta 500 at t=2s
    // totalBytes=1000, elapsed from first sample (t=1s) to last (t=2s) = 1s → 1000 B/s
    expect(speed).toBeGreaterThan(0);
    clearDownload('dl-a');
    clearDownload('dl-b');
  });

  it('beginDownload re-enables a previously cleared download ID', () => {
    beginDownload('dl-reuse');
    emitProgress('dl-reuse', 100);
    clearDownload('dl-reuse');
    expect(getActiveDownloadCount()).toBe(0);
    // Re-register the same ID
    beginDownload('dl-reuse');
    emitProgress('dl-reuse', 50);
    expect(getActiveDownloadCount()).toBe(1);
    clearDownload('dl-reuse');
  });

  it('clearDownload ignores late progress events', () => {
    beginDownload('dl-late');
    emitProgress('dl-late', 100);
    clearDownload('dl-late');
    emitProgress('dl-late', 200);
    expect(getActiveDownloadCount()).toBe(0);
  });

  it('does not count zero-delta progress events as samples', () => {
    beginDownload('dl-zero');
    emitProgress('dl-zero', 100);
    jest.advanceTimersByTime(1000);
    emitProgress('dl-zero', 100); // same bytesWritten, 0 delta
    // Only 1 sample (from the first emit), so speed should be 0
    expect(getDownloadSpeed()).toBe(0);
    clearDownload('dl-zero');
  });
});
