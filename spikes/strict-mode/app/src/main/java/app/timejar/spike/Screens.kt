package app.timejar.spike

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

private const val BG = 0xFF2A3A8C.toInt()

private fun column(c: Context) = LinearLayout(c).apply {
    orientation = LinearLayout.VERTICAL
    gravity = Gravity.CENTER
    setBackgroundColor(BG)
    setPadding(96, 54, 96, 54)
}

private fun label(c: Context, text: String, size: Float) = TextView(c).apply {
    this.text = text
    textSize = size
    setTextColor(Color.WHITE)
    gravity = Gravity.CENTER
}

private fun LinearLayout.button(text: String, onClick: () -> Unit): Button = Button(context).apply {
    this.text = text
    textSize = 22f
    isFocusable = true
    setOnClickListener { onClick() }
    this@button.addView(this, LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT).apply { setMargins(16, 12, 16, 12) })
}

/** Spike control panel: grants, balance, fast clock, start/stop. */
class MainActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = column(this)
        root.addView(label(this, "TimeJar strict-mode spike", 40f))
        status = label(this, "", 22f)
        root.addView(status)
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        row.button("Start") { Prefs.setEnabled(this, true); startWatcher(this) }.requestFocus()
        row.button("+1 min") { Prefs.setBalanceSec(this, Prefs.balanceSec(this) + 60) }
        row.button("Empty jar") { Prefs.setBalanceSec(this, 0) }
        row.button("Fast clock") { Prefs.setFastClock(this, !Prefs.fastClock(this)) }
        row.button("Stop") { Prefs.setEnabled(this, false); stopService(Intent(this, WatcherService::class.java)) }
        root.addView(row)
        setContentView(root)
    }

    override fun onResume() {
        super.onResume()
        handler.post(object : Runnable {
            override fun run() {
                status.text = "usage access: ${Grants.usageAccess(this@MainActivity)} · overlay: ${Grants.overlay(this@MainActivity)} · " +
                    "accessibility: ${Grants.accessibility(this@MainActivity)}\n" +
                    "jar: ${Prefs.balanceSec(this@MainActivity)} s · fast clock: ${Prefs.fastClock(this@MainActivity)} · watcher on: ${Prefs.enabled(this@MainActivity)}"
                handler.postDelayed(this, 1000)
            }
        })
    }

    override fun onPause() {
        handler.removeCallbacksAndMessages(null)
        super.onPause()
    }
}

/**
 * Day-1 check R3: can the stick read a brain-game question out loud?
 *   adb shell am start -n app.timejar.spike/.SayActivity --es text "How many apples can you count?"
 * Logs `Strict: tts …` lines for init, start and done.
 */
class SayActivity : Activity(), android.speech.tts.TextToSpeech.OnInitListener {
    private var tts: android.speech.tts.TextToSpeech? = null
    private var text = "How many apples can you count?"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        text = intent.getStringExtra("text") ?: text
        val root = column(this)
        root.addView(label(this, text, 48f))
        setContentView(root)
        // Optional: --es engine com.svox.pico to try another engine than the default.
        tts = android.speech.tts.TextToSpeech(this, this, intent.getStringExtra("engine"))
    }

    override fun onInit(status: Int) {
        val engine = tts ?: return
        Log.i(TAG, "Strict: tts init status=$status requested=${intent.getStringExtra("engine")} default=${engine.defaultEngine} engines=${engine.engines.map { it.name }}")
        if (status != android.speech.tts.TextToSpeech.SUCCESS) { finish(); return }
        val wanted = java.util.Locale.forLanguageTag(intent.getStringExtra("lang") ?: "en-US")
        for (tag in listOf("en-GB", "en-US", wanted.toLanguageTag())) {
            Log.i(TAG, "Strict: tts available $tag=${engine.isLanguageAvailable(java.util.Locale.forLanguageTag(tag))}")
        }
        Log.i(TAG, "Strict: tts setLanguage ${wanted.toLanguageTag()}=${engine.setLanguage(wanted)} voices=${engine.voices?.size}")
        engine.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) { Log.i(TAG, "Strict: tts start") }
            override fun onDone(utteranceId: String?) { Log.i(TAG, "Strict: tts done"); runOnUiThread { finish() } }
            @Deprecated("Required override") override fun onError(utteranceId: String?) { Log.w(TAG, "Strict: tts error") }
        })
        val result = engine.speak(text, android.speech.tts.TextToSpeech.QUEUE_FLUSH, null, "r3")
        Log.i(TAG, "Strict: tts speak result=$result voice=${engine.voice?.name} locale=${engine.voice?.locale}")
    }

    override fun onDestroy() {
        tts?.shutdown()
        super.onDestroy()
    }
}

/** The lock screen (S2): "Your jar is empty". HOME still works; reopening the blocked app locks again. */
class LockActivity : Activity() {
    companion object { const val EXTRA_BLOCKED = "blocked" }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val root = column(this)
        root.addView(label(this, "Your jar is empty", 56f))
        root.addView(label(this, "Do a job to fill it up! (${intent.getStringExtra(EXTRA_BLOCKED) ?: "?"})", 26f))
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        row.button("Do a job") { startActivity(Intent(this, MainActivity::class.java)); finish() }.requestFocus()
        row.button("Grant 1 min (debug)") { Prefs.setBalanceSec(this, 60); finish() }
        root.addView(row, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        setContentView(root)
        Log.i(TAG, "Strict: lock screen shown")
    }

    @Deprecated("Back goes to the board, never back into the blocked app")
    override fun onBackPressed() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
