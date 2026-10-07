import {describe, expect, it} from 'vitest';
import {downmix, encodeWav, MAX_SPEECH_SEC, resample, speechWav, SPEECH_RATE, toPcm16} from './wav';

const tone = (hz: number, rate: number, seconds: number, amplitude = 1) =>
  Float32Array.from({length: Math.round(rate * seconds)}, (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / rate));
const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
/** The middle 60%, away from the edges. */
const middle = (samples: Float32Array) => samples.subarray(Math.floor(samples.length * 0.2), Math.floor(samples.length * 0.8));
/** Loudness of a tone after resampling, relative to before (1 = unchanged). */
const gain = (hz: number, from: number, to = SPEECH_RATE) => rms(middle(resample(tone(hz, from, 1), from, to))) / Math.SQRT1_2;

/** The header fields of a WAV file, read back. */
function readWav(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const ascii = (offset: number) => String.fromCharCode(...new Uint8Array(buffer, offset, 4));
  return {
    riff: ascii(0),
    riffSize: view.getUint32(4, true),
    wave: ascii(8),
    fmt: ascii(12),
    fmtSize: view.getUint32(16, true),
    format: view.getUint16(20, true),
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    byteRate: view.getUint32(28, true),
    blockAlign: view.getUint16(32, true),
    bits: view.getUint16(34, true),
    data: ascii(36),
    dataSize: view.getUint32(40, true),
    samples: Array.from({length: (buffer.byteLength - 44) / 2}, (_, i) => view.getInt16(44 + i * 2, true)),
  };
}

describe('WAV for /speech-to-text', () => {
  it('writes a RIFF/WAVE header for 16 kHz mono 16-bit PCM', () => {
    const wav = readWav(encodeWav(new Float32Array(3), SPEECH_RATE));
    expect(wav).toMatchObject({
      riff: 'RIFF',
      riffSize: 36 + 6,
      wave: 'WAVE',
      fmt: 'fmt ',
      fmtSize: 16,
      format: 1,
      channels: 1,
      sampleRate: 16000,
      byteRate: 32000,
      blockAlign: 2,
      bits: 16,
      data: 'data',
      dataSize: 6,
    });
  });

  it('stores samples as little-endian 16-bit integers, clipped, with silence for non-numbers', () => {
    const wav = readWav(encodeWav(Float32Array.from([0, 0.5, -0.5, 1, -1, 1.7, -3, Number.NaN]), 16000));
    expect(wav.samples).toEqual([0, 16384, -16384, 32767, -32768, 32767, -32768, 0]);
    expect(toPcm16(Float32Array.from([0.25]))[0]).toBe(8192);
  });

  it('averages the channels into one', () => {
    expect(Array.from(downmix([Float32Array.from([1, 0.5, 0]), Float32Array.from([0, 0.5, -1, 9])]))).toEqual([0.5, 0.5, -0.5]);
    const mono = Float32Array.from([0.1, 0.2]);
    expect(downmix([mono])).toBe(mono);
    expect(downmix([])).toHaveLength(0);
  });
});

describe('resampling to 16 kHz', () => {
  it('gives one 16 kHz sample per 1/16000 s, from the usual phone rates', () => {
    expect(resample(new Float32Array(48000), 48000, 16000)).toHaveLength(16000);
    expect(resample(new Float32Array(44100), 44100, 16000)).toHaveLength(16000);
    expect(resample(new Float32Array(8000), 8000, 16000)).toHaveLength(16000);
  });

  it('keeps a steady level the same, right up to the edges', () => {
    const out = resample(new Float32Array(4410).fill(0.5), 44100, 16000);
    for (const sample of out) expect(sample).toBeCloseTo(0.5, 5);
  });

  it('keeps speech frequencies as they were', () => {
    for (const hz of [100, 1000, 3000, 5000]) {
      expect(gain(hz, 48000), `${hz} Hz from 48 kHz`).toBeCloseTo(1, 2);
      expect(gain(hz, 44100), `${hz} Hz from 44.1 kHz`).toBeCloseTo(1, 2);
    }
    // And in the same place: the 1 kHz tone at 16 kHz matches one made at 16 kHz.
    const out = middle(resample(tone(1000, 48000, 1), 48000, 16000));
    const expected = middle(tone(1000, 16000, 1));
    expect(Math.max(...out.map((x, i) => Math.abs(x - expected[i])))).toBeLessThan(0.001);
  });

  it('filters out what 16 kHz can’t carry, instead of folding it back as noise', () => {
    // Without the filter, a 12 kHz tone sampled at 16 kHz comes out as a full-strength 4 kHz tone.
    for (const hz of [8500, 10000, 12000, 20000]) {
      expect(gain(hz, 48000), `${hz} Hz from 48 kHz`).toBeLessThan(0.001);
      expect(gain(hz, 44100), `${hz} Hz from 44.1 kHz`).toBeLessThan(0.001);
    }
  });

  it('copies when the rate is already right', () => {
    const input = Float32Array.from([0.1, -0.2, 0.3]);
    const out = resample(input, 16000, 16000);
    expect(Array.from(out)).toEqual(Array.from(input));
    expect(out).not.toBe(input);
  });
});

describe('a recording, start to finish', () => {
  it('makes a 16 kHz mono WAV from a stereo 48 kHz recording', () => {
    const left = tone(440, 48000, 2, 0.5);
    const wav = readWav(speechWav([left, left], 48000));
    expect(wav).toMatchObject({channels: 1, sampleRate: 16000, bits: 16, dataSize: 2 * 16000 * 2});
    const peak = Math.max(...wav.samples.map(Math.abs));
    expect(peak / 32767).toBeCloseTo(0.5, 2);
  });

  it('keeps at most 15 seconds', () => {
    const wav = readWav(speechWav([new Float32Array(44100 * 20)], 44100));
    expect(wav.dataSize).toBe(MAX_SPEECH_SEC * SPEECH_RATE * 2);
    expect(wav.riffSize).toBe(36 + MAX_SPEECH_SEC * SPEECH_RATE * 2);
  });

  it('makes a valid empty file from an empty recording', () => {
    expect(readWav(speechWav([new Float32Array(0)], 48000))).toMatchObject({riff: 'RIFF', dataSize: 0, samples: []});
  });
});
