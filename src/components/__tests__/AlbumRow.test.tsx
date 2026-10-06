jest.mock('../../store/persistence/kvStorage', () => require('../../store/persistence/__mocks__/kvStorage'));

import React from 'react';
import { render } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      background: '#000',
      card: '#111',
      textPrimary: '#fff',
      textSecondary: '#888',
      border: '#333',
      primary: '#1D9BF0',
      red: '#e91429',
      orange: '#FF9500',
      partialDownload: '#FF9500',
    },
  }),
}));

let mockStarred = false;
let mockRating = 0;
jest.mock('../../hooks/useIsStarred', () => ({ useIsStarred: () => mockStarred }));
jest.mock('../../hooks/useRating', () => ({ useRating: () => mockRating }));
jest.mock('../../services/musicCacheService', () => ({
  getLocalTrackUri: jest.fn(() => null),
  getTrackQueueStatus: jest.fn(() => null),
}));
jest.mock('../../services/moreOptionsService', () => ({
  addAlbumToQueue: jest.fn(),
  toggleStar: jest.fn(),
}));

jest.mock('../CachedImage', () => {
  const { View } = require('react-native');
  return { CachedImage: () => <View /> };
});

jest.mock('../DownloadedIcon', () => {
  const { Text } = require('react-native');
  return {
    DownloadedIcon: (props: { circleColor: string }) => (
      <Text>DownloadedIcon:{props.circleColor}</Text>
    ),
  };
});

jest.mock('../StarRating', () => {
  const { Text, View } = require('react-native');
  return {
    StarRatingDisplay: () => <View />,
    CompactRatingBadge: ({ rating }: { rating: number }) => <Text>★{rating}</Text>,
  };
});

jest.mock('../SwipeableRow', () => {
  const { View, Pressable, Text } = require('react-native');
  return {
    SwipeableRow: ({ children, leftActions, rightActions, onLongPress, onPress }: any) => (
      <View>
        {children}
        <Pressable onPress={onPress} onLongPress={onLongPress}>
          <Text>swipe-row-press</Text>
        </Pressable>
        {leftActions?.map((a: any, i: number) => (
          <Pressable key={`l-${i}`} onPress={a.onPress}>
            <Text>{`left-${a.label}`}</Text>
          </Pressable>
        ))}
        {rightActions?.map((a: any, i: number) => (
          <Pressable key={`r-${i}`} onPress={a.onPress}>
            <Text>{`right-${a.label}`}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});

jest.mock('../../store/offlineModeStore', () => ({
  offlineModeStore: Object.assign(
    (sel: any) => sel({ offlineMode: false }),
    { getState: () => ({ offlineMode: false }) },
  ),
}));
jest.mock('../../store/addToPlaylistStore', () => ({
  addToPlaylistStore: {
    getState: () => ({ showAlbum: jest.fn() }),
  },
}));
jest.mock('../../store/moreOptionsStore', () => ({
  moreOptionsStore: {
    getState: () => ({ show: jest.fn() }),
  },
}));

import { fireEvent } from '@testing-library/react-native';

import { AlbumRow } from '../AlbumRow';
import { musicCacheStore } from '../../store/musicCacheStore';
import type { AlbumID3 } from '../../services/subsonicService';
import { addAlbumToQueue, toggleStar } from '../../services/moreOptionsService';

const album: AlbumID3 = {
  id: 'a1',
  name: 'Test Album',
  songCount: 10,
  duration: 3600,
  created: '2024-01-01',
} as unknown as AlbumID3;

beforeEach(() => {
  mockStarred = false;
  mockRating = 0;
  musicCacheStore.setState({ cachedItems: {}, downloadQueue: [] } as any);
});

describe('AlbumRow', () => {
  it('renders no download badge when not cached', () => {
    const { queryByText } = render(<AlbumRow album={album} />);
    expect(queryByText(/DownloadedIcon/)).toBeNull();
  });

  it('renders primary DownloadedIcon when fully downloaded', () => {
    musicCacheStore.setState({
      cachedItems: {
        a1: {
          itemId: 'a1',
          type: 'album',
          name: 'Test Album',
          expectedSongCount: 10,
          songIds: Array.from({ length: 10 }, (_, i) => `s${i}`),
          lastSyncAt: 0,
          downloadedAt: 0,
        },
      },
    } as any);
    const { getByText } = render(<AlbumRow album={album} />);
    expect(getByText('DownloadedIcon:#1D9BF0')).toBeTruthy();
  });

  it('renders orange DownloadedIcon when partially downloaded', () => {
    musicCacheStore.setState({
      cachedItems: {
        a1: {
          itemId: 'a1',
          type: 'album',
          name: 'Test Album',
          expectedSongCount: 10,
          songIds: ['s1', 's2'],
          lastSyncAt: 0,
          downloadedAt: 0,
        },
      },
    } as any);
    const { getByText } = render(<AlbumRow album={album} />);
    expect(getByText('DownloadedIcon:#FF9500')).toBeTruthy();
  });

  it('row press navigates to album route', () => {
    const { getByText } = render(<AlbumRow album={album} />);
    fireEvent.press(getByText('swipe-row-press'));
    expect(mockPush).toHaveBeenCalledWith('/album/a1');
  });

  it('right swipe action adds album to queue', () => {
    const { getByText } = render(<AlbumRow album={album} />);
    fireEvent.press(getByText(/^right-/));
    expect(addAlbumToQueue).toHaveBeenCalledWith(album);
  });

  it('left swipe toggles star', () => {
    const { getAllByText } = render(<AlbumRow album={album} />);
    const starAction = getAllByText(/^left-/)[1];
    fireEvent.press(starAction);
    expect(toggleStar).toHaveBeenCalledWith('album', 'a1');
  });

  it('left swipe add-to-playlist calls store', () => {
    const addToPlaylistStore = require('../../store/addToPlaylistStore').addToPlaylistStore;
    const showAlbum = jest.fn();
    addToPlaylistStore.getState = () => ({ showAlbum });
    const { getAllByText } = render(<AlbumRow album={album} />);
    fireEvent.press(getAllByText(/^left-/)[0]);
    expect(showAlbum).toHaveBeenCalledWith(album);
  });

  it('long press opens more-options sheet', () => {
    const moreOptionsStore = require('../../store/moreOptionsStore').moreOptionsStore;
    const show = jest.fn();
    moreOptionsStore.getState = () => ({ show });
    const { getByText } = render(<AlbumRow album={album} />);
    fireEvent(getByText('swipe-row-press'), 'longPress');
    expect(show).toHaveBeenCalledWith({ type: 'album', item: album });
  });

  it('renders year when album.year is set', () => {
    const withYear = { ...album, year: 2024 } as AlbumID3;
    const { getByText } = render(<AlbumRow album={withYear} />);
    expect(getByText('(2024)')).toBeTruthy();
  });

  it('uses unknownArtist fallback when artist is missing', () => {
    const noArtist = { ...album, artist: undefined } as AlbumID3;
    const { getByText } = render(<AlbumRow album={noArtist} />);
    // Artist displays as the translated unknownArtist (here: i18n mock returns key).
    expect(getByText(/unknownArtist|Unknown Artist/)).toBeTruthy();
  });

  it('renders heart icon when starred and non-zero rating', () => {
    mockStarred = true;
    mockRating = 4;
    const { getByText } = render(<AlbumRow album={album} />);
    // Heart icon renders with "heart" name.
    expect(getByText('heart')).toBeTruthy();
  });

  it('offline mode disables left swipe actions', () => {
    const offlineModeStore = require('../../store/offlineModeStore').offlineModeStore;
    // Re-wire the store-as-selector mock to return offlineMode=true.
    offlineModeStore.getState = () => ({ offlineMode: true });
    const originalSelector = offlineModeStore;
    // The store mock is called as a function (sel => sel(state)), so replace it.
    require('../../store/offlineModeStore').offlineModeStore = Object.assign(
      (sel: any) => sel({ offlineMode: true }),
      { getState: () => ({ offlineMode: true }) },
    );
    const { queryAllByText } = render(<AlbumRow album={album} />);
    expect(queryAllByText(/^left-/)).toHaveLength(0);
    // Restore for subsequent tests.
    require('../../store/offlineModeStore').offlineModeStore = originalSelector;
  });
});
