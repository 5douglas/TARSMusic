jest.mock('expo-notifications', () => ({
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('id')),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('../subsonicService', () => ({ getApi: jest.fn() }));

import * as Notifications from 'expo-notifications';

import { newMusicAlertsStore, type PendingRequest } from '../../store/newMusicAlertsStore';
import {
  checkNewMusic,
  matchesRequest,
  normalizeName,
  planAlerts,
  type FollowedArtists,
} from '../newMusicAlertService';
import { getApi, type AlbumID3 } from '../subsonicService';

const NOW = Date.parse('2026-11-06T12:00:00Z');
const HOUR = 60 * 60 * 1000;

function album(id: string, name: string, artist: string, createdMs: number, artistId?: string): AlbumID3 {
  return {
    id,
    name,
    artist,
    artistId,
    created: new Date(createdMs).toISOString() as unknown as Date,
    duration: 0,
    songCount: 1,
  };
}

function request(albumName: string, artist: string, requestedAt = NOW - HOUR): PendingRequest {
  return { album: albumName, artist, title: albumName, wholeAlbum: true, requestedAt };
}

const nobody: FollowedArtists = { ids: new Set(), names: new Set() };

describe('normalizeName', () => {
  it('drops accents, case, punctuation and bracketed suffixes', () => {
    expect(normalizeName('Ana Castela')).toBe('ana castela');
    expect(normalizeName('Coração (Deluxe Edition)')).toBe('coracao');
    expect(normalizeName('AC/DC')).toBe('ac dc');
    expect(normalizeName(undefined)).toBe('');
  });
});

describe('matchesRequest', () => {
  it('matches the same album title by the same artist', () => {
    expect(matchesRequest(album('1', 'Coração', 'Ana Castela', NOW), request('Coracao', 'ana castela'))).toBe(true);
  });

  it('accepts a featured artist list containing the requested artist', () => {
    expect(matchesRequest(album('1', 'Song', 'Ana Castela & Zé Neto', NOW), request('Song', 'Ana Castela'))).toBe(true);
  });

  it('rejects another album or another artist', () => {
    expect(matchesRequest(album('1', 'Other', 'Ana Castela', NOW), request('Coração', 'Ana Castela'))).toBe(false);
    expect(matchesRequest(album('1', 'Coração', 'Someone', NOW), request('Coração', 'Ana Castela'))).toBe(false);
  });
});

describe('planAlerts', () => {
  const lastSeen = NOW - 10 * HOUR;

  it('announces only albums added since the last check by followed artists', () => {
    const plan = planAlerts({
      albums: [
        album('new-followed', 'A', 'Followed', NOW - HOUR, 'ar-1'),
        album('new-other', 'B', 'Stranger', NOW - HOUR, 'ar-2'),
        album('old-followed', 'C', 'Followed', lastSeen - HOUR, 'ar-1'),
      ],
      lastSeenCreated: lastSeen,
      requests: [],
      followed: { ids: new Set(['ar-1']), names: new Set() },
      now: NOW,
    });
    expect(plan.releases.map((a) => a.id)).toEqual(['new-followed']);
    expect(plan.lastSeenCreated).toBe(NOW - HOUR);
  });

  it('follows by name when the ids differ', () => {
    const plan = planAlerts({
      albums: [album('x', 'A', 'Djavan', NOW - HOUR, 'other-id')],
      lastSeenCreated: lastSeen,
      requests: [],
      followed: { ids: new Set(), names: new Set(['djavan']) },
      now: NOW,
    });
    expect(plan.releases).toHaveLength(1);
  });

  it('reports an arrived request once and not again as a release', () => {
    const req = request('Coração', 'Ana Castela');
    const plan = planAlerts({
      albums: [album('x', 'Coração', 'Ana Castela', NOW - HOUR, 'ar-1')],
      lastSeenCreated: lastSeen,
      requests: [req],
      followed: { ids: new Set(['ar-1']), names: new Set() },
      now: NOW,
    });
    expect(plan.arrived).toEqual([{ request: req, album: expect.objectContaining({ id: 'x' }) }]);
    expect(plan.releases).toEqual([]);
    expect(plan.requests).toEqual([]);
  });

  it('keeps waiting requests and drops expired ones', () => {
    const waiting = request('Later', 'Artist');
    const expired = request('Never', 'Artist', NOW - 30 * 24 * HOUR);
    const plan = planAlerts({ albums: [], lastSeenCreated: lastSeen, requests: [waiting, expired], followed: nobody, now: NOW });
    expect(plan.requests).toEqual([waiting]);
    expect(plan.lastSeenCreated).toBe(lastSeen);
  });

  it('ignores albums older than a week even after a long pause', () => {
    const plan = planAlerts({
      albums: [album('x', 'A', 'Followed', NOW - 8 * 24 * HOUR, 'ar-1')],
      lastSeenCreated: 0,
      requests: [],
      followed: { ids: new Set(['ar-1']), names: new Set() },
      now: NOW,
    });
    expect(plan.releases).toEqual([]);
  });
});

describe('checkNewMusic', () => {
  const getAlbumList2 = jest.fn();
  const getStarred2 = jest.fn();

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    (getApi as jest.Mock).mockReturnValue({ getAlbumList2, getStarred2 });
    getAlbumList2.mockReset();
    getStarred2.mockReset().mockResolvedValue({ starred2: { artist: [] } });
    (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
    newMusicAlertsStore.setState({ releasesEnabled: true, requestsEnabled: true, lastSeenCreated: null, requests: [] });
  });

  afterEach(() => jest.restoreAllMocks());

  it('only records the library state on the first run', async () => {
    getAlbumList2.mockResolvedValueOnce({ albumList2: { album: [album('x', 'A', 'B', NOW - HOUR)] } });
    await checkNewMusic();
    expect(newMusicAlertsStore.getState().lastSeenCreated).toBe(NOW - HOUR);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('notifies an arrived request and a followed release, then forgets the request', async () => {
    newMusicAlertsStore.setState({ lastSeenCreated: NOW - 5 * HOUR, requests: [request('Coração', 'Ana Castela')] });
    getAlbumList2.mockImplementation(({ type }: { type: string }) =>
      Promise.resolve(
        type === 'newest'
          ? {
              albumList2: {
                album: [
                  album('req', 'Coração', 'Ana Castela', NOW - HOUR, 'ar-9'),
                  album('rel', 'Novo', 'Djavan', NOW - 2 * HOUR, 'ar-1'),
                ],
              },
            }
          : { albumList2: { album: [album('old', 'Velho', 'Djavan', 0, 'ar-1')] } },
      ),
    );
    await checkNewMusic();
    const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map((c) => c[0].content.data);
    expect(calls).toEqual([
      { kind: 'new-music', albumId: 'req' },
      { kind: 'new-music', albumId: 'rel' },
    ]);
    expect(newMusicAlertsStore.getState().requests).toEqual([]);
    expect(newMusicAlertsStore.getState().lastSeenCreated).toBe(NOW - HOUR);
  });

  it('sends one summary for many releases', async () => {
    newMusicAlertsStore.setState({ lastSeenCreated: NOW - 5 * HOUR });
    const fresh = [1, 2, 3, 4, 5].map((n) => album(`a${n}`, `Album ${n}`, `Artist ${n}`, NOW - HOUR, 'ar-1'));
    getAlbumList2.mockImplementation(({ type }: { type: string }) =>
      Promise.resolve({ albumList2: { album: type === 'newest' ? fresh : [album('f', 'F', 'X', 0, 'ar-1')] } }),
    );
    await checkNewMusic();
    const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].content.data).toEqual({ kind: 'new-music', list: 'recentlyAdded' });
  });
});
