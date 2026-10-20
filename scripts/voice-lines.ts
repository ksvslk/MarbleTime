// Prints every line the TV speaks, per language, and each language's number words, as JSON (read by scripts/make-voices.py).
import {LANGS, numberWord} from '../tv/packages/shared/src/marble/i18n';
import {spokenLines} from '../tv/packages/shared/src/marble/voiceLines';

console.log(JSON.stringify({
  lines: Object.fromEntries(LANGS.map(l => [l.id, spokenLines(l.id)])),
  // 0–20 as words: the listener writes numbers as digits, so a line's number words are turned into digits before comparing.
  numbers: Object.fromEntries(LANGS.map(l => [l.id, Array.from({length: 21}, (_, n) => numberWord(l.id, n))])),
}, null, 1));
