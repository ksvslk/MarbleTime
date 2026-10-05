package app.timejar.spike

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.widget.Toast

/**
 * The strict-mode engine loop (S1–S4): every second, find the foreground app, spend balance while a
 * metered app is in front, and bring LockActivity to the front when the jar is empty.
 */
class WatcherService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var detector: ForegroundDetector
    private var state = State.Free
    private var lastFg: String? = null
    private var lastTick = 0L
    private var lastHeartbeat = 0L
    private var lockShownAt = 0L
    private var warned5 = false
    private var warned1 = false

    private val loop = object : Runnable {
        override fun run() {
            evaluate()
            handler.postDelayed(this, 1000)
        }
    }

    override fun onCreate() {
        super.onCreate()
        detector = ForegroundDetector(this)
        startForeground(1, notification())
        Live.onChange = { handler.post { evaluate() } }
        Log.i(TAG, "Strict: service created usage=${Grants.usageAccess(this)} overlay=${Grants.overlay(this)} a11y=${Grants.accessibility(this)}")
        handler.post(loop)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        Live.onChange = null
        handler.removeCallbacksAndMessages(null)
        Log.i(TAG, "Strict: service destroyed")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun foreground(now: Long): Pair<String?, Long> {
        val polled = detector.poll(now)
        // Accessibility events are instant; prefer them when they are newer than the last UsageStats event.
        val a11y = Live.a11yPackage
        return if (a11y != null && Live.a11yAt > detector.lastEventAt) a11y to Live.a11yAt else polled to detector.lastEventAt
    }

    private fun evaluate() {
        if (!Prefs.enabled(this)) return
        val now = System.currentTimeMillis()
        val (fg, fgAt) = foreground(now)
        val metered = Allowlist.isMetered(fg)

        var balance = Prefs.balanceSec(this)
        if (metered && state != State.Locked && lastTick > 0 && balance > 0) {
            balance = (balance - Engine.spend(now - lastTick, Prefs.fastClock(this))).coerceAtLeast(0)
            Prefs.setBalanceSec(this, balance)
        }
        lastTick = now

        val next = Engine.next(metered, balance)
        if (next != state || fg != lastFg) {
            Log.i(TAG, "Strict: state=$next fg=$fg bal=$balance sinceFgMs=${now - fgAt}")
        }
        state = next
        lastFg = fg

        warn(balance)
        if (state == State.Locked) showLock(fg, now, fgAt)

        if (now - lastHeartbeat >= 60_000) {
            Log.i(TAG, "Strict: heartbeat state=$state fg=$fg bal=$balance")
            lastHeartbeat = now
        }
    }

    private fun warn(balance: Long) {
        if (balance > 300) { warned5 = false; warned1 = false }
        if (state != State.Metering) return
        if (balance in 61..300 && !warned5) { warned5 = true; toast("5 minutes left in the jar") }
        if (balance in 1..60 && !warned1) { warned1 = true; toast("1 minute left in the jar") }
    }

    private fun toast(text: String) {
        Log.i(TAG, "Strict: warn \"$text\"")
        Toast.makeText(this, text, Toast.LENGTH_LONG).show()
    }

    private fun showLock(fg: String?, now: Long, fgAt: Long) {
        if (now - lockShownAt < 1500) return
        lockShownAt = now
        val intent = Intent(this, LockActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NO_ANIMATION)
            .putExtra(LockActivity.EXTRA_BLOCKED, fg)
        try {
            startActivity(intent)
            Log.i(TAG, "Strict: lock fg=$fg sinceFgMs=${now - fgAt}")
        } catch (e: Exception) {
            Log.w(TAG, "Strict: lock FAILED fg=$fg ${e.javaClass.simpleName}: ${e.message}")
        }
    }

    private fun notification(): Notification {
        val channel = "strict"
        return if (Build.VERSION.SDK_INT >= 26) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel(channel, "Strict mode", NotificationManager.IMPORTANCE_MIN))
            Notification.Builder(this, channel)
                .setContentTitle("TimeJar strict mode")
                .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this).setContentTitle("TimeJar strict mode").setSmallIcon(android.R.drawable.ic_lock_idle_lock).build()
        }
    }
}
