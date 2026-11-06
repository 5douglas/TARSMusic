/**
 * Wrapped: picks the latest year with history, queries that year's window, and
 * narrows to a month when its chip is tapped. The SQL readers are covered in
 * `store/persistence/__tests__/scrobbleAggregates.test.ts`.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('expo-router/react-navigation', () => {
  const ReactModule = require('react');
  return { HeaderHeightContext: ReactModule.createContext(0) };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      background: '#000000',
      card: '#111111',
      textPrimary: '#ffffff',
      textSecondary: '#888888',
      border: '#333333',
      primary: '#1D9BF0',
    },
  }),
}));
jest.mock('../../hooks/useTransitionComplete', () => ({ useTransitionComplete: () => true }));
jest.mock('../../hooks/useTopArtists', () => ({ useArtistCoverArt: () => undefined }));
jest.mock('../../components/GradientBackground', () => {
  const { View } = require('react-native');
  return { GradientBackground: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('../../components/BottomChrome', () => ({ BottomChrome: () => null }));
jest.mock('../../components/MiniBarChart', () => ({ MiniBarChart: () => null }));
jest.mock('../../components/TopItemRow', () => {
  const { Text } = require('react-native');
  return { TopItemRow: ({ title }: { title: string }) => <Text>{title}</Text> };
});
jest.mock('../../components/CachedImage', () => ({ CachedImage: () => null }));

const mockCompute = jest.fn();
const mockMonths = jest.fn();
jest.mock('../../store/persistence/scrobbleAggregates', () => ({
  computeScrobbleAnalytics: (a: number, b: number) => mockCompute(a, b),
  loadScrobbleMonthTotals: () => mockMonths(),
}));

import { WrappedScreen } from '../wrapped';

const result = (artist: string) => ({
  stats: { totalPlays: 3, totalListeningSeconds: 7200, uniqueArtists: { [artist]: true } },
  aggregates: {
    artistCounts: { [artist]: { count: 3 } },
    albumCounts: {},
    songStats: {},
    topSongs: [],
    genreCounts: { Rock: 3 },
    hourBuckets: new Array(24).fill(0),
    dayCounts: { '2026-03-01': 3 },
  },
});

beforeEach(() => {
  mockCompute.mockReset();
  mockMonths.mockReset();
});

it('shows the empty state with no history', async () => {
  mockMonths.mockResolvedValue([]);
  render(<WrappedScreen />);
  expect(await screen.findByText('No Wrapped yet')).toBeTruthy();
  expect(mockCompute).not.toHaveBeenCalled();
});

it('defaults to the latest year and narrows to a month', async () => {
  mockMonths.mockResolvedValue([
    { month: '2025-12', plays: 1, seconds: 100 },
    { month: '2026-03', plays: 3, seconds: 7200 },
  ]);
  mockCompute.mockImplementation(async (since: number) =>
    since === new Date(2026, 2, 1).getTime() ? result('March Artist') : result('Year Artist'),
  );
  render(<WrappedScreen />);

  await waitFor(() =>
    expect(mockCompute).toHaveBeenCalledWith(new Date(2026, 0, 1).getTime(), new Date(2027, 0, 1).getTime()),
  );
  expect((await screen.findAllByText('Year Artist')).length).toBeGreaterThan(0);
  expect(screen.getByText('2025')).toBeTruthy();
  expect(screen.getByText('Hours per month')).toBeTruthy();

  fireEvent.press(screen.getByText(/^Mar/));
  await waitFor(() =>
    expect(mockCompute).toHaveBeenCalledWith(new Date(2026, 2, 1).getTime(), new Date(2026, 3, 1).getTime()),
  );
  expect((await screen.findAllByText('March Artist')).length).toBeGreaterThan(0);
  expect(screen.queryByText('Hours per month')).toBeNull();
});
