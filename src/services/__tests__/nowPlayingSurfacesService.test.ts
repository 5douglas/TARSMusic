jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

jest.mock('expo-player-widget', () => ({
  PlayerWidget: {
    setTrack: jest.fn(),
    setArtwork: jest.fn(),
    clearTrack: jest.fn(),
    setLyrics: jest.fn(),
    syncPosition: jest.fn(),
    setLyricsEnabled: jest.fn(),
  },
}));
jest.mock('../imageCacheService', () => ({
  resolveDisplayImage: jest.fn(async () => ({ uri: 'file:///cover.jpg' })),
}));

import { Platform } from 'react-native';
import { PlayerWidget } from 'expo-player-widget';

import { __test, installNowPlayingSurfaces, syncedLines } from '../nowPlayingSurfacesService';
import { lyricsStore } from '../../store/lyricsStore';
import { playbackSettingsStore } from '../../store/playbackSettingsStore';
import { playerStore } from '../../store/playerStore';

const mockNative = PlayerWidget as unknown as Record<string, jest.Mock>;
const track = (id: string) => ({ id, title: `T ${id}`, artist: 'A', album: 'Al', coverArt: `c-${id}` }) as any;
const flush = () => new Promise((r) => setImmediate(r));

const synced = {
  synced: true,
  offsetMs: 100,
  source: 'structured',
  lines: [
    { startMs: 1000, text: 'one' },
    { startMs: 2000, text: 'two' },
  ],
} as any;

beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
});

beforeEach(() => {
  __test.reset();
  Object.values(mockNative).forEach((f) => f.mockClear());
  playerStore.setState({ currentTrack: null, position: 0, playbackState: 'idle' } as any);
  playbackSettingsStore.setState({ lockScreenLyrics: true } as any);
  jest.spyOn(lyricsStore.getState(), 'fetchLyrics').mockResolvedValue(synced);
});

describe('syncedLines', () => {
  it('applies the offset and keeps the texts', () => {
    expect(syncedLines(synced)).toEqual({ starts: [1100, 2100], lines: ['one', 'two'] });
  });

  it('is null for unsynced or empty lyrics', () => {
    expect(syncedLines({ ...synced, synced: false })).toBeNull();
    expect(syncedLines({ ...synced, lines: [] })).toBeNull();
    expect(syncedLines(null)).toBeNull();
  });
});

describe('installNowPlayingSurfaces', () => {
  it('pushes the track, its cover and its synced lyrics', async () => {
    installNowPlayingSurfaces();
    playerStore.setState({ currentTrack: track('s1'), playbackState: 'playing', position: 3 } as any);
    await flush();
    expect(mockNative.setTrack).toHaveBeenCalledWith('T s1', 'A', 'Al');
    expect(mockNative.setArtwork).toHaveBeenCalledWith('file:///cover.jpg');
    expect(mockNative.setLyrics).toHaveBeenCalledWith([1100, 2100], ['one', 'two']);
  });

  it('forwards position and play state', () => {
    installNowPlayingSurfaces();
    playerStore.setState({ currentTrack: track('s1') } as any);
    mockNative.syncPosition.mockClear();
    playerStore.setState({ position: 12.5, playbackState: 'playing' } as any);
    expect(mockNative.syncPosition).toHaveBeenLastCalledWith(12500, true, true);
    playerStore.setState({ playbackState: 'buffering' } as any);
    expect(mockNative.syncPosition).toHaveBeenLastCalledWith(12500, false, true);
    playerStore.setState({ playbackState: 'paused' } as any);
    expect(mockNative.syncPosition).toHaveBeenLastCalledWith(12500, false, false);
  });

  it('skips lyrics when turned off, and sends them when turned back on', async () => {
    playbackSettingsStore.setState({ lockScreenLyrics: false } as any);
    installNowPlayingSurfaces();
    expect(mockNative.setLyricsEnabled).toHaveBeenCalledWith(false);
    playerStore.setState({ currentTrack: track('s1') } as any);
    await flush();
    expect(mockNative.setLyrics).not.toHaveBeenCalled();

    playbackSettingsStore.setState({ lockScreenLyrics: true } as any);
    await flush();
    expect(mockNative.setLyricsEnabled).toHaveBeenLastCalledWith(true);
    expect(mockNative.setLyrics).toHaveBeenCalledWith([1100, 2100], ['one', 'two']);
  });

  it('clears when nothing is loaded', () => {
    installNowPlayingSurfaces();
    playerStore.setState({ currentTrack: track('s1') } as any);
    playerStore.setState({ currentTrack: null } as any);
    expect(mockNative.clearTrack).toHaveBeenCalled();
  });
});
