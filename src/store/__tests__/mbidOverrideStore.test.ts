jest.mock('../persistence/kvStorage', () => require('../persistence/__mocks__/kvStorage'));

import { getOverride, mbidOverrideStore } from '../mbidOverrideStore';

beforeEach(() => {
  mbidOverrideStore.setState({ overrides: {} });
});

describe('mbidOverrideStore', () => {
  it('setOverride adds an artist override entry', () => {
    mbidOverrideStore.getState().setOverride('artist', 'ar1', 'Radiohead', 'mbid-123');
    const entry = mbidOverrideStore.getState().overrides['artist:ar1'];
    expect(entry).toEqual({
      type: 'artist',
      entityId: 'ar1',
      entityName: 'Radiohead',
      mbid: 'mbid-123',
    });
  });

  it('setOverride adds an album override entry', () => {
    mbidOverrideStore.getState().setOverride('album', 'al1', 'OK Computer', 'mbid-456');
    const entry = mbidOverrideStore.getState().overrides['album:al1'];
    expect(entry).toEqual({
      type: 'album',
      entityId: 'al1',
      entityName: 'OK Computer',
      mbid: 'mbid-456',
    });
  });

  it('setOverride overwrites existing entry', () => {
    mbidOverrideStore.getState().setOverride('artist', 'ar1', 'Radiohead', 'old-mbid');
    mbidOverrideStore.getState().setOverride('artist', 'ar1', 'Radiohead', 'new-mbid');
    expect(mbidOverrideStore.getState().overrides['artist:ar1'].mbid).toBe('new-mbid');
  });

  it('artist and album keys do not collide', () => {
    mbidOverrideStore.getState().setOverride('artist', 'id1', 'Name A', 'mbid-a');
    mbidOverrideStore.getState().setOverride('album', 'id1', 'Name B', 'mbid-b');
    expect(Object.keys(mbidOverrideStore.getState().overrides)).toHaveLength(2);
    expect(mbidOverrideStore.getState().overrides['artist:id1'].mbid).toBe('mbid-a');
    expect(mbidOverrideStore.getState().overrides['album:id1'].mbid).toBe('mbid-b');
  });

  it('removeOverride removes the entry', () => {
    mbidOverrideStore.getState().setOverride('artist', 'ar1', 'Radiohead', 'mbid-123');
    mbidOverrideStore.getState().setOverride('artist', 'ar2', 'Muse', 'mbid-456');
    mbidOverrideStore.getState().removeOverride('artist', 'ar1');
    expect(mbidOverrideStore.getState().overrides['artist:ar1']).toBeUndefined();
    expect(mbidOverrideStore.getState().overrides['artist:ar2']).toBeDefined();
  });

  it('removeOverride is safe when key does not exist', () => {
    mbidOverrideStore.getState().removeOverride('artist', 'nonexistent');
    expect(mbidOverrideStore.getState().overrides).toEqual({});
  });

  it('clearOverrides removes all entries', () => {
    mbidOverrideStore.getState().setOverride('artist', 'ar1', 'Radiohead', 'mbid-123');
    mbidOverrideStore.getState().setOverride('album', 'al1', 'OK Computer', 'mbid-456');
    mbidOverrideStore.getState().clearOverrides();
    expect(mbidOverrideStore.getState().overrides).toEqual({});
  });

  describe('getOverride', () => {
    it('returns the matching override', () => {
      mbidOverrideStore.getState().setOverride('artist', 'ar1', 'Radiohead', 'mbid-123');
      const result = getOverride(mbidOverrideStore.getState().overrides, 'artist', 'ar1');
      expect(result?.mbid).toBe('mbid-123');
    });

    it('returns undefined for missing override', () => {
      const result = getOverride(mbidOverrideStore.getState().overrides, 'artist', 'missing');
      expect(result).toBeUndefined();
    });

    it('differentiates between artist and album with same id', () => {
      mbidOverrideStore.getState().setOverride('artist', 'id1', 'Artist', 'mbid-a');
      mbidOverrideStore.getState().setOverride('album', 'id1', 'Album', 'mbid-b');
      expect(getOverride(mbidOverrideStore.getState().overrides, 'artist', 'id1')?.mbid).toBe('mbid-a');
      expect(getOverride(mbidOverrideStore.getState().overrides, 'album', 'id1')?.mbid).toBe('mbid-b');
    });
  });

  describe('mergeOverrides', () => {
    it('adds incoming entries that don\'t exist locally', () => {
      mbidOverrideStore.getState().setOverride('artist', 'ar1', 'Local', 'mbid-local');

      const result = mbidOverrideStore.getState().mergeOverrides({
        'album:al1': { type: 'album', entityId: 'al1', entityName: 'New', mbid: 'mbid-new' },
      });

      expect(result).toEqual({ added: 1, skipped: 0 });
      expect(mbidOverrideStore.getState().overrides['artist:ar1'].mbid).toBe('mbid-local');
      expect(mbidOverrideStore.getState().overrides['album:al1'].mbid).toBe('mbid-new');
    });

    it('keeps existing local entry on key conflict (existing-wins)', () => {
      mbidOverrideStore.getState().setOverride('artist', 'ar1', 'Local', 'mbid-local');

      const result = mbidOverrideStore.getState().mergeOverrides({
        'artist:ar1': { type: 'artist', entityId: 'ar1', entityName: 'Backup', mbid: 'mbid-backup' },
      });

      expect(result).toEqual({ added: 0, skipped: 1 });
      expect(mbidOverrideStore.getState().overrides['artist:ar1'].mbid).toBe('mbid-local');
    });

    it('counts both added and skipped across mixed input', () => {
      mbidOverrideStore.getState().setOverride('artist', 'ar1', 'Local', 'mbid-local');

      const result = mbidOverrideStore.getState().mergeOverrides({
        'artist:ar1': { type: 'artist', entityId: 'ar1', entityName: 'X', mbid: 'mbid-x' },
        'artist:ar2': { type: 'artist', entityId: 'ar2', entityName: 'Y', mbid: 'mbid-y' },
        'album:al1': { type: 'album', entityId: 'al1', entityName: 'Z', mbid: 'mbid-z' },
      });

      expect(result).toEqual({ added: 2, skipped: 1 });
    });

    it('skips invalid entries', () => {
      const result = mbidOverrideStore.getState().mergeOverrides({
        'artist:ar1': null as any,
        'artist:ar2': 'not an object' as any,
      });

      expect(result).toEqual({ added: 0, skipped: 2 });
    });

    it('does not write to state when nothing to add', () => {
      mbidOverrideStore.getState().setOverride('artist', 'ar1', 'Local', 'mbid-local');
      const before = mbidOverrideStore.getState().overrides;

      mbidOverrideStore.getState().mergeOverrides({
        'artist:ar1': { type: 'artist', entityId: 'ar1', entityName: 'X', mbid: 'mbid-x' },
      });

      // Reference equality — set() not invoked when no rows added.
      expect(mbidOverrideStore.getState().overrides).toBe(before);
    });
  });
});
