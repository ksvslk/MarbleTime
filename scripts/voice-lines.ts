// Prints every line the TV speaks, per language, as JSON (read by scripts/make-voices.py).
import {LANGS} from '../tv/packages/shared/src/marble/i18n';
import {spokenLines} from '../tv/packages/shared/src/marble/voiceLines';

console.log(JSON.stringify(Object.fromEntries(LANGS.map(l => [l.id, spokenLines(l.id)])), null, 1));
