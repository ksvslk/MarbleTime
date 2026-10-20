import {useEffect} from 'react';
import {t} from './i18n';
import {useStore} from './state';
import {Strict} from './strict';

/**
 * Keeps strict mode's counter (on the stick) and the family's jars (on the backend) telling the same story: turns
 * the counter on when the grown-ups set this TV to strict mode, tells it where to report watched time, and hands it
 * every new "time left" (an approval, a bonus, another TV). The counter reports by itself, because these screens
 * are asleep while a video app is in front. Nothing happens on a build without the counter.
 */
export function StrictLink() {
  const {state} = useStore();
  const {lang, apiUrl} = state;
  const token = state.link?.token ?? '';
  const on = Strict.available && state.strict && token !== '';
  // With a grown-ups PIN the TV's settings are closed to kids: there MarbleTime could be stopped (docs/06 §6.3).
  const guard = Boolean(state.link?.pin);

  useEffect(() => {
    if (Strict.available) Strict.setEnabled(on, {warn5: t(lang, 'warn5'), warn1: t(lang, 'warn1'), apiUrl, token, guard});
  }, [on, lang, apiUrl, token, guard]);

  const left = JSON.stringify(state.leftSec);
  useEffect(() => {
    if (!on) return;
    Object.entries(JSON.parse(left) as Record<string, number>).forEach(([kidId, seconds]) => Strict.setLeft(kidId, seconds));
  }, [on, left]);

  return null;
}
