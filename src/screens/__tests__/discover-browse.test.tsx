import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { DiscoverAlbum, DiscoverBrowse, DiscoverItem } from '../../services/discoverService';

jest.mock('@shopify/flash-list', () => {
  const { View } = require('react-native');
  return {
    FlashList: ({
      data,
      renderItem,
      ListHeaderComponent,
      ListEmptyComponent,
      refreshControl,
    }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      ListHeaderComponent?: React.ReactNode;
      ListEmptyComponent?: React.ReactNode;
      refreshControl?: React.ReactElement<{ onRefresh: () => void }>;
    }) => {
      const { Pressable, Text } = require('react-native');
      return (
        <View>
          <Pressable testID="refresh" onPress={() => refreshControl?.props.onRefresh()}>
            <Text>refresh</Text>
          </Pressable>
          {ListHeaderComponent}
          {data.length === 0
            ? ListEmptyComponent
            : data.map((item, index) => <View key={index}>{renderItem({ item, index })}</View>)}
        </View>
      );
    },
  };
});
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
let mockParams: { kind: string; id: string } = { kind: 'artist', id: '5' };
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));
let mockFocused = true;
jest.mock('expo-router/react-navigation', () => {
  const ReactModule = require('react');
  return { HeaderHeightContext: ReactModule.createContext(0), useIsFocused: () => mockFocused };
});
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: { textPrimary: '#fff', textSecondary: '#888', primary: '#1D9BF0', inputBg: '#222', green: '#0f0' },
  }),
}));
jest.mock('../../components/GradientBackground', () => {
  const { View } = require('react-native');
  return {
    GradientBackground: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

const mockBrowse = jest.fn();
const mockQueueDownload = jest.fn();
jest.mock('../../services/discoverService', () => ({
  fetchDiscoverBrowse: (...args: unknown[]) => mockBrowse(...args),
  queueDiscoverDownload: (...args: unknown[]) => mockQueueDownload(...args),
}));
const mockStopPreview = jest.fn();
jest.mock('../../services/discoverPreviewService', () => ({
  toggleDiscoverPreview: jest.fn(),
  stopDiscoverPreview: () => mockStopPreview(),
}));

import { DiscoverBrowseScreen } from '../discover-browse';
import { themedAlertStore } from '../../store/themedAlertStore';

const track: DiscoverItem = {
  id: 1, type: 'track', title: 'Aurora', artist: 'Jão', album: 'Memórias', album_id: 9,
  cover: null, cover_small: null, preview: null, duration: 200, explicit: false,
  link: 'https://www.deezer.com/track/1', album_link: 'https://www.deezer.com/album/9', in_library: false,
};
const album: DiscoverAlbum = {
  id: 9, type: 'album', title: 'Memórias', artist: 'Jão', artist_id: 5, cover: null, cover_small: null,
  record_type: 'album', release_date: '2026-07-27', track_count: 14, explicit: false,
  link: 'https://www.deezer.com/album/9', in_library: true,
};
const base = { id: 'x', updated: '', cover: null, link: '' };

const artistPage: DiscoverBrowse = {
  ...base, type: 'artist', title: 'Jão', description: '727412 fans', count: 1, items: [track],
  albums: [album],
  artist: { id: 5, type: 'artist', title: 'Jão', cover: null, cover_small: null, fans: 1, album_count: 1, link: '', in_library: true },
};
const albumPage: DiscoverBrowse = {
  ...base, type: 'album', title: 'Memórias', description: 'Jão', count: 1, items: [track], album,
};

beforeEach(() => {
  mockBrowse.mockReset();
  mockPush.mockReset();
  mockStopPreview.mockReset();
  mockFocused = true;
  themedAlertStore.setState({ visible: false, buttons: [] });
});

describe('DiscoverBrowseScreen', () => {
  it('shows an artist with top tracks and the discography', async () => {
    mockParams = { kind: 'artist', id: '5' };
    mockBrowse.mockResolvedValue(artistPage);
    render(<DiscoverBrowseScreen />);
    await waitFor(() => expect(screen.getByText('Top tracks')).toBeTruthy());
    expect(mockBrowse).toHaveBeenCalledWith('artist', 5, false);
    expect(screen.getByText('727412 fans')).toBeTruthy();
    expect(screen.getByText('Aurora')).toBeTruthy();
    expect(screen.getByText('Albums')).toBeTruthy();
    expect(screen.getAllByText('In library')).toHaveLength(2);
    expect(screen.queryByText('Download album')).toBeNull();

    fireEvent.press(screen.getByLabelText('Memórias'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/discover-browse',
      params: { kind: 'album', id: '9', title: 'Memórias' },
    });
  });

  it('shows an album with a whole-album download button', async () => {
    mockParams = { kind: 'album', id: '9' };
    mockBrowse.mockResolvedValue(albumPage);
    render(<DiscoverBrowseScreen />);
    await waitFor(() => expect(screen.getByText('Download album')).toBeTruthy());
    expect(mockBrowse).toHaveBeenCalledWith('album', 9, false);
    expect(screen.queryByText('Top tracks')).toBeNull();
    fireEvent.press(screen.getByText('Download album'));
    expect(themedAlertStore.getState()).toMatchObject({
      title: 'Download the whole album?',
      message: 'Memórias · Jão',
    });
  });

  it('shows the error state, and keeps loaded data when a refresh fails', async () => {
    mockParams = { kind: 'album', id: '9' };
    mockBrowse.mockResolvedValueOnce(null);
    const { unmount } = render(<DiscoverBrowseScreen />);
    await waitFor(() => expect(screen.getByText('Could not load this playlist')).toBeTruthy());
    unmount();

    mockBrowse.mockResolvedValueOnce(albumPage).mockResolvedValueOnce(null);
    render(<DiscoverBrowseScreen />);
    await waitFor(() => expect(screen.getByText('Aurora')).toBeTruthy());
    await act(async () => fireEvent.press(screen.getByTestId('refresh')));
    expect(mockBrowse).toHaveBeenLastCalledWith('album', 9, true);
    expect(screen.getByText('Aurora')).toBeTruthy();
  });

  it('shows the empty state for a page with no tracks', async () => {
    mockParams = { kind: 'album', id: '9' };
    mockBrowse.mockResolvedValue({ ...albumPage, items: [], album: undefined, description: '' });
    render(<DiscoverBrowseScreen />);
    await waitFor(() => expect(screen.getByText('Nothing here yet')).toBeTruthy());
  });

  it('stops the preview when the screen loses focus', async () => {
    mockFocused = false;
    mockBrowse.mockResolvedValue(albumPage);
    render(<DiscoverBrowseScreen />);
    await waitFor(() => expect(screen.getByText('Aurora')).toBeTruthy());
    expect(mockStopPreview).toHaveBeenCalled();
  });
});
