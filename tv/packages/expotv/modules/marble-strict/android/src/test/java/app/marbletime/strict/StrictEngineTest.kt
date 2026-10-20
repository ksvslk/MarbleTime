package app.marbletime.strict

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StrictEngineTest {
  private fun watching(vararg left: Pair<String, Long>) = StrictEngine().apply { start(left.map { Watcher(it.first, it.second) }) }

  @Test fun `a free app never costs time or locks`() {
    val engine = watching("mia" to 60)
    assertEquals(Mode.Free, engine.tick(false, 30))
    assertEquals(60, engine.leftSec())
    assertEquals(emptyList<Report>(), engine.report { "id" })
  }

  @Test fun `the TV's own home, settings, keyboard and screensaver are free, on Fire TV and Google TV`() {
    val own = "app.marbletime.tv"
    listOf(
      "com.amazon.tv.launcher", "com.amazon.tv.settings.v2", "com.amazon.tv.ime", "com.amazon.ftv.screensaver",
      "com.google.android.apps.tv.launcherx", "com.android.tv.settings", "com.google.android.inputmethod.latin",
      "com.android.dreams.basic", own,
    ).forEach { assertFalse(it, Allowlist.isMetered(it, own)) }
    assertTrue(Allowlist.isMetered("app.marbletime.cartoons", own))
    assertFalse("nothing in front", Allowlist.isMetered(null, own))
  }

  @Test fun `with a family PIN the TV's settings and the uninstall screen are for grown-ups only`() {
    val own = "app.marbletime.tv"
    for (pkg in listOf("com.amazon.tv.settings.v2", "com.android.tv.settings", "com.android.packageinstaller")) {
      assertEquals(pkg, AppKind.GrownupsOnly, Allowlist.kindOf(pkg, own, guard = true))
      assertEquals(pkg, AppKind.Free, Allowlist.kindOf(pkg, own, guard = false)) // no PIN: nobody could open them
    }
    assertEquals(AppKind.Free, Allowlist.kindOf("com.amazon.tv.launcher", own, guard = true))
    assertEquals(AppKind.Metered, Allowlist.kindOf("app.marbletime.cartoons", own, guard = true))
  }

  @Test fun `Amazon's parental-controls PIN in front of settings is left alone, with or without a family PIN`() {
    val own = "app.marbletime.tv"
    assertEquals(AppKind.Free, Allowlist.kindOf("com.amazon.tv.parentalcontrols", own, guard = true))
    assertEquals(AppKind.Free, Allowlist.kindOf("com.amazon.tv.parentalcontrols", own, guard = false))
  }

  @Test fun `a grown-ups-only app stays closed until the PIN opens it for a while, and never costs time`() {
    val engine = watching("mia" to 600)
    assertEquals(Mode.Locked, engine.tick(AppKind.GrownupsOnly, 5, nowMs = 1_000))
    assertEquals(Why.Grownups, engine.why)
    engine.grownupsUntilMs = 2_000
    assertEquals(Mode.Free, engine.tick(AppKind.GrownupsOnly, 5, nowMs = 1_500))
    assertEquals(Mode.Locked, engine.tick(AppKind.GrownupsOnly, 5, nowMs = 2_500))
    assertEquals(600, engine.leftSec())
  }

  @Test fun `a watcher's bedtime locks the video until a grown-up allows more`() {
    val engine = StrictEngine().apply { start(listOf(Watcher("mia", 3_600, Bedtime(19 * 60 + 30, 7 * 60)), Watcher("leo", 3_600))) }
    assertEquals(Mode.Metering, engine.tick(AppKind.Metered, 60, nowMs = 0, minuteOfDay = 19 * 60 + 29))
    assertEquals(Mode.Locked, engine.tick(AppKind.Metered, 60, nowMs = 0, minuteOfDay = 19 * 60 + 30))
    assertEquals(Why.Bedtime, engine.why)
    engine.bedtimeAllowedUntilMs = 10_000
    assertEquals(Mode.Metering, engine.tick(AppKind.Metered, 60, nowMs = 5_000, minuteOfDay = 19 * 60 + 31))
    assertEquals(Mode.Locked, engine.tick(AppKind.Metered, 60, nowMs = 20_000, minuteOfDay = 20 * 60))
    // Locked time costs nothing: only the minute before bedtime and the allowed minute were paid.
    assertEquals(3_600 - 120, engine.leftSec())
  }

  @Test fun `a bedtime can run past midnight`() {
    val night = Bedtime(20 * 60, 7 * 60)
    assertEquals(listOf(true, true, false, false), listOf(23 * 60, 6 * 60 + 59, 7 * 60, 12 * 60).map { night.covers(it) })
    val nap = Bedtime(13 * 60, 15 * 60)
    assertEquals(listOf(true, false), listOf(14 * 60, 16 * 60).map { nap.covers(it) })
  }

  @Test fun `a video app with nobody watching asks who is watching`() {
    val engine = StrictEngine()
    assertEquals(Mode.Locked, engine.tick(true, 1))
    assertEquals(Why.Who, engine.why)
  }

  @Test fun `watching takes real time from every watcher's own jar`() {
    val engine = watching("mia" to 100, "leo" to 300)
    assertEquals(Mode.Metering, engine.tick(true, 40))
    assertEquals(listOf(60L, 260L), engine.watchers.map { it.leftSec })
    var n = 0
    assertEquals(listOf(Report("r1", "mia", 40), Report("r2", "leo", 40)), engine.report { "r${++n}" })
    // Until the backend answers, the same reports are sent again under the same ids, and nothing is counted twice.
    assertEquals(listOf(Report("r1", "mia", 40), Report("r2", "leo", 40)), engine.report { "r${++n}" })
    engine.reported("r1")
    engine.tick(true, 5)
    assertEquals(listOf(Report("r2", "leo", 40), Report("r3", "mia", 5), Report("r4", "leo", 5)), engine.report { "r${++n}" })
  }

  @Test fun `an empty jar locks, and nobody pays past zero`() {
    val engine = watching("mia" to 30, "leo" to 300)
    assertEquals(Mode.Locked, engine.tick(true, 45))
    assertEquals(Why.Empty, engine.why)
    assertEquals(listOf(0L, 270L), engine.watchers.map { it.leftSec })
    assertEquals(listOf(30L, 30L), engine.report { "r" + System.nanoTime() }.map { it.seconds })
    // Still locked, and still nothing more is counted.
    assertEquals(Mode.Locked, engine.tick(true, 10))
    assertEquals(2, engine.report { "r" + System.nanoTime() }.size)
  }

  @Test fun `an approval refills the jar and watching goes on`() {
    val engine = watching("mia" to 10)
    engine.tick(true, 10)
    assertEquals(Mode.Locked, engine.mode)
    // The backend still counts the 10 unreported seconds as left: 610 there is 600 here.
    engine.setLeft("mia", 610)
    assertEquals(600, engine.leftSec())
    assertEquals(Mode.Metering, engine.tick(true, 1))
  }

  @Test fun `time watched before a session and not yet reported is not given twice`() {
    val engine = watching("mia" to 100)
    engine.tick(true, 40)
    engine.start(listOf(Watcher("mia", 100))) // the backend hasn't heard of the 40 seconds yet
    assertEquals(60, engine.leftSec())
    engine.report { "r1" } // on their way, still not counted there
    engine.setLeft("mia", 100)
    assertEquals(60, engine.leftSec())
    engine.reported("r1")
    engine.setLeft("mia", 60)
    assertEquals(60, engine.leftSec())
  }

  @Test fun `the session ends after ten minutes without a video app, so the next kid is asked`() {
    val engine = watching("mia" to 600)
    engine.tick(false, 9 * 60)
    assertEquals(Mode.Metering, engine.tick(true, 1)) // back in time: the pause starts over
    engine.tick(false, 9 * 60)
    engine.tick(false, 60)
    assertEquals(Mode.Locked, engine.tick(true, 1))
    assertEquals(Why.Who, engine.why)
  }
}
