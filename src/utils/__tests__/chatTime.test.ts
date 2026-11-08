jest.mock('../../i18n/i18n', () => ({ __esModule: true, default: { language: 'pt' } }));

import { formatChatClock, formatChatDay, formatChatTime, isSameChatDay } from '../chatTime';

// UTC instants; Brasília is UTC-3.
const utc = (iso: string) => Date.parse(iso);

it('shows the clock in Brasília time, 24-hour', () => {
  expect(formatChatClock(utc('2026-11-08T16:05:00Z'))).toBe('13:05');
});

it('uses the Brasília day for "today" and the separators', () => {
  const now = utc('2026-11-08T21:00:00Z'); // 18:00 in Brasília
  expect(formatChatTime(utc('2026-11-08T12:30:00Z'), now)).toBe('09:30');
  // 01:30 UTC on the 9th is still the 8th (22:30) in Brasília.
  expect(isSameChatDay(utc('2026-11-09T01:30:00Z'), utc('2026-11-08T12:00:00Z'))).toBe(true);
  expect(formatChatTime(utc('2026-10-01T12:30:00Z'), now)).toBe('01/10/26');
});

it('writes the day separator in the app language', () => {
  expect(formatChatDay(utc('2026-11-08T15:00:00Z'))).toBe('8 de novembro de 2026');
});
