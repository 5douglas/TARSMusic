import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { useLyricsActiveLine } from '../useLyricsActiveLine';
import type { LyricsData } from '../../services/subsonicService';
import { playerStore } from '../../store/playerStore';

const synced = (n: number, offsetMs = 0): LyricsData => ({
  synced: true,
  offsetMs,
  source: 'structured',
  lines: Array.from({ length: n }, (_, i) => ({ startMs: (i + 1) * 2000, text: `line ${i}` })),
});

describe('useLyricsActiveLine', () => {
  beforeEach(() => {
    jest.useFakeTimers({ legacyFakeTimers: false });
    jest.setSystemTime(new Date('2026-11-01T00:00:00Z'));
    playerStore.setState({ position: 0, playbackState: 'playing' });
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('is -1 before the first line and for unsynced lyrics', () => {
    const { result } = renderHook(({ l }: { l: LyricsData }) => useLyricsActiveLine(l), { initialProps: { l: synced(5) } });
    expect(result.current).toBe(-1);
    const unsynced = renderHook(({ l }: { l: LyricsData }) => useLyricsActiveLine(l), { initialProps: { l: { ...synced(5), synced: false } } });
    playerStore.setState({ position: 30 });
    expect(unsynced.result.current).toBe(-1);
  });

  it('follows the reported position', () => {
    const { result } = renderHook(({ l }: { l: LyricsData }) => useLyricsActiveLine(l), { initialProps: { l: synced(5) } });
    act(() => playerStore.setState({ position: 4.5 }));
    expect(result.current).toBe(1);
  });

  it('keeps moving between position reports while playing', () => {
    const { result } = renderHook(({ l }: { l: LyricsData }) => useLyricsActiveLine(l), { initialProps: { l: synced(5) } });
    act(() => playerStore.setState({ position: 1.5 }));
    expect(result.current).toBe(-1);
    // No new report, but 600 ms of playback puts the clock past the first line (2 s).
    act(() => {
      jest.advanceTimersByTime(600);
    });
    expect(result.current).toBe(0);
  });

  it('stands still while paused', () => {
    playerStore.setState({ playbackState: 'paused' });
    const { result } = renderHook(({ l }: { l: LyricsData }) => useLyricsActiveLine(l), { initialProps: { l: synced(5) } });
    act(() => playerStore.setState({ position: 1.5 }));
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current).toBe(-1);
  });

  it('applies the lyrics offset', () => {
    const { result } = renderHook(({ l }: { l: LyricsData }) => useLyricsActiveLine(l), { initialProps: { l: synced(5, 1000) } });
    act(() => playerStore.setState({ position: 2.5 }));
    expect(result.current).toBe(-1);
    act(() => playerStore.setState({ position: 3.0 }));
    expect(result.current).toBe(0);
  });
});
