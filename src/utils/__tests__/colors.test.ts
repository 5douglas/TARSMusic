import { hexWithAlpha, mixHexColors } from '../colors';

describe('hexWithAlpha', () => {
  it('appends a clamped alpha byte in lowercase hex', () => {
    expect(hexWithAlpha('#1D9BF0', 0.15)).toBe('#1D9BF026');
    expect(hexWithAlpha('#000000', 0)).toBe('#00000000');
    expect(hexWithAlpha('#FFFFFF', 1)).toBe('#FFFFFFff');
  });

  it('clamps out-of-range alpha into [0, 1]', () => {
    expect(hexWithAlpha('#000000', -1)).toBe('#00000000');
    expect(hexWithAlpha('#FFFFFF', 2)).toBe('#FFFFFFff');
  });
});

describe('mixHexColors', () => {
  it('interpolates between base and blend by ratio', () => {
    expect(mixHexColors('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mixHexColors('#000000', '#FFFFFF', 1)).toBe('#ffffff');
    // 50/50 between #000 and #FFF → #808080
    expect(mixHexColors('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });

  it('clamps ratios outside [0, 1]', () => {
    expect(mixHexColors('#000000', '#FFFFFF', -1)).toBe('#000000');
    expect(mixHexColors('#000000', '#FFFFFF', 2)).toBe('#ffffff');
  });

  it('mixes per-channel independently', () => {
    // Mid-mix of pure-red and pure-blue should land on a muted purple.
    expect(mixHexColors('#FF0000', '#0000FF', 0.5)).toBe('#800080');
  });
});
