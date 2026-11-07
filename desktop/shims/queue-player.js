// react-native-queue-player's native objects (TrackPlayer, Equalizer, Visualizer,
// CastManager), written for the desktop build on HTML audio + Web Audio. The
// library's own JS (hooks, queue deltas) runs unchanged on top of these, through
// the react-native-nitro-modules shim.
//
// Audio graph: two decks (audio elements), each with its own gain for fades and
// ReplayGain -> 10-band EQ -> master volume -> analyser -> speakers. Two decks let
// the next track preload for gapless playback and overlap for crossfade.

const PROGRESS_MS = 500;
const RESTART_THRESHOLD_S = 3;
const MILESTONES = [25, 50, 75, 90];
const SLEEP_FADE_S = 10;
const VOLUME_KEY = 'tars.volume';

function savedVolume() {
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    const v = Number(raw);
    return raw != null && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
  } catch {
    return 1;
  }
}

function emitter() {
  const subs = new Set();
  const on = (cb) => {
    subs.add(cb);
    return () => subs.delete(cb);
  };
  const emit = (...args) => {
    for (const cb of Array.from(subs)) {
      try {
        cb(...args);
      } catch (e) {
        console.warn('[player] listener failed', e);
      }
    }
  };
  return { on, emit, get size() {
    return subs.size;
  } };
}

// ---------------------------------------------------------------- audio graph

const EQ_FREQS = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
let graph = null;

function getGraph() {
  if (graph) return graph;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx({ latencyHint: 'playback' });
  const filters = EQ_FREQS.map((hz, i) => {
    const f = ctx.createBiquadFilter();
    f.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
    f.frequency.value = hz;
    f.Q.value = 1.1;
    f.gain.value = 0;
    return f;
  });
  for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);
  const master = ctx.createGain();
  master.gain.value = savedVolume();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  filters[filters.length - 1].connect(master);
  master.connect(analyser);
  analyser.connect(ctx.destination);
  graph = { ctx, input: filters[0], filters, master, analyser };
  return graph;
}

function resumeContext() {
  const g = getGraph();
  if (g.ctx.state === 'suspended') g.ctx.resume().catch(() => {});
}

function createDeck() {
  const g = getGraph();
  const el = new Audio();
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';
  const source = g.ctx.createMediaElementSource(el);
  const gain = g.ctx.createGain();
  source.connect(gain);
  gain.connect(g.input);
  return { el, gain, track: null, key: null, rg: 1 };
}

// ------------------------------------------------------------------ equalizer

const EQ_STORE_KEY = 'tars.desktop.equalizer';
const BUILTIN_PRESETS = [
  ['Flat', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  ['Acoustic', [4, 4, 3, 1, 2, 2, 3, 3, 3, 2]],
  ['Bass Boost', [6, 5, 4, 2, 0, 0, 0, 0, 0, 0]],
  ['Bass Reducer', [-6, -5, -4, -2, 0, 0, 0, 0, 0, 0]],
  ['Classical', [4, 3, 3, 2, -1, -1, 0, 2, 3, 4]],
  ['Dance', [4, 6, 5, 0, 2, 3, 4, 4, 3, 0]],
  ['Electronic', [4, 4, 1, 0, -2, 2, 1, 1, 4, 5]],
  ['Hip-Hop', [5, 4, 1, 3, -1, -1, 1, -1, 2, 3]],
  ['Jazz', [4, 3, 1, 2, -2, -2, 0, 1, 3, 4]],
  ['Loudness', [6, 4, 0, 0, -2, 0, -1, -5, 5, 1]],
  ['Pop', [-1, -1, 0, 2, 4, 4, 2, 0, -1, -1]],
  ['Rock', [5, 4, 3, 1, -1, -1, 2, 3, 4, 4]],
  ['Treble Boost', [0, 0, 0, 0, 0, 1, 3, 4, 5, 6]],
  ['Vocal Booster', [-2, -3, -3, 1, 4, 4, 3, 1, 0, -2]],
].map(([name, gains]) => ({ name, gains, builtin: true }));

function clampGain(db) {
  if (!Number.isFinite(db)) return 0;
  return Math.max(-12, Math.min(12, db));
}

function createEqualizer() {
  let state = { enabled: false, gains: new Array(10).fill(0), custom: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(EQ_STORE_KEY) || 'null');
    if (saved && Array.isArray(saved.gains)) state = { ...state, ...saved };
  } catch {
    /* fresh */
  }
  const bandEv = emitter();
  const enabledEv = emitter();

  const bands = () => EQ_FREQS.map((hz, i) => ({ frequencyHz: hz, gainDb: state.gains[i] ?? 0 }));
  const apply = () => {
    try {
      const g = getGraph();
      g.filters.forEach((f, i) => {
        f.gain.setTargetAtTime(state.enabled ? state.gains[i] ?? 0 : 0, g.ctx.currentTime, 0.02);
      });
    } catch {
      /* no audio yet */
    }
    try {
      localStorage.setItem(EQ_STORE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  };
  const setGains = (gains) => {
    state.gains = EQ_FREQS.map((_, i) => clampGain(gains[i] ?? 0));
    apply();
    bandEv.emit(bands());
  };
  apply();

  return {
    setEnabled: async (enabled) => {
      state.enabled = !!enabled;
      apply();
      enabledEv.emit(state.enabled);
    },
    isEnabled: () => state.enabled,
    getBands: bands,
    setBandGain: async (index, gainDb) => {
      const next = state.gains.slice();
      next[index] = gainDb;
      setGains(next);
    },
    setAllBandGains: async (gains) => setGains(gains),
    applyPreset: async (name) => {
      const p = [...BUILTIN_PRESETS, ...state.custom].find((x) => x.name === name);
      if (p) setGains(p.gains);
    },
    getPresets: () => [...BUILTIN_PRESETS, ...state.custom],
    saveCustomPreset: async (name) => {
      state.custom = state.custom.filter((p) => p.name !== name);
      state.custom.push({ name, gains: state.gains.slice(), builtin: false });
      apply();
    },
    deleteCustomPreset: async (name) => {
      state.custom = state.custom.filter((p) => p.name !== name);
      apply();
    },
    reset: async () => setGains(new Array(10).fill(0)),
    onBandChange: bandEv.on,
    onEnabledChange: enabledEv.on,
  };
}

// ----------------------------------------------------------------- visualizer

function createVisualizer() {
  let count = 0;
  return {
    subscribe: (config, onFrame) => {
      count += 1;
      const g = getGraph();
      const size = config?.fftSize || 1024;
      const bins = new Uint8Array(size / 2);
      const timer = setInterval(() => {
        g.analyser.getByteFrequencyData(bins);
        onFrame({ fft: bins.slice().buffer, sampleRate: g.ctx.sampleRate });
      }, Math.max(16, config?.updateIntervalMs || 33));
      return () => {
        clearInterval(timer);
        count -= 1;
      };
    },
    getSubscriberCount: () => count,
  };
}

// ---------------------------------------------------------------------- cast

const LOCAL_ROUTE = {
  castProtocol: 'local',
  receiverId: '',
  name: '',
  iconHint: 'speaker',
  capabilities: { supportsRemoteVolume: false, streamingModel: 'local', requiresPairing: false },
  protocolVersion: '',
};
const SPEAKER = { kind: 'speaker', name: 'Windows', identifier: 'default', isExternal: false, isSystemManaged: true };

function createCastManager() {
  const never = () => () => {};
  return {
    getSupportedProtocols: () => ['local'],
    configure: async () => {},
    startDiscovery: async () => {},
    stopDiscovery: async () => {},
    isDiscovering: () => false,
    getReceivers: () => [],
    getCurrentRoute: () => LOCAL_ROUTE,
    connect: async () => {
      throw new Error('Casting is not available on Windows');
    },
    disconnect: async () => {},
    showSystemPicker: async () => {},
    getRouteVolume: () => 1,
    setRouteVolume: async () => {},
    submitPairingPin: async () => {},
    getLocalNetworkPermissionState: () => 'granted',
    requestLocalNetworkPermission: async () => 'granted',
    onRouteChange: never,
    onReceiversChange: never,
    onDiscoveryStateChange: never,
    onSessionDied: never,
    onLocalNetworkPermissionChange: never,
    getCurrentAudioRoute: () => SPEAKER,
    onAudioRouteChange: never,
  };
}

// The system media overlay only takes http(s)/data/blob artwork; cached covers are
// local files, so they are handed over as blob URLs.
let artworkCache = { url: null, blob: null };
function artworkFor(url) {
  if (!url) return [];
  if (!/^file:/i.test(url)) return [{ src: url, sizes: '512x512' }];
  if (artworkCache.url !== url) {
    try {
      const { req, toPath } = require('./node');
      const bytes = req('fs').readFileSync(toPath(url));
      if (artworkCache.blob) URL.revokeObjectURL(artworkCache.blob);
      artworkCache = { url, blob: URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })) };
    } catch {
      return [];
    }
  }
  return [{ src: artworkCache.blob, sizes: '512x512', type: 'image/jpeg' }];
}

// --------------------------------------------------------------- track player

function dbToGain(db) {
  return Math.pow(10, db / 20);
}

function createTrackPlayer() {
  const ev = {
    state: emitter(),
    track: emitter(),
    queue: emitter(),
    progress: emitter(),
    milestone: emitter(),
    error: emitter(),
    queueEnd: emitter(),
    skip: emitter(),
    sleep: emitter(),
    buffer: emitter(),
    fullyBuffered: emitter(),
    cache: emitter(),
    format: emitter(),
  };

  let config = {};
  let queue = [];
  let index = -1;
  let state = 'none';
  let repeat = 'off';
  let mode = { kind: 'gapless' };
  let speed = 1;
  let volume = savedVolume();
  let rgMode = 'off';
  let remote = { skipMode: 'track', forwardJumpInterval: 15, backwardJumpInterval: 15 };
  let revision = 0;
  let wantPlay = false;
  let bufferState = 'empty';
  let lastSkip = { canSkipNext: false, canSkipPrevious: false };
  let firedMilestones = new Set();
  let sleep = { active: false, endOfTrack: false };
  let sleepTimer = null;
  let progressTimer = null;
  let fading = null; // { deck, timer } of the deck fading out in a crossfade
  let pendingSeek = null;
  let decks = null;
  let lookahead = { enabled: false };

  const deckPair = () => {
    if (!decks) {
      decks = { cur: createDeck(), next: createDeck() };
      for (const d of [decks.cur, decks.next]) wireDeck(d);
    }
    return decks;
  };

  const trackKey = (t) => (t ? `${t.id ?? ''}|${t.url}` : null);
  const current = () => (index >= 0 && index < queue.length ? queue[index] : undefined);

  // ----- state + events
  const setState = (next, reason = 'system') => {
    if (state === next) return;
    state = next;
    ev.state.emit(next, reason);
    updateMediaSessionState();
  };

  const setBuffer = (next) => {
    if (bufferState === next) return;
    bufferState = next;
    ev.buffer.emit(next);
  };

  const skipCapability = () => {
    const has = queue.length > 0 && index >= 0;
    const canSkipNext = has && (index < queue.length - 1 || repeat === 'queue');
    const canSkipPrevious =
      has && (config.skipToPreviousBehavior === 'restart-or-previous' || index > 0 || repeat === 'queue');
    return { canSkipNext, canSkipPrevious };
  };
  const emitSkip = () => {
    const cap = skipCapability();
    if (cap.canSkipNext !== lastSkip.canSkipNext || cap.canSkipPrevious !== lastSkip.canSkipPrevious) {
      lastSkip = cap;
      ev.skip.emit(cap);
    }
  };

  const emitQueue = (reason, fields) => {
    revision += 1;
    const delta = {
      revision,
      length: queue.length,
      inserted: [],
      insertedAt: -1,
      removed: [],
      movedFrom: -1,
      movedTo: -1,
      order: [],
      ...fields,
    };
    ev.queue.emit(delta, index, reason);
    emitSkip();
    prepareNext();
  };

  const position = () => {
    const el = decks?.cur.el;
    if (!el || !decks.cur.track) return 0;
    return pendingSeek ?? el.currentTime ?? 0;
  };
  const duration = () => {
    const el = decks?.cur.el;
    const d = el && Number.isFinite(el.duration) ? el.duration : 0;
    return d || current()?.duration || 0;
  };
  const buffered = () => {
    const el = decks?.cur.el;
    if (!el || !el.buffered || el.buffered.length === 0) return 0;
    return el.buffered.end(el.buffered.length - 1);
  };
  const emitProgress = () => {
    ev.progress.emit({ position: position(), duration: duration(), buffered: buffered() });
    updatePositionState();
  };

  const checkMilestones = () => {
    const d = duration();
    if (!d) return;
    const pct = (position() / d) * 100;
    for (const m of MILESTONES) {
      if (pct >= m && !firedMilestones.has(m)) {
        firedMilestones.add(m);
        ev.milestone.emit(m, index);
      }
    }
  };

  const startTicker = () => {
    if (progressTimer) return;
    progressTimer = setInterval(() => {
      if (state !== 'playing') return;
      emitProgress();
      checkMilestones();
      maybeCrossfade();
      maybeSleepEndOfTrack();
    }, PROGRESS_MS);
  };

  // ----- ReplayGain
  const replayGainFactor = (t) => {
    if (!t || rgMode === 'off') return 1;
    const album = rgMode === 'album';
    const gainDb = album ? t.replayGainAlbumGain ?? t.replayGainTrackGain : t.replayGainTrackGain ?? t.replayGainAlbumGain;
    const peak = album ? t.replayGainAlbumPeak ?? t.replayGainTrackPeak : t.replayGainTrackPeak ?? t.replayGainAlbumPeak;
    if (gainDb == null || !Number.isFinite(gainDb)) return 1;
    let f = dbToGain(gainDb);
    if (peak && peak > 0) f = Math.min(f, 1 / peak);
    return f;
  };
  const setDeckGain = (deck, value, rampS = 0) => {
    const g = getGraph();
    const now = g.ctx.currentTime;
    deck.gain.gain.cancelScheduledValues(now);
    if (rampS > 0) {
      deck.gain.gain.setValueAtTime(deck.gain.gain.value, now);
      deck.gain.gain.linearRampToValueAtTime(value, now + rampS);
    } else {
      deck.gain.gain.setValueAtTime(value, now);
    }
  };

  // ----- deck element wiring (only the current deck drives player state)
  function wireDeck(deck) {
    const el = deck.el;
    const isCur = () => decks && decks.cur === deck;
    el.addEventListener('playing', () => {
      if (!isCur()) return;
      setBuffer('full');
      setState('playing', 'user');
    });
    el.addEventListener('waiting', () => {
      if (!isCur()) return;
      setBuffer('buffering');
      if (wantPlay) setState('buffering');
    });
    el.addEventListener('stalled', () => {
      if (isCur()) setBuffer('stalled');
    });
    el.addEventListener('loadedmetadata', () => {
      if (!isCur()) return;
      if (pendingSeek != null) {
        try {
          el.currentTime = pendingSeek;
        } catch {
          /* ignore */
        }
        pendingSeek = null;
      }
      emitProgress();
      updateMediaSessionMetadata();
    });
    el.addEventListener('progress', () => {
      if (!isCur()) return;
      const d = el.duration;
      const full = Number.isFinite(d) && d > 0 && buffered() >= d - 0.5;
      ev.fullyBuffered.emit(full);
    });
    el.addEventListener('ended', () => {
      if (isCur()) handleEnded();
    });
    el.addEventListener('error', () => {
      if (!isCur() || !deck.track) return;
      const mediaErr = el.error;
      const code =
        mediaErr?.code === 2 ? 'CONNECTION_LOST' : mediaErr?.code === 3 ? 'DECODING_FAILED' : mediaErr?.code === 4 ? 'FILE_FORMAT_NOT_RECOGNIZED' : 'UNKNOWN';
      ev.error.emit({
        code,
        message: mediaErr?.message || 'Playback failed',
        fatal: true,
        nativeCode: mediaErr?.code ?? 0,
        nativeDomain: 'MediaError',
        nativeMessage: mediaErr?.message || '',
        queueItemId: deck.track.id ?? '',
        url: deck.track.url,
      });
      setState('error', 'error');
    });
  }

  const loadInto = (deck, track) => {
    deck.track = track;
    deck.key = trackKey(track);
    deck.rg = replayGainFactor(track);
    deck.el.playbackRate = speed;
    deck.el.defaultPlaybackRate = speed;
    if (deck.blobUrl) {
      URL.revokeObjectURL(deck.blobUrl);
      deck.blobUrl = null;
    }
    if (track) {
      deck.el.src = track.url;
      deck.el.load();
    } else {
      deck.el.removeAttribute('src');
      deck.el.load();
    }
  };

  const isSeekable = (el, t) => {
    const r = el.seekable;
    for (let i = 0; r && i < r.length; i++) {
      if (t >= r.start(i) && t <= r.end(i)) return true;
    }
    return false;
  };

  const loadWhole = async (deck, target) => {
    const key = deck.key;
    const wasPlaying = wantPlay;
    try {
      const res = await fetch(deck.track.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (deck.key !== key || decks.cur !== deck) return;
      const url = URL.createObjectURL(blob);
      if (deck.blobUrl) URL.revokeObjectURL(deck.blobUrl);
      deck.blobUrl = url;
      pendingSeek = target;
      deck.el.src = url;
      deck.el.load();
      if (wasPlaying) await playCurrentDeck();
    } catch (e) {
      console.warn('[player] seek fallback failed', e);
      pendingSeek = null;
    }
  };

  const nextIndex = () => {
    if (repeat === 'track') return index;
    if (index + 1 < queue.length) return index + 1;
    if (repeat === 'queue' && queue.length > 0) return 0;
    return -1;
  };

  // Preload the following track on the spare deck so it starts without a gap.
  function prepareNext() {
    if (!decks) return;
    if (fading && fading.deck === decks.next) return;
    const ni = nextIndex();
    const t = ni >= 0 && ni !== index ? queue[ni] : undefined;
    if (!t) return;
    if (decks.next.key === trackKey(t)) return;
    decks.next.el.pause();
    loadInto(decks.next, t);
  }

  const cancelFade = () => {
    if (!fading) return;
    clearTimeout(fading.timer);
    fading.deck.el.pause();
    fading = null;
  };

  const playCurrentDeck = async () => {
    const { cur } = deckPair();
    resumeContext();
    try {
      await cur.el.play();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      console.warn('[player] play failed', e);
    }
  };

  // Seat queue[i] on the current deck and announce it.
  const seat = async (i, reason, { gapMs } = {}) => {
    const { cur, next } = deckPair();
    cancelFade();
    const t = queue[i];
    index = i;
    firedMilestones = new Set();
    pendingSeek = null;
    cur.el.pause();
    if (t && next.key === trackKey(t) && next.key !== cur.key) {
      decks.cur = next;
      decks.next = cur;
    } else {
      loadInto(cur, t);
    }
    const d = decks.cur;
    d.rg = replayGainFactor(t);
    setDeckGain(d, d.rg);
    if (t) {
      try {
        d.el.currentTime = 0;
      } catch {
        /* not loaded yet */
      }
    }
    ev.track.emit(t, i, reason, gapMs);
    updateMediaSessionMetadata();
    emitSkip();
    prepareNext();
    if (wantPlay && t) {
      setState('loading');
      await playCurrentDeck();
    } else if (t) {
      setState('paused');
    }
    emitProgress();
  };

  function handleEnded() {
    if (sleep.active && sleep.endOfTrack) {
      clearSleep();
      wantPlay = false;
      setState('paused', 'sleep-timer');
      return;
    }
    if (repeat === 'track') {
      firedMilestones = new Set();
      const el = decks.cur.el;
      el.currentTime = 0;
      void el.play();
      return;
    }
    const ni = nextIndex();
    if (ni < 0) {
      wantPlay = false;
      setState('ended', 'queue-end');
      ev.queueEnd.emit();
      return;
    }
    void seat(ni, 'auto-advance', { gapMs: 0 });
  }

  function maybeCrossfade() {
    if (mode.kind !== 'crossfade' || fading || repeat === 'track') return;
    const fadeS = Math.max(0.5, (mode.crossfadeDurationMs ?? 6000) / 1000);
    const d = duration();
    if (!d || d < fadeS * 2) return;
    const remaining = d - position();
    if (remaining > fadeS || remaining <= 0.2) return;
    const ni = nextIndex();
    if (ni < 0) return;
    const { cur, next } = deckPair();
    const t = queue[ni];
    if (next.key !== trackKey(t)) loadInto(next, t);
    // Hand over: the new track becomes current now, the old one fades out.
    const outgoing = cur;
    const fadeLeft = remaining;
    decks.cur = next;
    decks.next = outgoing;
    index = ni;
    firedMilestones = new Set();
    next.rg = replayGainFactor(t);
    setDeckGain(next, 0);
    try {
      next.el.currentTime = 0;
    } catch {
      /* ignore */
    }
    setDeckGain(next, next.rg, fadeLeft);
    setDeckGain(outgoing, 0, fadeLeft);
    fading = {
      deck: outgoing,
      timer: setTimeout(() => {
        outgoing.el.pause();
        fading = null;
        prepareNext();
      }, fadeLeft * 1000 + 100),
    };
    void next.el.play();
    ev.track.emit(t, ni, 'auto-advance', undefined);
    updateMediaSessionMetadata();
    emitSkip();
  }

  // ----- sleep timer
  function clearSleep() {
    if (sleepTimer) clearTimeout(sleepTimer);
    sleepTimer = null;
    sleep = { active: false, endOfTrack: false };
    ev.sleep.emit(sleep);
  }
  function maybeSleepEndOfTrack() {
    if (!sleep.active || !sleep.endOfTrack) return;
    const remaining = duration() - position();
    if (remaining > 0 && remaining < SLEEP_FADE_S && decks) {
      setDeckGain(decks.cur, 0, remaining);
    }
  }
  const sleepNow = () => {
    sleepTimer = null;
    wantPlay = false;
    decks?.cur.el.pause();
    if (decks) setDeckGain(decks.cur, decks.cur.rg);
    sleep = { active: false, endOfTrack: false };
    ev.sleep.emit(sleep);
    setState('paused', 'sleep-timer');
  };

  // ----- media session (Windows media keys + the system media overlay)
  function updateMediaSessionMetadata() {
    const ms = navigator.mediaSession;
    if (!ms) return;
    const t = current();
    if (!t) {
      ms.metadata = null;
      return;
    }
    try {
      ms.metadata = new window.MediaMetadata({
        title: t.title || '',
        artist: t.artist || '',
        album: t.album || '',
        artwork: artworkFor(t.artworkUrl),
      });
    } catch {
      /* ignore */
    }
  }
  function updateMediaSessionState() {
    const ms = navigator.mediaSession;
    if (!ms) return;
    ms.playbackState = state === 'playing' || state === 'buffering' ? 'playing' : state === 'none' ? 'none' : 'paused';
  }
  function updatePositionState() {
    const ms = navigator.mediaSession;
    const d = duration();
    if (!ms || !ms.setPositionState || !d) return;
    try {
      ms.setPositionState({ duration: d, position: Math.min(position(), d), playbackRate: speed });
    } catch {
      /* ignore */
    }
  }
  const installMediaSession = () => {
    const ms = navigator.mediaSession;
    if (!ms) return;
    const handlers = {
      play: () => api.play(),
      pause: () => api.pause(),
      stop: () => api.pause(),
      nexttrack: () => api.skipToNext(),
      previoustrack: () => api.skipToPrevious(),
      seekto: (d) => d && d.seekTime != null && api.seekTo(d.seekTime),
      seekforward: () => api.seekTo(position() + (remote.forwardJumpInterval || 15)),
      seekbackward: () => api.seekTo(Math.max(0, position() - (remote.backwardJumpInterval || 15))),
    };
    for (const [action, fn] of Object.entries(handlers)) {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        /* unsupported action */
      }
    }
  };

  const api = {
    configure: async (cfg) => {
      config = { ...(cfg || {}) };
      installMediaSession();
      startTicker();
      emitSkip();
    },
    destroy: async () => {
      wantPlay = false;
      cancelFade();
      if (decks) {
        decks.cur.el.pause();
        decks.next.el.pause();
      }
      setState('none');
    },

    // ----- queue
    setQueue: async (tracks, startAtIndex = 0) => {
      queue = (tracks || []).slice();
      wantPlay = false;
      const start = queue.length ? Math.max(0, Math.min(queue.length - 1, startAtIndex | 0)) : -1;
      index = start;
      emitQueue('set-queue', { inserted: queue.slice(), insertedAt: 0 });
      if (start >= 0) await seat(start, 'queue-replaced');
      else {
        if (decks) decks.cur.el.pause();
        ev.track.emit(undefined, -1, 'queue-replaced', undefined);
        setState('none');
      }
    },
    addToQueue: async (tracks, insertBefore) => {
      const items = (tracks || []).slice();
      if (!items.length) return;
      const at =
        insertBefore == null || !Number.isFinite(insertBefore) ? queue.length : Math.max(0, Math.min(queue.length, insertBefore));
      const wasEmpty = queue.length === 0;
      queue.splice(at, 0, ...items);
      if (!wasEmpty && index >= at) index += items.length;
      if (wasEmpty) index = 0;
      emitQueue('add', { inserted: items, insertedAt: at });
      if (wasEmpty) await seat(0, 'queue-replaced');
    },
    removeFromQueue: async (indices) => {
      const drop = Array.from(new Set((indices || []).filter((i) => i >= 0 && i < queue.length))).sort((a, b) => a - b);
      if (!drop.length) return;
      const removingCurrent = drop.includes(index);
      const before = drop.filter((i) => i < index).length;
      const dropSet = new Set(drop);
      queue = queue.filter((_, i) => !dropSet.has(i));
      if (removingCurrent) {
        index = Math.min(index - before, queue.length - 1);
      } else {
        index -= before;
      }
      emitQueue('remove', { removed: drop });
      if (removingCurrent) {
        if (index >= 0) await seat(index, 'queue-replaced');
        else {
          wantPlay = false;
          decks?.cur.el.pause();
          ev.track.emit(undefined, -1, 'queue-replaced', undefined);
          setState('none');
        }
      }
    },
    moveInQueue: async (from, to) => {
      if (from === to || from < 0 || from >= queue.length) return;
      const target = Math.max(0, Math.min(queue.length - 1, to));
      const [moved] = queue.splice(from, 1);
      queue.splice(target, 0, moved);
      if (index === from) index = target;
      else if (from < index && target >= index) index -= 1;
      else if (from > index && target <= index) index += 1;
      emitQueue('move', { movedFrom: from, movedTo: target });
    },
    getQueue: async () => queue.slice(),
    clearQueue: async () => {
      queue = [];
      index = -1;
      wantPlay = false;
      cancelFade();
      if (decks) {
        decks.cur.el.pause();
        loadInto(decks.cur, null);
      }
      emitQueue('clear', {});
      ev.track.emit(undefined, -1, 'queue-replaced', undefined);
      setState('none');
    },
    shuffleQueue: async () => {
      const wasPlaying = state === 'playing' || state === 'buffering' || state === 'loading';
      const order = queue.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const prev = queue;
      queue = order.map((i) => prev[i]);
      index = queue.length ? 0 : -1;
      emitQueue('shuffle', { order });
      wantPlay = wasPlaying;
      if (index >= 0) await seat(0, 'queue-replaced');
      return { tracks: queue.slice(), currentIndex: index, currentTrack: queue[index] };
    },

    // ----- transport
    play: async () => {
      if (index < 0 || !queue.length) return;
      wantPlay = true;
      deckPair();
      if (state === 'ended') {
        await seat(index, 'user-skip-to-index');
        return;
      }
      if (decks.cur.key !== trackKey(current())) {
        await seat(index, 'queue-replaced');
        return;
      }
      setDeckGain(decks.cur, decks.cur.rg);
      if (state !== 'playing') setState(decks.cur.el.readyState >= 3 ? 'playing' : 'loading', 'user');
      await playCurrentDeck();
    },
    pause: async () => {
      wantPlay = false;
      cancelFade();
      decks?.cur.el.pause();
      setState('paused', 'user');
      emitProgress();
    },
    stop: async () => {
      wantPlay = false;
      cancelFade();
      if (decks) {
        decks.cur.el.pause();
        try {
          decks.cur.el.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
      setState('paused', 'user');
      emitProgress();
    },
    retry: async () => {
      if (index < 0) return;
      const pos = position();
      wantPlay = true;
      deckPair();
      loadInto(decks.cur, current());
      pendingSeek = pos;
      setState('loading');
      await playCurrentDeck();
    },
    seekTo: async (pos) => {
      if (index < 0) return;
      const { cur } = deckPair();
      const target = Math.max(0, pos);
      const d = duration();
      if (d) {
        const pct = (target / d) * 100;
        for (const m of MILESTONES) if (m <= pct) firedMilestones.add(m);
      }
      if (cur.el.readyState >= 1 && !isSeekable(cur.el, target) && /^https?:/i.test(cur.track?.url || '')) {
        // A stream the server can't serve from the middle (no byte ranges, e.g. a
        // transcoded one): the browser would jump back to 0. Load the whole track
        // into memory once and seek in that.
        pendingSeek = target;
        emitProgress();
        await loadWhole(cur, target);
        return;
      }
      if (cur.el.readyState >= 1) {
        cur.el.currentTime = target;
        pendingSeek = null;
      } else {
        pendingSeek = target;
      }
      emitProgress();
    },
    skipToIndex: async (i) => {
      if (i < 0 || i >= queue.length) return;
      await seat(i, 'user-skip-to-index');
    },
    skipToNext: async () => {
      if (!queue.length) return;
      let ni = index + 1;
      if (ni >= queue.length) {
        if (repeat !== 'queue') return;
        ni = 0;
      }
      await seat(ni, 'user-skip-next');
    },
    skipToPrevious: async () => {
      if (!queue.length) return;
      if (config.skipToPreviousBehavior === 'restart-or-previous' && position() > RESTART_THRESHOLD_S) {
        await api.seekTo(0);
        return;
      }
      let pi = index - 1;
      if (pi < 0) {
        if (repeat === 'queue') pi = queue.length - 1;
        else {
          await api.seekTo(0);
          return;
        }
      }
      await seat(pi, 'user-skip-previous');
    },

    // ----- modes
    setPlaybackMode: async (m) => {
      mode = { kind: m?.kind === 'crossfade' ? 'crossfade' : 'gapless', crossfadeDurationMs: m?.crossfadeDurationMs };
    },
    getPlaybackMode: () => mode,
    setPlaybackSpeed: async (rate) => {
      speed = rate > 0 ? rate : 1;
      if (decks) for (const d of [decks.cur, decks.next]) {
        d.el.playbackRate = speed;
        d.el.defaultPlaybackRate = speed;
      }
    },
    setPitchCorrectionMode: async (m) => {
      const keep = m !== 'none';
      if (decks) for (const d of [decks.cur, decks.next]) d.el.preservesPitch = keep;
    },
    getPitchCorrectionMode: () => 'auto',
    setVolume: async (v) => {
      volume = Math.max(0, Math.min(1, v));
      try {
        window.localStorage.setItem(VOLUME_KEY, String(volume));
      } catch {
        /* not persisted */
      }
      const g = getGraph();
      g.master.gain.setTargetAtTime(volume, g.ctx.currentTime, 0.02);
    },
    getVolume: () => volume,
    setRepeatMode: async (m) => {
      repeat = m === 'queue' || m === 'track' ? m : 'off';
      emitSkip();
      prepareNext();
    },
    setRemoteControls: async (opts) => {
      remote = { ...remote, ...(opts || {}) };
    },
    getRemoteControls: () => remote,

    // ----- sleep timer
    setSleepTimer: async (seconds) => {
      if (sleepTimer) clearTimeout(sleepTimer);
      const ms = Math.max(0, seconds) * 1000;
      const endsAt = Date.now() + ms;
      sleep = { active: true, endOfTrack: false, endsAtEpochMs: endsAt, remainingSeconds: Math.round(seconds) };
      sleepTimer = setTimeout(sleepNow, ms);
      ev.sleep.emit(sleep);
    },
    setSleepTimerToTrackEnd: async () => {
      if (sleepTimer) clearTimeout(sleepTimer);
      sleepTimer = null;
      sleep = { active: true, endOfTrack: true };
      ev.sleep.emit(sleep);
    },
    clearSleepTimer: async () => {
      if (decks) setDeckGain(decks.cur, decks.cur.rg);
      clearSleep();
    },
    getSleepTimer: () => {
      if (sleep.active && sleep.endsAtEpochMs) {
        return { ...sleep, remainingSeconds: Math.max(0, Math.round((sleep.endsAtEpochMs - Date.now()) / 1000)) };
      }
      return sleep;
    },

    // ----- getters
    getState: () => state,
    getCurrentTrackIndex: () => index,
    getCurrentTrackSource: () => {
      const t = current();
      if (!t) return undefined;
      return /^file:/i.test(t.url) ? 'local' : 'streaming';
    },
    getPlaybackSpeed: () => speed,
    getBufferState: () => bufferState,
    getIsSeekable: () => true,
    isFullyBuffered: () => {
      const d = duration();
      return !!d && buffered() >= d - 0.5;
    },
    getCanSkipNext: () => skipCapability().canSkipNext,
    getCanSkipPrevious: () => skipCapability().canSkipPrevious,
    getSkipCapability: () => skipCapability(),

    // ----- subscriptions
    onStateChange: ev.state.on,
    onTrackChange: ev.track.on,
    onQueueChange: ev.queue.on,
    onProgress: ev.progress.on,
    onPlaybackMilestone: ev.milestone.on,
    onError: ev.error.on,
    onQueueEnd: ev.queueEnd.on,
    onSkipCapabilityChange: ev.skip.on,
    onSleepTimerChange: ev.sleep.on,
    onBufferStateChange: ev.buffer.on,
    onFullyBufferedChange: ev.fullyBuffered.on,

    // ----- car / voice: not on Windows
    setBrowseSnapshot: () => {},
    onBrowseRequest: () => () => {},
    onSearchRequest: () => () => {},
    onPlayFromSearchRequest: () => () => {},
    onPlayFromIdRequest: () => () => {},
    donateVoiceVocabulary: () => {},
    onCarConnect: () => () => {},
    onCarDisconnect: () => () => {},
    isCarConnected: () => false,
    onServiceReady: () => () => {},

    // ----- lookahead cache: the browser's own HTTP cache does this job here
    setLookaheadCache: async (cfg) => {
      lookahead = { ...lookahead, ...(cfg || {}) };
    },
    getLookaheadCacheStatus: async () => ({
      enabled: !!lookahead.enabled,
      currentSizeMb: 0,
      maxSizeMb: config.lookaheadCacheMaxSizeMb ?? 0,
      tracksFullyCached: 0,
      currentlyCaching: [],
    }),
    clearLookaheadCache: async () => {},
    onCacheStatusChange: (cb) => {
      const off = ev.cache.on(cb);
      void api.getLookaheadCacheStatus().then((s) => cb(s));
      return off;
    },

    // ----- ReplayGain
    setReplayGainMode: async (m) => {
      rgMode = m || 'off';
      if (decks) {
        for (const d of [decks.cur, decks.next]) {
          d.rg = replayGainFactor(d.track);
        }
        setDeckGain(decks.cur, decks.cur.rg, 0.2);
      }
    },
    getReplayGainMode: () => rgMode,
    getNowPlayingFormat: () => null,
    onNowPlayingFormatChange: ev.format.on,
  };

  return api;
}

const singletons = {};
const factories = {
  TrackPlayer: createTrackPlayer,
  Equalizer: createEqualizer,
  Visualizer: createVisualizer,
  CastManager: createCastManager,
};

const NitroModules = {
  createHybridObject(name) {
    if (!singletons[name]) {
      const factory = factories[name];
      if (!factory) throw new Error(`[desktop] No desktop implementation for ${name}`);
      singletons[name] = factory();
    }
    return singletons[name];
  },
  hasHybridObject: (name) => name in factories,
  getAllHybridObjectNames: () => Object.keys(factories),
};

if (typeof window !== 'undefined') {
  // Diagnostics from the developer tools (F12): window.__tarsAudio()
  window.__tarsAudio = () => ({ graph, player: singletons.TrackPlayer });
}

module.exports = { __esModule: true, NitroModules };
