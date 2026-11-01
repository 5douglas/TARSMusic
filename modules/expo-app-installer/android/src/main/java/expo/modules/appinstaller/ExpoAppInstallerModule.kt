package expo.modules.appinstaller

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Installs an update of this app from a downloaded APK with the PackageInstaller session API.
 *
 * On Android 12+ an app that updates itself and holds UPDATE_PACKAGES_WITHOUT_USER_ACTION is
 * installed without the "Do you want to install this update?" dialog. When Android still wants
 * the user (older Android, first install from this source, Play Protect), the result receiver
 * opens the system confirmation instead, so the update never silently stalls.
 */
class ExpoAppInstallerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "React context unavailable", null)

  override fun definition() = ModuleDefinition {
    Name("ExpoAppInstaller")

    Function("canRequestPackageInstalls") {
      Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()
    }

    Function("openInstallPermissionSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }

    AsyncFunction("installApk") { path: String ->
      val file = File(Uri.parse(path).path ?: path)
      if (!file.exists()) throw CodedException("ERR_NO_APK", "APK not found: $path", null)

      val installer = context.packageManager.packageInstaller
      val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
      params.setAppPackageName(context.packageName)
      params.setSize(file.length())
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
      }

      val sessionId = installer.createSession(params)
      val session = installer.openSession(sessionId)
      try {
        file.inputStream().use { input ->
          session.openWrite("base.apk", 0, file.length()).use { output ->
            input.copyTo(output)
            session.fsync(output)
          }
        }
        val intent = Intent(context, InstallResultReceiver::class.java)
          .setAction(InstallResultReceiver.ACTION)
          .setPackage(context.packageName)
        var flags = PendingIntent.FLAG_UPDATE_CURRENT
        // The installer fills in the status extras, so the PendingIntent must be mutable.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags = flags or PendingIntent.FLAG_MUTABLE
        val pending = PendingIntent.getBroadcast(context, sessionId, intent, flags)
        session.commit(pending.intentSender)
      } catch (e: Exception) {
        session.abandon()
        throw CodedException("ERR_INSTALL", e.message ?: "Install failed", e)
      } finally {
        session.close()
      }
      true
    }
  }
}
