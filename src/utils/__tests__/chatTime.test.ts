jest.mock('../../i18n/i18n', () => ({ __esModule: true, default: { language: 'pt' } }));

import { formatChatClock, formatChatDay, formatChatTime } from '../chatTime';

const at = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo - 1, d, h, mi).getTime();

it('shows the clock in 24-hour Portuguese time', () => {
  expect(formatChatClock(at(2026, 11, 8, 13, 5))).toBe('13:05');
});

it('shows the clock for today and the date for older messages', () => {
  const now = at(2026, 11, 8, 18, 0);
  expect(formatChatTime(at(2026, 11, 8, 9, 30), now)).toBe('09:30');
  expect(formatChatTime(at(2026, 10, 1, 9, 30), now)).toBe('01/10/26');
});

it('writes the day separator in the app language', () => {
  expect(formatChatDay(at(2026, 11, 8, 12, 0))).toBe('8 de novembro de 2026');
});
