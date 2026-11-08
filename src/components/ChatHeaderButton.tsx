import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { chatStore } from '../store/chatStore';
import { discoverSettingsStore } from '../store/discoverSettingsStore';

/** Opens the chat; the badge shows unread messages (kept current by ChatNotifier). */
export function ChatHeaderButton() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const unread = chatStore((s) => s.unread);
  const configured = discoverSettingsStore((s) => !!s.baseUrl);


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
