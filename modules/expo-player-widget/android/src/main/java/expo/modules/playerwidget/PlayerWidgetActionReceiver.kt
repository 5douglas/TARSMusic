package expo.modules.playerwidget

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import java.util.concurrent.Executor

/**
 * The widget's buttons. Commands go to the playback session through a MediaController,
 * the same way the lock screen and Bluetooth controls reach it, so the app's own
 * bookkeeping (queue, scrobbles) runs exactly as for those.
 *
 * A media-button broadcast is not enough: on Android 8+ Media3's MediaButtonReceiver
 * only accepts `play`, because it exists to resume a stopped service.
 */
class PlayerWidgetActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action != ACTION_TOGGLE && action != ACTION_NEXT && action != ACTION_PREVIOUS) return
    val app = context.applicationContext
    val pending = goAsync()
    val main = Handler(Looper.getMainLooper())
    val mainExecutor = Executor { main.post(it) }
    val token = SessionToken(app, ComponentName(app, PLAYBACK_SERVICE))
    val future = MediaController.Builder(app, token).buildAsync()
    future.addListener({
      val controller = try {
        future.get()
      } catch (e: Exception) {
        Log.w(TAG, "could not connect to the player: ${e.message}")
        null
      }
      if (controller == null) {
        // No session to talk to: let the system resume the last queue.
        if (action == ACTION_TOGGLE) sendPlayKey(app)
        pending.finish()
        return@addListener
      }
      try {
        when (action) {
          ACTION_TOGGLE -> when {
            controller.mediaItemCount == 0 -> sendPlayKey(app)
            controller.isPlaying -> controller.pause()
            else -> {
              if (controller.playbackState == Player.STATE_IDLE) controller.prepare()
              controller.play()
            }
          }
          ACTION_NEXT -> controller.seekToNext()
          ACTION_PREVIOUS -> controller.seekToPrevious()
        }
      } catch (e: Exception) {
        Log.w(TAG, "widget command failed: ${e.message}")
      }
      // Give the command time to cross to the session before disconnecting.
      main.postDelayed({
        controller.release()
        pending.finish()
      }, RELEASE_DELAY_MS)
    }, mainExecutor)
  }

  companion object {
    private const val TAG = "ExpoPlayerWidget"
    private const val PLAYBACK_SERVICE = "com.margelo.nitro.queueplayer.PlaybackService"
    private const val MEDIA_BUTTON_RECEIVER = "androidx.media3.session.MediaButtonReceiver"
    private const val RELEASE_DELAY_MS = 1_000L

    const val ACTION_TOGGLE = "expo.modules.playerwidget.TOGGLE"
    const val ACTION_NEXT = "expo.modules.playerwidget.NEXT"
    const val ACTION_PREVIOUS = "expo.modules.playerwidget.PREVIOUS"

    fun pendingIntent(context: Context, action: String): PendingIntent {
      val intent = Intent(context, PlayerWidgetActionReceiver::class.java).setAction(action)
      return PendingIntent.getBroadcast(
        context, action.hashCode(), intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    /** The resume path: the player service restores and plays the last queue. */
    private fun sendPlayKey(context: Context) {
      val intent = Intent(Intent.ACTION_MEDIA_BUTTON)
        .setComponent(ComponentName(context.packageName, MEDIA_BUTTON_RECEIVER))
        .putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY))
      context.sendBroadcast(intent)
    }
  }
}
