import { composeLibraryItems, sortLibraryItems, type LibraryItem } from '../libraryItemsService';
import type { AlbumID3, ArtistID3, Playlist } from '../subsonicService';

const playlist = (id: string, name: string, owner: string, changed: string, created: string): Playlist =>
  ({ id, name, owner, changed, created, songCount: 0, duration: 0 }) as unknown as Playlist;
const album = (id: string, name: string, artist: string, extra: Record<string, string> = {}): AlbumID3 =>
  ({ id, name, artist, songCount: 0, duration: 0, created: '2020-01-01T00:00:00Z', ...extra }) as unknown as AlbumID3;
const artist = (id: string, name: string, starred: string): ArtistID3 =>
  ({ id, name, starred }) as unknown as ArtistID3;

describe('composeLibraryItems', () => {
  it('merges liked and recently played albums by id, keeping the latest activity', () => {
    const items = composeLibraryItems({
      playlists: [playlist('p1', 'Road trip', 'douglas', '2026-10-01T00:00:00Z', '2026-01-01T00:00:00Z')],
      starredAlbums: [album('a1', 'Clube da Esquina', 'Milton', { starred: '2026-05-01T00:00:00Z' })],
      starredArtists: [artist('r1', 'Djavan', '2026-03-01T00:00:00Z')],
      recentlyPlayed: [album('a1', 'Clube da Esquina', 'Milton', { played: '2026-10-20T00:00:00Z' })],
    });
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(['playlist:p1', 'album:a1', 'artist:r1']);
    const merged = items.find((i) => i.id === 'a1')!;
    expect(merged.recent).toBe(Date.parse('2026-10-20T00:00:00Z'));
  });
});

describe('sortLibraryItems', () => {
  const items: LibraryItem[] = composeLibraryItems({
    playlists: [playlist('p1', 'Zebra', 'ana', '2026-10-05T00:00:00Z', '2026-01-01T00:00:00Z')],
    starredAlbums: [album('a1', 'Alpha', 'Caetano', { starred: '2026-09-01T00:00:00Z' })],
    starredArtists: [artist('r1', 'Milton', '2026-10-10T00:00:00Z')],
    recentlyPlayed: [],
  });
  const ids = (sort: Parameters<typeof sortLibraryItems>[1]) => sortLibraryItems(items, sort).map((i) => i.id);

  it('sorts by recents', () => expect(ids('recents')).toEqual(['r1', 'p1', 'a1']));
  it('sorts by recently added', () => expect(ids('recentlyAdded')).toEqual(['r1', 'a1', 'p1']));
  it('sorts alphabetically', () => expect(ids('alphabetical')).toEqual(['a1', 'r1', 'p1']));
  it('sorts by creator, artists (no creator) first', () => expect(ids('creator')).toEqual(['r1', 'p1', 'a1']));
  it('does not mutate the input', () => {
    const before = items.map((i) => i.id);
    sortLibraryItems(items, 'alphabetical');
    expect(items.map((i) => i.id)).toEqual(before);
  });
});
