import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useRouter } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomChrome } from '../components/BottomChrome';
import { ChatAvatar } from '../components/ChatAvatar';
import { GradientBackground } from '../components/GradientBackground';
import { useTheme } from '../hooks/useTheme';
import { addContact, fetchChatUsers, removeContact, type ChatUser } from '../services/chatService';
import { themedAlertStore } from '../store/themedAlertStore';

/**
 * Manage chat contacts: your contacts on top (tap to talk, remove), then everyone else on the
 * server (add). Contacts are stored on the chat server, so they follow the account.
 */
export function ChatContactsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const [users, setUsers] = useState<ChatUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await fetchChatUsers();
    if (data) setUsers(data);
    setFailed(!data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(
    async (user: ChatUser) => {
      setBusy(user.username);
      const ok = user.contact ? await removeContact(user.username) : await addContact(user.username);
      setBusy(null);
      if (ok) {
        setUsers((cur) => (cur ?? []).map((u) => (u.username === user.username ? { ...u, contact: !u.contact } : u)));
      } else {
        themedAlertStore.getState().show(t('chatUnavailable'), undefined, [{ text: t('ok') }]);
      }
    },
    [t],
  );

  const confirmRemove = useCallback(
    (user: ChatUser) => {
      themedAlertStore.getState().show(t('chatRemoveContactTitle', { name: user.name }), undefined, [
        { text: t('cancel'), style: 'cancel' },
        { text: t('chatRemoveContact'), style: 'destructive', onPress: () => void toggle(user) },
      ]);
    },
    [t, toggle],
  );

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (users ?? []).filter(
      (u) => !q || u.name.toLowerCase().includes(q) || u.username.includes(q),
    );
    return [
      { key: 'contacts', title: t('chatYourContacts'), data: list.filter((u) => u.contact) },
      { key: 'others', title: t('chatServerUsers'), data: list.filter((u) => !u.contact) },
    ].filter((s) => s.data.length > 0);
  }, [users, query, t]);

  const openConversation = (user: ChatUser) =>
    router.push({ pathname: '/conversation/[user]', params: { user: user.username, name: user.name } });

  const renderItem = ({ item }: { item: ChatUser }) => (
    <Pressable
      onPress={() => openConversation(item)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <ChatAvatar name={item.name} size={44} />
      <View style={styles.rowText}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {item.name}
        </Text>
        {item.name.toLowerCase() !== item.username && (
          <Text style={[styles.username, { color: colors.textSecondary }]} numberOfLines={1}>
            @{item.username}
          </Text>
        )}
      </View>
      {busy === item.username ? (
        <ActivityIndicator color={colors.textSecondary} />
      ) : item.contact ? (
        <Pressable
          onPress={() => confirmRemove(item)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('chatRemoveContact')}
        >
          <Ionicons name="person-remove-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      ) : (
        <Pressable
          onPress={() => void toggle(item)}
          style={[styles.addButton, { borderColor: colors.textSecondary }]}
          accessibilityRole="button"
        >
          <Text style={[styles.addText, { color: colors.textPrimary }]}>{t('chatAddContact')}</Text>
        </Pressable>
      )}
    </Pressable>
  );

  return (
    <GradientBackground style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(u) => u.username}
        renderItem={renderItem}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: headerHeight + 8, paddingBottom: 120 }}
        ListHeaderComponent={
          <View style={[styles.search, { backgroundColor: colors.inputBg }]}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              value={query}
              onChangeText={setQuery}
              placeholder={t('chatSearchPeople')}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.section, { color: colors.textPrimary }]}>{section.title}</Text>
        )}
        ListEmptyComponent={
          users === null && !failed ? (
            <ActivityIndicator style={styles.loading} color={colors.textSecondary} />
          ) : (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              {failed ? t('chatUnavailable') : t('chatNoPeople')}
            </Text>
          )
        }
      />
      <BottomChrome withSafeAreaPadding />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    height: 38,
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  section: {
    fontSize: 18,
    fontWeight: '800',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
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
  rowText: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
  },
  username: {
    fontSize: 13,
    marginTop: 1,
  },
  addButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  addText: {
    fontSize: 13,
    fontWeight: '700',
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
