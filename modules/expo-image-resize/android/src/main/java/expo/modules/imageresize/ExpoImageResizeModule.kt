package expo.modules.imageresize

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ColorSpace
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

/**
 * Resize a JPEG file on disk to a target width, preserving aspect ratio,
 * and write the result as a JPEG at the requested quality.
 *
 * Decode strategy (Phases 3 + 4):
 *   1. Fast path: two-pass BitmapFactory (measure + sampled decode).
 *      Covers the vast majority of well-formed JPEG / PNG / WebP
 *      sources at low memory cost.
 *   2. Fallback path: ImageDecoder.decodeBitmap (API 28+). Used when
 *      BitmapFactory returns null — typically CMYK JPEGs or PNGs
 *      with unusual ICC profiles that BitmapFactory's JNI bridge
 *      can't decode. ImageDecoder has broader format coverage and
 *      lets us request explicit ARGB_8888 + sRGB.
 *   3. Always-sanitise pre-flight: every decoded bitmap is forced
 *      to ARGB_8888 (32-bit RGBA), and on API 26+ to the sRGB
 *      colour space, so the JPEG we write is in a colour space
 *      every downstream consumer handles cleanly.
 *
 * Deliberately doesn't use Glide / coroutines — `expo-image-manipulator`
 * Glide-backed loader has a double-resume race that surfaces as
 * `IllegalStateException: alreadyResumed` on Android 16 / tight-
 * lifecycle ROMs. `AsyncFunction` dispatches each call to the Expo
 * module background thread automatically.
 */
class ExpoImageResizeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ExpoImageResize")

    AsyncFunction("resizeImageToFileAsync") { sourceUri: String, targetUri: String, maxWidth: Int, quality: Double ->
      val sourcePath = resolvePath(sourceUri)
        ?: throw Exception("Invalid source URI: $sourceUri")
      val targetPath = resolvePath(targetUri)
        ?: throw Exception("Invalid target URI: $targetUri")

      val sourceFile = File(sourcePath)
      val decoded = decodeSource(sourceFile, maxWidth)
        ?: throw Exception("Failed to decode bitmap: $sourcePath")

      // Scale to exact target width; height preserves aspect ratio.
      val targetWidth = maxWidth.coerceAtLeast(1)
      val aspect = decoded.height.toFloat() / decoded.width.toFloat()
      val targetHeight = (targetWidth * aspect).toInt().coerceAtLeast(1)
      val scaled = if (decoded.width == targetWidth && decoded.height == targetHeight) {
        decoded
      } else {
        Bitmap.createScaledBitmap(decoded, targetWidth, targetHeight, true)
      }

      // Ensure parent directory exists before writing.
      val targetFile = File(targetPath)
      targetFile.parentFile?.mkdirs()

      try {
        FileOutputStream(targetFile).use { out ->
          val q = (quality.coerceIn(0.0, 1.0) * 100).toInt()
          scaled.compress(Bitmap.CompressFormat.JPEG, q, out)
        }
      } finally {
        if (scaled !== decoded) scaled.recycle()
        decoded.recycle()
      }
    }
  }

  /**
   * Two-phase decode + sanitise pipeline.
   *
   * Returns a non-null `Bitmap` in ARGB_8888 colour config (and sRGB
   * colour space on API 26+) or null if every available decoder
   * refused the source.
   */
  private fun decodeSource(file: File, maxWidth: Int): Bitmap? {
    // Phase 1 fast path: BitmapFactory with inSampleSize so we never
    // hold the full-resolution bitmap when maxWidth is much smaller
    // than the source.
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    if (bounds.outWidth > 0 && bounds.outHeight > 0) {
      val sampleSize = calculateInSampleSize(bounds.outWidth, maxWidth)
      val decodeOpts = BitmapFactory.Options().apply {
        inSampleSize = sampleSize
        inPreferredConfig = Bitmap.Config.ARGB_8888
      }
      val fast = BitmapFactory.decodeFile(file.absolutePath, decodeOpts)
      if (fast != null) {
        return normaliseColorSpace(fast)
      }
    }

    // Phase 3 fallback: ImageDecoder is available on API 28+. Broader
    // format coverage than BitmapFactory — handles CMYK JPEGs and
    // ICC-profile-heavy PNGs that the older API rejects. We force
    // ARGB_8888 + (on API 26+) sRGB during the listener callback so
    // any colour-space conversion happens inside the decoder.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val source = ImageDecoder.createSource(file)
      try {
        val decoded = ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
          decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
          // Constrain output dimensions so we don't hold a huge
          // bitmap when maxWidth is small.
          val srcW = info.size.width
          val srcH = info.size.height
          if (srcW > 0 && srcH > 0 && maxWidth > 0 && srcW > maxWidth) {
            val aspect = srcH.toFloat() / srcW.toFloat()
            decoder.setTargetSize(maxWidth, (maxWidth * aspect).toInt().coerceAtLeast(1))
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            decoder.setTargetColorSpace(ColorSpace.get(ColorSpace.Named.SRGB))
          }
        }
        return normaliseColorSpace(decoded)
      } catch (e: Exception) {
        // ImageDecoder rejected too — let the caller throw.
      }
    }

    return null
  }

  /**
   * Phase 4 belt-and-braces: ensure the bitmap we return is in
   * ARGB_8888 + sRGB regardless of which decode path produced it.
   * `BitmapFactory.inPreferredConfig = ARGB_8888` is a HINT — the
   * decoder may ignore it for certain sources — so we explicitly
   * re-create the bitmap if the actual config / colour space drifts.
   */
  private fun normaliseColorSpace(bitmap: Bitmap): Bitmap {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      // Pre-26 has no per-bitmap colour space; ARGB_8888 is the best we can do.
      return if (bitmap.config == Bitmap.Config.ARGB_8888) {
        bitmap
      } else {
        val copy = bitmap.copy(Bitmap.Config.ARGB_8888, false)
        bitmap.recycle()
        copy
      }
    }

    val needsConfigChange = bitmap.config != Bitmap.Config.ARGB_8888
    val srgb = ColorSpace.get(ColorSpace.Named.SRGB)
    val needsColorSpaceChange = bitmap.colorSpace != srgb
    if (!needsConfigChange && !needsColorSpaceChange) {
      return bitmap
    }

    // Bitmap.copy doesn't take a colour space, so build the new bitmap
    // explicitly and draw the original in — that path applies any
    // necessary colour-space conversion.
    val target = Bitmap.createBitmap(
      bitmap.width,
      bitmap.height,
      Bitmap.Config.ARGB_8888,
      bitmap.hasAlpha(),
      srgb,
    )
    val canvas = android.graphics.Canvas(target)
    canvas.drawBitmap(bitmap, 0f, 0f, null)
    bitmap.recycle()
    return target
  }

  private fun resolvePath(uri: String): String? {
    if (uri.startsWith("file://")) {
      return Uri.parse(uri).path
    }
    return uri
  }

  /**
   * Compute a sane inSampleSize for the target width. Android's
   * BitmapFactory only honours powers of 2; `outWidth / maxWidth` rounded
   * down to the nearest power of 2 gives the largest safe step-down
   * without going below the target.
   */
  private fun calculateInSampleSize(sourceWidth: Int, maxWidth: Int): Int {
    if (sourceWidth <= maxWidth || maxWidth <= 0) return 1
    var sample = 1
    while ((sourceWidth / (sample * 2)) >= maxWidth) {
      sample *= 2
    }
    return sample
  }
}
