import {useCallback} from 'react';
import {Lang} from './i18n';
import {Sound} from './sound';
import {useStore} from './state';
import {voiceKey} from './voiceLines';
import {VOICES} from './voices';

/**
 * Read-aloud for kids who can't read yet. Every line is a recorded clip (scripts/make-voices.py);
 * a line without a clip (say, a name the parent typed before the backend recorded it) is skipped,
 * never read by a robot voice.
 */
export const Speech = {
  say(lang: Lang, lines: string[]): void {
    const clips = lines.map(line => VOICES[lang]?.[voiceKey(line)]).filter((clip): clip is number => clip != null);
    if (clips.length) Sound.speak(clips);
    else Sound.stopSpeaking();
  },
  stop(): void {
    Sound.stopSpeaking();
  },
};

/** say(lines) in the family language, if the grown-ups left "Read aloud" on. */
export function useSay() {
  const {state} = useStore();
  const {voice, lang} = state;
  return useCallback(
    (lines: string[]) => {
      if (voice) Speech.say(lang, lines);
    },
    [voice, lang],
  );
}
