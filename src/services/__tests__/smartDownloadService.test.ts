let mockNetType = 'wifi';
let mockNetCallback: ((state: any) => void) | null = null;

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(() => Promise.resolve({ type: mockNetType, isConnected: mockNetType !== 'none' })),
    addEventListener: jest.fn((cb: (state: any) => void) => {
      mockNetCallback = cb;
      return () => { mockNetCallback = null; };
    }),
  },
}));

let mockOffline = false;
let mockReachable = true;
let mockBlocked = false;
jest.mock('../../store/offlineModeStore', () => ({
  offlineModeStore: { getState: () => ({ offlineMode: mockOffline }) },
}));
jest.mock('../../store/connectivityStore', () => ({
  connectivityStore: { getState: () => ({ isServerReachable: mockReachable }) },
}));
jest.mock('../navidromeReid/reidMarker', () => ({ shouldBlockContent: () => mockBlocked }));
jest.mock('../../store/persistence/db', () => ({ getDb: () => ({}) }));
jest.mock('../../store/playbackSettingsStore', () => ({
  playbackSettingsStore: { getState: () => ({ downloadFormat: 'raw', downloadMaxBitRate: null }) },
}));
jest.mock('../../store/favoritesStore', () => ({
  favoritesStore: { subscribe: jest.fn(() => () => {}) },
}));

const MB = 1024 * 1024;
const song = (id: string, size = 10 * MB) => ({ id, title: id, size, duration: 200 });

let mockFavorites: ReturnType<typeof song>[] = [];
let mockMostPlayed: ReturnType<typeof song>[] = [];
jest.mock('../../db/repository/favorites', () => ({
  listAllStarredSongs: jest.fn(async () => mockFavorites.map((s) => ({ id: s.id, starred: 0, item: s }))),
  starredItemOf: (e: { item: unknown }) => e.item,
}));
jest.mock('../../db/repository/songs', () => ({
  listMostPlayedSongs: jest.fn(async (_db: unknown, limit: number) => mockMostPlayed.slice(0, limit)),
}));

let mockCachedItems: Record<string, unknown> = {};
let mockQueue: Array<{ queueId: string; itemId: string; status: string }> = [];
jest.mock('../../store/musicCacheStore', () => ({
  musicCacheStore: {
    getState: () => ({ cachedItems: mockCachedItems, downloadQueue: mockQueue }),
  },
}));

const mockEnqueueSong = jest.fn(async (s: { id: string }) => {
  mockQueue.push({ queueId: `q-${s.id}`, itemId: `song:${s.id}`, status: 'queued' });
});
const mockDelete = jest.fn(async (itemId: string) => { delete mockCachedItems[itemId]; });
const mockCancel = jest.fn(async (queueId: string) => {
  mockQueue = mockQueue.filter((q) => q.queueId !== queueId);
});
jest.mock('../musicCacheService', () => ({
  enqueueSongDownload: (s: { id: string }) => mockEnqueueSong(s),
  deleteCachedItem: (id: string) => mockDelete(id),
  cancelDownload: (id: string) => mockCancel(id),
  waitForTrackMapsReady: () => Promise.resolve(),
}));

import {
  estimateSongBytes,
  removeSmartDownloads,
  runSmartDownload,
  selectSmartSongs,
  startSmartDownloads,
  stopSmartDownloads,
} from '../smartDownloadService';
import { smartDownloadStore } from '../../store/smartDownloadStore';

const enqueued = () => mockEnqueueSong.mock.calls.map(([s]) => s.id);

beforeEach(() => {
  stopSmartDownloads();
  mockNetType = 'wifi';
  mockOffline = false;
  mockReachable = true;
  mockBlocked = false;
  mockFavorites = [];
  mockMostPlayed = [];
  mockCachedItems = {};
  mockQueue = [];
  mockEnqueueSong.mockClear();
  mockDelete.mockClear();
  mockCancel.mockClear();
  smartDownloadStore.setState({
    enabled: true,
    includeFavorites: true,
    includeMostPlayed: true,
    mostPlayedCount: 100,
    wifiOnly: true,
    maxSizeGB: 1,
    ownedSongIds: [],
    lastResult: null,
    running: false,
  });
});

describe('estimateSongBytes', () => {
  it('uses the file size for original-format downloads', () => {
    expect(estimateSongBytes({ size: 5 * MB, duration: 100 }, 'raw', null)).toBe(5 * MB);
  });

  it('uses the transcoded bitrate when it is smaller than the file', () => {
    // 100 s at 128 kbps = 1.6 MB
    expect(estimateSongBytes({ size: 30 * MB, duration: 100 }, 'mp3', 128)).toBe(100 * 128 * 125);
  });

  it('falls back to a fixed size when nothing is known', () => {
    expect(estimateSongBytes({}, 'raw', null)).toBe(8 * MB);
  });
});

describe('selectSmartSongs', () => {
  it('keeps priority order, dedups and stops at the budget', () => {
    const r = selectSmartSongs(
      [[song('f1') as any, song('m1') as any], [song('m1') as any, song('m2') as any, song('m3') as any]],
      25 * MB,
      (s) => s.size ?? 0,
    );
    expect(r.songs.map((s) => s.id)).toEqual(['f1', 'm1']);
    expect(r.estimatedBytes).toBe(20 * MB);
    expect(r.skippedForSpace).toBe(2);
  });
});

describe('runSmartDownload', () => {
  it('queues favourites then most played and records ownership', async () => {
    mockFavorites = [song('f1')];
    mockMostPlayed = [song('m1'), song('f1'), song('m2')];
    await runSmartDownload({ force: true });
    expect(enqueued()).toEqual(['f1', 'm1', 'm2']);
    expect(smartDownloadStore.getState().ownedSongIds.sort()).toEqual(['f1', 'm1', 'm2']);
    expect(smartDownloadStore.getState().lastResult?.selected).toBe(3);
  });

  it('respects the size limit', async () => {
    smartDownloadStore.setState({ maxSizeGB: 1 });
    mockMostPlayed = [song('big', 900 * MB), song('next', 200 * MB)];
    await runSmartDownload({ force: true });
    expect(enqueued()).toEqual(['big']);
    expect(smartDownloadStore.getState().lastResult?.skippedForSpace).toBe(1);
  });

  it('does nothing off Wi-Fi when Wi-Fi only is on', async () => {
    mockNetType = 'cellular';
    mockFavorites = [song('f1')];
    await runSmartDownload({ force: true });
    expect(enqueued()).toEqual([]);
  });

  it('runs on mobile data when Wi-Fi only is off', async () => {
    mockNetType = 'cellular';
    smartDownloadStore.setState({ wifiOnly: false });
    mockFavorites = [song('f1')];
    await runSmartDownload({ force: true });
    expect(enqueued()).toEqual(['f1']);
  });

  it('does nothing when disabled, offline or during a re-key', async () => {
    mockFavorites = [song('f1')];
    smartDownloadStore.setState({ enabled: false });
    await runSmartDownload({ force: true });
    smartDownloadStore.setState({ enabled: true });
    mockOffline = true;
    await runSmartDownload({ force: true });
    mockOffline = false;
    mockBlocked = true;
    await runSmartDownload({ force: true });
    expect(enqueued()).toEqual([]);
  });

  it('leaves songs the user downloaded alone', async () => {
    mockFavorites = [song('f1')];
    mockCachedItems = { 'song:f1': {} };
    await runSmartDownload({ force: true });
    expect(enqueued()).toEqual([]);
    expect(smartDownloadStore.getState().ownedSongIds).toEqual([]);
  });

  it('removes owned songs that dropped out, never user downloads', async () => {
    smartDownloadStore.setState({ ownedSongIds: ['old'] });
    mockCachedItems = { 'song:old': {}, 'song:mine': {} };
    mockMostPlayed = [song('new')];
    await runSmartDownload({ force: true });
    expect(mockDelete).toHaveBeenCalledWith('song:old');
    expect(mockDelete).not.toHaveBeenCalledWith('song:mine');
    expect(smartDownloadStore.getState().ownedSongIds).toEqual(['new']);
  });

  it('re-queues an owned song whose row was cancelled', async () => {
    smartDownloadStore.setState({ ownedSongIds: ['f1'] });
    mockFavorites = [song('f1')];
    await runSmartDownload({ force: true });
    expect(enqueued()).toEqual(['f1']);
  });
});

describe('network changes', () => {
  it('cancels queued smart rows when leaving Wi-Fi and resumes on return', async () => {
    mockFavorites = [song('f1')];
    startSmartDownloads();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(enqueued()).toEqual(['f1']);

    mockNetCallback?.({ type: 'wifi', isConnected: true });
    mockNetType = 'cellular';
    mockNetCallback?.({ type: 'cellular', isConnected: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(mockCancel).toHaveBeenCalledWith('q-f1');
    expect(mockQueue).toEqual([]);

    mockNetType = 'wifi';
    mockNetCallback?.({ type: 'wifi', isConnected: true });
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(enqueued()).toEqual(['f1', 'f1']);
  });
});

describe('removeSmartDownloads', () => {
  it('removes every owned song and clears ownership', async () => {
    smartDownloadStore.setState({ ownedSongIds: ['a', 'b'] });
    mockCachedItems = { 'song:a': {} };
    mockQueue = [{ queueId: 'q-b', itemId: 'song:b', status: 'queued' }];
    await removeSmartDownloads();
    expect(mockDelete).toHaveBeenCalledWith('song:a');
    expect(mockCancel).toHaveBeenCalledWith('q-b');
    expect(smartDownloadStore.getState().ownedSongIds).toEqual([]);
  });
});
