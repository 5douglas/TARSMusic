import { mbidSearchStore } from '../mbidSearchStore';

beforeEach(() => {
  mbidSearchStore.setState({
    visible: false,
    entityType: 'artist',
    entityId: null,
    entityName: null,
    artistName: null,
    currentMbid: null,
    coverArtId: null,
  });
});

describe('mbidSearchStore', () => {
  it('showArtist sets all fields', () => {
    mbidSearchStore.getState().showArtist('ar1', 'Radiohead', 'mbid-123');
    const state = mbidSearchStore.getState();
    expect(state.visible).toBe(true);
    expect(state.entityType).toBe('artist');
    expect(state.entityId).toBe('ar1');
    expect(state.entityName).toBe('Radiohead');
    expect(state.artistName).toBeNull();
    expect(state.currentMbid).toBe('mbid-123');
    expect(state.coverArtId).toBeNull();
  });

  it('showArtist with coverArtId', () => {
    mbidSearchStore.getState().showArtist('ar1', 'Radiohead', 'mbid-123', 'cover-1');
    expect(mbidSearchStore.getState().coverArtId).toBe('cover-1');
  });

  it('showAlbum sets all fields including artistName', () => {
    mbidSearchStore.getState().showAlbum('al1', 'OK Computer', 'Radiohead', 'mbid-456');
    const state = mbidSearchStore.getState();
    expect(state.visible).toBe(true);
    expect(state.entityType).toBe('album');
    expect(state.entityId).toBe('al1');
    expect(state.entityName).toBe('OK Computer');
    expect(state.artistName).toBe('Radiohead');
    expect(state.currentMbid).toBe('mbid-456');
    expect(state.coverArtId).toBeNull();
  });

  it('showAlbum with coverArtId', () => {
    mbidSearchStore.getState().showAlbum('al1', 'OK Computer', 'Radiohead', null, 'cover-2');
    expect(mbidSearchStore.getState().coverArtId).toBe('cover-2');
  });

  it('showArtist with null currentMbid', () => {
    mbidSearchStore.getState().showArtist('ar1', 'Radiohead', null);
    expect(mbidSearchStore.getState().currentMbid).toBeNull();
  });

  it('hide resets all fields', () => {
    mbidSearchStore.getState().showAlbum('al1', 'OK Computer', 'Radiohead', 'mbid-456', 'cover-2');
    mbidSearchStore.getState().hide();
    const state = mbidSearchStore.getState();
    expect(state.visible).toBe(false);
    expect(state.entityType).toBe('artist');
    expect(state.entityId).toBeNull();
    expect(state.entityName).toBeNull();
    expect(state.artistName).toBeNull();
    expect(state.currentMbid).toBeNull();
    expect(state.coverArtId).toBeNull();
  });
});
