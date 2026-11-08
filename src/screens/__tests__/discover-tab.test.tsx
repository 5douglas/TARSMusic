import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-image', () => ({ Image: () => null }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => true }));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: { textPrimary: '#fff', textSecondary: '#888', primary: '#1D9BF0', inputBg: '#222', green: '#0f0', label: '#aaa' },
  }),
}));
jest.mock('../../hooks/useDiscoverHome', () => ({ useDiscoverHome: () => ({ home: null }) }));
const mockSearch = jest.fn();
jest.mock('../../services/discoverService', () => ({
  searchDiscover: (...args: unknown[]) => mockSearch(...args),
  queueDiscoverDownload: jest.fn(),
}));
jest.mock('../../services/discoverPreviewService', () => ({
  toggleDiscoverPreview: jest.fn(),
  stopDiscoverPreview: jest.fn(),
}));
jest.mock('../../store/persistence/kvStorage', () => require('../../store/persistence/__mocks__/kvStorage'));

import { DiscoverTabScreen } from '../discover-tab';
import { discoverSettingsStore } from '../../store/discoverSettingsStore';

const artist = { id: 5, type: 'artist', title: 'Jão', cover: null, cover_small: null, fans: 1, album_count: 3, link: '', in_library: true };
const album = {
  id: 9, type: 'album', title: 'Memórias', artist: 'Jão', artist_id: 5, cover: null, cover_small: null,
  record_type: 'album', release_date: '2026-07-27', track_count: 14, explicit: false, link: 'https://www.deezer.com/album/9', in_library: false,
};

beforeEach(() => {
  jest.useFakeTimers();
  mockSearch.mockReset();
  mockPush.mockReset();
  discoverSettingsStore.setState({ baseUrl: 'https://discover.example', token: 't' } as never);
});
afterEach(() => jest.useRealTimers());

describe('DiscoverTabScreen', () => {
  it('asks to connect when no discover server is set', () => {
    discoverSettingsStore.setState({ baseUrl: '', token: '' } as never);
    render(<DiscoverTabScreen />);
    expect(screen.getByText('Open Discover settings')).toBeTruthy();
  });

  it('searches Deezer and opens an artist discography', async () => {
    mockSearch.mockImplementation(async (_q: string, type: string) => ({
      items: type === 'artist' ? [artist] : type === 'album' ? [album] : [],
    }));
    render(<DiscoverTabScreen />);
    fireEvent.changeText(screen.getByLabelText('Search Deezer'), 'jao');
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(mockSearch).toHaveBeenCalledWith('jao', 'artist');
    expect(screen.getByText('Memórias')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Jão'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/discover-browse',
      params: { kind: 'artist', id: '5', title: 'Jão' },
    });
  });

  it('narrows the search to one kind', async () => {
    mockSearch.mockResolvedValue({ items: [album] });
    render(<DiscoverTabScreen />);
    fireEvent.changeText(screen.getByLabelText('Search Deezer'), 'jao');
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    mockSearch.mockClear();
    fireEvent.press(screen.getAllByText('Albums')[0]);
    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(mockSearch).toHaveBeenCalledTimes(1);
    expect(mockSearch).toHaveBeenCalledWith('jao', 'album');
  });
});
