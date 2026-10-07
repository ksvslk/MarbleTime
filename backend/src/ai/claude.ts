/**
 * Claude on Amazon Bedrock, through the official Anthropic SDK for Bedrock (InvokeModel with a cross-region inference
 * profile such as us.anthropic.claude-haiku-4-5-20251001-v1:0, the default for characters).
 *
 * Strict where Bedrock allows it. Claude Haiku 4.5 answers JSON through structured outputs (output_config.format), so
 * the answer is exactly the schema. For Claude Sonnet 5.5, Opus 5.5 and Sonnet 5, Bedrock offers neither structured
 * outputs nor strict tool use yet (their AWS model cards, Oct 2026), and these models reject forced tool use, so they
 * hand the answer in as one call of a tool named after it (tool_choice "auto"), whose input schema is the same schema.
 * Callers check what they use either way.
 *
 * Not run against Bedrock yet: Bedrock is blocked on our AWS account ("Error 002", FRICTION_LOG). The request and
 * response shapes are tested with a stand-in for messages.create (test/ai-models.test.ts).
 */
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import type Anthropic from '@anthropic-ai/sdk';
import {type AiModel, type JsonAsk, type JsonReply, noAudio, parseJson, type Stop, type TextAsk, type TextReply, type Usage} from './model';

export type Create = (params: Anthropic.MessageCreateParamsNonStreaming, options?: {signal?: AbortSignal}) => Promise<Anthropic.Message>;

/** Claude models that Bedrock decodes strictly ("Structured outputs" supported on the model card). */
export const decodesStrictly = (modelId: string) => modelId.includes('claude-haiku-4-5');

/**
 * Sonnet 5.5 and Opus 5.5 think adaptively by default, and `thinking: {type: "disabled"}` is a 400 on both, so
 * effort is the cost knob: "low" keeps the thinking short and works on both. Haiku 4.5 takes no effort setting and
 * doesn't think unless asked. No sampling settings: Claude 5.x rejects them.
 */
const takesEffort = (modelId: string) => !modelId.includes('haiku');

const usageOf = (message: Anthropic.Message): Usage => ({inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens});

function stopOf(message: Anthropic.Message): Stop {
  switch (message.stop_reason) {
    case 'max_tokens':
      return 'cut_off';
    case 'refusal':
      return 'refused';
    default:
      return 'done';
  }
}

const textOf = (message: Anthropic.Message) => message.content.flatMap(block => (block.type === 'text' ? [block.text] : [])).join('');

/** The user's turn: pictures first (Anthropic's advice for vision), then the words. */
function userContent(text: string, images: Buffer[] = []): Anthropic.MessageParam['content'] {
  if (!images.length) return text;
  return [
    ...images.map(png => ({type: 'image' as const, source: {type: 'base64' as const, media_type: 'image/png' as const, data: png.toString('base64')}})),
    {type: 'text' as const, text},
  ];
}

export class ClaudeModel implements AiModel {
  private readonly create: Create;

  /** `create` is for tests; by default it is the Bedrock client's messages.create, giving up after `timeoutMs`. */
  constructor(readonly id: string, create?: Create, timeoutMs = 120_000) {
    if (create) {
      this.create = create;
    } else {
      const client = new AnthropicBedrock({awsRegion: process.env.AWS_REGION ?? 'us-east-1', timeout: timeoutMs, maxRetries: timeoutMs < 60_000 ? 1 : 2});
      this.create = (params, options) => client.messages.create(params, options);
    }
  }

  async json(ask: JsonAsk): Promise<JsonReply> {
    noAudio(this.id, ask);
    const strict = decodesStrictly(this.id);
    const outputConfig: Anthropic.OutputConfig = {
      ...(takesEffort(this.id) && {effort: 'low' as const}),
      ...(strict && {format: {type: 'json_schema' as const, schema: ask.schema}}),
    };
    const tool: Anthropic.Tool = {name: ask.name, description: 'Hand in your answer.', input_schema: ask.schema as Anthropic.Tool.InputSchema};
    const response = await this.create({
      model: this.id,
      max_tokens: ask.maxTokens ?? 4096,
      system: ask.system,
      // "auto" doesn't promise a tool call, so the request asks for it.
      messages: [{role: 'user', content: userContent(strict ? ask.user : `${ask.user}\nUse the ${ask.name} tool for your answer.`, ask.images)}],
      ...(!strict && {tools: [tool], tool_choice: {type: 'auto' as const}}),
      ...(Object.keys(outputConfig).length > 0 && {output_config: outputConfig}),
    }, ask.signal && {signal: ask.signal});
    const usage = usageOf(response);
    if (strict) {
      if (response.stop_reason !== 'end_turn') return {stop: stopOf(response), usage};
      const value = parseJson(textOf(response));
      return value === undefined ? {stop: 'malformed', usage} : {value, stop: 'done', usage};
    }
    const call = response.stop_reason === 'tool_use' ? response.content.find(block => block.type === 'tool_use' && block.name === ask.name) : undefined;
    if (call?.type === 'tool_use') return {value: call.input, stop: 'done', usage};
    return {stop: response.stop_reason === 'end_turn' || response.stop_reason === 'tool_use' ? 'malformed' : stopOf(response), usage};
  }

  async text(ask: TextAsk): Promise<TextReply> {
    noAudio(this.id, ask);
    const response = await this.create({
      model: this.id,
      max_tokens: ask.maxTokens ?? 16000,
      ...(ask.system !== undefined && {system: ask.system}),
      messages: [{role: 'user', content: userContent(ask.user, ask.images)}],
      ...(takesEffort(this.id) && {output_config: {effort: 'low' as const}}),
    }, ask.signal && {signal: ask.signal});
    return {text: textOf(response), stop: stopOf(response), usage: usageOf(response)};
  }
}
