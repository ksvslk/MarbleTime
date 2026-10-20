import {useEffect, useRef, useState} from 'react';

/**
 * Saves `value` a moment after the last change, so a run of taps on a stepper is one request. A save still
 * waiting when the screen closes goes out then. Values equal (as JSON) to the last saved one are skipped,
 * including the one the screen opened with. Returns true for a moment after each save, for a "Saved" note.
 */
export function useAutosave<T>(value: T, save: (value: T) => Promise<void>, delayMs = 600): boolean {
  const json = JSON.stringify(value);
  const savedJson = useRef(json);
  // Wrapped, so that null is a value to save like any other (a bedtime switched off), not "nothing waiting".
  const pending = useRef<{value: T} | null>(null);
  const latestSave = useRef(save);
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    latestSave.current = save;
  });

  const flush = useRef(() => {
    const next = pending.current;
    pending.current = null;
    if (next === null) return;
    const nextJson = JSON.stringify(next.value);
    latestSave.current(next.value).then(
      () => {
        savedJson.current = nextJson;
        setJustSaved(true);
      },
      () => undefined,
    );
  });

  useEffect(() => {
    if (json === savedJson.current) return;
    pending.current = {value: JSON.parse(json) as T};
    const timer = setTimeout(flush.current, delayMs);
    return () => clearTimeout(timer);
  }, [json, delayMs]);

  useEffect(() => () => flush.current(), []);

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 1600);
    return () => clearTimeout(timer);
  }, [justSaved]);

  return justSaved;
}
