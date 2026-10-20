/**
 * Google Gemini on Vertex AI: the local model while Bedrock is blocked on our AWS account (FRICTION_LOG), and the one
 * the drawing rules were measured with (gemini-3.8-flash, Oct 7: 98/100 valid SVGs on the first try, 100/100 after one
 * repair). It isn't deployed: the stack refuses a Gemini model (infra/app.ts). Plain fetch against the Vertex AI REST
 * API, so no Google SDK lands in a bundle, signed in with this machine's gcloud account; the project comes from
 * GOOGLE_CLOUD_PROJECT or gcloud's own setting, the location from GOOGLE_CLOUD_LOCATION (default global).
 *
 * JSON answers are decoded strictly (responseJsonSchema); thinking is "low" for everything, as measured.
 */
import {defaultGoogleAuth} from './google-auth';
import {
  type AiModel, type JsonAsk, type JsonReply, parseJson, type Sleep, sleep, type Stop, type TextAsk, type TextReply, type Usage, withTimeout,
} from './model';

/** The parts of a generateContent answer we read. */
export interface GeminiResponse {
  candidates?: {
    content?: {parts?: {text?: string; thought?: boolean}[]};
    finishReason?: string;
  }[];
  promptFeedback?: {blockReason?: string};
  usageMetadata?: {promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number};
}

export type Send = (url: string, body: unknown, signal?: AbortSignal) => Promise<GeminiResponse>;

/** An HTTP answer from Vertex AI that wasn't 2xx. */
export class VertexError extends Error {
  constructor(readonly status: number, body: string) {
    super(`Vertex AI ${status}: ${body.slice(0, 300)}`);
  }
}

/** Busy or briefly unavailable (the measured batch met one 429 in 100 ideas): worth another try. */
const TRANSIENT = new Set([429, 500, 503]);

/** POSTs with the Google token; tries again after a transient error (1 s, 2 s, then gives up). The options are for tests. */
export function gcloudSend(options: {wait?: Sleep; post?: typeof fetch; token?: () => string; timeoutMs?: number} = {}): Send {
  const {wait = sleep, post = fetch, token = () => defaultGoogleAuth().token(), timeoutMs = 240_000} = options;
  return async (url, body, signal) => {
    for (let attempt = 0; ; attempt++) {
      const response = await post(url, {
        method: 'POST',
        headers: {Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json'},
        body: JSON.stringify(body),
        signal: withTimeout(timeoutMs, signal),
      });
      const text = await response.text();
      if (response.ok) return JSON.parse(text) as GeminiResponse;
      if (!TRANSIENT.has(response.status) || attempt >= 2) throw new VertexError(response.status, text);
      await wait(1000 * 2 ** attempt);
      signal?.throwIfAborted();
    }
  };
}

/** Where the model answers: the global endpoint, or a region's. */
export function geminiUrl(project: string, location: string, modelId: string): string {
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${modelId}:generateContent`;
}

const parts = (text: string, images: Buffer[] = [], audio: Buffer[] = []) => [
  ...images.map(png => ({inlineData: {mimeType: 'image/png', data: png.toString('base64')}})),
  ...audio.map(wav => ({inlineData: {mimeType: 'audio/wav', data: wav.toString('base64')}})),
  {text},
];

/** The answer's text (thoughts left out) and how it ended. Thinking is billed as output. */
function read(response: GeminiResponse): {text: string; stop: Stop; usage: Usage} {
  const counts = response.usageMetadata ?? {};
  const usage = {inputTokens: counts.promptTokenCount ?? 0, outputTokens: (counts.candidatesTokenCount ?? 0) + (counts.thoughtsTokenCount ?? 0)};
  const candidate = response.candidates?.[0];
  if (response.promptFeedback?.blockReason || !candidate) return {text: '', stop: 'blocked', usage};
  const text = (candidate.content?.parts ?? []).filter(part => !part.thought).map(part => part.text ?? '').join('');
  const stop: Stop = candidate.finishReason === 'STOP' ? 'done' : candidate.finishReason === 'MAX_TOKENS' ? 'cut_off' : 'blocked';
  return {text, stop, usage};
}

/** Thinking is "low" for everything, as measured; Gemini 2.x models don't take the setting (they solve puzzles as a second opinion: puzzles/writer.ts). */
const thinking = (modelId: string) => (modelId.startsWith('gemini-2') ? {} : {thinkingConfig: {thinkingLevel: 'low'}});

export class GeminiModel implements AiModel {
  private readonly send: Send;
  private url?: string;

  /** `send` and `project` are for tests; by default gcloud gives both (asked on the first call, not here). */
  constructor(readonly id: string, send?: Send, private readonly project?: string, timeoutMs?: number) {
    this.send = send ?? gcloudSend({timeoutMs});
  }

  private endpoint(): string {
    this.url ??= geminiUrl(this.project ?? defaultGoogleAuth().project(), process.env.GOOGLE_CLOUD_LOCATION ?? 'global', this.id);
    return this.url;
  }

  async json(ask: JsonAsk): Promise<JsonReply> {
    const {text, stop, usage} = read(await this.send(this.endpoint(), {
      systemInstruction: {parts: [{text: ask.system}]},
      contents: [{role: 'user', parts: parts(ask.user, ask.images, ask.audio)}],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: ask.schema,
        maxOutputTokens: ask.maxTokens ?? 4096,
        ...thinking(this.id),
      },
    }, ask.signal));
    if (stop !== 'done') return {stop, usage};
    const value = parseJson(text);
    return value === undefined ? {stop: 'malformed', usage} : {value, stop, usage};
  }

  async text(ask: TextAsk): Promise<TextReply> {
    return read(await this.send(this.endpoint(), {
      ...(ask.system !== undefined && {systemInstruction: {parts: [{text: ask.system}]}}),
      contents: [{role: 'user', parts: parts(ask.user, ask.images, ask.audio)}],
      generationConfig: {maxOutputTokens: ask.maxTokens ?? 16000, ...thinking(this.id)},
    }, ask.signal));
  }
}
