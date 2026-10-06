/**
 * Dynamic Expo config — extends `app.json` with values that can't live in
 * static JSON. Currently used only to inject `android.extraProguardRules`
 * from `plugins/proguard-rules.pro` (Phase 8 of
 * `plans/2026-05-22-audit-remediation-roadmap.md`).
 *
 * Everything else stays in `app.json`. Expo's resolution: this function
 * receives the parsed `app.json` in `context.config` and we patch the
 * `expo-build-properties` plugin's android config.
 */
const fs = require('fs');
const path = require('path');

const PROGUARD_RULES_PATH = path.join(__dirname, 'plugins', 'proguard-rules.pro');

module.exports = ({ config }) => {
  const extraProguardRules = fs.readFileSync(PROGUARD_RULES_PATH, 'utf8');

  const plugins = (config.plugins ?? []).map((entry) => {
    if (Array.isArray(entry) && entry[0] === 'expo-build-properties') {
      const [name, options] = entry;
      return [
        name,
        {
          ...options,
          android: {
            ...(options?.android ?? {}),
            extraProguardRules,
          },
        },
      ];
    }
    return entry;
  });

  return { ...config, plugins };
};
