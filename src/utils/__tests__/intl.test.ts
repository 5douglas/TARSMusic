import { baseCollator, defaultCollator, getDateTimeFormat } from '../intl';

describe('intl helpers', () => {
  describe('defaultCollator', () => {
    it('compares case-sensitive', () => {
      expect(defaultCollator.compare('a', 'A')).not.toBe(0);
    });

    it('orders strings predictably', () => {
      const items = ['banana', 'apple', 'cherry'];
      const sorted = [...items].sort((a, b) => defaultCollator.compare(a, b));
      expect(sorted).toEqual(['apple', 'banana', 'cherry']);
    });
  });

  describe('baseCollator', () => {
    it('treats case-only differences as equal', () => {
      expect(baseCollator.compare('elise', 'ELISE')).toBe(0);
    });

    it('treats accented variants as equal to their base form', () => {
      expect(baseCollator.compare('Élise', 'Elise')).toBe(0);
    });

    it('still orders distinct strings', () => {
      expect(baseCollator.compare('apple', 'banana')).toBeLessThan(0);
      expect(baseCollator.compare('banana', 'apple')).toBeGreaterThan(0);
    });
  });

  describe('getDateTimeFormat', () => {
    it('returns a working DateTimeFormat instance', () => {
      const fmt = getDateTimeFormat('en-US', { hour: 'numeric' });
      const result = fmt.format(new Date(2000, 0, 1, 9));
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('caches the same (locale, options) pair', () => {
      const a = getDateTimeFormat('en-US', { hour: 'numeric' });
      const b = getDateTimeFormat('en-US', { hour: 'numeric' });
      expect(a).toBe(b);
    });

    it('returns distinct instances for different locales', () => {
      const a = getDateTimeFormat('en-US', { hour: 'numeric' });
      const b = getDateTimeFormat('de-DE', { hour: 'numeric' });
      expect(a).not.toBe(b);
    });

    it('returns distinct instances for different options', () => {
      const a = getDateTimeFormat('en-US', { hour: 'numeric' });
      const b = getDateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
      expect(a).not.toBe(b);
    });

    it('handles undefined locale (uses system default)', () => {
      const fmt = getDateTimeFormat(undefined, { hour: 'numeric' });
      expect(fmt.format(new Date(2000, 0, 1, 9))).toBeTruthy();
    });
  });
});
