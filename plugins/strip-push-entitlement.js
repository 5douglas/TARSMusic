const { withEntitlementsPlist } = require("expo/config-plugins");

/**
 * Config plugin that removes the aps-environment entitlement from iOS builds.
 *
 * Why this exists:
 *   expo-notifications is installed for local-only notifications (download
 *   progress alerts). Its config plugin unconditionally injects the
 *   `aps-environment` entitlement, which requires the provisioning profile
 *   to include the Push Notifications capability — even though this app
 *   never uses remote/push notifications. The auto-plugin system in
 *   @expo/prebuild-config also applies it regardless of the plugins array.
 *
 * How it works:
 *   Expo's mod chain is LIFO — the first-registered mod executes last. By
 *   listing this plugin BEFORE expo-notifications in the plugins array, its
 *   mod is registered first and therefore runs after expo-notifications has
 *   added the entitlement, allowing it to delete the key.
 *
 * Important:
 *   This plugin MUST appear BEFORE "expo-notifications" in the plugins array.
 *
 * Impact:
 *   - Remote/push notifications will NOT work (intentional).
 *   - Local notifications (scheduleNotificationAsync, etc.) are unaffected.
 *   - Safe to remove if expo-notifications is uninstalled or if a future
 *     Expo SDK stops auto-applying the entitlement.
 */
function withStripPushEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults["aps-environment"];
    return config;
  });
}

module.exports = withStripPushEntitlement;
