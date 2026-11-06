jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

const mockSimilar2 = jest.fn();
const mockTop = jest.fn();
const mockRandom = jest.fn();
jest.mock('../subsonicService', () => ({
  ...jest.requireActual('../subsonicService'),
  getSimilarSongs2: (...args: unknown[]) => mockSimilar2(...args),
  getTopSongs: (...args: unknown[]) => mockTop(...args),
  getRandomSongsFiltered: (...args: unknown[]) => mockRandom(...args),
}));

import type { Child } from 'subsonic-api';

import { ensureNormalizedSchema } from '../../db/createNormalizedTables';
import { upsertSongs } from '../../db/repository/songs';
import { personalMixStore } from '../../store/personalMixStore';
import { getDb } from '../../store/persistence/db';
import { dateKey } from '../../utils/dateKey';
import { getDailyMixSongs } from '../dailyMixService';

const song = (id: string, artistId: string, extra: Partial<Child> = {}): Child =>
  ({ id, title: id, artistId, artist: artistId, albumId: 'al', isDir: false, ...extra }) as Child;

const mix = {
  id: 'genre:mpb',
  number: 1,
  genre: 'MPB',
  artists: [
    { id: 'ar-1', name: 'Djavan' },
    { id: 'ar-2', name: 'Caetano Veloso' },
  ],
};

beforeEach(async () => {
  ensureNormalizedSchema(getDb()!);
  await getDb()!.runAsync('DELETE FROM songs');
  mockSimilar2.mockReset().mockResolvedValue([]);
  mockTop.mockReset().mockResolvedValue([]);
  mockRandom.mockReset().mockResolvedValue([]);
  personalMixStore.setState({ dailyMixDate: dateKey(Date.now()), dailyMixes: [mix], dailyMixSongs: {} });
});

it('blends songs the user plays from the mix artists with new similar songs', async () => {
  await upsertSongs(getDb()!, [
    song('fam-1', 'ar-1', { playCount: 12 }),
    song('fam-2', 'ar-2', { starred: new Date() } as Partial<Child>),
    song('never', 'ar-1'),
    song('other', 'ar-9', { playCount: 50 }),
  ]);
  mockSimilar2.mockResolvedValue([song('new-1', 'ar-5'), song('fam-1', 'ar-1', { playCount: 12 })]);
  mockRandom.mockResolvedValue([song('new-2', 'ar-6'), song('new-3', 'ar-7', { playCount: 3 })]);

  const songs = await getDailyMixSongs(mix, 10);
  const ids = songs.map((s) => s.id);
  expect(ids.slice().sort()).toEqual(['fam-1', 'fam-2', 'new-1', 'new-2', 'new-3']);
  // Unplayed new songs come before already-played ones.
  expect(ids.indexOf('new-3')).toBeGreaterThan(ids.indexOf('new-1'));
  expect(ids.indexOf('new-3')).toBeGreaterThan(ids.indexOf('new-2'));
  expect(mockTop).not.toHaveBeenCalled();
  expect(personalMixStore.getState().dailyMixSongs['genre:mpb']).toEqual(songs);

  mockSimilar2.mockClear();
  expect(await getDailyMixSongs(mix, 10)).toBe(songs);
  expect(mockSimilar2).not.toHaveBeenCalled();
});

it('uses the artists\' top songs when the library has no plays for them', async () => {
  mockTop.mockResolvedValue([song('top-1', 'ar-1')]);
  const songs = await getDailyMixSongs(mix, 10);
  expect(songs.map((s) => s.id)).toEqual(['top-1']);
});
