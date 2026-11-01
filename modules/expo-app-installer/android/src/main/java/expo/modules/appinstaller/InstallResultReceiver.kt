package expo.modules.appinstaller

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.util.Log

/** Receives the PackageInstaller session result; shows the system prompt when Android asks for one. */
class InstallResultReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION = "expo.modules.appinstaller.INSTALL_RESULT"
    private const val TAG = "ExpoAppInstaller"
  }

  override fun onReceive(context: Context, intent: Intent) {
    when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
      PackageInstaller.STATUS_PENDING_USER_ACTION -> {
        val confirm: Intent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
        } else {
          @Suppress("DEPRECATION")
          intent.getParcelableExtra(Intent.EXTRA_INTENT)
        }
        confirm?.let {
          it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(it)
        }
      }
      PackageInstaller.STATUS_SUCCESS -> Log.i(TAG, "Update installed")
      else -> Log.w(TAG, "Install failed ($status): ${intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)}")
    }
  }
}
