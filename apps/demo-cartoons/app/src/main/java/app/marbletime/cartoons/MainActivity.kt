package app.marbletime.cartoons

import android.app.Activity
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.VideoView

/**
 * A stand-in "video app" for MarbleTime's strict-mode tests and demo video: it plays a Creative Commons
 * cartoon full screen, so no real streaming service (or its content) appears on camera.
 */
class MainActivity : Activity() {
    private lateinit var video: VideoView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        video = VideoView(this)
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

        video.setVideoURI(Uri.parse(VIDEO_URL))
        video.setOnPreparedListener { player ->
            player.isLooping = true
            video.start()
        }
    }

    override fun onResume() {
        super.onResume()
        video.start()
    }

    // OK or play/pause on the remote pauses and resumes.
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
            if (video.isPlaying) video.pause() else video.start()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    companion object {
        // Big Buck Bunny (Blender Foundation, CC BY 3.0) as Wikimedia Commons streams it: 480p VP9, ~10 min.
        private const val VIDEO_URL =
            "https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.480p.vp9.webm"
    }
}
