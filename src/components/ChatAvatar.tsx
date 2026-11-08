import { Image } from 'expo-image';
import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { cachedChatAvatar, fetchChatAvatar } from '../services/chatService';

const COLORS = ['#1D9BF0', '#8E44AD', '#E67E22', '#16A085', '#C0392B', '#2C3E50', '#D35400', '#27AE60'];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

/**
 * Another user's profile picture; a coloured circle with the first letter of their name
 * while it loads or when they have none.
 */
export const ChatAvatar = memo(function ChatAvatar({
  name,
  size,
  username,
}: {
  name: string;
  size: number;
  /** Account whose picture to show; without it only the letter is drawn. */
  username?: string;
}) {
  const [uri, setUri] = useState<string | null>(() => (username ? cachedChatAvatar(username) ?? null : null));

  useEffect(() => {
    if (!username) {
      setUri(null);
      return;
    }
    let alive = true;
    void fetchChatAvatar(username).then((found) => {
      if (alive) setUri(found);
    });
    return () => {
      alive = false;
    };
  }, [username]);

  const circle = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return <Image source={{ uri }} style={circle} contentFit="cover" accessibilityLabel={name} />;
  }
  return (
    <View style={[styles.circle, circle, { backgroundColor: colorFor(name.toLowerCase()) }]}>
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
