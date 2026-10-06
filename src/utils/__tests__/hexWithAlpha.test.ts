import { hexWithAlpha, mixHexColors } from '../colors';

describe('hexWithAlpha', () => {
  it('appends correct hex alpha for 15% opacity', () => {
    expect(hexWithAlpha('#1D9BF0', 0.15)).toBe('#1D9BF026');
  });

  it('appends correct hex alpha for 10% opacity', () => {
    expect(hexWithAlpha('#1D9BF0', 0.10)).toBe('#1D9BF01a');
  });

  it('appends FF for alpha = 1', () => {
    expect(hexWithAlpha('#000000', 1)).toBe('#000000ff');
  });

  it('appends 00 for alpha = 0', () => {
    expect(hexWithAlpha('#ffffff', 0)).toBe('#ffffff00');
  });

  it('appends 80 for alpha = 0.5', () => {
    expect(hexWithAlpha('#123456', 0.5)).toBe('#12345680');
  });

  it('clamps alpha above 1 to FF', () => {
    expect(hexWithAlpha('#000000', 2)).toBe('#000000ff');
  });

  it('clamps alpha below 0 to 00', () => {
    expect(hexWithAlpha('#000000', -1)).toBe('#00000000');
  });

  it('pads single-digit hex values with leading zero', () => {
    // alpha = 0.02 → Math.round(0.02 * 255) = 5 → '05'
    expect(hexWithAlpha('#aabbcc', 0.02)).toBe('#aabbcc05');
  });
});

describe('mixHexColors', () => {
  it('returns base when ratio is 0', () => {
    expect(mixHexColors('#121212', '#1D9BF0', 0)).toBe('#121212');
  });

  it('returns blend when ratio is 1', () => {
    expect(mixHexColors('#121212', '#1D9BF0', 1)).toBe('#1d9bf0');
  });

  it('mixes at 50%', () => {
    // (#00, #FF) at 50% → #80 per channel
    expect(mixHexColors('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('produces correct intermediate blend', () => {
    // base #121212, blend #1D9BF0, ratio 0.15
    // R: 18 + (29-18)*0.15 = 18 + 1.65 = 20 → 0x14
    // G: 18 + (155-18)*0.15 = 18 + 20.55 = 39 → 0x27
    // B: 18 + (240-18)*0.15 = 18 + 33.3 = 51 → 0x33
    expect(mixHexColors('#121212', '#1D9BF0', 0.15)).toBe('#142733');
  });

  it('clamps ratio above 1', () => {
    expect(mixHexColors('#000000', '#ff0000', 5)).toBe('#ff0000');
  });

  it('clamps ratio below 0', () => {
    expect(mixHexColors('#ff0000', '#000000', -1)).toBe('#ff0000');
  });

  it('always returns 7-char #RRGGBB string', () => {
    const result = mixHexColors('#010101', '#020202', 0.5);
    expect(result).toHaveLength(7);
    expect(result[0]).toBe('#');
  });
});
