import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { DiscoverItem, DiscoverPlaylist } from '../../services/discoverService';

jest.mock('@shopify/flash-list', () => {
  const { View } = require('react-native');
  return {
    FlashList: ({
      data,
      renderItem,
      ListHeaderComponent,
      ListEmptyComponent,
    }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      ListHeaderComponent?: React.ReactNode;
      ListEmptyComponent?: React.ReactNode;
    }) => (
      <View>
        {ListHeaderComponent}
        {data.length === 0
          ? ListEmptyComponent
          : data.map((item, index) => <View key={index}>{renderItem({ item, index })}</View>)}
      </View>
    ),
  };
});

let mockFocused = true;
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => mockFocused }));
jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      background: '#000',
      textPrimary: '#fff',
      textSecondary: '#888',
      primary: '#1D9BF0',
      inputBg: '#222',
      green: '#0f0',
    },
  }),
}));

const mockFetchPlaylist = jest.fn();
const mockQueueDownload = jest.fn();
jest.mock('../../services/discoverService', () => ({
  fetchDiscoverPlaylist: (...args: unknown[]) => mockFetchPlaylist(...args),
  queueDiscoverDownload: (...args: unknown[]) => mockQueueDownload(...args),
}));

const mockTogglePreview = jest.fn();
const mockStopPreview = jest.fn();
jest.mock('../../services/discoverPreviewService', () => ({
  toggleDiscoverPreview: (...args: unknown[]) => mockTogglePreview(...args),
  stopDiscoverPreview: () => mockStopPreview(),
}));

jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

import { DiscoverScreen } from '../discover';
import { discoverPreviewStore } from '../../store/discoverPreviewStore';
import { discoverSettingsStore } from '../../store/discoverSettingsStore';
import { playbackToastStore } from '../../store/playbackToastStore';
import { themedAlertStore } from '../../store/themedAlertStore';

const item = (over: Partial<DiscoverItem> = {}): DiscoverItem => ({
  id: 1,
  type: 'track',
  title: 'Elevador',
  artist: 'Ana',
  album: 'Elevador EP',
  album_id: 10,
  cover: null,
  cover_small: null,
  preview: null,
  duration: 187,
  explicit: false,
  link: 'https://www.deezer.com/track/1',
  album_link: 'https://www.deezer.com/album/10',
  in_library: false,
  ...over,
});

const playlist = (items: DiscoverItem[], description = 'Fresh picks'): DiscoverPlaylist => ({
  id: 'x',
  title: 'X',
  description,
  updated: '',
  count: items.length,
  items,
});

function pressButton(label: string) {
  const btn = themedAlertStore.getState().buttons.find((b) => b.text === label);
  act(() => btn?.onPress?.());
}

beforeEach(() => {
  mockFocused = true;
  mockFetchPlaylist.mockReset();
  mockQueueDownload.mockReset();
  mockTogglePreview.mockReset();
  mockStopPreview.mockReset();
  discoverSettingsStore.setState({ baseUrl: 'https://d.example.com', token: 'tok' });
  discoverPreviewStore.setState({ playingId: null });
  themedAlertStore.setState({ visible: false, buttons: [] });
  playbackToastStore.setState({ status: 'idle', successLabel: null });
});

describe('DiscoverScreen connection form', () => {
  it('saves the connection when both fields are filled', async () => {
    discoverSettingsStore.setState({ baseUrl: null, token: null });
    mockFetchPlaylist.mockResolvedValue(playlist([]));
    render(<DiscoverScreen />);
    expect(screen.getByText('Connect to Discover')).toBeTruthy();

    fireEvent.press(screen.getByText('Save'));
    expect(discoverSettingsStore.getState().baseUrl).toBeNull();

    fireEvent.changeText(screen.getByLabelText('Discover server URL'), 'https://new.example.com/');
    fireEvent.changeText(screen.getByLabelText('Token'), 'abc');
    fireEvent.press(screen.getByText('Save'));
    expect(discoverSettingsStore.getState()).toMatchObject({
      baseUrl: 'https://new.example.com',
      token: 'abc',
    });
    await waitFor(() => expect(screen.getByText('Nothing here yet')).toBeTruthy());
  });
});

describe('DiscoverScreen playlists', () => {
  it('loads new releases first and renders rows with badges and details', async () => {
    mockFetchPlaylist.mockResolvedValue(
      playlist([
        item({ in_library: true, release_date: '2026-10-16', record_type: 'single' }),
        item({ id: 2, title: 'Second', reason: 'Because you listen to Jão', position: 2 }),
      ]),
    );
    render(<DiscoverScreen />);
    expect(screen.getByText('Building playlist…')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Elevador')).toBeTruthy());
    expect(mockFetchPlaylist).toHaveBeenCalledWith('new-releases', false);
    expect(screen.getByText('Fresh picks')).toBeTruthy();
    expect(screen.getByText('In library')).toBeTruthy();
    expect(screen.getByText('single 2026-10-16')).toBeTruthy();
    expect(screen.getByText('Because you listen to Jão')).toBeTruthy();
    expect(screen.getAllByText('Ana · Elevador EP · 3:07')).toHaveLength(2);
  });

  it('fetches each segment once and keeps loaded ones', async () => {
    mockFetchPlaylist.mockResolvedValue(playlist([item()]));
    render(<DiscoverScreen />);
    await waitFor(() => expect(screen.getByText('Elevador')).toBeTruthy());
    fireEvent.press(screen.getByText('Top Brazil'));
    await waitFor(() => expect(mockFetchPlaylist).toHaveBeenCalledWith('charts-br', false));
    await waitFor(() => expect(screen.getByText('Elevador')).toBeTruthy());
    fireEvent.press(screen.getByText('New releases'));
    expect(screen.getByText('Elevador')).toBeTruthy();
    expect(mockFetchPlaylist).toHaveBeenCalledTimes(2);
  });

  it('shows the empty state for an empty playlist', async () => {
    mockFetchPlaylist.mockResolvedValue(playlist([], ''));
    render(<DiscoverScreen />);
    await waitFor(() => expect(screen.getByText('Nothing here yet')).toBeTruthy());
  });

  it('shows the error state, retries with refresh, and can edit the connection', async () => {
    mockFetchPlaylist.mockResolvedValueOnce(null);
    render(<DiscoverScreen />);
    await waitFor(() => expect(screen.getByText('Could not load this playlist')).toBeTruthy());
    expect(screen.getByText('Check the connection, address and token.')).toBeTruthy();

    mockFetchPlaylist.mockResolvedValueOnce(playlist([item()]));
    fireEvent.press(screen.getByText('Retry'));
    await waitFor(() => expect(screen.getByText('Elevador')).toBeTruthy());
    expect(mockFetchPlaylist).toHaveBeenLastCalledWith('new-releases', true);
  });

  it('clears the connection from the error state', async () => {
    mockFetchPlaylist.mockResolvedValue(null);
    render(<DiscoverScreen />);
    await waitFor(() => expect(screen.getByText('Edit connection')).toBeTruthy());
    fireEvent.press(screen.getByText('Edit connection'));
    expect(screen.getByText('Connect to Discover')).toBeTruthy();
  });

  it('refetches after the connection changes', async () => {
    mockFetchPlaylist.mockResolvedValue(playlist([item()]));
    render(<DiscoverScreen />);
    await waitFor(() => expect(screen.getByText('Elevador')).toBeTruthy());
    act(() => discoverSettingsStore.getState().setConnection('https://other.example.com', 'tok2'));
    await waitFor(() => expect(mockFetchPlaylist).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('Elevador')).toBeTruthy());
  });
});

describe('DiscoverScreen actions', () => {
  beforeEach(() => {
    mockFetchPlaylist.mockResolvedValue(playlist([item()]));
  });

  it('toggles the preview and shows the stop icon label while playing', async () => {
    render(<DiscoverScreen />);
    await waitFor(() => expect(screen.getByLabelText('Play preview')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Play preview'));
    expect(mockTogglePreview).toHaveBeenCalledWith(1);
    act(() => discoverPreviewStore.setState({ playingId: 1 }));
    expect(screen.getByLabelText('Stop preview')).toBeTruthy();
  });

  it('stops the preview when the tab loses focus', async () => {
    mockFocused = false;
    render(<DiscoverScreen />);
    await waitFor(() => expect(screen.getByText('Elevador')).toBeTruthy());
    expect(mockStopPreview).toHaveBeenCalled();
  });

  it('confirms and queues a track download, then flashes a toast', async () => {
    mockQueueDownload.mockResolvedValue(true);
    render(<DiscoverScreen />);
    await waitFor(() => expect(screen.getByLabelText('Download')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Download'));
    expect(themedAlertStore.getState()).toMatchObject({
      visible: true,
      title: 'Download this track?',
      message: 'Elevador · Ana',
    });
    pressButton('Download');
    await waitFor(() => expect(playbackToastStore.getState().successLabel).toBe('Sent to download queue'));
    expect(mockQueueDownload).toHaveBeenCalledWith('https://www.deezer.com/track/1');
  });

  it('long press queues the whole album and reports failures', async () => {
    mockQueueDownload.mockResolvedValue(false);
    render(<DiscoverScreen />);
    await waitFor(() => expect(screen.getByLabelText('Download')).toBeTruthy());
    fireEvent(screen.getByLabelText('Download'), 'longPress');
    expect(themedAlertStore.getState()).toMatchObject({
      title: 'Download the whole album?',
      message: 'Elevador EP · Ana',
    });
    pressButton('Download');
    await waitFor(() => expect(themedAlertStore.getState().title).toBe('Could not queue the download'));
    expect(mockQueueDownload).toHaveBeenCalledWith('https://www.deezer.com/album/10');
  });
});
