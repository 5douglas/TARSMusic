import { SUPPORTED_LANGUAGES, SUPPORTED_LOCALE_CODES } from '../languages';

describe('SUPPORTED_LANGUAGES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(SUPPORTED_LANGUAGES)).toBe(true);
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThan(0);
  });

  it('each entry has code, name, and nativeName as strings', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(typeof lang.code).toBe('string');
      expect(lang.code.length).toBeGreaterThan(0);
      expect(typeof lang.name).toBe('string');
      expect(lang.name.length).toBeGreaterThan(0);
      expect(typeof lang.nativeName).toBe('string');
      expect(lang.nativeName.length).toBeGreaterThan(0);
    }
  });

  it('includes English (en)', () => {
    const english = SUPPORTED_LANGUAGES.find((l) => l.code === 'en');
    expect(english).toBeDefined();
    expect(english!.name).toBe('English');
    expect(english!.nativeName).toBe('English');
  });

  it('has no duplicate language codes', () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });
});

describe('SUPPORTED_LOCALE_CODES', () => {
  it('contains all language codes from SUPPORTED_LANGUAGES', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(SUPPORTED_LOCALE_CODES).toContain(lang.code);
    }
  });

  it('has the same length as SUPPORTED_LANGUAGES', () => {
    expect(SUPPORTED_LOCALE_CODES.length).toBe(SUPPORTED_LANGUAGES.length);
  });

  it('contains "en"', () => {
    expect(SUPPORTED_LOCALE_CODES).toContain('en');
  });

  it('is an array of strings', () => {
    for (const code of SUPPORTED_LOCALE_CODES) {
      expect(typeof code).toBe('string');
    }
  });
});
