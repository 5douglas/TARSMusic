const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

import { discoverSettingsStore } from '../../store/discoverSettingsStore';
import { fetchArtistStats, normalizeTitle, playsForTitle } from '../artistStatsService';

const json = (body: unknown) => Promise.resolve({ ok: true, json: async () => body });

function route(handlers: Record<string, unknown>) {
  mockFetch.mockImplementation((url: string) => {
    const key = Object.keys(handlers).find((k) => url.includes(k));
    return key ? json(handlers[key]) : Promise.resolve({ ok: false });
  });
}

const deezer = { data: [{ name: 'Djavanzinho', nb_fan: 5 }, { name: 'Djavan', nb_fan: 1200000 }] };

beforeEach(() => {
  mockFetch.mockReset();
  discoverSettingsStore.setState({ lastfmApiKey: null });
});

describe('normalizeTitle', () => {
  it('folds case, accents, versions and punctuation', () => {
    expect(normalizeTitle('Oceano (Ao Vivo)')).toBe('oceano');
    expect(normalizeTitle('Flor de Lis - Remastered 2004')).toBe('flor de lis');
    expect(normalizeTitle('Açaí')).toBe('acai');
    expect(normalizeTitle('Se...')).toBe('se');
  });
});

describe('fetchArtistStats', () => {
  it('uses only Deezer fans without a Last.fm key, matching the exact name', async () => {
    route({ 'api.deezer.com/search/artist': deezer });
    const stats = await fetchArtistStats('Djavan');
    expect(stats).toEqual({ listeners: null, fans: 1200000, trackPlays: {} });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('adds Last.fm listeners and per-track plays with a key', async () => {
    discoverSettingsStore.setState({ lastfmApiKey: 'abc' });
    route({
      'api.deezer.com/search/artist': deezer,
      'method=artist.getinfo': { artist: { stats: { listeners: '987654' } } },
      'method=artist.gettoptracks': {
        toptracks: {
          track: [
            { name: 'Oceano', playcount: '4000000' },
            { name: 'Oceano (Ao Vivo)', playcount: '10' },
            { name: 'Flor de Lis', playcount: '3000000' },
          ],
        },
      },
    });
    const stats = await fetchArtistStats('Djavan');
    expect(stats.listeners).toBe(987654);
    expect(stats.fans).toBe(1200000);
    expect(playsForTitle(stats, 'Oceano (Remasterizado)')).toBe(4000000);
    expect(playsForTitle(stats, 'Flor de Lis')).toBe(3000000);
    expect(playsForTitle(stats, 'Sina')).toBeNull();
    expect(mockFetch.mock.calls.some(([url]) => String(url).includes('api_key=abc'))).toBe(true);
  });

  it('leaves numbers out when the services fail', async () => {
    discoverSettingsStore.setState({ lastfmApiKey: 'abc' });
    mockFetch.mockRejectedValue(new Error('offline'));
    await expect(fetchArtistStats('Djavan')).resolves.toEqual({ listeners: null, fans: null, trackPlays: {} });
  });
});
