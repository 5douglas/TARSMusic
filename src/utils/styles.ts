import type { ViewStyle } from 'react-native';

/**
 * Drop-in replacement for `StyleSheet.absoluteFillObject`, which was removed
 * from React Native's typings in 0.85 (SDK 56). Use this in places that
 * spread the value into another style:
 *
 *   { ...absoluteFill, padding: 8 }
 *
 * For direct usage (`style={absoluteFill}` or `style={[absoluteFill, ...]}`),
 * either this constant or `StyleSheet.absoluteFill` works.
 */
export const absoluteFill: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  bottom: 0,
  right: 0,
};
