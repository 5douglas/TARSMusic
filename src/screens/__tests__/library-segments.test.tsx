jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => true }));

jest.mock('../album-library-list', () => ({ AlbumLibraryListScreen: () => null }));
jest.mock('../playlist-list', () => ({ PlaylistListScreen: () => null }));
jest.mock('../song-library-list', () => ({ SongLibraryListScreen: () => null }));
jest.mock('../artist-list', () => ({ ArtistListScreen: () => null }));
jest.mock('../favorites', () => {
  const { Text } = require('react-native');
  return { FavoritesScreen: ({ topInset }: { topInset: number }) => <Text>{`liked ${topInset}`}</Text> };
});
jest.mock('../../components/DiscoverDownloads', () => {
  const { Text } = require('react-native');
  return { DiscoverDownloads: ({ active }: { active: boolean }) => <Text>{`downloads ${active}`}</Text> };
});
jest.mock('../../components/DiscoverConnectHint', () => {
  const { Text } = require('react-native');
  return { DiscoverConnectHint: () => <Text>connect hint</Text> };
});

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { discoverSettingsStore } from '../../store/discoverSettingsStore';
import { filterBarStore } from '../../store/filterBarStore';
import { searchStore } from '../../store/searchStore';
import { LibraryScreen } from '../library';

beforeEach(() => {
  searchStore.setState({ headerHeight: 100 });
  filterBarStore.setState({ downloadedOnly: false, favoritesOnly: false, layoutToggle: null });
  discoverSettingsStore.setState({ baseUrl: 'https://d.example.com', token: 'tok' });
});

describe('LibraryScreen extra segments', () => {
  it('embeds Liked below the pills', async () => {
    render(<LibraryScreen />);
    fireEvent.press(screen.getByText('Liked'));
    await waitFor(() => expect(screen.getByText('liked 152')).toBeTruthy());
  });

  it('shows the deemix queue and hides the layout toggle', async () => {
    filterBarStore.setState({ layoutToggle: { layout: 'list', onToggle: jest.fn() } });
    render(<LibraryScreen />);
    fireEvent.press(screen.getByText('Downloads'));
    await waitFor(() => expect(screen.getByText('downloads true')).toBeTruthy());
    expect(filterBarStore.getState()).toMatchObject({ layoutToggle: null, hideDownloaded: true, hideFavorites: true });
  });

  it('asks to connect Discover when it is not configured', async () => {
    discoverSettingsStore.setState({ baseUrl: null, token: null });
    render(<LibraryScreen />);
    fireEvent.press(screen.getByText('Downloads'));
    await waitFor(() => expect(screen.getByText('connect hint')).toBeTruthy());
  });
});
