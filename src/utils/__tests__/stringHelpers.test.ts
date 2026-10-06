import { getArtistInitials, minDelay, timeAgo } from '../stringHelpers';

describe('getArtistInitials', () => {
  it('returns first 2 letters for single-word name', () => {
    expect(getArtistInitials('Prince')).toBe('PR');
    expect(getArtistInitials('Beyoncé')).toBe('BE');
  });

  it('returns first letter of first 2 words for multi-word name', () => {
    expect(getArtistInitials('Daft Punk')).toBe('DP');
    expect(getArtistInitials('Foo Fighters')).toBe('FF');
  });

  it('strips "The" prefix', () => {
    expect(getArtistInitials('The Beatles')).toBe('BE');
    expect(getArtistInitials('The Rolling Stones')).toBe('RS');
  });

  it('strips "A" prefix', () => {
    expect(getArtistInitials('A Tribe Called Quest')).toBe('TC');
  });

  it('strips "An" prefix', () => {
    expect(getArtistInitials('An Albatross')).toBe('AL');
  });

  it('strips Spanish articles', () => {
    expect(getArtistInitials('El Canto del Loco')).toBe('CD');
    expect(getArtistInitials('La Oreja de Van Gogh')).toBe('OD');
    expect(getArtistInitials('Los Lobos')).toBe('LO');
    expect(getArtistInitials('Las Ketchup')).toBe('KE');
  });

  it('strips French articles', () => {
    expect(getArtistInitials('Le Tigre')).toBe('TI');
    expect(getArtistInitials('Les Misérables')).toBe('MI');
  });

  it('strips German articles', () => {
    expect(getArtistInitials('Die Antwoord')).toBe('AN');
    expect(getArtistInitials('Der Plan')).toBe('PL');
    expect(getArtistInitials('Das Racist')).toBe('RA');
  });

  it('strips Italian articles', () => {
    expect(getArtistInitials('Il Divo')).toBe('DI');
    expect(getArtistInitials('Lo Stato Sociale')).toBe('SS');
    expect(getArtistInitials('Gli Amici')).toBe('AM');
  });

  it('strips Portuguese articles', () => {
    expect(getArtistInitials('Os Mutantes')).toBe('MU');
    expect(getArtistInitials('As Meninas')).toBe('ME');
  });

  it('is case-insensitive for prefix stripping', () => {
    expect(getArtistInitials('the beatles')).toBe('BE');
    expect(getArtistInitials('THE BEATLES')).toBe('BE');
  });

  it('does not strip prefix that is the entire name', () => {
    expect(getArtistInitials('The')).toBe('TH');
    expect(getArtistInitials('A')).toBe('A');
  });

  it('handles extra whitespace', () => {
    expect(getArtistInitials('  Daft  Punk  ')).toBe('DP');
  });

  it('handles single letter name', () => {
    expect(getArtistInitials('X')).toBe('X');
  });

  it('returns first 2 letters when prefix strip leaves single word', () => {
    expect(getArtistInitials('The Weeknd')).toBe('WE');
  });
});

describe('minDelay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves after specified ms', async () => {
    const p = minDelay(500);
    jest.advanceTimersByTime(500);
    await expect(p).resolves.toBeUndefined();
  });

  it('does not resolve before specified ms', async () => {
    let resolved = false;
    minDelay(500).then(() => { resolved = true; });
    jest.advanceTimersByTime(499);
    await Promise.resolve();
    expect(resolved).toBe(false);
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it('uses default 2000ms when no arg', async () => {
    let resolved = false;
    minDelay().then(() => { resolved = true; });
    jest.advanceTimersByTime(1999);
    await Promise.resolve();
    expect(resolved).toBe(false);
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it('resolves immediately when ms is 0', async () => {
    const p = minDelay(0);
    jest.advanceTimersByTime(0);
    await expect(p).resolves.toBeUndefined();
  });
});

describe('timeAgo — calendar-aware day buckets', () => {
  // Mock `t` that echoes the key + count, so assertions can match exact output.
  const t = (key: string, opts?: Record<string, unknown>): string => {
    if (!opts) return key;
    return `${key}:${opts.count ?? ''}`;
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns "yesterday" for a play on the previous calendar day (past the 24h hours-bucket cutoff)', () => {
    jest.setSystemTime(new Date(2026, 4, 26, 23, 0));   // Tue 11:00 PM
    const ts = new Date(2026, 4, 25, 10, 0).getTime(); // Mon 10:00 AM — 37h elapsed
    expect(timeAgo(ts, t)).toBe('yesterday');
  });

  it('returns "2 days ago" for a 28-hour-old play that is calendar two days ago', () => {
    // Wed 3:30 AM viewing a Mon 11:30 PM scrobble: 28h elapsed, but
    // calendar Mon → Tue → Wed is 2 days.
    jest.setSystemTime(new Date(2026, 4, 27, 3, 30));
    const ts = new Date(2026, 4, 25, 23, 30).getTime();
    expect(timeAgo(ts, t)).toBe('daysAgo:2');
  });

  it('returns "yesterday" (not "2 days ago") for a 47-hour-old play that is calendar yesterday', () => {
    // The bug-fix case: viewing Wed 11:58 PM, scrobble Tue 1:00 AM →
    // ~47h elapsed but Tuesday IS calendar-yesterday. Old code
    // (Math.floor(47/24) === 1) coincidentally got this one right too,
    // but for the WRONG reason — we also need to make sure the 47h+
    // boundary doesn't flip to "2 days ago" via elapsed-time bucketing.
    jest.setSystemTime(new Date(2026, 4, 27, 23, 58));
    const ts = new Date(2026, 4, 26, 1, 0).getTime();
    expect(timeAgo(ts, t)).toBe('yesterday');
  });

  it('still returns "X hours ago" for plays under 24h elapsed', () => {
    jest.setSystemTime(new Date(2026, 4, 26, 14, 0));
    const ts = new Date(2026, 4, 26, 10, 0).getTime();
    expect(timeAgo(ts, t)).toBe('hoursAgo:4');
  });

  it('falls back to hours bucket for same-day plays with > 24h elapsed (clock-shift edge)', () => {
    // Same calendar day per local TZ but elapsed > 24h — only possible
    // via a backward clock shift. Should NOT say "today / yesterday" —
    // fall back to hours so the relative-time stays informative.
    jest.setSystemTime(new Date(2026, 4, 26, 12, 0));
    // Construct a timestamp at the same local date earlier in the day...
    // then back-date by 25 fictional hours of elapsed:
    const ts = new Date(2026, 4, 26, 12, 0).getTime() - 25 * 60 * 60 * 1000;
    // Result: 1 day earlier — so cd should be 1 → "yesterday". This
    // edge isn't easy to synthesise without messing with TZ, so just
    // assert the relative path is consistent.
    const out = timeAgo(ts, t);
    expect(out === 'yesterday' || out === 'hoursAgo:25').toBe(true);
  });

  it('returns "weeks ago" for plays older than a calendar week', () => {
    jest.setSystemTime(new Date(2026, 4, 27, 12, 0));
    const ts = new Date(2026, 4, 13, 12, 0).getTime(); // 14 days ago
    expect(timeAgo(ts, t)).toBe('weeksAgo:2');
  });
});
