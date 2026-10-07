/**
 * The characters' model, chosen by MODEL_ID (deploy: `--context modelId=…`, which the stack's Bedrock IAM follows).
 * One model serves the three roles (art director, drawing, picture check).
 * - AWS default: Claude Haiku 4.5 on Bedrock (us.anthropic.claude-haiku-4-5-20251001-v1:0): strict structured output,
 *   vision, and cheap. Other Claude models (us.anthropic.claude-sonnet-5-5, …) and Amazon Nova (us.amazon.nova-pro-v1:0,
 *   Converse API) are a config change.
 * - Locally: Google Gemini on Vertex AI (gemini-3.8-flash), with this machine's gcloud sign-in, while Bedrock is
 *   blocked on our AWS account; or "fake", a free stand-in that draws one template character. Neither deploys.
 */
import {ClaudeModel} from './claude';
import {FakeModel} from './fake';
import {GeminiModel} from './gemini';
import type {AiModel} from './model';
import {NovaModel} from './nova';

export const DEFAULT_MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
/** The dev server's default. */
export const LOCAL_MODEL_ID = 'gemini-3.8-flash';

export const isNova = (modelId: string) => /^(\w+\.)?amazon\.nova/.test(modelId);
export const isGemini = (modelId: string) => modelId.startsWith('gemini');
export const isFake = (modelId: string) => modelId === 'fake';

/**
 * The model for MODEL_ID. `timeoutMs` bounds one call: the API's art director must answer well inside API Gateway's
 * 30 seconds; the drawing worker allows the default 2 minutes (the slowest measured drawing took 141 s in all).
 */
export function aiModel(modelId: string, timeoutMs?: number): AiModel {
  if (isFake(modelId)) return new FakeModel();
  if (isGemini(modelId)) return new GeminiModel(modelId, undefined, undefined, timeoutMs);
  return isNova(modelId) ? new NovaModel(modelId, undefined, timeoutMs) : new ClaudeModel(modelId, undefined, timeoutMs);
}

/** The art director's safety limit per call; its hedging aborts losing attempts and stops at 25 s (characters.ts). */
export const DIRECTOR_TIMEOUT_MS = 25_000;

/** The drawing worker's calls: no request waits for them, but each is big, so a timeout and one retry, not hedging. */
export const WORKER_PATIENCE = {timeoutMs: 90_000, retries: 1};

/** Deploys call Bedrock only: Gemini and the stand-in are for this machine (infra/app.ts). */
export function bedrockModel(modelId: string): string {
  if (isGemini(modelId) || isFake(modelId)) throw new Error(`modelId "${modelId}" is for local tests only; deploy with a Bedrock model`);
  return modelId;
}
