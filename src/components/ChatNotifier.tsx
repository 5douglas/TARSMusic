import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatAvatar } from './ChatAvatar';
import { useTheme } from '../hooks/useTheme';
import { fetchConversations, isChatConfigured, type ChatConversation } from '../services/chatService';
import { authStore } from '../store/authStore';
import { chatStore } from '../store/chatStore';
import { discoverSettingsStore } from '../store/discoverSettingsStore';
import { notificationAsync } from '../utils/haptics';

const POLL_MS = 15_000;
const BANNER_MS = 5_000;

/** The last message of a conversation as one preview line. */
export function chatPreview(c: ChatConversation, sharedLabel: string): string {
  return c.last.text || (c.last.share ? `🎵 ${c.last.share.title ?? sharedLabel}` : '');
}

/**
 * Checks the chat every 15 s while the app is open: keeps the unread badge current and, when
 * a new message arrives from someone whose conversation isn't on screen, drops a banner from
 * the top (tap opens the conversation).
 */
export function ChatNotifier() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const configured = discoverSettingsStore((s) => !!s.baseUrl);
  const loggedIn = authStore((s) => s.isLoggedIn);
  const banner = chatStore((s) => s.banner);
  // Newest message id seen per peer; null until the first check, which only records.
  const seen = useRef<Map<string, number> | null>(null);

  useEffect(() => {
    if (!configured || !loggedIn) return;
    let cancelled = false;
    const tick = async () => {
      if (AppState.currentState !== 'active' || !isChatConfigured()) return;
      const list = await fetchConversations();
      if (cancelled || !list) return;
      chatStore.getState().setUnread(list.reduce((sum, c) => sum + c.unread, 0));
      const known = seen.current;
      const next = new Map(list.map((c) => [c.username, c.last.id]));
      seen.current = next;
      if (!known) return;
      const { activePeer } = chatStore.getState();
      const fresh = list.find(
        (c) =>
          c.last.from === c.username &&
          c.unread > 0 &&
          c.last.id > (known.get(c.username) ?? 0) &&
          c.username !== activePeer,
      );
      if (fresh) {
        chatStore.getState().showBanner(fresh);
        void notificationAsync();
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void tick();
    });
    return () => {
      cancelled = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [configured, loggedIn]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => chatStore.getState().hideBanner(), BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner]);

  if (!banner) return null;

  return (
    <Animated.View
      entering={SlideInUp}
      exiting={SlideOutUp}
      style={[styles.wrap, { top: insets.top + 8 }]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={() => {
          chatStore.getState().hideBanner();
          router.push({ pathname: '/conversation/[user]', params: { user: banner.username, name: banner.name } });
        }}
        style={[styles.banner, { backgroundColor: colors.card, borderColor: colors.border }]}
        accessibilityRole="button"
      >
        <ChatAvatar name={banner.name} size={40} />
        <View style={styles.text}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {banner.name}
          </Text>
          <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={2}>
            {chatPreview(banner, t('chatSharedItem'))}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  banner: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  text: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
  },
  preview: {
    fontSize: 14,
    marginTop: 2,
  },
});
