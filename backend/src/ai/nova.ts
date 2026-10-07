/**
 * Amazon Nova on Bedrock, through the Bedrock Runtime Converse API with a cross-region inference profile such as
 * us.amazon.nova-pro-v1:0. Bedrock has no structured outputs for Nova (the Nova model cards, Oct 2026), so a JSON
 * answer is a forced call of a tool named after it (toolChoice "tool") whose input schema is the asked-for schema.
 * Pictures go in as Converse image blocks. Not the default and untested live (Bedrock is blocked on our account).
 */
import {
  BedrockRuntimeClient, type ContentBlock, ConverseCommand, type ConverseCommandInput, type ConverseCommandOutput, type ToolInputSchema,
} from '@aws-sdk/client-bedrock-runtime';
import {type AiModel, type JsonAsk, type JsonReply, noAudio, type Stop, type TextAsk, type TextReply, type Usage, withTimeout} from './model';

export type Send = (input: ConverseCommandInput, signal?: AbortSignal) => Promise<ConverseCommandOutput>;

/** Nova takes only type, properties and required at the top level of a tool schema; deeper down it is unchanged. */
export function novaSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const {additionalProperties: _closed, ...top} = schema;
  return top;
}

const content = (text: string, images: Buffer[] = []): ContentBlock[] => [
  ...images.map(png => ({image: {format: 'png' as const, source: {bytes: new Uint8Array(png)}}})),
  {text},
];

const usageOf = (response: ConverseCommandOutput): Usage => ({inputTokens: response.usage?.inputTokens ?? 0, outputTokens: response.usage?.outputTokens ?? 0});

function stopOf(reason: ConverseCommandOutput['stopReason']): Stop {
  switch (reason) {
    case 'end_turn':
    case 'tool_use':
    case 'stop_sequence':
      return 'done';
    case 'max_tokens':
      return 'cut_off';
    case 'content_filtered':
    case 'guardrail_intervened':
      return 'blocked';
    default:
      return 'malformed';
  }
}

export class NovaModel implements AiModel {
  private readonly send: Send;

  /** `send` is for tests; by default it sends a ConverseCommand with the Bedrock Runtime client, giving up after `timeoutMs`. */
  constructor(readonly id: string, send?: Send, timeoutMs = 120_000) {
    if (send) {
      this.send = send;
    } else {
      const client = new BedrockRuntimeClient({region: process.env.AWS_REGION ?? 'us-east-1'});
      this.send = (input, signal) => client.send(new ConverseCommand(input), {abortSignal: withTimeout(timeoutMs, signal)});
    }
  }

  async json(ask: JsonAsk): Promise<JsonReply> {
    noAudio(this.id, ask);
    const response = await this.send({
      modelId: this.id,
      system: [{text: ask.system}],
      messages: [{role: 'user', content: content(ask.user, ask.images)}],
      toolConfig: {
        tools: [{toolSpec: {name: ask.name, description: 'Hand in your answer.', inputSchema: {json: novaSchema(ask.schema) as ToolInputSchema.JsonMember['json']}}}],
        toolChoice: {tool: {name: ask.name}},
      },
      // AWS recommends greedy decoding for Nova tool calls.
      inferenceConfig: {maxTokens: ask.maxTokens ?? 4096, temperature: 0},
    }, ask.signal);
    const usage = usageOf(response);
    const call = response.stopReason === 'tool_use'
      ? response.output?.message?.content?.find(block => block.toolUse?.name === ask.name)?.toolUse
      : undefined;
    if (call) return {value: call.input, stop: 'done', usage};
    const stop = stopOf(response.stopReason);
    return {stop: stop === 'done' ? 'malformed' : stop, usage};
  }

  async text(ask: TextAsk): Promise<TextReply> {
    noAudio(this.id, ask);
    const response = await this.send({
      modelId: this.id,
      ...(ask.system !== undefined && {system: [{text: ask.system}]}),
      messages: [{role: 'user', content: content(ask.user, ask.images)}],
      inferenceConfig: {maxTokens: ask.maxTokens ?? 10000},
    }, ask.signal);
    const text = (response.output?.message?.content ?? []).map(block => block.text ?? '').join('');
    return {text, stop: stopOf(response.stopReason), usage: usageOf(response)};
  }
}
