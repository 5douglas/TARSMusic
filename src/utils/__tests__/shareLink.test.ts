import { buildShareLink, parseShareLink } from '../shareLink';

describe('buildShareLink', () => {
  it('uses the Discover address when one is set', () => {
    expect(buildShareLink('album', 'abc123', 'https://discover.example.com/')).toBe(
      'https://discover.example.com/s/album/abc123',
    );
  });

  it('falls back to the app scheme without a Discover address', () => {
    expect(buildShareLink('song', 'x y', null)).toBe('substreamer://s/song/x%20y');
  });
});

describe('parseShareLink', () => {
  it('reads a link inside a message', () => {
    expect(parseShareLink('Ouça "Song" de Artist\nhttps://discover.example.com/s/song/abc')).toEqual({
      kind: 'song',
      id: 'abc',
    });
  });

  it('reads the app scheme and bare paths', () => {
    expect(parseShareLink('substreamer://s/artist/a%2Fb')).toEqual({ kind: 'artist', id: 'a/b' });
    expect(parseShareLink('/s/playlist/p1')).toEqual({ kind: 'playlist', id: 'p1' });
  });

  it('round-trips built links', () => {
    for (const base of ['https://d.example.com', null]) {
      expect(parseShareLink(buildShareLink('album', 'id-1', base))).toEqual({ kind: 'album', id: 'id-1' });
    }
  });

  it('ignores other links', () => {
    expect(parseShareLink('https://example.com/album/abc')).toBeNull();
    expect(parseShareLink('https://example.com/x/s/album/abc')).toBeNull();
    expect(parseShareLink('s/video/abc')).toBeNull();
    expect(parseShareLink(null)).toBeNull();
  });
});
