import {describe, expect, it} from 'vitest';
import {integratedLoudness, isSilent, mouthOf, normalise, parseWav, peakDbfs, samplesOf, WavError, wavFile} from '../src/speech/audio';

const RATE = 24_000;

/** A sine of `rmsDb` dBFS RMS (peak 3 dB higher), `seconds` long. */
function sine(rmsDb: number, seconds: number, hz = 997, rate = RATE): Int16Array {
  const amplitude = Math.SQRT2 * 10 ** (rmsDb / 20) * 32768;
  return Int16Array.from({length: Math.round(rate * seconds)}, (_, i) => Math.round(amplitude * Math.sin((2 * Math.PI * hz * i) / rate)));
}

const join = (...parts: Int16Array[]) => {
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

describe('WAV files', () => {
  it('writes and reads back 16-bit mono PCM', () => {
    const samples = Int16Array.from([0, 1, -1, 32767, -32768, 1234]);
    const file = wavFile(samples, RATE);
    expect(file.length).toBe(44 + 12);
    const read = parseWav(file);
    expect([read.format, read.channels, read.sampleRate, read.bits]).toEqual([1, 1, RATE, 16]);
    expect([...samplesOf(read.pcm)]).toEqual([...samples]);
    expect(() => parseWav(Buffer.from('not a wav at all'))).toThrow(WavError);
  });
});

describe('loudness (ITU-R BS.1770-4)', () => {
  it('reads a 997 Hz sine at -23 dBFS RMS as -23 LUFS, at 24 and 48 kHz (as ffmpeg\'s ebur128 does)', () => {
    expect(integratedLoudness(sine(-23, 5), RATE)).toBeCloseTo(-23, 1);
    expect(integratedLoudness(sine(-23, 5, 997, 48_000), 48_000)).toBeCloseTo(-23, 1);
  });

  it('weights frequencies like the standard: a 100 Hz tone reads lower, a 4 kHz tone higher, than 1 kHz', () => {
    expect(integratedLoudness(sine(-23, 3, 100), RATE)).toBeLessThan(-23.5);
    expect(integratedLoudness(sine(-23, 3, 4000), RATE)).toBeGreaterThan(-21);
  });

  it('gates out silence: a tone with long pauses reads about as loud as the tone (only blocks across an edge count less)', () => {
    const tone = sine(-20, 5);
    const silence = new Int16Array(RATE * 3);
    expect(integratedLoudness(join(silence, tone, silence, tone, silence), RATE)).toBeCloseTo(integratedLoudness(tone, RATE), 0);
    expect(integratedLoudness(new Int16Array(RATE), RATE)).toBe(-Infinity);
  });
});

describe('normalising to -16 LUFS with a peak limit at -1.5 dBFS', () => {
  it('raises a quiet line (Polly was about -23 LUFS) and lowers a loud one (Gemini-TTS is about -11)', () => {
    for (const level of [-30, -23, -11]) {
      const {samples, inputLufs, gainDb} = normalise(sine(level, 3), RATE);
      expect(inputLufs).toBeCloseTo(level, 0);
      expect(gainDb).toBeCloseTo(-16 - level, 0);
      expect(integratedLoudness(samples, RATE)).toBeCloseTo(-16, 0);
      expect(peakDbfs(samples)).toBeLessThanOrEqual(-1.5 + 0.01);
    }
  });

  it('limits peaks to -1.5 dBFS and touches only them: the loudness stays at the target', () => {
    // Quiet speech-like tone with a few full-scale clicks: raising it to -16 LUFS would clip the clicks.
    const line = sine(-26, 4, 440);
    for (const at of [RATE / 2, RATE * 1.5, RATE * 3]) line[at] = 32767;
    const before = integratedLoudness(line, RATE);
    const {samples, gainDb} = normalise(line, RATE);
    // The limiter took about half a decibel around the clicks; a second pass made it up.
    expect(gainDb).toBeGreaterThan(-16 - before);
    expect(gainDb).toBeLessThan(-16 - before + 1);
    expect(peakDbfs(samples)).toBeLessThanOrEqual(-1.5 + 0.01);
    expect(peakDbfs(samples)).toBeGreaterThan(-2); // the limiter brought the clicks right to the ceiling
    expect(integratedLoudness(samples, RATE)).toBeCloseTo(-16, 1);
    // Away from the clicks the line is just the gain (within 1%: the release fades over a few hundred ms).
    const gain = 10 ** (gainDb / 20);
    const away = RATE * 2 + 7;
    expect(Math.abs(samples[away] - line[away] * gain)).toBeLessThanOrEqual(Math.abs(line[away] * gain) * 0.01);
  });

  it('a loud line with peaks at 0 dBFS comes out at -16 LUFS, peaks under the ceiling', () => {
    const loud = sine(-8, 2);
    const {samples} = normalise(loud, RATE);
    expect(integratedLoudness(samples, RATE)).toBeCloseTo(-16, 0);
    expect(peakDbfs(samples)).toBeLessThanOrEqual(-1.5 + 0.01);
  });

  it('leaves silence silent and caps the gain of a whisper at +24 dB', () => {
    expect([...normalise(new Int16Array(100), RATE).samples]).toEqual(new Array(100).fill(0));
    const whisper = normalise(sine(-60, 2), RATE);
    expect(whisper.gainDb).toBe(24);
  });
});

describe('silence before listening', () => {
  it('calls digital silence and a quiet room silent, and anything like speech not', () => {
    expect(isSilent(new Int16Array(16000 * 2), 16000)).toBe(true);
    const room = Int16Array.from({length: 16000 * 2}, (_, i) => Math.round(20 * Math.sin(i * 1.7) + 15 * Math.sin(i * 0.37))); // about -62 dBFS
    expect(isSilent(room, 16000)).toBe(true);
    const word = room.slice();
    word.set(sine(-30, 0.2, 200, 16000), 16000); // a short word at -30 dBFS
    expect(isSilent(word, 16000)).toBe(false);
  });
});

describe('the mouth', () => {
  it('stays shut in silence and opens near 1 for loud speech, with a quick attack and a slower release', () => {
    const quiet = new Int16Array(RATE / 5); // 200 ms
    const loud = sine(-16, 0.4, 220); // 400 ms
    const {stepMs, open} = mouthOf(join(quiet, loud, quiet), RATE);
    expect(stepMs).toBe(40);
    expect(open).toHaveLength(20); // 800 ms in steps of 40
    expect(open.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(open[5]).toBeGreaterThanOrEqual(0.75); // quick attack: most of the way in one step
    expect(Math.max(...open.slice(5, 15))).toBeGreaterThanOrEqual(0.95);
    // Slower release: closing over a few steps after the sound stops, then shut.
    expect(open.slice(14)).toEqual([1, 0.55, 0.3, 0.17, 0.09, 0]);
    for (const value of open) expect(value).toBeGreaterThanOrEqual(0), expect(value).toBeLessThanOrEqual(1);
  });

  it('follows loudness: softer steps open less; anything under the noise floor is 0', () => {
    const {open} = mouthOf(join(sine(-16, 0.4, 220), sine(-28, 0.4, 220), sine(-60, 0.4, 220)), RATE);
    const loud = Math.max(...open.slice(2, 10));
    const soft = Math.max(...open.slice(14, 20));
    expect(soft).toBeLessThan(loud);
    expect(soft).toBeGreaterThan(0.2);
    expect(open.slice(24)).toEqual(new Array(open.length - 24).fill(0)); // -60 dBFS is under the floor (24 dB below the top)
    expect(mouthOf(new Int16Array(RATE), RATE).open).toEqual(new Array(25).fill(0));
  });
});
