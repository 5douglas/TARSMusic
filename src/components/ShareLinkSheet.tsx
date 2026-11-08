import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useCallback, useRef, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from './BottomSheet';
import { CachedImage } from './CachedImage';
import { useTheme } from '../hooks/useTheme';
import { canUserShare } from '../services/serverCapabilityService';
import { copyShareLink, shareItemLink } from '../services/shareLinkService';
import { createShareStore } from '../store/createShareStore';
import { discoverSettingsStore } from '../store/discoverSettingsStore';
import { offlineModeStore } from '../store/offlineModeStore';
import { shareSheetStore, type ShareSheetItem } from '../store/shareSheetStore';
import { openChatShare } from '../utils/chatShare';

/**
 * "Compartilhar", like Spotify's share sheet: send to someone in the TARSMusic chat,
 * copy the link, share it to another app, or make a public Navidrome link for people
 * without the app.
 */
export function ShareLinkSheet() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const visible = shareSheetStore((s) => s.visible);
  const item = shareSheetStore((s) => s.item);
  const offline = offlineModeStore((s) => s.offlineMode);
  const discoverUrl = discoverSettingsStore((s) => s.baseUrl);
  // What to do once the sheet has finished closing (another sheet or a screen opens next).
  const afterClose = useRef<(() => void) | null>(null);

  const close = useCallback((then?: () => void) => {
    afterClose.current = then ?? null;
    shareSheetStore.getState().hide();
  }, []);

  const handleCloseComplete = useCallback(() => {
    const action = afterClose.current;
    afterClose.current = null;
    action?.();
  }, []);

  if (!item) return null;

  const run = (action: (it: ShareSheetItem) => void) => () => close(() => action(item));

  const showChat = !offline && !!discoverUrl;
  const showOtherApps = Platform.OS !== 'web';
  const showPublic = !offline && item.kind !== 'artist' && canUserShare();

  return (
    <BottomSheet visible={visible} onClose={() => close()} onCloseComplete={handleCloseComplete}>
      <View style={styles.header}>
        {item.coverArt ? (
          <CachedImage
            coverArtId={item.coverArt}
            size={150}
            style={[styles.cover, item.kind === 'artist' && styles.coverRound]}
            resizeMode="cover"
          />
        ) : null}
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.artist ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.artist}
            </Text>
          ) : null}
        </View>
      </View>

      {showChat && (
        <Row
          icon="chatbubble-ellipses-outline"
          label={t('shareSendInTarsChat')}
          onPress={run((it) =>
            openChatShare({
              kind: it.kind,
              id: it.id,
              title: it.name,
              subtitle: it.artist ?? undefined,
              coverArt: it.coverArt,
            }),
          )}
        />
      )}
      <Row icon="link-outline" label={t('shareCopyLink')} onPress={run((it) => void copyShareLink(it))} />
      {showOtherApps && (
        <Row icon="share-social-outline" label={t('shareOtherApps')} onPress={run((it) => void shareItemLink(it))} />
      )}
      {showPublic && (
        <Row
          icon="globe-outline"
          label={t('sharePublicLink')}
          onPress={run((it) => {
            const store = createShareStore.getState();
            if (it.kind === 'song') store.showSong(it.id, it.name, it.artist ?? undefined, it.coverArt);
            else if (it.kind === 'album') store.showAlbum(it.id, it.name, it.artist ?? undefined, it.coverArt);
            else if (it.kind === 'playlist') store.showPlaylist(it.id, it.name, it.coverArt);
          })}
        />
      )}
    </BottomSheet>
  );
}

function Row({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }): ReactNode {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
    >
      <Ionicons name={icon as never} size={22} color={colors.textPrimary} style={styles.optionIcon} />
      <Text style={[styles.optionLabel, { color: colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginBottom: 12 },
  cover: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: 'rgba(128,128,128,0.12)',
    marginRight: 12,
  },
  coverRound: { borderRadius: 24 },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  subtitle: { fontSize: 14 },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4 },
  pressed: { opacity: 0.6 },
  optionIcon: { width: 28 },
  optionLabel: { fontSize: 16, fontWeight: '500', marginLeft: 8 },
});
