package app.timejar.spike

import android.accessibilityservice.AccessibilityService
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import android.view.accessibility.AccessibilityEvent

/** S4: start again after a reboot. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Log.i(TAG, "Strict: boot completed, enabled=${Prefs.enabled(context)}")
        if (Prefs.enabled(context)) startWatcher(context)
    }
}

/**
 * Spike-only adb hooks:
 *   adb shell am broadcast -n app.timejar.spike/.DebugReceiver -a app.timejar.spike.GRANT --ei minutes 1
 *   … -a app.timejar.spike.SET --el seconds 0 · -a app.timejar.spike.FAST --ez on true · -a …START · -a …STOP
 */
class DebugReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            "app.timejar.spike.GRANT" -> Prefs.setBalanceSec(context, Prefs.balanceSec(context) + 60L * intent.getIntExtra("minutes", 1))
            "app.timejar.spike.SET" -> Prefs.setBalanceSec(context, intent.getLongExtra("seconds", 0))
            "app.timejar.spike.FAST" -> Prefs.setFastClock(context, intent.getBooleanExtra("on", true))
            "app.timejar.spike.START" -> { Prefs.setEnabled(context, true); startWatcher(context) }
            "app.timejar.spike.STOP" -> { Prefs.setEnabled(context, false); context.stopService(Intent(context, WatcherService::class.java)) }
        }
        Log.i(TAG, "Strict: debug ${intent.action} bal=${Prefs.balanceSec(context)} fast=${Prefs.fastClock(context)} enabled=${Prefs.enabled(context)}")
    }
}

/**
 * Optional accessibility watchdog (S2/S4/S5): instant window events, and the system restarts an enabled
 * accessibility service, which revives the watcher after the process is killed.
 */
class WatchdogService : AccessibilityService() {
    override fun onServiceConnected() {
        Log.i(TAG, "Strict: a11y watchdog connected")
        if (Prefs.enabled(this)) startWatcher(this)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val pkg = event.packageName?.toString() ?: return
        Live.a11yPackage = pkg
        Live.a11yAt = System.currentTimeMillis()
        Live.onChange?.invoke()
    }

    override fun onInterrupt() = Unit
}
