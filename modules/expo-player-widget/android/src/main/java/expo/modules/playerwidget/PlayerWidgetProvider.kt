package expo.modules.playerwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.view.View
import android.widget.RemoteViews

/** Home-screen player: cover, title, artist, the lyrics line being sung, and controls. */
class PlayerWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
    NowPlaying.restoreIfNeeded(context)
    manager.updateAppWidget(appWidgetIds, buildViews(context))
  }

  companion object {
    private fun widgetIds(context: Context): IntArray {
      val manager = AppWidgetManager.getInstance(context)
      return manager.getAppWidgetIds(ComponentName(context, PlayerWidgetProvider::class.java))
    }

    /** Redraw every widget from the current state. */
    fun refreshAll(context: Context) {
      val ids = widgetIds(context)
      if (ids.isEmpty()) return
      AppWidgetManager.getInstance(context).updateAppWidget(ids, buildViews(context))
    }

    /** Only the lyrics line changed: a partial update, so the cover is not re-sent. */
    fun refreshLyric(context: Context) {
      val ids = widgetIds(context)
      if (ids.isEmpty()) return
      val views = RemoteViews(context.packageName, R.layout.tarsmusic_widget)
      applyLyric(views)
      AppWidgetManager.getInstance(context).partiallyUpdateAppWidget(ids, views)
    }

    private fun applyLyric(views: RemoteViews) {
      val line = if (NowPlaying.lyricsEnabled) NowPlaying.currentLine else null
      if (line != null) {
        views.setTextViewText(R.id.tarsmusic_widget_lyric, line)
        views.setViewVisibility(R.id.tarsmusic_widget_lyric, View.VISIBLE)
      } else {
        views.setViewVisibility(R.id.tarsmusic_widget_lyric, View.GONE)
      }
    }

    private fun buildViews(context: Context): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.tarsmusic_widget)
      val title = NowPlaying.title
      if (title != null) {
        views.setTextViewText(R.id.tarsmusic_widget_title, title)
        views.setTextViewText(
          R.id.tarsmusic_widget_artist,
          listOfNotNull(NowPlaying.artist, NowPlaying.album).filter { it.isNotBlank() }.joinToString(" • "),
        )
      } else {
        views.setTextViewText(R.id.tarsmusic_widget_title, context.getString(R.string.tarsmusic_widget_idle_title))
        views.setTextViewText(R.id.tarsmusic_widget_artist, context.getString(R.string.tarsmusic_widget_idle_subtitle))
      }
      applyLyric(views)

      val art = NowPlaying.artPath?.let { BitmapFactory.decodeFile(it) }
      if (art != null) {
        views.setImageViewBitmap(R.id.tarsmusic_widget_cover, art)
      } else {
        views.setImageViewResource(R.id.tarsmusic_widget_cover, R.drawable.tarsmusic_widget_cover_placeholder)
      }

      val playing = NowPlaying.isPlaying
      views.setImageViewResource(
        R.id.tarsmusic_widget_play,
        if (playing) R.drawable.tarsmusic_ic_pause else R.drawable.tarsmusic_ic_play,
      )
      views.setContentDescription(
        R.id.tarsmusic_widget_play,
        context.getString(if (playing) R.string.tarsmusic_widget_pause else R.string.tarsmusic_widget_play),
      )

      views.setOnClickPendingIntent(R.id.tarsmusic_widget_play, PlayerWidgetActionReceiver.pendingIntent(context, PlayerWidgetActionReceiver.ACTION_TOGGLE))
      views.setOnClickPendingIntent(R.id.tarsmusic_widget_next, PlayerWidgetActionReceiver.pendingIntent(context, PlayerWidgetActionReceiver.ACTION_NEXT))
      views.setOnClickPendingIntent(R.id.tarsmusic_widget_previous, PlayerWidgetActionReceiver.pendingIntent(context, PlayerWidgetActionReceiver.ACTION_PREVIOUS))
      openAppIntent(context)?.let { views.setOnClickPendingIntent(R.id.tarsmusic_widget_root, it) }
      return views
    }

    /** Opens the app where the user left it. */
    fun openAppIntent(context: Context): PendingIntent? {
      val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
      return PendingIntent.getActivity(
        context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
  }
}
