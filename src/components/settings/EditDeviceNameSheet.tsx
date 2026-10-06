import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from '../BottomSheet';
import { useTheme } from '../../hooks/useTheme';
import { settingsStyles } from '../../styles/settingsStyles';
import { deviceIdentityStore } from '../../store/deviceIdentityStore';

export function EditDeviceNameSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const deviceLabel = deviceIdentityStore((s) => s.deviceLabel);
  const [input, setInput] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (visible) {
      setInput(deviceLabel);
      setSaved(false);
    }
  }, [visible, deviceLabel]);

  const handleSave = useCallback(() => {
    const trimmed = input.trim();
    if (trimmed) {
      deviceIdentityStore.getState().setDeviceLabel(trimmed);
    }
    setSaved(true);
    setTimeout(onClose, 500);
  }, [input, onClose]);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t('deviceName')}</Text>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {t('deviceNameEditPrompt')}
        </Text>
      </View>
      <View style={styles.form}>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border },
          ]}
          placeholder={deviceLabel}
          placeholderTextColor={colors.textSecondary}
          value={input}
          onChangeText={setInput}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleSave}
          autoFocus
        />
        <Pressable
          onPress={handleSave}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: colors.primary },
            pressed && settingsStyles.pressed,
          ]}
        >
          <Ionicons name="checkmark" size={18} color="#fff" />
          <Text style={styles.saveButtonText}>{saved ? t('saved') : t('save')}</Text>
        </Pressable>
        <Pressable onPress={onClose} style={styles.cancelButton}>
          <Text style={[styles.cancelButtonText, { color: colors.primary }]}>{t('cancel')}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 4, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  hint: { fontSize: 14, lineHeight: 18 },
  form: { paddingHorizontal: 4 },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 20,
    marginBottom: 8,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelButton: { alignItems: 'center', paddingVertical: 12, marginBottom: 4 },
  cancelButtonText: { fontSize: 16, fontWeight: '500' },
});
