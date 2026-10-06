const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const GRADLE_VERSION = "8.14.3";

/**
 * Config plugin that pins the Gradle wrapper distribution URL to a specific
 * version. Expo prebuild may generate a version that is incompatible with
 * the current React Native / Expo gradle plugins.
 */
function withSetGradleVersion(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const propsPath = path.join(
        config.modRequest.platformProjectRoot,
        "gradle",
        "wrapper",
        "gradle-wrapper.properties"
      );

      if (!fs.existsSync(propsPath)) {
        return config;
      }

      let contents = fs.readFileSync(propsPath, "utf8");
      contents = contents.replace(
        /distributionUrl=.*$/m,
        `distributionUrl=https\\://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip`
      );
      fs.writeFileSync(propsPath, contents, "utf8");

      return config;
    },
  ]);
}

module.exports = withSetGradleVersion;
