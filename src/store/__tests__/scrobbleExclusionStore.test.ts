jest.mock('../persistence/kvStorage', () => require('../persistence/__mocks__/kvStorage'));

import { scrobbleExclusionStore } from '../scrobbleExclusionStore';

beforeEach(() => {
  scrobbleExclusionStore.setState({
    excludedAlbums: {},
    excludedArtists: {},
    excludedPlaylists: {},
  });
});

describe('scrobbleExclusionStore', () => {
  describe('addExclusion', () => {
    it('adds an album exclusion', () => {
      scrobbleExclusionStore.getState().addExclusion('album', 'al1', 'Dark Side');
      expect(scrobbleExclusionStore.getState().excludedAlbums['al1']).toEqual({
        id: 'al1',
        name: 'Dark Side',
      });
    });

    it('adds an artist exclusion', () => {
      scrobbleExclusionStore.getState().addExclusion('artist', 'ar1', 'Pink Floyd');
      expect(scrobbleExclusionStore.getState().excludedArtists['ar1']).toEqual({
        id: 'ar1',
        name: 'Pink Floyd',
      });
    });

    it('adds a playlist exclusion', () => {
      scrobbleExclusionStore.getState().addExclusion('playlist', 'pl1', 'Sleep Sounds');
      expect(scrobbleExclusionStore.getState().excludedPlaylists['pl1']).toEqual({
        id: 'pl1',
        name: 'Sleep Sounds',
      });
    });

    it('adding duplicate is idempotent', () => {
      scrobbleExclusionStore.getState().addExclusion('album', 'al1', 'Dark Side');
      scrobbleExclusionStore.getState().addExclusion('album', 'al1', 'Dark Side');
      expect(Object.keys(scrobbleExclusionStore.getState().excludedAlbums)).toHaveLength(1);
    });

    it('updates name when re-adding with different name', () => {
      scrobbleExclusionStore.getState().addExclusion('album', 'al1', 'Old Name');
      scrobbleExclusionStore.getState().addExclusion('album', 'al1', 'New Name');
      expect(scrobbleExclusionStore.getState().excludedAlbums['al1'].name).toBe('New Name');
    });

    it('does not cross-contaminate between types', () => {
      scrobbleExclusionStore.getState().addExclusion('album', 'id1', 'Album');
      scrobbleExclusionStore.getState().addExclusion('artist', 'id2', 'Artist');
      scrobbleExclusionStore.getState().addExclusion('playlist', 'id3', 'Playlist');
      expect(Object.keys(scrobbleExclusionStore.getState().excludedAlbums)).toHaveLength(1);
      expect(Object.keys(scrobbleExclusionStore.getState().excludedArtists)).toHaveLength(1);
      expect(Object.keys(scrobbleExclusionStore.getState().excludedPlaylists)).toHaveLength(1);
    });
  });

  describe('removeExclusion', () => {
    it('removes an album exclusion', () => {
      scrobbleExclusionStore.getState().addExclusion('album', 'al1', 'Dark Side');
      scrobbleExclusionStore.getState().addExclusion('album', 'al2', 'Wish You Were Here');
      scrobbleExclusionStore.getState().removeExclusion('album', 'al1');
      expect(scrobbleExclusionStore.getState().excludedAlbums['al1']).toBeUndefined();
      expect(scrobbleExclusionStore.getState().excludedAlbums['al2']).toBeDefined();
    });

    it('removes an artist exclusion', () => {
      scrobbleExclusionStore.getState().addExclusion('artist', 'ar1', 'Pink Floyd');
      scrobbleExclusionStore.getState().removeExclusion('artist', 'ar1');
      expect(scrobbleExclusionStore.getState().excludedArtists['ar1']).toBeUndefined();
    });

    it('removes a playlist exclusion', () => {
      scrobbleExclusionStore.getState().addExclusion('playlist', 'pl1', 'Sleep');
      scrobbleExclusionStore.getState().removeExclusion('playlist', 'pl1');
      expect(scrobbleExclusionStore.getState().excludedPlaylists['pl1']).toBeUndefined();
    });

    it('removing non-existent is no-op', () => {
      scrobbleExclusionStore.getState().removeExclusion('album', 'nonexistent');
      expect(scrobbleExclusionStore.getState().excludedAlbums).toEqual({});
    });

    it('does not affect other types when removing', () => {
      scrobbleExclusionStore.getState().addExclusion('album', 'id1', 'Album');
      scrobbleExclusionStore.getState().addExclusion('artist', 'id1', 'Artist');
      scrobbleExclusionStore.getState().removeExclusion('album', 'id1');
      expect(scrobbleExclusionStore.getState().excludedAlbums['id1']).toBeUndefined();
      expect(scrobbleExclusionStore.getState().excludedArtists['id1']).toBeDefined();
    });
  });

  describe('persistence config', () => {
    it('has the correct persist key', () => {
      const persistOptions = (scrobbleExclusionStore as any).persist;
      expect(persistOptions.getOptions().name).toBe('substreamer-scrobble-exclusions');
    });

    it('partializes to exclude actions', () => {
      scrobbleExclusionStore.getState().addExclusion('album', 'al1', 'Test');
      const persistOptions = (scrobbleExclusionStore as any).persist;
      const partialize = persistOptions.getOptions().partialize;
      const partialized = partialize(scrobbleExclusionStore.getState());
      expect(partialized).toHaveProperty('excludedAlbums');
      expect(partialized).toHaveProperty('excludedArtists');
      expect(partialized).toHaveProperty('excludedPlaylists');
      expect(partialized).not.toHaveProperty('addExclusion');
      expect(partialized).not.toHaveProperty('removeExclusion');
    });
  });

  describe('mergeExclusions', () => {
    it('unions all three dicts when keys are disjoint', () => {
      scrobbleExclusionStore.getState().addExclusion('album', 'al1', 'Local Album');

      const result = scrobbleExclusionStore.getState().mergeExclusions({
        excludedAlbums: { al2: { id: 'al2', name: 'New Album' } },
        excludedArtists: { ar1: { id: 'ar1', name: 'New Artist' } },
        excludedPlaylists: { pl1: { id: 'pl1', name: 'New Playlist' } },
      });

      expect(result).toEqual({ added: 3, skipped: 0 });
      const state = scrobbleExclusionStore.getState();
      expect(state.excludedAlbums.al1.name).toBe('Local Album');
      expect(state.excludedAlbums.al2.name).toBe('New Album');
      expect(state.excludedArtists.ar1.name).toBe('New Artist');
      expect(state.excludedPlaylists.pl1.name).toBe('New Playlist');
    });

    it('keeps existing local entry on key conflict (existing-wins)', () => {
      scrobbleExclusionStore.getState().addExclusion('album', 'al1', 'Local Album');

      const result = scrobbleExclusionStore.getState().mergeExclusions({
        excludedAlbums: { al1: { id: 'al1', name: 'Backup Album' } },
      });

      expect(result).toEqual({ added: 0, skipped: 1 });
      expect(scrobbleExclusionStore.getState().excludedAlbums.al1.name).toBe('Local Album');
    });

    it('handles missing dicts in incoming payload', () => {
      const result = scrobbleExclusionStore.getState().mergeExclusions({
        excludedAlbums: { al1: { id: 'al1', name: 'A' } },
      });

      expect(result).toEqual({ added: 1, skipped: 0 });
    });

    it('skips invalid entries', () => {
      const result = scrobbleExclusionStore.getState().mergeExclusions({
        excludedAlbums: {
          al1: null as any,
          al2: { id: '', name: 'no id' } as any,
        },
      });

      expect(result).toEqual({ added: 0, skipped: 2 });
    });
  });
});
