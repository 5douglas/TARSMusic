import { addToPlaylistStore } from '../addToPlaylistStore';

import { type Child, type AlbumID3 } from '../../services/subsonicService';

const mockSong = { id: 's1', title: 'Song 1' } as Child;
const mockAlbum = { id: 'a1', name: 'Album 1' } as AlbumID3;

beforeEach(() => {
  addToPlaylistStore.setState({ visible: false, target: null });
});

describe('addToPlaylistStore', () => {
  it('showSong sets visible and target with song type', () => {
    addToPlaylistStore.getState().showSong(mockSong);
    const state = addToPlaylistStore.getState();
    expect(state.visible).toBe(true);
    expect(state.target).toEqual({ type: 'song', item: mockSong });
  });

  it('showAlbum sets visible and target with album type', () => {
    addToPlaylistStore.getState().showAlbum(mockAlbum);
    const state = addToPlaylistStore.getState();
    expect(state.visible).toBe(true);
    expect(state.target).toEqual({ type: 'album', item: mockAlbum });
  });

  it('showQueue sets visible and target with queue type', () => {
    const songs = [mockSong];
    addToPlaylistStore.getState().showQueue(songs);
    const state = addToPlaylistStore.getState();
    expect(state.visible).toBe(true);
    expect(state.target).toEqual({ type: 'queue', songs });
  });

  it('hide resets visible and target', () => {
    addToPlaylistStore.getState().showSong(mockSong);
    addToPlaylistStore.getState().hide();
    const state = addToPlaylistStore.getState();
    expect(state.visible).toBe(false);
    expect(state.target).toBeNull();
  });
});
