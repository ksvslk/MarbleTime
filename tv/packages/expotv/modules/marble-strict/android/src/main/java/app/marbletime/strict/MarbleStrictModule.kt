package app.marbletime.strict

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * What MarbleTime's screens can ask of strict mode (Fire OS, sideloaded): turn it on for this TV, say who is
 * watching and how much each has left, read the state for the screen, and take the watched seconds to report to
 * the backend. The counting and the locking are StrictService's and StrictEngine's.
 */
class MarbleStrictModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)

  private fun state(): Map<String, Any?> = synchronized(Strict.lock) {
    mapOf(
      "enabled" to Strict.enabled,
      "usageAccess" to Grants.usageAccess(context),
      "overlay" to Grants.overlay(context),
      "mode" to Strict.engine.mode.name.lowercase(),
      "why" to Strict.engine.why.name.lowercase(),
      "watchers" to Strict.engine.watchers.map { mapOf("childId" to it.childId, "leftSec" to it.leftSec.toDouble()) },
      "bedtimeAllowedUntil" to Strict.engine.bedtimeAllowedUntilMs.toDouble(),
    )
  }

  override fun definition() = ModuleDefinition {
    Name("MarbleStrict")

    OnCreate { Strict.load(context) }

    Function("state") { state() }

    /**
     * Strict mode on or off for this TV; `texts`: the notes shown over a video ("5 minutes left"), where to report
     * (apiUrl, token), and guard "1" when the family has a grown-ups PIN (the TV's settings are then closed to kids).
     */
    Function("setEnabled") { on: Boolean, texts: Map<String, String> ->
      synchronized(Strict.lock) {
        Strict.enabled = on
        Strict.warn5 = texts["warn5"] ?: Strict.warn5
        Strict.warn1 = texts["warn1"] ?: Strict.warn1
        Strict.apiUrl = texts["apiUrl"] ?: Strict.apiUrl
        Strict.token = texts["token"] ?: Strict.token
        Strict.guard = texts["guard"]?.let { it == "1" } ?: Strict.guard
        if (!on) Strict.engine.end()
      }
      Strict.save(context)
      if (on) Strict.startService(context)
      state()
    }

    /** The kids who are watching, each with the time left today as the backend last said, and their bedtime if any. */
    Function("startSession") { watchers: List<Map<String, Any>> ->
      synchronized(Strict.lock) {
        Strict.engine.start(
          watchers.map {
            val from = it["bedFrom"] as? Number
            val to = it["bedTo"] as? Number
            Watcher(it["childId"] as String, (it["leftSec"] as Number).toLong(), if (from != null && to != null) Bedtime(from.toInt(), to.toInt()) else null)
          },
        )
      }
      Strict.save(context)
      state()
    }

    Function("endSession") {
      synchronized(Strict.lock) { Strict.engine.end() }
      Strict.save(context)
      state()
    }

    /** The backend's newest time left for a kid (an approval, a bonus, another TV). */
    Function("setLeft") { childId: String, leftSec: Double ->
      synchronized(Strict.lock) { Strict.engine.setLeft(childId, leftSec.toLong()) }
      Strict.save(context)
    }

    /** Demo clock: a second of watching counts as a minute. */
    Function("setFastClock") { on: Boolean ->
      synchronized(Strict.lock) { Strict.fastClock = on }
      Strict.save(context)
    }

    /** A grown-up entered the PIN on the TV: the TV's settings are open for [minutes]. */
    Function("unlockGrownups") { minutes: Int ->
      synchronized(Strict.lock) { Strict.engine.grownupsUntilMs = System.currentTimeMillis() + minutes * 60_000L }
    }

    /** A grown-up entered the PIN on the TV: the kids may watch past bedtime for [minutes]. */
    Function("allowBedtime") { minutes: Int ->
      synchronized(Strict.lock) { Strict.engine.bedtimeAllowedUntilMs = System.currentTimeMillis() + minutes * 60_000L }
    }

    /** Steps aside after "Watch": whatever was in front before MarbleTime comes back. */
    Function("leave") {
      appContext.currentActivity?.moveTaskToBack(true)
    }
  }
}
