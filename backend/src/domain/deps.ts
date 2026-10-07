import type {AiModel} from '../ai/model';
import type {IconPicker} from '../icons';
import type {DrawingJob} from './drawing';
import type {PushSender} from './push';
import type {SendRealtime} from './realtime';
import type {Repo} from './repo';
import type {SpeechServices} from './speech';

/** What the domain needs from outside; tests pass a memory repo, a clock they control and stand-in models. */
export interface Deps {
  repo: Repo;
  now: () => number;
  /** The parent app's address; a TV's pairing QR code links to `${pwaUrl}/pair/<code>`. */
  pwaUrl: string;
  pickIcon: IconPicker;
  /** The art director's model: the only model a request waits for (a few seconds, in POST /children/{id}/characters). */
  director: AiModel;
  /**
   * Starts drawing a new character without waiting for it (Lambda: an async invoke of the character worker; dev
   * server: in process). The worker tells the family when the character is ready or needs help.
   */
  startDrawing: (job: DrawingJob) => Promise<void>;
  /** Polly for the TV's lines (with their cache) and Transcribe for the parent's phone. */
  speech: SpeechServices;
  /** Sends to one open realtime connection (Lambda: API Gateway's management API; dev server: its own WebSocket server). */
  sendRealtime: SendRealtime;
  /** The realtime address the TV connects to (DeviceState.realtimeUrl); none where there is no realtime. */
  realtimeUrl?: string;
  /** Web Push to parents' browsers. */
  push: PushSender;
  /**
   * Notes that this request changed what a family sees. The router tells the family's open connections once the
   * request is done: at most one message per connection, and never for writes that didn't happen.
   */
  changed: (familyId: string) => void;
}
