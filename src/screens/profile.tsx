import Ionicons from '@react-native-vector-icons/ionicons/static';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomChrome } from '../components/BottomChrome';
import { CachedImage } from '../components/CachedImage';
import { LibraryItemRow } from '../components/LibraryItemRow';
import { PopularTrackRow } from '../components/PopularTrackRow';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { countStarredSongs, listStarredArtistIds } from '../db/repository/favorites';
import { PLAYLIST_LIST_COLS, playlistListRowToPlaylist, type PlaylistListRow } from '../db/repository/playlists';
import { computeStreaks, dateKey } from '../hooks/usePlaybackAnalytics';
import { useTheme } from '../hooks/useTheme';
import { useArtistCoverArt } from '../hooks/useTopArtists';
import { formatCount } from '../services/artistStatsService';
import type { LibraryItem } from '../services/libraryItemsService';
import { pickProfilePicture, removeProfilePicture } from '../services/profileService';
import { authStore } from '../store/authStore';
import { completedScrobbleStore } from '../store/completedScrobbleStore';
import { favoritesStore } from '../store/favoritesStore';
import { pendingScrobbleStore } from '../store/pendingScrobbleStore';
import { getDb } from '../store/persistence/db';
import { profileStore } from '../store/profileStore';
import { themedAlertStore } from '../store/themedAlertStore';
import { mixHexColors } from '../utils/colors';

const AVATAR_SIZE = 128;
const TOP_ARTISTS = 6;
const TOP_TRACKS = 5;
const ARTIST_SIZE = 96;

function TopArtistCard({ id, name, plays }: { id?: string; name: string; plays: number }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const coverArt = useArtistCoverArt(id);
  return (
    <Pressable
      onPress={() => id && router.push(`/artist/${id}`)}
      disabled={!id}
      style={({ pressed }) => [styles.artistCard, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={name}
    >
      <CachedImage coverArtId={coverArt} size={300} style={styles.artistImage} resizeMode="cover" />
      <Text style={[styles.artistName, { color: colors.textPrimary }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.artistPlays, { color: colors.textSecondary }]} numberOfLines={1}>
        {t('profilePlays', { count: plays, formatted: formatCount(plays) })}
      </Text>
    </Pressable>
  );
}

/**
 * The profile page, Spotify style: big picture (tap to change), name, library counts, the
 * app's listening stats with top artists and tracks, and the user's own playlists.
 */
export function ProfileScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const username = authStore((s) => s.username);
  const avatarUri = profileStore((s) => s.avatarUri);
  const favoritesVersion = favoritesStore((s) => s.version);

  /* ---- Library counts and own playlists ---- */
  const [counts, setCounts] = useState({ liked: 0, following: 0 });
  const [playlists, setPlaylists] = useState<LibraryItem[]>([]);
  useEffect(() => {
    const db = getDb();
    if (!db) return;
    let alive = true;
    void Promise.all([
      countStarredSongs(db),
      listStarredArtistIds(db),
      db.getAllAsync<PlaylistListRow>(
        `SELECT ${PLAYLIST_LIST_COLS} FROM playlists WHERE owner = ? ORDER BY changed DESC`,
        [username ?? ''],
      ),
    ])
      .then(([liked, artists, rows]) => {
        if (!alive) return;
        setCounts({ liked, following: artists.size });
        setPlaylists(
          rows.map((r) => {
            const item = playlistListRowToPlaylist(r);
            return { kind: 'playlist' as const, id: item.id, item, recent: 0, added: 0 };
          }),
        );
      })
      .catch(() => { /* counts stay at zero */ });
    return () => { alive = false; };
  }, [username, favoritesVersion]);

  /* ---- Listening stats ---- */
  const totalPlays = completedScrobbleStore((s) => s.stats.totalPlays);
  const totalSeconds = completedScrobbleStore((s) => s.stats.totalListeningSeconds);
  const uniqueArtists = completedScrobbleStore((s) => Object.keys(s.stats.uniqueArtists).length);
  const dayCounts = completedScrobbleStore((s) => s.aggregates.dayCounts);
  const artistCounts = completedScrobbleStore((s) => s.aggregates.artistCounts);
  const topSongs = completedScrobbleStore((s) => s.aggregates.topSongs);
  const pendingScrobbles = pendingScrobbleStore((s) => s.pendingScrobbles);

  const streak = useMemo(() => {
    const days = new Set(Object.keys(dayCounts));
    for (const s of pendingScrobbles) days.add(dateKey(s.time));
    return computeStreaks(Array.from(days)).current;
  }, [dayCounts, pendingScrobbles]);

  const topArtists = useMemo(
    () =>
      Object.entries(artistCounts)
        .sort(([, a], [, b]) => b.count - a.count)
        .slice(0, TOP_ARTISTS)
        .map(([name, v]) => ({ name, id: v.artistId, plays: v.count })),
    [artistCounts],
  );
  const topTracks = useMemo(() => topSongs.slice(0, TOP_TRACKS), [topSongs]);
  const topTrackSongs = useMemo(() => topTracks.map((e) => e.song), [topTracks]);

  const stats = [
    { key: 'plays', value: formatCount(totalPlays), label: t('profileStatPlays') },
    { key: 'minutes', value: formatCount(Math.round(totalSeconds / 60)), label: t('profileStatMinutes') },
    { key: 'artists', value: formatCount(uniqueArtists), label: t('profileStatArtists') },
    { key: 'streak', value: formatCount(streak), label: t('profileStatStreak') },
  ];

  const handlePhoto = () => {
    if (!avatarUri) {
      void pickProfilePicture();
      return;
    }
    themedAlertStore.getState().show(t('profilePhoto'), undefined, [
      { text: t('profileChangePhoto'), onPress: () => { void pickProfilePicture(); } },
      { text: t('profileRemovePhoto'), style: 'destructive', onPress: removeProfilePicture },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const heroColors: [string, string] = [mixHexColors(colors.primary, colors.background, 0.35), colors.background];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={heroColors} style={[styles.hero, { paddingTop: insets.top + 56 }]}>
          <Pressable
            onPress={handlePhoto}
            style={({ pressed }) => [styles.avatarWrap, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('profileChangePhoto')}
          >
            <ProfileAvatar size={AVATAR_SIZE} />
            <View style={[styles.cameraBadge, { backgroundColor: colors.primary, borderColor: colors.background }]}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </Pressable>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {username ?? ''}
          </Text>
          <Text style={[styles.counts, { color: colors.textSecondary }]}>
            {t('profileCounts', {
              playlists: playlists.length,
              liked: formatCount(counts.liked),
              following: counts.following,
            })}
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={handlePhoto}
              style={({ pressed }) => [styles.outlineButton, { borderColor: colors.textSecondary }, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={[styles.outlineLabel, { color: colors.textPrimary }]}>{t('profileEditPhoto')}</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/settings')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('settings')}
            >
              <Ionicons name="settings-outline" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
        </LinearGradient>

        {/* ---- Listening stats ---- */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('profileListeningStats')}</Text>
          <View style={styles.statGrid}>
            {stats.map((s) => (
              <View key={s.key} style={[styles.statCard, { backgroundColor: colors.card }]}>
                <Text style={[styles.statValue, { color: colors.primary }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{s.label}</Text>
              </View>
            ))}
          </View>
          <Pressable
            onPress={() => router.push('/my-listening')}
            style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Text style={[styles.link, { color: colors.primary }]}>{t('profileSeeAllStats')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
          </Pressable>
        </View>

        {topArtists.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('profileTopArtists')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.artistRow}>
              {topArtists.map((a) => (
                <TopArtistCard key={a.name} id={a.id} name={a.name} plays={a.plays} />
              ))}
            </ScrollView>
          </View>
        )}

        {topTracks.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('profileTopTracks')}</Text>
            {topTracks.map((entry, index) => (
              <PopularTrackRow
                key={entry.song.id}
                song={entry.song}
                rank={index + 1}
                playsLabel={t('profilePlays', { count: entry.count, formatted: formatCount(entry.count) })}
                songs={topTrackSongs}
              />
            ))}
          </View>
        )}

        {playlists.length > 0 && (
          <View style={styles.playlistSection}>
            <Text style={[styles.sectionTitle, styles.padded, { color: colors.textPrimary }]}>{t('profilePlaylists')}</Text>
            {playlists.map((p) => (
              <LibraryItemRow key={p.id} entry={p} />
            ))}
          </View>
        )}
      </ScrollView>
      <BottomChrome withSafeAreaPadding />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  avatarWrap: {
    marginBottom: 14,
  },
  cameraBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 30,
    fontWeight: '900',
  },
  counts: {
    fontSize: 13,
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 16,
  },
  outlineButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  outlineLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  iconButton: {
    padding: 4,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 24,
  },
  playlistSection: {
    marginTop: 24,
  },
  padded: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 10,
    padding: 14,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 13,
    marginTop: 2,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
  },
  link: {
    fontSize: 14,
    fontWeight: '700',
  },
  artistRow: {
    gap: 14,
  },
  artistCard: {
    width: ARTIST_SIZE,
  },
  artistImage: {
    width: ARTIST_SIZE,
    height: ARTIST_SIZE,
    borderRadius: ARTIST_SIZE / 2,
  },
  artistName: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  artistPlays: {
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
});
