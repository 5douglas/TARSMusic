/**
 * Root-mounted alert host. Subscribes to `themedAlertStore` and renders
 * a single `<ThemedAlert>`. Mounted once in `_layout.tsx` alongside the
 * other global modal hosts (AddToPlaylistSheet, MbidSearchSheet, etc.)
 * so the Modal lifecycle is fully decoupled from whatever component
 * triggered the alert.
 */

import { useCallback } from 'react';

import { ThemedAlert } from './ThemedAlert';
import { useTheme } from '../hooks/useTheme';
import { themedAlertStore } from '../store/themedAlertStore';

export function ThemedAlertHost() {
  const { colors } = useTheme();
  const visible = themedAlertStore((s) => s.visible);
  const title = themedAlertStore((s) => s.title);
  const message = themedAlertStore((s) => s.message);
  const buttons = themedAlertStore((s) => s.buttons);

  const handleDismiss = useCallback(() => {
    themedAlertStore.getState().hide();
  }, []);

  return (
    <ThemedAlert
      visible={visible}
      title={title}
      message={message}
      buttons={buttons}
      onDismiss={handleDismiss}
      colors={colors}
    />
  );
}
