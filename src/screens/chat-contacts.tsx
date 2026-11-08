import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useRouter } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomChrome } from '../components/BottomChrome';
import { ChatAvatar } from '../components/ChatAvatar';
import { GradientBackground } from '../components/GradientBackground';
import { useTheme } from '../hooks/useTheme';
import { addContact, fetchContacts, lookupChatUser, removeContact, type ChatUser } from '../services/chatService';
import { themedAlertStore } from '../store/themedAlertStore';

type Lookup = { state: 'idle' } | { state: 'searching' } | { state: 'notFound' } | { state: 'found'; user: ChatUser };

/**
 * Your chat contacts (tap to talk, remove). The server's accounts are never listed: to add
 * someone you type their exact Navidrome username. Contacts are stored on the chat server.
 */
export function ChatContactsScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const [contacts, setContacts] = useState<ChatUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await fetchContacts();
    if (data) setContacts(data);
    setFailed(!data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const search = useCallback(async () => {
    const username = query.trim();
    if (!username) return;
    setLookup({ state: 'searching' });
    const user = await lookupChatUser(username);
    setLookup(user ? { state: 'found', user } : { state: 'notFound' });
  }, [query]);

  const add = useCallback(
    async (user: ChatUser) => {
      setBusy(user.username);
      const ok = await addContact(user.username);
      setBusy(null);
      if (ok) {
        setQuery('');
        setLookup({ state: 'idle' });
        await load();
      } else {
        themedAlertStore.getState().show(t('chatUnavailable'), undefined, [{ text: t('ok') }]);
      }
    },
    [load, t],
  );

  const confirmRemove = useCallback(
    (user: ChatUser) => {
      themedAlertStore.getState().show(t('chatRemoveContactTitle', { name: user.name }), undefined, [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('chatRemoveContact'),
          style: 'destructive',
          onPress: () => {
            void removeContact(user.username).then((ok) => {
              if (ok) setContacts((cur) => (cur ?? []).filter((c) => c.username !== user.username));
            });
          },
        },
      ]);
    },
    [t],
  );

  const openConversation = (user: ChatUser) =>
    router.push({ pathname: '/conversation/[user]', params: { user: user.username, name: user.name } });

  const userRow = (user: ChatUser, trailing: React.ReactNode) => (
    <Pressable
      onPress={() => openConversation(user)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <ChatAvatar name={user.name} size={44} />
      <View style={styles.rowText}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {user.name}
        </Text>
        <Text style={[styles.username, { color: colors.textSecondary }]} numberOfLines={1}>
          @{user.username}
        </Text>
      </View>
      {busy === user.username ? <ActivityIndicator color={colors.textSecondary} /> : trailing}
    </Pressable>
  );

  const header = (
    <View>
      <View style={[styles.search, { backgroundColor: colors.inputBg }]}>
        <Ionicons name="person-add-outline" size={18} color={colors.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setLookup({ state: 'idle' });
          }}
          onSubmitEditing={() => void search()}
          returnKeyType="search"
          placeholder={t('chatAddByUsername')}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.trim().length > 0 && (
          <Pressable onPress={() => void search()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('search')}>
            <Ionicons name="search" size={20} color={colors.textPrimary} />
          </Pressable>
        )}
      </View>
      {lookup.state === 'searching' && <ActivityIndicator style={styles.lookupStatus} color={colors.textSecondary} />}
      {lookup.state === 'notFound' && (
        <Text style={[styles.lookupStatus, styles.hint, { color: colors.textSecondary }]}>
          {t('chatUserNotFound', { username: query.trim() })}
        </Text>
      )}
      {lookup.state === 'found' &&
        userRow(
          lookup.user,
          lookup.user.contact ? (
            <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('chatAlreadyContact')}</Text>
          ) : (
            <Pressable
              onPress={() => void add(lookup.user)}
              style={[styles.addButton, { borderColor: colors.textSecondary }]}
              accessibilityRole="button"
            >
              <Text style={[styles.addText, { color: colors.textPrimary }]}>{t('chatAddContact')}</Text>
            </Pressable>
          ),
        )}
      <Text style={[styles.section, { color: colors.textPrimary }]}>{t('chatYourContacts')}</Text>
    </View>
  );

  return (
    <GradientBackground scrollable style={styles.container}>
      <FlatList
        data={contacts ?? []}
        keyExtractor={(u) => u.username}
        renderItem={({ item }) =>
          userRow(
            item,
            <Pressable
              onPress={() => confirmRemove(item)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('chatRemoveContact')}
            >
              <Ionicons name="person-remove-outline" size={22} color={colors.textSecondary} />
            </Pressable>,
          )
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: headerHeight + 8, paddingBottom: 120 }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          contacts === null && !failed ? (
            <ActivityIndicator style={styles.loading} color={colors.textSecondary} />
          ) : (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              {failed ? t('chatUnavailable') : t('chatNoContacts')}
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
    gap: 8,
    marginHorizontal: 16,
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  lookupStatus: {
    marginTop: 12,
    paddingHorizontal: 16,
  },
  hint: {
    fontSize: 13,
  },
  section: {
    fontSize: 18,
    fontWeight: '800',
    paddingHorizontal: 16,
    paddingTop: 20,
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
    marginTop: 24,
    paddingHorizontal: 32,
  },
});
