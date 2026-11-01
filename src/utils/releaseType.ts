import type { AlbumID3 } from '../services/subsonicService';

export type ReleaseKind = 'album' | 'single' | 'ep' | 'compilation';

/** Spotify's rule for releases without tags: up to 3 tracks is a single, 4–6 an EP, as long as it runs under 30 minutes. */
const SHORT_RELEASE_SECONDS = 30 * 60;

/**
 * What kind of release this is, the way Spotify labels it: the server's
 * OpenSubsonic `releaseTypes` / `isCompilation` tags when present, otherwise
 * guessed from the track count and length.
 */
export function releaseKind(album: Pick<AlbumID3, 'releaseTypes' | 'isCompilation' | 'songCount' | 'duration'>): ReleaseKind {
  const types = (album.releaseTypes ?? []).map((t) => t.toLowerCase());
  if (album.isCompilation || types.includes('compilation')) return 'compilation';
  if (types.includes('single')) return 'single';
  if (types.includes('ep')) return 'ep';
  if (types.includes('album')) return 'album';
  const songs = album.songCount ?? 0;
  const short = !album.duration || album.duration < SHORT_RELEASE_SECONDS;
  if (songs > 0 && songs <= 3 && short) return 'single';
  if (songs >= 4 && songs <= 6 && short) return 'ep';
  return 'album';
}

/** i18n key for a release kind's label ("Album", "Single", "EP", "Compilation"). */
export function releaseKindKey(kind: ReleaseKind): string {
  switch (kind) {
    case 'single':
      return 'releaseSingle';
    case 'ep':
      return 'releaseEp';
    case 'compilation':
      return 'releaseCompilation';
    default:
      return 'releaseAlbum';
  }
}

/** Newest first; releases without a year go last. */
export function sortReleasesNewestFirst<T extends Pick<AlbumID3, 'year' | 'created'>>(releases: T[]): T[] {
  return [...releases].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}
