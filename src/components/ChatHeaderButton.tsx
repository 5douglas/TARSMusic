import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { isChatConfigured } from '../services/chatService';
import { chatStore } from '../store/chatStore';
import { discoverSettingsStore } from '../store/discoverSettingsStore';

const POLL_MS = 30_000;

/** Opens the chat; a badge shows unread messages, checked every 30 s while the app is open. */
export function ChatHeaderButton() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const unread = chatStore((s) => s.unread);
  const configured = discoverSettingsStore((s) => !!s.baseUrl);

  useEffect(() => {
    if (!configured) return;
    const tick = () => {
      if (AppState.currentState === 'active' && isChatConfigured()) void chatStore.getState().refreshUnread();
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [configured]);

  if (!configured) return null;

  return (
    <Pressable
      onPress={() => router.push('/chat')}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('chatTitle')}
    >
      <Ionicons name="chatbubble-ellipses-outline" size={26} color={colors.textPrimary} />
      {unread > 0 && (
        <View style={[styles.badge, { backgroundColor: colors.primary }]}>
          <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
