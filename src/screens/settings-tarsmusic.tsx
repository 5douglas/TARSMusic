import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView } from 'react-native';

import { BottomChrome } from '../components/BottomChrome';
import { GradientBackground } from '../components/GradientBackground';
import { AutoplayCard } from '../components/settings/AutoplayCard';
import { PlaybackModeCard } from '../components/settings/PlaybackModeCard';
import { ReplayGainCard } from '../components/settings/ReplayGainCard';
import { SettingsToggleCard } from '../components/settings/SettingsToggleCard';
import { SmartDownloadCard } from '../components/settings/SmartDownloadCard';
import { newMusicAlertsStore } from '../store/newMusicAlertsStore';
import { playbackSettingsStore } from '../store/playbackSettingsStore';
import { settingsStyles } from '../styles/settingsStyles';

/** Everything TARSMusic adds on top of the original app, in one place. */
export function SettingsTarsmusicScreen() {
  const { t } = useTranslation();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const coverLyricLine = playbackSettingsStore((s) => s.coverLyricLine);
  const widgetLyrics = playbackSettingsStore((s) => s.widgetLyrics);
  const releasesEnabled = newMusicAlertsStore((s) => s.releasesEnabled);
  const requestsEnabled = newMusicAlertsStore((s) => s.requestsEnabled);

  const playerToggles = [
    {
      key: 'coverLyricLine',
      label: t('coverLyricLineToggle'),
      hint: t('coverLyricLineHint'),
      value: coverLyricLine,
      onChange: (v: boolean) => playbackSettingsStore.getState().setCoverLyricLine(v),
    },
    ...(Platform.OS === 'android'
      ? [
          {
            key: 'widgetLyrics',
            label: t('widgetLyricsToggle'),
            hint: t('widgetLyricsHint'),
            value: widgetLyrics,
            onChange: (v: boolean) => playbackSettingsStore.getState().setWidgetLyrics(v),
          },
        ]
      : []),
  ];

  const notificationToggles = [
    {
      key: 'releases',
      label: t('newMusicReleasesToggle'),
      hint: t('newMusicReleasesToggleHint'),
      value: releasesEnabled,
      onChange: (v: boolean) => newMusicAlertsStore.getState().setReleasesEnabled(v),
    },
    {
      key: 'requests',
      label: t('newMusicRequestsToggle'),
      hint: t('newMusicRequestsToggleHint'),
      value: requestsEnabled,
      onChange: (v: boolean) => newMusicAlertsStore.getState().setRequestsEnabled(v),
    },
  ];

  return (
    <GradientBackground scrollable>
      <ScrollView
        style={settingsStyles.container}
        contentContainerStyle={[settingsStyles.content, { paddingTop: headerHeight + 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <SettingsToggleCard title={t('tarsmusicPlayerSection')} toggles={playerToggles} />
        <PlaybackModeCard />
        <ReplayGainCard />
        <AutoplayCard />
        <SettingsToggleCard title={t('newMusicAlertsTitle')} toggles={notificationToggles} />
        <SmartDownloadCard />
      </ScrollView>
      <BottomChrome withSafeAreaPadding />
    </GradientBackground>
  );
}
