package expo.modules.ssltrust

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject
import java.security.MessageDigest
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManager
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager
import java.security.KeyStore
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap

/**
 * Manages the persisted store of trusted self-signed certificate fingerprints.
 * Backed by SharedPreferences for fast native-level access before the JS bridge loads.
 */
object SslTrustStore {
    private const val PREFS_NAME = "expo_ssl_trust_store"
    private const val KEY_TRUSTED_CERTS = "trusted_certs"

    private var prefs: SharedPreferences? = null
    // hostname -> { sha256, acceptedAt }.
    // ConcurrentHashMap: these maps are read on OkHttp/JSSE TLS-handshake threads
    // (AppTrustManager.checkServerTrusted, CustomHostnameVerifier) while being
    // written from the JS-thread module functions (trustCertificate /
    // storeCertDerData). A plain mutableMap would risk ConcurrentModificationException
    // on the weakly-consistent iteration in those handshake reads.
    private val trustedCerts = ConcurrentHashMap<String, TrustedCertEntry>()
    // hostname -> DER-encoded certificate data (for ExoPlayer trust)
    private val certDerData = ConcurrentHashMap<String, ByteArray>()

    data class TrustedCertEntry(
        val sha256Fingerprint: String,
        val acceptedAt: Long,
        val validTo: String? = null
    )

    /**
     * True after a successful `installCustomTrustManager()` run. Stays false
     * if init was never called or if JSSE / OkHttpClientProvider wiring threw.
     */
    @Volatile
    var installSucceeded: Boolean = false
        private set

    /** The most recent install error message, if any. Null on success. */
    @Volatile
    var lastInstallError: String? = null
        private set

    /**
     * Load persisted certs from prefs WITHOUT the JSSE/OkHttp trust-manager
     * install (which can crash on stripped OEM ROMs). Safe + idempotent. Used by
     * read-only ops (getTrustedCertificates / isCertificateTrusted / clearAll) so
     * they never trigger the install for users who don't pin.
     */
    fun loadCerts(context: Context) {
        if (prefs == null) {
            prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            load()
        }
    }

    fun init(context: Context) {
        try {
            loadCerts(context)
            installCustomTrustManager()
        } catch (e: Throwable) {
            // Catastrophic failure (e.g. broken JSSE, denied prefs access).
            // Record the error so the JS layer can surface a banner; do NOT
            // throw — that would crash the JS bundle since init() is called
            // from a top-level AsyncFunction at app start.
            installSucceeded = false
            lastInstallError = e.message ?: e.javaClass.simpleName
            android.util.Log.e("SslTrustStore", "init failed: $lastInstallError", e)
        }
    }

    private fun load() {
        val json = prefs?.getString(KEY_TRUSTED_CERTS, null) ?: return
        try {
            val obj = JSONObject(json)
            obj.keys().forEach { hostname ->
                val entry = obj.getJSONObject(hostname)
                trustedCerts[hostname] = TrustedCertEntry(
                    sha256Fingerprint = entry.getString("sha256"),
                    acceptedAt = entry.getLong("acceptedAt"),
                    validTo = if (entry.has("validTo")) entry.getString("validTo") else null
                )
            }
        } catch (e: Exception) {
            // Corrupted prefs, start fresh
            trustedCerts.clear()
        }
    }

    private fun save() {
        val obj = JSONObject()
        trustedCerts.forEach { (hostname, entry) ->
            val entryObj = JSONObject()
            entryObj.put("sha256", entry.sha256Fingerprint)
            entryObj.put("acceptedAt", entry.acceptedAt)
            entry.validTo?.let { entryObj.put("validTo", it) }
            obj.put(hostname, entryObj)
        }
        prefs?.edit()?.putString(KEY_TRUSTED_CERTS, obj.toString())?.apply()
    }

    fun storeCertDerData(hostname: String, derData: ByteArray) {
        certDerData[hostname] = derData
    }

    fun trustCertificate(hostname: String, sha256Fingerprint: String, validTo: String? = null) {
        trustedCerts[hostname] = TrustedCertEntry(
            sha256Fingerprint = sha256Fingerprint.uppercase(),
            acceptedAt = System.currentTimeMillis(),
            validTo = validTo
        )
        save()
        // Re-install trust manager with updated store
        installCustomTrustManager()
    }

    /** Remove every trusted certificate (logout). The AppTrustManager reads the
     *  live (now-empty) map, so no re-install is needed. */
    fun clearAllTrustedCertificates() {
        trustedCerts.clear()
        certDerData.clear()
        save()
    }

    fun removeTrustedCertificate(hostname: String) {
        trustedCerts.remove(hostname)
        save()
        installCustomTrustManager()
    }

    fun getTrustedCertificates(): List<Map<String, Any>> {
        return trustedCerts.map { (hostname, entry) ->
            val m = mutableMapOf<String, Any>(
                "hostname" to hostname,
                "sha256Fingerprint" to entry.sha256Fingerprint,
                "acceptedAt" to entry.acceptedAt
            )
            entry.validTo?.let { m["validTo"] = it }
            m
        }
    }

    fun isCertificateTrusted(hostname: String): Boolean {
        return trustedCerts.containsKey(hostname)
    }

    /**
     * Check if a certificate chain is trusted for the given hostname.
     * Returns true if the cert's SHA-256 fingerprint matches the stored one.
     * Throws SecurityException with CERT_FINGERPRINT_MISMATCH if the hostname
     * is in the store but the fingerprint doesn't match (certificate rotation).
     */
    fun checkTrust(hostname: String, chain: Array<X509Certificate>): Boolean {
        val entry = trustedCerts[hostname] ?: return false
        if (chain.isEmpty()) return false
        val serverFingerprint = getFingerprint(chain[0])
        if (serverFingerprint.equals(entry.sha256Fingerprint, ignoreCase = true)) {
            return true
        }
        // Hostname is known but fingerprint changed - certificate rotation detected
        throw SecurityException("CERT_FINGERPRINT_MISMATCH: Certificate for $hostname has changed. " +
            "Expected ${entry.sha256Fingerprint}, got $serverFingerprint")
    }

    fun getFingerprint(cert: X509Certificate): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(cert.encoded)
        return hash.joinToString(":") { "%02X".format(it) }
    }

    // ---------- Custom TrustManager installation ----------

    private var defaultTrustManager: X509TrustManager? = null
    private var customSslSocketFactory: SSLSocketFactory? = null
    private var customTrustManager: X509TrustManager? = null

    fun getCustomSslSocketFactory(): SSLSocketFactory? = customSslSocketFactory
    fun getCustomTrustManager(): X509TrustManager? = customTrustManager

    /**
     * Resolve a usable system X509TrustManager. Some stripped Android OEM
     * ROMs (notably MIUI/HyperOS, FunTouchOS) ship a broken JSSE provider
     * where the default algorithm throws or returns no X509 trust managers.
     * Walk a fallback chain rather than crashing.
     */
    private fun getDefaultTrustManager(): X509TrustManager {
        if (defaultTrustManager != null) return defaultTrustManager!!

        val algorithms = listOf(
            TrustManagerFactory.getDefaultAlgorithm(),
            "X509",
            "PKIX",
        ).distinct()

        val errors = mutableListOf<String>()
        for (algo in algorithms) {
            try {
                val tmf = TrustManagerFactory.getInstance(algo)
                tmf.init(null as KeyStore?)
                val tm = tmf.trustManagers
                    .filterIsInstance<X509TrustManager>()
                    .firstOrNull()
                if (tm != null) {
                    defaultTrustManager = tm
                    return tm
                }
                errors += "$algo: no X509TrustManager in factory"
            } catch (e: Throwable) {
                errors += "$algo: ${e.message ?: e.javaClass.simpleName}"
            }
        }
        throw IllegalStateException(
            "No usable X509TrustManager available. Tried: ${errors.joinToString("; ")}"
        )
    }

    private fun installCustomTrustManager() {
        try {
            val appTrustManager = AppTrustManager(getDefaultTrustManager())
            val sslContext = SSLContext.getInstance("TLS")
            sslContext.init(null, arrayOf<TrustManager>(appTrustManager), SecureRandom())
            customSslSocketFactory = sslContext.socketFactory
            customTrustManager = appTrustManager

            // 1. Set the global default SSLSocketFactory and HostnameVerifier.
            //    This covers HttpsURLConnection-based networking, which ExoPlayer
            //    (used by react-native-track-player) uses for audio streaming.
            javax.net.ssl.HttpsURLConnection.setDefaultSSLSocketFactory(customSslSocketFactory)
            javax.net.ssl.HttpsURLConnection.setDefaultHostnameVerifier(
                CustomOkHttpClientFactory.CustomHostnameVerifier()
            )

            // 2. Install the custom OkHttpClient factory for React Native networking
            //    (fetch, Image loading, etc.). Reflection failure here is non-fatal —
            //    the HttpsURLConnection path above is still in place.
            try {
                val providerClass = Class.forName("com.facebook.react.modules.network.OkHttpClientProvider")
                val factoryClass = Class.forName("com.facebook.react.modules.network.OkHttpClientFactory")
                val setMethod = providerClass.getMethod("setOkHttpClientFactory", factoryClass)
                val factory = CustomOkHttpClientFactory(customSslSocketFactory!!, appTrustManager)

                // Create a proxy that implements OkHttpClientFactory
                val proxy = java.lang.reflect.Proxy.newProxyInstance(
                    factoryClass.classLoader,
                    arrayOf(factoryClass)
                ) { _, method, args ->
                    if (method.name == "createNewNetworkModuleClient") {
                        factory.createNewNetworkModuleClient()
                    } else {
                        null
                    }
                }
                setMethod.invoke(null, proxy)
            } catch (e: Exception) {
                android.util.Log.w("SslTrustStore", "Could not install custom OkHttpClientFactory: ${e.message}")
            }

            installSucceeded = true
            lastInstallError = null
        } catch (e: Throwable) {
            installSucceeded = false
            lastInstallError = e.message ?: e.javaClass.simpleName
            android.util.Log.e("SslTrustStore", "installCustomTrustManager failed: $lastInstallError", e)
        }
    }

    /**
     * Custom X509TrustManager that first tries the system trust store,
     * then falls back to our app-level trust store.
     */
    class AppTrustManager(
        private val systemTrustManager: X509TrustManager
    ) : X509TrustManager {

        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
            systemTrustManager.checkClientTrusted(chain, authType)
        }

        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
            try {
                // First, try the system trust store
                systemTrustManager.checkServerTrusted(chain, authType)
            } catch (e: Exception) {
                // System trust failed. Check our custom trust store.
                // Defensive: a malformed peer cert chain (or a stripped JSSE provider
                // delivering an empty array) would otherwise cause an unhandled
                // IndexOutOfBoundsException inside the SSL handshake — bypass our
                // custom trust path and re-throw the original system error instead.
                if (chain.isEmpty()) throw e
                val serverFingerprint = getFingerprint(chain[0])
                val matchingEntry = trustedCerts.entries.find { (_, entry) ->
                    entry.sha256Fingerprint.equals(serverFingerprint, ignoreCase = true)
                }
                if (matchingEntry != null) {
                    return // Trusted by fingerprint match
                }

                // Also check against stored DER data for exact certificate match
                val serverEncoded = chain[0].encoded
                val matchingDer = certDerData.values.any { it.contentEquals(serverEncoded) }
                if (matchingDer) {
                    return // Trusted by DER data match
                }

                throw e
            }
        }

        override fun getAcceptedIssuers(): Array<X509Certificate> {
            return systemTrustManager.acceptedIssuers
        }
    }
}
