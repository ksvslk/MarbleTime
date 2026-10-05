import {useEffect, useRef} from 'react';

/**
 * Saves `value` a moment after the last change, so a run of taps on a stepper is one request. A save still
 * waiting when the screen closes goes out then. Values equal (as JSON) to the last saved one are skipped,
 * including the one the screen opened with.
 */
export function useAutosave<T>(value: T, save: (value: T) => Promise<void>, delayMs = 600) {
  const json = JSON.stringify(value);
  const savedJson = useRef(json);
  const pending = useRef<T | null>(null);
  const latestSave = useRef(save);
  useEffect(() => {
    latestSave.current = save;
  });

  const flush = useRef(() => {
    const next = pending.current;
    pending.current = null;
    if (next === null) return;
    const nextJson = JSON.stringify(next);
    latestSave.current(next).then(() => (savedJson.current = nextJson), () => undefined);
  });

  useEffect(() => {
    if (json === savedJson.current) return;
    pending.current = JSON.parse(json) as T;
    const timer = setTimeout(flush.current, delayMs);
    return () => clearTimeout(timer);
  }, [json, delayMs]);

  useEffect(() => () => flush.current(), []);
}
