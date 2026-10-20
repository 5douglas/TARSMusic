import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { DiscoverItem } from '../../services/discoverService';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
const mockQueueDownload = jest.fn();
jest.mock('../../services/discoverService', () => ({
  queueDiscoverDownload: (...args: unknown[]) => mockQueueDownload(...args),
}));
const mockToggle = jest.fn();
jest.mock('../../services/discoverPreviewService', () => ({
  toggleDiscoverPreview: (...args: unknown[]) => mockToggle(...args),
}));

import { useDiscoverActions } from '../useDiscoverActions';
import { playbackToastStore } from '../../store/playbackToastStore';
import { themedAlertStore } from '../../store/themedAlertStore';

const track: DiscoverItem = {
  id: 1, type: 'track', title: 'Aurora', artist: 'Jão', album: 'Memórias', album_id: 9,
  cover: null, cover_small: null, preview: null, duration: 200, explicit: false,
  link: 'https://www.deezer.com/track/1', album_link: 'https://www.deezer.com/album/9', in_library: false,
};

function confirm() {
  const btn = themedAlertStore.getState().buttons.find((b) => b.text === 'Download');
  act(() => btn?.onPress?.());
}

beforeEach(() => {
  mockPush.mockReset();
  mockQueueDownload.mockReset();
  mockToggle.mockReset();
  themedAlertStore.setState({ visible: false, title: '', buttons: [] });
  playbackToastStore.setState({ status: 'idle', successLabel: null });
});

describe('useDiscoverActions', () => {
  it('toggles previews', () => {
    const { result } = renderHook(() => useDiscoverActions());
    result.current.handlePreview(track);
    expect(mockToggle).toHaveBeenCalledWith(1);
  });

  it('confirms a track download and flashes the toast', async () => {
    mockQueueDownload.mockResolvedValue(true);
    const { result } = renderHook(() => useDiscoverActions());
    act(() => result.current.handleTrackDownload(track, false));
    expect(themedAlertStore.getState()).toMatchObject({ title: 'Download this track?', message: 'Aurora · Jão' });
    confirm();
    await waitFor(() => expect(playbackToastStore.getState().successLabel).toBe('Sent to download queue'));
    expect(mockQueueDownload).toHaveBeenCalledWith('https://www.deezer.com/track/1');
  });

  it('downloads the whole album from a track, and falls back to the track without an album link', () => {
    const { result } = renderHook(() => useDiscoverActions());
    act(() => result.current.handleTrackDownload(track, true));
    expect(themedAlertStore.getState()).toMatchObject({ title: 'Download the whole album?', message: 'Memórias · Jão' });
    act(() => result.current.handleTrackDownload({ ...track, album_link: null }, true));
    expect(themedAlertStore.getState()).toMatchObject({ title: 'Download this track?' });
  });

  it('reports a rejected download', async () => {
    mockQueueDownload.mockResolvedValue(false);
    const { result } = renderHook(() => useDiscoverActions());
    act(() => result.current.handleAlbumDownload({
      id: 9, type: 'album', title: 'Memórias', artist: 'Jão', artist_id: 5, cover: null, cover_small: null,
      record_type: 'album', release_date: null, track_count: 1, explicit: false, link: 'https://www.deezer.com/album/9', in_library: false,
    }));
    confirm();
    await waitFor(() => expect(themedAlertStore.getState().title).toBe('Could not queue the download'));
    expect(mockQueueDownload).toHaveBeenCalledWith('https://www.deezer.com/album/9');
  });

  it('opens albums and artists by id and mixes/charts by path', () => {
    const { result } = renderHook(() => useDiscoverActions());
    result.current.handleOpen({ id: 5, type: 'artist', title: 'Jão', cover: null, cover_small: null, fans: 1, album_count: 1, link: '', in_library: true });
    result.current.handleOpen({ id: 'charts-br', type: 'chart', title: 'Top Brasil', cover: null, cover_small: null, path: '/playlists/charts?country=BR' });
    expect(mockPush.mock.calls).toEqual([
      [{ pathname: '/discover-browse', params: { kind: 'artist', id: '5', title: 'Jão' } }],
      [{ pathname: '/discover-browse', params: { kind: 'playlist', path: '/playlists/charts?country=BR', title: 'Top Brasil' } }],
    ]);
  });
});
