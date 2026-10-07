import {useCallback, useEffect, useRef, useState} from 'react';
import {api, CharacterArt, CharacterPart, Speech} from './api';
import type {Lang} from './i18n';
import {Sound} from './sound';
import {Storage} from './storage';
import {Character, useStore} from './state';

/**
 * The kids' characters on the TV (docs/08): their art, fetched once and kept on the device (it never changes),
 * and the short lines they say. Lines are written here, in the family's language, never by an AI; the backend
 * speaks each one with the character's Gemini voice (cached per text, voice, language and mood) and says how the
 * mouth moves.
 */

type Lines = {meet: string[]; marbles: string[]; praise: string[]; character: string[]; bonus: string[]; play: string[]; hello: string};

/**
 * What characters say, by moment. {kid} is the kid's name, {name} the character's. Like the "Yay!" words, they
 * name the deed and thank, never praise traits or compare (docs/research/02). `play`: in the gallery, each OK says
 * the next one. `hello`: for a character without a name yet.
 */
export const LINES: Record<Lang, Lines> = {
  en: {
    meet: ["Hi {kid}! I'm {name}!"],
    marbles: ['You did it!', 'Thanks for helping!', 'Great job, {kid}!'],
    praise: ['Thank you, {kid}!', 'That was a big help!'],
    character: ['A new friend is coming! Tell a grown-up your idea!'],
    bonus: ['Yay, {kid}!'],
    play: ['Hi {kid}!', "I'm {name}!", 'Wheee!', "Let's dance!", 'Hee hee, that tickles!', 'Look at me!', 'High five!', 'Ta-da!', 'Boing, boing, boing!', "We're friends, {kid}!"],
    hello: 'Hi {kid}!',
  },
  et: {
    meet: ['Tere, {kid}! Mina olen {name}!'],
    marbles: ['Said hakkama!', 'Aitäh, et aitasid!', 'Tubli töö, {kid}!'],
    praise: ['Aitäh, {kid}!', 'See oli suur abi!'],
    character: ['Tuleb uus sõber! Räägi oma mõte täiskasvanule!'],
    bonus: ['Jee, {kid}!'],
    play: ['Tere, {kid}!', 'Mina olen {name}!', 'Vuhhuu!', 'Tantsime!', 'Hihii, see kõditab!', 'Vaata mind!', 'Anna viis!', 'Tadaa!', 'Hopp, hopp, hopp!', 'Me oleme sõbrad, {kid}!'],
    hello: 'Tere, {kid}!',
  },
  de: {
    meet: ['Hallo, {kid}! Ich bin {name}!'],
    marbles: ['Du hast es geschafft!', 'Danke fürs Helfen!', 'Gut gemacht, {kid}!'],
    praise: ['Danke, {kid}!', 'Das war eine große Hilfe!'],
    character: ['Ein neuer Freund kommt! Erzähl einem Erwachsenen deine Idee!'],
    bonus: ['Juhu, {kid}!'],
    play: ['Hallo, {kid}!', 'Ich bin {name}!', 'Juhuu!', 'Lass uns tanzen!', 'Hihi, das kitzelt!', 'Schau mal her!', 'Gib mir fünf!', 'Tadaa!', 'Hopp, hopp, hopp!', 'Wir sind Freunde, {kid}!'],
    hello: 'Hallo, {kid}!',
  },
  es: {
    meet: ['¡Hola, {kid}! ¡Soy {name}!'],
    marbles: ['¡Lo lograste!', '¡Gracias por ayudar!', '¡Buen trabajo, {kid}!'],
    praise: ['¡Gracias, {kid}!', '¡Fue una gran ayuda!'],
    character: ['¡Viene un nuevo amigo! ¡Cuéntale tu idea a un adulto!'],
    bonus: ['¡Bien, {kid}!'],
    play: ['¡Hola, {kid}!', '¡Soy {name}!', '¡Yupiii!', '¡Vamos a bailar!', '¡Jiji, eso me hace cosquillas!', '¡Mírame!', '¡Choca esos cinco!', '¡Tachán!', '¡Boing, boing, boing!', '¡Somos amigos, {kid}!'],
    hello: '¡Hola, {kid}!',
  },
};

export type Moment = Exclude<keyof Lines, 'hello'>;

const hashOf = (text: string) => {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(hash);
};
const fill = (line: string, vars: {kid: string; name?: string}) => line.replace('{kid}', vars.kid).replace('{name}', vars.name ?? '').slice(0, 160);

/** The n-th line a character says when the kid plays with it: every press the next one, starting somewhere new. */
export function playLine(characterId: string, n: number, vars: {kid: string; name?: string}, lang: Lang = 'en'): string {
  const lines = LINES[lang].play.filter(line => !line.includes('{name}') || !!vars.name);
  return fill(lines[(hashOf(characterId) + n) % lines.length], vars);
}

/** One of the moment's lines, always the same one for the same seed (a celebration's id), filled in. */
export function lineFor(moment: Moment, seed: string, vars: {kid: string; name?: string}, lang: Lang = 'en'): string {
  const options = LINES[lang][moment];
  const line = options[hashOf(seed) % options.length];
  // A character without a name (yet) just says hello.
  return fill(line.includes('{name}') && !vars.name ? LINES[lang].hello : line, vars);
}

const isPoint = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number' && Number.isFinite(n));

/** Art the TV can draw: a viewBox and SVG layers (a damaged cache entry or odd answer is fetched again). */
export function isArt(x: unknown): x is CharacterArt {
  if (!x || typeof x !== 'object') return false;
  const art = x as CharacterArt;
  return (
    typeof art.id === 'string' &&
    typeof art.viewBox === 'string' &&
    Array.isArray(art.layers) &&
    art.layers.length > 0 &&
    art.layers.every(l => !!l && typeof l.svg === 'string' && (l.pivot === undefined || isPoint(l.pivot)) && (l.parent === undefined || typeof l.parent === 'string'))
  );
}

export function isSpeech(x: unknown): x is Speech {
  if (!x || typeof x !== 'object') return false;
  const speech = x as Speech;
  const mouth = speech.mouth;
  const mouthOk = !!mouth && typeof mouth.stepMs === 'number' && mouth.stepMs > 0 && Array.isArray(mouth.open) && mouth.open.every(o => typeof o === 'number' && Number.isFinite(o));
  const visemesOk = Array.isArray(speech.visemes) && speech.visemes.every(v => !!v && typeof v.time === 'number' && typeof v.value === 'string');
  return typeof speech.audioUrl === 'string' && /^https?:\/\//.test(speech.audioUrl) && typeof speech.durationMs === 'number' && (mouthOk || visemesOk);
}

// Drawing helpers for CharacterView (plain functions, so they're tested without a screen).

/** How open (0–1) and how wide (−1 rounded … 1 wide) the mouth is for each Polly viseme. */
const MOUTH: Record<string, readonly [number, number]> = {
  sil: [0, 0],
  p: [0, 0],
  f: [0.2, 0.1],
  T: [0.3, 0],
  t: [0.35, 0.1],
  s: [0.25, 0.3],
  S: [0.4, -0.3],
  k: [0.45, 0],
  r: [0.35, -0.3],
  i: [0.35, 0.6],
  e: [0.6, 0.4],
  E: [0.65, 0.3],
  '@': [0.55, 0],
  a: [1, 0.1],
  o: [0.8, -0.5],
  O: [0.9, -0.4],
  u: [0.5, -0.7],
};

/**
 * The mouth over a line's time (ms), closed at the start and at the end: from the audio's loudness every stepMs
 * (Gemini voices), or a keyframe at each viseme mark (older speech).
 */
export function mouthFrames(speech: Speech): {times: number[]; open: number[]; wide: number[]} {
  const times = [0];
  const open = [0];
  const wide = [0];
  if (speech.mouth) {
    const {stepMs, open: levels} = speech.mouth;
    levels.forEach((level, i) => {
      times.push(Math.max((i + 1) * stepMs, times[times.length - 1] + 1));
      open.push(Math.max(0, Math.min(1, level)));
      wide.push(0);
    });
  }
  for (const v of speech.mouth ? [] : [...(speech.visemes ?? [])].sort((a, b) => a.time - b.time)) {
    const [o, w] = MOUTH[v.value] ?? [0.4, 0];
    times.push(Math.max(v.time, times[times.length - 1] + 1));
    open.push(o);
    wide.push(w);
  }
  times.push(Math.max(speech.durationMs, times[times.length - 1] + 1));
  open.push(0);
  wide.push(0);
  return {times, open, wide};
}

/** Where a viewBox point lands in a size × size box (the SVG is scaled to fit and centred). */
export function placer(viewBox: string, size: number): (p: readonly [number, number]) => readonly [number, number] {
  const parts = viewBox.split(/[\s,]+/).map(Number);
  const [minX, minY, w, h] = parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0 ? parts : [0, 0, 512, 512];
  const k = size / Math.max(w, h);
  const ox = (size - w * k) / 2;
  const oy = (size - h * k) / 2;
  return ([x, y]) => [ox + (x - minX) * k, oy + (y - minY) * k] as const;
}

/**
 * The part a layer moves with before its own motion: the part it was drawn inside (eyes in the head, a held thing
 * in a hand). Art from before layers named their parent: the face, and an extra above the neck (a hat), ride on
 * the head; a tail or wings stay with the body.
 */
export function riderOf(layer: CharacterArt['layers'][number], neck?: readonly [number, number]): CharacterPart | undefined {
  const onHead = layer.part === 'eye-left' || layer.part === 'eye-right' || layer.part === 'mouth' || (layer.part === 'extra' && !!layer.pivot && !!neck && layer.pivot[1] < neck[1]);
  const rider = layer.parent ?? (onHead ? 'head' : undefined);
  return rider === layer.part ? undefined : rider;
}

const arts = new Map<string, Promise<CharacterArt | null>>();

/** A ready character's art: from memory, then the device, then the backend. A failed load is tried again next time. */
export function loadArt(base: string, token: string | undefined, id: string): Promise<CharacterArt | null> {
  const known = arts.get(id);
  if (known) return known;
  const loading = (async () => {
    try {
      const saved = await Storage.get(`art.${id}`);
      const art: unknown = saved ? JSON.parse(saved) : null;
      if (isArt(art) && art.id === id) return art;
    } catch {
      // A damaged copy: fetch it again.
    }
    if (!token) return null;
    const art = await api.characterArt(base, token, id);
    if (!isArt(art) || art.id !== id) return null;
    Storage.set(`art.${id}`, JSON.stringify(art)).catch(() => {});
    return art;
  })().catch(() => null);
  arts.set(id, loading);
  loading.then(art => {
    if (!art) arts.delete(id);
  });
  return loading;
}

// Audio links last at least a day (backend/openapi.yaml); a line is asked for again after half of that.
const SPEECH_TTL = 12 * 60 * 60 * 1000;
const speeches = new Map<string, {at: number; speech: Promise<Speech | null>}>();

/** A line's audio and mouth movement, in a character's own voice or the narrator's (the same line, the same audio). */
export function loadSpeech(base: string, token: string, line: {text: string; lang: Lang; characterId?: string}): Promise<Speech | null> {
  const key = `${line.characterId ?? 'narrator'}|${line.lang}|${line.text}`;
  const known = speeches.get(key);
  if (known && Date.now() - known.at < SPEECH_TTL) return known.speech;
  const speech = api
    .speech(base, token, line)
    .then(s => (isSpeech(s) ? s : null))
    .catch(() => null);
  speeches.set(key, {at: Date.now(), speech});
  speech.then(s => {
    if (!s) speeches.delete(key);
  });
  return speech;
}

/** A ready character's art, or null while it loads (or when there is none to be had). */
export function useArt(character: Character | undefined): CharacterArt | null {
  const {state} = useStore();
  const token = state.link?.token;
  const id = character?.status === 'ready' ? character.id : undefined;
  const [art, setArt] = useState<CharacterArt | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    loadArt(state.apiUrl, token, id).then(a => live && setArt(a));
    return () => {
      live = false;
    };
  }, [id, state.apiUrl, token]);
  return art && art.id === id ? art : null;
}

/** Fetches every ready character's art ahead, so "Yay!" and "Meet …!" show it at once. */
export function ArtPrefetch() {
  const {state} = useStore();
  const token = state.link?.token;
  const ids = state.characters
    .filter(c => c.status === 'ready')
    .map(c => c.id)
    .join(' ');
  useEffect(() => {
    if (!token || !ids) return;
    ids.split(' ').forEach(id => loadArt(state.apiUrl, token, id));
  }, [ids, token, state.apiUrl]);
  return null;
}

/**
 * A character talking on request (the gallery): `talk(text)` stops whatever is being said and says this line.
 * Silent when the grown-ups turned read-aloud off or the line can't be had. `speech` is for the character's mouth.
 */
export function useTalk(character: Character | undefined): {speech: Speech | null; talk: (text: string) => void} {
  const {state} = useStore();
  const token = state.link?.token;
  const characterId = character?.status === 'ready' ? character.id : undefined;
  const on = state.voice && !!token && !!characterId;
  // A fresh object per press, so saying the same line again plays it again.
  const [say, setSay] = useState<{speech: Speech} | null>(null);
  const latest = useRef(0);
  const talk = useCallback(
    (text: string) => {
      if (!on || !token || !characterId) return;
      const ticket = ++latest.current;
      loadSpeech(state.apiUrl, token, {text, lang: state.lang, characterId}).then(speech => {
        if (speech && ticket === latest.current) setSay({speech});
      });
    },
    [on, state.apiUrl, state.lang, token, characterId],
  );
  // After the character's mouth (a child, whose effects run first) is listening for this line.
  useEffect(() => {
    if (!say) return;
    Sound.stopSpeaking();
    Sound.enqueue([say.speech.audioUrl]);
  }, [say]);
  return {speech: say?.speech ?? null, talk};
}

/**
 * A character's line on this screen: fetched as soon as the screen opens; `say()` queues it after whatever the
 * read-aloud is saying. Silent when the grown-ups turned read-aloud off, on an unpaired TV, or with no character.
 * `speech` is for the character's mouth.
 */
export function useLine(character: Character | undefined, text: string | null): {speech: Speech | null; say: () => void} {
  const {state} = useStore();
  const token = state.link?.token;
  const characterId = character?.status === 'ready' ? character.id : undefined;
  const on = state.voice && !!token && !!characterId && !!text;
  const [speech, setSpeech] = useState<Speech | null>(null);
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (!on || !token || !characterId || !text) return;
    let live = true;
    loadSpeech(state.apiUrl, token, {text, lang: state.lang, characterId}).then(s => live && setSpeech(s));
    return () => {
      live = false;
    };
  }, [on, state.apiUrl, state.lang, token, text, characterId]);
  const said = useRef<string | null>(null);
  useEffect(() => {
    if (!on || !asked || !speech || said.current === speech.audioUrl) return;
    said.current = speech.audioUrl;
    Sound.enqueue([speech.audioUrl]);
  }, [on, asked, speech]);
  const say = useCallback(() => setAsked(true), []);
  return {speech: on ? speech : null, say};
}
