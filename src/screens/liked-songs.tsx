import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useContext } from 'react';
import { StyleSheet } from 'react-native';

import { BottomChrome } from '../components/BottomChrome';
import { GradientBackground } from '../components/GradientBackground';
import { FavoritesScreen } from './favorites';

/** "Liked Songs", opened from the pinned row at the top of Your Library. */
export function LikedSongsScreen() {
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  return (
    <GradientBackground style={styles.container}>
      <FavoritesScreen topInset={headerHeight} />
      <BottomChrome withSafeAreaPadding />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
