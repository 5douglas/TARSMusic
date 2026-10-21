const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

import { discoverSettingsStore } from '../../store/discoverSettingsStore';
import {
  discoverPreviewUrl,
  fetchArtistMissing,
  fetchDiscoverBrowse,
  fetchDiscoverHome,
  fetchDiscoverPlaylist,
  fetchDownloadQueue,
  runQueueAction,
  searchDiscover,
  isDiscoverConfigured,
  queueDiscoverDownload,
} from '../discoverService';

jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

const BASE = 'https://discover.example.com';
const playlist = { id: 'recommended', title: 'For you', description: '', updated: '', count: 0, items: [] };

beforeEach(() => {
  mockFetch.mockReset();
  discoverSettingsStore.setState({ baseUrl: BASE, token: 'secret' });
});

describe('isDiscoverConfigured', () => {
  it('needs both url and token', () => {
    expect(isDiscoverConfigured()).toBe(true);
    discoverSettingsStore.setState({ token: null });
    expect(isDiscoverConfigured()).toBe(false);
  });
});

describe('fetchDiscoverPlaylist', () => {
  it('requests the playlist path with the bearer token', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => playlist });
    await expect(fetchDiscoverPlaylist('/playlists/mix/5')).resolves.toEqual(playlist);
    expect(mockFetch).toHaveBeenCalledWith(`${BASE}/playlists/mix/5`, {
      headers: { Authorization: 'Bearer secret' },
    });
  });

  it('appends refresh to paths with and without a query', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => playlist });
    await fetchDiscoverPlaylist('/playlists/mix/5', true);
    await fetchDiscoverPlaylist('/playlists/charts?country=BR', true);
    expect(mockFetch.mock.calls.map((c) => c[0])).toEqual([
      `${BASE}/playlists/mix/5?refresh=1`,
      `${BASE}/playlists/charts?country=BR&refresh=1`,
    ]);
  });

  it('refuses paths outside /playlists without calling fetch', async () => {
    await expect(fetchDiscoverPlaylist('/download/cancel-all')).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null when unconfigured without calling fetch', async () => {
    discoverSettingsStore.setState({ baseUrl: null });
    await expect(fetchDiscoverPlaylist('/playlists/mix/5')).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null on HTTP errors, malformed bodies and network failures', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(fetchDiscoverPlaylist('/playlists/mix/5')).resolves.toBeNull();
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ error: 'x' }) });
    await expect(fetchDiscoverPlaylist('/playlists/mix/5')).resolves.toBeNull();
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => null });
    await expect(fetchDiscoverPlaylist('/playlists/mix/5')).resolves.toBeNull();
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchDiscoverPlaylist('/playlists/mix/5')).resolves.toBeNull();
  });
});

describe('fetchDiscoverHome', () => {
  it('returns the sections and rejects bodies without them', async () => {
    const home = { updated: '', scanning: false, sections: [] };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => home });
    await expect(fetchDiscoverHome(true)).resolves.toEqual(home);
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE}/home?refresh=1`);
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await expect(fetchDiscoverHome()).resolves.toBeNull();
  });
});

describe('fetchArtistMissing', () => {
  it('looks the artist up by encoded name', async () => {
    const body = { artist: {}, count: 0, items: [] };
    mockFetch.mockResolvedValue({ ok: true, json: async () => body });
    await expect(fetchArtistMissing('Jão & Cia')).resolves.toEqual(body);
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE}/artist-missing?name=J%C3%A3o%20%26%20Cia`);
  });
});

describe('download queue', () => {
  const queue = { counts: { active: 0, queued: 0, failed: 0, completed: 0 }, active: [], queued: [], failed: [], completed: [] };

  it('fetches the grouped queue', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => queue });
    await expect(fetchDownloadQueue()).resolves.toEqual(queue);
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE}/download/queue`);
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    await expect(fetchDownloadQueue()).resolves.toBeNull();
  });

  it('posts queue actions with and without a uuid', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await expect(runQueueAction('retry', 'track_1_3')).resolves.toBe(true);
    await expect(runQueueAction('clear-finished')).resolves.toBe(true);
    expect(mockFetch.mock.calls[0]).toEqual([`${BASE}/download/retry`, expect.objectContaining({ method: 'POST', body: JSON.stringify({ uuid: 'track_1_3' }) })]);
    expect(mockFetch.mock.calls[1]).toEqual([`${BASE}/download/clear-finished`, expect.objectContaining({ body: '{}' })]);
  });

  it('reports failed queue actions', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(runQueueAction('remove', 'track_1_3')).resolves.toBe(false);
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: false }) });
    await expect(runQueueAction('remove', 'track_1_3')).resolves.toBe(false);
  });
});

describe('searchDiscover', () => {
  it('encodes the query and passes the type', async () => {
    const result = { query: 'jão & cia', type: 'album', count: 0, items: [] };
    mockFetch.mockResolvedValue({ ok: true, json: async () => result });
    await expect(searchDiscover('jão & cia', 'album')).resolves.toEqual(result);
    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE}/search?q=j%C3%A3o%20%26%20cia&type=album`);
  });
});

describe('fetchDiscoverBrowse', () => {
  it('requests albums and artists by id, with optional refresh', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ ...playlist, type: 'album' }) });
    await fetchDiscoverBrowse('album', 5);
    await fetchDiscoverBrowse('artist', 7, true);
    expect(mockFetch.mock.calls.map((c) => c[0])).toEqual([
      `${BASE}/browse/album/5`,
      `${BASE}/browse/artist/7?refresh=1`,
    ]);
  });
});

describe('queueDiscoverDownload', () => {
  const url = 'https://www.deezer.com/track/1';

  it('posts the url and reports success', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ queued: true }) });
    await expect(queueDiscoverDownload(url)).resolves.toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(`${BASE}/download`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  });

  it('reports failure for rejected, errored, offline and unconfigured cases', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ queued: false }) });
    await expect(queueDiscoverDownload(url)).resolves.toBe(false);
    mockFetch.mockResolvedValueOnce({ ok: false, status: 502 });
    await expect(queueDiscoverDownload(url)).resolves.toBe(false);
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(queueDiscoverDownload(url)).resolves.toBe(false);
    discoverSettingsStore.setState({ token: null });
    await expect(queueDiscoverDownload(url)).resolves.toBe(false);
  });
});

describe('discoverPreviewUrl', () => {
  it('builds the redirecting preview url with an encoded token', () => {
    discoverSettingsStore.setState({ token: 'a b&c' });
    expect(discoverPreviewUrl(42)).toBe(`${BASE}/preview/42?token=a%20b%26c`);
  });

  it('returns null when unconfigured', () => {
    discoverSettingsStore.setState({ baseUrl: null });
    expect(discoverPreviewUrl(42)).toBeNull();
  });
});
