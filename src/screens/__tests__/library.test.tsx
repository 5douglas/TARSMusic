jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => true }));
jest.mock('../../components/BottomSheet', () => {
  const { View } = require('react-native');
  return {
    BottomSheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? <View>{children}</View> : null,
  };
});
// A plain list renderer: enough to see the rows and the empty state.
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    FlashList: ({ data, renderItem, ListEmptyComponent }: {
      data: unknown[];
      renderItem: (a: { item: unknown; index: number }) => React.ReactNode;
      ListEmptyComponent?: React.ReactNode;
    }) =>
      React.createElement(
        View,
        null,
        data.length ? data.map((item, index) => React.createElement(React.Fragment, { key: index }, renderItem({ item, index }))) : ListEmptyComponent,
      ),
  };
});

// The kind screens have their own suites; here they only need to be told apart.
jest.mock('../album-library-list', () => {
  const { Text } = require('react-native');
  return { AlbumLibraryListScreen: () => <Text>album list</Text> };
});
jest.mock('../playlist-list', () => {
  const { Text } = require('react-native');
  return { PlaylistListScreen: () => <Text>playlist list</Text> };
});
jest.mock('../song-library-list', () => {
  const { Text } = require('react-native');
  return { SongLibraryListScreen: () => <Text>song list</Text> };
});
jest.mock('../artist-list', () => {
  const { Text } = require('react-native');
  return { ArtistListScreen: ({ contentInsetTop }: { contentInsetTop: number }) => <Text>{`artist list ${contentInsetTop}`}</Text> };
});

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { filterBarStore } from '../../store/filterBarStore';
import { offlineModeStore } from '../../store/offlineModeStore';
import { searchStore } from '../../store/searchStore';
import { LibraryScreen } from '../library';

beforeEach(() => {
  searchStore.setState({ headerHeight: 100 });
  offlineModeStore.setState({ offlineMode: false });
  filterBarStore.setState({ layoutToggle: { layout: 'list', onToggle: jest.fn() } });
});

describe('LibraryScreen, Spotify style', () => {
  it('shows the filter chips and the pinned Liked Songs over the mixed list', async () => {
    render(<LibraryScreen />);
    for (const chip of ['Playlists', 'Artists', 'Albums', 'Songs', 'Downloaded']) {
      expect(screen.getByText(chip)).toBeTruthy();
    }
    await waitFor(() => expect(screen.getByText('Liked Songs')).toBeTruthy());
    expect(screen.getByText('Recents')).toBeTruthy();
  });

  it('hides the header filter bar, which the chips replace', () => {
    render(<LibraryScreen />);
    expect(filterBarStore.getState()).toMatchObject({ layoutToggle: null, hideDownloaded: true, hideFavorites: true });
  });

  it('opens the full list for a chip below the chips, and clears back to the mix', async () => {
    render(<LibraryScreen />);
    fireEvent.press(screen.getByText('Artists'));
    // Header 100 + chip row 48, no sort row on the kind lists.
    await waitFor(() => expect(screen.getByText('artist list 148')).toBeTruthy());
    expect(screen.queryByText('Playlists')).toBeNull();
    fireEvent.press(screen.getByLabelText('Clear filter'));
    await waitFor(() => expect(screen.getByText('Liked Songs')).toBeTruthy());
  });

  it('shows only downloaded music when offline', async () => {
    offlineModeStore.setState({ offlineMode: true });
    render(<LibraryScreen />);
    expect(screen.queryByText('Artists')).toBeNull();
    expect(screen.getByText('Downloaded')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('No downloaded music')).toBeTruthy());
    expect(screen.queryByText('Liked Songs')).toBeNull();
  });
});
