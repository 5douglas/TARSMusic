import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { HeaderHeightContext, useIsFocused } from 'expo-router/react-navigation';
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatShareCard } from '../components/ChatShareCard';
import { GradientBackground } from '../components/GradientBackground';
import { ChatAvatar } from '../components/ChatAvatar';
import { useTheme } from '../hooks/useTheme';
import {
  deleteChatMessage,
  fetchMessages,
  markConversationRead,
  sendChatMessage,
  type ChatMessage,
} from '../services/chatService';
import { authStore } from '../store/authStore';
import { chatStore } from '../store/chatStore';
import { themedAlertStore } from '../store/themedAlertStore';
import { formatChatClock, formatChatDay, isSameChatDay } from '../utils/chatTime';

const POLL_MS = 3_000;

/** Merges fetched messages into the list (newest first), replacing ones with the same id. */
function merge(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => b.id - a.id);
}

/** One conversation: bubbles newest at the bottom, new messages checked every 3 s while open. */
export function ChatConversationScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const focused = useIsFocused();
  const params = useLocalSearchParams<{ user: string; name?: string }>();
  const peer = String(params.user ?? '').toLowerCase();
  const me = (authStore((s) => s.username) ?? '').toLowerCase();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const loadingOlder = useRef(false);
  const newest = useRef(0);

  useLayoutEffect(() => {
    const title = params.name || peer;
    navigation.setOptions({
      title,
      headerTitle: () => (
        <View style={styles.headerTitle}>
          <ChatAvatar name={title} username={peer} size={32} />
          <Text style={[styles.headerName, { color: colors.textPrimary }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
      ),
    });
  }, [navigation, params.name, peer, colors.textPrimary]);

  // While this conversation is on screen its new messages don't pop the chat banner.
  useEffect(() => {
    if (!focused) return;
    chatStore.getState().setActivePeer(peer);
    chatStore.getState().hideBanner();
    return () => {
      if (chatStore.getState().activePeer === peer) chatStore.getState().setActivePeer(null);
    };
  }, [focused, peer]);

  const markRead = useCallback(
    (list: ChatMessage[]) => {
      if (list.some((m) => m.from === peer && m.readAt === null)) {
        void markConversationRead(peer).then(() => chatStore.getState().refreshUnread());
      }
    },
    [peer],
  );

  // First page, then poll for newer messages while the screen is focused.
  useEffect(() => {
    if (!focused || !peer) return;
    let cancelled = false;
    const poll = async () => {
      const data = await fetchMessages(peer, newest.current ? { after: newest.current } : {});
      if (cancelled) return;
      if (!data) {
        if (!newest.current) setFailed(true);
        return;
      }
      setFailed(false);
      if (data.length) newest.current = Math.max(newest.current, ...data.map((m) => m.id));
      setMessages((cur) => merge(cur ?? [], data));
      markRead(data);
    };
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [focused, peer, markRead]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder.current || !hasOlder || !messages?.length) return;
    loadingOlder.current = true;
    const oldest = messages[messages.length - 1].id;
    const data = await fetchMessages(peer, { before: oldest });
    if (data) {
      if (data.length === 0) setHasOlder(false);
      setMessages((cur) => merge(cur ?? [], data));
    }
    loadingOlder.current = false;
  }, [hasOlder, messages, peer]);

  const send = useCallback(async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const sent = await sendChatMessage(peer, { text: body });
    setSending(false);
    if (sent) {
      setText('');
      newest.current = Math.max(newest.current, sent.id);
      setMessages((cur) => merge(cur ?? [], [sent]));
    } else {
      themedAlertStore.getState().show(t('chatSendFailed'), undefined, [{ text: t('ok') }]);
    }
  }, [text, sending, peer, t]);

  const confirmDelete = useCallback(
    (message: ChatMessage) => {
      themedAlertStore.getState().show(t('chatDeleteTitle'), undefined, [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => {
            void deleteChatMessage(message.id).then((ok) => {
              if (ok) setMessages((cur) => (cur ?? []).filter((m) => m.id !== message.id));
            });
          },
        },
      ]);
    },
    [t],
  );

  const renderItem = ({ item, index }: { item: ChatMessage; index: number }) => {
    const mine = item.from === me;
    // The list is inverted: index + 1 is the message shown above this one.
    const above = messages?.[index + 1];
    const showDay = !above || !isSameChatDay(above.sentAt, item.sentAt);
    return (
      <View>
        {showDay && (
          <Text style={[styles.day, { color: colors.textSecondary }]}>
            {formatChatDay(item.sentAt)}
          </Text>
        )}
        <Pressable
          onLongPress={mine ? () => confirmDelete(item) : undefined}
          style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}
        >
          <View
            style={[
              styles.bubble,
              mine
                ? [styles.bubbleMine, { backgroundColor: colors.primary }]
                : [styles.bubbleTheirs, { backgroundColor: colors.card }],
            ]}
          >
            {item.share && <ChatShareCard share={item.share} />}
            {!!item.text && (
              <Text style={[styles.text, { color: mine ? '#fff' : colors.textPrimary }]}>{item.text}</Text>
            )}
            <View style={styles.meta}>
              <Text style={[styles.clock, { color: mine ? 'rgba(255,255,255,0.75)' : colors.textSecondary }]}>
                {formatChatClock(item.sentAt)}
              </Text>
              {mine && (
                <Ionicons
                  name={item.readAt ? 'checkmark-done' : 'checkmark'}
                  size={14}
                  color="rgba(255,255,255,0.85)"
                />
              )}
            </View>
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <GradientBackground scrollable style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        // keyboard-controller's view also lifts the input on Android edge-to-edge, where
        // the window no longer resizes for the keyboard.
        behavior="padding"
      >
        {messages !== null && messages.length === 0 ? (
          <View style={[styles.center, { paddingTop: headerHeight }]}>
            <Text style={{ color: colors.textSecondary }}>{t('chatSayHi')}</Text>
          </View>
        ) : messages === null ? (
          <View style={[styles.center, { paddingTop: headerHeight }]}>
            {failed ? (
              <Text style={{ color: colors.textSecondary }}>{t('chatUnavailable')}</Text>
            ) : (
              <ActivityIndicator color={colors.textSecondary} />
            )}
          </View>
        ) : (
          <FlatList
            inverted
            data={messages}
            keyExtractor={(m) => String(m.id)}
            renderItem={renderItem}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            contentContainerStyle={styles.listContent}
            ListFooterComponent={<View style={{ height: headerHeight }} />}
          />
        )}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8), borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.inputBg, color: colors.textPrimary }]}
            value={text}
            onChangeText={setText}
            placeholder={t('chatMessagePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={4000}
            onKeyPress={
              Platform.OS === 'web'
                ? (e) => {
                    // Windows: Enter sends, Shift+Enter breaks the line.
                    const ev = e as unknown as { nativeEvent: { key: string; shiftKey?: boolean }; preventDefault: () => void };
                    if (ev.nativeEvent.key === 'Enter' && !ev.nativeEvent.shiftKey) {
                      ev.preventDefault();
                      void send();
                    }
                  }
                : undefined
            }
          />
          <Pressable
            onPress={() => void send()}
            disabled={!text.trim() || sending}
            style={[styles.sendButton, { backgroundColor: colors.primary, opacity: !text.trim() || sending ? 0.5 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={t('chatSend')}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 260,
  },
  headerName: {
    fontSize: 17,
    fontWeight: '700',
    flexShrink: 1,
  },
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  day: {
    alignSelf: 'center',
    fontSize: 12,
    marginVertical: 10,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 2,
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowTheirs: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  bubbleMine: {
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 15,
    lineHeight: 20,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 4,
  },
  clock: {
    fontSize: 11,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
