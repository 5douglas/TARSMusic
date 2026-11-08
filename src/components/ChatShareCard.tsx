import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CachedImage } from './CachedImage';
import type { ChatShare } from '../services/chatService';
import { openChatShareTarget } from '../utils/chatShare';

const KIND_KEYS: Record<ChatShare['kind'], string> = {
  song: 'chatShareSong',
  album: 'chatShareAlbum',
  artist: 'chatShareArtist',
  playlist: 'chatSharePlaylist',
};

/** A shared song, album, artist or playlist inside a chat bubble; tapping opens it. */
export const ChatShareCard = memo(function ChatShareCard({ share }: { share: ChatShare }) {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => void openChatShareTarget(share)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <CachedImage
        coverArtId={share.coverArt}
        size={150}
        style={[styles.cover, share.kind === 'artist' && styles.round]}
      />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {share.title ?? t(KIND_KEYS[share.kind])}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {share.subtitle ? `${t(KIND_KEYS[share.kind])} · ${share.subtitle}` : t(KIND_KEYS[share.kind])}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    // Translucent, so the card stands out on both the blue (mine) and grey (theirs) bubbles.
    backgroundColor: 'rgba(0,0,0,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 8,
    gap: 10,
    width: 240,
  },
  pressed: {
    opacity: 0.7,
  },
  cover: {
    width: 56,
    height: 56,
    borderRadius: 6,
  },
  round: {
    borderRadius: 28,
  },
  text: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    marginTop: 2,
  },
});
