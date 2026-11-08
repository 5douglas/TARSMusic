import type { LyricsData } from '../services/subsonicService';

const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const TAG = /^\[(ar|ti|al|length|offset|by|re|ve|au):.*\]$/i;

function stampMs(min: string, sec: string, frac: string | undefined): number {
  const f = frac ?? '0';
  const fracMs = Number(f) * (f.length === 1 ? 100 : f.length === 2 ? 10 : 1);
  return (Number(min) * 60 + Number(sec)) * 1000 + fracMs;
}

/** LRC text (synced or plain lines) as the app's lyrics shape; null when it holds no words. */
export function parseLrc(text: string): LyricsData | null {
  const synced: { startMs: number; text: string }[] = [];
  const plain: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^﻿/, '').trimEnd();
    if (TAG.test(line.trim())) continue;
    const stamps = [...line.matchAll(STAMP)];
    if (stamps.length > 0 && line.trimStart().startsWith('[')) {
      const body = line.replace(STAMP, '').trim();
      for (const s of stamps) synced.push({ startMs: stampMs(s[1], s[2], s[3]), text: body });
    } else if (line.trim()) {
      plain.push(line.trim());
    }
  }
  if (synced.length > 0) {
    synced.sort((a, b) => a.startMs - b.startMs);
    return { synced: true, lines: synced, offsetMs: 0, source: 'structured' };
  }
  if (plain.length > 0) {
    return { synced: false, lines: plain.map((t) => ({ startMs: 0, text: t })), offsetMs: 0, source: 'structured' };
  }
  return null;
}
