package expo.modules.playerwidget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Process-wide now-playing state that feeds the home-screen widget. JS pushes the track, the synced lyrics and position anchors; the
 * line being sung is tracked here on the main looper, because JS timers stop while the
 * app is in the background and the player only reports its position every 10 s there.
 *
 * The last track shown is also kept in SharedPreferences (and its cover in a file) so the
 * widget still shows it after the process dies.
 */
internal object NowPlaying {
  private const val TAG = "ExpoPlayerWidget"
  private const val PREFS = "tarsmusic_player_widget"
  private const val ART_FILE = "tarsmusic_widget_art.png"
  private const val ART_MAX_PX = 360

  /** Light a line slightly early, like the in-app lyrics (`LINE_LEAD_MS`). */
  private const val LINE_LEAD_MS = 150L

  private val main = Handler(Looper.getMainLooper())
  private val io = Executors.newSingleThreadExecutor()

  @Volatile private var appContext: Context? = null

  // Track (main thread only).
  var hasLiveState = false
    private set
  var title: String? = null
    private set
  var artist: String? = null
    private set
  var album: String? = null
    private set
  var artPath: String? = null
    private set
  private var artworkUri: String? = null

  // Playback clock (main thread only).
  var isPlaying = false
    private set
  private var advancing = false
  private var anchorPositionMs = 0.0
  private var anchorAtMs = 0L

  // Lyrics (main thread only).
  var lyricsEnabled = true
    private set
  private var lineStarts = DoubleArray(0)
  private var lines: List<String> = emptyList()
  private var activeLine = -1

  /** The line being sung, null when there is none (no synced lyrics, or before the first line). */
  val currentLine: String?
    get() = lines.getOrNull(activeLine)?.takeIf { it.isNotBlank() }

  fun init(context: Context) {
    if (appContext == null) {
      appContext = context.applicationContext
      LyricsNotifier.removeLegacyChannel(context.applicationContext)
    }
  }

  /** Last track from disk, for a widget drawn by a fresh process before JS has pushed anything. */
  fun restoreIfNeeded(context: Context) {
    init(context)
    if (hasLiveState) return
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    title = prefs.getString("title", null)
    artist = prefs.getString("artist", null)
    album = prefs.getString("album", null)
    artPath = prefs.getString("artPath", null)?.takeIf { File(it).exists() }
  }

  /** A new track: text now, cover via [setArtwork], lyrics via [setLyrics]. */
  fun setTrack(newTitle: String?, newArtist: String?, newAlbum: String?) {
    val context = appContext ?: return
    hasLiveState = true
    title = newTitle
    artist = newArtist
    album = newAlbum
    // A new track starts without lyrics until JS sends them.
    lineStarts = DoubleArray(0)
    lines = emptyList()
    activeLine = -1
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString("title", newTitle)
      .putString("artist", newArtist)
      .putString("album", newAlbum)
      .apply()
    refreshAll()
  }

  fun setArtwork(uri: String?) {
    val context = appContext ?: return
    if (uri == artworkUri) return
    artworkUri = uri
    loadArtwork(context, uri)
    if (uri.isNullOrEmpty()) PlayerWidgetProvider.refreshAll(context)
  }

  fun clearTrack() {
    val context = appContext ?: return
    hasLiveState = true
    title = null
    artist = null
    album = null
    artworkUri = null
    artPath = null
    isPlaying = false
    advancing = false
    lineStarts = DoubleArray(0)
    lines = emptyList()
    activeLine = -1
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    File(context.filesDir, ART_FILE).delete()
    refreshAll()
  }

  fun setLyrics(starts: List<Double>, texts: List<String>) {
    val count = minOf(starts.size, texts.size)
    lineStarts = DoubleArray(count) { starts[it] }
    lines = texts.take(count)
    activeLine = -2 // force the next pick to publish
    tick()
  }

  fun setLyricsEnabled(enabled: Boolean) {
    if (lyricsEnabled == enabled) return
    lyricsEnabled = enabled
    refreshAll()
  }

  /**
   * A position report from the player. `advancing` is whether the clock is running
   * (playing); `playing` is what the play/pause button shows (also true while buffering).
   */
  fun syncPosition(positionMs: Double, advancing: Boolean, playing: Boolean) {
    anchorPositionMs = positionMs
    anchorAtMs = SystemClock.elapsedRealtime()
    this.advancing = advancing
    val playingChanged = playing != isPlaying
    isPlaying = playing
    if (playingChanged) refreshAll() else tick()
  }

  private fun positionNowMs(): Double {
    val elapsed = if (advancing) SystemClock.elapsedRealtime() - anchorAtMs else 0L
    return anchorPositionMs + elapsed
  }

  private val tickRunnable = Runnable { tick() }

  /** Pick the active line, publish it when it changed, and schedule the next line change. */
  private fun tick() {
    main.removeCallbacks(tickRunnable)
    if (lineStarts.isEmpty()) {
      if (activeLine != -1) {
        activeLine = -1
        refreshLyricSurfaces()
      }
      return
    }
    val ms = positionNowMs() + LINE_LEAD_MS
    val idx = pickLine(ms)
    if (idx != activeLine) {
      activeLine = idx
      refreshLyricSurfaces()
    }
    if (advancing && idx + 1 < lineStarts.size) {
      val delay = (lineStarts[idx + 1] - ms).toLong().coerceIn(50L, 60_000L)
      main.postDelayed(tickRunnable, delay)
    }
  }

  /** Index of the last line starting at or before `ms`, -1 before the first. */
  private fun pickLine(ms: Double): Int {
    if (ms < lineStarts[0]) return -1
    var lo = 0
    var hi = lineStarts.size - 1
    while (lo < hi) {
      val mid = (lo + hi + 1) ushr 1
      if (lineStarts[mid] <= ms) lo = mid else hi = mid - 1
    }
    return lo
  }

  private fun refreshLyricSurfaces() {
    val context = appContext ?: return
    PlayerWidgetProvider.refreshLyric(context)
  }

  private fun refreshAll() {
    val context = appContext ?: return
    PlayerWidgetProvider.refreshAll(context)
    tick()
  }

  /* ---------------------------------------------------------------- */
  /*  Artwork                                                          */
  /* ---------------------------------------------------------------- */

  private fun loadArtwork(context: Context, uri: String?) {
    if (uri.isNullOrEmpty()) {
      artPath = null
      return
    }
    io.execute {
      val path = try {
        val bitmap = decode(context, uri)
        if (bitmap != null) {
          val file = File(context.filesDir, ART_FILE)
          FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
          bitmap.recycle()
          file.absolutePath
        } else null
      } catch (e: Exception) {
        Log.w(TAG, "artwork load failed: ${e.message}")
        null
      }
      main.post {
        // A newer track may have replaced this one while the cover loaded.
        if (uri != artworkUri) return@post
        artPath = path
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
          .putString("artPath", path).apply()
        PlayerWidgetProvider.refreshAll(context)
      }
    }
  }

  private fun decode(context: Context, uri: String): Bitmap? {
    val bytes = open(context, uri)?.use { it.readBytes() } ?: return null
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= ART_MAX_PX && bounds.outHeight / (sample * 2) >= ART_MAX_PX) {
      sample *= 2
    }
    val decoded = BitmapFactory.decodeByteArray(
      bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample },
    ) ?: return null
    val largest = maxOf(decoded.width, decoded.height)
    if (largest <= ART_MAX_PX) return decoded
    val scale = ART_MAX_PX.toFloat() / largest
    val scaled = Bitmap.createScaledBitmap(
      decoded, (decoded.width * scale).toInt(), (decoded.height * scale).toInt(), true,
    )
    if (scaled !== decoded) decoded.recycle()
    return scaled
  }

  private fun open(context: Context, uri: String): InputStream? {
    val parsed = Uri.parse(uri)
    return when (parsed.scheme) {
      "http", "https" -> {
        val conn = URL(uri).openConnection() as HttpURLConnection
        conn.connectTimeout = 10_000
        conn.readTimeout = 15_000
        if (conn.responseCode !in 200..299) {
          conn.disconnect()
          null
        } else conn.inputStream
      }
      "file" -> parsed.path?.let { File(it).inputStream() }
      "content" -> context.contentResolver.openInputStream(parsed)
      null -> File(uri).takeIf { it.exists() }?.inputStream()
      else -> null
    }
  }
}
