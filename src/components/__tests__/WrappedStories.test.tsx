/**
 * Retrospectiva stories: which stories show, tapping through them, and sharing one.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../hooks/useTopArtists', () => ({ useArtistCoverArt: () => undefined }));
jest.mock('../CachedImage', () => ({ CachedImage: () => null }));
const mockCapture = jest.fn();
jest.mock('react-native-view-shot', () => ({ captureRef: (...a: unknown[]) => mockCapture(...a) }));
const mockShare = jest.fn();
jest.mock('expo-sharing', () => ({ shareAsync: (...a: unknown[]) => mockShare(...a) }));

import { STORY_MS, storyIds, WrappedStories, type WrappedStoriesData } from '../WrappedStories';
import type { WrappedSummary } from '../../utils/wrapped';

const summary: WrappedSummary = {
  totalPlays: 120,
  totalSeconds: 7200,
  uniqueArtists: 2,
  uniqueAlbums: 1,
  uniqueSongs: 2,
  daysListened: 9,
  topArtists: [{ artist: 'Ana Banda', count: 80 }, { artist: 'Bia', count: 40 }],
  topAlbums: [{ album: 'Disco', artist: 'Ana Banda', count: 50 }],
  topSongs: [{ song: { id: 's1', title: 'Faixa Um', artist: 'Ana Banda', isDir: false } as never, count: 30 }],
  topGenres: [{ genre: 'Rock', count: 90 }],
  peakHour: 21,
  busiestDay: { date: '2026-03-01', count: 20 },
};

const data: WrappedStoriesData = {
  summary,
  periodLabel: '2026',
  minutes: 120,
  peakHourLabel: '21:00',
  busiestDayLabel: '1 de março',
  bestMonthLabel: 'março',
  fmtInt: (n) => String(Math.round(n)),
};

beforeEach(() => jest.clearAllMocks());

it('shows only the stories that have data', () => {
  expect(storyIds(summary)).toEqual(['intro', 'minutes', 'topArtist', 'artists', 'songs', 'album', 'facts', 'summary']);
  expect(
    storyIds({ ...summary, topArtists: [], topAlbums: [], topSongs: [], topGenres: [], peakHour: null, busiestDay: null }),
  ).toEqual(['intro', 'minutes', 'summary']);
});

it('moves with taps and closes after the last story', () => {
  const onClose = jest.fn();
  render(<WrappedStories visible data={data} onClose={onClose} />);
  expect(screen.getByText('2026')).toBeTruthy();
  fireEvent.press(screen.getAllByLabelText('Next story')[0]);
  expect(screen.getByText('120')).toBeTruthy(); // minutes
  fireEvent.press(screen.getAllByLabelText('Previous story')[0]);
  expect(screen.getByText('2026')).toBeTruthy();
  for (let i = 0; i < 8; i++) fireEvent.press(screen.getAllByLabelText('Next story')[0]);
  expect(onClose).toHaveBeenCalled();
});

it('moves on by itself, even when the screen behind re-renders', () => {
  jest.useFakeTimers();
  try {
    const onClose = jest.fn();
    const view = render(<WrappedStories visible data={data} onClose={onClose} />);
    act(() => {
      jest.advanceTimersByTime(STORY_MS / 2);
    });
    // A new onClose on every render of the parent must not restart the story.
    view.rerender(<WrappedStories visible data={data} onClose={() => onClose()} />);
    act(() => {
      jest.advanceTimersByTime(STORY_MS / 2 + 200);
    });
    expect(screen.getByText('120')).toBeTruthy(); // minutes, the second story
  } finally {
    jest.useRealTimers();
  }
});

it('shares the current story as an image', async () => {
  mockCapture.mockResolvedValue('file:///tmp/story.png');
  render(<WrappedStories visible data={data} onClose={jest.fn()} />);
  await act(async () => {
    fireEvent.press(screen.getByText('Share'));
    await new Promise((r) => setTimeout(r, 100));
  });
  expect(mockCapture).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ format: 'png', result: 'tmpfile' }));
  expect(mockShare).toHaveBeenCalledWith('file:///tmp/story.png', expect.objectContaining({ mimeType: 'image/png' }));
});
