/**
 * Recording the kid's idea on the grown-up's phone: MediaRecorder in the browser's own format, then the Web Audio
 * API decodes it and wav.ts makes the 16 kHz mono WAV that POST /speech-to-text takes. Browser-only; the sums
 * are in wav.ts, which the tests cover.
 */
import {speechWav} from './wav';

/**
 * Whether this browser can record here. The microphone needs a secure page (https, or localhost), so the LAN
 * dev address (plain http) can't; grown-ups type instead.
 */
export function canRecord(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined' &&
    audioContextClass() !== undefined
  );
}

function audioContextClass(): typeof AudioContext | undefined {
  return window.AudioContext ?? (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
}

/** Formats to ask MediaRecorder for, best first (Chrome: WebM/Opus, Safari: MP4/AAC); else the browser's own. */
const TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];

export interface Recording {
  /** Stops and returns the recording as WAV. */
  stop(): Promise<Blob>;
  /** Stops and throws it away (leaving the screen). */
  cancel(): void;
}

/** Asks for the microphone (the browser may ask the grown-up first) and starts recording. */
export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true}});
  // Let go of the microphone as soon as recording ends, so the phone's "mic in use" light goes off.
  const release = () => stream.getTracks().forEach(track => track.stop());
  let recorder: MediaRecorder;
  try {
    const mimeType = TYPES.find(type => MediaRecorder.isTypeSupported?.(type));
    recorder = new MediaRecorder(stream, mimeType ? {mimeType} : undefined);
  } catch (error) {
    release();
    throw error;
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = event => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      release();
      resolve(new Blob(chunks, {type: recorder.mimeType}));
    };
    recorder.onerror = () => {
      release();
      reject(new Error('recording failed'));
    };
  });
  recorder.start();

  const halt = () => {
    if (recorder.state !== 'inactive') recorder.stop();
  };
  return {
    async stop() {
      halt();
      return toWav(await finished);
    },
    cancel() {
      halt();
      release();
    },
  };
}

/** The browser's recording, decoded, as the API's WAV. */
export async function toWav(recording: Blob): Promise<Blob> {
  const Context = audioContextClass();
  if (!Context) throw new Error('no Web Audio');
  const context = new Context();
  try {
    const audio = await decode(context, await recording.arrayBuffer());
    const channels = Array.from({length: audio.numberOfChannels}, (_, i) => audio.getChannelData(i));
    return new Blob([speechWav(channels, audio.sampleRate)], {type: 'audio/wav'});
  } finally {
    void context.close().catch(() => undefined);
  }
}

/** decodeAudioData through its callbacks too: older Safari returns no promise. */
function decode(context: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const promise = context.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
    promise?.then(resolve, reject);
  });
}
