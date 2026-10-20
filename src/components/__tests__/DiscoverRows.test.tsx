import { fireEvent, render, screen } from '@testing-library/react-native';

import type { DiscoverAlbum, DiscoverItem } from '../../services/discoverService';

jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ colors: { textPrimary: '#fff', textSecondary: '#888', primary: '#1D9BF0', green: '#0f0' } }),
}));

import { DiscoverEntityRow, DiscoverTrackRow } from '../DiscoverRows';

const track: DiscoverItem = {
  id: 1, type: 'track', title: 'Aurora', artist: 'Jão', album: 'Memórias', album_id: 9,
  cover: null, cover_small: null, preview: null, duration: 200, explicit: false,
  link: 'https://www.deezer.com/track/1', album_link: 'https://www.deezer.com/album/9', in_library: false,
};
const album: DiscoverAlbum = {
  id: 9, type: 'album', title: 'Memórias', artist: 'Jão', artist_id: 5, cover: null, cover_small: null,
  record_type: null, release_date: null, track_count: 1, explicit: false, link: '', in_library: false,
};

describe('DiscoverTrackRow', () => {
  it('shows position, the reason and long-press album download', () => {
    const onDownload = jest.fn();
    render(<DiscoverTrackRow item={{ ...track, position: 3, reason: 'Because' }} playing={false} onPreview={jest.fn()} onDownload={onDownload} />);
    expect(screen.getByText('3. Aurora')).toBeTruthy();
    expect(screen.getByText('Because')).toBeTruthy();
    fireEvent(screen.getByLabelText('Download'), 'longPress');
    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), true);
  });

  it('uses the record type and date as detail, and has no album action without an album link', () => {
    render(<DiscoverTrackRow item={{ ...track, album_link: null, release_date: '2026-10-16' }} playing onPreview={jest.fn()} onDownload={jest.fn()} />);
    expect(screen.getByText('2026-10-16')).toBeTruthy();
    expect(screen.getByLabelText('Stop preview')).toBeTruthy();
    expect(screen.getByLabelText('Download').props.accessibilityHint).toBeUndefined();
  });
});

describe('DiscoverEntityRow', () => {
  it('shows a chevron instead of download when no handler is given', () => {
    const onOpen = jest.fn();
    render(<DiscoverEntityRow item={album} onOpen={onOpen} />);
    expect(screen.getByText('Jão')).toBeTruthy();
    expect(screen.queryByLabelText('Download')).toBeNull();
    fireEvent.press(screen.getByLabelText('Memórias'));
    expect(onOpen).toHaveBeenCalledWith(album);
  });

  it('downloads albums when a handler is given', () => {
    const onDownload = jest.fn();
    render(<DiscoverEntityRow item={{ ...album, in_library: true }} onOpen={jest.fn()} onDownload={onDownload} />);
    expect(screen.getByText('In library')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Download'));
    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
  });

  it('shows the fan count for artists, zero when unknown', () => {
    render(<DiscoverEntityRow item={{ id: 5, type: 'artist', title: 'Jão', cover: null, cover_small: null, fans: null, album_count: null, link: '', in_library: false }} onOpen={jest.fn()} />);
    expect(screen.getByText('0 fans')).toBeTruthy();
  });
});
