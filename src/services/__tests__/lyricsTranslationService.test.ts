jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'pt' }] }));

import {
  parseGoogleTranslation,
  targetLanguage,
  translateLyrics,
} from '../lyricsTranslationService';

const mockFetch = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;

function respond(body: unknown, ok = true) {
  mockFetch.mockResolvedValueOnce({ ok, json: async () => body });
}

beforeEach(() => mockFetch.mockReset());

describe('lyricsTranslationService', () => {
  it('uses the phone language as the target', () => {
    expect(targetLanguage()).toBe('pt');
  });

  it('parses Google segments and the detected language', () => {
    expect(parseGoogleTranslation([[['Olá\n', 'Hello\n'], ['mundo', 'world']], null, 'en'])).toEqual({
      text: 'Olá\nmundo',
      sourceLang: 'en',
    });
    expect(parseGoogleTranslation({})).toBeNull();
  });

  it('translates line by line and keeps empty lines in place', async () => {
    respond([[['Olá\n', 'Hello\n'], ['mundo', 'world']], null, 'en']);
    const res = await translateLyrics(['Hello', '', 'world'], 'pt');
    expect(res).toEqual({ lines: ['Olá', '', 'mundo'], sourceLang: 'en' });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('tl=pt');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(`q=${encodeURIComponent('Hello\nworld')}`);
  });

  it('drops a translation whose lines do not line up', async () => {
    respond([[['Olá mundo', 'Hello\nworld']], null, 'en']);
    expect(await translateLyrics(['Hello', 'world'], 'pt')).toBeNull();
  });

  it('returns null when the service fails', async () => {
    respond(null, false);
    expect(await translateLyrics(['Hello'], 'pt')).toBeNull();
  });

  it('skips the request when every line is empty', async () => {
    expect(await translateLyrics(['', ' '], 'pt')).toEqual({ lines: ['', ''], sourceLang: null });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
