import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { DiscoverAlbum, DiscoverArtist, DiscoverItem } from '../../services/discoverService';

jest.mock('expo-image', () => ({ Image: () => null }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ colors: { textPrimary: '#fff', textSecondary: '#888', label: '#888', primary: '#1D9BF0', green: '#0f0' } }),
}));
const mockSearch = jest.fn();
jest.mock('../../services/discoverService', () => ({
  searchDiscover: (...args: unknown[]) => mockSearch(...args),
  queueDiscoverDownload: jest.fn(),
}));
const mockToggle = jest.fn();
jest.mock('../../services/discoverPreviewService', () => ({
  toggleDiscoverPreview: (...args: unknown[]) => mockToggle(...args),
}));

import { DiscoverSearchResults } from '../DiscoverSearchResults';

const track = (id: number, in_library = false): DiscoverItem => ({
  id, type: 'track', title: `Song ${id}`, artist: 'Jão', album: 'Memórias', album_id: 9,
  cover: null, cover_small: null, preview: null, duration: 200, explicit: false,
  link: `https://www.deezer.com/track/${id}`, album_link: null, in_library,
});
const album: DiscoverAlbum = {
  id: 9, type: 'album', title: 'Memórias', artist: 'Jão', artist_id: 5, cover: null, cover_small: null,
  record_type: 'album', release_date: '2026-07-27', track_count: 14, explicit: false, link: '', in_library: false,
};
const artist: DiscoverArtist = {
  id: 5, type: 'artist', title: 'Jão', cover: null, cover_small: null, fans: 10, album_count: 3, link: '', in_library: true,
};

function respond(byType: Record<string, unknown[] | null>) {
  mockSearch.mockImplementation(async (_q: string, type: string) =>
    byType[type] === null ? null : { query: 'jao', type, count: 0, items: byType[type] ?? [] },
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  mockSearch.mockReset();
  mockPush.mockReset();
  mockToggle.mockReset();
});
afterEach(() => jest.useRealTimers());

describe('DiscoverSearchResults', () => {
  it('waits for typing to pause, then lists only what the library lacks', async () => {
    respond({ track: [track(1), track(2, true)], album: [album], artist: [artist] });
    render(<DiscoverSearchResults query="jao" />);
    await act(async () => jest.advanceTimersByTime(499));
    expect(mockSearch).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(1));
    expect(mockSearch.mock.calls.map((c) => c[1])).toEqual(['track', 'album', 'artist']);
    expect(screen.getByText('Not in your library')).toBeTruthy();
    expect(screen.getByText('Song 1')).toBeTruthy();
    expect(screen.queryByText('Song 2')).toBeNull();
    expect(screen.getByText('Memórias')).toBeTruthy();
    expect(screen.queryByText('Artists')).toBeNull();

    fireEvent.press(screen.getByLabelText('Play preview'));
    expect(mockToggle).toHaveBeenCalledWith(1);
    fireEvent.press(screen.getByLabelText('Memórias'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: { kind: 'album', id: '9', title: 'Memórias' } }));
  });

  it('shows a spinner while searching and nothing when Deezer has nothing new', async () => {
    const pending: Array<(v: null) => void> = [];
    mockSearch.mockImplementation(() => new Promise((r) => { pending.push(r); }));
    const finish = () => pending.forEach((r) => r(null));
    render(<DiscoverSearchResults query="zzz" />);
    await act(async () => jest.advanceTimersByTime(500));
    expect(screen.getByTestId('deezer-loading')).toBeTruthy();
    await act(async () => finish());
    expect(screen.queryByTestId('deezer-loading')).toBeNull();
    expect(screen.queryByText('Not in your library')).toBeNull();
  });

  it('does not search for an empty query', async () => {
    render(<DiscoverSearchResults query="" />);
    await act(async () => jest.advanceTimersByTime(1000));
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('lists artists missing from the library', async () => {
    respond({ track: [], album: [], artist: [{ ...artist, in_library: false }] });
    render(<DiscoverSearchResults query="jao" />);
    await act(async () => jest.advanceTimersByTime(500));
    expect(screen.getByText('Artists')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Jão'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: { kind: 'artist', id: '5', title: 'Jão' } }));
  });
});
