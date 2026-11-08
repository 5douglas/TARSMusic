import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomChrome } from '../components/BottomChrome';
import { GradientBackground } from '../components/GradientBackground';
import { useTheme } from '../hooks/useTheme';
import { connectWithLogin, disconnectDiscover, enableAutoConnect } from '../services/discoverAuthService';
import { discoverSettingsStore } from '../store/discoverSettingsStore';
import { themedAlertStore } from '../store/themedAlertStore';

/**
 * Connection to the navidrome-discover backend that feeds Discover content and downloads.
 * Accounts of the TARSMusic server connect on their own with their Navidrome login; another
 * backend takes an address plus either a token or, with the token left blank, the login.
 */
export function SettingsDiscoverScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const baseUrl = discoverSettingsStore((s) => s.baseUrl);
  const token = discoverSettingsStore((s) => s.token);
  const [url, setUrl] = useState(baseUrl ?? '');
  const [newToken, setNewToken] = useState('');
  const lastfmApiKey = discoverSettingsStore((s) => s.lastfmApiKey);
  const [newLastfmKey, setNewLastfmKey] = useState(lastfmApiKey ?? '');
  const mode = discoverSettingsStore((s) => s.mode);
  const connected = !!baseUrl && !!token;
  const [busy, setBusy] = useState(false);
  const canSave = !!url.trim() && !busy;

  const handleDisconnect = () => {
    themedAlertStore.getState().show(t('discoverEditConnection'), t('discoverEditConnectionBody'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('ok'), onPress: () => disconnectDiscover() },
    ]);
  };

  const handleAuto = async () => {
    setBusy(true);
    const ok = await enableAutoConnect();
    setBusy(false);
    if (!ok) themedAlertStore.getState().show(t('discoverConnectAuto'), t('discoverAutoFailed'), [{ text: t('ok') }]);
  };

  const handleSave = async () => {
    if (newToken.trim()) {
      discoverSettingsStore.getState().setConnection(url, newToken);
      return;
    }
    setBusy(true);
    const ok = await connectWithLogin(url);
    setBusy(false);
    if (!ok) themedAlertStore.getState().show(t('discoverConnectTitle'), t('discoverLoginFailed'), [{ text: t('ok') }]);
  };

  const inputStyle = [styles.input, { color: colors.textPrimary, backgroundColor: colors.inputBg }];
  return (
    <GradientBackground scrollable>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: headerHeight + 16 }]}>
        {connected ? (
          <View style={styles.gap}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{t('discoverConnected')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{baseUrl}</Text>
            {mode === 'login' ? (
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('discoverLoginMode')}</Text>
            ) : null}
            <Pressable
              onPress={handleDisconnect}
              style={({ pressed }) => [styles.button, { backgroundColor: colors.inputBg }, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonLabel, { color: colors.red }]}>{t('discoverEditConnection')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.gap}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{t('discoverConnectTitle')}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('discoverConnectHint')}</Text>
            <Pressable
              onPress={handleAuto}
              disabled={busy}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.primary },
                (pressed || busy) && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonLabel, { color: '#fff' }]}>{t('discoverConnectAuto')}</Text>
            </Pressable>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('discoverManualHint')}</Text>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="https://discover.example.com"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={inputStyle}
              accessibilityLabel={t('discoverServerUrl')}
            />
            <TextInput
              value={newToken}
              onChangeText={setNewToken}
              placeholder={t('discoverTokenOptional')}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={inputStyle}
              accessibilityLabel={t('discoverToken')}
            />
            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.inputBg },
                (pressed || !canSave) && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.buttonLabel, { color: colors.textPrimary }]}>{t('save')}</Text>
            </Pressable>
          </View>
        )}
        <View style={[styles.gap, styles.section]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('lastfmStatsTitle')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('lastfmStatsHint')}</Text>
          <TextInput
            value={newLastfmKey}
            onChangeText={setNewLastfmKey}
            placeholder={t('lastfmApiKey')}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            style={inputStyle}
            accessibilityLabel={t('lastfmApiKey')}
          />
          <Pressable
            onPress={() => discoverSettingsStore.getState().setLastfmApiKey(newLastfmKey)}
            disabled={newLastfmKey.trim() === (lastfmApiKey ?? '')}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.primary },
              (pressed || newLastfmKey.trim() === (lastfmApiKey ?? '')) && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonLabel, { color: '#fff' }]}>{t('save')}</Text>
          </Pressable>
        </View>
      </ScrollView>
      <BottomChrome withSafeAreaPadding />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  gap: {
    gap: 12,
  },
  section: {
    marginTop: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
  },
  input: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  button: {
    borderRadius: 22,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.5,
  },
});
