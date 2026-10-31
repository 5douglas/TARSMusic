import { HeaderHeightContext, useIsFocused } from 'expo-router/react-navigation';
import { useContext } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomChrome } from '../components/BottomChrome';
import { DiscoverConnectHint } from '../components/DiscoverConnectHint';
import { DiscoverDownloads } from '../components/DiscoverDownloads';
import { GradientBackground } from '../components/GradientBackground';
import { discoverSettingsStore } from '../store/discoverSettingsStore';

/** The deemix download manager, reached from Settings and the profile menu. */
export function DiscoverDownloadsScreen() {
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const isFocused = useIsFocused();
  const configured = discoverSettingsStore((s) => !!s.baseUrl && !!s.token);

  return (
    <GradientBackground style={styles.container}>
      {configured ? (
        <DiscoverDownloads topInset={headerHeight} active={isFocused} />
      ) : (
        <View style={[styles.empty, { paddingTop: headerHeight }]}>
          <DiscoverConnectHint />
        </View>
      )}
      <BottomChrome withSafeAreaPadding />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  empty: {
    flex: 1,
  },
});
