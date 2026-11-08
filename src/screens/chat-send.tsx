import { useLocalSearchParams, useRouter } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChatAvatar } from '../components/ChatAvatar';
import { ChatShareCard } from '../components/ChatShareCard';
import { GradientBackground } from '../components/GradientBackground';
import { useTheme } from '../hooks/useTheme';
import { fetchContacts, sendChatMessage, type ChatUser } from '../services/chatService';
import { themedAlertStore } from '../store/themedAlertStore';
import { parseChatShareParam } from '../utils/chatShare';

/** Pick who gets a shared song/album/artist/playlist (with an optional note), then open that chat. */
export function ChatSendScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const params = useLocalSearchParams<{ share?: string }>();
  const share = useMemo(() => parseChatShareParam(params.share), [params.share]);
  const [users, setUsers] = useState<ChatUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState('');
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    void fetchContacts().then((data) => {
      if (data) setUsers(data);
      setFailed(!data);
    });
  }, []);

  const sendTo = async (user: ChatUser) => {
    if (!share || sendingTo) return;
    setSendingTo(user.username);
    const sent = await sendChatMessage(user.username, { share, text: note.trim() || undefined });
    setSendingTo(null);
    if (sent) {
      router.replace({ pathname: '/conversation/[user]', params: { user: user.username, name: user.name } });
    } else {
      themedAlertStore.getState().show(t('chatSendFailed'), undefined, [{ text: t('ok') }]);
    }
  };

  return (
    <GradientBackground scrollable style={styles.container}>
      <FlatList
        data={users ?? []}
        keyExtractor={(u) => u.username}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: headerHeight + 8, paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={styles.header}>
            {share && <ChatShareCard share={share} />}
            <TextInput
              style={[styles.note, { backgroundColor: colors.inputBg, color: colors.textPrimary }]}
              value={note}
              onChangeText={setNote}
              placeholder={t('chatAddNote')}
              placeholderTextColor={colors.textSecondary}
              maxLength={4000}
            />
            <Text style={[styles.section, { color: colors.textPrimary }]}>{t('chatSendTo')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => void sendTo(item)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <ChatAvatar name={item.name} username={item.username} size={44} />
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.name}
            </Text>
            {sendingTo === item.username && <ActivityIndicator color={colors.textSecondary} />}
          </Pressable>
        )}
        ListEmptyComponent={
          users === null && !failed ? (
            <ActivityIndicator style={styles.loading} color={colors.textSecondary} />
          ) : (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              {failed ? t('chatUnavailable') : t('chatNoContacts')}
            </Text>
          )
        }
      />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    gap: 12,
  },
  note: {
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  section: {
    fontSize: 18,
    fontWeight: '800',
    paddingTop: 8,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pressed: {
    opacity: 0.6,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  loading: {
    marginTop: 40,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 32,
  },
});
