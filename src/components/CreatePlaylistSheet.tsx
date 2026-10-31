import Ionicons from '@react-native-vector-icons/ionicons/static';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from './BottomSheet';
import { useTheme } from '../hooks/useTheme';
import { refreshPlaylistLibrary } from '../services/normalizedLibrarySync';
import { createNewPlaylist } from '../services/subsonicService';
import { processingOverlayStore } from '../store/processingOverlayStore';

/** The "+" in Your Library: name an empty playlist and create it, like Spotify. */
export function CreatePlaylistSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setName('');
    setError(null);
    setBusy(false);
    onClose();
  }, [onClose]);

  const create = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await createNewPlaylist(trimmed, []);
      if (!ok) throw new Error('API returned false');
      close();
      void refreshPlaylistLibrary();
      processingOverlayStore.getState().show(t('creating'));
      processingOverlayStore.getState().showSuccess(t('playlistCreated'));
    } catch {
      setBusy(false);
      setError(t('failedToCreatePlaylist'));
    }
  }, [name, busy, close, t]);

  return (
    <BottomSheet visible={visible} onClose={close} scrollable={false}>
      <View style={styles.form}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t('newPlaylist')}</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.inputBg, color: colors.textPrimary, borderColor: colors.border },
          ]}
          value={name}
          onChangeText={setName}
          placeholder={t('enterPlaylistNamePlaceholder')}
          placeholderTextColor={colors.textSecondary}
          returnKeyType="done"
          autoFocus
          editable={!busy}
          onSubmitEditing={create}
        />
        {error && <Text style={[styles.error, { color: colors.red }]}>{error}</Text>}
        <Pressable
          onPress={create}
          disabled={busy || !name.trim()}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary },
            pressed && styles.pressed,
            (busy || !name.trim()) && styles.disabled,
          ]}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="add-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>{t('createPlaylist')}</Text>
            </>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  form: {
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: {
    fontSize: 14,
    marginTop: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 24,
    paddingVertical: 14,
    marginTop: 20,
    marginBottom: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.6,
  },
});
