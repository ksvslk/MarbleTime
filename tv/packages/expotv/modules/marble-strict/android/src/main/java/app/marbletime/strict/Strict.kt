package app.marbletime.strict

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

const val TAG = "Strict"

/**
 * Strict mode's state, shared by the service (which counts) and the module (which MarbleTime's screens talk to), and
 * kept in SharedPreferences so a restart of the app or the stick changes nothing. Every use is under [lock].
 */
object Strict {
  val lock = Any()
  val engine = StrictEngine()
  /** Grown-ups turned strict mode on for this TV (the parent app's TV mode). */
  var enabled = false
  /** Demo clock: one second of watching counts as a minute. */
  var fastClock = false
  /** What the "5 minutes left" and "1 minute left" notes say, in the family language (from MarbleTime). */
  var warn5 = ""
  var warn1 = ""
  /** Where watched time is reported: the backend's address and this TV's token (from MarbleTime). */
  var apiUrl = ""
  var token = ""
  /** The family has a grown-ups PIN, so the TV's settings are closed to kids (Allowlist). */
  var guard = false
  private var loaded = false

  private fun prefs(context: Context) = context.getSharedPreferences("strict", Context.MODE_PRIVATE)

  fun load(context: Context) = synchronized(lock) {
    if (loaded) return@synchronized
    loaded = true
    val saved = prefs(context)
    enabled = saved.getBoolean("enabled", false)
    fastClock = saved.getBoolean("fastClock", false)
    warn5 = saved.getString("warn5", "") ?: ""
    warn1 = saved.getString("warn1", "") ?: ""
    apiUrl = saved.getString("apiUrl", "") ?: ""
    token = saved.getString("token", "") ?: ""
    guard = saved.getBoolean("guard", false)
    engine.idleSec = saved.getLong("idleSec", 0)
    try {
      val watchers = JSONArray(saved.getString("watchers", "[]"))
      for (i in 0 until watchers.length()) watchers.getJSONObject(i).let {
        val bedtime = if (it.has("bedFrom")) Bedtime(it.getInt("bedFrom"), it.getInt("bedTo")) else null
        engine.watchers.add(Watcher(it.getString("childId"), it.getLong("leftSec"), bedtime))
      }
      val used = JSONObject(saved.getString("used", "{}") ?: "{}")
      for (childId in used.keys()) engine.used[childId] = used.getLong(childId)
      val pending = JSONArray(saved.getString("pending", "[]"))
      for (i in 0 until pending.length()) pending.getJSONObject(i).let { engine.pending.add(Report(it.getString("id"), it.getString("childId"), it.getLong("seconds"))) }
    } catch (e: Exception) {
      engine.end() // an unreadable save: nobody is watching, which only asks again
    }
  }

  fun save(context: Context) = synchronized(lock) {
    val watchers = JSONArray()
    engine.watchers.forEach { watcher ->
      val saved = JSONObject().put("childId", watcher.childId).put("leftSec", watcher.leftSec)
      watcher.bedtime?.let { saved.put("bedFrom", it.fromMin).put("bedTo", it.toMin) }
      watchers.put(saved)
    }
    val used = JSONObject()
    engine.used.forEach { (childId, seconds) -> used.put(childId, seconds) }
    val pending = JSONArray()
    engine.pending.forEach { pending.put(JSONObject().put("id", it.id).put("childId", it.childId).put("seconds", it.seconds)) }
    prefs(context).edit()
      .putBoolean("enabled", enabled).putBoolean("fastClock", fastClock).putString("warn5", warn5).putString("warn1", warn1)
      .putString("apiUrl", apiUrl).putString("token", token).putBoolean("guard", guard)
      .putLong("idleSec", engine.idleSec).putString("watchers", watchers.toString()).putString("used", used.toString()).putString("pending", pending.toString())
      .apply()
  }

  fun startService(context: Context) {
    val intent = Intent(context, StrictService::class.java)
    if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
  }
}

/**
 * Apps that never cost time: MarbleTime itself, the TV's home and system screens (Fire TV's, and Google TV's so the
 * build also runs on the Android TV emulator). The TV's settings and the screen that uninstalls an app are for
 * grown-ups only when the family has a PIN ([guard]): there a kid could force-stop or remove MarbleTime. Everything
 * else is metered. (A list of free learning apps a parent picks is docs/03 §5.1; not built.)
 */
object Allowlist {
  private val free = setOf(
    "com.amazon.tv.launcher",      // Fire TV home
    "com.android.systemui",
    "com.amazon.vizzini",          // Alexa voice overlay
    "com.amazon.ftv.screensaver",  // the screensaver must never cost time
    "com.amazon.tv.ftvambient",
    "com.amazon.tv.oobe",
    "com.amazon.tv.notificationcenter",
    "com.amazon.tv.ime",           // on-screen keyboard
    // Amazon's own parental-controls PIN, which Fire OS puts in front of settings when the parent turned it on: a
    // guard itself, so it is never metered or locked (a lock there would put "Who's watching?" in a parent's way).
    "com.amazon.tv.parentalcontrols",
    "com.google.android.apps.tv.launcherx", // Google TV home
    "com.google.android.tvlauncher",        // Android TV home
    "com.google.android.inputmethod.latin", // their on-screen keyboard
    "com.google.android.leanback.ime",
    "com.android.dreams.basic",             // their screensavers
    "com.google.android.apps.tv.dreamx",
  )
  private val grownupsOnly = setOf(
    "com.amazon.tv.settings.v2",   // Fire TV settings (Applications → Force stop / Uninstall)
    "com.amazon.tv.settings",
    "com.android.settings",
    "com.android.tv.settings",     // Android TV and Google TV settings
    "com.android.packageinstaller", // "Uninstall this app?"
    "com.google.android.packageinstaller",
  )

  fun kindOf(pkg: String?, own: String, guard: Boolean): AppKind = when {
    pkg == null || pkg == own || pkg in free -> AppKind.Free
    pkg in grownupsOnly -> if (guard) AppKind.GrownupsOnly else AppKind.Free
    else -> AppKind.Metered
  }

  fun isMetered(pkg: String?, own: String) = kindOf(pkg, own, guard = false) == AppKind.Metered
}

/** The app in front, from UsageStats (the spike's signal S1: every app seen within 2 s on the stick). */
class ForegroundDetector(context: Context) {
  private val usage = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
  var lastPackage: String? = null
    private set
  private var lastEventAt = 0L

  @Suppress("DEPRECATION") // MOVE_TO_FOREGROUND is ACTIVITY_RESUMED from API 29
  fun poll(now: Long = System.currentTimeMillis()): String? {
    val events = usage.queryEvents(if (lastEventAt == 0L) now - 60 * 60_000 else lastEventAt, now)
    val event = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      if (event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND && event.timeStamp >= lastEventAt) {
        lastPackage = event.packageName
        lastEventAt = event.timeStamp
      }
    }
    return lastPackage
  }
}

/** The grants strict mode needs (given once over ADB: scripts/fire.sh grant app.marbletime.tv). */
object Grants {
  fun usageAccess(context: Context): Boolean {
    val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    @Suppress("DEPRECATION")
    return ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName) == AppOpsManager.MODE_ALLOWED
  }
  fun overlay(context: Context) = Settings.canDrawOverlays(context)
}
