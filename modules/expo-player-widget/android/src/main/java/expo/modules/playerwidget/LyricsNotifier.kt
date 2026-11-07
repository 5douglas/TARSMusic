package expo.modules.playerwidget

import android.app.NotificationManager
import android.content.Context
import android.os.Build

/**
 * Lyrics are no longer posted as a notification. Builds 8.3.5 created this channel,
 * so it is deleted to drop the leftover entry from the app's notification settings.
 */
internal object LyricsNotifier {
  private const val CHANNEL_ID = "tarsmusic_lyrics"
  private var cleaned = false

  fun removeLegacyChannel(context: Context) {
    if (cleaned || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    cleaned = true
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    manager.deleteNotificationChannel(CHANNEL_ID)
  }
}
