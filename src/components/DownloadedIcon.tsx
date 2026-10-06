import Ionicons from "@react-native-vector-icons/ionicons/static";
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Two-tone downloaded indicator: a primary-coloured filled circle with the
 * arrow cutout that reveals a textPrimary-coloured backing disc, making the
 * arrow clearly visible against any background.
 */
export const DownloadedIcon = memo(function DownloadedIcon({
  size,
  circleColor,
  arrowColor,
}: {
  size: number;
  circleColor: string;
  arrowColor: string;
}) {
  const backingSize = Math.round(size * 0.75);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View
        style={[
          styles.backing,
          {
            width: backingSize,
            height: backingSize,
            borderRadius: backingSize / 2,
            backgroundColor: arrowColor,
          },
        ]}
      />
      <Ionicons name="arrow-down-circle" size={size} color={circleColor} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  backing: {
    position: 'absolute',
  },
});
