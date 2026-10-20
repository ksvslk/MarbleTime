package app.marbletime.strict

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.widget.Toast
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar
import java.util.UUID
import java.util.concurrent.Executors
import org.json.JSONObject

/**
 * Strict mode's loop: every second it looks which app is in front, lets the engine count the time against the kids
 * who are watching, and brings MarbleTime to the front when the engine says a video app may not be in front
 * (nobody is watching, or a watcher's jar is empty). MarbleTime's own screen is the lock screen.
 */
class StrictService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private lateinit var detector: ForegroundDetector
  private var lastTick = 0L
  /** Milliseconds counted but not yet a whole second. */
  private var carryMs = 0L
  private var lockShownAt = 0L
  private var lastLog = ""
  private var warned5 = false
  private var warned1 = false
  private var lastReport = 0L
  private var lastMode = Mode.Free
  /** One report at a time, off the main thread. */
  private val network = Executors.newSingleThreadExecutor()

  private val loop = object : Runnable {
    override fun run() {
      evaluate()
      handler.postDelayed(this, 1000)
    }
  }

  /** The TV going to sleep ends the session: whoever turns it on next is asked who is watching. */
  private val screenOff = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      synchronized(Strict.lock) { Strict.engine.end() }
      Strict.save(context)
      Log.i(TAG, "Strict: screen off, session ended")
    }
  }

  override fun onCreate() {
    super.onCreate()
    Strict.load(this)
    detector = ForegroundDetector(this)
    startForeground(1, notification())
    registerReceiver(screenOff, IntentFilter(Intent.ACTION_SCREEN_OFF))
    Log.i(TAG, "Strict: service created usage=${Grants.usageAccess(this)} overlay=${Grants.overlay(this)}")
    handler.post(loop)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    unregisterReceiver(screenOff)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun evaluate() {
    val now = System.currentTimeMillis()
    val elapsedMs = if (lastTick == 0L) 0 else (now - lastTick).coerceIn(0, 5000) // a long gap is a sleep, not watching
    lastTick = now
    if (!Strict.enabled) {
      stopSelf()
      return
    }
    val front = detector.poll(now)
    val app = Allowlist.kindOf(front, packageName, Strict.guard)
    val clock = Calendar.getInstance().apply { timeInMillis = now }
    val minuteOfDay = clock.get(Calendar.HOUR_OF_DAY) * 60 + clock.get(Calendar.MINUTE)
    carryMs += if (Strict.fastClock) elapsedMs * 60 else elapsedMs
    val seconds = carryMs / 1000
    carryMs -= seconds * 1000

    var mode: Mode
    var why: Why
    var left: Long
    synchronized(Strict.lock) {
      mode = Strict.engine.tick(app, seconds, now, minuteOfDay)
      why = Strict.engine.why
      left = Strict.engine.leftSec()
    }
    if (seconds > 0 || mode != Mode.Free) Strict.save(this)

    val line = "state=$mode why=$why front=$front left=$left"
    if (line != lastLog && (mode != Mode.Metering || left % 60 == 0L || !lastLog.startsWith("state=Metering"))) Log.i(TAG, "Strict: $line")
    lastLog = line

    if (mode == Mode.Metering) warn(left)
    if (mode == Mode.Locked) showLock(why, now)

    // The backend hears about watched time about once a minute, and at once when watching stops, so the phone and
    // every other screen show the same jar. (MarbleTime's own screens are asleep while a video app is in front.)
    val every = if (Strict.fastClock) 5_000L else 60_000L
    if (now - lastReport >= every || (lastMode == Mode.Metering && mode != Mode.Metering)) {
      lastReport = now
      report()
    }
    lastMode = mode
  }

  /**
   * Sends what was watched (POST /device/usage in backend/openapi.yaml). A report keeps its id until the backend
   * answers, so one sent twice counts once; with no network it waits here, and the TV keeps counting on its own.
   * The answer carries the kid's time left as the backend now has it (an approval on the phone adds to it).
   */
  private fun report() {
    val api = Strict.apiUrl
    val token = Strict.token
    if (api.isEmpty() || token.isEmpty()) return
    val reports = synchronized(Strict.lock) { Strict.engine.report { UUID.randomUUID().toString() } }
    if (reports.isEmpty()) return
    Strict.save(this)
    network.execute {
      for (report in reports) {
        try {
          val connection = URL("$api/device/usage").openConnection() as HttpURLConnection
          connection.requestMethod = "POST"
          connection.connectTimeout = 8000
          connection.readTimeout = 8000
          connection.doOutput = true
          connection.setRequestProperty("Content-Type", "application/json")
          connection.setRequestProperty("Authorization", "Device $token")
          // The backend takes at most an hour per report; more than that only happens on the demo clock.
          val body = JSONObject().put("id", report.id).put("childId", report.childId).put("seconds", report.seconds.coerceIn(1, 3600))
          connection.outputStream.use { it.write(body.toString().toByteArray()) }
          val status = connection.responseCode
          val answer = if (status in 200..299) connection.inputStream.bufferedReader().use { it.readText() } else ""
          connection.disconnect()
          // A refusal (a kid who was removed, a bad report) is final; a busy backend or an unknown TV is tried again.
          if (status in 500..599 || status == 401 || status == 429) continue
          synchronized(Strict.lock) {
            Strict.engine.reported(report.id)
            if (answer.isNotEmpty()) Strict.engine.setLeft(report.childId, JSONObject(answer).optLong("leftTodaySec", -1).takeIf { it >= 0 } ?: return@synchronized)
          }
          Strict.save(this)
        } catch (e: Exception) {
          Log.w(TAG, "Strict: report waits (${e.javaClass.simpleName})")
          break // no network: everything stays for the next try
        }
      }
    }
  }

  /** A calm note over the video shortly before the jar is empty (docs/08 §1.7: the TV ends sessions, gently). */
  private fun warn(left: Long) {
    if (left > 300) {
      warned5 = false
      warned1 = false
    }
    if (left in 61..300 && !warned5) {
      warned5 = true
      if (Strict.warn5.isNotEmpty()) Toast.makeText(this, Strict.warn5, Toast.LENGTH_LONG).show()
    }
    if (left in 1..60 && !warned1) {
      warned1 = true
      if (Strict.warn1.isNotEmpty()) Toast.makeText(this, Strict.warn1, Toast.LENGTH_LONG).show()
    }
  }

  /**
   * MarbleTime comes to the front: on "Who's watching?" (nobody picked, an empty jar, bedtime) or on the grown-ups PIN
   * (the TV's settings); the app that was in front goes to the background, and a video pauses.
   */
  private fun showLock(why: Why, now: Long) {
    if (now - lockShownAt < 1500) return
    lockShownAt = now
    val link = Uri.parse(
      when (why) {
        Why.Grownups -> "marbletime://open?screen=pin&for=settings"
        Why.Bedtime -> "marbletime://open?screen=watch&why=bedtime"
        Why.Empty -> "marbletime://open?screen=watch&why=empty"
        else -> "marbletime://open?screen=watch&why=who"
      },
    )
    val intent = Intent(Intent.ACTION_VIEW, link).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
    try {
      startActivity(intent)
    } catch (e: Exception) {
      Log.w(TAG, "Strict: lock FAILED ${e.javaClass.simpleName}: ${e.message}")
    }
  }

  private fun notification(): Notification {
    val channel = "strict"
    getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(channel, "MarbleTime", NotificationManager.IMPORTANCE_MIN))
    return Notification.Builder(this, channel).setContentTitle("MarbleTime").setSmallIcon(android.R.drawable.ic_lock_idle_lock).build()
  }
}

/** After the stick restarts, strict mode counts again without anyone opening MarbleTime. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    Strict.load(context)
    if (Strict.enabled) Strict.startService(context)
  }
}
