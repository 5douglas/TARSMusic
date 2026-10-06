import { create } from 'zustand';

import { type AlbumID3, type Child } from '../services/subsonicService';

export type AddToPlaylistTarget =
  | { type: 'song'; item: Child }
  | { type: 'album'; item: AlbumID3 }
  | { type: 'queue'; songs: Child[] };

interface AddToPlaylistState {
  visible: boolean;
  target: AddToPlaylistTarget | null;

  showSong: (song: Child) => void;
  showAlbum: (album: AlbumID3) => void;
  showQueue: (songs: Child[]) => void;
  hide: () => void;
}

export const addToPlaylistStore = create<AddToPlaylistState>()((set) => ({
  visible: false,
  target: null,

  showSong: (song) => set({ visible: true, target: { type: 'song', item: song } }),
  showAlbum: (album) => set({ visible: true, target: { type: 'album', item: album } }),
  showQueue: (songs) => set({ visible: true, target: { type: 'queue', songs } }),
  hide: () => set({ visible: false, target: null }),
}));
