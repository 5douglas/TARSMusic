jest.mock('../../store/persistence/kvStorage', () => require('../../store/persistence/__mocks__/kvStorage'));

// The server: each user's session-playlist comment.
const mockServer = new Map<string, string>();
let mockMe = 'dino';
jest.mock('../jamTransport', () => {
  const actual = jest.requireActual('../jamTransport');
  const entries = (needle: string) =>
    [...mockServer.entries()]
      .filter(([, c]) => c.includes(needle))
      .map(([owner, c]) => ({ playlistId: `pl-${owner}`, owner, ...actual.parseJamComment(c) }))
      .filter((e) => e.role);
  return {
    ...actual,
    findJamSession: async (sid: string) => entries(`|${sid}|`),
    findJamHosts: async () => entries('TARSJAM1|host|'),
    writeOwnJamComment: async (c: string) => {
      mockServer.set(mockMe, c);
    },
    currentJamUser: () => mockMe,
  };
});

jest.mock('../subsonicService', () => ({
  getApi: () => ({ getSong: async ({ id }: { id: string }) => ({ song: { id, title: id } }) }),
}));

const mockPlayer = {
  playTrack: jest.fn(),
  skipToNext: jest.fn(),
  skipToPrevious: jest.fn(),
  seekTo: jest.fn(),
  skipToTrack: jest.fn(),
  togglePlayPause: jest.fn(),
  addToQueue: jest.fn(),
  playSongNext: jest.fn(),
  removeFromQueue: jest.fn(),
  shuffleQueue: jest.fn(),
};
jest.mock('../playerService', () =>
  new Proxy({}, { get: (_t, key: string) => (...args: unknown[]) => (mockPlayer as Record<string, jest.Mock>)[key](...args) }),
);

import { jamStore } from '../../store/jamStore';
import { playerStore } from '../../store/playerStore';
import { reportJamAction } from '../jamControl';
import {
  ClockSync,
  expectedPosition,
  livePosition,
  findQueueIndex,
  joinSession,
  leaveSession,
  pendingRequests,
  planQueueSync,
  refreshJamSessions,
  startHosting,
  syncJamNow,
  toWireAction,
} from '../jamService';
import { encodeJamComment, parseJamComment, type JamHostDoc } from '../jamTransport';

const song = (id: string) => ({ id, title: id, isDir: false }) as never;

function setPlayer(ids: string[], index: number, state: 'playing' | 'paused', position = 0) {
  const queue = ids.map((id) => ({ id, title: id, isDir: false, duration: 200 }) as never);
  // Like the real player: the song changes first, its first progress report follows.
  playerStore.setState({
    queue,
    currentTrack: queue[index] ?? null,
    currentTrackIndex: index,
    playbackState: state,
    duration: 200,
    queueLoading: false,
  });
  playerStore.setState({ position });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await leaveSession();
  mockServer.clear();
  mockMe = 'dino';
  for (const fn of Object.values(mockPlayer)) fn.mockResolvedValue(undefined);
  // Like the real player, the store follows what the follower does.
  mockPlayer.playTrack.mockImplementation(async (track: { id: string }, queue: { id: string }[]) => {
    setPlayer(queue.map((c) => c.id), Math.max(0, queue.findIndex((c) => c.id === track.id)), 'playing', 0);
  });
  mockPlayer.seekTo.mockImplementation(async (pos: number) => playerStore.setState({ position: pos }));
  mockPlayer.togglePlayPause.mockImplementation(async () =>
    playerStore.setState((st) => ({ playbackState: st.playbackState === 'playing' ? 'paused' : 'playing' })),
  );
});

afterAll(async () => {
  await leaveSession();
});

describe('helpers', () => {
  it('extrapolates the host position only while playing', () => {
    expect(expectedPosition({ at: 1000, pos: 10, playing: true }, 6000)).toBe(15);
    expect(expectedPosition({ at: 1000, pos: 10, playing: false }, 6000)).toBe(10);
  });

  it('corrects for a host clock that is off', () => {
    // The host clock runs 7 s behind ours.
    expect(expectedPosition({ at: 1000, pos: 10, playing: true }, 13_000, 7000)).toBe(15);
  });

  it('learns the clock offset from when reports show up', () => {
    const clock = new ClockSync();
    // Clocks agree: 0 stays inside the bounds.
    clock.note(10_000, 10_100, 10_300);
    clock.note(12_000, 12_100, 12_300);
    expect(clock.offset()).toBe(0);

    // Host clock 7 s behind ours: a report stamped at host 20 000 shows up at our 27 300.
    const skew = new ClockSync();
    skew.note(20_000, 26_900, 27_300); // first sight: offset <= 7300
    skew.note(20_000, 28_900, 29_300); // same report
    skew.note(22_000, 30_900, 31_300); // new since our read at 28 900: offset > 28 900 - 22 000 - 1000
    expect(skew.offset()).toBeGreaterThan(5000);
    expect(skew.offset()).toBeLessThanOrEqual(7300);
  });

  it('plans the queue sync', () => {
    expect(planQueueSync(['a', 'b'], ['a', 'b'])).toEqual({ type: 'none' });
    expect(planQueueSync(['a'], ['a', 'b', 'c'])).toEqual({ type: 'append', ids: ['b', 'c'] });
    expect(planQueueSync(['a', 'x'], ['a', 'b'])).toEqual({ type: 'replace' });
    // The host queue ends sooner than ours: our extra songs go.
    expect(planQueueSync(['a', 'b', 'c'], ['a', 'b'])).toEqual({ type: 'replace' });
    // A full window only shows the start of the host queue: extra local songs may be right.
    const full = Array.from({ length: 25 }, (_, i) => `s${i}`);
    expect(planQueueSync([...full, 'more'], full)).toEqual({ type: 'none' });
  });

  it('picks pending requests in order', () => {
    const reqs = [
      { kind: 'next' as const, n: 3 },
      { kind: 'prev' as const, n: 1 },
      { kind: 'play' as const, n: 2 },
    ];
    expect(pendingRequests(reqs, 1).map((r) => r.n)).toEqual([2, 3]);
    expect(pendingRequests(reqs, undefined).map((r) => r.n)).toEqual([1, 2, 3]);
  });

  it('finds the queue index nearest the hint', () => {
    const q = ['a', 'b', 'a', 'c', 'a'].map((id) => ({ id }));
    expect(findQueueIndex(q, 'a', 3)).toBe(2);
    expect(findQueueIndex(q, 'a', 4)).toBe(4);
    expect(findQueueIndex(q, 'z', 0)).toBe(-1);
  });

  it('sends songs as ids', () => {
    expect(toWireAction({ kind: 'add', songs: [song('a'), song('b')] })).toEqual({ kind: 'add', ids: ['a', 'b'] });
    expect(toWireAction({ kind: 'playNow', song: song('b'), queue: [song('a'), song('b'), song('c')] })).toEqual({
      kind: 'playNow',
      id: 'b',
      ids: ['b', 'c'],
    });
  });
});

describe('position', () => {
  it('counts time since the last progress report, and starts a new song at 0', async () => {
    setPlayer(['s1', 's2'], 0, 'playing', 50);
    await startHosting(); // installs the tracker
    const now = Date.now();
    expect(livePosition(now + 9000)).toBeGreaterThanOrEqual(58.9);
    // The song changes; the store still holds the old position until the next report.
    playerStore.setState({ currentTrack: playerStore.getState().queue[1], currentTrackIndex: 1 });
    expect(livePosition()).toBeLessThan(0.5);
    const doc = parseJamComment(encodeJamComment('host', 'x'.repeat(8), { at: 0, track: null, q: [], pos: 0, playing: true, handled: {}, members: [] }));
    expect(doc).not.toBeNull();
  });
});

describe('hosting', () => {
  it('publishes the player and carries out a listener request', async () => {
    setPlayer(['s1', 's2', 's3'], 0, 'playing', 42);
    await startHosting();
    const mine = parseJamComment(mockServer.get('dino'));
    expect(mine?.role).toBe('host');
    const doc = mine!.doc as JamHostDoc;
    expect(doc).toMatchObject({ track: 's1', q: ['s1', 's2', 's3'], pos: expect.closeTo(42, 1), playing: true, members: [] });

    mockServer.set('bob', encodeJamComment('guest', mine!.sid, { at: Date.now(), reqs: [{ kind: 'next', n: 5 }] }));
    await syncJamNow();
    expect(mockPlayer.skipToNext).toHaveBeenCalledTimes(1);
    expect(jamStore.getState().members).toEqual(['bob']);
    const after = parseJamComment(mockServer.get('dino'))!.doc as JamHostDoc;
    expect(after.handled).toEqual({ bob: 5 });
    expect(after.members).toEqual(['bob']);

    // Done requests are not repeated.
    await syncJamNow();
    expect(mockPlayer.skipToNext).toHaveBeenCalledTimes(1);

    await leaveSession();
    expect(mockServer.get('dino')).toBe('');
  });

  it('lists only fresh sessions of other people', async () => {
    const now = Date.now();
    mockServer.set('ana', encodeJamComment('host', 'aaaaaa111', { at: now, track: 's1', q: ['s1'], pos: 0, playing: true, handled: {}, members: ['bob'], title: 'Song' }));
    mockServer.set('old', encodeJamComment('host', 'bbbbbb222', { at: now - 10 * 60_000, track: 's1', q: ['s1'], pos: 0, playing: true, handled: {}, members: [] }));
    mockServer.set('dino', encodeJamComment('host', 'cccccc333', { at: now, track: 's1', q: ['s1'], pos: 0, playing: true, handled: {}, members: [] }));
    await refreshJamSessions();
    expect(jamStore.getState().sessions).toEqual([
      expect.objectContaining({ sid: 'aaaaaa111', host: 'ana', title: 'Song', listeners: 1, playing: true }),
    ]);
  });
});

describe('listening', () => {
  const SID = 'aaaaaa111';
  const hostAt = (doc: Partial<JamHostDoc>) =>
    mockServer.set(
      'ana',
      encodeJamComment('host', SID, { at: Date.now(), track: 's2', q: ['s2', 's3'], pos: 30, playing: true, handled: {}, members: ['dino'], ...doc }),
    );

  it("loads the host's song at the host's position", async () => {
    setPlayer(['x1'], 0, 'playing', 5);
    hostAt({});
    await joinSession(SID, 'ana');
    await syncJamNow();
    expect(mockPlayer.playTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }), [
      expect.objectContaining({ id: 's2' }),
      expect.objectContaining({ id: 's3' }),
    ]);
    expect(mockPlayer.seekTo).toHaveBeenCalledTimes(1);
    expect(mockPlayer.seekTo.mock.calls[0][0]).toBeGreaterThanOrEqual(30);
    expect(mockPlayer.seekTo.mock.calls[0][0]).toBeLessThan(32);
    expect(jamStore.getState().mode).toBe('guest');
  });

  it('pauses with the host and leaves when the host ends', async () => {
    setPlayer(['s2', 's3'], 0, 'playing', 30);
    hostAt({ playing: false });
    await joinSession(SID, 'ana');
    await syncJamNow();
    expect(mockPlayer.togglePlayPause).toHaveBeenCalledTimes(1);
    expect(mockPlayer.playTrack).not.toHaveBeenCalled();

    mockServer.set('ana', '');
    await syncJamNow();
    await syncJamNow();
    await syncJamNow();
    expect(jamStore.getState().mode).toBe('none');
    expect(jamStore.getState().ended).toBe('host-left');
    expect(mockServer.get('dino')).toBe('');
  });

  it("sends the listener's own controls to the host", async () => {
    setPlayer(['s2', 's3'], 0, 'playing', 30);
    hostAt({});
    await joinSession(SID, 'ana');
    reportJamAction({ kind: 'next' });
    reportJamAction({ kind: 'add', songs: [song('s9')] });
    await new Promise((r) => setTimeout(r, 0));
    const mine = parseJamComment(mockServer.get('dino'))!;
    expect(mine.role).toBe('guest');
    expect((mine.doc as { reqs: unknown[] }).reqs).toEqual([
      expect.objectContaining({ kind: 'next' }),
      expect.objectContaining({ kind: 'add', ids: ['s9'] }),
    ]);

    // Until the host has done them, the follower leaves the listener's player alone.
    setPlayer(['s3'], 0, 'playing', 0);
    await syncJamNow();
    expect(mockPlayer.playTrack).not.toHaveBeenCalled();
  });

  it("doesn't go back when it reached the host's next song a moment early", async () => {
    setPlayer(['s2', 's3'], 1, 'playing', 1);
    hostAt({ track: 's2', q: ['s2', 's3'], pos: 195, playing: true });
    await joinSession(SID, 'ana');
    await syncJamNow();
    expect(mockPlayer.skipToTrack).not.toHaveBeenCalled();
    expect(mockPlayer.playTrack).not.toHaveBeenCalled();
  });

  it('appends songs the host added', async () => {
    setPlayer(['s2', 's3'], 0, 'playing', 30);
    hostAt({ q: ['s2', 's3', 's4'] });
    await joinSession(SID, 'ana');
    await syncJamNow();
    expect(mockPlayer.addToQueue).toHaveBeenCalledWith([expect.objectContaining({ id: 's4' })]);
    expect(mockPlayer.seekTo).not.toHaveBeenCalled();
  });
});
