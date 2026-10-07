/**
 * The TV's spoken lines, kept in a private S3 bucket (objects expire after 30 days) and handed out as CloudFront
 * signed URLs valid for 48 hours.
 *
 * Why CloudFront and not an S3 presigned URL: a presigned URL stops working when the credentials that signed it
 * expire, and a Lambda's role credentials last hours, not the day the contract promises. A CloudFront signed URL
 * is checked against a key pair instead (its private key is in SSM Parameter Store, made once by
 * src/speech-keys-lambda.ts); the bucket stays private, readable only through the distribution (origin access control).
 *
 *   speech/v2/<key>.wav    the audio (24 kHz mono 16-bit, normalised)
 *   speech/v2/<key>.json   {durationMs, mouth}
 *
 * The key is domain/speech.ts's lineKey: sha256(model|voice|style|lang|text), "narrator|" first for the narrator's.
 *
 * A line older than 27 days is copied onto itself (its age starts again), so a URL handed out never outlives its file.
 */
import {CopyObjectCommand, GetObjectCommand, PutObjectCommand, S3Client} from '@aws-sdk/client-s3';
import {GetParameterCommand, SSMClient} from '@aws-sdk/client-ssm';
import {getSignedUrl} from '@aws-sdk/cloudfront-signer';
import type {LineAudio, Mouth, SpeechCache, SpokenLine} from '../domain/speech';
import {DAY, HOUR} from '../domain/time';

const PREFIX = 'speech/v2';
export const URL_LIFETIME = 48 * HOUR;
const REFRESH_AFTER = 27 * DAY;

export interface S3CacheConfig {
  bucket: string;
  /** The distribution's https address, e.g. https://d123.cloudfront.net */
  cdnUrl: string;
  /** The CloudFront public key's id. */
  keyPairId: string;
  /** Reads the private key (PEM). */
  privateKey: () => Promise<string>;
  now?: () => number;
}

/** The signing key from SSM, read once per container (a failed read is tried again next time). */
export function keyFromSsm(name: string): () => Promise<string> {
  const ssm = new SSMClient({});
  let key: Promise<string> | undefined;
  return () => {
    key ??= ssm.send(new GetParameterCommand({Name: name, WithDecryption: true})).then(({Parameter}) => {
      if (!Parameter?.Value) throw new Error(`SSM parameter ${name} is empty`);
      return Parameter.Value;
    }).catch(error => {
      key = undefined;
      throw error;
    });
    return key;
  };
}

const isMissing = (error: unknown) => error instanceof Error && (error.name === 'NoSuchKey' || error.name === 'NotFound');

export function s3SpeechCache(config: S3CacheConfig, s3 = new S3Client({})): SpeechCache {
  const now = config.now ?? Date.now;
  const sign = async (key: string): Promise<string> => getSignedUrl({
    url: `${config.cdnUrl}/${PREFIX}/${key}.wav`,
    keyPairId: config.keyPairId,
    privateKey: await config.privateKey(),
    dateLessThan: new Date(now() + URL_LIFETIME).toISOString(),
  });
  const refresh = (key: string, ext: string, contentType: string) => s3.send(new CopyObjectCommand({
    Bucket: config.bucket, Key: `${PREFIX}/${key}.${ext}`, CopySource: `${config.bucket}/${PREFIX}/${key}.${ext}`, MetadataDirective: 'REPLACE', ContentType: contentType,
  }));
  return {
    async get(key) {
      let marks: {durationMs: number; mouth: Mouth};
      let modified: number;
      try {
        const object = await s3.send(new GetObjectCommand({Bucket: config.bucket, Key: `${PREFIX}/${key}.json`}));
        marks = JSON.parse(await object.Body!.transformToString()) as typeof marks;
        modified = object.LastModified?.getTime() ?? now();
      } catch (error) {
        if (isMissing(error)) return undefined;
        throw error;
      }
      if (now() - modified > REFRESH_AFTER) {
        await refresh(key, 'wav', 'audio/wav');
        await refresh(key, 'json', 'application/json');
      }
      return {audioUrl: await sign(key), durationMs: marks.durationMs, mouth: marks.mouth};
    },
    async put(key, line: LineAudio): Promise<SpokenLine> {
      // The audio first: a line is only found (by its .json) once both are there.
      await s3.send(new PutObjectCommand({Bucket: config.bucket, Key: `${PREFIX}/${key}.wav`, Body: line.audio, ContentType: 'audio/wav'}));
      await s3.send(new PutObjectCommand({
        Bucket: config.bucket, Key: `${PREFIX}/${key}.json`, Body: JSON.stringify({durationMs: line.durationMs, mouth: line.mouth}), ContentType: 'application/json',
      }));
      return {audioUrl: await sign(key), durationMs: line.durationMs, mouth: line.mouth};
    },
  };
}
