import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { DiscoverHome } from '../../services/discoverService';

jest.mock('expo-image', () => ({ Image: () => null }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ colors: { textPrimary: '#fff', textSecondary: '#888', primary: '#1D9BF0', green: '#0f0' } }),
}));
jest.mock('../../services/discoverService', () => ({ queueDiscoverDownload: jest.fn() }));
jest.mock('../../services/discoverPreviewService', () => ({ toggleDiscoverPreview: jest.fn() }));

import { DiscoverHomeSections } from '../DiscoverHomeSections';

const home: DiscoverHome = {
  updated: '',
  scanning: false,
  sections: [
    {
      id: 'releases',
      title: 'Lancamentos',
      items: [{
        id: 9, type: 'album', title: 'Memórias', artist: 'Jão', artist_id: 5, cover: null, cover_small: null,
        record_type: 'album', release_date: '2026-07-27', track_count: 14, explicit: false, link: '', in_library: true,
      }],
    },
    {
      id: 'mixes',
      title: 'Mixes para voce',
      items: [{ id: 'mix-5', type: 'mix', title: 'Mix Jão', artist: 'Jão', cover: null, cover_small: null, path: '/playlists/mix/5' }],
    },
    {
      id: 'charts',
      title: 'Charts',
      items: [{ id: 'charts-br', type: 'chart', title: 'Top Brasil', count: 100, cover: null, cover_small: null, path: '/playlists/charts?country=BR' }],
    },
  ],
};

beforeEach(() => {
  mockPush.mockReset();
});

describe('DiscoverHomeSections', () => {
  it('renders the requested sections in order as cards and opens them', () => {
    render(<DiscoverHomeSections home={home} ids={['mixes', 'releases', 'charts']} />);
    const tree = JSON.stringify(screen.toJSON());
    expect(tree.indexOf('Mixes for you')).toBeLessThan(tree.indexOf('New releases'));
    expect(screen.getByText('Jão · album')).toBeTruthy();
    expect(screen.getByText('Like Jão')).toBeTruthy();
    expect(screen.getByText('100 songs')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Memórias'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/discover-browse',
      params: { kind: 'album', id: '9', title: 'Memórias' },
    });
    fireEvent.press(screen.getByLabelText('Mix Jão'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/discover-browse',
      params: { kind: 'playlist', path: '/playlists/mix/5', title: 'Mix Jão' },
    });
  });

  it('renders only the requested ids and skips empty or missing sections', () => {
    const sparse = { ...home, sections: [{ ...home.sections[1], items: [] }, home.sections[2]] };
    render(<DiscoverHomeSections home={sparse} ids={['mixes', 'charts', 'releases']} />);
    expect(screen.getByText('Charts')).toBeTruthy();
    expect(screen.queryByText('Mixes for you')).toBeNull();
    expect(screen.queryByText('New releases')).toBeNull();
  });
});
