# expo-ssl-trust

A local Expo native module that provides **Trust-On-First-Use (TOFU)** self-signed SSL certificate management for React Native apps on iOS and Android.

**Author:** Gaven Henry

## Overview

Modern mobile platforms reject connections to servers using self-signed or untrusted SSL certificates. This is a problem for apps that connect to self-hosted servers (such as Subsonic/Navidrome music servers) which commonly use self-signed certificates on internal networks.

`expo-ssl-trust` solves this by allowing the app to:

1. **Inspect** a server's SSL certificate before trusting it
2. **Present** the certificate details to the user for review
3. **Trust** the certificate on a per-hostname basis after user consent
4. **Persist** trust decisions across app restarts
5. **Detect** certificate rotation (fingerprint mismatch) and prompt the user again

This follows the **Trust-On-First-Use (TOFU)** security model — the same approach used by SSH when connecting to a new server for the first time.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   JS Layer                       │
│                                                  │
│  getCertificateInfo()  →  CertificateInfo        │
│  trustCertificate()    →  Native trust store      │
│  removeTrustedCertificate()                       │
│  getTrustedCertificates()                         │
│  isCertificateTrusted()                           │
│  initTrustStore()      →  Installs interceptors   │
│  isSSLError()          →  Error pattern matching   │
├─────────────────────────────────────────────────┤
│               Native Layer                       │
│                                                  │
│  ┌──────────────────┐  ┌──────────────────────┐  │
│  │    Android        │  │       iOS            │  │
│  │                   │  │                      │  │
│  │ OkHttpClient-     │  │ SslTrustURL-         │  │
│  │   Factory         │  │   Protocol           │  │
│  │ X509TrustManager  │  │ URLSession-          │  │
│  │ HttpsURLConnection│  │   Delegate           │  │
│  │   defaults        │  │ Keychain             │  │
│  │ SharedPreferences │  │ UserDefaults         │  │
│  └──────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Networking Layers Covered

The module intercepts SSL validation across **all** networking pathways used by React Native:

| Pathway | Android | iOS |
|---|---|---|
| `fetch` / HTTP requests | Custom `OkHttpClientFactory` | Custom `URLProtocol` |
| `<Image>` component | Custom `OkHttpClientFactory` | Custom `URLProtocol` |
| `react-native-track-player` (audio streaming) | Global `HttpsURLConnection` defaults | Keychain trust anchor |
| `expo/fetch` | Custom `OkHttpClientFactory` | Custom `URLProtocol` |

## Installation

This is a **local Expo module** located at `modules/expo-ssl-trust/`. It is automatically linked by the Expo Modules autolinking system.

### Prerequisites

- Expo SDK 54+
- React Native 0.81+
- iOS 15.1+ deployment target
- Android API 24+ (minSdk)

### Setup

1. The module is registered as a plugin in `app.json`:

```json
{
  "plugins": [
    "./modules/expo-ssl-trust/plugin"
  ]
}
```

2. Run a native rebuild (not a JS-only reload):

```bash
# iOS
npx expo run:ios

# Android
npx expo run:android
```

The config plugin automatically:
- **Android:** Generates `network_security_config.xml` to trust user-installed CAs as a fallback
- **iOS:** No additional config needed — trust is handled at runtime

## API Reference

### Types

#### `CertificateInfo`

Returned by `getCertificateInfo()`. Contains details about a server's SSL certificate.

```typescript
interface CertificateInfo {
  /** Certificate subject (e.g. "CN=navidrome.local") */
  subject: string;
  /** Certificate issuer (e.g. "CN=navidrome.local" for self-signed) */
  issuer: string;
  /** SHA-256 fingerprint in hex (colon-separated) */
  sha256Fingerprint: string;
  /** Validity start date as ISO 8601 string */
  validFrom: string;
  /** Validity end date as ISO 8601 string */
  validTo: string;
  /** Certificate serial number in hex */
  serialNumber: string;
  /** Whether the certificate is self-signed (subject === issuer) */
  isSelfSigned: boolean;
}
```

#### `TrustedCert`

Represents a certificate that the user has trusted.

```typescript
interface TrustedCert {
  /** The hostname this certificate is trusted for */
  hostname: string;
  /** SHA-256 fingerprint of the trusted certificate */
  sha256Fingerprint: string;
  /** Timestamp when the user accepted this certificate (epoch ms) */
  acceptedAt: number;
}
```

### Functions

#### `initTrustStore(): Promise<void>`

Initialize the native trust store and install SSL interceptors. **Must be called early in app startup** before any network requests are made.

```typescript
import { initTrustStore } from 'expo-ssl-trust';

// Call at module scope or in root layout
await initTrustStore();
```

This installs:
- **Android:** Custom `OkHttpClientFactory`, custom `X509TrustManager`, and global `HttpsURLConnection` SSL defaults
- **iOS:** Custom `URLProtocol` subclass for intercepting HTTPS requests

#### `getCertificateInfo(url: string): Promise<CertificateInfo>`

Connect to a server and retrieve its SSL certificate information without performing trust validation. This is used to present the certificate to the user before they decide whether to trust it.

```typescript
import { getCertificateInfo } from 'expo-ssl-trust';

const cert = await getCertificateInfo('https://navidrome.local:4533');
console.log(cert.subject);          // "CN=navidrome.local"
console.log(cert.sha256Fingerprint); // "A1:B2:C3:..."
console.log(cert.isSelfSigned);      // true
```

#### `trustCertificate(hostname: string, sha256Fingerprint: string): Promise<void>`

Add a certificate to the native trust store. After calling this, HTTPS connections to the given hostname whose leaf certificate matches the fingerprint will be accepted.

```typescript
import { trustCertificate } from 'expo-ssl-trust';

await trustCertificate('navidrome.local', cert.sha256Fingerprint);
```

This persists trust in:
- **Android:** `SharedPreferences` + global SSL defaults
- **iOS:** `UserDefaults` + Keychain (for AVPlayer/RNTP)

#### `removeTrustedCertificate(hostname: string): Promise<void>`

Remove a previously trusted certificate. The next connection to this hostname with a self-signed cert will fail, allowing the user to re-evaluate.

```typescript
import { removeTrustedCertificate } from 'expo-ssl-trust';

await removeTrustedCertificate('navidrome.local');
```

#### `getTrustedCertificates(): Promise<TrustedCert[]>`

Retrieve all currently trusted certificates from the native store.

```typescript
import { getTrustedCertificates } from 'expo-ssl-trust';

const certs = await getTrustedCertificates();
certs.forEach(c => {
  console.log(`${c.hostname}: ${c.sha256Fingerprint}`);
});
```

#### `isCertificateTrusted(hostname: string): Promise<boolean>`

Check whether a given hostname has a trusted certificate in the store.

```typescript
import { isCertificateTrusted } from 'expo-ssl-trust';

const trusted = await isCertificateTrusted('navidrome.local');
```

#### `isSSLError(errorMessage: string): boolean`

**Synchronous.** Check whether an error message indicates an SSL certificate trust failure. Matches against known error patterns from both Android (OkHttp, javax.net.ssl) and iOS (NSURLSession, Security framework).

```typescript
import { isSSLError } from 'expo-ssl-trust';

try {
  await fetch('https://navidrome.local:4533/rest/ping');
} catch (error) {
  if (isSSLError(error.message)) {
    // This is an SSL trust error — show the certificate prompt
  }
}
```

Detected patterns include:
- **Android:** `SSLHandshakeException`, `CertPathValidatorException`, `Trust anchor for certification path not found`, etc.
- **iOS:** `NSURLErrorServerCertificateUntrusted`, `The certificate for this server is invalid`, etc.
- **Module-specific:** `CERT_FINGERPRINT_MISMATCH` (certificate rotation detection)

## Certificate Rotation

The module detects when a server presents a certificate with a different fingerprint than a previously trusted one. This is reported as a `CERT_FINGERPRINT_MISMATCH` error, which can be distinguished from a first-time trust prompt to show a more prominent warning to the user (e.g., "The certificate for this server has changed").

## File Structure

```
modules/expo-ssl-trust/
├── README.md                          # This file
├── package.json                       # Module metadata
├── expo-module.config.json            # Expo module registration
├── tsconfig.json                      # TypeScript config
│
├── src/                               # TypeScript API
│   ├── index.ts                       # Public exports
│   ├── ExpoSslTrust.ts               # API functions and types
│   └── ExpoSslTrustModule.ts         # Native module binding (JSI)
│
├── android/                           # Android native code (Kotlin)
│   ├── build.gradle
│   └── src/main/
│       ├── AndroidManifest.xml
│       └── java/expo/modules/ssltrust/
│           ├── ExpoSslTrustModule.kt      # Expo module definition (JS ↔ native bridge)
│           ├── SslTrustStore.kt           # Trust store, custom TrustManager, global SSL defaults
│           ├── CustomOkHttpClientFactory.kt # OkHttp client with custom SSL settings
│           └── CertificateInspector.kt     # Certificate fetching via raw TLS connection
│
├── ios/                               # iOS native code (Swift)
│   ├── ExpoSslTrust.podspec
│   ├── ExpoSslTrustModule.swift       # Expo module definition (JS ↔ native bridge)
│   ├── SslTrustStore.swift            # Trust store, Keychain integration, fingerprint validation
│   ├── SslTrustURLProtocol.swift      # Custom URLProtocol for intercepting HTTPS requests
│   └── CertificateInspector.swift     # Certificate fetching and DER/ASN.1 parsing
│
└── plugin/                            # Expo config plugin
    ├── index.js                       # Plugin entry point
    └── src/
        └── index.js                   # Android network_security_config.xml generation
```

## How It Works

### Typical User Flow

1. User enters their server URL on the login screen
2. App attempts to connect — the connection fails with an SSL error
3. `isSSLError()` identifies this as a certificate trust failure
4. App calls `getCertificateInfo()` to fetch the server's certificate
5. A modal is shown with the certificate details (subject, issuer, fingerprint, validity dates)
6. User reviews and taps "Trust This Certificate"
7. App calls `trustCertificate()` to persist trust natively
8. App retries the original connection — it now succeeds

### Android Implementation Details

- **OkHttpClientFactory:** Overrides React Native's default HTTP client factory to inject a custom `X509TrustManager` that checks the trust store before falling back to system trust
- **HttpsURLConnection defaults:** Sets global `SSLSocketFactory` and `HostnameVerifier` to cover `ExoPlayer` (used by `react-native-track-player`) which bypasses OkHttp
- **SharedPreferences:** Persists trusted certificate fingerprints and DER-encoded certificate data
- **Network Security Config:** The config plugin generates `network_security_config.xml` to trust user-installed CAs as an additional fallback

### iOS Implementation Details

- **URLProtocol:** A custom `URLProtocol` subclass intercepts all HTTPS requests made through `NSURLSession`, performing trust evaluation against the store
- **Keychain:** Stores DER-encoded certificate data in the Keychain so `AVPlayer` (used by `react-native-track-player`) respects the trust decision
- **UserDefaults:** Persists trusted certificate fingerprints for quick lookup
- **DER/ASN.1 parsing:** Since iOS does not expose `SecCertificateCopyValues` (macOS-only), certificate fields are extracted by parsing raw DER-encoded certificate data

## Security Considerations

- **User consent required:** Certificates are never trusted automatically — the user must explicitly review and accept each certificate
- **Per-hostname binding:** Trust is bound to a specific hostname and fingerprint, not a blanket "trust all" toggle
- **Fingerprint verification:** The SHA-256 fingerprint of the leaf certificate is verified on every connection, not just at initial trust time
- **Rotation detection:** If a server's certificate changes, the user is warned and must re-accept
- **No cleartext fallback:** The config plugin explicitly sets `cleartextTrafficPermitted="false"` — only HTTPS is affected

## License

MIT
