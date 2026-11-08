import { StyleSheet } from 'react-native';

import { BottomChrome } from '../components/BottomChrome';
import { GradientBackground } from '../components/GradientBackground';
import { FavoritesScreen } from './favorites';

/**
 * "Liked Songs", opened from the pinned row at the top of Your Library.
 * Songs only, like Spotify's Liked Songs: albums and artists have their own chips in
 * Your Library. GradientBackground already pads below the header.
 */
export function LikedSongsScreen() {
  return (
    <GradientBackground style={styles.container}>
      <FavoritesScreen topInset={0} songsOnly />
      <BottomChrome withSafeAreaPadding withTabBar />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
