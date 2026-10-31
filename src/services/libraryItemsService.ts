/**
 * The mixed "Your Library" list, Spotify style: playlists, liked albums, liked artists and
 * recently played albums in one list, sortable by recents, recently added, name or creator.
 * The "Downloaded" filter swaps the source for the downloaded albums and playlists.
 */
import { albumListRowToAlbumID3 } from '../db/repository/albums';
import { listDownloadedAlbums, listDownloadedPlaylists } from '../db/repository/downloads';
import {
  epochOf,
  listAllStarredAlbums,
  listAllStarredArtists,
  starredItemOf,
} from '../db/repository/favorites';
import { PLAYLIST_LIST_COLS, playlistListRowToPlaylist, type PlaylistListRow } from '../db/repository/playlists';
import { type InternalDb } from '../db/client';
import { baseCollator } from '../utils/intl';

import type { AlbumID3, ArtistID3, Playlist } from './subsonicService';

export type LibrarySort = 'recents' | 'recentlyAdded' | 'alphabetical' | 'creator';

export type LibraryItem =
  | { kind: 'playlist'; id: string; item: Playlist; recent: number; added: number }
  | { kind: 'album'; id: string; item: AlbumID3; recent: number; added: number }
  | { kind: 'artist'; id: string; item: ArtistID3; recent: number; added: number };

export function libraryItemTitle(entry: LibraryItem): string {
  return entry.item.name ?? '';
}

/** Who made it: the playlist owner or the album artist; empty for artists. */
export function libraryItemCreator(entry: LibraryItem): string {
  if (entry.kind === 'playlist') return entry.item.owner ?? '';
  if (entry.kind === 'album') return entry.item.artist ?? '';
  return '';
}

export function sortLibraryItems(items: LibraryItem[], sort: LibrarySort): LibraryItem[] {
  const byName = (a: LibraryItem, b: LibraryItem) =>
    baseCollator.compare(libraryItemTitle(a), libraryItemTitle(b));
  const sorted = [...items];
  switch (sort) {
    case 'recents':
      return sorted.sort((a, b) => b.recent - a.recent || byName(a, b));
    case 'recentlyAdded':
      return sorted.sort((a, b) => b.added - a.added || byName(a, b));
    case 'alphabetical':
      return sorted.sort(byName);
    case 'creator':
      return sorted.sort(
        (a, b) => baseCollator.compare(libraryItemCreator(a), libraryItemCreator(b)) || byName(a, b),
      );
  }
}

function playlistItem(p: Playlist): LibraryItem {
  const changed = epochOf(p.changed);
  return { kind: 'playlist', id: p.id, item: p, recent: changed, added: epochOf(p.created) || changed };
}

/**
 * Builds the mixed list. Liked albums and recently played albums are merged by id, so an
 * album that is both shows once, ranked by whichever happened last.
 */
export function composeLibraryItems(input: {
  playlists: Playlist[];
  starredAlbums: AlbumID3[];
  starredArtists: ArtistID3[];
  recentlyPlayed: AlbumID3[];
}): LibraryItem[] {
  const items: LibraryItem[] = input.playlists.map(playlistItem);
  const albums = new Map<string, LibraryItem>();
  for (const album of [...input.starredAlbums, ...input.recentlyPlayed]) {
    const starred = epochOf(album.starred);
    const recent = Math.max(starred, epochOf(album.played));
    const added = starred || epochOf(album.created);
    const existing = albums.get(album.id);
    if (!existing || recent > existing.recent) {
      albums.set(album.id, { kind: 'album', id: album.id, item: album, recent, added });
    }
  }
  items.push(...albums.values());
  for (const artist of input.starredArtists) {
    const starred = epochOf(artist.starred);
    items.push({ kind: 'artist', id: artist.id, item: artist, recent: starred, added: starred });
  }
  return items;
}

const listPlaylistRows = (db: InternalDb): Promise<PlaylistListRow[]> =>
  db.getAllAsync<PlaylistListRow>(`SELECT ${PLAYLIST_LIST_COLS} FROM playlists`);

export async function loadLibraryItems(db: InternalDb, recentlyPlayed: AlbumID3[]): Promise<LibraryItem[]> {
  const [playlists, starredAlbums, starredArtists] = await Promise.all([
    listPlaylistRows(db),
    listAllStarredAlbums(db),
    listAllStarredArtists(db),
  ]);
  return composeLibraryItems({
    playlists: playlists.map(playlistListRowToPlaylist),
    starredAlbums: starredAlbums.map(starredItemOf),
    starredArtists: starredArtists.map(starredItemOf),
    recentlyPlayed,
  });
}

export async function loadDownloadedLibraryItems(db: InternalDb): Promise<LibraryItem[]> {
  const [albums, playlists] = await Promise.all([
    listDownloadedAlbums(db, { includePartial: true }),
    listDownloadedPlaylists(db),
  ]);
  return [
    ...playlists.map((r) => playlistItem(playlistListRowToPlaylist(r))),
    ...albums.map((r) => {
      const album = albumListRowToAlbumID3(r);
      const recent = Math.max(epochOf(album.played), epochOf(album.starred));
      return { kind: 'album' as const, id: album.id, item: album, recent, added: epochOf(album.created) };
    }),
  ];
}
