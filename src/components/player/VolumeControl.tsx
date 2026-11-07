import Ionicons from '@react-native-vector-icons/ionicons/static';
import Slider from '@react-native-community/slider';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { getTrackPlayer } from 'react-native-queue-player';

import { type ThemeColors } from '@/constants/theme';

interface VolumeControlProps {
  colors: ThemeColors;
}

/**
 * Volume slider for the Windows app. Phones use their hardware buttons, so this
 * renders nothing there. The desktop player remembers the level between runs.
 */
export function VolumeControl(props: VolumeControlProps) {
  if (Platform.OS !== 'web') return null;
  return <DesktopVolumeControl {...props} />;
}

// Both players (side panel and full screen) stay mounted, so they share one value.
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const getVolume = () => getTrackPlayer().getVolume();
const setVolume = (v: number) => {
  void getTrackPlayer().setVolume(v);
  for (const cb of listeners) cb();
};

function DesktopVolumeControl({ colors }: VolumeControlProps) {
  const volume = useSyncExternalStore(subscribe, getVolume);
  const lastAudible = useRef(volume > 0 ? volume : 1);

  const apply = useCallback((v: number) => {
    const next = Math.max(0, Math.min(1, v));
    if (next > 0) lastAudible.current = next;
    setVolume(next);
  }, []);

  const toggleMute = useCallback(() => {
    apply(volume > 0 ? 0 : lastAudible.current);
  }, [apply, volume]);

  const icon = volume === 0 ? 'volume-mute' : volume < 0.5 ? 'volume-low' : 'volume-high';

  return (
    <View style={styles.row}>
      <Pressable
        onPress={toggleMute}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={volume === 0 ? 'Unmute' : 'Mute'}
        style={({ pressed }) => [styles.icon, pressed && styles.pressed]}
      >
        <Ionicons name={icon} size={20} color={colors.textPrimary} />
      </Pressable>
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={1}
        step={0.01}
        value={volume}
        onValueChange={apply}
        minimumTrackTintColor={colors.textPrimary}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.textPrimary}
        accessibilityLabel="Volume"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    width: 24,
    alignItems: 'center',
  },
  slider: {
    flex: 1,
    height: 28,
  },
  pressed: {
    opacity: 0.6,
  },
});
