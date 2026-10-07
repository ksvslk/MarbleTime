/**
 * Audio for the characters' voices: WAV files, loudness (ITU-R BS.1770-4), normalising with a peak limiter, and the
 * mouth's movement. Pure code on 16-bit PCM, mono.
 *
 * Why: Gemini-TTS speaks at about -11 LUFS with peaks at 0 dBFS, Polly at about -23; the TV's read-aloud clips sit near
 * -17. Every line is brought to -16 LUFS with peaks under -1.5 dBFS, so voices match each other and the read-aloud.
 */

// ---------- WAV ----------

export interface Wav {
  sampleRate: number;
  channels: number;
  bits: number;
  /** 1 = PCM (WAVE_FORMAT_EXTENSIBLE is read as its sub-format). */
  format: number;
  /** The sample bytes of the data chunk (little-endian). */
  pcm: Buffer;
}

/** A WAV that can't be read; `problem` says why, for an error message. */
export class WavError extends Error {
  constructor(readonly problem: string) {
    super(problem);
    this.name = 'WavError';
  }
}

/** Reads a RIFF/WAVE file: the format chunk and the data (a streaming size of 0 or 0xFFFFFFFF runs to the end). */
export function parseWav(body: Buffer): Wav {
  if (body.length < 12 || body.toString('ascii', 0, 4) !== 'RIFF' || body.toString('ascii', 8, 12) !== 'WAVE') throw new WavError('this is not a WAV file');
  let format: Omit<Wav, 'pcm'> | undefined;
  for (let at = 12; at + 8 <= body.length;) {
    const id = body.toString('ascii', at, at + 4);
    const size = body.readUInt32LE(at + 4);
    const start = at + 8;
    if (id === 'fmt ') {
      if (size < 16 || start + 16 > body.length) throw new WavError('its format chunk is broken');
      let code = body.readUInt16LE(start);
      // WAVE_FORMAT_EXTENSIBLE: the real format is the first two bytes of the sub-format GUID.
      if (code === 0xfffe && size >= 40 && start + 26 <= body.length) code = body.readUInt16LE(start + 24);
      format = {format: code, channels: body.readUInt16LE(start + 2), sampleRate: body.readUInt32LE(start + 4), bits: body.readUInt16LE(start + 14)};
    } else if (id === 'data') {
      if (!format) throw new WavError('the format chunk must come before the data');
      const end = size === 0 || size === 0xffffffff || start + size > body.length ? body.length : start + size;
      const frame = Math.max(1, format.channels * (format.bits / 8));
      return {...format, pcm: body.subarray(start, end - ((end - start) % frame))};
    }
    at = start + size + (size % 2);
  }
  throw new WavError('it has no audio data');
}

/** 16-bit PCM samples as signed integers. */
export function samplesOf(pcm: Buffer): Int16Array {
  const out = new Int16Array(Math.floor(pcm.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = pcm.readInt16LE(i * 2);
  return out;
}

/** A canonical 44-byte-header WAV of 16-bit mono samples. */
export function wavFile(samples: Int16Array, sampleRate: number): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(samples[i], i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8, 'ascii');
  head.write('fmt ', 12, 'ascii');
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(sampleRate, 24);
  head.writeUInt32LE(sampleRate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36, 'ascii');
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

// ---------- Loudness (ITU-R BS.1770-4) ----------

const FULL_SCALE = 32768;

type Biquad = {b: [number, number, number]; a: [number, number, number]};

/**
 * The K-weighting filter for any sample rate: the standard's high-shelf "pre-filter" and its high-pass "RLB" filter,
 * from their analogue prototypes by the bilinear transform. (The prototype constants are the ones libebur128 derived
 * from the 48 kHz coefficients in BS.1770; MIT, see THIRD_PARTY_NOTICES.md.)
 */
function kWeighting(sampleRate: number): Biquad[] {
  let K = Math.tan((Math.PI * 1681.974450955533) / sampleRate);
  let Q = 0.7071752369554196;
  const Vh = 10 ** (3.999843853973347 / 20);
  const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0],
    a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
  };
  K = Math.tan((Math.PI * 38.13547087602444) / sampleRate);
  Q = 0.5003270373238773;
  a0 = 1 + K / Q + K * K;
  const highPass: Biquad = {b: [1, -2, 1], a: [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0]};
  return [shelf, highPass];
}

function filter(input: Float64Array, {b, a}: Biquad): Float64Array {
  const out = new Float64Array(input.length);
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = b[0] * x + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    [x2, x1, y2, y1] = [x1, x, y1, y];
    out[i] = y;
  }
  return out;
}

const blockLoudness = (meanSquare: number) => -0.691 + 10 * Math.log10(meanSquare);

/**
 * Integrated loudness in LUFS (BS.1770-4: K-weighting, 400 ms blocks every 100 ms, gated at -70 LUFS and 10 LU below
 * the ungated mean). -Infinity for silence. A line shorter than a block is measured as one block.
 */
export function integratedLoudness(samples: Int16Array, sampleRate: number): number {
  let signal: Float64Array = Float64Array.from(samples, s => s / FULL_SCALE);
  for (const stage of kWeighting(sampleRate)) signal = filter(signal, stage);
  const block = Math.round(0.4 * sampleRate);
  const hop = Math.round(0.1 * sampleRate);
  const powers: number[] = [];
  if (signal.length < block) {
    powers.push(signal.reduce((sum, v) => sum + v * v, 0) / Math.max(1, signal.length));
  } else {
    for (let start = 0; start + block <= signal.length; start += hop) {
      let sum = 0;
      for (let i = start; i < start + block; i++) sum += signal[i] * signal[i];
      powers.push(sum / block);
    }
  }
  const loud = powers.filter(p => p > 0 && blockLoudness(p) > -70);
  if (!loud.length) return -Infinity;
  const relative = blockLoudness(loud.reduce((a, b) => a + b, 0) / loud.length) - 10;
  const gated = loud.filter(p => blockLoudness(p) > relative);
  return blockLoudness(gated.reduce((a, b) => a + b, 0) / gated.length);
}

export const peakDbfs = (samples: Int16Array) => {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  return peak ? 20 * Math.log10(peak / FULL_SCALE) : -Infinity;
};

export interface Normalised {
  samples: Int16Array;
  /** The line's loudness as it came, and the gain applied before limiting. */
  inputLufs: number;
  gainDb: number;
}

/** The most a line is raised: a near-silent line stays near silent. */
const MAX_GAIN_DB = 24;

/**
 * Brings speech to `targetLufs` (default -16) and keeps its peaks under `ceilingDb` (default -1.5 dBFS) with a
 * look-ahead limiter: the gain dips smoothly over ~5 ms before a peak and recovers over ~80 ms, so only the peaks are
 * touched. Where the limiter had much to do, a second pass makes up the loudness it took. The gain is at most +24 dB;
 * silence is returned as it is.
 */
export function normalise(samples: Int16Array, sampleRate: number, options: {targetLufs?: number; ceilingDb?: number} = {}): Normalised {
  const {targetLufs = -16, ceilingDb = -1.5} = options;
  const inputLufs = integratedLoudness(samples, sampleRate);
  if (!Number.isFinite(inputLufs)) return {samples: Int16Array.from(samples), inputLufs, gainDb: 0};
  let gainDb = Math.min(MAX_GAIN_DB, targetLufs - inputLufs);
  let out = limit(samples, sampleRate, gainDb, ceilingDb);
  const short = targetLufs - integratedLoudness(out, sampleRate);
  if (short > 0.1 && gainDb < MAX_GAIN_DB) {
    gainDb = Math.min(MAX_GAIN_DB, gainDb + short);
    out = limit(samples, sampleRate, gainDb, ceilingDb);
  }
  return {samples: out, inputLufs, gainDb};
}

/** The samples raised (or lowered) by `gainDb`, with peaks held under `ceilingDb` by a look-ahead limiter. */
function limit(samples: Int16Array, sampleRate: number, gainDb: number, ceilingDb: number): Int16Array {
  const gain = 10 ** (gainDb / 20);
  const ceiling = 10 ** (ceilingDb / 20) * FULL_SCALE;
  const n = samples.length;
  // 1. The gain each sample may have to stay under the ceiling.
  const needed = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const level = Math.abs(samples[i]) * gain;
    needed[i] = level > ceiling ? ceiling / level : 1;
  }
  // 2. The smallest needed gain within ±L samples (a sliding minimum), then its average over L samples: a smooth dip
  //    that has fully arrived at every peak.
  const L = Math.max(1, Math.round(0.005 * sampleRate));
  const held = slidingMin(needed, L);
  const smooth = movingAverage(held, L);
  // 3. Release: the gain falls at once with `smooth` but rises back slowly.
  const release = Math.exp(-1 / (0.08 * sampleRate));
  const out = new Int16Array(n);
  let g = 1;
  for (let i = 0; i < n; i++) {
    g = smooth[i] < g ? smooth[i] : smooth[i] - (smooth[i] - g) * release;
    const value = samples[i] * gain * g;
    out[i] = Math.round(Math.max(-ceiling, Math.min(ceiling, value)));
  }
  return out;
}

/** The minimum of each sample's window [i − r, i + r] (a monotonic deque: linear time). */
function slidingMin(values: Float64Array, r: number): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  const deque: number[] = [];
  let head = 0;
  for (let j = 0; j < n + r; j++) {
    if (j < n) {
      while (deque.length > head && values[deque[deque.length - 1]] >= values[j]) deque.pop();
      deque.push(j);
    }
    const i = j - r;
    if (i >= 0) {
      while (deque[head] < i - r) head++;
      out[i] = values[deque[head]];
    }
  }
  return out;
}

/** The mean of each sample's centred window of `width` samples. */
function movingAverage(values: Float64Array, width: number): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  const half = Math.floor(width / 2);
  let sum = 0;
  let from = 0;
  let to = -1;
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    while (to < hi) sum += values[++to];
    while (from < lo) sum -= values[from++];
    out[i] = sum / (hi - lo + 1);
  }
  return out;
}

/**
 * Whether a recording has nothing like speech in it: no 30 ms stretch louder than `thresholdDb` (default -45 dBFS;
 * a quiet room through a phone sits around -60 to -50, speech peaks around -30 to -10). Listening models invent words
 * for silence, so silence never reaches them.
 */
export function isSilent(samples: Int16Array, sampleRate: number, thresholdDb = -45): boolean {
  const frame = Math.max(1, Math.round(0.03 * sampleRate));
  const threshold = (10 ** (thresholdDb / 20)) ** 2;
  for (let start = 0; start < samples.length; start += frame) {
    const end = Math.min(samples.length, start + frame);
    let sum = 0;
    for (let i = start; i < end; i++) sum += (samples[i] / FULL_SCALE) ** 2;
    if (sum / (end - start) > threshold) return false;
  }
  return true;
}

// ---------- Finishing like the TV's recorded clips, and measuring speech ----------

/** Whether the 20 ms (`frame`) from `start` is louder than `threshold` (a mean square on a 0–1 scale). */
function loudFrame(samples: Int16Array, start: number, frame: number, threshold: number): boolean {
  const end = Math.min(samples.length, start + frame);
  let sum = 0;
  for (let i = start; i < end; i++) sum += (samples[i] / FULL_SCALE) ** 2;
  return sum / (end - start) > threshold;
}

const meanSquareOf = (db: number) => (10 ** (db / 20)) ** 2;

/**
 * The silence before the first sound cut down to `keepMs`, as scripts/make-voices.py does to the TV's recorded clips
 * (ffmpeg silenceremove, start_threshold=-50dB, start_silence=0.05): sound is the first 20 ms louder than
 * `thresholdDb`. Audio with no sound stays as it is.
 */
export function trimLead(samples: Int16Array, sampleRate: number, keepMs = 50, thresholdDb = -50): Int16Array {
  const frame = Math.max(1, Math.round(0.02 * sampleRate));
  for (let start = 0; start < samples.length; start += frame) {
    if (loudFrame(samples, start, frame, meanSquareOf(thresholdDb))) return samples.slice(Math.max(0, start - Math.round((keepMs / 1000) * sampleRate)));
  }
  return samples;
}

/**
 * How many samples of speech there are: the audio without its silent start and end, from the first to the last 20 ms
 * louder than `thresholdDb` (what scripts/make-voices.py measures, ffmpeg silenceremove at -45 dB from both ends).
 * Silence before and after a line, which voice models sometimes add in bursts, doesn't count; no sound is 0.
 */
export function speechLength(samples: Int16Array, sampleRate: number, thresholdDb = -45): number {
  const frame = Math.max(1, Math.round(0.02 * sampleRate));
  const threshold = meanSquareOf(thresholdDb);
  let first = -1;
  for (let start = 0; start < samples.length && first < 0; start += frame) if (loudFrame(samples, start, frame, threshold)) first = start;
  if (first < 0) return 0;
  for (let start = Math.floor((samples.length - 1) / frame) * frame; start > first; start -= frame) {
    if (loudFrame(samples, start, frame, threshold)) return Math.min(samples.length, start + frame) - first;
  }
  return Math.min(samples.length, first + frame) - first;
}

/** `ms` of silence after the last sound (the clips' apad=pad_dur=0.3: some players clip a line's last syllable). */
export function padTail(samples: Int16Array, sampleRate: number, ms: number): Int16Array {
  const out = new Int16Array(samples.length + Math.round((ms / 1000) * sampleRate));
  out.set(samples);
  return out;
}

/** `ms` of silence on each side. */
export function surround(samples: Int16Array, sampleRate: number, ms: number): Int16Array {
  const pad = Math.round((ms / 1000) * sampleRate);
  const out = new Int16Array(samples.length + 2 * pad);
  out.set(samples, pad);
  return out;
}

// ---------- The mouth ----------

export interface Mouth {
  stepMs: number;
  /** How open, every stepMs from the start: 0 shut … 1 wide open. */
  open: number[];
}

/**
 * How open the mouth is, every `stepMs`, from the speech's loudness: each step's level in dB, between a floor 24 dB
 * under the loudest step (and never under -60 dBFS) and the loudest step, smoothed with a quick attack and a slower
 * release; anything under the noise floor is shut (0). Values to two decimals.
 */
export function mouthOf(samples: Int16Array, sampleRate: number, stepMs = 40): Mouth {
  const step = Math.max(1, Math.round((sampleRate * stepMs) / 1000));
  const levels: number[] = [];
  for (let start = 0; start < samples.length; start += step) {
    let sum = 0;
    const end = Math.min(samples.length, start + step);
    for (let i = start; i < end; i++) sum += (samples[i] / FULL_SCALE) ** 2;
    const rms = Math.sqrt(sum / (end - start));
    levels.push(rms > 0 ? 20 * Math.log10(rms) : -Infinity);
  }
  const top = Math.max(-Infinity, ...levels);
  if (!Number.isFinite(top) || top < -60) return {stepMs, open: levels.map(() => 0)};
  const floor = Math.max(-60, top - 24);
  /** Per step: how far towards a louder target the mouth opens, and towards a quieter one it closes. */
  const ATTACK = 0.8;
  const RELEASE = 0.45;
  const NOISE = 0.08;
  let value = 0;
  const open = levels.map(level => {
    const target = Number.isFinite(level) ? Math.max(0, Math.min(1, (level - floor) / (top - floor))) : 0;
    value += (target - value) * (target > value ? ATTACK : RELEASE);
    return value < NOISE ? 0 : Math.round(value * 100) / 100;
  });
  return {stepMs, open};
}
