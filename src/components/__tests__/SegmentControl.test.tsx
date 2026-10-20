import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'dark',
    colors: {
      inputBg: '#282828',
      card: '#1e1e1e',
      primary: '#1D9BF0',
      textPrimary: '#ffffff',
      textSecondary: '#999999',
    },
  }),
}));

// Must import after mocks
const { SegmentControl } = require('../SegmentControl');

const SEGMENTS = [
  { key: 'a', label: 'Alpha' },
  { key: 'b', label: 'Beta' },
  { key: 'c', label: 'Gamma' },
] as const;

describe('SegmentControl', () => {
  it('renders all segment labels', () => {
    const { getByText } = render(
      <SegmentControl segments={SEGMENTS} selected="a" onSelect={jest.fn()} />
    );
    expect(getByText('Alpha')).toBeTruthy();
    expect(getByText('Beta')).toBeTruthy();
    expect(getByText('Gamma')).toBeTruthy();
  });

  it('calls onSelect with the segment key when pressed', () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <SegmentControl segments={SEGMENTS} selected="a" onSelect={onSelect} />
    );
    fireEvent.press(getByText('Beta'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('fills the selected pill with the primary colour and marks it selected', () => {
    const { getByText, getByRole } = render(
      <SegmentControl segments={SEGMENTS} selected="b" onSelect={jest.fn()} />
    );
    const activeLabel = getByText('Beta');
    const flatStyle = Object.assign({}, ...[activeLabel.props.style].flat().filter(Boolean));
    expect(flatStyle.color).toBe('#fff');
    expect(flatStyle.fontWeight).toBe('700');
    const pill = getByRole('tab', { name: 'Beta' });
    expect(pill.props.accessibilityState).toEqual({ selected: true });
  });

  it('keeps the other pills on the input background', () => {
    const { getByText, getByRole } = render(
      <SegmentControl segments={SEGMENTS} selected="b" onSelect={jest.fn()} />
    );
    const inactiveLabel = getByText('Alpha');
    const flatStyle = Object.assign({}, ...[inactiveLabel.props.style].flat().filter(Boolean));
    expect(flatStyle.color).toBe('#ffffff');
    expect(flatStyle.fontWeight).toBe('500');
    expect(getByRole('tab', { name: 'Alpha' }).props.accessibilityState).toEqual({ selected: false });
  });

  it('works with two segments', () => {
    const twoSegments = [
      { key: 'x', label: 'First' },
      { key: 'y', label: 'Second' },
    ] as const;
    const onSelect = jest.fn();
    const { getByText } = render(
      <SegmentControl segments={twoSegments} selected="x" onSelect={onSelect} />
    );
    fireEvent.press(getByText('Second'));
    expect(onSelect).toHaveBeenCalledWith('y');
  });
});
