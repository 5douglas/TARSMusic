import { getLayoutMode } from '../useLayoutMode';

jest.mock('react-native', () => ({
  useWindowDimensions: jest.fn(() => ({ width: 375, height: 812 })),
}));

import { useWindowDimensions } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { useLayoutMode } from '../useLayoutMode';

const mockUseWindowDimensions = useWindowDimensions as jest.Mock;

describe('getLayoutMode', () => {
  it('returns compact for phone portrait', () => {
    expect(getLayoutMode(375, 812)).toBe('compact');
    expect(getLayoutMode(390, 844)).toBe('compact');
    expect(getLayoutMode(430, 932)).toBe('compact');
  });

  it('returns compact for phone landscape (width < 900)', () => {
    expect(getLayoutMode(667, 375)).toBe('compact');
    expect(getLayoutMode(844, 390)).toBe('compact');
    expect(getLayoutMode(899, 430)).toBe('compact');
  });

  it('returns compact for iPad portrait even when width >= 900', () => {
    expect(getLayoutMode(768, 1024)).toBe('compact');
    expect(getLayoutMode(834, 1194)).toBe('compact');
    expect(getLayoutMode(1024, 1366)).toBe('compact');
  });

  it('returns wide for iPad landscape with sufficient width', () => {
    expect(getLayoutMode(1024, 768)).toBe('wide');
    expect(getLayoutMode(1112, 834)).toBe('wide');
    expect(getLayoutMode(1194, 834)).toBe('wide');
    expect(getLayoutMode(1366, 1024)).toBe('wide');
  });

  it('returns wide at exactly 900 in landscape', () => {
    expect(getLayoutMode(900, 600)).toBe('wide');
  });

  it('returns compact at exactly 900 in portrait', () => {
    expect(getLayoutMode(900, 1200)).toBe('compact');
  });

  it('returns compact for square dimensions at 900', () => {
    expect(getLayoutMode(900, 900)).toBe('compact');
  });

  it('returns compact for very small widths', () => {
    expect(getLayoutMode(320, 568)).toBe('compact');
    expect(getLayoutMode(0, 0)).toBe('compact');
  });
});

describe('useLayoutMode', () => {
  it('returns compact for phone portrait', () => {
    mockUseWindowDimensions.mockReturnValue({ width: 390, height: 844 });
    const { result } = renderHook(() => useLayoutMode());
    expect(result.current).toBe('compact');
  });

  it('returns compact for iPad portrait', () => {
    mockUseWindowDimensions.mockReturnValue({ width: 1024, height: 1366 });
    const { result } = renderHook(() => useLayoutMode());
    expect(result.current).toBe('compact');
  });

  it('returns wide for iPad landscape', () => {
    mockUseWindowDimensions.mockReturnValue({ width: 1024, height: 768 });
    const { result } = renderHook(() => useLayoutMode());
    expect(result.current).toBe('wide');
  });
});
