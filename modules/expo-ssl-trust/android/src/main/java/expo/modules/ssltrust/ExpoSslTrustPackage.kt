package expo.modules.ssltrust

import android.app.Application
import android.content.Context
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

/**
 * Installs the custom SSL trust manager (RN's OkHttpClientFactory + AppTrustManager)
 * at `Application.onCreate` — BEFORE the React bridge builds its NetworkingModule
 * OkHttpClient.
 *
 * RN fixes that client at construction time from whatever factory is set THEN, and
 * reuses it for every request. A JS-side install (`initSslTrustStore` / trust) runs
 * too late: the client is already built (in dev, dev infrastructure builds it before
 * JS even runs), so our trust manager never enters the request path and self-signed
 * handshakes fail with "Trust anchor for certification path not found". Setting the
 * factory here, at app startup, guarantees RN's client is built WITH our
 * `AppTrustManager` — which reads the live cert map, so a cert trusted later applies
 * to the same client without a rebuild.
 *
 * Auto-discovered by Expo autolinking: the file name ends with `Package.kt` and it
 * imports `expo.modules.core.interfaces.Package`. No `expo-module.config.json` or
 * `android/` change is required.
 */
class ExpoSslTrustPackage : Package {
  override fun createApplicationLifecycleListeners(
    context: Context
  ): List<ApplicationLifecycleListener> {
    return listOf(object : ApplicationLifecycleListener {
      override fun onCreate(application: Application) {
        // Loads persisted certs + installs the OkHttp factory. `init` catches its
        // own JSSE failures (surfaced via getInstallStatus), so it's non-fatal.
        SslTrustStore.init(application)
      }
    })
  }
}
