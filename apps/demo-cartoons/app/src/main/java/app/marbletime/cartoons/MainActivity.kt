package app.marbletime.cartoons

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.TextureView
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.mediacodec.MediaCodecUtil
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory

/**
 * A stand-in "video app" for MarbleTime's strict-mode tests and demo video: it plays a Creative Commons
 * cartoon full screen, so no real streaming service (or its content) appears on camera.
 * It decodes in software into a TextureView: the stick's hardware decoder keeps its frames out of screen
 * recordings (FRICTION_LOG, Oct 5), and the demo video is recorded on the stick.
 */
class MainActivity : Activity() {
    private lateinit var player: ExoPlayer

    @OptIn(UnstableApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        val video = TextureView(this)
        root.addView(video, FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT, Gravity.CENTER))

        // CC BY 3.0 asks for credit: shown for the first seconds.
        val credit = TextView(this).apply {
            text = getString(R.string.credit)
            setTextColor(Color.WHITE)
            textSize = 16f
            setPadding(24, 12, 24, 12)
            setBackgroundColor(0x99000000.toInt())
        }
        root.addView(credit, FrameLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT, Gravity.BOTTOM or Gravity.START).apply { setMargins(64, 0, 0, 48) })
        setContentView(root)
        credit.postDelayed({ credit.animate().alpha(0f).duration = 600 }, 8000)

        // Software decoders first, hardware ones only if there is none.
        val renderers = DefaultRenderersFactory(this).setMediaCodecSelector { mimeType, secure, tunneling ->
            MediaCodecUtil.getDecoderInfos(mimeType, secure, tunneling).sortedBy { !it.softwareOnly }
        }
        // Wikimedia answers a generic user agent with 429; its policy asks for a name and a way to reach the maker.
        val http = DefaultHttpDataSource.Factory().setUserAgent(USER_AGENT)
        val sources = DefaultMediaSourceFactory(this).setDataSourceFactory(DefaultDataSource.Factory(this, http))
        player = ExoPlayer.Builder(this, renderers).setMediaSourceFactory(sources).build().apply {
            setVideoTextureView(video)
            setMediaItem(MediaItem.fromUri(VIDEO_URL))
            repeatMode = Player.REPEAT_MODE_ONE
            prepare()
        }
    }

    // It plays only while in front: a TextureView keeps its surface behind MarbleTime's lock screen.
    override fun onStart() {
        super.onStart()
        player.play()
    }

    override fun onStop() {
        super.onStop()
        player.pause()
    }

    override fun onDestroy() {
        player.release()
        super.onDestroy()
    }

    // OK or play/pause on the remote pauses and resumes.
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
            if (player.isPlaying) player.pause() else player.play()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    companion object {
        // Big Buck Bunny (Blender Foundation, CC BY 3.0) as Wikimedia Commons streams it: 480p VP9, ~10 min.
        private const val VIDEO_URL =
            "https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.480p.vp9.webm"
        private const val USER_AGENT = "MarbleTimeDemoCartoons/0.2 (https://github.com/ksvslk/MarbleTime) Media3/1.4.1"
    }
}
