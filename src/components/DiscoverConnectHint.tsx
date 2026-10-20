import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';

import { EmptyState } from './EmptyState';
import { useTheme } from '../hooks/useTheme';

/** Shown where Discover content would be when no discover server is configured yet. */
export function DiscoverConnectHint() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <EmptyState icon="compass-outline" title={t('discoverConnectTitle')} subtitle={t('discoverConnectHint')}>
      <Pressable onPress={() => router.push('/settings-discover')} accessibilityRole="button" style={styles.action}>
        <Text style={[styles.link, { color: colors.primary }]}>{t('discoverOpenSettings')}</Text>
      </Pressable>
    </EmptyState>
  );
}

const styles = StyleSheet.create({
  action: {
    marginTop: 12,
  },
  link: {
    fontSize: 15,
    fontWeight: '600',
  },
});
