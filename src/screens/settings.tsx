import { useRouter } from 'expo-router';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useCallback, useContext, useMemo } from 'react';
import { Platform, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BottomChrome } from '../components/BottomChrome';
import { GradientBackground } from '../components/GradientBackground';
import { SettingsLinkRow } from '../components/settings/SettingsLinkRow';
import { VersionFooter } from '../components/settings/VersionFooter';
import { checkForUpdateInteractive } from '../services/appUpdateService';
import { devOptionsStore } from '../store/devOptionsStore';
import { onboardingStore } from '../store/onboardingStore';

import type { IoniconsName } from '../utils/iconNames';

const SETTINGS_LINKS: {
  route: string;
  labelKey: string;
  subtitleKey: string;
  icon: IoniconsName;
}[] = [
  { route: '/settings-server', labelKey: 'serverAccount', subtitleKey: 'serverAccountSubtitle', icon: 'server-outline' },
  { route: '/settings-appearance', labelKey: 'appearanceLayout', subtitleKey: 'appearanceLayoutSubtitle', icon: 'color-palette-outline' },
  { route: '/settings-playback', labelKey: 'soundPlayback', subtitleKey: 'soundPlaybackSubtitle', icon: 'musical-notes-outline' },
  { route: '/settings-discover', labelKey: 'discoverServer', subtitleKey: 'discoverServerSubtitle', icon: 'compass-outline' },
  { route: '/settings-connectivity', labelKey: 'connectivity', subtitleKey: 'connectivitySubtitle', icon: 'globe-outline' },
  { route: '/settings-storage', labelKey: 'storage', subtitleKey: 'storageSubtitle', icon: 'folder-outline' },
  { route: '/settings-library-data', labelKey: 'libraryData', subtitleKey: 'libraryDataSubtitle', icon: 'library-outline' },
];

const DEV_SETTINGS_LINKS: typeof SETTINGS_LINKS = [
  { route: '/file-explorer', labelKey: 'fileExplorer', subtitleKey: 'fileExplorerSubtitle', icon: 'document-text-outline' },
  { route: '/logging', labelKey: 'logging', subtitleKey: 'loggingSubtitle', icon: 'list-outline' },
];

export function SettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const devEnabled = devOptionsStore((s) => s.enabled);

  const visibleLinks = useMemo(
    () => (devEnabled ? [...SETTINGS_LINKS, ...DEV_SETTINGS_LINKS] : SETTINGS_LINKS),
    [devEnabled],
  );

  const handleShowOnboarding = useCallback(() => {
    onboardingStore.getState().reset();
    onboardingStore.getState().show();
  }, []);

  return (
    <GradientBackground scrollable>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: headerHeight + 16 }]}
      showsVerticalScrollIndicator={false}
    >
      {visibleLinks.map((link) => (
        <SettingsLinkRow
          key={link.route}
          label={t(link.labelKey)}
          subtitle={t(link.subtitleKey)}
          icon={link.icon}
          onPress={() => router.push(link.route as never)}
        />
      ))}
      <SettingsLinkRow
        label={t('helpWelcomeGuide')}
        subtitle={t('helpWelcomeGuideSubtitle')}
        icon="help-circle-outline"
        onPress={handleShowOnboarding}
      />
      {Platform.OS === 'android' && (
        <SettingsLinkRow
          label={t('appUpdateCheck')}
          subtitle={t('appUpdateCheckSubtitle')}
          icon="cloud-download-outline"
          onPress={() => { void checkForUpdateInteractive(); }}
        />
      )}
      <VersionFooter />
    </ScrollView>
    <BottomChrome withSafeAreaPadding />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
});
