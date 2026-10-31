import { activeLyricsLine, lyricsCardWindow } from '../PlayerLyricsCard';
import type { LyricsData } from '../../services/subsonicService';

const synced = (n: number, offsetMs = 0): LyricsData => ({
  synced: true,
  offsetMs,
  source: 'structured',
  lines: Array.from({ length: n }, (_, i) => ({ startMs: i * 1000, text: `line ${i}` })),
});

describe('activeLyricsLine', () => {
  it('is -1 before the first line and follows the position after', () => {
    const lines = [{ startMs: 500 }, { startMs: 1500 }];
    expect(activeLyricsLine(lines, 0, 0)).toBe(-1);
    expect(activeLyricsLine(lines, 0, 600)).toBe(0);
    expect(activeLyricsLine(lines, 0, 5000)).toBe(1);
  });

  it('applies the lyrics offset', () => {
    expect(activeLyricsLine([{ startMs: 1000 }], 500, 1200)).toBe(-1);
    expect(activeLyricsLine([{ startMs: 1000 }], 500, 1500)).toBe(0);
  });
});

describe('lyricsCardWindow', () => {
  it('keeps one sung line above the current one', () => {
    const view = lyricsCardWindow(synced(20), 5200);
    expect(view.lines[0]).toBe('line 4');
    expect(view.lines[view.activeInWindow]).toBe('line 5');
    expect(view.lines).toHaveLength(7);
  });

  it('starts at the top before the song reaches the first line', () => {
    const view = lyricsCardWindow(synced(20, 3000), 0);
    expect(view.lines[0]).toBe('line 0');
    expect(view.activeInWindow).toBe(-1);
  });

  it('stops scrolling at the last lines', () => {
    const view = lyricsCardWindow(synced(10), 9500);
    expect(view.lines[view.lines.length - 1]).toBe('line 9');
    expect(view.lines[view.activeInWindow]).toBe('line 9');
  });

  it('shows the first lines of unsynced lyrics with none active', () => {
    const view = lyricsCardWindow({ ...synced(10), synced: false }, 9000);
    expect(view.lines[0]).toBe('line 0');
    expect(view.activeInWindow).toBe(-1);
  });
});
