import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const COLORS = ['#1D9BF0', '#8E44AD', '#E67E22', '#16A085', '#C0392B', '#2C3E50', '#D35400', '#27AE60'];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

/** A coloured circle with the first letter of another user's name. */
export const ChatAvatar = memo(function ChatAvatar({ name, size }: { name: string; size: number }) {
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(name.toLowerCase()) },
      ]}
    >
      <Text style={[styles.letter, { fontSize: size * 0.42 }]}>{(name.trim()[0] ?? '?').toUpperCase()}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    color: '#fff',
    fontWeight: '700',
  },
});
