package app.marbletime.strict

enum class Mode { Free, Metering, Locked }

/**
 * Why MarbleTime is in front: nobody said who is watching, a watcher's jar is empty, a watcher's bedtime has begun,
 * or the app is one only grown-ups may open (the TV's settings, where MarbleTime could be stopped or removed).
 */
enum class Why { None, Who, Empty, Bedtime, Grownups }

/** What the app in front is to strict mode (Allowlist.kindOf): free, a video app that costs time, or grown-ups only. */
enum class AppKind { Free, Metered, GrownupsOnly }

/** A kid's bedtime: minutes after local midnight, [fromMin] up to [toMin]; it runs past midnight when [toMin] is earlier. */
data class Bedtime(val fromMin: Int, val toMin: Int) {
  fun covers(minuteOfDay: Int): Boolean =
    if (fromMin <= toMin) minuteOfDay in fromMin until toMin else minuteOfDay >= fromMin || minuteOfDay < toMin
}

/** A kid who is watching, with the time left in their jar as this TV knows it, and their bedtime if they have one. */
data class Watcher(val childId: String, var leftSec: Long, val bedtime: Bedtime? = null)

/** Watched seconds on their way to the backend; the id stays the same until it answers, so a resend counts once. */
data class Report(val id: String, val childId: String, val seconds: Long)

/**
 * Strict mode's rules (docs/03 §5.1), with no Android types so they are tested on the JVM.
 *
 * The TV is shared, so time runs for the kids picked on "Who's watching?": each pays real time from their own jar.
 * A metered app (any app that isn't allowed for free) may be in front only while somebody is watching and every
 * watcher has time left and no watcher's bedtime has begun. The session ends by itself after [idleEndSec] without a
 * metered app in front, so the next kid is asked again. Apps only grown-ups may open never cost time and stay closed
 * until a grown-up enters the PIN on the TV ([grownupsUntilMs]).
 */
class StrictEngine(private val idleEndSec: Long = 10 * 60) {
  val watchers = mutableListOf<Watcher>()
  /** Until when a grown-up opened the grown-ups-only apps with the PIN (wall-clock ms). */
  var grownupsUntilMs = 0L
  /** Until when a grown-up let the kids watch past bedtime with the PIN (wall-clock ms). */
  var bedtimeAllowedUntilMs = 0L
  /** Watched seconds per kid not yet put into a report. */
  val used = mutableMapOf<String, Long>()
  /** Reports the backend hasn't confirmed yet. */
  val pending = mutableListOf<Report>()
  var idleSec = 0L
  var mode = Mode.Free
    private set
  var why = Why.None
    private set

  fun start(picked: List<Watcher>) {
    watchers.clear()
    // What a kid already watched and hasn't been reported is already out of the jar the backend knows.
    picked.forEach { watchers.add(Watcher(it.childId, maxOf(0, it.leftSec - unreported(it.childId)), it.bedtime)) }
    idleSec = 0
  }

  fun end() {
    watchers.clear()
    idleSec = 0
  }

  /** Seconds a kid watched that the backend hasn't counted yet. */
  fun unreported(childId: String): Long = (used[childId] ?: 0) + pending.filter { it.childId == childId }.sumOf { it.seconds }

  /** The backend's time left for a watcher (after an approval, a bonus, another TV): less what it hasn't counted yet. */
  fun setLeft(childId: String, serverLeftSec: Long) {
    watchers.find { it.childId == childId }?.leftSec = maxOf(0, serverLeftSec - unreported(childId))
  }

  /** Turns the watched seconds into reports ([newId] names each), and returns everything still to send. */
  fun report(newId: () -> String): List<Report> {
    used.filterValues { it > 0 }.forEach { (childId, seconds) -> pending.add(Report(newId(), childId, seconds)) }
    used.clear()
    return pending.toList()
  }

  /** The backend answered a report (or refused it for good): it is done. */
  fun reported(id: String) {
    pending.removeAll { it.id == id }
  }

  /** The least time any watcher has left (0 with nobody watching). */
  fun leftSec(): Long = watchers.minOfOrNull { it.leftSec } ?: 0

  /** A watcher's bedtime has begun at [minuteOfDay] (local; -1: unknown), and no grown-up allowed more. */
  fun bedtimeNow(nowMs: Long, minuteOfDay: Int): Boolean =
    minuteOfDay >= 0 && nowMs >= bedtimeAllowedUntilMs && watchers.any { it.bedtime?.covers(minuteOfDay) == true }

  /** One step: [elapsedSec] passed with a metered app in front, or not. */
  fun tick(metered: Boolean, elapsedSec: Long): Mode = tick(if (metered) AppKind.Metered else AppKind.Free, elapsedSec)

  /** One step: [elapsedSec] passed with an app of this [app] kind in front, at [nowMs] and local [minuteOfDay]. */
  fun tick(app: AppKind, elapsedSec: Long, nowMs: Long = 0, minuteOfDay: Int = -1): Mode {
    if (app != AppKind.Metered) {
      if (watchers.isNotEmpty()) {
        idleSec += elapsedSec
        if (idleSec >= idleEndSec) end()
      }
      // A grown-ups-only app costs no time either; it is closed unless a grown-up opened it with the PIN.
      return if (app == AppKind.GrownupsOnly && nowMs >= grownupsUntilMs) set(Mode.Locked, Why.Grownups) else set(Mode.Free, Why.None)
    }
    idleSec = 0
    if (watchers.isEmpty()) return set(Mode.Locked, Why.Who)
    if (watchers.any { it.leftSec <= 0 }) return set(Mode.Locked, Why.Empty)
    if (bedtimeNow(nowMs, minuteOfDay)) return set(Mode.Locked, Why.Bedtime)
    // Everyone watching pays the same real time, and nobody goes below an empty jar.
    val spend = minOf(maxOf(0, elapsedSec), leftSec())
    for (watcher in watchers) {
      watcher.leftSec -= spend
      used[watcher.childId] = (used[watcher.childId] ?: 0) + spend
    }
    return if (watchers.any { it.leftSec <= 0 }) set(Mode.Locked, Why.Empty) else set(Mode.Metering, Why.None)
  }

  private fun set(next: Mode, reason: Why): Mode {
    mode = next
    why = reason
    return next
  }
}
