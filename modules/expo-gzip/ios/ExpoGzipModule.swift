import ExpoModulesCore
import Foundation
import zlib

public class ExpoGzipModule: Module {
    public func definition() -> ModuleDefinition {
        Name("ExpoGzip")

        AsyncFunction("compressToFile") { (data: String, destUri: String) -> [String: Any] in
            guard let inputData = data.data(using: .utf8) else {
                throw GzipError.encodingFailed
            }
            guard let destUrl = URL(string: destUri) else {
                throw GzipError.invalidUri
            }

            // Parity with Android (parentFile?.mkdirs()): ensure the destination
            // directory exists before writing — Data.write(to:) does NOT create
            // intermediate directories and fails outright if the parent is
            // missing. withIntermediateDirectories:true is a no-op when it
            // already exists.
            try FileManager.default.createDirectory(
                at: destUrl.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )

            let compressed = try Self.gzipCompress(inputData)
            try compressed.write(to: destUrl)

            return ["bytes": compressed.count]
        }

        AsyncFunction("decompressFromFile") { (sourceUri: String) -> String in
            guard let sourceUrl = URL(string: sourceUri) else {
                throw GzipError.invalidUri
            }

            let compressedData = try Data(contentsOf: sourceUrl)
            let decompressed = try Self.gzipDecompress(compressedData)

            guard let result = String(data: decompressed, encoding: .utf8) else {
                throw GzipError.encodingFailed
            }
            return result
        }
    }

    private static func gzipCompress(_ data: Data) throws -> Data {
        guard !data.isEmpty else { return Data() }

        var stream = z_stream()

        let status = deflateInit2_(
            &stream,
            Z_DEFAULT_COMPRESSION,
            Z_DEFLATED,
            MAX_WBITS + 16, // +16 for gzip header
            MAX_MEM_LEVEL,
            Z_DEFAULT_STRATEGY,
            ZLIB_VERSION,
            Int32(MemoryLayout<z_stream>.size)
        )
        guard status == Z_OK else {
            throw GzipError.compressionFailed(status)
        }

        let bufferSize = Int(deflateBound(&stream, UInt(data.count)))
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer { buffer.deallocate() }

        let result: Int32 = data.withUnsafeBytes { inPtr in
            // U6 hygiene: drop the force-unwrap. The `!data.isEmpty` guard above
            // makes the nil path unreachable in practice, but returning Z_ERRNO
            // here surfaces it as a normal compression failure rather than a
            // process crash if a future caller sidesteps the guard.
            guard let inBaseAddress = inPtr.bindMemory(to: Bytef.self).baseAddress else {
                return Z_ERRNO
            }
            stream.next_in = UnsafeMutablePointer<Bytef>(mutating: inBaseAddress)
            stream.avail_in = uInt(data.count)
            stream.next_out = buffer
            stream.avail_out = uInt(bufferSize)
            return deflate(&stream, Z_FINISH)
        }

        guard result == Z_STREAM_END else {
            deflateEnd(&stream)
            throw GzipError.compressionFailed(result)
        }

        let compressed = Data(bytes: buffer, count: Int(stream.total_out))
        deflateEnd(&stream)
        return compressed
    }

    private static func gzipDecompress(_ data: Data) throws -> Data {
        guard !data.isEmpty else { return Data() }

        var stream = z_stream()

        let status = inflateInit2_(
            &stream,
            MAX_WBITS + 16, // +16 for gzip header
            ZLIB_VERSION,
            Int32(MemoryLayout<z_stream>.size)
        )
        guard status == Z_OK else {
            throw GzipError.decompressionFailed(status)
        }

        var decompressed = Data(capacity: data.count * 4)
        let chunkSize = 65_536
        var buffer = Data(count: chunkSize)
        // Tracks the status of the last inflate() call so we can verify the
        // stream actually completed (Z_STREAM_END) after the loop drains.
        var finalResult: Int32 = Z_OK

        try data.withUnsafeBytes { inPtr in
            // U6 hygiene: replace force-unwrap with throw. Outer closure can throw,
            // so a nil baseAddress on the input buffer surfaces as a normal
            // decompression error instead of an NSException.
            guard let inBaseAddress = inPtr.bindMemory(to: Bytef.self).baseAddress else {
                throw GzipError.decompressionFailed(Z_ERRNO)
            }
            stream.next_in = UnsafeMutablePointer<Bytef>(mutating: inBaseAddress)
            stream.avail_in = uInt(data.count)

            repeat {
                let result: Int32 = buffer.withUnsafeMutableBytes { outPtr in
                    // U6 hygiene: same treatment for the output buffer. Inner
                    // closure must return Int32, so signal failure with Z_ERRNO
                    // and let the outer guard pick it up below.
                    guard let outBaseAddress = outPtr.bindMemory(to: Bytef.self).baseAddress else {
                        return Z_ERRNO
                    }
                    stream.next_out = outBaseAddress
                    stream.avail_out = uInt(chunkSize)
                    return inflate(&stream, Z_NO_FLUSH)
                }

                guard result == Z_OK || result == Z_STREAM_END else {
                    inflateEnd(&stream)
                    throw GzipError.decompressionFailed(result)
                }

                let produced = chunkSize - Int(stream.avail_out)
                decompressed.append(buffer.prefix(produced))
                finalResult = result

                if result == Z_STREAM_END { break }
            } while stream.avail_out == 0
        }

        inflateEnd(&stream)

        // A well-formed gzip member terminates with Z_STREAM_END. If the loop
        // exhausted all available input without reaching it, the file is
        // truncated/corrupt and `decompressed` holds only a partial payload —
        // throw instead of silently returning incomplete data. This matches
        // Android's GZIPInputStream, which raises EOFException on a truncated
        // member rather than returning what it managed to read.
        guard finalResult == Z_STREAM_END else {
            throw GzipError.decompressionFailed(Z_DATA_ERROR)
        }

        return decompressed
    }
}

private enum GzipError: Error, LocalizedError {
    case encodingFailed
    case invalidUri
    case compressionFailed(Int32)
    case decompressionFailed(Int32)

    var errorDescription: String? {
        switch self {
        case .encodingFailed: return "UTF-8 encoding/decoding failed"
        case .invalidUri: return "Invalid file URI"
        case .compressionFailed(let code): return "Gzip compression failed (zlib error \(code))"
        case .decompressionFailed(let code): return "Gzip decompression failed (zlib error \(code))"
        }
    }
}
