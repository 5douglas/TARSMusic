import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'dark',
    colors: {
      inputBg: '#282828',
      card: '#1e1e1e',
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

  it('applies active styling to the selected segment', () => {
    const { getByText } = render(
      <SegmentControl segments={SEGMENTS} selected="b" onSelect={jest.fn()} />
    );
    const activeLabel = getByText('Beta');
    const flatStyle = Array.isArray(activeLabel.props.style)
      ? Object.assign({}, ...activeLabel.props.style.filter(Boolean))
      : activeLabel.props.style;
    expect(flatStyle.color).toBe('#ffffff');
    expect(flatStyle.fontWeight).toBe('600');
  });

  it('applies inactive styling to non-selected segments', () => {
    const { getByText } = render(
      <SegmentControl segments={SEGMENTS} selected="b" onSelect={jest.fn()} />
    );
    const inactiveLabel = getByText('Alpha');
    const flatStyle = Array.isArray(inactiveLabel.props.style)
      ? Object.assign({}, ...inactiveLabel.props.style.filter(Boolean))
      : inactiveLabel.props.style;
    expect(flatStyle.color).toBe('#999999');
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
