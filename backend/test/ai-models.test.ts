import type Anthropic from '@anthropic-ai/sdk';
import type {ConverseCommandInput, ConverseCommandOutput} from '@aws-sdk/client-bedrock-runtime';
import {describe, expect, it} from 'vitest';
import {ClaudeModel, decodesStrictly} from '../src/ai/claude';
import {FakeModel, templateSvg} from '../src/ai/fake';
import {GeminiModel, type GeminiResponse, geminiUrl, gcloudSend, VertexError} from '../src/ai/gemini';
import {parseJson} from '../src/ai/model';
import {aiModel, bedrockModel, DEFAULT_MODEL_ID, isFake, isGemini, isNova} from '../src/ai/models';
import {NovaModel, novaSchema} from '../src/ai/nova';
import {CHECK_SCHEMA, DIRECTOR_SCHEMA} from '../src/domain/character-prompts';
import {checkSvg} from '../src/svg/check';

const PNG = Buffer.from('\x89PNG fake picture', 'latin1');
const ASK = {system: 'You check pictures.', user: 'Is it friendly?', schema: CHECK_SCHEMA, name: 'picture_check', images: [PNG], maxTokens: 1024};
const DRAW = {user: 'Draw a dragon as an SVG.', maxTokens: 16000};

describe('Claude on Bedrock (Anthropic SDK)', () => {
  const message = (fields: Partial<Anthropic.Message>) =>
    ({id: 'msg_1', type: 'message', role: 'assistant', model: 'claude', stop_sequence: null, usage: {input_tokens: 1500, output_tokens: 90}, ...fields}) as Anthropic.Message;
  const text = (value: string, stop_reason: Anthropic.StopReason = 'end_turn') => message({stop_reason, content: [{type: 'text', text: value, citations: null}] as Anthropic.ContentBlock[]});

  it('answers JSON with strict structured output on Haiku 4.5 (the default), pictures first', async () => {
    const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const model = new ClaudeModel(DEFAULT_MODEL_ID, async params => {
      sent.push(params);
      return text('{"ok": true, "reason": ""}');
    });
    expect(await model.json(ASK)).toEqual({value: {ok: true, reason: ''}, stop: 'done', usage: {inputTokens: 1500, outputTokens: 90}});
    expect(sent[0]).toEqual({
      model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', max_tokens: 1024, system: 'You check pictures.',
      messages: [{role: 'user', content: [
        {type: 'image', source: {type: 'base64', media_type: 'image/png', data: PNG.toString('base64')}},
        {type: 'text', text: 'Is it friendly?'},
      ]}],
      // No tool and no effort setting (Haiku 4.5 takes none): the format is the whole contract.
      output_config: {format: {type: 'json_schema', schema: CHECK_SCHEMA}},
    });
    expect([decodesStrictly(DEFAULT_MODEL_ID), decodesStrictly('us.anthropic.claude-sonnet-5-5')]).toEqual([true, false]);
  });

  it('says why there is no usable JSON: cut off, refused, or not JSON', async () => {
    const answers = [text('{"ok": tr', 'max_tokens'), message({stop_reason: 'refusal', content: []}), text('Sure, it looks fine!')];
    const stops = [];
    for (const answer of answers) stops.push((await new ClaudeModel(DEFAULT_MODEL_ID, async () => answer).json(ASK)).stop);
    expect(stops).toEqual(['cut_off', 'refused', 'malformed']);
  });

  it('hands JSON in through a tool on Claude 5.x (no structured outputs there), with low effort', async () => {
    const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const model = new ClaudeModel('us.anthropic.claude-sonnet-5-5', async params => {
      sent.push(params);
      return message({stop_reason: 'tool_use', content: [{type: 'tool_use', id: 't1', name: 'character_card', input: {answer: {result: 'not_ok', sentence: 'No.'}}}] as Anthropic.ContentBlock[]});
    });
    const reply = await model.json({system: 'S', user: 'U', schema: DIRECTOR_SCHEMA, name: 'character_card'});
    expect(reply).toMatchObject({value: {answer: {result: 'not_ok', sentence: 'No.'}}, stop: 'done'});
    expect(sent[0]).toEqual({
      model: 'us.anthropic.claude-sonnet-5-5', max_tokens: 4096, system: 'S',
      messages: [{role: 'user', content: 'U\nUse the character_card tool for your answer.'}],
      tools: [{name: 'character_card', description: 'Hand in your answer.', input_schema: DIRECTOR_SCHEMA}], tool_choice: {type: 'auto'},
      output_config: {effort: 'low'},
    });
    const textOnly = new ClaudeModel('us.anthropic.claude-opus-5-5', async () => text('Here is my answer: …'));
    expect((await textOnly.json(ASK)).stop).toBe('malformed');
  });

  it('draws as plain text, and says when the drawing was cut off', async () => {
    const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const model = new ClaudeModel(DEFAULT_MODEL_ID, async params => {
      sent.push(params);
      return text('<svg viewBox="0 0 512 512">', 'max_tokens');
    });
    expect(await model.text(DRAW)).toEqual({text: '<svg viewBox="0 0 512 512">', stop: 'cut_off', usage: {inputTokens: 1500, outputTokens: 90}});
    expect(sent[0]).toEqual({model: DEFAULT_MODEL_ID, max_tokens: 16000, messages: [{role: 'user', content: 'Draw a dragon as an SVG.'}]});
  });
});

describe('Gemini on Vertex AI (local only)', () => {
  const usageMetadata = {promptTokenCount: 1000, candidatesTokenCount: 600, thoughtsTokenCount: 150};
  const answer = (text: string, finishReason = 'STOP'): GeminiResponse => ({candidates: [{finishReason, content: {parts: [{text: 'thinking…', thought: true}, {text}]}}], usageMetadata});

  it('asks for JSON in exactly the schema, with the picture inline, and reads it (thinking billed as output)', async () => {
    const sent: {url: string; body: unknown}[] = [];
    const model = new GeminiModel('gemini-3.8-flash', async (url, body) => {
      sent.push({url, body});
      return answer('{"ok": false, "reason": "Too scary."}');
    }, 'my-project');
    expect(await model.json(ASK)).toEqual({value: {ok: false, reason: 'Too scary.'}, stop: 'done', usage: {inputTokens: 1000, outputTokens: 750}});
    expect(sent[0].url).toBe('https://aiplatform.googleapis.com/v1/projects/my-project/locations/global/publishers/google/models/gemini-3.8-flash:generateContent');
    expect(sent[0].body).toEqual({
      systemInstruction: {parts: [{text: 'You check pictures.'}]},
      contents: [{role: 'user', parts: [{inlineData: {mimeType: 'image/png', data: PNG.toString('base64')}}, {text: 'Is it friendly?'}]}],
      generationConfig: {responseMimeType: 'application/json', responseJsonSchema: CHECK_SCHEMA, maxOutputTokens: 1024, thinkingConfig: {thinkingLevel: 'low'}},
    });
    expect(geminiUrl('p', 'europe-west4', 'gemini-3.8-flash')).toBe('https://europe-west4-aiplatform.googleapis.com/v1/projects/p/locations/europe-west4/publishers/google/models/gemini-3.8-flash:generateContent');
  });

  it('draws as plain text with the measured settings (16000 tokens, low thinking, no system prompt)', async () => {
    const sent: unknown[] = [];
    const model = new GeminiModel('gemini-3.8-flash', async (_, body) => {
      sent.push(body);
      return answer('<svg/>');
    }, 'p');
    expect(await model.text(DRAW)).toEqual({text: '<svg/>', stop: 'done', usage: {inputTokens: 1000, outputTokens: 750}});
    expect(sent[0]).toEqual({contents: [{role: 'user', parts: [{text: 'Draw a dragon as an SVG.'}]}], generationConfig: {maxOutputTokens: 16000, thinkingConfig: {thinkingLevel: 'low'}}});
  });

  it('says why there is no usable answer: blocked, cut off, broken JSON', async () => {
    const answers: GeminiResponse[] = [{promptFeedback: {blockReason: 'SAFETY'}, usageMetadata}, answer('{}', 'SAFETY'), answer('{"ok": tr', 'MAX_TOKENS'), answer('{"ok": tr')];
    const stops = [];
    for (const reply of answers) stops.push((await new GeminiModel('gemini-3.8-flash', async () => reply, 'p').json(ASK)).stop);
    expect(stops).toEqual(['blocked', 'blocked', 'cut_off', 'malformed']);
  });

  it('tries again after a busy answer (429/503), then gives up; other errors at once', async () => {
    const statuses = [429, 503, 200];
    const waits: number[] = [];
    const seen: string[] = [];
    const post = (async (_url: string, init: RequestInit) => {
      seen.push((init.headers as Record<string, string>).Authorization);
      const status = statuses.shift()!;
      return new Response(status === 200 ? JSON.stringify(answer('ok')) : '{"error": "busy"}', {status});
    }) as unknown as typeof fetch;
    const send = gcloudSend({wait: async ms => void waits.push(ms), post, token: () => 'token-1'});
    expect(await send('https://vertex.test', {})).toEqual(answer('ok'));
    expect(waits).toEqual([1000, 2000]);
    expect(seen).toEqual(['Bearer token-1', 'Bearer token-1', 'Bearer token-1']);
    const busy = gcloudSend({wait: async () => {}, post: (async () => new Response('busy', {status: 429})) as unknown as typeof fetch, token: () => 't'});
    await expect(busy('https://vertex.test', {})).rejects.toThrow('Vertex AI 429: busy');
    const denied = gcloudSend({wait: async () => {}, post: (async () => new Response('denied', {status: 403})) as unknown as typeof fetch, token: () => 't'});
    await expect(denied('https://vertex.test', {})).rejects.toThrow(VertexError);
  });
});

describe('audio in (listening)', () => {
  const WAV = Buffer.from('RIFF....WAVEfmt fake recording', 'latin1');
  const LISTEN = {system: 'You transcribe.', user: 'Write down what is said.', schema: CHECK_SCHEMA, name: 'transcript', audio: [WAV]};

  it('Gemini hears a WAV inline (audio/wav), before the words', async () => {
    const sent: unknown[] = [];
    const model = new GeminiModel('gemini-3.8-flash', async (_, body) => {
      sent.push(body);
      return {candidates: [{finishReason: 'STOP', content: {parts: [{text: '{"ok": true, "reason": ""}'}]}}]};
    }, 'p');
    await model.json(LISTEN);
    expect((sent[0] as {contents: {parts: unknown[]}[]}).contents[0].parts).toEqual([
      {inlineData: {mimeType: 'audio/wav', data: WAV.toString('base64')}}, {text: 'Write down what is said.'},
    ]);
  });

  it('Claude and Nova can\'t hear: they refuse before calling anything', async () => {
    let calls = 0;
    const claude = new ClaudeModel(DEFAULT_MODEL_ID, async () => {
      calls++;
      throw new Error('never');
    });
    await expect(claude.json(LISTEN)).rejects.toThrow("doesn't take audio");
    const nova = new NovaModel('us.amazon.nova-pro-v1:0', async () => {
      calls++;
      throw new Error('never');
    });
    await expect(nova.json(LISTEN)).rejects.toThrow("doesn't take audio");
    expect(calls).toBe(0);
  });
});

describe('Amazon Nova on Bedrock (Converse API)', () => {
  const usage = {inputTokens: 1200, outputTokens: 80, totalTokens: 1280};
  it('makes Nova call a tool named after the answer (its schema without the top-level additionalProperties), with the picture', async () => {
    const sent: ConverseCommandInput[] = [];
    const model = new NovaModel('us.amazon.nova-pro-v1:0', async input => {
      sent.push(input);
      return {$metadata: {}, stopReason: 'tool_use', usage, metrics: {latencyMs: 1}, output: {message: {role: 'assistant', content: [{toolUse: {toolUseId: 't', name: 'picture_check', input: {ok: true, reason: ''}}}]}}} as ConverseCommandOutput;
    });
    expect(await model.json(ASK)).toEqual({value: {ok: true, reason: ''}, stop: 'done', usage: {inputTokens: 1200, outputTokens: 80}});
    expect(sent[0]).toMatchObject({
      modelId: 'us.amazon.nova-pro-v1:0', system: [{text: 'You check pictures.'}],
      toolConfig: {tools: [{toolSpec: {name: 'picture_check', inputSchema: {json: novaSchema(CHECK_SCHEMA)}}}], toolChoice: {tool: {name: 'picture_check'}}},
      inferenceConfig: {maxTokens: 1024, temperature: 0},
    });
    expect(sent[0].messages![0].content![0]).toEqual({image: {format: 'png', source: {bytes: new Uint8Array(PNG)}}});
    expect(Object.keys(novaSchema(CHECK_SCHEMA)).sort()).toEqual(['properties', 'required', 'type']);
    const filtered = new NovaModel('n', async () => ({$metadata: {}, stopReason: 'content_filtered', usage, metrics: {latencyMs: 1}, output: {message: {role: 'assistant', content: []}}}) as ConverseCommandOutput);
    expect((await filtered.json(ASK)).stop).toBe('blocked');
  });

  it('draws as plain text', async () => {
    const model = new NovaModel('n', async () => ({$metadata: {}, stopReason: 'end_turn', usage, metrics: {latencyMs: 1}, output: {message: {role: 'assistant', content: [{text: '<svg'}, {text: '/>'}]}}}) as ConverseCommandOutput);
    expect(await model.text(DRAW)).toEqual({text: '<svg/>', stop: 'done', usage: {inputTokens: 1200, outputTokens: 80}});
  });
});

describe('choosing the model', () => {
  it('picks the adapter by MODEL_ID, defaults to Haiku 4.5 in AWS, and refuses to deploy a local model', () => {
    expect(DEFAULT_MODEL_ID).toBe('us.anthropic.claude-haiku-4-5-20251001-v1:0');
    expect(aiModel(DEFAULT_MODEL_ID)).toBeInstanceOf(ClaudeModel);
    expect(aiModel('us.amazon.nova-pro-v1:0')).toBeInstanceOf(NovaModel);
    expect(aiModel('gemini-3.8-flash')).toBeInstanceOf(GeminiModel); // asks gcloud nothing until the first call
    expect(aiModel('fake')).toBeInstanceOf(FakeModel);
    expect([isGemini('gemini-3.8-flash'), isNova('amazon.nova-lite-v1:0'), isFake('fake'), isNova(DEFAULT_MODEL_ID)]).toEqual([true, true, true, false]);
    expect(bedrockModel(DEFAULT_MODEL_ID)).toBe(DEFAULT_MODEL_ID);
    expect(() => bedrockModel('gemini-3.8-flash')).toThrow(/local tests only/);
    expect(() => bedrockModel('fake')).toThrow(/local tests only/);
  });

  it('reads JSON from a model\'s text, with or without a fence', () => {
    expect(parseJson('{"a": 1}')).toEqual({a: 1});
    expect(parseJson('```json\n{"a": 1}\n```')).toEqual({a: 1});
    expect(parseJson('{"a": ')).toBeUndefined();
  });

  it('has a free stand-in whose drawing passes every check, and that says no to a few words', async () => {
    expect(checkSvg(templateSvg(['purple', 'not-a-colour', '#123456']))).toEqual([]);
    const fake = new FakeModel();
    const yes = await fake.json({system: '', user: 'The child\'s words: "a purple owl who loves books"', schema: DIRECTOR_SCHEMA, name: 'character_card'});
    expect(yes.value).toMatchObject({answer: {result: 'character', name: 'Owl Buddy', card: {what: 'a friendly owl', colours: ['purple']}}});
    const no = await fake.json({system: '', user: 'The child\'s words: "a monster with a gun"', schema: DIRECTOR_SCHEMA, name: 'character_card'});
    expect(no.value).toMatchObject({answer: {result: 'not_ok'}});
  });
});
