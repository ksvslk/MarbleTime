/**
 * What the character pipeline asks of a model, whichever one it is (models.ts picks it by MODEL_ID):
 * - `json`: a strict, structured answer (the art director's card, the picture check), optionally about pictures;
 * - `text`: plain text (the drawing: an SVG document).
 * Adapters never throw for an unusable answer (a refusal, a cut-off or a safety block): they say so in `stop`, and the
 * caller decides. They throw only when the model can't be reached.
 */

/** A JSON schema for strict decoding: every object closed with every property required; no length or range keywords. */
export type JsonSchema = Record<string, unknown>;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * How an answer ended: done; cut_off (the token limit); refused (the model declined); blocked (a safety filter);
 * malformed (no answer in the asked-for shape: not JSON, or no tool call).
 */
export type Stop = 'done' | 'cut_off' | 'refused' | 'blocked' | 'malformed';

export interface JsonAsk {
  system: string;
  user: string;
  schema: JsonSchema;
  /** The answer's name: the tool's name where a model takes structured answers only as a tool call. */
  name: string;
  /** PNG pictures shown before the text. */
  images?: Buffer[];
  /** WAV recordings heard before the text (Gemini only; other models refuse them). */
  audio?: Buffer[];
  maxTokens?: number;
  /** Stops the call (a hedged attempt that lost, or a timeout); the call then rejects. */
  signal?: AbortSignal;
}

export interface JsonReply {
  /** The parsed answer when `stop` is "done"; its shape is the schema's, but callers still check what they use. */
  value?: unknown;
  stop: Stop;
  usage: Usage;
}

export interface TextAsk {
  system?: string;
  user: string;
  images?: Buffer[];
  audio?: Buffer[];
  maxTokens?: number;
  signal?: AbortSignal;
}

/** A model that can't hear: asked with audio, it refuses before calling anything. */
export const noAudio = (model: string, ask: {audio?: Buffer[]}) => {
  if (ask.audio?.length) throw new Error(`${model} doesn't take audio`);
};

export interface TextReply {
  /** What the model wrote (possibly cut off; empty when refused or blocked). */
  text: string;
  stop: Stop;
  usage: Usage;
}

export interface AiModel {
  readonly id: string;
  json(ask: JsonAsk): Promise<JsonReply>;
  text(ask: TextAsk): Promise<TextReply>;
}

/** JSON from a model's text; undefined if it isn't JSON. Tolerates a ```json fence around it. */
export function parseJson(text: string): unknown {
  const bare = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(bare);
  } catch {
    return undefined;
  }
}

/** A timeout's signal joined with the caller's (if any). */
export const withTimeout = (timeoutMs: number, signal?: AbortSignal) =>
  (signal ? AbortSignal.any([AbortSignal.timeout(timeoutMs), signal]) : AbortSignal.timeout(timeoutMs));

/** Waits before trying again: 1 s, 2 s, 4 s… (tests pass a sleep that doesn't wait). */
export type Sleep = (ms: number) => Promise<void>;
export const sleep: Sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
