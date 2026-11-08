const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

jest.mock('../subsonicService', () => ({
  getSubsonicAuthHeaders: jest.fn(async () => ({
    'X-Subsonic-User': 'dino',
    'X-Subsonic-Token': 'tok',
    'X-Subsonic-Salt': 'salt',
  })),
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async (_alg: string, text: string) =>
    require('crypto').createHash('sha256').update(text).digest('hex'),
  ),
}));
jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

import { createHash } from 'crypto';

import { authStore } from '../../store/authStore';
import { discoverSettingsStore } from '../../store/discoverSettingsStore';
import {
  DEFAULT_DISCOVER_URL,
  connectWithLogin,
  disconnectDiscover,
  enableAutoConnect,
  ensureDiscoverSession,
  resetDiscoverAuthForTests,
} from '../discoverAuthService';

const MUSIC = 'https://music.douglas.seg.br';
const hash = (h: string) => createHash('sha256').update(h).digest('hex');
const info = (hosts: string[]) => ({ ok: true, status: 200, json: async () => ({ navidrome_hosts_sha256: hosts.map(hash) }) });
const session = (token = 's1.tok', expires = Date.now() / 1000 + 86400) => ({
  ok: true,
  status: 200,
  json: async () => ({ token, expires_at: expires }),
});
const status = (code: number) => ({ ok: false, status: code, json: async () => ({}) });

function login(serverUrl = MUSIC, username = 'dino') {
  authStore.setState({ isLoggedIn: true, serverUrl, primaryServerUrl: serverUrl, username });
}

beforeEach(() => {
  mockFetch.mockReset();
  resetDiscoverAuthForTests();
  discoverSettingsStore.setState({
    baseUrl: null, token: null, mode: null, tokenExpiresAt: null, account: null, autoConnectDisabled: false,
  });
  login();
});

it('connects the TARSMusic server account to the default backend with a session', async () => {
  mockFetch.mockResolvedValueOnce(info(['music.douglas.seg.br'])).mockResolvedValueOnce(session());
  await expect(ensureDiscoverSession()).resolves.toBe(true);
  expect(mockFetch.mock.calls[0][0]).toBe(`${DEFAULT_DISCOVER_URL}/auth/info`);
  expect(mockFetch.mock.calls[1]).toEqual([
    `${DEFAULT_DISCOVER_URL}/auth/session`,
    { method: 'POST', headers: { 'X-Subsonic-User': 'dino', 'X-Subsonic-Token': 'tok', 'X-Subsonic-Salt': 'salt' } },
  ]);
  expect(discoverSettingsStore.getState()).toMatchObject({
    baseUrl: DEFAULT_DISCOVER_URL,
    token: 's1.tok',
    mode: 'login',
    account: `${MUSIC}|dino`,
  });
});

it('never sends credentials when the backend does not serve the user server', async () => {
  login('https://other.example.com');
  mockFetch.mockResolvedValueOnce(info(['music.douglas.seg.br']));
  await expect(ensureDiscoverSession()).resolves.toBe(false);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(discoverSettingsStore.getState().token).toBeNull();
});

it('keeps a static token from Settings untouched', async () => {
  discoverSettingsStore.getState().setConnection('https://d.example.com', 'admin');
  await expect(ensureDiscoverSession()).resolves.toBe(true);
  expect(mockFetch).not.toHaveBeenCalled();
});

it('reuses a fresh session and renews one close to expiry', async () => {
  discoverSettingsStore.getState().setSession(DEFAULT_DISCOVER_URL, 'old', Date.now() + 20 * 3600e3, `${MUSIC}|dino`);
  await expect(ensureDiscoverSession()).resolves.toBe(true);
  expect(mockFetch).not.toHaveBeenCalled();

  discoverSettingsStore.getState().setSession(DEFAULT_DISCOVER_URL, 'old', Date.now() + 3600e3, `${MUSIC}|dino`);
  mockFetch.mockResolvedValueOnce(info(['music.douglas.seg.br'])).mockResolvedValueOnce(session('new'));
  await ensureDiscoverSession();
  expect(discoverSettingsStore.getState().token).toBe('new');
});

it('drops the session of another account', async () => {
  discoverSettingsStore.getState().setSession(DEFAULT_DISCOVER_URL, 'old', Date.now() + 20 * 3600e3, `${MUSIC}|other`);
  mockFetch.mockResolvedValueOnce(info(['music.douglas.seg.br'])).mockResolvedValueOnce(status(401));
  await expect(ensureDiscoverSession()).resolves.toBe(false);
  expect(discoverSettingsStore.getState()).toMatchObject({ token: null, mode: null });
});

it('does not reconnect on its own after the user disconnects', async () => {
  disconnectDiscover();
  await expect(ensureDiscoverSession()).resolves.toBe(false);
  expect(mockFetch).not.toHaveBeenCalled();
  mockFetch.mockResolvedValueOnce(info(['music.douglas.seg.br'])).mockResolvedValueOnce(session());
  await expect(enableAutoConnect()).resolves.toBe(true);
});

it('keeps a valid session while the backend is unreachable', async () => {
  discoverSettingsStore.getState().setSession(DEFAULT_DISCOVER_URL, 'old', Date.now() + 3600e3, `${MUSIC}|dino`);
  mockFetch.mockResolvedValueOnce(info(['music.douglas.seg.br'])).mockRejectedValueOnce(new Error('offline'));
  await expect(ensureDiscoverSession()).resolves.toBe(true);
  expect(discoverSettingsStore.getState().token).toBe('old');
});

it('logs in to a backend the user typed without the host check', async () => {
  mockFetch.mockResolvedValueOnce(session('typed'));
  await expect(connectWithLogin('https://d.example.com/')).resolves.toBe(true);
  expect(mockFetch.mock.calls[0][0]).toBe('https://d.example.com/auth/session');
  expect(discoverSettingsStore.getState()).toMatchObject({ baseUrl: 'https://d.example.com', token: 'typed' });
});

it('accepts a server address saved without a scheme', async () => {
  login('music.douglas.seg.br');
  mockFetch.mockResolvedValueOnce(info(['music.douglas.seg.br'])).mockResolvedValueOnce(session());
  await expect(ensureDiscoverSession()).resolves.toBe(true);
});

describe('hostOf', () => {
  const { hostOf } = require('../discoverAuthService');
  it.each([
    ['https://music.douglas.seg.br', 'music.douglas.seg.br'],
    ['music.douglas.seg.br', 'music.douglas.seg.br'],
    ['MUSIC.douglas.seg.br/', 'music.douglas.seg.br'],
    ['https://music.douglas.seg.br:443/navidrome', 'music.douglas.seg.br'],
    ['http://192.168.0.5:4533', '192.168.0.5:4533'],
    ['https://u:p@music.douglas.seg.br', 'music.douglas.seg.br'],
  ])('%s -> %s', (url, host) => {
    expect(hostOf(url)).toBe(host);
  });
});
