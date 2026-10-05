import {useEffect, useRef} from 'react';

/**
 * Runs `task` now, then again `intervalMs` after each run finishes, but only while the page is visible:
 * a phone in a pocket shouldn't poll. Coming back to the page runs it at once. Runs never overlap.
 */
export function usePolling(task: () => Promise<void>, intervalMs: number) {
  const latest = useRef(task);
  useEffect(() => {
    latest.current = task;
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let stopped = false;
    const visible = () => document.visibilityState === 'visible';

    const run = async () => {
      clearTimeout(timer);
      if (stopped || running || !visible()) return;
      running = true;
      try {
        await latest.current();
      } catch {
        // The task shows its own errors; keep polling.
      } finally {
        running = false;
      }
      if (!stopped && visible()) timer = setTimeout(run, intervalMs);
    };
    const onVisibility = () => (visible() ? void run() : clearTimeout(timer));

    document.addEventListener('visibilitychange', onVisibility);
    void run();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
}
