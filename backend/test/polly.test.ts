import type {SynthesizeSpeechCommand} from '@aws-sdk/client-polly';
import {describe, expect, it} from 'vitest';
import {VOICES} from '../src/domain/types';
import {parseWav, samplesOf} from '../src/speech/audio';
import {SAMPLE_RATE} from '../src/speech/gemini-tts';
import {CHARACTER_VOICES, NARRATOR_VOICES, NoVoiceError, POLLY_MODEL, POLLY_RATE, pollyVoices, resample} from '../src/speech/polly';

/** A Polly client that answers every line with `seconds` of a 16 kHz tone, and keeps what it was asked. */
function fakePolly(seconds = 1) {
  const asked: SynthesizeSpeechCommand['input'][] = [];
  const pcm = Buffer.alloc(seconds * POLLY_RATE * 2);
  for (let i = 0; i < seconds * POLLY_RATE; i++) pcm.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / POLLY_RATE)), i * 2);
  const client = {
    send: async (command: SynthesizeSpeechCommand) => {
      asked.push(command.input);
      return {AudioStream: {transformToByteArray: async () => new Uint8Array(pcm)}};
    },
  };
  return {asked, client: client as never};
}

describe('Amazon Polly voices (AWS)', () => {
  it("reads a character's line in the Polly voice for its Gemini voice, as 16 kHz PCM, and returns a 24 kHz WAV with the mouth", async () => {
    const polly = fakePolly(1);
    const made = await pollyVoices({client: polly.client}).synthesize({text: "Hi Lisa! I'm Pancake Dragon!", voice: 'Puck', lang: 'en', style: 'ignored'});
    expect(polly.asked).toEqual([{
      Engine: 'neural', VoiceId: 'Justin', LanguageCode: 'en-US', OutputFormat: 'pcm', SampleRate: '16000', TextType: 'text', Text: "Hi Lisa! I'm Pancake Dragon!",
    }]);
    const wav = parseWav(made.audio);
    expect([wav.sampleRate, wav.channels, wav.bits]).toEqual([SAMPLE_RATE, 1, 16]);
    expect(made.durationMs).toBe(1000);
    expect(made.mouth.stepMs).toBeGreaterThan(0);
    expect(pollyVoices().model).toBe(POLLY_MODEL);
  });

  it('gives the narrator one warm voice per language, finished like the recorded clips (a pause at the end)', async () => {
    const polly = fakePolly(1);
    const made = await pollyVoices({narrator: true, client: polly.client}).synthesize({text: 'Mia: Feed the cat', voice: 'Leda', lang: 'de', style: 'ignored'});
    expect(polly.asked[0]).toMatchObject({Engine: 'generative', VoiceId: NARRATOR_VOICES.de.id, LanguageCode: 'de-DE'});
    expect(made.durationMs).toBeGreaterThan(1000);
  });

  it('has a voice for every Gemini voice in English, German and Spanish, and none for Estonian: a NoVoiceError, Polly not asked', async () => {
    for (const lang of ['en', 'de', 'es'] as const) for (const voice of VOICES) expect(CHARACTER_VOICES[lang][voice]?.id).toBeTruthy();
    const polly = fakePolly();
    await expect(pollyVoices({client: polly.client}).synthesize({text: 'Tubli!', voice: 'Puck', lang: 'et', style: ''})).rejects.toThrow(NoVoiceError);
    expect(polly.asked).toEqual([]);
  });

  it('turns 16 kHz samples into 24 kHz ones by straight lines between neighbours', () => {
    const ramp = Int16Array.from([0, 300, 600, 900]);
    expect([...resample(ramp, 16_000, 24_000)]).toEqual([0, 200, 400, 600, 800, 900]);
    expect(resample(ramp, 24_000, 24_000)).toBe(ramp);
    expect(samplesOf(Buffer.from([0x10, 0x00, 0xf0, 0xff]))).toEqual(Int16Array.from([16, -16]));
  });
});
