import i18n from '../i18n/i18n';

/**
 * Chat times are shown in Brasília time: the server's users are in Brazil, and some devices
 * (seen on the Windows app) report UTC instead of their real zone.
 */
const CHAT_TIME_ZONE = 'America/Sao_Paulo';

function format(ms: number, options: Intl.DateTimeFormatOptions, kind: 'time' | 'date'): string {
  const date = new Date(ms);
  const lang = i18n.language || undefined;
  try {
    return kind === 'time'
      ? date.toLocaleTimeString(lang, { ...options, timeZone: CHAT_TIME_ZONE })
      : date.toLocaleDateString(lang, { ...options, timeZone: CHAT_TIME_ZONE });
  } catch {
    // An engine without time-zone data: fall back to the device zone.
    return kind === 'time' ? date.toLocaleTimeString(lang, options) : date.toLocaleDateString(lang, options);
  }
}

/** Calendar day of a timestamp in Brasília, e.g. "2026-11-08". */
function dayKey(ms: number): string {
  return format(ms, { year: 'numeric', month: '2-digit', day: '2-digit' }, 'date');
}

/** Clock time of a message (24-hour in Portuguese). */
export function formatChatClock(ms: number): string {
  return format(ms, { hour: '2-digit', minute: '2-digit' }, 'time');
}

/** Time today, weekday this week, otherwise the date, in the app language. */
export function formatChatTime(ms: number, now: number = Date.now()): string {
  if (dayKey(ms) === dayKey(now)) return formatChatClock(ms);
  if (now - ms < 6 * 24 * 3600 * 1000) return format(ms, { weekday: 'short' }, 'date');
  return format(ms, { day: '2-digit', month: '2-digit', year: '2-digit' }, 'date');
}

/** The day separator inside a conversation, e.g. "8 de novembro de 2026". */
export function formatChatDay(ms: number): string {
  return format(ms, { day: 'numeric', month: 'long', year: 'numeric' }, 'date');
}

/** Whether two messages fall on the same day in Brasília (for the day separators). */
export function isSameChatDay(a: number, b: number): boolean {
  return dayKey(a) === dayKey(b);
}
