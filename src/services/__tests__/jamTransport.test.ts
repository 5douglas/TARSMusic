jest.mock('../../store/persistence/kvStorage', () => require('../../store/persistence/__mocks__/kvStorage'));

const mockApi = {
  getPlaylists: jest.fn(),
  createPlaylist: jest.fn(),
  updatePlaylist: jest.fn(),
};
jest.mock('../subsonicService', () => ({
  JAM_PLAYLIST_NAME: 'TARSMusic ouvir junto (não apagar)',
  getApi: () => mockApi,
  buildPostApi: () => mockApi,
}));

import { authStore } from '../../store/authStore';
import {
  encodeJamComment,
  findJamSession,
  isJamActionAllowed,
  parseJamComment,
  permForAction,
  writeOwnJamComment,
} from '../jamTransport';

const NAME = 'TARSMusic ouvir junto (não apagar)';
const hostDoc = {
  at: 1,
  track: 's1',
  q: ['s1', 's2'],
  pos: 12,
  playing: true,
  handled: {},
  members: [],
  perms: { playback: true, skip: true, queue: true },
  listenOnly: [],
};

const mockFetch = jest.fn();
(global as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  authStore.setState({ serverUrl: 'https://music.test/', username: 'dino', password: 'pw', isLoggedIn: true } as never);
});

describe('jam permissions', () => {
  it('maps each listener action to its group of controls', () => {
    expect(['play', 'pause', 'seek'].map((k) => permForAction(k as never))).toEqual(['playback', 'playback', 'playback']);
    expect(['next', 'prev', 'jump'].map((k) => permForAction(k as never))).toEqual(['skip', 'skip', 'skip']);
    expect(['add', 'addNext', 'playNow', 'remove', 'shuffle'].map((k) => permForAction(k as never))).toEqual([
      'queue', 'queue', 'queue', 'queue', 'queue',
    ]);
  });

  it('blocks a switched-off group and listen-only listeners', () => {
    const perms = { playback: true, skip: false, queue: true };
    expect(isJamActionAllowed('pause', 'ana', perms, [])).toBe(true);
    expect(isJamActionAllowed('next', 'ana', perms, [])).toBe(false);
    expect(isJamActionAllowed('add', 'Ana', perms, ['ana'])).toBe(false);
    expect(isJamActionAllowed('add', 'bia', perms, ['ana'])).toBe(true);
  });

  it('reads a host part from an older app (no rules) as everything allowed', () => {
    const old = { at: 1, track: 's1', q: ['s1'], pos: 0, playing: true, handled: {}, members: [] };
    const parsed = parseJamComment(encodeJamComment('host', 'abc123def', old as never));
    expect((parsed?.doc as { perms: unknown }).perms).toEqual({ playback: true, skip: true, queue: true });
    expect((parsed?.doc as { listenOnly: unknown }).listenOnly).toEqual([]);
  });
});

describe('jam comments', () => {
  it('round-trips a host and a guest part', () => {
    const host = parseJamComment(encodeJamComment('host', 'abc123def', hostDoc));
    expect(host).toEqual({ role: 'host', sid: 'abc123def', doc: hostDoc });
    const guest = parseJamComment(encodeJamComment('guest', 'abc123def', { at: 5, reqs: [{ kind: 'next', n: 7 }] }));
    expect(guest?.role).toBe('guest');
    expect(guest?.doc).toEqual({ at: 5, reqs: [{ kind: 'next', n: 7 }] });
  });

  it('keeps a | inside the JSON', () => {
    const doc = { ...hostDoc, title: 'A | B' };
    expect((parseJamComment(encodeJamComment('host', 'abc123def', doc))?.doc as typeof doc).title).toBe('A | B');
  });

  it('ignores anything that is not a session part', () => {
    expect(parseJamComment('')).toBeNull();
    expect(parseJamComment('a normal playlist comment')).toBeNull();
    expect(parseJamComment('TARSJAM1|boss|abc123def|{}')).toBeNull();
    expect(parseJamComment('TARSJAM1|host|AB|{}')).toBeNull();
    expect(parseJamComment('TARSJAM1|host|abc123def|{oops')).toBeNull();
    expect(parseJamComment('TARSJAM1|host|abc123def|{"at":1}')).toBeNull();
  });
});

describe('findJamSession', () => {
  it('logs in once, asks Navidrome for the session id and keeps only session playlists', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ token: 'T1' }))
      .mockResolvedValueOnce(
        jsonResponse(
          [
            { id: 'p1', name: NAME, ownerName: 'ana', comment: encodeJamComment('host', 'abc123def', hostDoc) },
            { id: 'p2', name: NAME, ownerName: 'dino', comment: encodeJamComment('guest', 'abc123def', { at: 2, reqs: [] }) },
            { id: 'p3', name: 'Rock', ownerName: 'ana', comment: encodeJamComment('host', 'abc123def', hostDoc) },
            { id: 'p4', name: NAME, ownerName: 'bob', comment: '' },
          ],
          200,
          { 'x-nd-authorization': 'Bearer T2' },
        ),
      )
      .mockResolvedValueOnce(jsonResponse([]));

    const entries = await findJamSession('abc123def');
    expect(entries.map((e) => [e.playlistId, e.owner, e.role])).toEqual([
      ['p1', 'ana', 'host'],
      ['p2', 'dino', 'guest'],
    ]);
    expect(mockFetch.mock.calls[0][0]).toBe('https://music.test/auth/login');
    expect(mockFetch.mock.calls[1][0]).toBe('https://music.test/api/playlist?q=%7Cabc123def%7C&_start=0&_end=200');
    expect(mockFetch.mock.calls[1][1].headers['X-ND-Authorization']).toBe('Bearer T1');

    // The refreshed token from the answer is used next, without logging in again.
    await findJamSession('abc123def');
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[2][1].headers['X-ND-Authorization']).toBe('Bearer T2');
  });

  it('logs in again when the token expired', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({ token: 'T3' }))
      .mockResolvedValueOnce(jsonResponse([]));
    await expect(findJamSession('abc123def')).resolves.toEqual([]);
    expect(mockFetch.mock.calls[1][0]).toBe('https://music.test/auth/login');
    expect(mockFetch.mock.calls[2][1].headers['X-ND-Authorization']).toBe('Bearer T3');
  });
});

describe('writeOwnJamComment', () => {
  it('creates the public session playlist once and writes the comment', async () => {
    mockApi.getPlaylists
      .mockResolvedValueOnce({ playlists: { playlist: [{ id: 'x', name: NAME, owner: 'ana' }] } })
      .mockResolvedValueOnce({ playlists: { playlist: [{ id: 'mine', name: NAME, owner: 'dino' }] } });
    await writeOwnJamComment('hello');
    await writeOwnJamComment('');
    expect(mockApi.createPlaylist).toHaveBeenCalledTimes(1);
    expect(mockApi.getPlaylists).toHaveBeenCalledTimes(2);
    expect(mockApi.updatePlaylist).toHaveBeenNthCalledWith(1, { playlistId: 'mine', comment: 'hello', public: true });
    expect(mockApi.updatePlaylist).toHaveBeenNthCalledWith(2, { playlistId: 'mine', comment: '', public: true });
  });
});

describe('findJamSession without the REST API', () => {
  it('falls back to Subsonic: one full list, then one small read per session playlist', async () => {
    const mockGetPlaylist = jest.fn();
    (mockApi as Record<string, jest.Mock>).getPlaylist = mockGetPlaylist;
    // A proxy that only passes /rest answers the login with an HTML page.
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
      headers: { get: () => null },
    });
    mockApi.getPlaylists.mockResolvedValueOnce({
      playlists: {
        playlist: [
          { id: 'p1', name: NAME, owner: 'ana', comment: encodeJamComment('host', 'abc123def', hostDoc) },
          { id: 'p9', name: 'TARSMusic backup (não apagar)', owner: 'ana', comment: 'huge' },
          { id: 'p2', name: NAME, owner: 'bob', comment: '' },
        ],
      },
    });

    const first = await findJamSession('abc123def');
    expect(first.map((e) => [e.playlistId, e.owner, e.role])).toEqual([['p1', 'ana', 'host']]);

    mockGetPlaylist.mockImplementation(async ({ id }: { id: string }) => ({
      playlist: { id, comment: id === 'p2' ? encodeJamComment('guest', 'abc123def', { at: 3, reqs: [] }) : '' },
    }));
    const second = await findJamSession('abc123def');
    expect(second.map((e) => [e.playlistId, e.owner, e.role])).toEqual([['p2', 'bob', 'guest']]);
    expect(mockApi.getPlaylists).toHaveBeenCalledTimes(1);
    expect(mockGetPlaylist.mock.calls.map((c) => c[0].id)).toEqual(['p1', 'p2']);
  });
});
