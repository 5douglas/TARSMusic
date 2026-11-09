import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useFocusEffect } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useCallback, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { BottomChrome } from '../components/BottomChrome';
import { CachedImage } from '../components/CachedImage';
import { GradientBackground } from '../components/GradientBackground';
import { useJamLabel } from '../components/JamButton';
import { SectionTitle } from '../components/SectionTitle';
import { useTheme } from '../hooks/useTheme';
import {
  joinSession,
  leaveSession,
  refreshJamSessions,
  setJamListenOnly,
  setJamPermissions,
  startHosting,
} from '../services/jamService';
import type { JamPermKey } from '../services/jamPerms';
import { jamStore, type JamSessionSummary } from '../store/jamStore';
import { authStore } from '../store/authStore';
import { offlineModeStore } from '../store/offlineModeStore';
import { getArtistInitials } from '../utils/stringHelpers';

/** How often the list of open sessions refreshes while this screen is open. */
const LIST_REFRESH_MS = 10_000;

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{getArtistInitials(name)}</Text>
    </View>
  );
}

function PrimaryButton({ label, icon, onPress, busy, danger }: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: danger ? colors.card : colors.primary },
        (pressed || busy) && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={danger ? colors.textPrimary : '#fff'} />
      ) : (
        <>
          <Ionicons name={icon} size={20} color={danger ? colors.textPrimary : '#fff'} />
          <Text style={[styles.buttonLabel, { color: danger ? colors.textPrimary : '#fff' }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

function SessionRow({ session, onJoin, busy }: { session: JamSessionSummary; onJoin: () => void; busy: boolean }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const subtitle = session.title
    ? [session.title, session.artist].filter(Boolean).join(' · ')
    : t('jamNothingPlaying');
  return (
    <Pressable
      onPress={onJoin}
      disabled={busy}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.card }, pressed && styles.pressed]}
    >
      {session.coverArt ? (
        <CachedImage coverArtId={session.coverArt} size={150} style={styles.rowCover} resizeMode="cover" />
      ) : (
        <Avatar name={session.host} size={52} />
      )}
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.textPrimary }]}>
          {t('jamHostSession', { name: session.host })}
        </Text>
        <Text numberOfLines={1} style={[styles.rowSubtitle, { color: colors.textSecondary }]}>
          {session.playing ? '' : `${t('jamPaused')} · `}
          {subtitle}
        </Text>
        <Text numberOfLines={1} style={[styles.rowMeta, { color: colors.textSecondary }]}>
          {t('jamListenersCount', { count: session.listeners })}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <View style={[styles.joinChip, { backgroundColor: colors.primary }]}>
          <Text style={styles.joinChipText}>{t('jamJoin')}</Text>
        </View>
      )}
    </Pressable>
  );
}

const PERM_ROWS: { key: JamPermKey; icon: React.ComponentProps<typeof Ionicons>['name']; label: string }[] = [
  { key: 'playback', icon: 'play-outline', label: 'jamPermPlayback' },
  { key: 'skip', icon: 'play-skip-forward-outline', label: 'jamPermSkip' },
  { key: 'queue', icon: 'list-outline', label: 'jamPermQueue' },
];

/** Host: what listeners may do, by group of controls and per listener. */
function HostPermissions() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const perms = jamStore((s) => s.perms);
  const members = jamStore((s) => s.members);
  const listenOnly = jamStore((s) => s.listenOnly);
  return (
    <View style={[styles.permCard, { backgroundColor: colors.card }]}>
      <Text style={[styles.permTitle, { color: colors.textPrimary }]}>{t('jamPermTitle')}</Text>
      <Text style={[styles.permHint, { color: colors.textSecondary }]}>{t('jamPermHint')}</Text>
      {PERM_ROWS.map((row) => (
        <View key={row.key} style={styles.permRow}>
          <Ionicons name={row.icon} size={20} color={colors.textSecondary} />
          <Text style={[styles.permLabel, { color: colors.textPrimary }]}>{t(row.label)}</Text>
          <Switch
            value={perms[row.key]}
            onValueChange={(v) => setJamPermissions({ ...perms, [row.key]: v })}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
            accessibilityLabel={t(row.label)}
          />
        </View>
      ))}
      {members.length > 0 && (
        <>
          <Text style={[styles.permSubtitle, { color: colors.textSecondary }]}>{t('jamPermPeople')}</Text>
          {members.map((m) => {
            const allowed = !listenOnly.some((u) => u.toLowerCase() === m.toLowerCase());
            return (
              <View key={m} style={styles.permRow}>
                <Avatar name={m} size={28} />
                <View style={styles.permPerson}>
                  <Text numberOfLines={1} style={[styles.permLabel, { color: colors.textPrimary }]}>{m}</Text>
                  <Text style={[styles.permPersonState, { color: colors.textSecondary }]}>
                    {allowed ? t('jamPermCanControl') : t('jamPermListenOnly')}
                  </Text>
                </View>
                <Switch
                  value={allowed}
                  onValueChange={(v) => setJamListenOnly(m, !v)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                  accessibilityLabel={m}
                />
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

/** Listener: what the host allows this account to do. */
function GuestPermissions() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const perms = jamStore((s) => s.perms);
  const listenOnly = jamStore((s) => s.listenOnly);
  const me = authStore((s) => s.username);
  const mine = !!me && listenOnly.some((u) => u.toLowerCase() === me.toLowerCase());
  const allowed = mine ? [] : PERM_ROWS.filter((r) => perms[r.key]).map((r) => t(r.label).toLowerCase());
  if (!mine && allowed.length === PERM_ROWS.length) return null;
  return (
    <View style={[styles.guestPerm, { borderColor: colors.border }]}>
      <Ionicons name="lock-closed-outline" size={16} color={colors.textSecondary} />
      <Text style={[styles.guestPermText, { color: colors.textSecondary }]}>
        {allowed.length === 0 ? t('jamGuestListenOnly') : t('jamGuestAllowed', { list: allowed.join(', ') })}
      </Text>
    </View>
  );
}

export function JamScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const mode = jamStore((s) => s.mode);
  const host = jamStore((s) => s.host);
  const members = jamStore((s) => s.members);
  const error = jamStore((s) => s.error);
  const ended = jamStore((s) => s.ended);
  const sessions = jamStore((s) => s.sessions);
  const sessionsLoading = jamStore((s) => s.sessionsLoading);
  const sessionsError = jamStore((s) => s.sessionsError);
  const offlineMode = offlineModeStore((s) => s.offlineMode);
  const label = useJamLabel();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (offlineMode) return undefined;
      void refreshJamSessions();
      const timer = setInterval(() => void refreshJamSessions(), LIST_REFRESH_MS);
      return () => clearInterval(timer);
    }, [offlineMode]),
  );

  const run = useCallback(async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setActionError(null);
    try {
      await fn();
    } catch {
      setActionError(t('jamActionFailed'));
    } finally {
      setBusy(null);
      void refreshJamSessions();
    }
  }, [t]);

  const others = sessions.filter((s) => !(mode === 'guest' && s.host === host));

  return (
    <GradientBackground scrollable>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: headerHeight + 8 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={sessionsLoading && sessions.length === 0}
            onRefresh={() => void refreshJamSessions()}
            tintColor={colors.primary}
            progressViewOffset={headerHeight}
          />
        }
      >
        {/* The current session, or how to start one. */}
        <View style={[styles.hero, { backgroundColor: colors.card }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="people" size={30} color="#fff" />
          </View>
          {mode === 'none' ? (
            <>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>{t('jamHeroTitle')}</Text>
              <Text style={[styles.heroBody, { color: colors.textSecondary }]}>{t('jamHeroBody')}</Text>
              <PrimaryButton
                label={t('jamStart')}
                icon="radio-outline"
                busy={busy === 'start'}
                onPress={() => void run('start', startHosting)}
              />
            </>
          ) : (
            <>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>{label}</Text>
              <Text style={[styles.heroBody, { color: colors.textSecondary }]}>
                {mode === 'host' ? t('jamHostBody') : t('jamGuestBody')}
              </Text>
              <View style={styles.members}>
                {mode === 'guest' && host && (
                  <View style={styles.member}>
                    <Avatar name={host} />
                    <Text numberOfLines={1} style={[styles.memberName, { color: colors.textPrimary }]}>{host}</Text>
                    <Text style={[styles.memberRole, { color: colors.textSecondary }]}>{t('jamHostLabel')}</Text>
                  </View>
                )}
                {members.map((m) => (
                  <View key={m} style={styles.member}>
                    <Avatar name={m} />
                    <Text numberOfLines={1} style={[styles.memberName, { color: colors.textPrimary }]}>{m}</Text>
                  </View>
                ))}
              </View>
              {mode === 'guest' && <GuestPermissions />}
              {error && (
                <Text style={[styles.error, { color: colors.textSecondary }]}>
                  {t('jamConnectionTrouble')}
                  {'\n'}
                  <Text style={styles.errorDetail}>{error}</Text>
                </Text>
              )}
              <PrimaryButton
                label={mode === 'host' ? t('jamEnd') : t('jamLeave')}
                icon="exit-outline"
                danger
                busy={busy === 'leave'}
                onPress={() => void run('leave', () => leaveSession())}
              />
            </>
          )}
          {ended === 'host-left' && mode === 'none' && (
            <Text style={[styles.error, { color: colors.textSecondary }]}>{t('jamEndedByHost')}</Text>
          )}
          {actionError && <Text style={[styles.error, { color: colors.textSecondary }]}>{actionError}</Text>}
        </View>

        {mode === 'host' && <HostPermissions />}

        {/* Sessions other people are hosting. */}
        <SectionTitle title={t('jamOpenSessions')} color={colors.textPrimary} />
        {offlineMode ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('jamOffline')}</Text>
        ) : others.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            {sessionsError ? `${t('jamListFailed')} (${sessionsError})` : sessionsLoading ? '' : t('jamNoSessions')}
          </Text>
        ) : (
          others.map((s) => (
            <SessionRow
              key={`${s.host}:${s.sid}`}
              session={s}
              busy={busy === s.sid}
              onJoin={() => void run(s.sid, () => joinSession(s.sid, s.host))}
            />
          ))
        )}
        <View style={styles.footer} />
      </ScrollView>
      <BottomChrome withSafeAreaPadding />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16 },
  pressed: { opacity: 0.6 },
  hero: { borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 20 },
  heroIcon: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  heroBody: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  button: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 24,
    minHeight: 46,
    alignSelf: 'stretch',
  },
  buttonLabel: { fontSize: 16, fontWeight: '700' },
  members: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, marginTop: 16 },
  member: { alignItems: 'center', width: 72 },
  memberName: { fontSize: 12, marginTop: 6, maxWidth: 72 },
  memberRole: { fontSize: 11 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  error: { fontSize: 13, marginTop: 12, textAlign: 'center' },
  errorDetail: { fontSize: 11, opacity: 0.7 },
  empty: { fontSize: 14, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 10, marginBottom: 10, gap: 12 },
  rowCover: { width: 52, height: 52, borderRadius: 6 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSubtitle: { fontSize: 13, marginTop: 2 },
  rowMeta: { fontSize: 12, marginTop: 2 },
  joinChip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  joinChipText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  footer: { height: 120 },
  permCard: { borderRadius: 16, padding: 16, marginBottom: 20 },
  permTitle: { fontSize: 17, fontWeight: '700' },
  permHint: { fontSize: 13, marginTop: 4, marginBottom: 6, lineHeight: 18 },
  permSubtitle: { fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 2 },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  permLabel: { flex: 1, fontSize: 15 },
  permPerson: { flex: 1, minWidth: 0 },
  permPersonState: { fontSize: 12, marginTop: 1 },
  guestPerm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'stretch',
  },
  guestPermText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
