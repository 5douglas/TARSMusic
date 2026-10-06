import Foundation

/// Gated, file-based diagnostic logger for the SSL-trust proxy.
///
/// Appends to the SAME shareable log the audio player diagnostics use
/// (`Documents/audio-diagnostics.log`), so a user reporting a self-signed
/// playback problem captures the proxy trace in one correlated timeline.
/// Writing is gated by the SAME flag file the app's "Audio Diagnostics" toggle
/// manages (`Documents/audio-diagnostics-enabled`) — OFF by default, so there
/// is zero cost or noise in normal use; rich tracing only when a user opts in
/// to reproduce an issue. Mirrors `AudioDiagnosticLog`'s append/rotate logic
/// (we can't share its instance — it lives in a different pod — only the file
/// and flag convention, exactly how the JS and native sides already coordinate).
///
/// Callers MUST pass already-redacted strings: this log is user-shareable, so
/// upstream auth params (`t`/`s`/password) must never be written.
enum SslTrustLogger {
    private static let queue = DispatchQueue(label: "expo.ssltrust.log", qos: .utility)
    private static let maxSize: UInt64 = 512 * 1024  // 512KB cap, matches AudioDiagnosticLog
    private static let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    private static let logUrl = docs.appendingPathComponent("audio-diagnostics.log")
    private static let enabledFlagUrl = docs.appendingPathComponent("audio-diagnostics-enabled")
    private static let formatter = ISO8601DateFormatter()

    static func log(_ message: String) {
        queue.async {
            // Disabled (flag file absent) → do nothing, not even format.
            guard FileManager.default.fileExists(atPath: enabledFlagUrl.path) else { return }
            let line = "[\(formatter.string(from: Date()))] [ssl-proxy] \(message)\n"
            // Rotate if over the size cap.
            if let attrs = try? FileManager.default.attributesOfItem(atPath: logUrl.path),
               let size = attrs[.size] as? UInt64, size > maxSize {
                let oldUrl = logUrl.deletingPathExtension().appendingPathExtension("old.log")
                try? FileManager.default.removeItem(at: oldUrl)
                try? FileManager.default.moveItem(at: logUrl, to: oldUrl)
            }
            guard let data = line.data(using: .utf8) else { return }
            if FileManager.default.fileExists(atPath: logUrl.path) {
                if let handle = try? FileHandle(forWritingTo: logUrl) {
                    handle.seekToEndOfFile()
                    handle.write(data)
                    handle.closeFile()
                }
            } else {
                try? data.write(to: logUrl, options: .atomic)
            }
        }
    }
}
