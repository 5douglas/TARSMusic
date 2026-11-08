import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from './BottomSheet';
import { useTheme } from '../hooks/useTheme';
import { isDiscoverConfigured, reportSongProblem, type ReportKind, type ReportResult } from '../services/discoverService';
import { lyricsStore } from '../store/lyricsStore';
import { reportProblemStore } from '../store/reportProblemStore';
import { themedAlertStore } from '../store/themedAlertStore';
import { parseLrc } from '../utils/lrc';

/** Each tap moves the lyrics this much. */
const STEP_MS = 500;

type Mode = 'menu' | 'sync' | 'note';

const OPTIONS: { kind: ReportKind | 'sync' | 'note'; icon: string; label: string }[] = [
  { kind: 'sync', icon: 'time-outline', label: 'reportLyricsOutOfSync' },
  { kind: 'lyrics_wrong', icon: 'document-text-outline', label: 'reportLyricsWrong' },
  { kind: 'lyrics_missing', icon: 'remove-circle-outline', label: 'reportLyricsMissing' },
  { kind: 'lyrics_unsynced', icon: 'reorder-four-outline', label: 'reportLyricsUnsynced' },
  { kind: 'audio', icon: 'volume-high-outline', label: 'reportAudio' },
  { kind: 'tags', icon: 'pricetag-outline', label: 'reportTags' },
  { kind: 'cover', icon: 'image-outline', label: 'reportCover' },
  { kind: 'note', icon: 'chatbox-ellipses-outline', label: 'reportOther' },
];

function formatSeconds(ms: number): string {
  const s = (ms / 1000).toFixed(1);
  return ms > 0 ? `+${s}` : s;
}

/**
 * "Report a problem" for one song. Lyrics out of sync is adjusted right here while the
 * song plays (the change applies at once) and then sent to the server, which shifts the
 * .lrc for everyone. The other kinds go to the server, which tries to fix them on its own.
 */
export function ReportProblemSheet() {
  const visible = reportProblemStore((s) => s.visible);
  const song = reportProblemStore((s) => s.song);
  const entry = lyricsStore((s) => (song ? s.entries[song.id] : undefined));
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('menu');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const pendingMessage = useRef<string | null>(null);

  useEffect(() => {
    if (visible) {
      setMode('menu');
      setNote('');
      setBusy(false);
    }
  }, [visible, song?.id]);

  useEffect(() => {
    if (mode === 'sync' && song && !entry) void lyricsStore.getState().fetchLyrics(song.id, song.artist, song.title);
  }, [mode, song, entry]);

  const close = useCallback(() => reportProblemStore.getState().hide(), []);

  const messageFor = useCallback(
    (kind: ReportKind, result: ReportResult | null): string => {
      if (!result) return isDiscoverConfigured() ? t('reportFailed') : t('reportNeedsDiscover');
      switch (result.status) {
        case 'fixed':
          return kind.startsWith('lyrics') ? t('reportFixedLyrics') : t('reportFixed');
        case 'queued':
          return t('reportQueuedAudio');
        case 'instrumental':
          return t('reportInstrumental');
        default:
          return t('reportSentToAdmin');
      }
    },
    [t],
  );

  const send = useCallback(
    async (kind: ReportKind, extra: { offsetMs?: number; note?: string } = {}) => {
      if (!song || busy) return;
      setBusy(true);
      const result = await reportSongProblem(song.id, kind, extra);
      if (result?.lyrics) {
        const data = parseLrc(result.lyrics);
        if (data) await lyricsStore.getState().setLyrics(song.id, data);
      }
      setBusy(false);
      // Shown once the sheet is gone: an alert over a live Modal ignores touches on Android.
      pendingMessage.current = messageFor(kind, result);
      close();
    },
    [song, busy, messageFor, close],
  );

  const onCloseComplete = useCallback(() => {
    const message = pendingMessage.current;
    pendingMessage.current = null;
    if (message) themedAlertStore.getState().show(t('reportProblem'), message, [{ text: t('ok') }]);
  }, [t]);

  const pick = (kind: (typeof OPTIONS)[number]['kind']) => {
    if (kind === 'sync') setMode('sync');
    else if (kind === 'note') setMode('note');
    else void send(kind);
  };

  const canAdjust = !!entry?.synced;
  const offset = entry?.offsetMs ?? 0;
  const adjust = (delta: number) => {
    if (song) lyricsStore.getState().adjustOffset(song.id, delta);
  };

  const row = (icon: string, label: string, onPress: () => void, key?: string) => (
    <Pressable
      key={key ?? label}
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.option, { borderBottomColor: colors.border }, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <Ionicons name={icon as never} size={22} color={colors.textPrimary} />
      <Text style={[styles.optionText, { color: colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );

  return (
    <BottomSheet visible={visible} onClose={close} onCloseComplete={onCloseComplete}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t('reportProblem')}</Text>
        {song && (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {song.artist ? `${song.title} · ${song.artist}` : song.title}
          </Text>
        )}

        {mode === 'menu' && OPTIONS.map((o) => row(o.icon, t(o.label), () => pick(o.kind), o.kind))}

        {mode === 'sync' &&
          (canAdjust ? (
            <View style={styles.sync}>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('reportSyncHint')}</Text>
              <Text style={[styles.offset, { color: colors.textPrimary }]}>{formatSeconds(offset)} s</Text>
              <View style={styles.syncButtons}>
                <Pressable
                  onPress={() => adjust(-STEP_MS)}
                  style={({ pressed }) => [styles.syncButton, { backgroundColor: colors.inputBg }, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Ionicons name="play-back" size={18} color={colors.textPrimary} />
                  <Text style={[styles.syncLabel, { color: colors.textPrimary }]}>{t('reportLyricsEarlier')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => adjust(STEP_MS)}
                  style={({ pressed }) => [styles.syncButton, { backgroundColor: colors.inputBg }, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Ionicons name="play-forward" size={18} color={colors.textPrimary} />
                  <Text style={[styles.syncLabel, { color: colors.textPrimary }]}>{t('reportLyricsLater')}</Text>
                </Pressable>
              </View>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('reportSyncHelp')}</Text>
              <Pressable
                onPress={() => void send('lyrics_offset', { offsetMs: offset })}
                disabled={busy || offset === 0}
                style={[styles.primary, { backgroundColor: colors.primary }, (busy || offset === 0) && styles.disabled]}
                accessibilityRole="button"
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t('reportSendSync')}</Text>}
              </Pressable>
            </View>
          ) : (
            <View style={styles.sync}>
              <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('reportNoSyncedLyrics')}</Text>
              {row('document-text-outline', t('reportLyricsWrong'), () => void send('lyrics_wrong'))}
              {row('reorder-four-outline', t('reportLyricsUnsynced'), () => void send('lyrics_unsynced'))}
            </View>
          ))}

        {mode === 'note' && (
          <View style={styles.sync}>
            <TextInput
              style={[styles.note, { backgroundColor: colors.inputBg, color: colors.textPrimary }]}
              value={note}
              onChangeText={setNote}
              placeholder={t('reportOtherPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={1000}
            />
            <Pressable
              onPress={() => void send('other', { note: note.trim() })}
              disabled={busy || !note.trim()}
              style={[styles.primary, { backgroundColor: colors.primary }, (busy || !note.trim()) && styles.disabled]}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t('reportSend')}</Text>}
            </Pressable>
          </View>
        )}

        {busy && mode === 'menu' && <ActivityIndicator style={styles.busy} color={colors.textSecondary} />}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionText: {
    fontSize: 16,
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  sync: {
    gap: 12,
    paddingTop: 8,
  },
  hint: {
    fontSize: 13,
    textAlign: 'center',
  },
  offset: {
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  syncButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  syncButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  syncLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  primary: {
    borderRadius: 24,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.5,
  },
  note: {
    borderRadius: 10,
    minHeight: 90,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  busy: {
    marginTop: 12,
  },
});
