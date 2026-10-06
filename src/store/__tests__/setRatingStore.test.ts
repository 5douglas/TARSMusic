import { setRatingStore } from '../setRatingStore';

beforeEach(() => {
  setRatingStore.setState({
    visible: false,
    entityType: null,
    entityId: null,
    entityName: null,
    coverArtId: null,
    currentRating: 0,
  });
});

describe('setRatingStore', () => {
  it('show sets all fields', () => {
    setRatingStore.getState().show('song', 's1', 'My Song', 4, 'cover1');
    const state = setRatingStore.getState();
    expect(state.visible).toBe(true);
    expect(state.entityType).toBe('song');
    expect(state.entityId).toBe('s1');
    expect(state.entityName).toBe('My Song');
    expect(state.currentRating).toBe(4);
    expect(state.coverArtId).toBe('cover1');
  });

  it('show defaults coverArtId to null', () => {
    setRatingStore.getState().show('album', 'a1', 'Album', 5);
    const state = setRatingStore.getState();
    expect(state.coverArtId).toBeNull();
  });

  it('hide resets all fields', () => {
    setRatingStore.getState().show('song', 's1', 'My Song', 4, 'cover1');
    setRatingStore.getState().hide();
    const state = setRatingStore.getState();
    expect(state.visible).toBe(false);
    expect(state.entityType).toBeNull();
    expect(state.entityId).toBeNull();
    expect(state.entityName).toBeNull();
    expect(state.coverArtId).toBeNull();
    expect(state.currentRating).toBe(0);
  });
});
