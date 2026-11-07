import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('expo-router/react-navigation', () => {
  const ReactModule = require('react');
  return { HeaderHeightContext: ReactModule.createContext(0) };
});
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: { textPrimary: '#fff', textSecondary: '#888', primary: '#1D9BF0', card: '#111', border: '#333' },
  }),
}));
jest.mock('../../components/GradientBackground', () => {
  const { View } = require('react-native');
  return { GradientBackground: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('../../components/BottomChrome', () => ({ BottomChrome: () => null }));
jest.mock('../../components/settings/PlaybackModeCard', () => ({ PlaybackModeCard: () => null }));
jest.mock('../../components/settings/ReplayGainCard', () => ({ ReplayGainCard: () => null }));
jest.mock('../../components/settings/AutoplayCard', () => ({ AutoplayCard: () => null }));
jest.mock('../../components/settings/SmartDownloadCard', () => ({ SmartDownloadCard: () => null }));
jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

import { SettingsTarsmusicScreen } from '../settings-tarsmusic';
import { newMusicAlertsStore } from '../../store/newMusicAlertsStore';
import { playbackSettingsStore } from '../../store/playbackSettingsStore';

describe('SettingsTarsmusicScreen', () => {
  it('turns the lyrics line under the cover off and on', () => {
    playbackSettingsStore.setState({ coverLyricLine: true } as any);
    render(<SettingsTarsmusicScreen />);
    fireEvent(screen.getByLabelText('Lyrics line under the cover'), 'valueChange', false);
    expect(playbackSettingsStore.getState().coverLyricLine).toBe(false);
    fireEvent(screen.getByLabelText('Lyrics line under the cover'), 'valueChange', true);
    expect(playbackSettingsStore.getState().coverLyricLine).toBe(true);
  });

  it('holds the new-music notification switches', () => {
    newMusicAlertsStore.setState({ releasesEnabled: true } as any);
    render(<SettingsTarsmusicScreen />);
    fireEvent(screen.getByLabelText('New releases'), 'valueChange', false);
    expect(newMusicAlertsStore.getState().releasesEnabled).toBe(false);
  });
});
