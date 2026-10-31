import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, navigate: mockNavigate }) }));
jest.mock('../CreatePlaylistSheet', () => {
  const { Text } = require('react-native');
  return { CreatePlaylistSheet: ({ visible }: { visible: boolean }) => (visible ? <Text>create sheet</Text> : null) };
});
jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: () => <View /> };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../FilterBar', () => ({ FilterBar: () => null }));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'dark',
    colors: { background: '#121212', textPrimary: '#fff', textSecondary: '#888', primary: '#1D9BF0', inputBg: '#222' },
  }),
}));
jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

import { offlineModeStore } from '../../store/offlineModeStore';
import { profileStore } from '../../store/profileStore';
import { SearchableHeader } from '../SearchableHeader';

const header = (name: string) =>
  render(<SearchableHeader {...({ route: { name } } as unknown as React.ComponentProps<typeof SearchableHeader>)} />);

beforeEach(() => {
  mockPush.mockReset();
  mockNavigate.mockReset();
  profileStore.setState({ menuVisible: false });
  offlineModeStore.setState({ offlineMode: false });
});

describe('SearchableHeader', () => {
  it('opens the profile menu from the avatar', () => {
    header('index');
    fireEvent.press(screen.getByLabelText('Profile menu'));
    expect(profileStore.getState().menuVisible).toBe(true);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('gives Your Library its search and new-playlist actions', () => {
    header('library');
    fireEvent.press(screen.getByLabelText('Search'));
    expect(mockNavigate).toHaveBeenCalledWith('/search');
    expect(screen.queryByText('create sheet')).toBeNull();
    fireEvent.press(screen.getByLabelText('New Playlist'));
    expect(screen.getByText('create sheet')).toBeTruthy();
  });

  it('hides the new-playlist action offline', () => {
    offlineModeStore.setState({ offlineMode: true });
    header('library');
    expect(screen.queryByLabelText('New Playlist')).toBeNull();
  });

  it('keeps Home free of the Library actions', () => {
    header('index');
    expect(screen.queryByLabelText('New Playlist')).toBeNull();
  });

  it('shows no title and no search box on Home', () => {
    header('index');
    expect(screen.queryByText('Your Library')).toBeNull();
    expect(screen.queryByPlaceholderText(/search/i)).toBeNull();
  });

  it('titles Library and keeps the search box to the Search tab', () => {
    header('library');
    expect(screen.getByText('Your Library')).toBeTruthy();
    expect(screen.queryByPlaceholderText(/search/i)).toBeNull();
    screen.unmount();
    header('search');
    expect(screen.getByText('Search')).toBeTruthy();
    expect(screen.getByPlaceholderText(/search/i)).toBeTruthy();
  });
});
