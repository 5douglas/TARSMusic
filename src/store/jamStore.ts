import { create } from 'zustand';

import { DEFAULT_JAM_PERMS, type JamPerms } from '../services/jamPerms';

export type JamMode = 'none' | 'host' | 'guest';

export interface JamSessionSummary {
  sid: string;
  host: string;
  title?: string;
  artist?: string;
  coverArt?: string;
  playing: boolean;
  listeners: number;
}

/** UI state of the listening-together session. Not persisted: a restart leaves the session. */
interface JamState {
  mode: JamMode;
  sid: string | null;
  /** Username of the host (this account while hosting). */
  host: string | null;
  /** Listeners in the session, by username (the host is not included). */
  members: string[];
  /** True once the server answered for this session at least once. */
  connected: boolean;
  /** Last problem talking to the server, cleared by the next good answer. */
  error: string | null;
  /** Why the last session this phone was in ended, until the user starts or joins another. */
  ended: 'host-left' | null;
  /** Sessions other people are hosting right now (the "Ouvir junto" list). */
  sessions: JamSessionSummary[];
  /**
   * What listeners may do. The host edits it (kept between sessions); a listener holds the
   * host's latest rules.
   */
  perms: JamPerms;
  /** Listeners set to "listen only" by the host. */
  listenOnly: string[];
  sessionsLoading: boolean;
  sessionsError: string | null;

  setSession: (mode: JamMode, sid: string | null, host: string | null) => void;
  setMembers: (members: string[]) => void;
  setConnected: (connected: boolean, error?: string | null) => void;
  setEnded: (ended: 'host-left' | null) => void;
  setSessions: (sessions: JamSessionSummary[]) => void;
  setPerms: (perms: JamPerms) => void;
  setListenOnly: (listenOnly: string[]) => void;
  setSessionsLoading: (loading: boolean, error?: string | null) => void;
}

export const jamStore = create<JamState>()((set) => ({
  mode: 'none',
  sid: null,
  host: null,
  members: [],
  connected: false,
  error: null,
  ended: null,
  sessions: [],
  perms: DEFAULT_JAM_PERMS,
  listenOnly: [],
  sessionsLoading: false,
  sessionsError: null,

  setSession: (mode, sid, host) => set({ mode, sid, host, members: [], connected: false, error: null }),
  setMembers: (members) =>
    set((s) => (s.members.length === members.length && s.members.every((m, i) => m === members[i]) ? {} : { members })),
  setConnected: (connected, error = null) => set({ connected, error }),
  setEnded: (ended) => set({ ended }),
  setPerms: (perms) =>
    set((s) =>
      s.perms.playback === perms.playback && s.perms.skip === perms.skip && s.perms.queue === perms.queue ? {} : { perms },
    ),
  setListenOnly: (listenOnly) =>
    set((s) =>
      s.listenOnly.length === listenOnly.length && s.listenOnly.every((m, i) => m === listenOnly[i]) ? {} : { listenOnly },
    ),
  setSessions: (sessions) => set({ sessions, sessionsLoading: false, sessionsError: null }),
  setSessionsLoading: (sessionsLoading, sessionsError = null) => set({ sessionsLoading, sessionsError }),
}));
