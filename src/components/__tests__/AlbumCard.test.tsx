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

jest.mock('../../hooks/useIsStarred', () => ({ useIsStarred: () => false }));
jest.mock('../../hooks/useRating', () => ({ useRating: () => 0 }));
jest.mock('../../services/musicCacheService', () => ({
  getLocalTrackUri: jest.fn(() => null),
  getTrackQueueStatus: jest.fn(() => null),
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

jest.mock('../LongPressable', () => {
  const { View } = require('react-native');
  return { LongPressable: ({ children }: any) => <View>{children}</View> };
});

jest.mock('../StarRating', () => {
  const { View } = require('react-native');
  return { StarRatingDisplay: () => <View /> };
});

import { AlbumCard } from '../AlbumCard';
import { musicCacheStore } from '../../store/musicCacheStore';
import type { AlbumID3 } from '../../services/subsonicService';

const album: AlbumID3 = {
  id: 'a1',
  name: 'Test Album',
  songCount: 10,
  duration: 3600,
  created: '2024-01-01',
} as unknown as AlbumID3;

beforeEach(() => {
  musicCacheStore.setState({ cachedItems: {}, downloadQueue: [] } as any);
});

describe('AlbumCard', () => {
  it('renders no download badge when not cached', () => {
    const { queryByText } = render(<AlbumCard album={album} />);
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
    const { getByText } = render(<AlbumCard album={album} />);
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
    const { getByText } = render(<AlbumCard album={album} />);
    expect(getByText('DownloadedIcon:#FF9500')).toBeTruthy();
  });
});
