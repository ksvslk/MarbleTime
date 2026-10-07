/**
 * The kid's spoken idea as POST /speech-to-text takes it (backend/openapi.yaml): 16 kHz, mono, 16-bit PCM WAV,
 * at most 15 s, which Amazon Transcribe streaming reads as it is. Phones record in their own format (WebM/Opus,
 * MP4/AAC) at 44.1 or 48 kHz; recorder.ts decodes that with the Web Audio API, and these pure functions do the
 * rest: one channel, the new rate, 16-bit samples, the WAV header.
 */

export const SPEECH_RATE = 16_000;
export const MAX_SPEECH_SEC = 15;

/** One channel, the average of all of them (a phone's mic is mono anyway; some browsers record two copies). */
export function downmix(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const length = Math.min(...channels.map(channel => channel.length));
  const out = new Float32Array(length);
  for (const channel of channels) for (let i = 0; i < length; i++) out[i] += channel[i];
  for (let i = 0; i < length; i++) out[i] /= channels.length;
  return out;
}

/** Sinc zero crossings on each side of the filter: more is a sharper cutoff, and more work. */
const ZERO_CROSSINGS = 16;
/** The cutoff as a share of the lower rate's Nyquist frequency (6.8 of 8 kHz), leaving room for the transition. */
const CUTOFF = 0.85;
/** Filter values per input sample in the lookup table (finer than any phone needs). */
const TABLE_STEPS = 512;

const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
/** The Blackman window on [−1, 1]. */
const blackman = (x: number) => 0.42 + 0.5 * Math.cos(Math.PI * x) + 0.08 * Math.cos(2 * Math.PI * x);

/**
 * A new sample rate, by windowed-sinc interpolation. Going down, the filter first removes what the lower rate
 * can't carry (above 8 kHz at 16 kHz), which would otherwise fold back into the speech as noise. Each output
 * sample divides by the weights it used, so loudness stays the same right up to the edges.
 */
export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input.slice();
  const step = fromRate / toRate; // input samples per output sample
  const scale = Math.min(1, toRate / fromRate) * CUTOFF; // the cutoff, in half-cycles per input sample
  const halfWidth = Math.ceil(ZERO_CROSSINGS / scale); // in input samples
  const table = new Float32Array(halfWidth * TABLE_STEPS + 1);
  for (let k = 0; k < table.length; k++) {
    const x = k / TABLE_STEPS;
    table[k] = sinc(x * scale) * blackman(x / halfWidth);
  }

  const out = new Float32Array(Math.floor(input.length / step));
  for (let i = 0; i < out.length; i++) {
    const center = i * step;
    const first = Math.max(0, Math.ceil(center - halfWidth));
    const last = Math.min(input.length - 1, Math.floor(center + halfWidth));
    let sum = 0;
    let weights = 0;
    for (let j = first; j <= last; j++) {
      const weight = table[Math.round(Math.abs(j - center) * TABLE_STEPS)];
      sum += input[j] * weight;
      weights += weight;
    }
    out[i] = weights > 0 ? sum / weights : 0;
  }
  return out;
}

/** Samples from −1…1 to signed 16-bit, clipped (and silence for anything that isn't a number). */
export function toPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    out[i] = Math.round(s < 0 ? s * 0x8000 : s * 0x7fff);
  }
  return out;
}

const WAV_HEADER_BYTES = 44;

/** A complete WAV file: the RIFF header, a PCM "fmt " chunk (mono, 16-bit), then the samples, little-endian. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const pcm = toPcm16(samples);
  const dataBytes = pcm.length * 2;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));

  ascii(0, 'RIFF');
  view.setUint32(4, WAV_HEADER_BYTES - 8 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // the size of this chunk
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per sample frame
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(WAV_HEADER_BYTES + i * 2, pcm[i], true);
  return buffer;
}

/** Decoded audio (its channels at its rate) → the WAV the API takes: mono, 16 kHz, the first 15 s. */
export function speechWav(channels: readonly Float32Array[], sampleRate: number): ArrayBuffer {
  const mono = downmix(channels);
  // Cut first, so a long recording isn't resampled only to be thrown away.
  const kept = mono.subarray(0, Math.min(mono.length, Math.ceil(MAX_SPEECH_SEC * sampleRate)));
  const speech = resample(kept, sampleRate, SPEECH_RATE);
  return encodeWav(speech.subarray(0, MAX_SPEECH_SEC * SPEECH_RATE), SPEECH_RATE);
}
