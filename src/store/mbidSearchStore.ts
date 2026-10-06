import { create } from 'zustand';

import { type MbidOverrideType } from './mbidOverrideStore';

interface MbidSearchState {
  visible: boolean;
  entityType: MbidOverrideType;
  entityId: string | null;
  entityName: string | null;
  /** Artist name context for album searches (used in MusicBrainz query). */
  artistName: string | null;
  /** Currently assigned MBID to highlight in search results */
  currentMbid: string | null;
  coverArtId: string | null;

  showArtist: (artistId: string, artistName: string, currentMbid: string | null, coverArtId?: string) => void;
  showAlbum: (albumId: string, albumName: string, artistName: string | null, currentMbid: string | null, coverArtId?: string) => void;
  hide: () => void;
}

export const mbidSearchStore = create<MbidSearchState>()((set) => ({
  visible: false,
  entityType: 'artist',
  entityId: null,
  entityName: null,
  artistName: null,
  currentMbid: null,
  coverArtId: null,

  showArtist: (artistId, artistName, currentMbid, coverArtId) =>
    set({
      visible: true,
      entityType: 'artist',
      entityId: artistId,
      entityName: artistName,
      artistName: null,
      currentMbid,
      coverArtId: coverArtId ?? null,
    }),
  showAlbum: (albumId, albumName, artistName, currentMbid, coverArtId) =>
    set({
      visible: true,
      entityType: 'album',
      entityId: albumId,
      entityName: albumName,
      artistName: artistName ?? null,
      currentMbid,
      coverArtId: coverArtId ?? null,
    }),
  hide: () =>
    set({
      visible: false,
      entityType: 'artist',
      entityId: null,
      entityName: null,
      artistName: null,
      currentMbid: null,
      coverArtId: null,
    }),
}));
