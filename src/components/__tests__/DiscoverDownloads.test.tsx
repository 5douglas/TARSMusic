import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { DiscoverQueue, DiscoverQueueItem } from '../../services/discoverService';

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
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: { textPrimary: '#fff', textSecondary: '#888', primary: '#1D9BF0', inputBg: '#222', green: '#0f0', red: '#f00' },
  }),
}));
const mockQueue = jest.fn();
const mockAction = jest.fn();
jest.mock('../../services/discoverService', () => ({
  fetchDownloadQueue: (...args: unknown[]) => mockQueue(...args),
  runQueueAction: (...args: unknown[]) => mockAction(...args),
}));

import { DiscoverDownloads } from '../DiscoverDownloads';
import { themedAlertStore } from '../../store/themedAlertStore';

const qi = (uuid: string, status: DiscoverQueueItem['status'], over: Partial<DiscoverQueueItem> = {}): DiscoverQueueItem => ({
  uuid, title: uuid, artist: 'Artist', type: 'track', status, cover: null,
  progress: 0, downloaded: 0, failed: 0, size: 1, ...over,
});

const queue: DiscoverQueue = {
  counts: { active: 1, queued: 1, failed: 1, completed: 40 },
  active: [qi('album_1_3', 'downloading', { type: 'album', progress: 42, downloaded: 3, size: 10 })],
  queued: [qi('track_2_3', 'inQueue')],
  failed: [qi('track_3_3', 'failed')],
  completed: [qi('track_4_3', 'completed')],
};
const empty: DiscoverQueue = {
  counts: { active: 0, queued: 0, failed: 0, completed: 0 }, active: [], queued: [], failed: [], completed: [],
};

beforeEach(() => {
  jest.useFakeTimers();
  mockQueue.mockReset();
  mockAction.mockReset();
  themedAlertStore.setState({ visible: false, buttons: [] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('DiscoverDownloads', () => {
  it('does nothing while inactive', () => {
    render(<DiscoverDownloads topInset={0} active={false} />);
    expect(mockQueue).not.toHaveBeenCalled();
  });

  it('groups the queue with counts and a progress bar, and polls', async () => {
    mockQueue.mockResolvedValue(queue);
    render(<DiscoverDownloads topInset={0} active />);
    await act(async () => {});
    expect(screen.getByText('Downloading (1)')).toBeTruthy();
    expect(screen.getByText('Queued (1)')).toBeTruthy();
    expect(screen.getByText('Failed (1)')).toBeTruthy();
    expect(screen.getByText('Completed (40)')).toBeTruthy();
    expect(screen.getByText('Artist · 3 of 10')).toBeTruthy();
    expect(screen.getByTestId('queue-progress').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: '42%' })]),
    );
    await act(async () => jest.advanceTimersByTime(3000));
    expect(mockQueue).toHaveBeenCalledTimes(2);
  });

  it('retries and removes single entries', async () => {
    mockQueue.mockResolvedValue(queue);
    mockAction.mockResolvedValue(true);
    render(<DiscoverDownloads topInset={0} active />);
    await act(async () => {});
    await act(async () => fireEvent.press(screen.getByLabelText('Retry')));
    expect(mockAction).toHaveBeenCalledWith('retry', 'track_3_3');
    await act(async () => fireEvent.press(screen.getAllByLabelText('Remove')[0]));
    expect(mockAction).toHaveBeenCalledWith('remove', 'track_2_3');
  });

  it('clears finished and cancels all after confirming, reporting failures', async () => {
    mockQueue.mockResolvedValue(queue);
    mockAction.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    render(<DiscoverDownloads topInset={0} active />);
    await act(async () => {});
    await act(async () => fireEvent.press(screen.getByText('Clear finished')));
    expect(mockAction).toHaveBeenCalledWith('clear-finished', undefined);

    fireEvent.press(screen.getByText('Cancel all'));
    const alert = themedAlertStore.getState();
    expect(alert.title).toBe('Cancel all downloads?');
    await act(async () => alert.buttons.find((b) => b.text === 'Cancel all')?.onPress?.());
    expect(mockAction).toHaveBeenLastCalledWith('cancel-all', undefined);
    expect(themedAlertStore.getState().title).toBe('The download server did not accept that');
  });

  it('shows the empty and error states', async () => {
    mockQueue.mockResolvedValueOnce(empty);
    const { unmount } = render(<DiscoverDownloads topInset={0} active />);
    await waitFor(() => expect(screen.getByText('No downloads yet')).toBeTruthy());
    unmount();
    mockQueue.mockResolvedValueOnce(null);
    render(<DiscoverDownloads topInset={0} active />);
    await waitFor(() => expect(screen.getByText('Could not load this playlist')).toBeTruthy());
  });
});
