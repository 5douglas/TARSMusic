import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
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

import { SearchableHeader } from '../SearchableHeader';

const header = (name: string) =>
  render(<SearchableHeader {...({ route: { name } } as unknown as React.ComponentProps<typeof SearchableHeader>)} />);

beforeEach(() => mockPush.mockReset());

describe('SearchableHeader', () => {
  it('opens Settings from the profile button', () => {
    header('index');
    fireEvent.press(screen.getByLabelText('Settings'));
    expect(mockPush).toHaveBeenCalledWith('/settings');
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
