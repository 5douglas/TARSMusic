import { requireOptionalNativeModule } from 'expo-modules-core';

interface ExpoAppInstallerModule {
  canRequestPackageInstalls(): boolean;
  openInstallPermissionSettings(): void;
  installApk(path: string): Promise<boolean>;
}

/**
 * The native installer, or null in a build that predates it (an older APK running a newer
 * bundle) and on iOS. Callers fall back to the system "open APK" intent then.
 */
export const AppInstaller = requireOptionalNativeModule<ExpoAppInstallerModule>('ExpoAppInstaller');
