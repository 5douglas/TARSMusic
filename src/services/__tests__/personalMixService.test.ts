jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

const mockSimilar = jest.fn();
const mockTop = jest.fn();
jest.mock('../subsonicService', () => ({
  getSimilarSongs2: (...args: unknown[]) => mockSimilar(...args),
  getTopSongs: (...args: unknown[]) => mockTop(...args),
}));

import { personalMixStore } from '../../store/personalMixStore';
import { dateKey } from '../../utils/dateKey';
import {
  buildArtistMix,
  getDailyRecommendations,
  rankTopArtists,
  seededShuffle,
} from '../personalMixService';

import type { AlbumID3, Child } from '../subsonicService';

const song = (id: string, artistId: string, playCount?: number) =>
  ({ id, title: id, artistId, playCount, isDir: false }) as Child;

beforeEach(() => {
  mockSimilar.mockReset();
  mockTop.mockReset();
  personalMixStore.setState({ dailyDate: null, dailySongs: [] });
});

describe('rankTopArtists', () => {
  it('ranks app plays first and tops up from frequently played albums without duplicates', () => {
    const ranked = rankTopArtists(
      {
        Djavan: { count: 3, artistId: 'ar1' },
        Caetano: { count: 9, artistId: 'ar2' },
        'No id': { count: 50 },
      },
      [
        { id: 'al1', name: 'A', artist: 'Djavan', artistId: 'ar1' },
        { id: 'al2', name: 'B', artist: 'Gal', artistId: 'ar3' },
      ] as AlbumID3[],
      3,
    );
    expect(ranked.map((a) => a.name)).toEqual(['Caetano', 'Djavan', 'Gal']);
  });
});

describe('seededShuffle', () => {
  it('is stable for a seed and keeps every item', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const a = seededShuffle(items, '2026-10-22');
    expect(seededShuffle(items, '2026-10-22')).toEqual(a);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
    expect(seededShuffle(items, '2026-10-23')).not.toEqual(a);
  });
});

describe('buildArtistMix', () => {
  it('blends top and similar songs without duplicates', async () => {
    mockTop.mockResolvedValue([song('t1', 'ar1'), song('t2', 'ar1')]);
    mockSimilar.mockResolvedValue([song('s1', 'ar9'), song('t1', 'ar1'), song('s2', 'ar8')]);
    const mix = await buildArtistMix({ id: 'ar1', name: 'Djavan', plays: 3 }, 30);
    expect(mix.map((s) => s.id).sort()).toEqual(['s1', 's2', 't1', 't2']);
    expect(mockTop).toHaveBeenCalledWith('Djavan', 10);
    expect(mockSimilar).toHaveBeenCalledWith('ar1', 30);
  });
});

describe('getDailyRecommendations', () => {
  const artists = [
    { id: 'ar1', name: 'Djavan', plays: 5 },
    { id: 'ar2', name: 'Caetano', plays: 2 },
  ];

  it('prefers unplayed songs from other artists and caches the day', async () => {
    mockSimilar.mockImplementation(async (id: string) =>
      id === 'ar1'
        ? [song('own', 'ar2'), song('new1', 'ar7'), song('old1', 'ar7', 4)]
        : [song('new2', 'ar8'), song('new1', 'ar7')],
    );
    const songs = await getDailyRecommendations(artists, 2);
    expect(songs.map((s) => s.id).sort()).toEqual(['new1', 'new2']);
    expect(personalMixStore.getState().dailyDate).toBe(dateKey(Date.now()));

    mockSimilar.mockClear();
    await expect(getDailyRecommendations(artists, 2)).resolves.toEqual(songs);
    expect(mockSimilar).not.toHaveBeenCalled();
  });

  it('rebuilds on a new day or when forced', async () => {
    personalMixStore.setState({ dailyDate: '2000-01-01', dailySongs: [song('stale', 'ar9')] });
    mockSimilar.mockResolvedValue([song('fresh', 'ar7')]);
    await expect(getDailyRecommendations(artists, 5)).resolves.toEqual([song('fresh', 'ar7')]);
    mockSimilar.mockResolvedValue([song('again', 'ar7')]);
    await expect(getDailyRecommendations(artists, 5, true)).resolves.toEqual([song('again', 'ar7')]);
  });

  it('does not cache an empty day', async () => {
    mockSimilar.mockResolvedValue([]);
    await expect(getDailyRecommendations(artists, 5)).resolves.toEqual([]);
    expect(personalMixStore.getState().dailyDate).toBeNull();
  });
});
