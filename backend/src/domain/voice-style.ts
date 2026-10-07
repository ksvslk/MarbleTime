/**
 * How lines are spoken (docs/08, Decisions 6). Characters speak in character: the art director picks how a character
 * sounds (its CharacterVoiceStyle: pitch, pace, energy, texture, from fixed words), and every line's speaking style is
 * composed from fixed English parts. The only thing from a model is the card's `what` (at most 40 characters, already
 * checked), and it goes in quoted, as data. Nothing from the kid's words reaches the speech model. The narrator reads
 * the family's own words in the voice and style of the TV's recorded clips.
 *
 * Styles are short descriptions that name the line's language, never commands (measured, Oct 2026): without the
 * language, Estonian "Jee!" came out as English "gee"; commands ("say it once, don't add words") were read aloud on
 * short lines. Lines are still checked after they are made (line-check.ts): short ones sometimes come out twice.
 */
import {type Character, type Lang, LANGUAGE_NAMES, type Mood, type Voice} from './types';

/** The narrator's voice: the TV's recorded clips' (VOICE in scripts/make-voices.py). */
export const NARRATOR_VOICE: Voice = 'Leda';

/** The narrator's style, word for word as scripts/make-voices.py gives it for the TV's recorded clips (style(lang)). */
export const narratorStyle = (lang: Lang) => `A native ${LANGUAGE_NAMES[lang]} speaker: warm, clear and friendly, to a young child.`;

export const PITCHES = ['high', 'medium', 'low'] as const;
export const PACES = ['quick', 'normal', 'slow'] as const;
export const ENERGIES = ['bouncy', 'cheerful', 'calm', 'sleepy', 'bold'] as const;
export const TEXTURES = ['squeaky', 'clear', 'soft', 'breathy', 'gravelly', 'booming'] as const;

export interface VoiceStyle {
  pitch: (typeof PITCHES)[number];
  pace: (typeof PACES)[number];
  energy: (typeof ENERGIES)[number];
  texture: (typeof TEXTURES)[number];
}

/** How a character sounds when it was made before voice styles (or the art director gave none): from its mood. */
export const MOOD_STYLE: Record<Mood, VoiceStyle> = {
  happy: {pitch: 'medium', pace: 'normal', energy: 'cheerful', texture: 'clear'},
  silly: {pitch: 'high', pace: 'quick', energy: 'bouncy', texture: 'squeaky'},
  brave: {pitch: 'medium', pace: 'normal', energy: 'bold', texture: 'clear'},
  sleepy: {pitch: 'low', pace: 'slow', energy: 'sleepy', texture: 'soft'},
  proud: {pitch: 'medium', pace: 'normal', energy: 'bold', texture: 'booming'},
  curious: {pitch: 'high', pace: 'normal', energy: 'cheerful', texture: 'clear'},
  calm: {pitch: 'low', pace: 'slow', energy: 'calm', texture: 'soft'},
};

/** A character's voice style: its own, or the default for its mood. */
export const voiceStyleOf = (character: Pick<Character, 'voiceStyle' | 'card'>): VoiceStyle => character.voiceStyle ?? MOOD_STYLE[character.card.mood];

/** A value from the art director, if it is one of the fixed words. */
const oneOf = <T extends string>(words: readonly T[], value: unknown): T | undefined => (words.includes(value as T) ? (value as T) : undefined);

/** The art director's voice style, or the mood's default where a word is missing or unknown. */
export function readVoiceStyle(value: unknown, mood: Mood): VoiceStyle {
  const style = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const fallback = MOOD_STYLE[mood];
  return {
    pitch: oneOf(PITCHES, style.pitch) ?? fallback.pitch,
    pace: oneOf(PACES, style.pace) ?? fallback.pace,
    energy: oneOf(ENERGIES, style.energy) ?? fallback.energy,
    texture: oneOf(TEXTURES, style.texture) ?? fallback.texture,
  };
}

/** The longest `what` that goes into a speaking style (the card allows 40). */
export const WHAT_MAX = 40;

/**
 * `what` as quoted data: no quotes, line breaks or control characters to break out with, whitespace collapsed, at most
 * 40 characters; "a character" if nothing is left.
 */
export function quoteWhat(what: string): string {
  const plain = [...what.replace(/[\p{Cc}\p{Cf}"“”«»„`\\]/gu, ' ').replace(/\s+/g, ' ').trim()].slice(0, WHAT_MAX).join('').trim();
  return `"${plain || 'a character'}"`;
}

/**
 * The speaking style for a character's lines: the line's language, the card's `what` as quoted data, the character's
 * voice style and mood, all in fixed words. E.g. A native Estonian speaker, as "a tiny dragon", a cartoon character for
 * young children: high-pitched, squeaky, bouncy, at a quick pace, silly.
 */
export function voicePrompt(character: Pick<Character, 'voiceStyle' | 'card'>, lang: Lang): string {
  const {pitch, pace, energy, texture} = voiceStyleOf(character);
  const {mood, what} = character.card;
  return `A native ${LANGUAGE_NAMES[lang]} speaker, as ${quoteWhat(what)}, a cartoon character for young children: ${pitch}-pitched, ${texture}, ${energy}, at a ${pace} pace, ${mood}.`;
}
