/**
 * The dev server's cache of spoken lines: a folder on this machine, served by the dev server itself at
 * <baseUrl>/<key>.wav (no S3 or CloudFront locally). Lines stay until the folder is emptied.
 */
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {Mouth, SpeechCache} from '../domain/speech';

export const KEY = /^[0-9a-f]{64}$/;

export function folderSpeechCache(folder: string, baseUrl: string): SpeechCache {
  return {
    async get(key) {
      try {
        const marks = JSON.parse(await readFile(join(folder, `${key}.json`), 'utf8')) as {durationMs: number; mouth?: Mouth};
        if (!marks.mouth) return undefined; // a Polly line from before: make it again
        return {audioUrl: `${baseUrl}/${key}.wav`, durationMs: marks.durationMs, mouth: marks.mouth};
      } catch {
        return undefined;
      }
    },
    async put(key, line) {
      await mkdir(folder, {recursive: true});
      await writeFile(join(folder, `${key}.wav`), line.audio);
      await writeFile(join(folder, `${key}.json`), JSON.stringify({durationMs: line.durationMs, mouth: line.mouth}));
      return {audioUrl: `${baseUrl}/${key}.wav`, durationMs: line.durationMs, mouth: line.mouth};
    },
  };
}

/** A cached line's audio for the dev server to send; undefined for anything else. */
export async function cachedAudio(folder: string, key: string): Promise<Buffer | undefined> {
  if (!KEY.test(key)) return undefined;
  try {
    return await readFile(join(folder, `${key}.wav`));
  } catch {
    return undefined;
  }
}
