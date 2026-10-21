import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('expo-image', () => ({ Image: () => null }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ colors: { textPrimary: '#fff', textSecondary: '#888', label: '#888', primary: '#1D9BF0', green: '#0f0' } }),
}));
const mockMissing = jest.fn();
jest.mock('../../services/discoverService', () => ({
  fetchArtistMissing: (...args: unknown[]) => mockMissing(...args),
  queueDiscoverDownload: jest.fn(),
}));
jest.mock('../../services/discoverPreviewService', () => ({ toggleDiscoverPreview: jest.fn() }));
jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

import { DiscoverMoreFromArtist } from '../DiscoverMoreFromArtist';
import { discoverSettingsStore } from '../../store/discoverSettingsStore';
import { offlineModeStore } from '../../store/offlineModeStore';

const album = {
  id: 9, type: 'album', title: 'Sim', artist: 'Jão', artist_id: 5, cover: null, cover_small: null,
  record_type: 'single', release_date: '2022-03-30', track_count: 1, explicit: false, link: '', in_library: false,
};

beforeEach(() => {
  mockMissing.mockReset();
  mockPush.mockReset();
  discoverSettingsStore.setState({ baseUrl: 'https://d.example.com', token: 'tok' });
  offlineModeStore.setState({ offlineMode: false });
});

describe('DiscoverMoreFromArtist', () => {
  it('lists the missing releases and opens one', async () => {
    mockMissing.mockResolvedValue({ artist: {}, count: 1, items: [album] });
    render(<DiscoverMoreFromArtist name="Jão" />);
    await waitFor(() => expect(screen.getByText('More from Jão on Deezer')).toBeTruthy());
    expect(mockMissing).toHaveBeenCalledWith('Jão');
    fireEvent.press(screen.getByLabelText('Sim'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: { kind: 'album', id: '9', title: 'Sim' } }));
  });

  it('renders nothing when nothing is missing or the lookup fails', async () => {
    mockMissing.mockResolvedValueOnce({ artist: {}, count: 0, items: [] });
    const r1 = render(<DiscoverMoreFromArtist name="Jão" />);
    await waitFor(() => expect(mockMissing).toHaveBeenCalled());
    expect(r1.toJSON()).toBeNull();
    r1.unmount();
    mockMissing.mockResolvedValueOnce(null);
    const r2 = render(<DiscoverMoreFromArtist name="Jão" />);
    await waitFor(() => expect(mockMissing).toHaveBeenCalledTimes(2));
    expect(r2.toJSON()).toBeNull();
  });

  it('does not ask Deezer offline or without a discover server', () => {
    offlineModeStore.setState({ offlineMode: true });
    render(<DiscoverMoreFromArtist name="Jão" />).unmount();
    offlineModeStore.setState({ offlineMode: false });
    discoverSettingsStore.setState({ token: null });
    render(<DiscoverMoreFromArtist name="Jão" />);
    expect(mockMissing).not.toHaveBeenCalled();
  });
});
