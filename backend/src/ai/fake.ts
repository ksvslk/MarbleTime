/**
 * A free stand-in for the characters' model (MODEL_ID=fake on the dev server; tests bring scripted ones): the art
 * director makes a card from the words without any AI (and says no to a few words, to try the 422), the drawing is
 * one template character in the card's colours that passes every check, the picture check says yes, and listening
 * (STT_MODEL_ID=fake) always hears "a dragon who loves pancakes".
 * Deterministic and offline.
 */
import type {AiModel, JsonAsk, JsonReply, TextAsk, TextReply} from './model';

const NO_USAGE = {inputTokens: 0, outputTokens: 0};

const COLOURS: Record<string, string> = {
  red: '#e53935', pink: '#f06292', orange: '#fb8c00', yellow: '#fdd835', gold: '#ffb300', green: '#43a047', teal: '#00897b', blue: '#1e88e5',
  purple: '#8e24aa', brown: '#8d6e63', grey: '#90a4ae', gray: '#90a4ae', white: '#eceff1', black: '#455a64', silver: '#b0bec5',
};

const words = (text: string) => text.toLowerCase().match(/[a-z]+/g) ?? [];

/** The template character: parts, pivots, the face inside the head, a filled mouth, feet at y=480, centred. */
export function templateSvg(colours: string[]): string {
  const [main = '#43a047', second = '#fdd835', third = '#1e88e5'] = colours.map(c => COLOURS[c.toLowerCase()] ?? c).filter(c => /^#[0-9a-f]{6}$/i.test(c));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <g id="extra" data-pivot="256 112"><path d="M226 112 L256 64 L286 112 Z" fill="${third}"/></g>
  <g id="legs" data-pivot="256 400"><rect x="206" y="396" width="36" height="84" rx="16" fill="${second}"/><rect x="270" y="396" width="36" height="84" rx="16" fill="${second}"/></g>
  <g id="body" data-pivot="256 480"><ellipse cx="256" cy="336" rx="100" ry="90" fill="${main}"/><ellipse cx="256" cy="356" rx="60" ry="50" fill="#fff8e1"/></g>
  <g id="arm-left" data-pivot="172 300"><rect x="104" y="288" width="78" height="30" rx="15" fill="${main}" transform="rotate(20 172 300)"/></g>
  <g id="arm-right" data-pivot="340 300"><rect x="330" y="288" width="78" height="30" rx="15" fill="${main}" transform="rotate(-20 340 300)"/></g>
  <g id="head" data-pivot="256 250"><circle cx="256" cy="176" r="80" fill="${main}"/>
    <g id="eye-left" data-pivot="226 166"><circle cx="226" cy="166" r="14" fill="#263238"/><circle cx="222" cy="161" r="5" fill="#ffffff"/></g>
    <g id="eye-right" data-pivot="286 166"><circle cx="286" cy="166" r="14" fill="#263238"/><circle cx="282" cy="161" r="5" fill="#ffffff"/></g>
    <g id="mouth" data-pivot="256 212"><path d="M230 202 Q256 234 282 202 Z" fill="#263238"/></g>
  </g>
</svg>`;
}

export class FakeModel implements AiModel {
  readonly id = 'fake';

  async json(ask: JsonAsk): Promise<JsonReply> {
    if (ask.name === 'picture_check') return {value: {ok: true, reason: ''}, stop: 'done', usage: NO_USAGE};
    if (ask.name === 'transcript') return {value: {text: 'a dragon who loves pancakes'}, stop: 'done', usage: NO_USAGE};
    const idea = /"([^"]*)"/.exec(ask.user)?.[1] ?? 'a friendly creature';
    const said = words(idea);
    if (said.some(word => ['gun', 'guns', 'blood', 'kill'].includes(word))) {
      return {value: {answer: {result: 'not_ok', sentence: "Let's draw a friendly character instead. How about a brave knight with a shiny shield?"}}, stop: 'done', usage: NO_USAGE};
    }
    const colours = said.filter(word => word in COLOURS).slice(0, 3);
    const noun = said.filter(word => word.length > 2 && !(word in COLOURS) && !['the', 'and', 'who', 'with', 'that', 'loves', 'likes'].includes(word))[0] ?? 'friend';
    const card = {what: `a friendly ${noun}`, colours: colours.length ? colours : ['green', 'yellow'], outfit: 'a little blue party hat', mood: 'happy', detail: idea.slice(0, 60)};
    const name = `${noun.charAt(0).toUpperCase()}${noun.slice(1)} Buddy`;
    // Small things squeak, big things rumble, the rest sound cheerful.
    const voiceStyle = said.some(word => ['tiny', 'little', 'baby', 'mouse', 'bee', 'bug'].includes(word))
      ? {pitch: 'high', pace: 'quick', energy: 'bouncy', texture: 'squeaky'}
      : said.some(word => ['big', 'giant', 'huge', 'bear', 'elephant', 'whale'].includes(word))
        ? {pitch: 'low', pace: 'slow', energy: 'calm', texture: 'booming'}
        : {pitch: 'medium', pace: 'normal', energy: 'cheerful', texture: 'clear'};
    return {value: {answer: {result: 'character', name, voice: 'Leda', voiceStyle, card}}, stop: 'done', usage: NO_USAGE};
  }

  async text(ask: TextAsk): Promise<TextReply> {
    const colours = /- colours: (.*)/.exec(ask.user)?.[1].split(',').map(c => c.trim()) ?? [];
    return {text: templateSvg(colours), stop: 'done', usage: NO_USAGE};
  }
}
