import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../hooks/useTheme';
import { authStore } from '../store/authStore';
import { profileStore } from '../store/profileStore';

/** The user's profile picture, or their initial on the TARSMusic blue when none is set. */
export const ProfileAvatar = memo(function ProfileAvatar({ size }: { size: number }) {
  const { colors } = useTheme();
  const avatarUri = profileStore((s) => s.avatarUri);
  const username = authStore((s) => s.username);
  const box = { width: size, height: size, borderRadius: size / 2 };

  if (avatarUri) {
    return <Image source={{ uri: avatarUri }} style={box} contentFit="cover" transition={0} />;
  }
  return (
    <View style={[box, styles.initials, { backgroundColor: colors.primary }]}>
      <Text style={[styles.letter, { fontSize: size * 0.45 }]}>
        {(username ?? '?').trim().charAt(0).toUpperCase()}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  initials: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    color: '#fff',
    fontWeight: '800',
  },
});
