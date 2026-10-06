import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const COLORS = {
  primary: '#1db954',
  inputBg: '#282828',
  textPrimary: '#ffffff',
  textSecondary: '#999999',
  background: '#121212',
  card: '#1e1e1e',
  label: '#aaaaaa',
  border: '#333333',
  red: '#ff4444',
} as any;

// Must import after mocks
const { PillToggle } = require('../PillToggle');

const OPTIONS: [{ key: string; label: string }, { key: string; label: string }] = [
  { key: 'a', label: 'Alpha' },
  { key: 'b', label: 'Beta' },
];

describe('PillToggle', () => {
  it('renders both option labels', () => {
    const { getByText } = render(
      <PillToggle options={OPTIONS} selected="a" onSelect={jest.fn()} colors={COLORS} />
    );
    expect(getByText('Alpha')).toBeTruthy();
    expect(getByText('Beta')).toBeTruthy();
  });

  it('calls onSelect with the key when first option is pressed', () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <PillToggle options={OPTIONS} selected="b" onSelect={onSelect} colors={COLORS} />
    );
    fireEvent.press(getByText('Alpha'));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('calls onSelect with the key when second option is pressed', () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <PillToggle options={OPTIONS} selected="a" onSelect={onSelect} colors={COLORS} />
    );
    fireEvent.press(getByText('Beta'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('applies active styling to the selected option', () => {
    const { getByText } = render(
      <PillToggle options={OPTIONS} selected="a" onSelect={jest.fn()} colors={COLORS} />
    );
    const activeLabel = getByText('Alpha');
    const flatStyle = Array.isArray(activeLabel.props.style)
      ? Object.assign({}, ...activeLabel.props.style.filter(Boolean))
      : activeLabel.props.style;
    expect(flatStyle.color).toBe('#fff');
    expect(flatStyle.fontWeight).toBe('600');
  });

  it('applies inactive styling to non-selected option', () => {
    const { getByText } = render(
      <PillToggle options={OPTIONS} selected="a" onSelect={jest.fn()} colors={COLORS} />
    );
    const inactiveLabel = getByText('Beta');
    const flatStyle = Array.isArray(inactiveLabel.props.style)
      ? Object.assign({}, ...inactiveLabel.props.style.filter(Boolean))
      : inactiveLabel.props.style;
    expect(flatStyle.color).toBe('#999999');
  });

  it('sets accessibility roles on options', () => {
    const { getAllByRole } = render(
      <PillToggle options={OPTIONS} selected="b" onSelect={jest.fn()} colors={COLORS} />
    );
    const buttons = getAllByRole('button');
    expect(buttons.length).toBe(2);
  });
});
