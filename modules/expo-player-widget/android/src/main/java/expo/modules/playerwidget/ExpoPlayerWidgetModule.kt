package expo.modules.playerwidget

import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS side: modules/expo-player-widget/src/index.ts, fed by
 * src/services/nowPlayingSurfacesService.ts. All state lives in [NowPlaying] and is
 * only touched on the main thread.
 */
class ExpoPlayerWidgetModule : Module() {
  private val main = Handler(Looper.getMainLooper())

  private fun onMain(block: () -> Unit) {
    val context = appContext.reactContext?.applicationContext ?: return
    main.post {
      NowPlaying.init(context)
      block()
    }
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoPlayerWidget")

    Function("setTrack") { title: String?, artist: String?, album: String? ->
      onMain { NowPlaying.setTrack(title, artist, album) }
    }

    Function("setArtwork") { uri: String? ->
      onMain { NowPlaying.setArtwork(uri) }
    }

    Function("clearTrack") {
      onMain { NowPlaying.clearTrack() }
    }

    Function("setLyrics") { startsMs: List<Double>, lines: List<String> ->
      onMain { NowPlaying.setLyrics(startsMs, lines) }
    }

    Function("syncPosition") { positionMs: Double, advancing: Boolean, playing: Boolean ->
      onMain { NowPlaying.syncPosition(positionMs, advancing, playing) }
    }

    Function("setLyricsEnabled") { enabled: Boolean ->
      onMain { NowPlaying.setLyricsEnabled(enabled) }
    }
  }
}
