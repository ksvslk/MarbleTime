package app.marbletime.audio

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.SoundPool
import android.os.Handler
import android.os.Looper
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.URL

/**
 * MarbleTime's audio on Fire OS. Sound effects go through SoundPool, which is made for game sounds:
 * low latency, overlapping streams (marbles clinking together). Read-aloud clips play one after another
 * through a plain MediaPlayer. Neither creates a media session, so the remote's play/pause keeps
 * belonging to the video apps.
 */
class MarbleAudioModule : Module() {
  private var pool: SoundPool? = null
  private val soundIds = mutableMapOf<String, Int>()
  private val ready = mutableSetOf<Int>()
  private val pending = mutableMapOf<Int, Float>()

  private var voice: MediaPlayer? = null
  private val lines = ArrayDeque<String>()
  private val handler by lazy { Handler(Looper.myLooper() ?: Looper.getMainLooper()) }

  private val context get() = requireNotNull(appContext.reactContext)

  private fun pool(): SoundPool = pool ?: SoundPool.Builder()
    .setMaxStreams(8)
    .setAudioAttributes(
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_GAME)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
    )
    .build()
    .also { created ->
      created.setOnLoadCompleteListener { p, id, status ->
        synchronized(this) {
          if (status != 0) {
            Log.w(TAG, "load failed id=$id status=$status")
            return@synchronized
          }
          ready.add(id)
          // A sound asked for before it finished loading plays now.
          pending.remove(id)?.let { v -> p.play(id, v, v, 1, 0, 1f) }
        }
      }
      pool = created
    }

  /** Release builds give a raw resource name, the dev server an http URL, local files a path. */
  private fun load(uri: String): Int? {
    soundIds[uri]?.let { return it }
    val p = pool()
    val id = try {
      when {
        uri.startsWith("http") -> {
          val file = File(context.cacheDir, "sfx-${uri.hashCode()}.mp3")
          if (!file.exists()) URL(uri).openStream().use { input -> file.outputStream().use { input.copyTo(it) } }
          p.load(file.absolutePath, 1)
        }
        uri.startsWith("file://") -> p.load(uri.removePrefix("file://"), 1)
        uri.startsWith("/") -> p.load(uri, 1)
        else -> {
          val res = context.resources.getIdentifier(uri, "raw", context.packageName)
          if (res == 0) {
            Log.w(TAG, "no raw resource named $uri")
            return null
          }
          p.load(context, res, 1)
        }
      }
    } catch (e: Exception) {
      Log.w(TAG, "load $uri failed: ${e.message}")
      return null
    }
    soundIds[uri] = id
    return id
  }

  /** Says the clips in order, after stopping whatever was being said. */
  private fun speak(uris: List<String>) {
    stopSpeaking()
    lines.addAll(uris)
    nextLine()
  }

  private fun stopSpeaking() {
    handler.removeCallbacksAndMessages(null)
    lines.clear()
    voice?.release()
    voice = null
  }

  private fun nextLine() {
    voice?.release()
    voice = null
    val uri = lines.removeFirstOrNull() ?: return
    val player = MediaPlayer()
    try {
      player.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_GAME)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )
      when {
        uri.startsWith("http") || uri.startsWith("/") -> player.setDataSource(uri)
        uri.startsWith("file://") -> player.setDataSource(uri.removePrefix("file://"))
        else -> {
          val res = context.resources.getIdentifier(uri, "raw", context.packageName)
          require(res != 0) { "no raw resource named $uri" }
          context.resources.openRawResourceFd(res).use { player.setDataSource(it.fileDescriptor, it.startOffset, it.length) }
        }
      }
      // A short breath between lines, like a person reading.
      player.setOnCompletionListener { handler.postDelayed({ nextLine() }, 250) }
      player.setOnErrorListener { _, what, _ ->
        Log.w(TAG, "voice error $what for $uri")
        nextLine()
        true
      }
      player.setOnPreparedListener { it.start() }
      voice = player
      player.prepareAsync()
    } catch (e: Exception) {
      Log.w(TAG, "voice $uri failed: ${e.message}")
      player.release()
      nextLine()
    }
  }

  private fun play(uri: String, volume: Float) {
    val id = load(uri) ?: return
    synchronized(this) {
      if (id in ready) pool?.play(id, volume, volume, 1, 0, 1f) else pending[id] = volume
    }
  }

  override fun definition() = ModuleDefinition {
    Name("MarbleAudio")

    Function("preload") { uris: List<String> ->
      uris.forEach { load(it) }
    }

    Function("play") { uri: String, volume: Double ->
      play(uri, volume.coerceIn(0.0, 1.0).toFloat())
    }

    Function("speak") { uris: List<String> ->
      speak(uris)
    }

    Function("stopSpeaking") {
      stopSpeaking()
    }

    OnDestroy {
      stopSpeaking()
      pool?.release()
      pool = null
      soundIds.clear()
      ready.clear()
      pending.clear()
    }
  }

  companion object {
    private const val TAG = "MarbleAudio"
  }
}
