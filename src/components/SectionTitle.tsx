/**
 * Reusable section title component for detail screens.
 *
 * Renders an uppercase, small-caps style heading used to label
 * sections like "About", "Top Songs", "Similar Artists", "Albums", etc.
 */

import { StyleSheet, Text } from 'react-native';

export function SectionTitle({
  title,
  color,
  large = false,
}: {
  title: string;
  color: string;
  /** Larger, title-case heading for prominent feature pages (e.g. Tuned In). */
  large?: boolean;
}) {
  return (
    <Text style={[large ? styles.sectionTitleLarge : styles.sectionTitle, { color }]}>
      {title}
    </Text>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 4,
  },
  sectionTitleLarge: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 18,
    marginLeft: 4,
  },
});
