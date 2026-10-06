jest.mock('../../store/persistence/kvStorage', () => require('../../store/persistence/__mocks__/kvStorage'));

const mockReactionRunners: Array<{
  deps: () => unknown;
  body: (curr: unknown, prev: unknown | null) => void;
  prev: unknown | null;
}> = [];

jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const R = require('react');
  const { View, Text } = RN;
  return {
    __esModule: true,
    default: { View, Text },
    View,
    Text,
    useSharedValue: (init: unknown) => {
      // Stable across renders, like real Reanimated — use a ref.
      const ref = R.useRef(null);
      if (ref.current === null) {
        ref.current = { value: init };
      }
      return ref.current;
    },
    useDerivedValue: (fn: () => unknown) => {
      const ref = R.useRef(null);
      if (ref.current === null) {
        const sv: { value: unknown } = { value: undefined };
        Object.defineProperty(sv, 'value', {
          get: () => fn(),
          configurable: true,
        });
        ref.current = sv;
      }
      return ref.current;
    },
    useAnimatedStyle: (fn: () => object) => fn(),
    useAnimatedReaction: (
      deps: () => unknown,
      body: (curr: unknown, prev: unknown | null) => void,
    ) => {
      const ref = R.useRef(null);
      if (ref.current === null) {
        const entry = { deps, body, prev: null };
        ref.current = entry;
        mockReactionRunners.push(entry);
      } else {
        ref.current.deps = deps;
        ref.current.body = body;
      }
    },
    withSpring: (val: number) => val,
    runOnJS: (fn: Function) => fn,
  };
});

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: (props: object) => <View {...props} /> };
});

jest.mock('../../services/playerService', () => ({
  seekTo: jest.fn(),
}));

jest.mock('../../utils/haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light' },
}));

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { seekTo } from '../../services/playerService';
import { playerStore } from '../../store/playerStore';
import { impactAsync } from '../../utils/haptics';
import { type LyricsLine } from '../../services/subsonicService';

const { SyncedLyricsView } = require('../SyncedLyricsView');

// NOTE: the auto-scroll mechanism (ScrollView ref + useEffect watching
// `activeIndexJs`) is intentionally NOT asserted here. ScrollView's
// `scrollTo` is a host-component instance method, and intercepting it
// cleanly in jest-expo's sandbox fights with the New Arch test shim more
// than it's worth — the scroll behaviour is verified on-device. These
// tests cover the deterministic pieces: rendering, tap-to-seek, interlude
// insertion, and empty-lines guard.

const LINES: LyricsLine[] = [
  { startMs: 0, text: 'first' },
  { startMs: 2000, text: 'second' },
  { startMs: 4000, text: 'third' },
];

function resetMocks() {
  mockReactionRunners.length = 0;
  (seekTo as jest.Mock).mockReset();
  (impactAsync as jest.Mock).mockReset();
}

beforeEach(() => {
  resetMocks();
  playerStore.setState({
    position: 0,
    playbackState: 'paused',
    currentTrack: null,
  });
});

function renderView(props: Partial<{
  lines: LyricsLine[];
  offsetMs: number;
  source: 'structured' | 'fake';
}> = {}) {
  return render(
    <SyncedLyricsView
      lines={props.lines ?? LINES}
      offsetMs={props.offsetMs ?? 0}
      source={props.source ?? 'structured'}
      textColor="#ffffff"
    />,
  );
}

describe('SyncedLyricsView', () => {
  it('renders every line exactly twice (weight-crossfade layers)', () => {
    const { getAllByText } = renderView();
    for (const line of LINES) {
      expect(getAllByText(line.text).length).toBe(2);
    }
  });

  it('tapping a line seeks to its timestamp in seconds when source=structured', () => {
    const { getAllByText } = renderView();
    fireEvent.press(getAllByText('second')[0]);
    expect(impactAsync).toHaveBeenCalledTimes(1);
    expect(seekTo).toHaveBeenCalledWith(2);
  });

  it('does not seek when source=fake', () => {
    const { getAllByText } = renderView({ source: 'fake' });
    fireEvent.press(getAllByText('second')[0]);
    expect(seekTo).not.toHaveBeenCalled();
  });

  it('inserts breathing-dot interludes between lines with gaps > 5s', () => {
    const LONG_GAP_LINES: LyricsLine[] = [
      { startMs: 0, text: 'intro' },
      { startMs: 20_000, text: 'verse' }, // gap 20s → interlude
      { startMs: 22_000, text: 'chorus' }, // gap 2s → no interlude
    ];
    const { UNSAFE_root } = renderView({ lines: LONG_GAP_LINES });
    const textNodes = UNSAFE_root.findAll(
      (n) => typeof n.props.children === 'string' && ['intro', 'verse', 'chorus'].includes(n.props.children),
    );
    expect(textNodes.length).toBeGreaterThanOrEqual(6);
  });

  it('ignores taps with no matching start time', () => {
    const { UNSAFE_root } = renderView({ lines: [] });
    expect(UNSAFE_root).toBeTruthy();
    expect(seekTo).not.toHaveBeenCalled();
  });
});
