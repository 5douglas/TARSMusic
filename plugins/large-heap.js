const { withAndroidManifest } = require("expo/config-plugins");

/**
 * Config plugin that sets android:largeHeap="true" on the <application> element.
 *
 * This requests a larger Dalvik/ART heap (typically 256-512 MB instead of
 * 128-256 MB, depending on device). Helps avoid OOM and GC-storm ANRs on
 * devices with large music libraries where the Fabric shadow tree, Reanimated
 * commit hook, and image caches create significant memory pressure.
 */
function withLargeHeap(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application[0];
    application.$["android:largeHeap"] = "true";
    return config;
  });
}

module.exports = withLargeHeap;
