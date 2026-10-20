import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { DiscoverHome } from '../../services/discoverService';

jest.mock('expo-image', () => ({ Image: () => null }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ colors: { textPrimary: '#fff', textSecondary: '#888', primary: '#1D9BF0', green: '#0f0' } }),
}));
const mockHome = jest.fn();
jest.mock('../../services/discoverService', () => ({
  fetchDiscoverHome: (...args: unknown[]) => mockHome(...args),
  queueDiscoverDownload: jest.fn(),
}));
jest.mock('../../services/discoverPreviewService', () => ({ toggleDiscoverPreview: jest.fn() }));

import { DiscoverHomeView } from '../DiscoverHomeView';

const home: DiscoverHome = {
  updated: '',
  scanning: false,
  sections: [
    {
      id: 'releases',
      title: 'Lancamentos',
      items: [{
        id: 9, type: 'album', title: 'Memórias', artist: 'Jão', artist_id: 5, cover: null, cover_small: null,
        record_type: 'album', release_date: '2026-07-27', track_count: 14, explicit: false, link: '', in_library: true,
      }],
    },
    {
      id: 'mixes',
      title: 'Mixes para voce',
      items: [{ id: 'mix-5', type: 'mix', title: 'Mix Jão', artist: 'Jão', cover: null, cover_small: null, path: '/playlists/mix/5' }],
    },
    {
      id: 'charts',
      title: 'Charts',
      items: [{ id: 'charts-br', type: 'chart', title: 'Top Brasil', count: 100, cover: null, cover_small: null, path: '/playlists/charts?country=BR' }],
    },
  ],
};

beforeEach(() => {
  mockHome.mockReset();
  mockPush.mockReset();
});

describe('DiscoverHomeView', () => {
  it('renders each section as cards and opens them', async () => {
    mockHome.mockResolvedValue(home);
    render(<DiscoverHomeView topInset={0} />);
    expect(screen.getByText('Building playlist…')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('New releases')).toBeTruthy());
    expect(screen.getByText('Mixes for you')).toBeTruthy();
    expect(screen.getByText('Charts')).toBeTruthy();
    expect(screen.getByText('Jão · album')).toBeTruthy();
    expect(screen.getByText('Like Jão')).toBeTruthy();
    expect(screen.getByText('100 songs')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Memórias'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/discover-browse',
      params: { kind: 'album', id: '9', title: 'Memórias' },
    });
    fireEvent.press(screen.getByLabelText('Mix Jão'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/discover-browse',
      params: { kind: 'playlist', path: '/playlists/mix/5', title: 'Mix Jão' },
    });
  });

  it('hides empty sections', async () => {
    mockHome.mockResolvedValue({ ...home, sections: [{ ...home.sections[1], items: [] }, home.sections[2]] });
    render(<DiscoverHomeView topInset={0} />);
    await waitFor(() => expect(screen.getByText('Charts')).toBeTruthy());
    expect(screen.queryByText('Mixes for you')).toBeNull();
  });

  it('shows the error state and retries with refresh', async () => {
    mockHome.mockResolvedValueOnce(null);
    render(<DiscoverHomeView topInset={0} />);
    await waitFor(() => expect(screen.getByText('Could not load this playlist')).toBeTruthy());
    mockHome.mockResolvedValueOnce(home);
    await act(async () => fireEvent.press(screen.getByText('Retry')));
    expect(mockHome).toHaveBeenLastCalledWith(true);
    expect(screen.getByText('New releases')).toBeTruthy();
  });

  it('keeps the loaded home when a refresh fails', async () => {
    mockHome.mockResolvedValueOnce(home).mockResolvedValueOnce(null);
    const { UNSAFE_getByType } = render(<DiscoverHomeView topInset={0} />);
    await waitFor(() => expect(screen.getByText('New releases')).toBeTruthy());
    const { RefreshControl } = require('react-native');
    await act(async () => UNSAFE_getByType(RefreshControl).props.onRefresh());
    expect(screen.getByText('New releases')).toBeTruthy();
  });
});
