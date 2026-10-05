package app.timejar.spike

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import android.provider.Settings

const val TAG = "Strict"

/** Persistent spike state: the jar balance and the debug fast clock (1 s of use = 1 min). */
object Prefs {
    private fun p(c: Context) = c.getSharedPreferences("strict", Context.MODE_PRIVATE)
    fun balanceSec(c: Context) = p(c).getLong("balanceSec", 120)
    fun setBalanceSec(c: Context, v: Long) = p(c).edit().putLong("balanceSec", v.coerceAtLeast(0)).apply()
    fun fastClock(c: Context) = p(c).getBoolean("fastClock", false)
    fun setFastClock(c: Context, v: Boolean) = p(c).edit().putBoolean("fastClock", v).apply()
    fun enabled(c: Context) = p(c).getBoolean("enabled", true)
    fun setEnabled(c: Context, v: Boolean) = p(c).edit().putBoolean("enabled", v).apply()
}

/** Apps that never cost time. Everything else is metered. Unknown packages are logged so the list can be tuned on the stick. */
object Allowlist {
    private val free = setOf(
        "app.timejar.spike",
        "com.amazon.tv.launcher",      // Fire TV home
        "com.amazon.tv.settings.v2",   // Fire TV settings
        "com.amazon.tv.settings",
        "com.android.systemui",
        "com.amazon.vizzini",          // Alexa voice overlay
        "com.amazon.ftv.screensaver",  // screensaver after ~5 min idle: must never cost time
        "com.amazon.tv.ftvambient",    // ambient experience
        "com.amazon.tv.oobe",
        "com.android.settings",
    )
    fun isMetered(pkg: String?) = pkg != null && pkg !in free
}

enum class State { Free, Metering, Locked }

/** Pure state machine (docs/03 §5.1 without bedtime): unit-testable, no Android types. */
object Engine {
    fun next(fgMetered: Boolean, balanceSec: Long): State = when {
        !fgMetered -> State.Free
        balanceSec > 0 -> State.Metering
        else -> State.Locked
    }

    /** Seconds to take off the jar for [elapsedMs] of metered use. */
    fun spend(elapsedMs: Long, fastClock: Boolean): Long {
        val seconds = elapsedMs / 1000.0
        return Math.round(if (fastClock) seconds * 60 else seconds)
    }
}

/** Foreground app from UsageStats (signal S1). Accessibility events, when enabled, arrive faster through [Live]. */
class ForegroundDetector(context: Context) {
    private val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    var lastPackage: String? = null
        private set
    var lastEventAt = 0L
        private set

    @Suppress("DEPRECATION") // MOVE_TO_FOREGROUND == ACTIVITY_RESUMED (API 29+); minSdk is 25
    fun poll(now: Long = System.currentTimeMillis()): String? {
        val since = if (lastEventAt == 0L) now - 60 * 60_000 else lastEventAt
        val events = usm.queryEvents(since, now)
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

/** In-process hand-off from the accessibility watchdog to the watcher service. */
object Live {
    @Volatile var a11yPackage: String? = null
    @Volatile var a11yAt = 0L
    @Volatile var onChange: (() -> Unit)? = null
}

object Grants {
    fun usageAccess(c: Context): Boolean {
        val ops = c.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        @Suppress("DEPRECATION")
        val mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.packageName)
        return mode == AppOpsManager.MODE_ALLOWED
    }
    fun overlay(c: Context) = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c)
    fun accessibility(c: Context): Boolean {
        val enabled = Settings.Secure.getString(c.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: ""
        return enabled.contains("${c.packageName}/")
    }
}

fun startWatcher(c: Context) {
    val intent = Intent(c, WatcherService::class.java)
    if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(intent) else c.startService(intent)
}
