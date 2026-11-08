import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { jamStore } from '../store/jamStore';

/** What the session pill says: who you listen with, or how many listen to you. */
export function useJamLabel(): string | null {
  const { t } = useTranslation();
  const mode = jamStore((s) => s.mode);
  const host = jamStore((s) => s.host);
  const count = jamStore((s) => s.members.length);
  if (mode === 'guest') return t('jamListeningWith', { name: host ?? '' });
  if (mode === 'host') return count > 0 ? t('jamListenersCount', { count }) : t('jamWaitingListeners');
  return null;
}

/** The "listen together" icon of the phone player's bottom row (blue while in a session). */
export function JamIconButton({ size = 24, color }: { size?: number; color?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const active = jamStore((s) => s.mode !== 'none');
  return (
    <Pressable
      onPress={() => router.push('/jam')}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t('jamTitle')}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Ionicons name={active ? 'people' : 'people-outline'} size={size} color={active ? colors.primary : color ?? colors.textPrimary} />
    </Pressable>
  );
}

/** A pill for the bigger players (Windows side panel and full screen), shown only while a
 *  session is on; starting one is in the ⋯ menu so the player stays simple. */
export function JamPill() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const label = useJamLabel();
  const active = label !== null;
  if (!active) return null;
  return (
    <Pressable
      onPress={() => router.push('/jam')}
      accessibilityRole="button"
      accessibilityLabel={t('jamTitle')}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: active ? colors.primary : 'transparent', borderColor: active ? colors.primary : colors.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.pillInner}>
        <Ionicons name={active ? 'people' : 'people-outline'} size={16} color={active ? '#fff' : colors.textPrimary} />
        <Text numberOfLines={1} style={[styles.pillLabel, { color: active ? '#fff' : colors.textPrimary }]}>
          {label ?? t('jamTitle')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.6 },
  pill: {
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 10,
    maxWidth: '100%',
  },
  pillInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillLabel: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
});
