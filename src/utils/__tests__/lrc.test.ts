import { parseLrc } from '../lrc';

describe('parseLrc', () => {
  it('reads synced lines, skipping tags and sorting repeats', () => {
    const data = parseLrc('[ti:Song]\n[ar:Someone]\n[00:05.50][00:01.0]chorus\n[00:03.123]verse\n');
    expect(data).toEqual({
      synced: true,
      offsetMs: 0,
      source: 'structured',
      lines: [
        { startMs: 1000, text: 'chorus' },
        { startMs: 3123, text: 'verse' },
        { startMs: 5500, text: 'chorus' },
      ],
    });
  });

  it('reads plain lyrics as unsynced lines', () => {
    expect(parseLrc('﻿first line\n\nsecond\r\n')).toEqual({
      synced: false,
      offsetMs: 0,
      source: 'structured',
      lines: [
        { startMs: 0, text: 'first line' },
        { startMs: 0, text: 'second' },
      ],
    });
  });

  it('returns null for empty text', () => {
    expect(parseLrc('[ti:Only tags]\n\n')).toBeNull();
  });
});
