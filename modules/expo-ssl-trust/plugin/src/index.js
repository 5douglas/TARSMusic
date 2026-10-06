const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Expo config plugin for expo-ssl-trust.
 *
 * Android:
 *   1. Generates network_security_config.xml with cleartext permitted and
 *      user-installed CA trust (for self-signed certs).
 *   2. Sets android:networkSecurityConfig and android:usesCleartextTraffic
 *      on the <application> element via a managed mod so it composes safely
 *      with other plugins regardless of execution order.
 *
 * iOS: No config changes needed — the custom URLProtocol handles trust.
 */
function withSslTrust(config) {
  // Step 1: Create network_security_config.xml
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const resXmlDir = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml"
      );

      // Ensure the xml directory exists
      if (!fs.existsSync(resXmlDir)) {
        fs.mkdirSync(resXmlDir, { recursive: true });
      }

      const networkSecurityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- Default configuration: trust system CAs -->
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <!-- Trust user-installed CA certificates (for self-signed server certs) -->
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

      const configPath = path.join(resXmlDir, "network_security_config.xml");
      fs.writeFileSync(configPath, networkSecurityConfig, "utf8");

      return config;
    },
  ]);

  // Step 2: Set networkSecurityConfig and usesCleartextTraffic on <application>.
  // Both are set here in a single managed mod so cleartext configuration is
  // owned by one plugin and not split across expo-build-properties.
  config = withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application?.[0];

    if (application) {
      application.$["android:networkSecurityConfig"] =
        "@xml/network_security_config";
      application.$["android:usesCleartextTraffic"] = "true";
    }

    return config;
  });

  return config;
}

module.exports = withSslTrust;
