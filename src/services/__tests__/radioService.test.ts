jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

const mockSimilar = jest.fn();
const mockSimilar2 = jest.fn();
const mockRandom = jest.fn();
jest.mock('../subsonicService', () => ({
  getSimilarSongs: (...args: unknown[]) => mockSimilar(...args),
  getSimilarSongs2: (...args: unknown[]) => mockSimilar2(...args),
  getRandomSongsFiltered: (...args: unknown[]) => mockRandom(...args),
}));

const mockAddToQueue = jest.fn().mockResolvedValue(undefined);
jest.mock('../playerService', () => ({
  addToQueue: (...args: unknown[]) => mockAddToQueue(...args),
}));

import { autoplayStore } from '../../store/autoplayStore';
import { connectivityStore } from '../../store/connectivityStore';
import { offlineModeStore } from '../../store/offlineModeStore';
import { playbackSettingsStore } from '../../store/playbackSettingsStore';
import { playerStore } from '../../store/playerStore';
import {
  buildRadioBatch,
  isNearQueueEnd,
  maybeExtendQueue,
  pickRadioSeeds,
  RADIO_BATCH_SIZE,
  selectRadioSongs,
} from '../radioService';

import type { Child } from '../subsonicService';

const song = (id: string, artistId = `ar-${id}`, genre?: string) =>
  ({ id, title: id, artistId, genre, isDir: false }) as Child;

beforeEach(() => {
  mockSimilar.mockReset().mockResolvedValue([]);
  mockSimilar2.mockReset().mockResolvedValue([]);
  mockRandom.mockReset().mockResolvedValue([]);
  mockAddToQueue.mockClear();
  autoplayStore.setState({ autoplayEnabled: true });
  playbackSettingsStore.setState({ repeatMode: 'off' });
  offlineModeStore.setState({ offlineMode: false });
  connectivityStore.setState({ hasConnection: true, isServerReachable: true });
});

describe('isNearQueueEnd', () => {
  it('is true only with two or fewer tracks left after the current one', () => {
    expect(isNearQueueEnd(10, 7)).toBe(true);
    expect(isNearQueueEnd(10, 9)).toBe(true);
    expect(isNearQueueEnd(10, 6)).toBe(false);
    expect(isNearQueueEnd(1, 0)).toBe(true);
    expect(isNearQueueEnd(0, 0)).toBe(false);
    expect(isNearQueueEnd(5, null)).toBe(false);
  });
});

describe('pickRadioSeeds', () => {
  it('takes the current song and up to two earlier songs by other artists', () => {
    const q = [song('a', 'x'), song('b', 'y'), song('c', 'z'), song('d', 'z'), song('e', 'w')];
    expect(pickRadioSeeds(q, 3).map((s) => s.id)).toEqual(['d', 'b', 'a']);
    expect(pickRadioSeeds(q, 0).map((s) => s.id)).toEqual(['a']);
  });
});

describe('selectRadioSongs', () => {
  it('skips excluded songs and caps each artist before using leftovers', () => {
    const layer = [song('1', 'x'), song('2', 'x'), song('3', 'x'), song('4', 'y'), song('q', 'z')];
    const picked = selectRadioSongs([layer], new Set(['q']), 4);
    expect(picked.map((s) => s.id)).toEqual(['1', '2', '4', '3']);
  });

  it('dedupes across layers', () => {
    const picked = selectRadioSongs([[song('1')], [song('1'), song('2')]], new Set(), 5);
    expect(picked.map((s) => s.id)).toEqual(['1', '2']);
  });
});

describe('buildRadioBatch', () => {
  it('falls back to artist and genre matches when the song has few similar songs', async () => {
    mockSimilar.mockResolvedValue([song('s1', 'a1')]);
    mockSimilar2.mockResolvedValue([song('s2', 'a2')]);
    mockRandom.mockResolvedValue([song('s3', 'a3'), song('seed')]);
    const batch = await buildRadioBatch([song('seed', 'ar', 'MPB')], new Set(['seed']), 10);
    expect(batch.map((s) => s.id)).toEqual(['s1', 's2', 's3']);
    expect(mockRandom).toHaveBeenCalledWith({ size: 20, genre: 'MPB' });
  });
});

describe('maybeExtendQueue', () => {
  const queue = [song('a'), song('b')];

  it('appends similar songs when the queue is about to end', async () => {
    mockSimilar.mockResolvedValue([song('n1'), song('n2'), song('a')]);
    playerStore.setState({ queue, currentTrackIndex: 1, queueLoading: false });
    await maybeExtendQueue();
    expect(mockAddToQueue).toHaveBeenCalledTimes(1);
    const added = mockAddToQueue.mock.calls[0][0] as Child[];
    expect(added.map((s) => s.id).sort()).toEqual(['n1', 'n2']);
    expect(added.length).toBeLessThanOrEqual(RADIO_BATCH_SIZE);
  });

  it('does nothing with repeat on, autoplay off or offline', async () => {
    mockSimilar.mockResolvedValue([song('n1')]);
    playerStore.setState({ queue: [song('r1')], currentTrackIndex: 0, queueLoading: false });

    playbackSettingsStore.setState({ repeatMode: 'all' });
    await maybeExtendQueue();
    playbackSettingsStore.setState({ repeatMode: 'off' });
    autoplayStore.setState({ autoplayEnabled: false });
    await maybeExtendQueue();
    autoplayStore.setState({ autoplayEnabled: true });
    offlineModeStore.setState({ offlineMode: true });
    await maybeExtendQueue();

    expect(mockAddToQueue).not.toHaveBeenCalled();
  });

  it('does not retry the same queue state after an empty result', async () => {
    playerStore.setState({ queue: [song('e1')], currentTrackIndex: 0, queueLoading: false });
    await maybeExtendQueue();
    await maybeExtendQueue();
    expect(mockSimilar).toHaveBeenCalledTimes(1);
    expect(mockAddToQueue).not.toHaveBeenCalled();
  });
});
