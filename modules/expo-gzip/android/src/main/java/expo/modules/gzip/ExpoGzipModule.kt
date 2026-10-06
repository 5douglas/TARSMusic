package expo.modules.gzip

import android.net.Uri
import androidx.core.os.bundleOf
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream

class ExpoGzipModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ExpoGzip")

        AsyncFunction("compressToFile") { data: String, destUri: String ->
            val destPath = Uri.parse(destUri).path
                ?: throw Exception("Invalid destination URI")
            val destFile = File(destPath)
            destFile.parentFile?.mkdirs()

            val inputBytes = data.toByteArray(Charsets.UTF_8)

            FileOutputStream(destFile).use { fos ->
                GZIPOutputStream(fos).use { gzip ->
                    gzip.write(inputBytes)
                }
            }

            bundleOf("bytes" to destFile.length().toDouble())
        }

        AsyncFunction("decompressFromFile") { sourceUri: String ->
            val sourcePath = Uri.parse(sourceUri).path
                ?: throw Exception("Invalid source URI")
            val sourceFile = File(sourcePath)

            val decompressed = FileInputStream(sourceFile).use { fis ->
                GZIPInputStream(fis).use { gzip ->
                    val buffer = ByteArrayOutputStream()
                    val chunk = ByteArray(65_536)
                    var bytesRead: Int
                    while (gzip.read(chunk).also { bytesRead = it } != -1) {
                        buffer.write(chunk, 0, bytesRead)
                    }
                    buffer.toByteArray()
                }
            }

            String(decompressed, Charsets.UTF_8)
        }
    }
}
