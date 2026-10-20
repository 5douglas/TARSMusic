import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

let mockFocused = true;
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => mockFocused }));

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: { background: '#000', textPrimary: '#fff', textSecondary: '#888', primary: '#1D9BF0', inputBg: '#222' },
  }),
}));

// The three panels have their own suites; here they only report the props they get.
const mockPanel = jest.fn();
jest.mock('../../components/DiscoverHomeView', () => {
  const { Text } = require('react-native');
  return {
    DiscoverHomeView: (props: { topInset: number }) => {
      mockPanel('home', props);
      return <Text>home-panel</Text>;
    },
  };
});
jest.mock('../../components/DiscoverSearch', () => {
  const { Text } = require('react-native');
  return {
    DiscoverSearch: (props: { playingId: number | null }) => {
      mockPanel('search', props);
      return <Text>search-panel</Text>;
    },
  };
});
jest.mock('../../components/DiscoverDownloads', () => {
  const { Text } = require('react-native');
  return {
    DiscoverDownloads: (props: { active: boolean }) => {
      mockPanel('downloads', props);
      return <Text>downloads-panel</Text>;
    },
  };
});

const mockStopPreview = jest.fn();
jest.mock('../../services/discoverPreviewService', () => ({
  stopDiscoverPreview: () => mockStopPreview(),
}));
jest.mock('../../store/persistence/kvStorage', () =>
  require('../../store/persistence/__mocks__/kvStorage'),
);

import { DiscoverScreen } from '../discover';
import { discoverSettingsStore } from '../../store/discoverSettingsStore';
import { themedAlertStore } from '../../store/themedAlertStore';

function lastProps(panel: string) {
  const calls = mockPanel.mock.calls.filter((c) => c[0] === panel);
  return calls[calls.length - 1]?.[1];
}

beforeEach(() => {
  mockFocused = true;
  mockPanel.mockClear();
  mockStopPreview.mockClear();
  discoverSettingsStore.setState({ baseUrl: 'https://d.example.com', token: 'tok' });
  themedAlertStore.setState({ visible: false, buttons: [] });
});

describe('DiscoverScreen connection form', () => {
  it('saves the connection when both fields are filled', () => {
    discoverSettingsStore.setState({ baseUrl: null, token: null });
    render(<DiscoverScreen />);
    expect(screen.getByText('Connect to Discover')).toBeTruthy();

    fireEvent.press(screen.getByText('Save'));
    expect(discoverSettingsStore.getState().baseUrl).toBeNull();

    fireEvent.changeText(screen.getByLabelText('Discover server URL'), 'https://new.example.com/');
    fireEvent.changeText(screen.getByLabelText('Token'), 'abc');
    fireEvent.press(screen.getByText('Save'));
    expect(discoverSettingsStore.getState()).toMatchObject({ baseUrl: 'https://new.example.com', token: 'abc' });
    expect(screen.getByText('home-panel')).toBeTruthy();
  });
});

describe('DiscoverScreen panels', () => {
  it('mounts all panels and polls downloads only while that panel is shown', () => {
    render(<DiscoverScreen />);
    expect(screen.getByText('home-panel')).toBeTruthy();
    // Hidden panels stay mounted (display: none) so they keep their state.
    expect(screen.queryByText('search-panel')).toBeNull();
    expect(screen.getByText('search-panel', { includeHiddenElements: true })).toBeTruthy();
    expect(lastProps('downloads')).toEqual(expect.objectContaining({ active: false }));

    fireEvent.press(screen.getByText('Downloads'));
    expect(lastProps('downloads')).toEqual(expect.objectContaining({ active: true }));
    expect(screen.getByRole('tab', { name: 'Downloads' }).props.accessibilityState).toEqual({ selected: true });

    fireEvent.press(screen.getByText('Search'));
    expect(lastProps('downloads')).toEqual(expect.objectContaining({ active: false }));
    fireEvent.press(screen.getByText('Explore'));
    expect(screen.getByRole('tab', { name: 'Explore' }).props.accessibilityState).toEqual({ selected: true });
  });

  it('stops the preview and download polling when the tab loses focus', () => {
    mockFocused = false;
    render(<DiscoverScreen />);
    fireEvent.press(screen.getByText('Downloads'));
    expect(mockStopPreview).toHaveBeenCalled();
    expect(lastProps('downloads')).toEqual(expect.objectContaining({ active: false }));
  });

  it('disconnects after confirming the connection button', () => {
    render(<DiscoverScreen />);
    fireEvent.press(screen.getByLabelText('Edit connection'));
    const state = themedAlertStore.getState();
    expect(state.title).toBe('Edit connection');
    act(() => state.buttons.find((b) => b.text === 'OK')?.onPress?.());
    expect(screen.getByText('Connect to Discover')).toBeTruthy();
  });

  it('remounts the panels when the connection changes', async () => {
    render(<DiscoverScreen />);
    const before = mockPanel.mock.calls.filter((c) => c[0] === 'home').length;
    act(() => discoverSettingsStore.getState().setConnection('https://other.example.com', 'tok2'));
    await waitFor(() => expect(mockPanel.mock.calls.filter((c) => c[0] === 'home').length).toBeGreaterThan(before));
  });
});
