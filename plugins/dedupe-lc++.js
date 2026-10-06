const { withXcodeProject } = require("expo/config-plugins");

/**
 * Config plugin that removes the explicit `-lc++` from the main target's
 * OTHER_LDFLAGS build setting.
 *
 * Why this exists:
 *   React Native's New Architecture template adds `-lc++` to the Xcode
 *   project's OTHER_LDFLAGS. CocoaPods also provides `-lc++` via the
 *   aggregated xcconfig file, which is pulled in through `$(inherited)`.
 *   The linker receives the flag twice and emits:
 *     ld: warning: ignoring duplicate libraries: '-lc++'
 *
 * What it does:
 *   During `expo prebuild`, this plugin removes the `-lc++` entry from
 *   OTHER_LDFLAGS in every build configuration of the main app target.
 *   The flag still reaches the linker through `$(inherited)` from the
 *   CocoaPods xcconfig, so linking is unaffected.
 *
 * Impact:
 *   - Build-time only; no effect on the linked binary.
 *   - If a future Expo SDK or React Native version stops adding the
 *     duplicate, this plugin becomes a no-op and can be removed.
 */
function withDedupeLdCpp(config) {
  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const xcBuildConfiguration =
      project.hash.project.objects["XCBuildConfiguration"];

    for (const key of Object.keys(xcBuildConfiguration)) {
      const entry = xcBuildConfiguration[key];
      if (typeof entry !== "object" || !entry.buildSettings) continue;

      const flags = entry.buildSettings.OTHER_LDFLAGS;
      if (!Array.isArray(flags)) continue;

      const filtered = flags.filter(
        (f) => f !== "-lc++" && f !== '"-lc++"'
      );
      if (filtered.length !== flags.length) {
        entry.buildSettings.OTHER_LDFLAGS = filtered;
      }
    }

    return config;
  });
}

module.exports = withDedupeLdCpp;
