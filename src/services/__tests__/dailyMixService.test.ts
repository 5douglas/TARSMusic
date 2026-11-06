jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

import { personalMixStore } from '../../store/personalMixStore';
import { getDb } from '../../store/persistence/db';
import {
  deriveScrobbleColumns,
  SCROBBLE_COLUMN_NAMES,
  scrobbleColumnValues,
} from '../../store/persistence/scrobbleColumns';
import { createScrobbleTables } from '../../test-utils/legacyScrobbleTables';
import { dateKey } from '../../utils/dateKey';
import {
  blendFamiliarAndNew,
  getDailyMixes,
  groupArtistsIntoMixes,
  type ArtistGenreRow,
} from '../dailyMixService';

import type { Child } from '../subsonicService';

const row = (artistId: string, genre: string | null, plays: number): ArtistGenreRow => ({
  artistId,
  artist: `Name ${artistId}`,
  genre,
  plays,
});

describe('groupArtistsIntoMixes', () => {
  it('groups artists by the genre they are mostly played in, biggest group first', () => {
    const mixes = groupArtistsIntoMixes([
      row('a', 'MPB', 10),
      row('b', 'mpb', 8),
      row('c', 'Rock', 30),
      row('d', 'Rock', 5),
      row('c', 'MPB', 2),
      row('e', 'Jazz', 50), // only artist in Jazz: no mix
    ]);
    expect(mixes.map((m) => [m.number, m.genre, m.artists.map((a) => a.id)])).toEqual([
      [1, 'Rock', ['c', 'd']],
      [2, 'MPB', ['a', 'b']],
    ]);
    expect(mixes[0].id).toBe('genre:rock');
  });

  it('splits multi-genre values and caps the number of mixes', () => {
    const rows = [];
    for (let g = 0; g < 8; g++) {
      rows.push(row(`x${g}`, `G${g}; Other`, 10 + g), row(`y${g}`, `G${g}`, 10 + g));
    }
    // "Other" has 8 artists at the same plays as their G-genre, so ties keep the first genre.
    const mixes = groupArtistsIntoMixes(rows, 6);
    expect(mixes).toHaveLength(6);
    expect(mixes[0].genre).toBe('G7');
  });

  it('falls back to groups of top artists when there is no genre data', () => {
    const mixes = groupArtistsIntoMixes([
      row('a', null, 9),
      row('b', null, 8),
      row('c', null, 7),
      row('d', null, 6),
      row('e', null, 5),
      row('f', null, 4),
    ]);
    expect(mixes.map((m) => m.artists.map((a) => a.id))).toEqual([
      ['a', 'b', 'c', 'd'],
      ['e', 'f'],
    ]);
    expect(mixes[0].genre).toBeNull();
  });

  it('returns nothing without history', () => {
    expect(groupArtistsIntoMixes([])).toEqual([]);
  });
});

describe('blendFamiliarAndNew', () => {
  const s = (id: string) => ({ id, title: id, isDir: false }) as Child;
  it('puts one familiar song before every two new ones and stops at size', () => {
    const out = blendFamiliarAndNew([s('f1'), s('f2')], [s('n1'), s('n2'), s('n3'), s('n4'), s('n5')], 6);
    expect(out.map((x) => x.id)).toEqual(['f1', 'n1', 'n2', 'f2', 'n3', 'n4']);
  });
  it('uses whatever is left when one list runs out', () => {
    const out = blendFamiliarAndNew([s('f1'), s('f2'), s('f3')], [], 5);
    expect(out.map((x) => x.id)).toEqual(['f1', 'f2', 'f3']);
  });
});

describe('getDailyMixes (scrobble history in SQLite)', () => {
  const db = () => getDb()!;
  let n = 0;
  const play = (artistId: string, artist: string, genre: string, time = Date.now()) => {
    const song = { id: `s-${artistId}`, title: 't', artist, artistId, genre, isDir: false } as Child;
    const cols = scrobbleColumnValues(deriveScrobbleColumns(song, time));
    db().runSync(
      `INSERT INTO scrobble_events (id, time, ${SCROBBLE_COLUMN_NAMES.join(', ')}) ` +
        `VALUES (${new Array(2 + SCROBBLE_COLUMN_NAMES.length).fill('?').join(', ')});`,
      [`e${n++}`, time, ...cols],
    );
  };

  beforeEach(() => {
    createScrobbleTables(db());
    personalMixStore.setState({ dailyMixDate: null, dailyMixes: [], dailyMixSongs: {} });
  });

  it('builds today\'s mixes from the play history and keeps them for the day', async () => {
    for (let i = 0; i < 20; i++) play('ar-1', 'Djavan', 'MPB');
    for (let i = 0; i < 15; i++) play('ar-2', 'Caetano Veloso', 'MPB');
    for (let i = 0; i < 5; i++) play('ar-3', 'Legião Urbana', 'Rock');

    const mixes = await getDailyMixes();
    expect(mixes).toEqual([
      {
        id: 'genre:mpb',
        number: 1,
        genre: 'MPB',
        artists: [
          { id: 'ar-1', name: 'Djavan' },
          { id: 'ar-2', name: 'Caetano Veloso' },
        ],
      },
    ]);
    expect(personalMixStore.getState().dailyMixDate).toBe(dateKey(Date.now()));

    play('ar-4', 'Titãs', 'Rock');
    expect(await getDailyMixes()).toBe(mixes);
  });
});
