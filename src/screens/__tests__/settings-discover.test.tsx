import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-router/react-navigation', () => {
  const ReactModule = require('react');
  return { HeaderHeightContext: ReactModule.createContext(0) };
});
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ colors: { textPrimary: '#fff', textSecondary: '#888', primary: '#1D9BF0', inputBg: '#222', red: '#f00' } }),
}));
jest.mock('../../components/GradientBackground', () => {
  const { View } = require('react-native');
  return { GradientBackground: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('../../components/BottomChrome', () => ({ BottomChrome: () => null }));
jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

import { SettingsDiscoverScreen } from '../settings-discover';
import { discoverSettingsStore } from '../../store/discoverSettingsStore';
import { themedAlertStore } from '../../store/themedAlertStore';

beforeEach(() => {
  discoverSettingsStore.setState({ baseUrl: null, token: null });
  themedAlertStore.setState({ visible: false, buttons: [] });
});

describe('SettingsDiscoverScreen', () => {
  it('saves a new connection only when both fields are filled', () => {
    render(<SettingsDiscoverScreen />);
    fireEvent.press(screen.getByText('Save'));
    expect(discoverSettingsStore.getState().baseUrl).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Discover server URL'), 'https://d.example.com/');
    fireEvent.changeText(screen.getByLabelText('Token'), 'abc');
    fireEvent.press(screen.getByText('Save'));
    expect(discoverSettingsStore.getState()).toMatchObject({ baseUrl: 'https://d.example.com', token: 'abc' });
    expect(screen.getByText('Connected to Discover')).toBeTruthy();
    expect(screen.getByText('https://d.example.com')).toBeTruthy();
  });

  it('disconnects after confirming', () => {
    discoverSettingsStore.setState({ baseUrl: 'https://d.example.com', token: 'abc' });
    render(<SettingsDiscoverScreen />);
    fireEvent.press(screen.getByText('Edit connection'));
    const alert = themedAlertStore.getState();
    act(() => alert.buttons.find((b) => b.text === 'OK')?.onPress?.());
    expect(discoverSettingsStore.getState().baseUrl).toBeNull();
    expect(screen.getByText('Connect to Discover')).toBeTruthy();
  });
});
