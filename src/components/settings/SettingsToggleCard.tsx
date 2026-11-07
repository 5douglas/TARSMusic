import { StyleSheet, Switch, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import { SettingsSectionTitle } from './SettingsSectionTitle';

export interface SettingsToggle {
  key: string;
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

/** A titled settings card made of switch rows. */
export function SettingsToggleCard({ title, toggles }: { title: string; toggles: SettingsToggle[] }) {
  const { colors } = useTheme();
  return (
    <View style={settingsStyles.section}>
      <SettingsSectionTitle>{title}</SettingsSectionTitle>
      <View style={[settingsStyles.card, { backgroundColor: colors.card }]}>
        {toggles.map((toggle, index) => (
          <View
            key={toggle.key}
            style={[
              styles.row,
              index < toggles.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <View style={styles.textWrap}>
              <Text style={[styles.label, { color: colors.textPrimary }]}>{toggle.label}</Text>
              {toggle.hint ? (
                <Text style={[styles.hint, { color: colors.textSecondary }]}>{toggle.hint}</Text>
              ) : null}
            </View>
            <Switch
              value={toggle.value}
              onValueChange={toggle.onChange}
              trackColor={{ false: colors.border, true: colors.primary }}
              accessibilityLabel={toggle.label}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontSize: 16,
  },
  hint: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
});
