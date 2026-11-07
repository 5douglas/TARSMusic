import { StyleSheet } from 'react-native';

import { BottomChrome } from '../components/BottomChrome';
import { GradientBackground } from '../components/GradientBackground';
import { FavoritesScreen } from './favorites';

/**
 * "Liked Songs", opened from the pinned row at the top of Your Library.
 * GradientBackground already pads below the header, so the pills sit in the layout
 * right under it and the list scrolls beneath them, never under or behind them.
 */
export function LikedSongsScreen() {
  return (
    <GradientBackground style={styles.container}>
      <FavoritesScreen topInset={0} inlineSegments />
      <BottomChrome withSafeAreaPadding />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
