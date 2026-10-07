#!/usr/bin/env python3
"""Synthesize MarbleTime's sound effects (no third-party samples, so no licence questions) and encode them to MP3.

Usage: python3 scripts/make-sounds.py   (needs `lame`: brew install lame)
Output: tv/packages/shared/src/assets/sfx/*.mp3  (MP3 because Vega's player doesn't list WAV)
"""
import math
import pathlib
import random
import struct
import subprocess
import tempfile
import wave

RATE = 44100
OUT = pathlib.Path(__file__).resolve().parent.parent / "tv/packages/shared/src/assets/sfx"


def tone(freq, dur, decay, amp=1.0, start=0.0, glide=0.0):
    """A sine partial with an exponential decay; `glide` bends the pitch (Hz per second)."""
    def f(t):
        if t < start or t > start + dur:
            return 0.0
        u = t - start
        attack = min(1.0, u / 0.004)  # 4 ms attack: no clicks
        phase = 2 * math.pi * (freq * u + 0.5 * glide * u * u)
        return amp * attack * math.exp(-u / decay) * math.sin(phase)
    return f


def noise_burst(dur, decay, amp, start=0.0, seed=1):
    rng = random.Random(seed)
    samples = [rng.uniform(-1, 1) for _ in range(int(dur * RATE) + 2)]
    def f(t):
        if t < start or t > start + dur:
            return 0.0
        u = t - start
        return amp * math.exp(-u / decay) * samples[int(u * RATE)]
    return f


def render(name, parts, length, gain=0.8):
    n = int(length * RATE)
    data = [sum(p(i / RATE) for p in parts) for i in range(n)]
    peak = max(1e-9, max(abs(x) for x in data))
    fade = int(0.01 * RATE)
    frames = bytearray()
    for i, x in enumerate(data):
        if i > n - fade:
            x *= (n - i) / fade
        frames += struct.pack("<h", int(max(-1.0, min(1.0, x / peak * gain)) * 32767))
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        with wave.open(tmp.name, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(bytes(frames))
        subprocess.run(["lame", "--quiet", "-b", "96", tmp.name, str(OUT / f"{name}.mp3")], check=True)


def clink(base):
    # A glass marble on glass: bright inharmonic partials, very short.
    return [tone(base, 0.25, 0.045), tone(base * 2.71, 0.2, 0.03, 0.6), tone(base * 4.13, 0.15, 0.02, 0.35), noise_burst(0.01, 0.003, 0.25)]


def bell(freq, start, amp=1.0):
    return [tone(freq, 0.9, 0.28, amp, start), tone(freq * 2, 0.6, 0.15, amp * 0.35, start), tone(freq * 3.01, 0.4, 0.08, amp * 0.15, start)]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for i, base in enumerate([2350, 2620, 2900]):
        render(f"clink{i + 1}", clink(base), 0.3, gain=0.7)
    # Lid: a soft "pop" when it opens, a lower "thock" when it closes.
    render("lid-open", [tone(520, 0.12, 0.03, glide=1800), noise_burst(0.02, 0.006, 0.4)], 0.16, gain=0.6)
    render("lid-close", [tone(240, 0.14, 0.04, glide=-300), noise_burst(0.02, 0.008, 0.5, seed=2)], 0.18, gain=0.7)
    # "Yay!": C-E-G-C bells.
    render("yay", bell(523.25, 0) + bell(659.25, 0.11) + bell(783.99, 0.22) + bell(1046.5, 0.33, 1.2), 1.4, gain=0.75)
    # Try again: two soft, low notes going down. Gentle, never scary.
    render("try-again", [tone(392, 0.25, 0.12, 0.8), tone(329.6, 0.35, 0.16, 0.8, 0.18)], 0.6, gain=0.55)
    # "I did it!": a quick upward whoop.
    render("claim", [tone(440, 0.28, 0.12, glide=1600), tone(880, 0.2, 0.07, 0.3, 0.05, glide=2400)], 0.34, gain=0.6)
    # A light tap for OK presses.
    render("tap", [tone(1200, 0.05, 0.012, 0.6), noise_burst(0.006, 0.002, 0.3, seed=3)], 0.07, gain=0.45)
    print("sounds written to", OUT)


if __name__ == "__main__":
    main()
