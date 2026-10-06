import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { sleepTimerStore } from '../../store/sleepTimerStore';

// Must import after mocks
const { SleepTimerCapsule } = require('../SleepTimerCapsule');

beforeEach(() => {
  sleepTimerStore.setState({
    endTime: null,
    endOfTrack: false,
    remaining: null,
    sheetVisible: false,
  });
});

describe('SleepTimerCapsule', () => {
  it('renders nothing when inactive', () => {
    const { queryByRole } = render(<SleepTimerCapsule />);
    expect(queryByRole('button')).toBeNull();
  });

  it('renders nothing when endTime is set but remaining is null', () => {
    sleepTimerStore.setState({ endTime: Date.now() / 1000 + 600, remaining: null });
    const { queryByRole } = render(<SleepTimerCapsule />);
    expect(queryByRole('button')).toBeNull();
  });

  it('renders countdown when active with remaining seconds', () => {
    sleepTimerStore.setState({ endTime: Date.now() / 1000 + 600, remaining: 125 });
    const { getByText } = render(<SleepTimerCapsule />);
    expect(getByText('2:05')).toBeTruthy();
  });

  it('formats countdown with hours when >= 3600s', () => {
    sleepTimerStore.setState({ endTime: Date.now() / 1000 + 3700, remaining: 3661 });
    const { getByText } = render(<SleepTimerCapsule />);
    expect(getByText('1:01:01')).toBeTruthy();
  });

  it('renders end-of-track label when endOfTrack is active', () => {
    sleepTimerStore.setState({ endOfTrack: true });
    const { getByText } = render(<SleepTimerCapsule />);
    expect(getByText('End of current track')).toBeTruthy();
  });

  it('prefers numeric countdown over end-of-track label when endTime is also set', () => {
    sleepTimerStore.setState({
      endTime: Date.now() / 1000 + 600,
      endOfTrack: true,
      remaining: 60,
    });
    const { getByText, queryByText } = render(<SleepTimerCapsule />);
    expect(getByText('1:00')).toBeTruthy();
    expect(queryByText('End of current track')).toBeNull();
  });

  it('renders the moon icon when active', () => {
    sleepTimerStore.setState({ endTime: Date.now() / 1000 + 600, remaining: 30 });
    const { getByTestId } = render(<SleepTimerCapsule />);
    expect(getByTestId('icon-moon')).toBeTruthy();
  });

  it('opens the sheet on press', () => {
    sleepTimerStore.setState({ endTime: Date.now() / 1000 + 600, remaining: 30 });
    const { getByRole } = render(<SleepTimerCapsule />);
    fireEvent.press(getByRole('button'));
    expect(sleepTimerStore.getState().sheetVisible).toBe(true);
  });

  it('has accessibility role and label', () => {
    sleepTimerStore.setState({ endTime: Date.now() / 1000 + 600, remaining: 30 });
    const { getByRole } = render(<SleepTimerCapsule />);
    const button = getByRole('button');
    expect(button.props.accessibilityLabel).toBe('Sleep Timer');
  });
});
