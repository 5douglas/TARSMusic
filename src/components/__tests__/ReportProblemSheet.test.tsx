jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: { primary: '#f60', textPrimary: '#fff', textSecondary: '#888', border: '#333', inputBg: '#222' },
  }),
}));
jest.mock('../BottomSheet', () => {
  const { View } = require('react-native');
  return {
    BottomSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? <View>{children}</View> : null,
  };
});
jest.mock('../../services/discoverService', () => ({
  isDiscoverConfigured: jest.fn(() => true),
  reportSongProblem: jest.fn(),
}));
jest.mock('../../store/persistence/lyricsTable', () => ({
  loadLyrics: jest.fn(async () => null),
  saveLyrics: jest.fn(async () => undefined),
  deleteLyrics: jest.fn(),
  clearAllLyrics: jest.fn(),
}));
jest.mock('../../services/subsonicService', () => ({ getLyricsForTrack: jest.fn(async () => null) }));

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { reportSongProblem } from '../../services/discoverService';
import { lyricsStore } from '../../store/lyricsStore';
import { reportProblemStore } from '../../store/reportProblemStore';
import { ReportProblemSheet } from '../ReportProblemSheet';

const mockReport = reportSongProblem as jest.MockedFunction<typeof reportSongProblem>;

const synced = {
  synced: true,
  lines: [{ startMs: 1000, text: 'hello' }],
  offsetMs: 0,
  source: 'structured' as const,
};

beforeEach(() => {
  mockReport.mockReset();
  lyricsStore.setState({ entries: { s1: synced }, loading: {}, errors: {} });
  act(() => reportProblemStore.getState().show({ id: 's1', title: 'Song', artist: 'Artist' }));
});

it('sends a wrong-lyrics report and stores the lyrics the server found', async () => {
  mockReport.mockResolvedValue({ status: 'fixed', lyrics: '[00:02.00]right words\n' });
  const { getByText } = render(<ReportProblemSheet />);
  fireEvent.press(getByText('Wrong lyrics'));
  await waitFor(() => expect(reportProblemStore.getState().visible).toBe(false));
  expect(mockReport).toHaveBeenCalledWith('s1', 'lyrics_wrong', {});
  expect(lyricsStore.getState().entries.s1.lines).toEqual([{ startMs: 2000, text: 'right words' }]);
});

it('adjusts the sync at once and sends the total offset', async () => {
  mockReport.mockResolvedValue({ status: 'fixed', lyrics: '[00:00.50]hello\n' });
  const { getByText } = render(<ReportProblemSheet />);
  fireEvent.press(getByText('Lyrics out of sync'));
  fireEvent.press(getByText('Earlier 0.5 s'));
  expect(lyricsStore.getState().entries.s1.offsetMs).toBe(-500);
  expect(getByText('-0.5 s')).toBeTruthy();
  fireEvent.press(getByText('Save for everyone'));
  await waitFor(() => expect(mockReport).toHaveBeenCalledWith('s1', 'lyrics_offset', { offsetMs: -500 }));
  await waitFor(() => expect(lyricsStore.getState().entries.s1.offsetMs).toBe(0));
  expect(lyricsStore.getState().entries.s1.lines[0].startMs).toBe(500);
});

it('offers the other lyrics reports when there is nothing synced to adjust', () => {
  lyricsStore.setState({ entries: { s1: { ...synced, synced: false } } });
  const { getByText } = render(<ReportProblemSheet />);
  fireEvent.press(getByText('Lyrics out of sync'));
  expect(getByText('This song has no synced lyrics to adjust.')).toBeTruthy();
});
