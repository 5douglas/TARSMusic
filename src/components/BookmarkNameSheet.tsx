import Ionicons from "@react-native-vector-icons/ionicons/static";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BottomSheet } from './BottomSheet';
import { useTheme } from '../hooks/useTheme';
import { commitBookmark } from '../services/bookmarkService';
import { bookmarkSheetStore } from '../store/bookmarkSheetStore';
import { bookmarksStore } from '../store/bookmarksStore';
import { playbackToastStore } from '../store/playbackToastStore';

export function BookmarkNameSheet() {
  const visible = bookmarkSheetStore((s) => s.visible);
  const mode = bookmarkSheetStore((s) => s.mode);
  const bookmarkId = bookmarkSheetStore((s) => s.bookmarkId);
  const initialName = bookmarkSheetStore((s) => s.initialName);
  const snapshot = bookmarkSheetStore((s) => s.snapshot);
  const hide = bookmarkSheetStore((s) => s.hide);

  const { colors } = useTheme();
  const { t } = useTranslation();

  const [name, setName] = useState('');

  useEffect(() => {
    if (visible) {
      setName(initialName);
    }
  }, [visible, initialName]);

  const handleClose = useCallback(() => {
    hide();
    setName('');
  }, [hide]);

  const handleSave = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (mode === 'create') {
      // Commit the snapshot captured when the button was tapped, so the saved
      // bookmark reflects that moment rather than the live (possibly advanced)
      // queue at the time the user hits Save.
      if (snapshot) {
        commitBookmark(snapshot, trimmed);
        playbackToastStore.getState().flashSuccess(t('bookmarkSaved'));
      }
    } else {
      if (bookmarkId) bookmarksStore.getState().renameBookmark(bookmarkId, trimmed);
    }
    handleClose();
  }, [name, mode, bookmarkId, snapshot, handleClose, t]);

  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        title: { color: colors.textPrimary },
        label: { color: colors.textSecondary },
        input: {
          backgroundColor: colors.inputBg,
          color: colors.textPrimary,
          borderColor: colors.border,
        },
        saveButton: { backgroundColor: colors.primary },
      }),
    [colors],
  );

  const trimmed = name.trim();
  const saveDisabled = trimmed.length === 0;

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      <View style={styles.header}>
        <Text style={[styles.title, dynamicStyles.title]} numberOfLines={1}>
          {mode === 'create' ? t('nameBookmark') : t('renameBookmark')}
        </Text>
      </View>

      <View style={styles.formSection}>
        <Text style={[styles.label, dynamicStyles.label]}>{t('bookmarkName')}</Text>
        <TextInput
          style={[styles.input, dynamicStyles.input]}
          value={name}
          onChangeText={setName}
          placeholder={t('enterBookmarkNamePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          returnKeyType="done"
          onSubmitEditing={handleSave}
          autoFocus
        />

        <Pressable
          onPress={handleSave}
          disabled={saveDisabled}
          style={({ pressed }) => [
            styles.saveButton,
            dynamicStyles.saveButton,
            pressed && styles.buttonPressed,
            saveDisabled && styles.buttonDisabled,
          ]}
        >
          <Ionicons name="checkmark" size={18} color="#fff" />
          <Text style={styles.saveButtonText}>{t('save')}</Text>
        </Pressable>

        <Pressable onPress={handleClose} style={styles.cancelButton}>
          <Text style={[styles.cancelButtonText, { color: colors.primary }]}>{t('cancel')}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  formSection: {
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
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
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 4,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
