import { memo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { type LyricsLine } from '../services/subsonicService';

interface UnsyncedLyricsViewProps {
  lines: LyricsLine[];
  /** One translation per line, shown under it; null/undefined for none. */
  translations?: (string | null)[] | null;
  textColor: string;
}

export const UnsyncedLyricsView = memo(function UnsyncedLyricsView({
  lines,
  translations,
  textColor,
}: UnsyncedLyricsViewProps) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {lines.map((line, i) => (
        <View key={i} style={styles.lineWrap}>
          <Text style={[styles.lineText, { color: textColor }]}>{line.text}</Text>
          {!!translations?.[i] && translations[i] !== line.text && (
            <Text style={[styles.translation, { color: textColor }]}>{translations[i]}</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  lineWrap: {
    marginVertical: 10,
  },
  lineText: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '600',
    textAlign: 'left',
  },
  translation: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '600',
    marginTop: 4,
    opacity: 0.7,
  },
});
