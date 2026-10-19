import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { DiscoverAlbum, DiscoverArtist, DiscoverItem } from '../../services/discoverService';

jest.mock('@shopify/flash-list', () => {
  const { View } = require('react-native');
  return {
    FlashList: ({
      data,
      renderItem,
      ListEmptyComponent,
    }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      ListEmptyComponent?: React.ReactNode;
    }) => (
      <View>
        {data.length === 0
          ? ListEmptyComponent
          : data.map((item, index) => <View key={index}>{renderItem({ item, index })}</View>)}
      </View>
    ),
  };
});
jest.mock('expo-image', () => ({ Image: () => null }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: { textPrimary: '#fff', textSecondary: '#888', primary: '#1D9BF0', inputBg: '#222', green: '#0f0' },
  }),
}));

const mockSearch = jest.fn();
const mockQueueDownload = jest.fn();
jest.mock('../../services/discoverService', () => ({
  searchDiscover: (...args: unknown[]) => mockSearch(...args),
  queueDiscoverDownload: (...args: unknown[]) => mockQueueDownload(...args),
}));
const mockTogglePreview = jest.fn();
jest.mock('../../services/discoverPreviewService', () => ({
  toggleDiscoverPreview: (...args: unknown[]) => mockTogglePreview(...args),
}));

import { DiscoverSearch } from '../DiscoverSearch';
import { themedAlertStore } from '../../store/themedAlertStore';

const track: DiscoverItem = {
  id: 1, type: 'track', title: 'Aurora', artist: 'Jão', album: 'Memórias', album_id: 9,
  cover: null, cover_small: null, preview: null, duration: 200, explicit: false,
  link: 'https://www.deezer.com/track/1', album_link: 'https://www.deezer.com/album/9', in_library: true,
};
const album: DiscoverAlbum = {
  id: 9, type: 'album', title: 'Memórias', artist: 'Jão', artist_id: 5, cover: null, cover_small: null,
  record_type: 'album', release_date: '2026-07-27', track_count: 14, explicit: false,
  link: 'https://www.deezer.com/album/9', in_library: false,
};
const artist: DiscoverArtist = {
  id: 5, type: 'artist', title: 'Jão', cover: null, cover_small: null, fans: 727412,
  album_count: 28, link: 'https://www.deezer.com/artist/5', in_library: true,
};

const result = (type: string, items: unknown[]) => ({ query: 'jao', type, count: items.length, items });

async function typeQuery(text: string) {
  fireEvent.changeText(screen.getByLabelText('Search Deezer for songs, albums, artists'), text);
  await act(async () => jest.advanceTimersByTime(400));
}

beforeEach(() => {
  jest.useFakeTimers();
  mockSearch.mockReset();
  mockPush.mockReset();
  mockTogglePreview.mockReset();
  mockQueueDownload.mockReset();
  themedAlertStore.setState({ visible: false, buttons: [] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('DiscoverSearch', () => {
  it('shows the hint until something is typed', () => {
    render(<DiscoverSearch topInset={0} playingId={null} />);
    expect(screen.getByText('Find new music to add to your library')).toBeTruthy();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('debounces the query and lists track results', async () => {
    mockSearch.mockResolvedValue(result('track', [track]));
    render(<DiscoverSearch topInset={0} playingId={null} />);
    fireEvent.changeText(screen.getByLabelText('Search Deezer for songs, albums, artists'), '  jao ');
    await act(async () => jest.advanceTimersByTime(399));
    expect(mockSearch).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(1));
    expect(mockSearch).toHaveBeenCalledWith('jao', 'track');
    expect(screen.getByText('Aurora')).toBeTruthy();
    expect(screen.getByText('In library')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Play preview'));
    expect(mockTogglePreview).toHaveBeenCalledWith(1);
  });

  it('searches albums, opens one and confirms its download', async () => {
    mockSearch.mockResolvedValue(result('album', [album]));
    render(<DiscoverSearch topInset={0} playingId={null} />);
    fireEvent.press(screen.getByText('Albums'));
    await typeQuery('jao');
    expect(mockSearch).toHaveBeenCalledWith('jao', 'album');
    expect(screen.getByText('Jão · album · 2026')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Memórias'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/discover-browse',
      params: { kind: 'album', id: '9', title: 'Memórias' },
    });

    fireEvent.press(screen.getByLabelText('Download'));
    expect(themedAlertStore.getState()).toMatchObject({
      title: 'Download the whole album?',
      message: 'Memórias · Jão',
    });
  });

  it('lists artists with fan counts and opens them', async () => {
    mockSearch.mockResolvedValue(result('artist', [artist]));
    render(<DiscoverSearch topInset={0} playingId={null} />);
    fireEvent.press(screen.getByText('Artists'));
    await typeQuery('jao');
    expect(screen.getByText('727412 fans')).toBeTruthy();
    expect(screen.queryByLabelText('Download')).toBeNull();
    fireEvent.press(screen.getByLabelText('Jão'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/discover-browse',
      params: { kind: 'artist', id: '5', title: 'Jão' },
    });
  });

  it('says when nothing matched and when the request failed', async () => {
    mockSearch.mockResolvedValueOnce(result('track', []));
    render(<DiscoverSearch topInset={0} playingId={null} />);
    await typeQuery('zzz');
    expect(screen.getByText('No results')).toBeTruthy();

    mockSearch.mockResolvedValueOnce(null);
    await typeQuery('zzzz');
    expect(screen.getByText('Could not load this playlist')).toBeTruthy();

    await typeQuery('');
    expect(screen.getByText('Find new music to add to your library')).toBeTruthy();
  });

  it('shows a spinner while a search is in flight', async () => {
    mockSearch.mockReturnValue(new Promise(() => {}));
    render(<DiscoverSearch topInset={0} playingId={null} />);
    await typeQuery('jao');
    expect(screen.queryByText('Find new music to add to your library')).toBeNull();
    expect(screen.queryByText('No results')).toBeNull();
  });
});
