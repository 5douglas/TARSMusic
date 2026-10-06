jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      primary: '#ff6600',
      textPrimary: '#ffffff',
      textSecondary: '#888888',
      border: '#333333',
    },
  }),
}));

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { type PlayerTab } from '../PlayerTabBar';

// Must import after mocks
const { PlayerTabBar } = require('../PlayerTabBar');

const COLORS = {
  primary: '#ff6600',
  textPrimary: '#ffffff',
  textSecondary: '#888888',
  background: '#000000',
  card: '#1e1e1e',
  border: '#333333',
  label: '#aaaaaa',
  red: '#ff0000',
  inputBg: '#222222',
};

describe('PlayerTabBar', () => {
  it('renders all four tab icons', () => {
    const { getByText } = render(
      <PlayerTabBar activeTab="player" onSelect={jest.fn()} colors={COLORS} />,
    );

    expect(getByText('musical-notes')).toBeTruthy();
    expect(getByText('playlist-music')).toBeTruthy();
    expect(getByText('information-outline')).toBeTruthy();
    expect(getByText('comment-quote-outline')).toBeTruthy();
  });

  it('highlights the active tab in primary color', () => {
    const { getByText } = render(
      <PlayerTabBar activeTab="queue" onSelect={jest.fn()} colors={COLORS} />,
    );

    // Active tab (queue) should be primary color
    const queueIcon = getByText('playlist-music');
    expect(queueIcon.props.style.color).toBe(COLORS.primary);

    // Inactive tabs should be textSecondary
    const playerIcon = getByText('musical-notes');
    expect(playerIcon.props.style.color).toBe(COLORS.textSecondary);
  });

  it('calls onSelect with correct tab when pressed', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <PlayerTabBar activeTab="player" onSelect={onSelect} colors={COLORS} />,
    );

    fireEvent.press(getByLabelText('Queue'));
    expect(onSelect).toHaveBeenCalledWith('queue');

    fireEvent.press(getByLabelText('Album Info'));
    expect(onSelect).toHaveBeenCalledWith('info');

    fireEvent.press(getByLabelText('Lyrics'));
    expect(onSelect).toHaveBeenCalledWith('lyrics');

    fireEvent.press(getByLabelText('Now Playing'));
    expect(onSelect).toHaveBeenCalledWith('player');
  });

  it('highlights each tab correctly when active', () => {
    const tabs: PlayerTab[] = ['player', 'queue', 'info', 'lyrics'];
    const iconNames = ['musical-notes', 'playlist-music', 'information-outline', 'comment-quote-outline'];

    for (let i = 0; i < tabs.length; i++) {
      const { getByText } = render(
        <PlayerTabBar activeTab={tabs[i]} onSelect={jest.fn()} colors={COLORS} />,
      );

      for (let j = 0; j < iconNames.length; j++) {
        const icon = getByText(iconNames[j]);
        const expectedColor = i === j ? COLORS.primary : COLORS.textSecondary;
        expect(icon.props.style.color).toBe(expectedColor);
      }
    }
  });

  it('hides info and lyrics tabs in offline mode', () => {
    const { queryByLabelText, getByLabelText } = render(
      <PlayerTabBar activeTab="player" onSelect={jest.fn()} colors={COLORS} offlineMode={true} />,
    );

    expect(getByLabelText('Now Playing')).toBeTruthy();
    expect(getByLabelText('Queue')).toBeTruthy();
    expect(queryByLabelText('Album Info')).toBeNull();
    expect(queryByLabelText('Lyrics')).toBeNull();
  });

  it('shows all tabs when not in offline mode', () => {
    const { getByLabelText } = render(
      <PlayerTabBar activeTab="player" onSelect={jest.fn()} colors={COLORS} offlineMode={false} />,
    );

    expect(getByLabelText('Now Playing')).toBeTruthy();
    expect(getByLabelText('Queue')).toBeTruthy();
    expect(getByLabelText('Album Info')).toBeTruthy();
    expect(getByLabelText('Lyrics')).toBeTruthy();
  });

  it('sets accessibility roles and states', () => {
    const { getByLabelText } = render(
      <PlayerTabBar activeTab="info" onSelect={jest.fn()} colors={COLORS} />,
    );

    const infoTab = getByLabelText('Album Info');
    expect(infoTab.props.accessibilityRole).toBe('tab');
    expect(infoTab.props.accessibilityState).toEqual({ selected: true });

    const playerTab = getByLabelText('Now Playing');
    expect(playerTab.props.accessibilityRole).toBe('tab');
    expect(playerTab.props.accessibilityState).toEqual({ selected: false });
  });
});
