import {useCallback} from 'react';
import {loadSpeech} from './characters';
import {Lang} from './i18n';
import {Sound} from './sound';
import {useStore} from './state';
import {voiceKey} from './voiceLines';
import {VOICES} from './voices';

/**
 * Read-aloud for kids who can't read yet, in the narrator's voice. Fixed phrases are recorded clips
 * (scripts/make-voices.py); a family's own words (names, jobs, a grown-up's reason) come from the backend in the
 * same voice, made once and cached. Lines play in order as they're ready; one the backend can't give in time is
 * skipped, never read by a robot voice.
 */
type Backend = {base: string; token: string};

// How long a line may take to arrive (the first time, the backend makes it: a few seconds).
const WAIT_MS = 6000;
let current = 0;

function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>(resolve => setTimeout(() => resolve(null), ms))]);
}

/** The narrator's line for a family's own words (null on an unpaired TV or when the backend can't make it). */
export function narration(backend: Backend | undefined, lang: Lang, text: string): Promise<string | null> {
  if (!backend || !text.trim()) return Promise.resolve(null);
  return loadSpeech(backend.base, backend.token, {text: text.slice(0, 160), lang}).then(speech => speech?.audioUrl ?? null);
}

export const Speech = {
  /** Says the lines in order, cutting off what was being said; resolves once every line is queued or skipped. */
  async say(lang: Lang, lines: string[], backend?: Backend): Promise<void> {
    const ticket = ++current;
    Sound.stopSpeaking();
    const parts: (number | Promise<string | null>)[] = lines.map(line => VOICES[lang]?.[voiceKey(line)] ?? narration(backend, lang, line));
    let started = false;
    for (const part of parts) {
      const clip = typeof part === 'number' ? part : await within(part, WAIT_MS);
      if (ticket !== current) return; // something newer is being said
      if (clip == null) continue;
      if (started) Sound.enqueue([clip]);
      else Sound.speak([clip]);
      started = true;
    }
  },
  stop(): void {
    current++;
    Sound.stopSpeaking();
  },
};

/** say(lines) in the family language, if the grown-ups left "Read aloud" on; resolves once it's all queued. */
export function useSay() {
  const {state} = useStore();
  const {voice, lang, apiUrl} = state;
  const token = state.link?.token;
  return useCallback(
    (lines: string[]): Promise<void> => (voice ? Speech.say(lang, lines, token ? {base: apiUrl, token} : undefined) : Promise.resolve()),
    [voice, lang, apiUrl, token],
  );
}
