import * as Battery from 'expo-battery';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { batteryOptimizationStore } from '../store/batteryOptimizationStore';

/**
 * Check if battery optimization is active for this app (i.e. the app IS restricted).
 * Updates the store with the result. Returns false on iOS (not applicable).
 */
export async function checkBatteryOptimization(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const restricted = await Battery.isBatteryOptimizationEnabledAsync();
    batteryOptimizationStore.getState().setRestricted(restricted);
    return restricted;
  } catch {
    return false;
  }
}

/**
 * Show the system dialog requesting battery optimization exemption.
 * Re-checks status after returning from the dialog. No-op on iOS.
 */
export async function requestBatteryOptimizationExemption(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const packageName = Constants.expoConfig?.android?.package ?? 'com.ghenry22.substream2';
  try {
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
      { data: `package:${packageName}` },
    );
  } catch {
    // Fallback: open the battery optimization settings list if the direct dialog fails
    await IntentLauncher.startActivityAsync(
      IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS,
    ).catch(() => { /* best-effort */ });
  }
  // Re-check after returning from the system dialog
  await checkBatteryOptimization();
}
