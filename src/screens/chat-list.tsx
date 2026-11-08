import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useNavigation, useRouter } from 'expo-router';
import { HeaderHeightContext, useIsFocused } from 'expo-router/react-navigation';
import { useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { BottomChrome } from '../components/BottomChrome';
import { ChatAvatar } from '../components/ChatAvatar';
import { DiscoverConnectHint } from '../components/DiscoverConnectHint';
import { GradientBackground } from '../components/GradientBackground';
import { useTheme } from '../hooks/useTheme';
import { fetchConversations, type ChatConversation } from '../services/chatService';
import { chatStore } from '../store/chatStore';
import { discoverSettingsStore } from '../store/discoverSettingsStore';
import { formatChatTime } from '../utils/chatTime';

const POLL_MS = 10_000;

/** Conversations with other users of the server, newest first; the header opens Contacts. */
export function ChatListScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const focused = useIsFocused();
  const configured = discoverSettingsStore((s) => !!s.baseUrl);
  const [items, setItems] = useState<ChatConversation[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await fetchConversations();
    if (data) {
      setItems(data);
      setFailed(false);
      void chatStore.getState().refreshUnread();
    } else {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!focused || !configured) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [focused, configured, load]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => router.push('/chat-contacts')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('chatContacts')}
        >
          <Ionicons name="people-outline" size={24} color={colors.textPrimary} />
        </Pressable>
      ),
    });
  }, [navigation, router, colors.textPrimary, t]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!configured) {
    return (
      <GradientBackground scrollable style={styles.container}>
        <View style={{ paddingTop: headerHeight }}>
          <DiscoverConnectHint />
        </View>
      </GradientBackground>
    );
  }

  const renderItem = ({ item }: { item: ChatConversation }) => {
    const preview = item.last.text || (item.last.share ? `🎵 ${item.last.share.title ?? t('chatSharedItem')}` : '');
    return (
      <Pressable
        onPress={() => router.push({ pathname: '/conversation/[user]', params: { user: item.username, name: item.name } })}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <ChatAvatar name={item.name} size={52} />
        <View style={styles.rowText}>
          <View style={styles.rowTop}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.time, { color: item.unread ? colors.primary : colors.textSecondary }]}>
              {formatChatTime(item.last.sentAt)}
            </Text>
          </View>
          <View style={styles.rowTop}>
            <Text
              style={[
                styles.preview,
                { color: item.unread ? colors.textPrimary : colors.textSecondary },
                item.unread > 0 && styles.previewUnread,
              ]}
              numberOfLines={1}
            >
              {item.last.to === item.username ? `${t('chatYou')}: ${preview}` : preview}
            </Text>
            {item.unread > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={styles.badgeText}>{item.unread}</Text>
              </View>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <GradientBackground scrollable style={styles.container}>
      {items === null && !failed ? (
        <View style={[styles.center, { paddingTop: headerHeight }]}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={(c) => c.username}
          renderItem={renderItem}
          contentContainerStyle={{ paddingTop: headerHeight + 8, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} progressViewOffset={headerHeight} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={56} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {failed ? t('chatUnavailable') : t('chatEmptyTitle')}
              </Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {failed ? t('chatUnavailableHint') : t('chatEmptyHint')}
              </Text>
              {!failed && (
                <Pressable
                  onPress={() => router.push('/chat-contacts')}
                  style={[styles.emptyButton, { backgroundColor: colors.primary }]}
                  accessibilityRole="button"
                >
                  <Text style={styles.emptyButtonText}>{t('chatContacts')}</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}
      <BottomChrome withSafeAreaPadding />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  pressed: {
    opacity: 0.6,
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  time: {
    fontSize: 12,
  },
  preview: {
    flex: 1,
    fontSize: 14,
  },
  previewUnread: {
    fontWeight: '600',
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: 12,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
