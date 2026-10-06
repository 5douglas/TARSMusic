jest.mock('../subsonicService');

const mockSetScanStatus = jest.fn();
const mockSetLoading = jest.fn();
const mockSetError = jest.fn();

jest.mock('../../store/scanStatusStore', () => ({
  scanStatusStore: {
    getState: jest.fn(() => ({
      setScanStatus: mockSetScanStatus,
      setLoading: mockSetLoading,
      setError: mockSetError,
    })),
  },
}));

import {
  getScanStatus as apiGetScanStatus,
  startScan as apiStartScan,
} from '../subsonicService';
import {
  startPolling,
  stopPolling,
  fetchScanStatus,
  startScan,
} from '../scanService';

const mockGetScanStatus = apiGetScanStatus as jest.Mock;
const mockStartScan = apiStartScan as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  stopPolling();
  mockSetScanStatus.mockClear();
  mockSetLoading.mockClear();
  mockSetError.mockClear();
  mockGetScanStatus.mockReset();
  mockStartScan.mockReset();
});

afterEach(() => {
  stopPolling();
  jest.useRealTimers();
});

describe('startPolling / stopPolling', () => {
  it('polls at 2s intervals and updates store', async () => {
    mockGetScanStatus.mockResolvedValue({ scanning: true, count: 10 });
    startPolling();

    await jest.advanceTimersByTimeAsync(2000);
    expect(mockGetScanStatus).toHaveBeenCalledTimes(1);
    expect(mockSetScanStatus).toHaveBeenCalledWith({ scanning: true, count: 10 });

    await jest.advanceTimersByTimeAsync(2000);
    expect(mockGetScanStatus).toHaveBeenCalledTimes(2);
  });

  it('no-ops if already polling', () => {
    mockGetScanStatus.mockResolvedValue({ scanning: true, count: 0 });
    startPolling();
    startPolling();

    jest.advanceTimersByTime(2000);
    // Only one interval should be running, so only one call
    expect(mockGetScanStatus).toHaveBeenCalledTimes(1);
  });

  it('stops polling when scan completes', async () => {
    mockGetScanStatus.mockResolvedValue({ scanning: false, count: 100 });
    startPolling();

    await jest.advanceTimersByTimeAsync(2000);
    expect(mockSetScanStatus).toHaveBeenCalledWith({ scanning: false, count: 100 });

    // Timer should be cleared; no more calls
    await jest.advanceTimersByTimeAsync(4000);
    expect(mockGetScanStatus).toHaveBeenCalledTimes(1);
  });

  it('stopPolling clears the interval', async () => {
    mockGetScanStatus.mockResolvedValue({ scanning: true, count: 5 });
    startPolling();
    stopPolling();

    await jest.advanceTimersByTimeAsync(4000);
    expect(mockGetScanStatus).not.toHaveBeenCalled();
  });

  it('stopPolling is safe to call when not polling', () => {
    expect(() => stopPolling()).not.toThrow();
  });

  it('does not update store when getScanStatus returns null', async () => {
    mockGetScanStatus.mockResolvedValue(null);
    startPolling();

    await jest.advanceTimersByTimeAsync(2000);
    expect(mockSetScanStatus).not.toHaveBeenCalled();
  });
});

describe('fetchScanStatus', () => {
  it('sets loading, updates store on success, and clears loading', async () => {
    mockGetScanStatus.mockResolvedValue({ scanning: false, count: 50, lastScan: null, folderCount: null });
    await fetchScanStatus();

    expect(mockSetLoading).toHaveBeenCalledWith(true);
    expect(mockSetScanStatus).toHaveBeenCalledWith({ scanning: false, count: 50, lastScan: null, folderCount: null });
    expect(mockSetLoading).toHaveBeenCalledWith(false);
  });

  it('starts polling when scan is in progress', async () => {
    mockGetScanStatus.mockResolvedValue({ scanning: true, count: 10 });
    await fetchScanStatus();

    expect(mockSetScanStatus).toHaveBeenCalled();
    // Verify polling was started by advancing timers
    mockGetScanStatus.mockResolvedValue({ scanning: true, count: 20 });
    await jest.advanceTimersByTimeAsync(2000);
    expect(mockGetScanStatus).toHaveBeenCalledTimes(2);
  });

  it('stops polling when scan is not in progress', async () => {
    // Start polling first
    mockGetScanStatus.mockResolvedValue({ scanning: true, count: 5 });
    startPolling();

    // Now fetchScanStatus returns not scanning
    mockGetScanStatus.mockResolvedValue({ scanning: false, count: 100 });
    await fetchScanStatus();

    mockGetScanStatus.mockClear();
    await jest.advanceTimersByTimeAsync(4000);
    expect(mockGetScanStatus).not.toHaveBeenCalled();
  });

  it('sets error when result is null', async () => {
    mockGetScanStatus.mockResolvedValue(null);
    await fetchScanStatus();

    expect(mockSetError).toHaveBeenCalledWith('Failed to fetch scan status');
    expect(mockSetLoading).toHaveBeenCalledWith(false);
  });
});

describe('startScan', () => {
  it('sets loading, starts scan, and starts polling on success', async () => {
    mockStartScan.mockResolvedValue({ scanning: true, count: 0 });
    await startScan();

    expect(mockSetLoading).toHaveBeenCalledWith(true);
    expect(mockSetScanStatus).toHaveBeenCalledWith({ scanning: true, count: 0 });
    expect(mockSetLoading).toHaveBeenCalledWith(false);

    // Verify polling started
    mockGetScanStatus.mockResolvedValue({ scanning: true, count: 5 });
    await jest.advanceTimersByTimeAsync(2000);
    expect(mockGetScanStatus).toHaveBeenCalled();
  });

  it('passes fullScan parameter to API', async () => {
    mockStartScan.mockResolvedValue({ scanning: true, count: 0 });
    await startScan(true);
    expect(mockStartScan).toHaveBeenCalledWith(true);
  });

  it('sets error when result is null', async () => {
    mockStartScan.mockResolvedValue(null);
    await startScan();

    expect(mockSetError).toHaveBeenCalledWith('Failed to start scan');
    expect(mockSetLoading).toHaveBeenCalledWith(false);
  });

  it('does not start polling when scan result is not scanning', async () => {
    mockStartScan.mockResolvedValue({ scanning: false, count: 100 });
    await startScan();

    mockGetScanStatus.mockClear();
    await jest.advanceTimersByTimeAsync(4000);
    expect(mockGetScanStatus).not.toHaveBeenCalled();
  });
});
