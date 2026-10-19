const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

import { discoverSettingsStore } from '../../store/discoverSettingsStore';
import {
  discoverPreviewUrl,
  fetchDiscoverBrowse,
  fetchDiscoverPlaylist,
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
  it('requests the playlist with the bearer token', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => playlist });
    await expect(fetchDiscoverPlaylist('recommended')).resolves.toEqual(playlist);
    expect(mockFetch).toHaveBeenCalledWith(`${BASE}/playlists/recommended`, {
      headers: { Authorization: 'Bearer secret' },
    });
  });

  it('appends refresh to paths with and without a query', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => playlist });
    await fetchDiscoverPlaylist('new-releases', true);
    await fetchDiscoverPlaylist('charts-br', true);
    await fetchDiscoverPlaylist('charts-global');
    expect(mockFetch.mock.calls.map((c) => c[0])).toEqual([
      `${BASE}/playlists/new-releases?refresh=1`,
      `${BASE}/playlists/charts?country=BR&refresh=1`,
      `${BASE}/playlists/charts?country=GLOBAL`,
    ]);
  });

  it('returns null when unconfigured without calling fetch', async () => {
    discoverSettingsStore.setState({ baseUrl: null });
    await expect(fetchDiscoverPlaylist('recommended')).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null on HTTP errors, malformed bodies and network failures', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
    await expect(fetchDiscoverPlaylist('recommended')).resolves.toBeNull();
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ error: 'x' }) });
    await expect(fetchDiscoverPlaylist('recommended')).resolves.toBeNull();
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchDiscoverPlaylist('recommended')).resolves.toBeNull();
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
