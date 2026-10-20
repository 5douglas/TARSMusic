import Ionicons from "@react-native-vector-icons/ionicons/static";
import { useIsFocused } from "expo-router/react-navigation";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { DiscoverDownloads } from '../components/DiscoverDownloads';
import { DiscoverHomeView } from '../components/DiscoverHomeView';
import { DiscoverSearch } from '../components/DiscoverSearch';
import { useTheme } from '../hooks/useTheme';
import { stopDiscoverPreview } from '../services/discoverPreviewService';
import { discoverPreviewStore } from '../store/discoverPreviewStore';
import { discoverSettingsStore } from '../store/discoverSettingsStore';
import { searchStore } from '../store/searchStore';
import { themedAlertStore } from '../store/themedAlertStore';

type DiscoverPanel = 'explore' | 'search' | 'downloads';

const PANELS = [
  { key: 'explore', labelKey: 'discoverExplore', icon: 'compass-outline' },
  { key: 'search', labelKey: 'search', icon: 'search' },
  { key: 'downloads', labelKey: 'downloads', icon: 'cloud-download-outline' },
] as const;

const CHIP_BAR_HEIGHT = 52;

/* ------------------------------------------------------------------ */
/*  Connection form                                                   */
/* ------------------------------------------------------------------ */

function DiscoverConnectionForm({ topInset }: { topInset: number }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [url, setUrl] = useState(discoverSettingsStore.getState().baseUrl ?? '');
  const [token, setToken] = useState('');

  const inputStyle = [styles.input, { color: colors.textPrimary, backgroundColor: colors.inputBg }];
  return (
    <View style={[styles.form, { paddingTop: topInset + 16 }]}>
      <Text style={[styles.formTitle, { color: colors.textPrimary }]}>{t('discoverConnectTitle')}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('discoverConnectHint')}</Text>
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
        value={token}
        onChangeText={setToken}
        placeholder={t('discoverToken')}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={inputStyle}
        accessibilityLabel={t('discoverToken')}
      />
      <Pressable
        onPress={() => discoverSettingsStore.getState().setConnection(url, token)}
        disabled={!url.trim() || !token.trim()}
        style={({ pressed }) => [
          styles.saveButton,
          { backgroundColor: colors.primary },
          (pressed || !url.trim() || !token.trim()) && styles.pressed,
        ]}
        accessibilityRole="button"
      >
        <Text style={styles.saveLabel}>{t('save')}</Text>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  DiscoverScreen                                                    */
/* ------------------------------------------------------------------ */

export function DiscoverScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const headerHeight = searchStore((s) => s.headerHeight);
  const baseUrl = discoverSettingsStore((s) => s.baseUrl);
  const token = discoverSettingsStore((s) => s.token);
  const playingId = discoverPreviewStore((s) => s.playingId);
  const configured = !!baseUrl && !!token;
  const [panel, setPanel] = useState<DiscoverPanel>('explore');

  useEffect(() => {
    if (!isFocused) stopDiscoverPreview();
  }, [isFocused]);

  if (!configured) {
    return <DiscoverConnectionForm topInset={headerHeight} />;
  }

  const handleEditConnection = () => {
    themedAlertStore.getState().show(t('discoverEditConnection'), t('discoverEditConnectionBody'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('ok'), onPress: () => discoverSettingsStore.getState().clearConnection() },
    ]);
  };

  const contentInsetTop = headerHeight + CHIP_BAR_HEIGHT;
  // Panels stay mounted (hidden) so switching keeps the search text and scroll position.
  return (
    <View style={styles.container}>
      {/* The connection key remounts the panels when the backend changes. */}
      <View key={`${baseUrl}|${token}`} style={styles.container}>
        <View style={[styles.container, panel !== 'explore' && styles.hidden]}>
          <DiscoverHomeView topInset={contentInsetTop} />
        </View>
        <View style={[styles.container, panel !== 'search' && styles.hidden]}>
          <DiscoverSearch topInset={contentInsetTop} playingId={playingId} />
        </View>
        <View style={[styles.container, panel !== 'downloads' && styles.hidden]}>
          <DiscoverDownloads topInset={contentInsetTop} active={isFocused && panel === 'downloads'} />
        </View>
      </View>
      <View style={[styles.chipOverlay, { top: headerHeight, backgroundColor: colors.background }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {PANELS.map((p) => {
            const selected = p.key === panel;
            return (
              <Pressable
                key={p.key}
                onPress={() => setPanel(p.key)}
                style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.inputBg }]}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Ionicons name={p.icon} size={16} color={selected ? '#fff' : colors.textSecondary} />
                <Text style={[styles.chipLabel, { color: selected ? '#fff' : colors.textPrimary }]}>
                  {t(p.labelKey)}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={handleEditConnection}
            style={[styles.chip, { backgroundColor: colors.inputBg }]}
            accessibilityRole="button"
            accessibilityLabel={t('discoverEditConnection')}
          >
            <Ionicons name="settings-outline" size={16} color={colors.textSecondary} />
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
  chipOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: CHIP_BAR_HEIGHT,
    zIndex: 1,
    justifyContent: 'center',
  },
  chips: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
  },
  pressed: {
    opacity: 0.5,
  },
  form: {
    flex: 1,
    paddingHorizontal: 24,
    gap: 12,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  input: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  saveButton: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
