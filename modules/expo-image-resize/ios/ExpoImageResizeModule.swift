import ExpoModulesCore
import Foundation
import UIKit
import ImageIO
import CoreGraphics

public class ExpoImageResizeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoImageResize")

    // Resize a local image to `maxWidth` pixels wide (aspect-preserving)
    // and write the result as a JPEG at `quality` to `targetUri`.
    //
    // Decode strategy (Phases 2 + 4):
    //   1. Fast path: UIImage(contentsOfFile:) — handles JPEG / PNG /
    //      WebP / HEIC etc. that UIImage natively accepts.
    //   2. Fallback path: CGImageSource decode — used when UIImage
    //      returns nil. CGImageSource has broader format coverage and
    //      gives us the raw CGImage we can re-draw through a known
    //      color space, fixing common "decode succeeds but renderer
    //      barfs" issues with CMYK JPEGs, embedded ICC profiles, and
    //      unusual PNG variants.
    //   3. Always-sanitise pre-flight: regardless of which decode path
    //      produced the image, we draw it into a renderer that's pinned
    //      to standard-range sRGB output, so the JPEG we write is in a
    //      colour space every downstream consumer (RN's <Image>, the
    //      OS preview, share sheet, etc.) handles cleanly.
    //
    // `AsyncFunction` dispatches each call to a background queue
    // automatically.
    AsyncFunction("resizeImageToFileAsync") { (sourceUri: String, targetUri: String, maxWidth: Int, quality: Double) in
      let sourcePath = Self.resolvePath(sourceUri)
      let targetPath = Self.resolvePath(targetUri)

      let source = try Self.decodeSource(sourcePath)
      guard source.size.width > 0, source.size.height > 0 else {
        throw ResizeError.invalidDimensions
      }

      let targetWidth = CGFloat(max(1, maxWidth))
      let aspect = source.size.height / source.size.width
      let targetSize = CGSize(
        width: targetWidth,
        height: max(1, (targetWidth * aspect).rounded())
      )

      // Phase 4: pin the renderer to sRGB / standard range so the
      // output JPEG is in a colour space every downstream consumer
      // handles. Without this the renderer follows the device display
      // (which can be P3 on iPhone 7+), producing wider-gamut JPEGs
      // that subtly mis-render under some Android decoders that
      // ingest covers via share/backup-restore flows.
      let format = UIGraphicsImageRendererFormat()
      format.scale = 1
      format.opaque = true
      format.preferredRange = .standard
      let renderer = UIGraphicsImageRenderer(size: targetSize, format: format)
      let resized = renderer.image { _ in
        source.draw(in: CGRect(origin: .zero, size: targetSize))
      }

      let clampedQuality = CGFloat(max(0.0, min(1.0, quality)))
      guard let data = resized.jpegData(compressionQuality: clampedQuality) else {
        throw ResizeError.encodeFailed
      }

      // Ensure parent directory exists before writing.
      let targetUrl = URL(fileURLWithPath: targetPath)
      try? FileManager.default.createDirectory(
        at: targetUrl.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      try data.write(to: targetUrl)
    }
  }

  /// Two-phase decode: try UIImage first (fast path covers the vast
  /// majority of cover art), then fall back to a CGImageSource +
  /// sRGB-context redraw for sources UIImage refuses. The fallback
  /// path is the recovery for CMYK JPEGs and PNGs with unusual ICC
  /// profiles where UIImage returns nil rather than the canonical
  /// in-memory representation.
  private static func decodeSource(_ sourcePath: String) throws -> UIImage {
    if let fast = UIImage(contentsOfFile: sourcePath) {
      return fast
    }

    // UIImage refused. Try the lower-level ImageIO decoder.
    let url = URL(fileURLWithPath: sourcePath)
    guard let cgSource = CGImageSourceCreateWithURL(url as CFURL, nil) else {
      throw ResizeError.decodeFailed(sourcePath)
    }
    // Force the source to fully decode immediately, into a known sRGB
    // colour space — both options together cover CMYK conversion and
    // strip embedded profiles that would otherwise carry through.
    let options: [CFString: Any] = [
      kCGImageSourceShouldCache: true,
      kCGImageSourceShouldAllowFloat: false,
    ]
    guard let cgImage = CGImageSourceCreateImageAtIndex(cgSource, 0, options as CFDictionary) else {
      throw ResizeError.decodeFailed(sourcePath)
    }

    // Re-draw into an explicit sRGB CGContext to normalise the colour
    // space — CMYK / Lab / CalRGB sources all collapse to sRGB here.
    let width = cgImage.width
    let height = cgImage.height
    guard width > 0, height > 0 else {
      throw ResizeError.invalidDimensions
    }
    guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB) else {
      throw ResizeError.decodeFailed(sourcePath)
    }
    let bitmapInfo = CGBitmapInfo(rawValue:
      CGImageAlphaInfo.noneSkipLast.rawValue
    )
    guard let context = CGContext(
      data: nil,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: 0,
      space: colorSpace,
      bitmapInfo: bitmapInfo.rawValue
    ) else {
      throw ResizeError.decodeFailed(sourcePath)
    }
    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    guard let normalised = context.makeImage() else {
      throw ResizeError.decodeFailed(sourcePath)
    }
    return UIImage(cgImage: normalised)
  }

  private static func resolvePath(_ uri: String) -> String {
    if uri.hasPrefix("file://") {
      return URL(string: uri)?.path ?? String(uri.dropFirst("file://".count))
    }
    return uri
  }
}

private enum ResizeError: Error, LocalizedError {
  case decodeFailed(String)
  case encodeFailed
  case invalidDimensions

  var errorDescription: String? {
    switch self {
    case .decodeFailed(let path): return "Failed to decode image at \(path)"
    case .encodeFailed: return "Failed to encode JPEG"
    case .invalidDimensions: return "Source image has zero dimensions"
    }
  }
}
