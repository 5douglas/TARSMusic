package expo.modules.playerwidget

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

/**
 * Lyrics on the lock screen: a silent notification, public on the lock screen, that
 * shows the line being sung (and the next one) under the media controls while music
 * plays. Removed on pause, when the track has no synced lyrics, or when turned off.
 */
internal object LyricsNotifier {
  private const val CHANNEL_ID = "tarsmusic_lyrics"
  private const val NOTIFICATION_ID = 0x7A5_1C5

  private var shown = false
  private var lastKey: String? = null

  fun update(context: Context) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    val line = NowPlaying.currentLine
    val title = NowPlaying.title
    val show = NowPlaying.lyricsEnabled && NowPlaying.isPlaying && line != null && title != null &&
      manager.areNotificationsEnabled()
    if (!show) {
      cancel(context)
      return
    }
    val next = NowPlaying.nextLine
    val key = "$title|$line|$next"
    if (shown && key == lastKey) return

    ensureChannel(context, manager)
    val subtitle = listOfNotNull(title, NowPlaying.artist).filter { it.isNotBlank() }.joinToString(" • ")
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context).setPriority(Notification.PRIORITY_LOW)
    }
    builder
      .setSmallIcon(R.drawable.tarsmusic_ic_note)
      .setContentTitle(line)
      .setContentText(next ?: subtitle)
      .setSubText(subtitle)
      .setStyle(Notification.BigTextStyle().bigText(if (next != null) "$line\n$next" else line))
      .setColor(0xFF1D9BF0.toInt())
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setCategory(Notification.CATEGORY_STATUS)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setOngoing(true)
      .setLocalOnly(true)
    PlayerWidgetProvider.openAppIntent(context)?.let { builder.setContentIntent(it) }
    try {
      manager.notify(NOTIFICATION_ID, builder.build())
      shown = true
      lastKey = key
    } catch (e: SecurityException) {
      // POST_NOTIFICATIONS revoked between the check and the post.
      shown = false
    }
  }

  fun cancel(context: Context) {
    if (!shown) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    manager.cancel(NOTIFICATION_ID)
    shown = false
    lastKey = null
  }

  private fun ensureChannel(context: Context, manager: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    // DEFAULT importance so the lock screen lists it (many phones hide "silent"
    // notifications there), but with no sound or vibration, and it alerts only once.
    val channel = NotificationChannel(
      CHANNEL_ID,
      context.getString(R.string.tarsmusic_lyrics_channel),
      NotificationManager.IMPORTANCE_DEFAULT,
    ).apply {
      description = context.getString(R.string.tarsmusic_lyrics_channel_description)
      setSound(null, null)
      enableVibration(false)
      enableLights(false)
      setShowBadge(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }
}
