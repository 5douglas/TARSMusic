import { discoverSettingsStore } from '../discoverSettingsStore';

jest.mock('../persistence/kvStorage', () => require('../persistence/__mocks__/kvStorage'));

beforeEach(() => {
  discoverSettingsStore.setState({ baseUrl: null, token: null });
});

describe('discoverSettingsStore', () => {
  it('stores a trimmed connection without trailing slashes', () => {
    discoverSettingsStore.getState().setConnection('  https://discover.example.com// ', ' tok ');
    expect(discoverSettingsStore.getState()).toMatchObject({
      baseUrl: 'https://discover.example.com',
      token: 'tok',
    });
  });

  it('stores null for blank values', () => {
    discoverSettingsStore.getState().setConnection('  ', '');
    expect(discoverSettingsStore.getState()).toMatchObject({ baseUrl: null, token: null });
  });

  it('clears the connection', () => {
    discoverSettingsStore.getState().setConnection('https://d.example.com', 'tok');
    discoverSettingsStore.getState().clearConnection();
    expect(discoverSettingsStore.getState()).toMatchObject({ baseUrl: null, token: null });
  });

  it('persists only baseUrl, token and the Last.fm key', () => {
    const partialize = discoverSettingsStore.persist.getOptions().partialize!;
    discoverSettingsStore.getState().setConnection('https://d.example.com', 'tok');
    discoverSettingsStore.getState().setLastfmApiKey('key');
    expect(partialize(discoverSettingsStore.getState())).toEqual({
      baseUrl: 'https://d.example.com',
      token: 'tok',
      lastfmApiKey: 'key',
    });
  });

  it('stores a blank Last.fm key as none', () => {
    discoverSettingsStore.getState().setLastfmApiKey(' abc ');
    expect(discoverSettingsStore.getState().lastfmApiKey).toBe('abc');
    discoverSettingsStore.getState().setLastfmApiKey('  ');
    expect(discoverSettingsStore.getState().lastfmApiKey).toBeNull();
  });
});
