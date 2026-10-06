import ExpoMoveToBackModule from './ExpoMoveToBackModule';

/**
 * Move the app to the background on Android.
 * No-op on iOS (no hardware back button).
 */
export function moveToBack(): void {
  ExpoMoveToBackModule.moveToBack();
}
