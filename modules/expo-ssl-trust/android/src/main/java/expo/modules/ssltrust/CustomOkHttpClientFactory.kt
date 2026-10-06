package expo.modules.ssltrust

import okhttp3.OkHttpClient
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.X509TrustManager

/**
 * Custom OkHttpClient factory that provides an SSL-configured client
 * for React Native's network layer (fetch, Image, etc).
 *
 * Invoked via Proxy from SslTrustStore.installCustomTrustManager().
 */
class CustomOkHttpClientFactory(
    private val sslSocketFactory: SSLSocketFactory,
    private val trustManager: X509TrustManager
) {
    fun createNewNetworkModuleClient(): OkHttpClient {
        // Base on RN's OWN builder — it carries the config NetworkingModule REQUIRES,
        // notably a `ReactCookieJarContainer`. A bare `OkHttpClient.Builder()` leaves
        // the default `CookieJar.NO_COOKIES`, which RN then casts to `CookieJarContainer`
        // → hard crash ("NoCookies cannot be cast to CookieJarContainer"). We ADD only
        // the pinned SSL socket factory + hostname verifier on top.
        //
        // Reflection (not a direct import): this module does not compile-depend on
        // react-android — RN is provided by the host app at runtime — same pattern as
        // SslTrustStore. `createClientBuilder()` does NOT consult the factory, so no
        // recursion.
        val builder = try {
            val providerClass = Class.forName("com.facebook.react.modules.network.OkHttpClientProvider")
            val createClientBuilder = providerClass.getMethod("createClientBuilder")
            createClientBuilder.invoke(null) as OkHttpClient.Builder
        } catch (e: Exception) {
            android.util.Log.w("SslTrustStore", "createClientBuilder() reflection failed: ${e.message}")
            OkHttpClient.Builder()
        }
        return builder
            .sslSocketFactory(sslSocketFactory, trustManager)
            .hostnameVerifier(CustomHostnameVerifier())
            .build()
    }

    /**
     * Custom hostname verifier that allows connections to trusted hosts
     * even when the certificate's CN/SAN doesn't match (common with
     * self-signed certs accessed via IP or non-standard hostname).
     */
    class CustomHostnameVerifier : HostnameVerifier {
        private val defaultVerifier = javax.net.ssl.HttpsURLConnection.getDefaultHostnameVerifier()

        override fun verify(hostname: String, session: javax.net.ssl.SSLSession): Boolean {
            // First try the default verifier
            if (defaultVerifier.verify(hostname, session)) {
                return true
            }

            // If default fails, check if this hostname is in our trust store
            return try {
                val certs = session.peerCertificates
                if (certs.isNotEmpty() && certs[0] is java.security.cert.X509Certificate) {
                    val x509 = certs[0] as java.security.cert.X509Certificate
                    val fingerprint = SslTrustStore.getFingerprint(x509)
                    SslTrustStore.isCertificateTrusted(hostname) ||
                        SslTrustStore.getTrustedCertificates().any { cert ->
                            cert["sha256Fingerprint"] == fingerprint
                        }
                } else {
                    false
                }
            } catch (e: Exception) {
                false
            }
        }
    }
}
