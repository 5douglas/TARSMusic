/**
 * Safe haptics wrapper that silently no-ops when haptic hardware
 * is unavailable (e.g. iOS Simulator).
 */

import * as Haptics from 'expo-haptics';

export const ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle;

export async function impactAsync(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium,
): Promise<void> {
  try {
    await Haptics.impactAsync(style);
  } catch {
    // Silently ignore – haptic hardware not available (simulator, etc.)
  }
}

export async function notificationAsync(
  type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success,
): Promise<void> {
  try {
    await Haptics.notificationAsync(type);
  } catch {
    // Silently ignore
  }
}

export async function selectionAsync(): Promise<void> {
  try {
    await Haptics.selectionAsync();
  } catch {
    // Silently ignore
  }
}
